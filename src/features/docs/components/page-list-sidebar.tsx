import { Plus, ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { EmptyState } from "@/components/layout/empty-state";
import { AddPageModal } from "./add-page-modal";
import { ReorderPagesModal } from "./reorder-pages-modal";
import type { PageSummary } from "../types";

export interface PageListSidebarProps {
  docId: string;
  versionId: string;
  /** Already in display order (SortOrder, CreatedDate, ItemId). */
  pages: readonly PageSummary[];
  /** Hide add / reorder for versions that can't be edited (C8). */
  readOnly?: boolean;
  selectedPageId: string | null;
  onSelectPage: (pageId: string) => void;
  onPageAdded: (newPageId: string) => void;
  onReorderPages: (orderedIds: string[]) => Promise<void>;
  pagesLoading?: boolean;
}

/**
 * Pages nav for the DocDetailPage: the ordered page titles plus Add and
 * Reorder buttons. The parent hides the whole component when collapsed.
 */
export function PageListSidebar({
  docId,
  versionId,
  pages,
  readOnly,
  selectedPageId,
  onSelectPage,
  onPageAdded,
  onReorderPages,
  pagesLoading,
}: PageListSidebarProps) {
  return (
    <ReorderPagesModal.Provider>
      <Card className="flex h-full min-h-0 flex-col overflow-hidden">
        <CardHeader className="flex shrink-0 flex-row items-center justify-between gap-2 border-b space-y-0 py-3 px-3">
          <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Pages ({pages.length})
          </CardTitle>
          {!readOnly && (
            <div className="flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <AddPageModal.Trigger>
                    <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Add page">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </AddPageModal.Trigger>
                </TooltipTrigger>
                <TooltipContent side="bottom">Add page</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <ReorderPagesModal.Trigger>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      disabled={pages.length < 2}
                      aria-label="Reorder pages"
                    >
                      <ArrowUpDown className="h-4 w-4" />
                    </Button>
                  </ReorderPagesModal.Trigger>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {pages.length < 2 ? "Need at least 2 pages to reorder" : "Reorder pages"}
                </TooltipContent>
              </Tooltip>
            </div>
          )}
        </CardHeader>

        <CardContent className="thin-scrollbar flex-1 min-h-0 overflow-y-auto p-2">
          {pagesLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-7 w-full" />
              <Skeleton className="h-7 w-full" />
              <Skeleton className="h-7 w-full" />
            </div>
          ) : pages.length === 0 ? (
            <EmptyState
              title="No pages yet"
              description={readOnly ? "This version has no pages." : "Click + above to create one."}
              className="border-0 bg-transparent p-3"
            />
          ) : (
            <ol className="space-y-1">
              {pages.map((page, idx) => {
                const isSelected = page.ItemId === selectedPageId;
                return (
                  <li key={page.ItemId}>
                    <button
                      type="button"
                      onClick={() => onSelectPage(page.ItemId)}
                      aria-current={isSelected ? "page" : undefined}
                      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                        isSelected ? "bg-accent font-medium text-accent-foreground" : "hover:bg-accent/60"
                      }`}
                    >
                      <span className="w-5 shrink-0 text-right text-xs text-muted-foreground">
                        {idx + 1}.
                      </span>
                      <span className="truncate">{page.Title}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
        </CardContent>

        {!readOnly && (
          <>
            <AddPageModal.Root docId={docId} versionId={versionId} onPageAdded={onPageAdded} />
            <ReorderPagesModal.Root pages={pages} onSave={onReorderPages} />
          </>
        )}
      </Card>
    </ReorderPagesModal.Provider>
  );
}
