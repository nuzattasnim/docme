import {
  Pencil,
  Trash2,
  AlertCircle,
  MoreVertical,
  RotateCw,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PageToc } from "./page-toc";
import { EditPageModal } from "./edit-page-modal";
import { getContentRenderer } from "../content-renderers";
import { extractSections } from "@/lib/slugify";
import type { Page, PageUpdate } from "../types";
import { cn } from "@/lib/utils";

export interface PageContentViewProps {
  page: Page | undefined;
  loading?: boolean;
  error?: unknown;
  /** Re-run the failed page query (C12). */
  onRetry?: () => void;
  /** Hide Edit/Delete for versions that can't be edited (C8). */
  readOnly?: boolean;
  onDelete: () => Promise<void>;
  onSave: (pageId: string, updates: PageUpdate) => Promise<void>;
  deleting?: boolean;
  saving?: boolean;
}

/**
 * Renders the full record of the currently-selected page — title
 * header, an Edit/Delete menu (DropdownMenu), the content via the
 * renderer registry, and an optional on-this-page TOC when the page
 * has h2/h3 headings.
 *
 * The whole card scrolls internally; the page detail layout uses
 * CSS grid + `min-h-0` so the column height is bounded.
 */
export function PageContentView({
  page,
  loading,
  error,
  onRetry,
  readOnly,
  onDelete,
  onSave,
  deleting,
  saving,
}: PageContentViewProps) {
  const [editOpen, setEditOpen] = useState(false);

  if (loading) {
    return (
      <Card className="flex h-full min-h-0 flex-col overflow-hidden">
        <CardHeader className="shrink-0 py-3">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-3 w-1/3" />
        </CardHeader>
        <CardContent className="flex-1 space-y-2 overflow-y-auto">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
          <span>Failed to load page: {formatError(error)}</span>
          {onRetry && (
            <Button size="sm" variant="outline" onClick={onRetry}>
              <RotateCw className="h-3.5 w-3.5" /> Retry
            </Button>
          )}
        </AlertDescription>
      </Alert>
    );
  }

  if (!page) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Page not found (it may have been deleted).
        </CardContent>
      </Card>
    );
  }

  const Renderer = getContentRenderer(page.ContentType);
  const sections = extractSections(page.Content);
  const showToc = sections.length > 0;

  return (
    <div
      className={cn(
        "grid h-full min-h-0 items-start gap-4",
        showToc ? "grid-cols-1 xl:grid-cols-[1fr_200px]" : "grid-cols-1",
      )}
    >
      <Card className="flex h-full min-h-0 flex-col overflow-hidden">
        <CardHeader className="shrink-0 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <CardTitle className="text-base">{page.Title}</CardTitle>
              <p className="text-xs text-muted-foreground">
                ContentType:{" "}
                <code className="font-mono">
                  {page.ContentType ?? "—"}
                </code>
                {page.CreatedDate && (
                  <> · created {formatDate(page.CreatedDate)}</>
                )}
              </p>
            </div>
            {!readOnly && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  disabled={saving || deleting}
                  aria-label="Page actions"
                >
                  <MoreVertical className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem
                  onSelect={() => setEditOpen(true)}
                  disabled={saving}
                >
                  <Pencil className="mr-2 h-3.5 w-3.5" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={onDelete}
                  disabled={deleting}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 h-3.5 w-3.5" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            )}
          </div>
        </CardHeader>
        <CardContent className="flex-1 min-h-0 overflow-y-auto">
          {page.Content ? (
            <Renderer content={page.Content} />
          ) : (
            <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
              This page has no content yet.
            </div>
          )}
        </CardContent>
      </Card>

      {showToc && <PageToc sections={sections} />}

      {!readOnly && (
      <EditPageModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        page={page}
        onSave={onSave}
      />
      )}
    </div>
  );
}

function formatError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}
