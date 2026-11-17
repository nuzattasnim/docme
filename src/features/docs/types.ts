/**
 * Domain types for the docme data model (v2).
 *
 * Three entity schemas in Blocks Data:
 *   - Doc         — a document; `CurrentVersion` is the version editors open by default
 *   - DocVersion  — a version of a Doc; owns its Pages
 *   - Page        — one page; points back to its Doc and DocVersion
 *
 * Blocks adds `ItemId`, `CreatedDate`, `CreatedBy`, `LastUpdatedDate`,
 * `LastUpdatedBy`, `Language`, `OrganizationId` and `Tags` to every record.
 *
 * Relationships (resolved by field values, not GraphQL relations):
 *   Doc 1───* DocVersion   (DocVersion.DocId = Doc.ItemId)
 *   DocVersion 1───* Page  (Page.VersionId = DocVersion.ItemId, Page.DocId = Doc.ItemId)
 *
 * Page order is `SortOrder` ASC, then `CreatedDate` ASC, then `ItemId` ASC
 * (see ordering.ts). `DocVersion.Pages` is the deprecated v1 order array:
 * only the migration reads it, and nothing writes it.
 */

export type DocStatus = "Active" | "Deleting";
export type VersionStatus = "Ready" | "Copying" | "CopyFailed";
export const CURRENT_SCHEMA_VERSION = 2;

export interface Doc {
  ItemId: string;
  Name: string;
  Description?: string | null;
  CurrentVersion?: string | null;
  /** Missing on legacy records — read as "Active". */
  Status?: DocStatus | null;
  CreatedDate?: string;
  LastUpdatedDate?: string;
}

export interface DocVersion {
  ItemId: string;
  DocId?: string | null;
  Version?: string | null;
  /** @deprecated v1 order array. Read only by the migration. */
  Pages?: string[] | null;
  IsPublished?: boolean | null;
  IsActive?: boolean | null;
  Status?: VersionStatus | null;
  SourceVersionId?: string | null;
  /** 2 for v2 records; missing means legacy (unmigrated). */
  SchemaVersion?: number | null;
  CreatedDate?: string;
  LastUpdatedDate?: string;
}

export interface Page {
  ItemId: string;
  DocId?: string | null;
  VersionId?: string | null;
  Title: string;
  ContentType?: string | null;
  Content?: string | null;
  SortOrder?: number | null;
  SourcePageId?: string | null;
  CreatedDate?: string;
  LastUpdatedDate?: string;
}

/** What the page list needs — never includes `Content`. */
export interface PageSummary {
  ItemId: string;
  Title: string;
  SortOrder?: number | null;
  CreatedDate?: string;
}

export type DocUpdate = Partial<Pick<Doc, "Name" | "Description">>;
export type PageUpdate = Partial<Pick<Page, "Title" | "ContentType" | "Content">>;

/** "Active" unless the record says otherwise. */
export function docStatus(doc: Pick<Doc, "Status">): DocStatus {
  return doc.Status === "Deleting" ? "Deleting" : "Active";
}

/** The version's editability, derived from SchemaVersion + Status. */
export type VersionState = "ready" | "legacy" | "copying" | "copyFailed";

export function versionState(v: Pick<DocVersion, "SchemaVersion" | "Status">): VersionState {
  if (v.SchemaVersion !== CURRENT_SCHEMA_VERSION) return "legacy";
  if (v.Status === "Copying") return "copying";
  if (v.Status === "CopyFailed") return "copyFailed";
  if (v.Status === "Ready") return "ready";
  // A v2 record without a Status is treated as not ready: never edit it.
  return "copyFailed";
}

export function isVersionEditable(v: Pick<DocVersion, "SchemaVersion" | "Status">): boolean {
  return versionState(v) === "ready";
}
