import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Menu, Pencil, X, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { GraphQLError } from "@/features/data/gateway";
import {
  useDeletePage,
  useGetDoc,
  useGetDocVersion,
  useGetPage,
  useListPageTitles,
  useUpdateDoc,
  useUpdateDocVersion,
  useUpdatePage,
} from "./hooks";
import { PageListSidebar } from "./components/page-list-sidebar";
import { PageContentView } from "./components/page-content-view";
import { AddPageModal } from "./components/add-page-modal";
import { EditDocModal } from "./components/edit-doc-modal";
import { useRecordRecentDoc } from "@/components/layout/breadcrumbs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type {
  DocUpdate,
  DocVersionUpdate,
  PageUpdate,
} from "./types";
import { useSidebarPrefs } from "@/components/layout/sidebar-prefs";
import { cn } from "@/lib/utils";

/**
 * `/docs/:docId` — read the Doc, its current DocVersion, and the Pages
 * that version owns. The page is laid out as a sidebar (page titles)
 * plus a main panel (the selected page's content).
 *
 * Header layout:
 *   [menu-toggle] [doc.Name ✎]
 *                  [doc.Description]
 *
 * The menu button (always visible) shows or hides the pages-list
 * sidebar. When the pages list is hidden, the grid becomes a single
 * column so the page content takes the full width.
 */
export const DocDetailPage = () => {
  const { docId } = useParams<{ docId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedPageId = searchParams.get("page");
  const [error, setError] = useState<string | null>(null);
  const [editDocOpen, setEditDocOpen] = useState(false);

  // ---- 1. The Doc itself. ----
  const docQuery = useGetDoc(docId ?? "");
  const doc = docQuery.data;

  // Record this doc in the "recent" list so the sidebar can show it.
  useRecordRecentDoc(doc?.ItemId, doc?.Name);

  // ---- 2. The current DocVersion. ----
  const versionQuery = useGetDocVersion(doc?.CurrentVersion ?? "");
  const version = versionQuery.data;

  // ---- 3. The Page ItemIds the version owns, in order. ----
  const pageIds = useMemo(() => version?.Pages ?? [], [version?.Pages]);

  // ---- 4. Page titles only — drives the sidebar. ----
  const titlesQuery = useListPageTitles(pageIds);
  const titlesById = useMemo<Map<string, string>>(() => {
    const map = new Map<string, string>();
    for (const t of titlesQuery.data ?? []) {
      map.set(t.ItemId, t.Title);
    }
    return map;
  }, [titlesQuery.data]);

  // ---- 5. Default selectedPage = first page id. ----
  const firstPageId = pageIds[0] ?? null;
  const selectedPageIsValid =
    selectedPageId !== null && pageIds.includes(selectedPageId);
  useEffect(() => {
    if (firstPageId && (selectedPageId === null || !selectedPageIsValid)) {
      const next = new URLSearchParams(searchParams);
      next.set("page", firstPageId);
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstPageId, selectedPageIsValid]);

  // ---- 6. The selected page's full record (drives the main panel). ----
  const selectedPageQuery = useGetPage(selectedPageId ?? "");
  const selectedPage = selectedPageQuery.data;

  // ---- mutations (all from ./hooks) ----
  const updateDocMut = useUpdateDoc();
  const updateVersion = useUpdateDocVersion();
  const deletePageMut = useDeletePage();
  const updatePageMut = useUpdatePage();

  // ---- collapse state for the page list ----
  const pageSidebarCollapsed = useSidebarPrefs((s) => s.pageSidebarCollapsed);
  const togglePageSidebar = useSidebarPrefs((s) => s.togglePageSidebar);

  // ---- handlers ----
  async function onSaveDoc(patch: DocUpdate) {
    if (!doc) throw new Error("No doc to save");
    await updateDocMut.mutateAsync({ docId: doc.ItemId, updates: patch });
  }

  async function onSavePage(
    pageId: string,
    updates: PageUpdate,
  ): Promise<void> {
    await updatePageMut.mutateAsync({ pageId, updates });
  }

  async function onReorderPages(newPageIds: string[]): Promise<void> {
    if (!version) throw new Error("No version to reorder pages in");
    await updateVersion.mutateAsync({
      versionId: version.ItemId,
      updates: { Pages: newPageIds } as DocVersionUpdate,
    });
  }

  async function onRemovePage() {
    if (!version || !selectedPage) return;
    setError(null);
    try {
      await deletePageMut.mutateAsync({
        pageId: selectedPage.ItemId,
        currentVersion: version,
      });
      toast.success(`Page "${selectedPage.Title}" deleted`);
    } catch (err) {
      setError(formatError(err));
      toast.error(formatError(err));
    }
  }

  function onSelectPage(id: string) {
    const next = new URLSearchParams(searchParams);
    next.set("page", id);
    setSearchParams(next);
  }

  function onPageAdded(newPageId: string) {
    const next = new URLSearchParams(searchParams);
    next.set("page", newPageId);
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

  if (!doc) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Doc not found.</AlertDescription>
        </Alert>
        <Button asChild variant="outline" size="sm">
          <Link to="/docs">
            <ArrowLeft /> Back to docs
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Doc header: [menu-toggle] [name ✎] / [description]. */}
      <div className="flex shrink-0 items-start gap-2 px-3 pt-3 pb-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={togglePageSidebar}
              aria-label={
                pageSidebarCollapsed ? "Show pages list" : "Hide pages list"
              }
            >
              {pageSidebarCollapsed ? (
                <Menu className="h-4 w-4" />
              ) : (
                <X className="h-4 w-4" />
              )}
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
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
              {doc.Description}
            </p>
          )}
        </div>
      </div>

      {error && (
        <Alert variant="destructive" className="mx-3 shrink-0">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Pages grid: when the page list is hidden, this becomes a
          single column so the page content takes the full width. */}
      {version && (
        <div
          className={cn(
            "grid min-h-0 flex-1 items-start gap-3 overflow-hidden p-3 pt-2",
            pageSidebarCollapsed
              ? "grid-cols-[minmax(0,1fr)]"
              : "grid-cols-[240px_minmax(0,1fr)]",
          )}
        >
          <AddPageModal.Provider>
            {!pageSidebarCollapsed && (
              <PageListSidebar
                version={version}
                pageIds={pageIds}
                titles={titlesById}
                selectedPageId={selectedPageId}
                onSelectPage={onSelectPage}
                onPageAdded={onPageAdded}
                onReorderPages={onReorderPages}
                titlesLoading={titlesQuery.isPending}
              />
            )}
            <PageContentView
              page={selectedPage}
              loading={selectedPageQuery.isPending}
              error={selectedPageQuery.error}
              onDelete={onRemovePage}
              onSave={onSavePage}
              deleting={deletePageMut.isPending}
              saving={updatePageMut.isPending}
            />
          </AddPageModal.Provider>
        </div>
      )}

      {doc && (
        <EditDocModal
          open={editDocOpen}
          onClose={() => setEditDocOpen(false)}
          doc={doc}
          onSave={onSaveDoc}
        />
      )}
    </div>
  );
};

function formatError(err: unknown): string {
  if (err instanceof GraphQLError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}
