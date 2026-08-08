import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  createDocVersion,
  getDocVersion,
  getDocVersionsByDocId,
  updateDocVersion,
  deleteDocVersion,
  deleteManyDocVersions,
  createPage,
  getPage,
  getPageTitlesByIds,
  updatePage,
  deletePage,
  deleteManyPages,
  listDocs,
  type ListDocsOptions,
} from "./services";
import { type DocVersion, type DocUpdate, type DocVersionUpdate, type PageUpdate } from "./types";
import { type ActionResponse } from "@/features/data/gateway";

// Query keys for invalidation matching make-crud.ts
const KEYS = {
  docs: ["data", "getDocs"],
  versions: ["data", "getDocVersions"],
  pages: ["data", "getPages"],
};

// ==========================================
// Document Hooks
// ==========================================

export function useGetDoc(docId: string) {
  return useQuery({
    queryKey: [...KEYS.docs, docId],
    queryFn: () => getDoc(docId),
    enabled: !!docId,
  });
}

/**
 * List docs with paging + order. Used by the docs-list page.
 * Re-fetches when paging/order change so navigating pages is cheap.
 */
export function useListDocs(opts?: ListDocsOptions) {
  return useQuery({
    queryKey: [...KEYS.docs, "list", opts ?? {}],
    queryFn: () => listDocs(opts),
  });
}

export function useCreateDoc() {
  const qc = useQueryClient();
  return useMutation<ActionResponse, Error, { name: string; description?: string | null }>({
    mutationFn: async ({ name, description }) => {
      const resDoc = await createDoc(name, description);
      if (!resDoc.itemId) throw new Error("Doc creation failed to return itemId");
      const resVersion = await createDocVersion(resDoc.itemId, "0.0.1", []);
      if (!resVersion.itemId) throw new Error("DocVersion creation failed to return itemId");
      await updateDoc(resDoc.itemId, { CurrentVersion: resVersion.itemId });
      return resDoc;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.docs });
      qc.invalidateQueries({ queryKey: KEYS.versions });
    },
  });
}

export function useUpdateDoc() {
  const qc = useQueryClient();
  return useMutation<ActionResponse, Error, { docId: string; updates: DocUpdate }>({
    mutationFn: async ({ docId, updates }) => updateDoc(docId, updates),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.docs }),
  });
}

export function useDeleteDoc() {
  const qc = useQueryClient();
  return useMutation<ActionResponse, Error, string>({
    mutationFn: async (docId) => {
      const versions = await getDocVersionsByDocId(docId);
      const allPageIds = versions.flatMap((v) => v.Pages || []);
      
      // Delete all pages
      if (allPageIds.length > 0) {
        await deleteManyPages(allPageIds);
      }
      
      // Delete all versions
      await deleteManyDocVersions(docId);
      
      // Delete doc
      return deleteDoc(docId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.docs });
      qc.invalidateQueries({ queryKey: KEYS.versions });
      qc.invalidateQueries({ queryKey: KEYS.pages });
    },
  });
}

// ==========================================
// DocVersion Hooks
// ==========================================

export function useGetDocVersion(versionId: string) {
  return useQuery({
    queryKey: [...KEYS.versions, versionId],
    queryFn: () => getDocVersion(versionId),
    enabled: !!versionId,
  });
}

export function useCreateDocVersion() {
  const qc = useQueryClient();
  return useMutation<ActionResponse, Error, { docId: string; version: string; previousVersion: DocVersion }>({
    mutationFn: async ({ docId, version, previousVersion }) => {
      const pages = previousVersion.Pages || [];
      const resVersion = await createDocVersion(docId, version, pages);
      if (!resVersion.itemId) throw new Error("DocVersion creation failed to return itemId");
      await updateDoc(docId, { CurrentVersion: resVersion.itemId });
      return resVersion;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.docs });
      qc.invalidateQueries({ queryKey: KEYS.versions });
    },
  });
}

export function useUpdateDocVersion() {
  const qc = useQueryClient();
  return useMutation<ActionResponse, Error, { versionId: string; updates: DocVersionUpdate }>({
    mutationFn: async ({ versionId, updates }) => updateDocVersion(versionId, updates),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.versions }),
  });
}

export function useDeleteDocVersion() {
  const qc = useQueryClient();
  return useMutation<ActionResponse, Error, string>({
    mutationFn: async (versionId) => {
      const version = await getDocVersion(versionId);
      if (version && version.Pages && version.Pages.length > 0) {
        await deleteManyPages(version.Pages);
      }
      return deleteDocVersion(versionId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.versions });
      qc.invalidateQueries({ queryKey: KEYS.pages });
    },
  });
}

export function usePublishVersion() {
  const qc = useQueryClient();
  return useMutation<ActionResponse, Error, { docId: string; newVersionId: string; currentPublishedVersionId?: string | null }>({
    mutationFn: async ({ docId, newVersionId, currentPublishedVersionId }) => {
      if (currentPublishedVersionId) {
        await updateDocVersion(currentPublishedVersionId, { IsPublished: false });
      }
      await updateDocVersion(newVersionId, { IsPublished: true });
      return updateDoc(docId, { CurrentVersion: newVersionId });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.docs });
      qc.invalidateQueries({ queryKey: KEYS.versions });
    },
  });
}

export function useActivateVersion() {
  const qc = useQueryClient();
  return useMutation<ActionResponse, Error, string>({
    mutationFn: async (versionId) => updateDocVersion(versionId, { IsActive: true }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.versions }),
  });
}

export function useDeactivateVersion() {
  const qc = useQueryClient();
  return useMutation<ActionResponse, Error, string>({
    mutationFn: async (versionId) => updateDocVersion(versionId, { IsActive: false }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.versions }),
  });
}


/**
 * Titles-only batch fetch for the DocDetailPage sidebar. Takes a list
 * of Page ItemIds and returns `{ ItemId, Title }` records.
 *
 * The caller re-orders the result to match `DocVersion.Pages` (the
 * canonical order); this hook just fetches the metadata.
 *
 * Disabled when `pageIds` is empty so we don't fire a no-op query.
 */
export function useListPageTitles(
  pageIds: string[],
): ReturnType<typeof useQuery<Array<{ ItemId: string; Title: string }>>> {
  // Stable cache key — the ids joined as a string changes iff the set changes.
  const cacheKey = pageIds.join(",");
  return useQuery({
    queryKey: [...KEYS.pages, "titles", cacheKey],
    queryFn: () => getPageTitlesByIds(pageIds),
    enabled: pageIds.length > 0,
  });
}
// ==========================================
// Page Hooks
// ==========================================

export function useGetPage(pageId: string) {
  return useQuery({
    queryKey: [...KEYS.pages, pageId],
    queryFn: () => getPage(pageId),
    enabled: !!pageId,
  });
}

export function useAddPage() {
  const qc = useQueryClient();
  return useMutation<ActionResponse, Error, { title: string; type: string; content: string; currentVersion: DocVersion }>({
    mutationFn: async ({ title, type, content, currentVersion }) => {
      const resPage = await createPage(title, type, content);
      if (!resPage.itemId) throw new Error("Page creation failed to return itemId");
      const currentPages = currentVersion.Pages || [];
      const newPages = [...currentPages, resPage.itemId];
      await updateDocVersion(currentVersion.ItemId, { Pages: newPages });
      return resPage;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.pages });
      qc.invalidateQueries({ queryKey: KEYS.versions });
    },
  });
}

export function useUpdatePage() {
  const qc = useQueryClient();
  return useMutation<ActionResponse, Error, { pageId: string; updates: PageUpdate }>({
    mutationFn: async ({ pageId, updates }) => updatePage(pageId, updates),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.pages }),
  });
}

export function useDeletePage() {
  const qc = useQueryClient();
  return useMutation<ActionResponse, Error, { pageId: string; currentVersion: DocVersion }>({
    mutationFn: async ({ pageId, currentVersion }) => {
      await deletePage(pageId);
      const currentPages = currentVersion.Pages || [];
      const newPages = currentPages.filter((id) => id !== pageId);
      return updateDocVersion(currentVersion.ItemId, { Pages: newPages });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.pages });
      qc.invalidateQueries({ queryKey: KEYS.versions });
    },
  });
}
