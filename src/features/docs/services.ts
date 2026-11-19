/**
 * docme data services (v2 model) — every read and write goes through
 * `gql()`, which uses the SDK's `data.graphql`.
 *
 * Multi-step operations are written so that running them again after a
 * failure finishes the job instead of duplicating it (see each function).
 * Blocks Data has no multi-document transactions.
 */
import { gql, type ActionResponse, type GqlResult, GraphQLError } from "@/features/data/gateway";
import { DocmeDataError } from "@/features/data/errors";
import {
  CURRENT_SCHEMA_VERSION,
  isVersionEditable,
  type Doc,
  type DocUpdate,
  type DocVersion,
  type Page,
  type PageSummary,
  type PageUpdate,
} from "./types";
import { chunkBySize, nextSortOrder, planReorder, sortPages } from "./ordering";
import {
  MESSAGES,
  assertValid,
  validateDocInput,
  validatePageInput,
  validateVersionLabel,
} from "./validation";

// ==========================================
// Generic gateway helpers
// ==========================================

export type SchemaName = "Doc" | "DocVersion" | "Page" | "DocSource" | "Comment";

/** `get${querySchema}` — read from `blocks data schema get`, not pluralized by hand. */
const QUERY_FIELD: Record<SchemaName, string> = {
  Doc: "getDocs",
  DocVersion: "getDocVersions",
  Page: "getPages",
  DocSource: "getDocSources",
  Comment: "getComments",
};

export const FIELDS = {
  doc: "ItemId Name Description CurrentVersion Status CreatedDate LastUpdatedDate",
  version:
    "ItemId DocId Version Pages IsPublished IsActive Status SourceVersionId SchemaVersion CreatedDate LastUpdatedDate",
  pageSummary: "ItemId Title SortOrder CreatedDate",
  pageFull:
    "ItemId DocId VersionId Title ContentType Content SortOrder SourcePageId ReaderVisible CreatedDate LastUpdatedDate",
} as const;

export type Where = Record<string, unknown>;
export type Order = Array<{ field: string; direction: "ASC" | "DESC" }>;

export interface ListOptions {
  where?: Where;
  order?: Order;
  paging?: { pageNo: number; pageSize: number };
}

export type ListResult<T> = GqlResult<T>;

export async function listRecords<T>(
  schema: SchemaName,
  fields: string,
  opts: ListOptions = {},
): Promise<ListResult<T>> {
  const field = QUERY_FIELD[schema];
  const res = await gql<Record<string, ListResult<T>>>(
    `query($where: ${schema}FilterInput, $order: [DynamicSortInput!], $paging: PaginationInput) {
      ${field}(where: $where, order: $order, paging: $paging) {
        totalCount pageNo pageSize totalPages hasNextPage hasPreviousPage
        items { ${fields} }
      }
    }`,
    {
      where: opts.where ?? {},
      order: opts.order ?? [],
      paging: opts.paging ?? { pageNo: 1, pageSize: 100 },
    },
  );
  const result = res[field];
  return { ...result, items: result?.items ?? [] };
}

/** Every record matching `where`, read `pageSize` at a time. */
export async function listAllRecords<T>(
  schema: SchemaName,
  fields: string,
  opts: { where?: Where; order?: Order; pageSize?: number } = {},
): Promise<T[]> {
  const pageSize = opts.pageSize ?? 200;
  const all: T[] = [];
  for (let pageNo = 1; ; pageNo++) {
    const page = await listRecords<T>(schema, fields, {
      where: opts.where,
      order: opts.order ?? [{ field: "CreatedDate", direction: "ASC" }],
      paging: { pageNo, pageSize },
    });
    all.push(...page.items);
    if (!page.hasNextPage || page.items.length === 0) break;
  }
  return all;
}

function checkAck(op: string, res: ActionResponse | undefined): ActionResponse {
  if (!res || res.acknowledged === false) {
    throw new GraphQLError([{ message: res?.message || `${op} was not acknowledged` }]);
  }
  return res;
}

export async function insertRecord(schema: SchemaName, input: Record<string, unknown>): Promise<string> {
  const op = `insert${schema}`;
  const res = await gql<Record<string, ActionResponse>>(
    `mutation($input: ${schema}InsertInput!) {
      ${op}(input: $input) { acknowledged itemId totalImpactedData message }
    }`,
    { input },
  );
  const ack = checkAck(op, res[op]);
  if (!ack.itemId) throw new GraphQLError([{ message: `${op} returned no itemId` }]);
  return ack.itemId;
}

/**
 * Insert several records in ONE request, as aliased `insert<Schema>` fields
 * (`i0`, `i1`, …). Uses only the generated single-insert mutation, so it
 * works on any schema; the caller keeps each request within the size limits.
 */
export async function insertRecordsBatch(
  schema: SchemaName,
  inputs: Array<Record<string, unknown>>,
): Promise<string[]> {
  if (inputs.length === 0) return [];
  const op = `insert${schema}`;
  const params = inputs.map((_, i) => `$input${i}: ${schema}InsertInput!`).join(", ");
  const fields = inputs
    .map((_, i) => `i${i}: ${op}(input: $input${i}) { acknowledged itemId totalImpactedData message }`)
    .join("\n");
  const variables: Record<string, unknown> = {};
  inputs.forEach((input, i) => {
    variables[`input${i}`] = input;
  });
  const res = await gql<Record<string, ActionResponse>>(`mutation(${params}) {\n${fields}\n}`, variables);
  return inputs.map((_, i) => {
    const ack = checkAck(op, res[`i${i}`]);
    if (!ack.itemId) throw new GraphQLError([{ message: `${op} returned no itemId` }]);
    return ack.itemId;
  });
}

/** Update every record matching `where`. */
export async function updateRecords(
  schema: SchemaName,
  where: Where,
  input: Record<string, unknown>,
): Promise<ActionResponse> {
  const op = `update${schema}`;
  const res = await gql<Record<string, ActionResponse>>(
    `mutation($where: ${schema}FilterInput, $input: ${schema}UpdateInput!) {
      ${op}(where: $where, input: $input) { acknowledged totalImpactedData message }
    }`,
    { where, input },
  );
  return checkAck(op, res[op]);
}

/** Upper bound on delete calls for one filter, so a misbehaving gateway can't loop forever. */
export const MAX_DELETE_CALLS = 5000;

/**
 * Soft-delete every record matching `where`. Returns how many were deleted.
 *
 * Two gateway behaviours, seen on the live gateway 2026-11-18:
 *  - A filter delete removes only ONE matching record per call, so this
 *    repeats the call until nothing matches.
 *  - When nothing matches, the gateway answers `acknowledged: false`,
 *    `totalImpactedData: 0`, "No data found to DELETE or you don't have
 *    permission to DELETE this record." That means "done", which is what
 *    makes cascade deletes resumable, so it is not an error. (The gateway
 *    gives the same answer when the caller lacks DELETE access; the server
 *    still refuses the delete in that case.)
 */
export async function deleteRecords(schema: SchemaName, where: Where): Promise<number> {
  const op = `delete${schema}`;
  let deleted = 0;
  for (let call = 0; call < MAX_DELETE_CALLS; call++) {
    const res = await gql<Record<string, ActionResponse>>(
      `mutation($where: ${schema}FilterInput) {
        ${op}(where: $where) { acknowledged totalImpactedData message }
      }`,
      { where },
    );
    const r = res[op];
    if (r && r.acknowledged === false && !r.totalImpactedData) return deleted;
    const n = checkAck(op, r).totalImpactedData ?? 0;
    if (n <= 0) return deleted;
    deleted += n;
  }
  throw new GraphQLError([{ message: `${op}: still deleting after ${MAX_DELETE_CALLS} calls` }]);
}

const byId = (itemId: string): Where => ({ ItemId: { eq: itemId } });

/**
 * Update every record matching `where`, repeating until nothing matches.
 * `where` must stop matching a record once it is updated (for example by
 * including the new value as `neq`), so the loop ends. A call that matches
 * nothing answers `acknowledged: false`, which means "done" here.
 * Returns how many records changed.
 */
export async function updateAllMatching(
  schema: SchemaName,
  where: Where,
  input: Record<string, unknown>,
): Promise<number> {
  const op = `update${schema}`;
  let changed = 0;
  for (let call = 0; call < MAX_DELETE_CALLS; call++) {
    const res = await gql<Record<string, ActionResponse>>(
      `mutation($where: ${schema}FilterInput, $input: ${schema}UpdateInput!) {
        ${op}(where: $where, input: $input) { acknowledged totalImpactedData message }
      }`,
      { where, input },
    );
    const r = res[op];
    if (r && r.acknowledged === false && !r.totalImpactedData) return changed;
    const n = checkAck(op, r).totalImpactedData ?? 0;
    if (n <= 0) return changed;
    changed += n;
  }
  throw new GraphQLError([{ message: `${op}: still updating after ${MAX_DELETE_CALLS} calls` }]);
}

// ==========================================
// Reader visibility (SPEC2 §6.2)
// ==========================================

/** A version viewers may read: published or active. */
export function isReaderVisible(v: Pick<DocVersion, "IsPublished" | "IsActive">): boolean {
  return v.IsPublished === true || v.IsActive === true;
}

/**
 * Set `ReaderVisible` on every page of the version, then on every comment
 * of the version (SPEC3 §6.2). Pages and comments move together, so the
 * ordering in `setVersionFlags` covers both. Returns records changed.
 */
export async function setPagesReaderVisible(versionId: string, visible: boolean): Promise<number> {
  const where = { VersionId: { eq: versionId }, ReaderVisible: { neq: visible } };
  const pages = await updateAllMatching("Page", where, { ReaderVisible: visible });
  const comments = await updateAllMatching("Comment", where, { ReaderVisible: visible });
  return pages + comments;
}

/**
 * Change a version's IsPublished/IsActive flags and keep its pages'
 * ReaderVisible in step, in the order that never exposes a hidden
 * version's pages: becoming visible → flags first, then pages; becoming
 * hidden → pages first, then flags. Running it again finishes the job.
 */
export async function setVersionFlags(
  version: Pick<DocVersion, "ItemId" | "IsPublished" | "IsActive">,
  flags: Partial<Pick<DocVersion, "IsPublished" | "IsActive">>,
): Promise<void> {
  const before = isReaderVisible(version);
  const after = isReaderVisible({ ...version, ...flags });
  if (before && !after) await setPagesReaderVisible(version.ItemId, false);
  await updateRecords("DocVersion", byId(version.ItemId), flags);
  if (after) await setPagesReaderVisible(version.ItemId, true);
}

/**
 * Viewers open the newest published version, else the newest active one,
 * else none (SPEC2 BR3). `versions` in any order.
 */
export function viewerDefaultVersion<V extends Pick<DocVersion, "IsPublished" | "IsActive" | "CreatedDate">>(
  versions: readonly V[],
): V | null {
  const newestFirst = [...versions].sort(
    (a, b) => (b.CreatedDate ? Date.parse(b.CreatedDate) : 0) - (a.CreatedDate ? Date.parse(a.CreatedDate) : 0),
  );
  return newestFirst.find((v) => v.IsPublished === true) ?? newestFirst.find((v) => v.IsActive === true) ?? null;
}

export interface ReconcileReport {
  versions: number;
  /** Pages and comments whose ReaderVisible changed (SPEC3 C12). */
  pagesChanged: number;
}

/**
 * "Reconcile reader visibility": recompute ReaderVisible for every version
 * in `organizationId` (C11), for pages and comments alike (SPEC3 C12).
 * A second run reports 0 changed.
 */
export async function reconcileReaderVisibility(organizationId: string): Promise<ReconcileReport> {
  const versions = await listAllRecords<Pick<DocVersion, "ItemId" | "IsPublished" | "IsActive">>(
    "DocVersion",
    "ItemId IsPublished IsActive",
    { where: { OrganizationId: { eq: organizationId } }, pageSize: 200 },
  );
  let pagesChanged = 0;
  for (const v of versions) {
    pagesChanged += await setPagesReaderVisible(v.ItemId, isReaderVisible(v));
  }
  return { versions: versions.length, pagesChanged };
}

/** Run `task` over `items`, at most `limit` at a time. Never rejects. */
async function runLimited<T>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<unknown>,
): Promise<Array<{ item: T; error?: unknown }>> {
  const results: Array<{ item: T; error?: unknown }> = [];
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const item = items[next++];
      try {
        await task(item);
        results.push({ item });
      } catch (error) {
        results.push({ item, error });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// ==========================================
// Docs
// ==========================================

export interface ListDocsOptions {
  paging?: { pageNo: number; pageSize: number };
  order?: Order;
}

export function listDocs(opts: ListDocsOptions = {}): Promise<ListResult<Doc>> {
  return listRecords<Doc>("Doc", FIELDS.doc, {
    paging: opts.paging ?? { pageNo: 1, pageSize: 50 },
    order: opts.order ?? [{ field: "CreatedDate", direction: "DESC" }],
  });
}

export async function getDoc(docId: string): Promise<Doc | null> {
  const res = await listRecords<Doc>("Doc", FIELDS.doc, {
    where: byId(docId),
    paging: { pageNo: 1, pageSize: 1 },
  });
  return res.items[0] ?? null;
}

export async function updateDoc(docId: string, updates: DocUpdate): Promise<void> {
  assertValid(validateDocInput({ name: updates.Name, description: updates.Description }));
  const input: DocUpdate = { ...updates };
  if (input.Name !== undefined) input.Name = input.Name.trim();
  await updateRecords("Doc", byId(docId), input);
}

async function insertFirstVersion(docId: string): Promise<string> {
  const versionId = await insertRecord("DocVersion", {
    DocId: docId,
    Version: "0.0.1",
    Status: "Ready",
    SchemaVersion: CURRENT_SCHEMA_VERSION,
    IsPublished: false,
    IsActive: false,
  });
  await updateRecords("Doc", byId(docId), { CurrentVersion: versionId });
  return versionId;
}

/**
 * 1. insert Doc{Status:"Active"} 2. insert DocVersion "0.0.1" 3. set CurrentVersion.
 * If step 2 or 3 fails the doc exists without a version; `ensureFirstVersion`
 * repairs it (the detail page offers "Create first version").
 */
export async function createDoc(input: {
  name: string;
  description?: string | null;
}): Promise<{ docId: string; versionId: string }> {
  assertValid(validateDocInput(input));
  const docId = await insertRecord("Doc", {
    Name: input.name.trim(),
    Description: input.description?.trim() || null,
    Status: "Active",
  });
  const versionId = await insertFirstVersion(docId);
  return { docId, versionId };
}

/**
 * Give a doc a current version, reusing the oldest existing version if there
 * is one — so a doc never ends up with two "0.0.1" versions. Idempotent.
 */
export async function ensureFirstVersion(docId: string): Promise<string> {
  const versions = await listVersions(docId);
  const oldest = versions[0];
  if (oldest) {
    await updateRecords("Doc", byId(docId), { CurrentVersion: oldest.ItemId });
    return oldest.ItemId;
  }
  return insertFirstVersion(docId);
}

/**
 * 1. Status "Deleting" 2. comments and the DocSource by DocId (SPEC3) 3. pages
 * by DocId (+ legacy pages listed only in v1 order arrays) 4. versions by DocId
 * 5. the Doc. Every step is a filter delete, so running it again after a
 * failure resumes where it stopped. Children always go before parents.
 */
export async function deleteDocCascade(docId: string): Promise<void> {
  await updateRecords("Doc", byId(docId), { Status: "Deleting" });
  await deleteRecords("Comment", { DocId: { eq: docId } });
  await deleteRecords("DocSource", { DocId: { eq: docId } });
  await deleteRecords("Page", { DocId: { eq: docId } });
  const versions = await listVersions(docId);
  const legacyPageIds = [
    ...new Set(
      versions
        .filter((v) => v.SchemaVersion !== CURRENT_SCHEMA_VERSION)
        .flatMap((v) => v.Pages ?? []),
    ),
  ];
  if (legacyPageIds.length > 0) {
    await deleteRecords("Page", { ItemId: { in: legacyPageIds } });
  }
  await deleteRecords("DocVersion", { DocId: { eq: docId } });
  await deleteRecords("Doc", byId(docId));
}

// ==========================================
// Versions
// ==========================================

export async function getDocVersion(versionId: string): Promise<DocVersion | null> {
  const res = await listRecords<DocVersion>("DocVersion", FIELDS.version, {
    where: byId(versionId),
    paging: { pageNo: 1, pageSize: 1 },
  });
  return res.items[0] ?? null;
}

/** All versions of a doc, oldest first. */
export function listVersions(docId: string): Promise<DocVersion[]> {
  return listAllRecords<DocVersion>("DocVersion", FIELDS.version, {
    where: { DocId: { eq: docId } },
    order: [{ field: "CreatedDate", direction: "ASC" }],
    pageSize: 200,
  });
}

async function assertLabelFree(docId: string, label: string, exceptVersionId?: string) {
  const versions = await listVersions(docId);
  const taken = versions.some(
    (v) => v.ItemId !== exceptVersionId && (v.Version ?? "").trim() === label,
  );
  if (taken) {
    throw new DocmeDataError("VersionLabelTaken", MESSAGES.labelTaken(label), { field: "label" });
  }
}

function assertEditable(version: DocVersion | null, versionId: string): DocVersion {
  if (!version) throw new DocmeDataError("GatewayError", `Version ${versionId} was not found`);
  if (!isVersionEditable(version)) {
    throw new DocmeDataError(
      "VersionNotEditable",
      version.SchemaVersion !== CURRENT_SCHEMA_VERSION
        ? "This version uses the old data format — run the migration"
        : "Copy incomplete",
    );
  }
  return version;
}

export async function createBlankVersion(input: { docId: string; label: string }): Promise<string> {
  assertValid(validateVersionLabel(input.label));
  const label = input.label.trim();
  await assertLabelFree(input.docId, label);
  const versionId = await insertRecord("DocVersion", {
    DocId: input.docId,
    Version: label,
    Status: "Ready",
    SchemaVersion: CURRENT_SCHEMA_VERSION,
    IsPublished: false,
    IsActive: false,
  });
  await updateRecords("Doc", byId(input.docId), { CurrentVersion: versionId });
  return versionId;
}

export type CopyProgress = (done: number, total: number) => void;

/** A duplicate that stopped partway; `versionId` is what Retry resumes. */
export class CopyIncompleteError extends DocmeDataError {
  constructor(
    public readonly versionId: string,
    cause: unknown,
  ) {
    super("GatewayError", `Copy incomplete: ${cause instanceof Error ? cause.message : String(cause)}`, {
      cause,
    });
    this.name = "CopyIncompleteError";
  }
}

async function copyPagesAndFinish(args: {
  docId: string;
  sourceVersionId: string;
  targetVersionId: string;
  resume: boolean;
  onProgress?: CopyProgress;
}): Promise<void> {
  const { docId, sourceVersionId, targetVersionId, resume, onProgress } = args;
  try {
    const sources = sortPages(
      await listAllRecords<Page>("Page", FIELDS.pageFull, {
        where: { VersionId: { eq: sourceVersionId } },
        order: [
          { field: "SortOrder", direction: "ASC" },
          { field: "CreatedDate", direction: "ASC" },
        ],
        pageSize: 500,
      }),
    );
    const alreadyCopied = new Set<string>();
    if (resume) {
      const existing = await listAllRecords<Pick<Page, "ItemId" | "SourcePageId">>(
        "Page",
        "ItemId SourcePageId",
        { where: { VersionId: { eq: targetVersionId } }, pageSize: 500 },
      );
      for (const p of existing) if (p.SourcePageId) alreadyCopied.add(p.SourcePageId);
    }
    const missing = sources.filter((p) => !alreadyCopied.has(p.ItemId));
    let done = sources.length - missing.length;
    onProgress?.(done, sources.length);

    const inputs = missing.map((p) => ({
      DocId: docId,
      VersionId: targetVersionId,
      SourcePageId: p.ItemId,
      Title: p.Title,
      ContentType: p.ContentType ?? "md",
      Content: p.Content ?? "",
      SortOrder: p.SortOrder ?? null,
      // The target is a new, unpublished version.
      ReaderVisible: false,
    }));
    for (const chunk of chunkBySize(inputs)) {
      await insertRecordsBatch("Page", chunk);
      done += chunk.length;
      onProgress?.(done, sources.length);
    }
  } catch (err) {
    // Best effort: mark it failed so the UI shows Retry. CurrentVersion is untouched.
    await updateRecords("DocVersion", byId(targetVersionId), { Status: "CopyFailed" }).catch(() => {});
    throw new CopyIncompleteError(targetVersionId, err);
  }
  await updateRecords("DocVersion", byId(targetVersionId), { Status: "Ready" });
  await updateRecords("Doc", byId(docId), { CurrentVersion: targetVersionId });
}

/**
 * 1. insert DocVersion{Status:"Copying"} 2. read the source pages 3. insert
 * copies in chunks (≤20 pages, ≤2 MB per request) 4. Status "Ready"
 * 5. CurrentVersion. A failure in 2–3 leaves CurrentVersion unchanged and
 * throws `CopyIncompleteError`; `resumeDuplicate` finishes it.
 */
export async function duplicateVersion(
  input: { docId: string; sourceVersionId: string; label: string },
  onProgress?: CopyProgress,
): Promise<string> {
  assertValid(validateVersionLabel(input.label));
  const label = input.label.trim();
  assertEditable(await getDocVersion(input.sourceVersionId), input.sourceVersionId);
  await assertLabelFree(input.docId, label);
  const targetVersionId = await insertRecord("DocVersion", {
    DocId: input.docId,
    Version: label,
    Status: "Copying",
    SourceVersionId: input.sourceVersionId,
    SchemaVersion: CURRENT_SCHEMA_VERSION,
    IsPublished: false,
    IsActive: false,
  });
  await copyPagesAndFinish({
    docId: input.docId,
    sourceVersionId: input.sourceVersionId,
    targetVersionId,
    resume: false,
    onProgress,
  });
  return targetVersionId;
}

/** Insert only the source pages not yet copied, then finish steps 4–5. */
export async function resumeDuplicate(versionId: string, onProgress?: CopyProgress): Promise<void> {
  const version = await getDocVersion(versionId);
  if (!version?.SourceVersionId || !version.DocId) {
    throw new DocmeDataError("GatewayError", "This version has no source to copy from");
  }
  await updateRecords("DocVersion", byId(versionId), { Status: "Copying" });
  await copyPagesAndFinish({
    docId: version.DocId,
    sourceVersionId: version.SourceVersionId,
    targetVersionId: versionId,
    resume: true,
    onProgress,
  });
}

/** Deletes the version's comments, its pages, then the version. Never the current version. */
export async function deleteVersion(input: { docId: string; versionId: string }): Promise<void> {
  const doc = await getDoc(input.docId);
  if (doc?.CurrentVersion === input.versionId) {
    throw new DocmeDataError(
      "CannotDeleteCurrentVersion",
      "Switch to another version before deleting it",
    );
  }
  const version = await getDocVersion(input.versionId);
  if (version && version.SchemaVersion !== CURRENT_SCHEMA_VERSION) {
    // Legacy versions may share pages with other versions; deleting by id
    // would hit those. The migration gives each version its own pages first.
    throw new DocmeDataError(
      "VersionNotEditable",
      "This version uses the old data format — run the migration",
    );
  }
  await deleteRecords("Comment", { VersionId: { eq: input.versionId } });
  await deleteRecords("Page", { VersionId: { eq: input.versionId } });
  await deleteRecords("DocVersion", byId(input.versionId));
}

/**
 * 1. V.IsPublished = true 2. Doc.CurrentVersion = V 3. unpublish every other
 * published version of the doc. Running it again restores "exactly one".
 *
 * Step 3 updates each version by id: the gateway's filter delete touches only
 * one match per call, and a filter update matching nothing is not acknowledged.
 */
export async function publishVersion(input: { docId: string; versionId: string }): Promise<void> {
  // Becoming visible: flag first, then pages (§6.2). Its IsActive doesn't matter here.
  await setVersionFlags({ ItemId: input.versionId, IsPublished: false, IsActive: false }, { IsPublished: true });
  await updateRecords("Doc", byId(input.docId), { CurrentVersion: input.versionId });
  const others = await listAllRecords<Pick<DocVersion, "ItemId" | "IsPublished" | "IsActive">>(
    "DocVersion",
    "ItemId IsPublished IsActive",
    {
      where: {
        DocId: { eq: input.docId },
        ItemId: { neq: input.versionId },
        IsPublished: { eq: true },
      },
    },
  );
  for (const v of others) {
    await setVersionFlags(v, { IsPublished: false });
  }
}

async function requireVersion(versionId: string): Promise<DocVersion> {
  const v = await getDocVersion(versionId);
  if (!v) throw new DocmeDataError("GatewayError", `Version ${versionId} was not found`);
  return v;
}

export async function unpublishVersion(versionId: string): Promise<void> {
  await setVersionFlags(await requireVersion(versionId), { IsPublished: false });
}

export async function setVersionActive(versionId: string, isActive: boolean): Promise<void> {
  await setVersionFlags(await requireVersion(versionId), { IsActive: isActive });
}

export async function setCurrentVersion(docId: string, versionId: string): Promise<void> {
  await updateRecords("Doc", byId(docId), { CurrentVersion: versionId });
}

// ==========================================
// Pages
// ==========================================

/** One read, no `Content`. Sorted again on the client for the ItemId tie-break. */
export async function listPageSummaries(versionId: string): Promise<PageSummary[]> {
  const res = await listRecords<PageSummary>("Page", FIELDS.pageSummary, {
    where: { VersionId: { eq: versionId } },
    order: [
      { field: "SortOrder", direction: "ASC" },
      { field: "CreatedDate", direction: "ASC" },
    ],
    paging: { pageNo: 1, pageSize: 500 },
  });
  return sortPages(res.items);
}

/**
 * Read-only titles for a legacy (unmigrated) version, in its v1 order.
 * Ids that no longer exist are dropped.
 */
export async function listLegacyPageSummaries(pageIds: readonly string[]): Promise<PageSummary[]> {
  if (pageIds.length === 0) return [];
  const res = await listRecords<PageSummary>("Page", "ItemId Title CreatedDate", {
    where: { ItemId: { in: [...pageIds] } },
    paging: { pageNo: 1, pageSize: 500 },
  });
  const found = new Map(res.items.map((p) => [p.ItemId, p]));
  return pageIds.flatMap((id) => (found.has(id) ? [found.get(id)!] : []));
}

export async function getPage(pageId: string): Promise<Page | null> {
  const res = await listRecords<Page>("Page", FIELDS.pageFull, {
    where: byId(pageId),
    paging: { pageNo: 1, pageSize: 1 },
  });
  return res.items[0] ?? null;
}

/**
 * 1. read the highest SortOrder in the version 2. insert the page after it.
 * Never writes the DocVersion, so concurrent adds can't erase each other.
 */
export async function addPage(input: {
  docId: string;
  versionId: string;
  title: string;
  contentType: string;
  content: string;
}): Promise<string> {
  assertValid(validatePageInput({ title: input.title, content: input.content }));
  const [top, version] = await Promise.all([
    listRecords<Pick<Page, "ItemId" | "SortOrder">>("Page", "ItemId SortOrder", {
      where: { VersionId: { eq: input.versionId } },
      order: [{ field: "SortOrder", direction: "DESC" }],
      paging: { pageNo: 1, pageSize: 1 },
    }),
    getDocVersion(input.versionId),
  ]);
  return insertRecord("Page", {
    ReaderVisible: version ? isReaderVisible(version) : false,
    DocId: input.docId,
    VersionId: input.versionId,
    Title: input.title.trim(),
    ContentType: input.contentType || "md",
    Content: input.content,
    SortOrder: nextSortOrder(top.items[0]?.SortOrder),
  });
}

export async function updatePage(pageId: string, updates: PageUpdate): Promise<void> {
  assertValid(validatePageInput({ title: updates.Title, content: updates.Content }));
  const input: PageUpdate = { ...updates };
  if (input.Title !== undefined) input.Title = input.Title.trim();
  await updateRecords("Page", byId(pageId), input);
}

/**
 * Comments go first (SPEC3 H12). Comment DELETE is author-or-admin only, so
 * an editor can't remove other people's comments; the gateway answers such a
 * refused filter delete like an empty one. So the page is deleted only once
 * no comment on it is left, never leaving orphaned comments behind.
 */
export async function deletePage(pageId: string): Promise<void> {
  await deleteCommentsOrRefuse({ PageId: { eq: pageId } });
  await deleteRecords("Page", byId(pageId));
}

export async function deletePagesByIds(pageIds: readonly string[]): Promise<void> {
  if (pageIds.length === 0) return;
  await deleteCommentsOrRefuse({ PageId: { in: [...pageIds] } });
  await deleteRecords("Page", { ItemId: { in: [...pageIds] } });
}

export const COMMENTS_BLOCK_DELETE =
  "This page has comments from other people, and only an admin can delete those. Ask an admin to delete the page.";

async function deleteCommentsOrRefuse(where: Where): Promise<void> {
  await deleteRecords("Comment", where);
  const left = await listRecords<{ ItemId: string }>("Comment", "ItemId", {
    where,
    paging: { pageNo: 1, pageSize: 1 },
  });
  if (left.totalCount > 0 || left.items.length > 0) {
    throw new DocmeDataError("Forbidden", COMMENTS_BLOCK_DELETE);
  }
}

export class ReorderIncompleteError extends DocmeDataError {
  constructor(
    public readonly failed: number,
    public readonly attempted: number,
    cause: unknown,
  ) {
    super(
      "GatewayError",
      `${failed} of ${attempted} page moves didn't save. Save again to finish.`,
      { cause },
    );
    this.name = "ReorderIncompleteError";
  }
}

/**
 * Give position i the SortOrder (i+1)×1024, updating only pages whose stored
 * value differs, at most 5 requests at a time. Reads the current values
 * first, so saving again after a partial failure sends only what's left.
 */
export async function reorderPages(input: {
  versionId: string;
  orderedIds: readonly string[];
}): Promise<{ updated: number }> {
  const current = await listPageSummaries(input.versionId);
  const updates = planReorder(current, input.orderedIds);
  const results = await runLimited(updates, 5, (u) =>
    updateRecords("Page", byId(u.ItemId), { SortOrder: u.SortOrder }),
  );
  const failures = results.filter((r) => r.error !== undefined);
  if (failures.length > 0) {
    throw new ReorderIncompleteError(failures.length, updates.length, failures[0].error);
  }
  return { updated: updates.length };
}
