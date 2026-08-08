import { useEffect, useState } from "react";
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
import type {} from "../../types";
import { useReorderPagesModal } from "./context";

export interface ReorderPagesModalRootProps {
  pageIds: string[];
  titles: ReadonlyMap<string, string>;
  /** Save the new ordering. Resolves when the mutation settles. */
  onSave: (newPageIds: string[]) => Promise<void>;
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
 * Reorder pages modal — drag-and-drop list of every page in the
 * version's `Pages` array. One `updateVersion` mutation persists the
 * whole new order on Save.
 */
export function ReorderPagesModalRoot({
  pageIds,
  titles,
  onSave,
}: ReorderPagesModalRootProps) {
  const { open, setOpen } = useReorderPagesModal();

  // Local working order; reset to `pageIds` whenever the modal opens
  // so navigating between pages while it's closed never leaves stale
  // state behind.
  const [order, setOrder] = useState<string[]>(pageIds);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setOrder(pageIds);
      setError(null);
      setSaving(false);
    }
  }, [open, pageIds]);

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

  const dirty = !arraysEqual(order, pageIds);

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
