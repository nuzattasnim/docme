import { gql, type ActionResponse } from "@/features/data/gateway";
import { type Doc, type DocVersion, type Page, type DocUpdate, type DocVersionUpdate, type PageUpdate } from "./types";

// ==========================================
// Doc Services
// ==========================================

export interface ListDocsOptions {
  paging?: { pageNo: number; pageSize: number };
  order?: Array<{ direction: "ASC" | "DESC"; field: string }>;
}

export interface ListResult<T> {
  totalCount: number;
  pageNo: number;
  pageSize: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  items: T[];
}

/**
 * List docs with optional paging + order. Used by the docs-list page.
 */
export async function listDocs(opts: ListDocsOptions = {}) {
  const paging = opts.paging ?? { pageNo: 1, pageSize: 50 };
  const order = opts.order ?? [{ direction: "DESC", field: "CreatedDate" }];
  const res = await gql<{ getDocs: ListResult<Doc> }>(
    `query($paging: PaginationInput, $order: [DynamicSortInput!]) {
      getDocs(paging: $paging, order: $order) {
        totalCount pageNo pageSize totalPages hasNextPage hasPreviousPage
        items { ItemId Name Description CurrentVersion CreatedDate LastUpdatedDate }
      }
    }`,
    { paging, order },
  );
  return res.getDocs;
}

export async function createDoc(name: string, description?: string | null) {
  const res = await gql<{ insertDoc: ActionResponse }>(
    `mutation($input: DocInsertInput!) {
      insertDoc(input: $input) { acknowledged itemId totalImpactedData message }
    }`,
    { input: { Name: name, Description: description } }
  );
  return res.insertDoc;
}

export async function getDoc(itemId: string) {
  const res = await gql<{ getDocs: { items: Doc[] } }>(
    `query($where: DocFilterInput) {
      getDocs(where: $where) {
        items { ItemId Name Description CurrentVersion }
      }
    }`,
    { where: { ItemId: { eq: itemId } } }
  );
  return res.getDocs.items[0];
}

export async function updateDoc(itemId: string, updates: DocUpdate) {
  const res = await gql<{ updateDoc: ActionResponse }>(
    `mutation($where: DocFilterInput, $input: DocUpdateInput!) {
      updateDoc(where: $where, input: $input) { acknowledged totalImpactedData message }
    }`,
    { where: { ItemId: { eq: itemId } }, input: updates }
  );
  return res.updateDoc;
}

export async function deleteDoc(itemId: string) {
  const res = await gql<{ deleteDoc: ActionResponse }>(
    `mutation($where: DocFilterInput) {
      deleteDoc(where: $where) { acknowledged totalImpactedData message }
    }`,
    { where: { ItemId: { eq: itemId } } }
  );
  return res.deleteDoc;
}

// ==========================================
// DocVersion Services
// ==========================================

export async function createDocVersion(docId: string, version: string, pages: string[]) {
  const res = await gql<{ insertDocVersion: ActionResponse }>(
    `mutation($input: DocVersionInsertInput!) {
      insertDocVersion(input: $input) { acknowledged itemId totalImpactedData message }
    }`,
    { input: { DocId: docId, Version: version, Pages: pages } }
  );
  return res.insertDocVersion;
}

export async function getDocVersion(itemId: string) {
  const res = await gql<{ getDocVersions: { items: DocVersion[] } }>(
    `query($where: DocVersionFilterInput) {
      getDocVersions(where: $where) {
        items { ItemId DocId Version Pages IsPublished IsActive }
      }
    }`,
    { where: { ItemId: { eq: itemId } } }
  );
  return res.getDocVersions.items[0];
}

export async function getDocVersionsByDocId(docId: string) {
  const res = await gql<{ getDocVersions: { items: DocVersion[] } }>(
    `query($where: DocVersionFilterInput) {
      getDocVersions(where: $where) {
        items { ItemId DocId Version Pages IsPublished IsActive }
      }
    }`,
    { where: { DocId: { eq: docId } } }
  );
  return res.getDocVersions.items;
}

export async function updateDocVersion(itemId: string, updates: DocVersionUpdate) {
  const res = await gql<{ updateDocVersion: ActionResponse }>(
    `mutation($where: DocVersionFilterInput, $input: DocVersionUpdateInput!) {
      updateDocVersion(where: $where, input: $input) { acknowledged totalImpactedData message }
    }`,
    { where: { ItemId: { eq: itemId } }, input: updates }
  );
  return res.updateDocVersion;
}

export async function deleteDocVersion(itemId: string) {
  const res = await gql<{ deleteDocVersion: ActionResponse }>(
    `mutation($where: DocVersionFilterInput) {
      deleteDocVersion(where: $where) { acknowledged totalImpactedData message }
    }`,
    { where: { ItemId: { eq: itemId } } }
  );
  return res.deleteDocVersion;
}

export async function deleteManyDocVersions(docId: string) {
  const res = await gql<{ deleteDocVersion: ActionResponse }>(
    `mutation($where: DocVersionFilterInput) {
      deleteDocVersion(where: $where) { acknowledged totalImpactedData message }
    }`,
    { where: { DocId: { eq: docId } } }
  );
  return res.deleteDocVersion;
}

// ==========================================
// Page Services
// ==========================================

export async function createPage(title: string, type: string, content: string) {
  const res = await gql<{ insertPage: ActionResponse }>(
    `mutation($input: PageInsertInput!) {
      insertPage(input: $input) { acknowledged itemId totalImpactedData message }
    }`,
    { input: { Title: title, ContentType: type, Content: content } }
  );
  return res.insertPage;
}

export async function getPage(itemId: string) {
  const res = await gql<{ getPages: { items: Page[] } }>(
    `query($where: PageFilterInput) {
      getPages(where: $where) {
        items { ItemId Title ContentType Content }
      }
    }`,
    { where: { ItemId: { eq: itemId } } }
  );
  return res.getPages.items[0];
}

/**
 * Fetch just ItemId + Title for a batch of page ids. Used by the
 * DocDetailPage sidebar so we don't pull full content for every page.
 * Returns the items in the order the gateway returns them — caller
 * re-orders against `DocVersion.Pages` if needed.
 */
export async function getPageTitlesByIds(
  pageIds: string[]
): Promise<Array<{ ItemId: string; Title: string }>> {
  if (pageIds.length === 0) return [];
  const res = await gql<{
    getPages: { items: Array<{ ItemId: string; Title: string }> };
  }>(
    `query($where: PageFilterInput) {
      getPages(where: $where) {
        items { ItemId Title }
      }
    }`,
    { where: { ItemId: { in: pageIds } } },
  );
  return res.getPages.items;
}

export async function updatePage(itemId: string, updates: PageUpdate) {
  const res = await gql<{ updatePage: ActionResponse }>(
    `mutation($where: PageFilterInput, $input: PageUpdateInput!) {
      updatePage(where: $where, input: $input) { acknowledged totalImpactedData message }
    }`,
    { where: { ItemId: { eq: itemId } }, input: updates }
  );
  return res.updatePage;
}

export async function deletePage(itemId: string) {
  const res = await gql<{ deletePage: ActionResponse }>(
    `mutation($where: PageFilterInput) {
      deletePage(where: $where) { acknowledged totalImpactedData message }
    }`,
    { where: { ItemId: { eq: itemId } } }
  );
  return res.deletePage;
}

export async function deleteManyPages(pageIds: string[]) {
  if (pageIds.length === 0) return { acknowledged: true, totalImpactedData: 0 };
  const res = await gql<{ deletePage: ActionResponse }>(
    `mutation($where: PageFilterInput) {
      deletePage(where: $where) { acknowledged totalImpactedData message }
    }`,
    { where: { ItemId: { in: pageIds } } }
  );
  return res.deletePage;
}
