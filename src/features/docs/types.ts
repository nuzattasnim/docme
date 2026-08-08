/**
 * Domain types for the docme data model.
 *
 * The cloud project defines three entity schemas:
 *   - Doc          — a document with a CurrentVersion pointer
 *   - DocVersion   — a saved snapshot of a Doc, owns Pages[]
 *   - Page         — an individual page (Title, ContentType, Content)
 *
 * Blocks auto-adds `ItemId`, `CreatedDate`, `CreatedBy`, `LastUpdatedDate`,
 * `LastUpdatedBy`, `Language`, `OrganizationId`, and `Tags` to every entity —
 * we don't define those here. Field names in the gateway are PascalCase, so
 * the TS interfaces match.
 *
 * Relationship shape (resolved via field values, not by GraphQL relations):
 *   Doc 1───1 DocVersion       (Doc.CurrentVersion = DocVersion.ItemId)
 *   DocVersion 1───* Page      (DocVersion.Pages  = Page.ItemId[])
 *
 * The "Pages of the current version" are resolved by reading
 * `DocVersion.Pages` (a string[] of Page ItemIds) and then fetching those
 * Page records. The detail page re-orders the result to match the order
 * stored on the DocVersion.
 */

/** A Doc record from the gateway. */
export interface Doc {
  ItemId: string;
  Name: string;
  Description?: string | null;
  CurrentVersion?: string | null;
  CreatedDate?: string;
  LastUpdatedDate?: string;
}

/** A DocVersion record — owned by one Doc; owns the ordered list of Pages. */
export interface DocVersion {
  ItemId: string;
  DocId?: string | null;
  Version?: string | null;
  Pages?: string[] | null;
  IsPublished?: boolean | null;
  IsActive?: boolean | null;
  CreatedDate?: string;
  LastUpdatedDate?: string;
}

/** A Page record — referenced from DocVersion.Pages (string[] of Page ItemIds). */
export interface Page {
  ItemId: string;
  Title: string;
  ContentType?: string | null;
  Content?: string | null;
  CreatedDate?: string;
  LastUpdatedDate?: string;
}

/** Input shape for `insertDoc` / partial `updateDoc`. */
export type DocInsert = {
  Name: string;
  Description?: string | null;
  CurrentVersion?: string | null;
};
export type DocUpdate = Partial<DocInsert>;

/** Input shape for `insertDocVersion` / partial `updateDocVersion`. */
export type DocVersionInsert = {
  DocId?: string | null;
  Version?: string | null;
  Pages?: string[] | null;
  IsPublished?: boolean | null;
  IsActive?: boolean | null;
};
export type DocVersionUpdate = Partial<DocVersionInsert>;

/** Input shape for `insertPage` / partial `updatePage`. */
export type PageInsert = {
  Title: string;
  ContentType?: string | null;
  Content?: string | null;
};
export type PageUpdate = Partial<PageInsert>;
