import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/**
 * ConfirmPopover — replaces native `window.confirm()` with a styled
 * in-app popover. Use for destructive actions (delete doc, delete page,
 * delete version) so the user never sees a browser-styled dialog.
 *
 * Works in two modes:
 *   - Uncontrolled: pass `trigger` only. Clicking the trigger opens
 *     the popover.
 *   - Controlled: pass `open` + `onOpenChange`. Use this when the
 *     trigger lives inside another popover/menu (e.g. a
 *     `<DropdownMenu>` item) and you need the parent to coordinate
 *     open/close.
 *
 *   <ConfirmPopover
 *     trigger={<Button variant="ghost">Delete</Button>}
 *     title="Delete this doc?"
 *     confirmLabel="Delete"
 *     destructive
 *     onConfirm={() => deleteMutation.mutate(...)}
 *   />
 *
 *   <ConfirmPopover
 *     open={confirmOpen}
 *     onOpenChange={setConfirmOpen}
 *     title="..."
 *     onConfirm={...}
 *   />
 */
export interface ConfirmPopoverProps {
  /** Uncontrolled trigger — a single clickable React element. */
  trigger?: ReactNode;
  /** Controlled open state. */
  open?: boolean;
  /** Required when `open` is provided. */
  onOpenChange?: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
  /** Render the trigger as disabled (e.g. while a mutation is in flight). */
  disabled?: boolean;
}

export function ConfirmPopover({
  trigger,
  open: controlledOpen,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
  disabled,
}: ConfirmPopoverProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [pending, setPending] = useState(false);

  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;

  function setOpen(next: boolean) {
    onOpenChange?.(next);
    if (!isControlled) setInternalOpen(next);
  }

  async function handleConfirm() {
    try {
      setPending(true);
      await onConfirm();
      setOpen(false);
    } finally {
      setPending(false);
    }
  }

  if (!trigger && !isControlled) {
    throw new Error(
      "ConfirmPopover: provide either `trigger` (uncontrolled) or `open` + `onOpenChange` (controlled).",
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {trigger && (
        <PopoverTrigger asChild>
          {/* The trigger is wrapped in a span so the Popover still works
              when the trigger is a disabled button (which Radix won't
              open from). */}
          <span
            className={disabled ? "pointer-events-none opacity-50" : ""}
          >
            {trigger}
          </span>
        </PopoverTrigger>
      )}
      <PopoverContent align="end" className="w-80">
        <div className="space-y-3">
          <div className="space-y-1">
            <h4 className="text-sm font-semibold">{title}</h4>
            {description && (
              <p className="text-sm text-muted-foreground">{description}</p>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              {cancelLabel}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={destructive ? "destructive" : "default"}
              onClick={handleConfirm}
              disabled={pending}
            >
              {pending ? "Working…" : confirmLabel}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
