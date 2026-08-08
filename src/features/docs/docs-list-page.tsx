import { useState } from "react";
import { Link } from "react-router-dom";
import {
  MoreVertical,
  ExternalLink,
  Plus,
  Trash2,
  AlertCircle,
  FileText,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EmptyState } from "@/components/layout/empty-state";
import { ConfirmPopover } from "@/components/layout/confirm-popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import {
  useCreateDoc,
  useDeleteDoc,
  useListDocs,
} from "./hooks";
import { GraphQLError } from "@/features/data/gateway";
import { AddDocModal } from "./components/add-doc-modal";
import { AddVersionModal } from "./components/add-version-modal";
import type { Doc } from "./types";

/**
 * `/docs` — list of Docs. Each row has a dropdown menu (Open / Add
 * version / Delete) instead of inline buttons. The header has an "Add
 * doc" CTA that opens the `<AddDocModal>`.
 */
export function DocsListPage() {
  const list = useListDocs({
    paging: { pageNo: 1, pageSize: 50 },
    order: [{ direction: "DESC", field: "CreatedDate" }],
  });
  const create = useCreateDoc();
  const remove = useDeleteDoc();

  const [error, setError] = useState<string | null>(null);
  const [addDocOpen, setAddDocOpen] = useState(false);

  async function onDelete(itemId: string, docName: string) {
    setError(null);
    try {
      await remove.mutateAsync(itemId);
      toast.success(`Doc "${docName}" deleted`);
    } catch (err) {
      setError(formatError(err));
      toast.error(formatError(err));
    }
  }

  return (
    <div className="mx-auto max-w-3xl items-start justify-start space-y-4 px-3 pt-4">
      <header className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Docs</h1>
          <p className="text-sm text-muted-foreground">
            Documents, versions, and pages — backed by the Blocks data gateway.
          </p>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button onClick={() => setAddDocOpen(true)} size="sm">
              <Plus />
              Add doc
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Create a new doc</TooltipContent>
        </Tooltip>
      </header>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {list.isPending ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : list.error ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Failed to load: {formatError(list.error)}
          </AlertDescription>
        </Alert>
      ) : !list.data || list.data.items.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-10 w-10" />}
          title="No docs yet"
          description="Create your first documentation set above to get started."
          action={
            <Button onClick={() => setAddDocOpen(true)}>
              <Plus /> Add doc
            </Button>
          }
        />
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {list.data.items.map((doc) => (
            <DocRow
              key={doc.ItemId}
              doc={doc}
              onDelete={onDelete}
              deleting={remove.isPending}
            />
          ))}
        </ul>
      )}

      {list.data && (
        <p className="text-xs text-muted-foreground">
          {list.data.totalCount} total
        </p>
      )}

      <AddDocModal
        open={addDocOpen}
        onClose={() => setAddDocOpen(false)}
        onCreate={async (input) => {
          await create.mutateAsync(input);
        }}
      />
    </div>
  );
}

/** A single row in the docs list — link + per-row dropdown menu. */
function DocRow({
  doc,
  onDelete,
  deleting,
}: {
  doc: Doc;
  onDelete: (itemId: string, docName: string) => Promise<void>;
  deleting: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [addVersionOpen, setAddVersionOpen] = useState(false);

  return (
    <li className="flex items-center justify-between gap-3 p-4">
      <Link
        to={`/docs/${doc.ItemId}`}
        className="min-w-0 flex-1 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded"
      >
        <div className="block truncate font-medium hover:underline">
          {doc.Name}
        </div>
        {doc.Description && (
          <p className="truncate text-sm text-muted-foreground">
            {doc.Description}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          {doc.CurrentVersion ? (
            <>
              version{" "}
              <code className="font-mono">{short(doc.CurrentVersion)}</code>
            </>
          ) : (
            <span className="italic">no version yet</span>
          )}
          {doc.CreatedDate && <> · created {formatDate(doc.CreatedDate)}</>}
        </p>
      </Link>

      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                aria-label={`Actions for ${doc.Name}`}
                disabled={deleting}
              >
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="left">Doc actions</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem asChild>
            <Link to={`/docs/${doc.ItemId}`} className="cursor-pointer">
              <ExternalLink className="mr-2 h-3.5 w-3.5" />
              Open
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => setAddVersionOpen(true)}
            disabled={deleting}
          >
            <Layers className="mr-2 h-3.5 w-3.5" />
            Add version
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => setConfirmOpen(true)}
            disabled={deleting}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="mr-2 h-3.5 w-3.5" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmPopover
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Delete "${doc.Name}"?`}
        description="Removes the Doc, all its versions, and all pages."
        confirmLabel="Delete"
        destructive
        onConfirm={() => onDelete(doc.ItemId, doc.Name)}
      />
      <AddVersionModal
        open={addVersionOpen}
        onClose={() => setAddVersionOpen(false)}
        doc={doc}
      />
    </li>
  );
}

function short(id: string): string {
  return id.length > 8 ? `${id.slice(0, 4)}…${id.slice(-4)}` : id;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function formatError(err: unknown): string {
  if (err instanceof GraphQLError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}
