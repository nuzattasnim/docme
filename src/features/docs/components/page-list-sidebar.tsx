import { Plus, ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { EmptyState } from "@/components/layout/empty-state";
import { AddPageModal } from "./add-page-modal";
import { ReorderPagesModal } from "./reorder-pages-modal";
import type { DocVersion } from "../types";

export interface PageListSidebarProps {
  version: DocVersion;
  pageIds: string[];
  titles: ReadonlyMap<string, string>;
  selectedPageId: string | null;
  onSelectPage: (pageId: string) => void;
  onPageAdded: (newPageId: string) => void;
  onReorderPages: (newPageIds: string[]) => Promise<void>;
  titlesLoading?: boolean;
}

/**
 * Pages nav for the DocDetailPage. Renders only when expanded —
 * the parent (`DocDetailPage`) hides this component entirely when
 * the sidebar is collapsed, so there's no shrunk icon-strip variant
 * here.
 *
 * Owns:
 *   - two icon-only buttons in the header: + (Add Page) and ⇅ (Reorder)
 *   - the ordered list of page titles
 *
 * The collapse trigger lives in the parent doc header (menu button).
 *
 * Selection + content rendering live in the parent (DocDetailPage).
 * The component fills its grid/flex cell height and provides its own
 * scrolling when the page list grows beyond the viewport.
 */
export function PageListSidebar({
  version,
  pageIds,
  titles,
  selectedPageId,
  onSelectPage,
  onPageAdded,
  onReorderPages,
  titlesLoading,
}: PageListSidebarProps) {
  return (
    <ReorderPagesModal.Provider>
      <Card className="flex h-full min-h-0 flex-col overflow-hidden">
        {/* Header */}
        <CardHeader className="flex shrink-0 flex-row items-center justify-between gap-2 border-b space-y-0 py-3 px-3">
          <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Pages ({pageIds.length})
          </CardTitle>
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <AddPageModal.Trigger>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    aria-label="Add page"
                  >
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
                    disabled={pageIds.length < 2}
                    aria-label="Reorder pages"
                  >
                    <ArrowUpDown className="h-4 w-4" />
                  </Button>
                </ReorderPagesModal.Trigger>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {pageIds.length < 2
                  ? "Need at least 2 pages to reorder"
                  : "Reorder pages"}
              </TooltipContent>
            </Tooltip>
          </div>
        </CardHeader>

        {/* Body — own scroll container with a thin webkit scrollbar. */}
        <CardContent className="thin-scrollbar flex-1 min-h-0 overflow-y-auto p-2">
          {titlesLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-7 w-full" />
              <Skeleton className="h-7 w-full" />
              <Skeleton className="h-7 w-full" />
            </div>
          ) : pageIds.length === 0 ? (
            <EmptyState
              title="No pages yet"
              description="Click + above to create one."
              className="border-0 bg-transparent p-3"
            />
          ) : (
            <ol className="space-y-1">
              {pageIds.map((id, idx) => {
                const title = titles.get(id);
                const isSelected = id === selectedPageId;
                return (
                  <li key={id}>
                    <button
                      type="button"
                      onClick={() => onSelectPage(id)}
                      aria-current={isSelected ? "page" : undefined}
                      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                        isSelected
                          ? "bg-accent font-medium text-accent-foreground"
                          : "hover:bg-accent/60"
                      }`}
                    >
                      <span className="w-5 shrink-0 text-right text-xs text-muted-foreground">
                        {idx + 1}.
                      </span>
                      <span className="truncate">
                        {title ?? (
                          <span className="italic text-muted-foreground">
                            (loading)
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
        </CardContent>

        <AddPageModal.Root version={version} onPageAdded={onPageAdded} />
        <ReorderPagesModal.Root
          pageIds={pageIds}
          titles={titles}
          onSave={onReorderPages}
        />
      </Card>
    </ReorderPagesModal.Provider>
  );
}
