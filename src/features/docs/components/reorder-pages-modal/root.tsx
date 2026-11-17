import { useEffect, useRef, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, AlertCircle } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import type { PageSummary } from "../../types";
import { useReorderPagesModal } from "./context";

export interface ReorderPagesModalRootProps {
  /** The version's pages, in display order. */
  pages: readonly PageSummary[];
  /** Save the new ordering. Rejects if any page move failed. */
  onSave: (orderedIds: string[]) => Promise<void>;
}

interface SortableRowProps {
  id: string;
  index: number;
  title: string;
}

/** One draggable row in the modal list. */
function SortableRow({ id, index, title }: SortableRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm ${
        isDragging ? "z-10 shadow-md" : ""
      }`}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`Drag handle for "${title}"`}
        className="cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="w-6 shrink-0 text-right text-xs text-muted-foreground">
        {index + 1}.
      </span>
      <span className="truncate">{title}</span>
    </li>
  );
}

/**
 * Reorder pages modal — drag-and-drop list of the version's pages. Save
 * writes SortOrder only on the pages that moved (services.reorderPages).
 *
 * If some writes fail, the modal stays open with an Alert and keeps the
 * user's order (C6); saving again applies only the writes still needed.
 */
export function ReorderPagesModalRoot({ pages, onSave }: ReorderPagesModalRootProps) {
  const { open, setOpen } = useReorderPagesModal();
  const pageIds = pages.map((p) => p.ItemId);
  const titles = new Map(pages.map((p) => [p.ItemId, p.Title]));

  // Local working order. It is seeded only when the modal opens, so a refetch
  // of the page list after a partial failure never discards the user's order.
  const [order, setOrder] = useState<string[]>(pageIds);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (open && !wasOpen.current) {
      setOrder(pages.map((p) => p.ItemId));
      setError(null);
      setSaving(false);
    }
    wasOpen.current = open;
  }, [open, pages]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      // Avoid hijacking clicks; only kick off drag after a small move.
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = order.indexOf(String(active.id));
    const newIndex = order.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    setOrder((prev) => arrayMove(prev, oldIndex, newIndex));
  }

  // After a partial failure the stored order may already match some of the
  // user's order; keep Save enabled while an error is shown so they can finish.
  const dirty = !arraysEqual(order, pageIds) || error !== null;

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await onSave(order);
      toast.success("Page order saved");
      setOpen(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setOrder(pageIds);
    setOpen(false);
  }

  return (
    <Dialog
      isOpen={open}
      onClose={handleCancel}
      title="Reorder pages"
      description="Drag the rows to set the new order, then click Save."
      maxWidthClass="max-w-lg"
    >
      {order.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          There are no pages to reorder.
        </p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={order} strategy={verticalListSortingStrategy}>
            <ol className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
              {order.map((id, idx) => (
                <SortableRow
                  key={id}
                  id={id}
                  index={idx}
                  title={titles.get(id) ?? "(loading)"}
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      )}

      {error && (
        <Alert variant="destructive" className="mt-4">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="mt-6 flex items-center justify-end gap-3 border-t pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={handleCancel}
          disabled={saving}
        >
          Cancel
        </Button>
        <Button
          type="button"
          onClick={handleSave}
          disabled={saving || !dirty || order.length === 0}
        >
          {saving ? "Saving…" : "Save order"}
        </Button>
      </div>
    </Dialog>
  );
}

function arraysEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
