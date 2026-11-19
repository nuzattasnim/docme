/**
 * DocSource — the GitHub repository, branch and baseline commit a doc
 * describes (SPEC3 §6.1). One record per doc, enforced by the unique
 * `DocSource(DocId)` index. No credentials are ever stored here.
 */
import { DocmeDataError, isDocmeDataError } from "@/features/data/errors";
import { deleteRecords, insertRecord, listRecords, updateRecords } from "@/features/docs/services";
import { normalizeRepoLink, type RepoLinkErrors, type RepoLinkInput } from "./repo-link";

export interface DocSource {
  ItemId: string;
  DocId: string;
  Provider: "GitHub";
  RepoOwner: string;
  RepoName: string;
  RepoUrl: string;
  Branch: string;
  DocsPath: string;
  BaselineCommitSha?: string | null;
  LastSyncedCommitSha?: string | null;
  LastSyncedAt?: string | null;
  LastUpdatedDate?: string;
}

const FIELDS =
  "ItemId DocId Provider RepoOwner RepoName RepoUrl Branch DocsPath BaselineCommitSha LastSyncedCommitSha LastSyncedAt LastUpdatedDate";

/** Thrown before any request when the input breaks a §6.1 rule. */
export class RepoLinkInvalidError extends DocmeDataError {
  constructor(public readonly errors: RepoLinkErrors) {
    super("InvalidInput", Object.values(errors)[0] ?? "Repo link is not valid", {
      field: Object.keys(errors)[0],
    });
    this.name = "RepoLinkInvalidError";
  }
}

export async function getDocSource(docId: string): Promise<DocSource | null> {
  const res = await listRecords<DocSource>("DocSource", FIELDS, {
    where: { DocId: { eq: docId } },
    paging: { pageNo: 1, pageSize: 1 },
  });
  return res.items[0] ?? null;
}

/**
 * J12: read by DocId, then insert or update (≤ 2 requests). If the insert
 * loses a race with another admin (the unique index refuses it), read again
 * and update, so the later save wins and exactly one record remains (C2).
 */
export async function saveDocSource(docId: string, input: RepoLinkInput): Promise<DocSource> {
  const normalized = normalizeRepoLink(input);
  if (!normalized.ok) throw new RepoLinkInvalidError(normalized.errors);
  const fields: Record<string, unknown> & typeof normalized.value = { ...normalized.value };

  const existing = await getDocSource(docId);
  if (existing) {
    await updateRecords("DocSource", { ItemId: { eq: existing.ItemId } }, fields);
    return { ...existing, ...fields };
  }
  try {
    const itemId = await insertRecord("DocSource", { DocId: docId, ...fields });
    return { ItemId: itemId, DocId: docId, ...fields };
  } catch (err) {
    if (isDocmeDataError(err, "Forbidden") || isDocmeDataError(err, "Unauthorized")) throw err;
    const winner = await getDocSource(docId);
    if (!winner) throw err;
    await updateRecords("DocSource", { ItemId: { eq: winner.ItemId } }, fields);
    return { ...winner, ...fields };
  }
}

/** Remove the link. The Doc, its versions and pages are untouched (H4). */
export async function removeDocSource(docId: string): Promise<void> {
  await deleteRecords("DocSource", { DocId: { eq: docId } });
}
