/**
 * TanStack Query hooks over the docme services.
 *
 * - Queries retry up to 3 times with exponential backoff (C12); a still
 *   failing query surfaces `error` for an Alert with Retry.
 * - Mutations never retry automatically. Resumable operations (duplicate,
 *   cascade delete, migration) expose an explicit, idempotent Retry instead.
 * - Business logic lives in services.ts; hooks only wire caching.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addPage,
  createBlankVersion,
  createDoc,
  deleteDocCascade,
  deletePage,
  deleteVersion,
  duplicateVersion,
  ensureFirstVersion,
  getDoc,
  getDocVersion,
  getPage,
  listDocs,
  listLegacyPageSummaries,
  listPageSummaries,
  listVersions,
  publishVersion,
  reorderPages,
  resumeDuplicate,
  setCurrentVersion,
  setVersionActive,
  unpublishVersion,
  updateDoc,
  updatePage,
  type CopyProgress,
  type ListDocsOptions,
} from "./services";
import type { DocUpdate, PageUpdate } from "./types";
import { useRecentDocs } from "./recent-docs";
import { isDocmeDataError } from "@/features/data/errors";

export const KEYS = {
  docs: ["docs"] as const,
  docList: (opts: ListDocsOptions) => ["docs", "list", opts] as const,
  doc: (docId: string) => ["docs", "one", docId] as const,
  versions: ["versions"] as const,
  versionsOfDoc: (docId: string) => ["versions", "byDoc", docId] as const,
  version: (versionId: string) => ["versions", "one", versionId] as const,
  pages: ["pages"] as const,
  pageSummaries: (versionId: string) => ["pages", "summaries", versionId] as const,
  legacyPageSummaries: (ids: readonly string[]) => ["pages", "legacy", ids.join(",")] as const,
  page: (pageId: string) => ["pages", "one", pageId] as const,
};

/** Up to 3 retries, but never for a rule refusal: it won't change (SPEC2 §5). */
const QUERY_RETRY = (failureCount: number, error: unknown) =>
  !isDocmeDataError(error, "Forbidden") && failureCount < 3;

function useInvalidate() {
  const qc = useQueryClient();
  return (...keys: ReadonlyArray<readonly unknown[]>) =>
    Promise.all(keys.map((queryKey) => qc.invalidateQueries({ queryKey })));
}

// ==========================================
// Docs
// ==========================================

export function useListDocs(opts: ListDocsOptions = {}) {
  return useQuery({
    queryKey: KEYS.docList(opts),
    queryFn: () => listDocs(opts),
    retry: QUERY_RETRY,
  });
}

export function useGetDoc(docId: string) {
  return useQuery({
    queryKey: KEYS.doc(docId),
    queryFn: () => getDoc(docId),
    enabled: !!docId,
    retry: QUERY_RETRY,
  });
}

export function useCreateDoc() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: createDoc,
    onSettled: () => invalidate(KEYS.docs, KEYS.versions),
  });
}

export function useEnsureFirstVersion() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (docId: string) => ensureFirstVersion(docId),
    onSettled: () => invalidate(KEYS.docs, KEYS.versions),
  });
}

export function useUpdateDoc() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ docId, updates }: { docId: string; updates: DocUpdate }) =>
      updateDoc(docId, updates),
    onSettled: () => invalidate(KEYS.docs),
  });
}

/** Cascade delete. Safe to call again on a doc stuck in "Deleting". */
export function useDeleteDoc() {
  const invalidate = useInvalidate();
  const removeRecent = useRecentDocs((s) => s.remove);
  return useMutation({
    mutationFn: (docId: string) => deleteDocCascade(docId),
    onSuccess: (_data, docId) => removeRecent(docId),
    onSettled: () => invalidate(KEYS.docs, KEYS.versions, KEYS.pages),
  });
}

// ==========================================
// Versions
// ==========================================

export function useGetDocVersion(versionId: string) {
  return useQuery({
    queryKey: KEYS.version(versionId),
    queryFn: () => getDocVersion(versionId),
    enabled: !!versionId,
    retry: QUERY_RETRY,
  });
}

export function useListVersions(docId: string, enabled = true) {
  return useQuery({
    queryKey: KEYS.versionsOfDoc(docId),
    queryFn: () => listVersions(docId),
    enabled: !!docId && enabled,
    retry: QUERY_RETRY,
  });
}

export function useDuplicateVersion() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({
      onProgress,
      ...input
    }: {
      docId: string;
      sourceVersionId: string;
      label: string;
      onProgress?: CopyProgress;
    }) => duplicateVersion(input, onProgress),
    onSettled: () => invalidate(KEYS.docs, KEYS.versions, KEYS.pages),
  });
}

export function useResumeDuplicate() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ versionId, onProgress }: { versionId: string; onProgress?: CopyProgress }) =>
      resumeDuplicate(versionId, onProgress),
    onSettled: () => invalidate(KEYS.docs, KEYS.versions, KEYS.pages),
  });
}

export function useCreateBlankVersion() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: createBlankVersion,
    onSettled: () => invalidate(KEYS.docs, KEYS.versions),
  });
}

export function useDeleteVersion() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: deleteVersion,
    onSettled: () => invalidate(KEYS.versions, KEYS.pages),
  });
}

export function usePublishVersion() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: publishVersion,
    onSettled: () => invalidate(KEYS.docs, KEYS.versions),
  });
}

export function useUnpublishVersion() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (versionId: string) => unpublishVersion(versionId),
    onSettled: () => invalidate(KEYS.versions),
  });
}

export function useSetVersionActive() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ versionId, isActive }: { versionId: string; isActive: boolean }) =>
      setVersionActive(versionId, isActive),
    onSettled: () => invalidate(KEYS.versions),
  });
}

export function useSetCurrentVersion() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ docId, versionId }: { docId: string; versionId: string }) =>
      setCurrentVersion(docId, versionId),
    onSettled: () => invalidate(KEYS.docs),
  });
}

// ==========================================
// Pages
// ==========================================

/** The page list for a v2 version: titles and order only, never Content. */
export function useListPageSummaries(versionId: string, enabled = true) {
  return useQuery({
    queryKey: KEYS.pageSummaries(versionId),
    queryFn: () => listPageSummaries(versionId),
    enabled: !!versionId && enabled,
    retry: QUERY_RETRY,
  });
}

/** Read-only titles for an unmigrated version, in its legacy order. */
export function useListLegacyPageSummaries(pageIds: readonly string[], enabled = true) {
  return useQuery({
    queryKey: KEYS.legacyPageSummaries(pageIds),
    queryFn: () => listLegacyPageSummaries(pageIds),
    enabled: enabled && pageIds.length > 0,
    retry: QUERY_RETRY,
  });
}

export function useGetPage(pageId: string) {
  return useQuery({
    queryKey: KEYS.page(pageId),
    queryFn: () => getPage(pageId),
    enabled: !!pageId,
    retry: QUERY_RETRY,
  });
}

export function useAddPage() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: addPage,
    onSettled: (_id, _err, vars) => invalidate(KEYS.pageSummaries(vars.versionId)),
  });
}

export function useUpdatePage() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ pageId, updates }: { pageId: string; updates: PageUpdate }) =>
      updatePage(pageId, updates),
    onSettled: () => invalidate(KEYS.pages),
  });
}

export function useDeletePage() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (pageId: string) => deletePage(pageId),
    onSettled: () => invalidate(KEYS.pages),
  });
}

export function useReorderPages() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: reorderPages,
    onSettled: (_r, _e, vars) => invalidate(KEYS.pageSummaries(vars.versionId)),
  });
}
