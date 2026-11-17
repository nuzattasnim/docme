import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, Menu, Pencil, X, ArrowLeft, Layers, RotateCw } from "lucide-react";
import { toast } from "sonner";
import { errorMessage } from "@/features/data/errors";
import {
  useDeleteDoc,
  useDeletePage,
  useEnsureFirstVersion,
  useGetDoc,
  useGetDocVersion,
  useGetPage,
  useListLegacyPageSummaries,
  useListPageSummaries,
  useReorderPages,
  useUpdateDoc,
  useUpdatePage,
} from "./hooks";
import { PageListSidebar } from "./components/page-list-sidebar";
import { PageContentView } from "./components/page-content-view";
import { AddPageModal } from "./components/add-page-modal";
import { EditDocModal } from "./components/edit-doc-modal";
import { VersionsDialog } from "./components/versions-dialog";
import { VersionStateAlert, VersionStateBadge } from "./components/version-state";
import { QueryErrorAlert } from "./components/query-error-alert";
import { useRecordRecentDoc } from "@/components/layout/breadcrumbs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  CURRENT_SCHEMA_VERSION,
  docStatus,
  versionState,
  type DocUpdate,
  type PageUpdate,
} from "./types";
import { useSidebarPrefs } from "@/components/layout/sidebar-prefs";
import { cn } from "@/lib/utils";
import { perfMark, perfMeasure } from "@/lib/perf";

/**
 * `/docs/:docId` — the Doc, its current DocVersion, and that version's pages.
 *
 * Requests before the page list is visible (J1): Doc, DocVersion, page
 * summaries (no Content). The selected page's content is a fourth, separate
 * request (J2).
 *
 * Non-editable states:
 *   - Doc.Status "Deleting"           → Alert + Retry delete; nothing editable (C4)
 *   - no CurrentVersion               → "Create first version" (C1)
 *   - legacy / copying / copy failed  → read-only Alert, page controls hidden (C8, C2)
 */
export const DocDetailPage = () => {
  const { docId = "" } = useParams<{ docId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedPageId = searchParams.get("page");
  const [editDocOpen, setEditDocOpen] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);

  useEffect(() => {
    perfMark("doc-open:start");
  }, [docId]);

  const docQuery = useGetDoc(docId);
  const doc = docQuery.data ?? undefined;
  useRecordRecentDoc(doc?.ItemId, doc?.Name);

  const deleting = doc ? docStatus(doc) === "Deleting" : false;
  const versionQuery = useGetDocVersion(deleting ? "" : (doc?.CurrentVersion ?? ""));
  const version = versionQuery.data ?? undefined;
  const state = version ? versionState(version) : undefined;
  const editable = state === "ready";
  const isLegacy = version ? version.SchemaVersion !== CURRENT_SCHEMA_VERSION : false;

  const summariesQuery = useListPageSummaries(version?.ItemId ?? "", !!version && !isLegacy);
  const legacyIds = useMemo(() => (isLegacy ? (version?.Pages ?? []) : []), [isLegacy, version?.Pages]);
  const legacyQuery = useListLegacyPageSummaries(legacyIds, isLegacy);
  const pagesQuery = isLegacy ? legacyQuery : summariesQuery;
  const pages = useMemo(() => pagesQuery.data ?? [], [pagesQuery.data]);
  const pagesLoading = isLegacy ? legacyIds.length > 0 && legacyQuery.isPending : summariesQuery.isPending;

  useEffect(() => {
    if (version && !pagesLoading) perfMeasure("doc-open", "doc-open:start", "doc-open:list-visible");
  }, [version, pagesLoading]);

  // Default selection = first page; drop a selection that isn't in this version.
  const pageIds = useMemo(() => pages.map((p) => p.ItemId), [pages]);
  const firstPageId = pageIds[0] ?? null;
  const selectedPageIsValid = selectedPageId !== null && pageIds.includes(selectedPageId);
  useEffect(() => {
    if (pagesLoading) return;
    if (firstPageId && !selectedPageIsValid) {
      const next = new URLSearchParams(searchParams);
      next.set("page", firstPageId);
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstPageId, selectedPageIsValid, pagesLoading]);

  const activePageId = selectedPageIsValid ? selectedPageId : null;
  const selectedPageQuery = useGetPage(activePageId ?? "");
  const selectedPage = selectedPageQuery.data ?? undefined;
  useEffect(() => {
    if (selectedPage) perfMeasure("page-content", "page:select", "page:content-visible");
  }, [selectedPage]);

  const updateDocMut = useUpdateDoc();
  const deletePageMut = useDeletePage();
  const updatePageMut = useUpdatePage();
  const reorderMut = useReorderPages();

  const pageSidebarCollapsed = useSidebarPrefs((s) => s.pageSidebarCollapsed);
  const togglePageSidebar = useSidebarPrefs((s) => s.togglePageSidebar);

  async function onSaveDoc(patch: DocUpdate) {
    if (!doc) throw new Error("No doc to save");
    await updateDocMut.mutateAsync({ docId: doc.ItemId, updates: patch });
  }

  async function onSavePage(pageId: string, updates: PageUpdate): Promise<void> {
    await updatePageMut.mutateAsync({ pageId, updates });
  }

  async function onReorderPages(orderedIds: string[]): Promise<void> {
    if (!version) throw new Error("No version to reorder pages in");
    await reorderMut.mutateAsync({ versionId: version.ItemId, orderedIds });
  }

  async function onRemovePage() {
    if (!selectedPage) return;
    try {
      await deletePageMut.mutateAsync(selectedPage.ItemId);
      toast.success(`Page "${selectedPage.Title}" deleted`);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  function selectPage(id: string) {
    perfMark("page:select");
    const next = new URLSearchParams(searchParams);
    next.set("page", id);
    setSearchParams(next);
  }

  // ---- render ----

  if (docQuery.isPending) {
    return (
      <div className="flex h-full flex-col gap-3 p-3">
        <Skeleton className="h-8 w-1/3 shrink-0" />
        <Skeleton className="h-full w-full" />
      </div>
    );
  }

  if (docQuery.error) {
    return (
      <PageMessage>
        <QueryErrorAlert
          message={`Failed to load doc: ${errorMessage(docQuery.error)}`}
          onRetry={() => docQuery.refetch()}
        />
      </PageMessage>
    );
  }

  if (!doc) {
    return (
      <PageMessage>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Doc not found.</AlertDescription>
        </Alert>
      </PageMessage>
    );
  }

  if (deleting) {
    return (
      <PageMessage>
        <DeletionIncompleteAlert docId={doc.ItemId} name={doc.Name} />
      </PageMessage>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-start gap-2 px-3 pt-3 pb-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={togglePageSidebar}
              aria-label={pageSidebarCollapsed ? "Show pages list" : "Hide pages list"}
            >
              {pageSidebarCollapsed ? <Menu className="h-4 w-4" /> : <X className="h-4 w-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {pageSidebarCollapsed ? "Show pages list" : "Hide pages list"}
          </TooltipContent>
        </Tooltip>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h1 className="truncate text-lg font-semibold">{doc.Name}</h1>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={() => setEditDocOpen(true)}
                  aria-label="Edit doc details"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Edit doc details</TooltipContent>
            </Tooltip>
          </div>
          {doc.Description && (
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{doc.Description}</p>
          )}
        </div>

        {version && (
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => setVersionsOpen(true)}
            aria-label={`Versions — current ${version.Version ?? "untitled"}`}
          >
            <Layers className="h-3.5 w-3.5" />
            <span className="font-mono">{version.Version ?? "—"}</span>
            <VersionStateBadge version={version} />
          </Button>
        )}
      </div>

      {!doc.CurrentVersion ? (
        <PageMessage>
          <NoVersionState docId={doc.ItemId} />
        </PageMessage>
      ) : versionQuery.isPending ? (
        <div className="p-3">
          <Skeleton className="h-full min-h-40 w-full" />
        </div>
      ) : versionQuery.error ? (
        <PageMessage>
          <QueryErrorAlert
            message={`Failed to load version: ${errorMessage(versionQuery.error)}`}
            onRetry={() => versionQuery.refetch()}
          />
        </PageMessage>
      ) : !version ? (
        <PageMessage>
          <NoVersionState docId={doc.ItemId} missing />
        </PageMessage>
      ) : (
        <>
          {!editable && <VersionStateAlert version={version} className="mx-3 w-auto shrink-0" />}
          {pagesQuery.error && (
            <div className="mx-3 shrink-0">
              <QueryErrorAlert
                message={`Failed to load pages: ${errorMessage(pagesQuery.error)}`}
                onRetry={() => pagesQuery.refetch()}
              />
            </div>
          )}
          <div
            className={cn(
              "grid min-h-0 flex-1 items-start gap-3 overflow-hidden p-3 pt-2",
              pageSidebarCollapsed ? "grid-cols-[minmax(0,1fr)]" : "grid-cols-[240px_minmax(0,1fr)]",
            )}
          >
            <AddPageModal.Provider>
              {!pageSidebarCollapsed && (
                <PageListSidebar
                  docId={doc.ItemId}
                  versionId={version.ItemId}
                  pages={pages}
                  readOnly={!editable}
                  selectedPageId={activePageId}
                  onSelectPage={selectPage}
                  onPageAdded={selectPage}
                  onReorderPages={onReorderPages}
                  pagesLoading={pagesLoading}
                />
              )}
              {pages.length === 0 && !pagesLoading ? (
                <EmptyPagesHint readOnly={!editable} />
              ) : (
                <PageContentView
                  page={selectedPage}
                  loading={!activePageId || selectedPageQuery.isPending}
                  error={selectedPageQuery.error}
                  onRetry={() => selectedPageQuery.refetch()}
                  readOnly={!editable}
                  onDelete={onRemovePage}
                  onSave={onSavePage}
                  deleting={deletePageMut.isPending}
                  saving={updatePageMut.isPending}
                />
              )}
            </AddPageModal.Provider>
          </div>
        </>
      )}

      <EditDocModal
        open={editDocOpen}
        onClose={() => setEditDocOpen(false)}
        doc={doc}
        onSave={onSaveDoc}
      />
      <VersionsDialog open={versionsOpen} onClose={() => setVersionsOpen(false)} doc={doc} />
    </div>
  );
};

function PageMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-6">
      {children}
      <Button asChild variant="outline" size="sm">
        <Link to="/docs">
          <ArrowLeft /> Back to docs
        </Link>
      </Button>
    </div>
  );
}

function EmptyPagesHint({ readOnly }: { readOnly: boolean }) {
  return (
    <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
      {readOnly ? "This version has no pages." : "No pages yet. Click + in the pages list to add one."}
    </div>
  );
}

/** C1 — a doc whose creation stopped before it got a version. */
function NoVersionState({ docId, missing }: { docId: string; missing?: boolean }) {
  const ensure = useEnsureFirstVersion();
  async function onCreate() {
    try {
      await ensure.mutateAsync(docId);
      toast.success("First version ready");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }
  return (
    <Alert>
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>{missing ? "This doc's current version is missing" : "This doc has no version yet"}</AlertTitle>
      <AlertDescription className="space-y-3">
        <p>Create its first version to start adding pages.</p>
        <Button size="sm" onClick={onCreate} disabled={ensure.isPending}>
          {ensure.isPending ? "Creating…" : "Create first version"}
        </Button>
      </AlertDescription>
    </Alert>
  );
}

/** C4 — the cascade delete stopped partway. Retry finishes it. */
function DeletionIncompleteAlert({ docId, name }: { docId: string; name: string }) {
  const remove = useDeleteDoc();
  async function onRetry() {
    try {
      await remove.mutateAsync(docId);
      toast.success(`Doc "${name}" deleted`);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }
  return (
    <Alert variant="destructive">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>Deletion incomplete</AlertTitle>
      <AlertDescription className="space-y-3">
        <p>"{name}" is partly deleted and can't be edited. Retry to finish deleting it.</p>
        <Button size="sm" variant="outline" onClick={onRetry} disabled={remove.isPending}>
          <RotateCw className="h-3.5 w-3.5" /> {remove.isPending ? "Deleting…" : "Retry delete"}
        </Button>
      </AlertDescription>
    </Alert>
  );
}
