/**
 * In-place migration from the v1 data model (shared `DocVersion.Pages`
 * arrays) to v2 (each Page owned by one DocVersion, ordered by SortOrder).
 *
 * Runs inside the app, as the signed-in user, through the SDK — the blocks
 * CLI has no record-level commands. See SPEC1 §6.4.
 *
 * - `scanMigration` only reads.
 * - `runMigration` is idempotent: versions with SchemaVersion 2 are skipped,
 *   a page already owned by the version is left alone, and a copy is only
 *   inserted when none with {VersionId, SourcePageId} exists. Running it
 *   again after a failure (or after someone wrote through the old app)
 *   finishes the remaining work.
 */
import {
  deletePagesByIds,
  getPage,
  insertRecord,
  isReaderVisible,
  listAllRecords,
  updateRecords,
} from "@/features/docs/services";
import { sortOrderAt } from "@/features/docs/ordering";
import { CURRENT_SCHEMA_VERSION, type Doc, type DocVersion, type Page } from "@/features/docs/types";

export type PageMeta = Pick<
  Page,
  "ItemId" | "Title" | "DocId" | "VersionId" | "SortOrder" | "SourcePageId" | "CreatedDate"
>;

export interface Snapshot {
  docs: Array<Pick<Doc, "ItemId" | "Name" | "Status" | "CreatedDate">>;
  versions: DocVersion[];
  pages: PageMeta[];
}

export interface OrphanPage {
  ItemId: string;
  Title: string;
  CreatedDate?: string;
}

export interface ScanResult {
  docs: number;
  versions: number;
  versionsMigrated: number;
  legacyRefs: number;
  sharedPages: number;
  orphanPages: number;
  danglingRefs: number;
  orphans: OrphanPage[];
}

export interface ReportRow {
  versionId: string;
  docName: string;
  version: string;
  legacyRefs: number;
  dangling: number;
  danglingIds: string[];
  pagesNow: number;
  pass: boolean;
}

export interface MigrationReport {
  rows: ReportRow[];
  docsStatusSet: number;
  mutations: number;
  scanAfter: ScanResult;
}

const SNAPSHOT_PAGE_SIZE = 200;
const PAGE_META_FIELDS = "ItemId Title DocId VersionId SortOrder SourcePageId CreatedDate";

/** Prefix an error with what was being done, keeping the original as cause. */
function inStep<T>(step: string, run: () => Promise<T>): Promise<T> {
  return run().catch((err: unknown) => {
    throw new Error(`${step}: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
  });
}

export async function loadSnapshot(): Promise<Snapshot> {
  const [docs, versions, pages] = await Promise.all([
    inStep("Reading docs", () =>
      listAllRecords<Snapshot["docs"][number]>("Doc", "ItemId Name Status CreatedDate", {
        pageSize: SNAPSHOT_PAGE_SIZE,
      }),
    ),
    inStep("Reading versions", () =>
      listAllRecords<DocVersion>(
        "DocVersion",
        "ItemId DocId Version Pages IsPublished IsActive Status SourceVersionId SchemaVersion CreatedDate",
        { pageSize: SNAPSHOT_PAGE_SIZE },
      ),
    ),
    inStep("Reading pages", () =>
      listAllRecords<PageMeta>("Page", PAGE_META_FIELDS, { pageSize: SNAPSHOT_PAGE_SIZE }),
    ),
  ]);
  return { docs, versions, pages };
}

const isMigrated = (v: DocVersion) => v.SchemaVersion === CURRENT_SCHEMA_VERSION;

/** Pure: the §6.4 scan counters for a snapshot. */
export function computeScan(snap: Snapshot): ScanResult {
  const pageIds = new Set(snap.pages.map((p) => p.ItemId));
  const unmigrated = snap.versions.filter((v) => !isMigrated(v));

  let legacyRefs = 0;
  let danglingRefs = 0;
  const refCount = new Map<string, number>();
  for (const v of unmigrated) {
    const refs = v.Pages ?? [];
    legacyRefs += refs.length;
    for (const id of new Set(refs)) refCount.set(id, (refCount.get(id) ?? 0) + 1);
    for (const id of refs) if (!pageIds.has(id)) danglingRefs++;
  }
  const sharedPages = [...refCount.entries()].filter(
    ([id, n]) => n > 1 && pageIds.has(id),
  ).length;

  // Referenced by any version's legacy array (migrated or not) counts as referenced.
  const referenced = new Set(snap.versions.flatMap((v) => v.Pages ?? []));
  const orphans = snap.pages
    .filter((p) => !p.VersionId && !referenced.has(p.ItemId))
    .map((p) => ({ ItemId: p.ItemId, Title: p.Title, CreatedDate: p.CreatedDate }));

  return {
    docs: snap.docs.length,
    versions: snap.versions.length,
    versionsMigrated: snap.versions.length - unmigrated.length,
    legacyRefs,
    sharedPages,
    orphanPages: orphans.length,
    danglingRefs,
    orphans,
  };
}

export async function scanMigration(): Promise<ScanResult> {
  return computeScan(await loadSnapshot());
}

function byCreatedThenId(a: DocVersion, b: DocVersion): number {
  const ta = a.CreatedDate ? Date.parse(a.CreatedDate) : 0;
  const tb = b.CreatedDate ? Date.parse(b.CreatedDate) : 0;
  if (ta !== tb) return ta - tb;
  return a.ItemId < b.ItemId ? -1 : a.ItemId > b.ItemId ? 1 : 0;
}

export type MigrationProgress = (versionIndex: number, versionCount: number) => void;

/** §6.4 run: oldest unmigrated version first. */
export async function runMigration(onProgress?: MigrationProgress): Promise<MigrationReport> {
  const snap = await loadSnapshot();
  const pages = new Map(snap.pages.map((p) => [p.ItemId, { ...p }]));
  const copyKeys = new Set(
    snap.pages.filter((p) => p.VersionId && p.SourcePageId).map((p) => `${p.VersionId}|${p.SourcePageId}`),
  );
  const pending = snap.versions.filter((v) => !isMigrated(v)).sort(byCreatedThenId);
  const docNames = new Map(snap.docs.map((d) => [d.ItemId, d.Name]));
  const danglingByVersion = new Map<string, string[]>();
  let mutations = 0;

  for (let k = 0; k < pending.length; k++) {
    const v = pending[k];
    onProgress?.(k + 1, pending.length);
    await inStep(`Migrating version "${v.Version || v.ItemId}" (${v.ItemId})`, () => migrateVersion(v));
  }

  async function migrateVersion(v: DocVersion) {
    const dangling: string[] = [];
    const readerVisible = isReaderVisible(v);
    const refs = v.Pages ?? [];

    for (let i = 0; i < refs.length; i++) {
      const pid = refs[i];
      const page = pages.get(pid);
      const sortOrder = sortOrderAt(i);

      if (!page) {
        dangling.push(pid);
        continue;
      }
      if (!page.VersionId) {
        await updateRecords(
          "Page",
          { ItemId: { eq: pid } },
          { DocId: v.DocId ?? null, VersionId: v.ItemId, SortOrder: sortOrder, ReaderVisible: readerVisible },
        );
        mutations++;
        page.VersionId = v.ItemId;
        page.DocId = v.DocId ?? null;
        page.SortOrder = sortOrder;
        continue;
      }
      if (page.VersionId === v.ItemId) continue; // done by an earlier, interrupted run

      // Owned by another version: this version needs its own copy.
      const key = `${v.ItemId}|${pid}`;
      if (copyKeys.has(key)) continue;
      const full = await getPage(pid);
      if (!full) {
        dangling.push(pid);
        continue;
      }
      const copyId = await insertRecord("Page", {
        DocId: v.DocId ?? null,
        VersionId: v.ItemId,
        SourcePageId: pid,
        Title: full.Title,
        ContentType: full.ContentType ?? "md",
        Content: full.Content ?? "",
        SortOrder: sortOrder,
        ReaderVisible: readerVisible,
      });
      mutations++;
      copyKeys.add(key);
      pages.set(copyId, {
        ItemId: copyId,
        Title: full.Title,
        DocId: v.DocId ?? null,
        VersionId: v.ItemId,
        SortOrder: sortOrder,
        SourcePageId: pid,
      });
    }

    await updateRecords(
      "DocVersion",
      { ItemId: { eq: v.ItemId } },
      { SchemaVersion: CURRENT_SCHEMA_VERSION, Status: "Ready" },
    );
    mutations++;
    danglingByVersion.set(v.ItemId, dangling);
  }

  let docsStatusSet = 0;
  for (const doc of snap.docs) {
    if (!doc.Status) {
      await inStep(`Setting Status on doc ${doc.ItemId}`, () =>
        updateRecords("Doc", { ItemId: { eq: doc.ItemId } }, { Status: "Active" }),
      );
      mutations++;
      docsStatusSet++;
    }
  }

  // Verify against what is stored now, not against our in-memory copy.
  const after = await loadSnapshot();
  const pagesNow = new Map<string, number>();
  for (const p of after.pages) {
    if (p.VersionId) pagesNow.set(p.VersionId, (pagesNow.get(p.VersionId) ?? 0) + 1);
  }
  const rows: ReportRow[] = pending.map((v) => {
    const legacyRefs = (v.Pages ?? []).length;
    const danglingIds = danglingByVersion.get(v.ItemId) ?? [];
    const now = pagesNow.get(v.ItemId) ?? 0;
    return {
      versionId: v.ItemId,
      docName: (v.DocId && docNames.get(v.DocId)) || "(unknown doc)",
      version: v.Version || v.ItemId,
      legacyRefs,
      dangling: danglingIds.length,
      danglingIds,
      pagesNow: now,
      pass: now === legacyRefs - danglingIds.length,
    };
  });

  return { rows, docsStatusSet, mutations, scanAfter: computeScan(after) };
}

/** Soft-delete the given orphan pages. Only after the user confirms (C13). */
export function deleteOrphans(pageIds: readonly string[]): Promise<void> {
  return deletePagesByIds(pageIds);
}
