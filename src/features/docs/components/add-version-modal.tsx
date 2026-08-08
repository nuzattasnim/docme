import { useEffect, useState, type FormEvent } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Copy, FilePlus } from "lucide-react";
import { toast } from "sonner";
import {
  useCreateDocVersion,
  useGetDocVersion,
} from "../hooks";
import type { Doc, DocVersion } from "../types";

export interface AddVersionModalProps {
  open: boolean;
  onClose: () => void;
  doc: Doc;
}

type VersionMode = "duplicate" | "blank";

/**
 * AddVersionModal — creates a new DocVersion on an existing Doc.
 * Inputs map to `useCreateDocVersion`:
 *
 *   { docId, version, previousVersion }
 *
 * - "duplicate" → previousVersion is the current version (copies its
 *   pages list onto the new version).
 * - "blank"     → previousVersion is a fabricated DocVersion with an
 *   empty Pages array. The hook copies `[]` and the new version
 *   starts with no pages.
 *
 * On success the hook auto-points `Doc.CurrentVersion` at the new
 * DocVersion, so the doc detail page opens on the new version.
 */
export function AddVersionModal({ open, onClose, doc }: AddVersionModalProps) {
  const [label, setLabel] = useState("");
  const [mode, setMode] = useState<VersionMode>("duplicate");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createVersion = useCreateDocVersion();

  // Fetch the current version only when we're going to duplicate —
  // saves a network round-trip for blank mode.
  const shouldFetch = open && mode === "duplicate" && !!doc.CurrentVersion;
  const currentVersionQuery = useGetDocVersion(
    shouldFetch ? (doc.CurrentVersion as string) : "",
  );

  useEffect(() => {
    if (open) {
      setLabel("");
      setMode("duplicate");
      setError(null);
      setSaving(false);
    }
  }, [open]);

  const trimmedLabel = label.trim();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!trimmedLabel || saving) return;

    const previousVersion: DocVersion =
      mode === "duplicate"
        ? currentVersionQuery.data ?? blankPrevious(doc.ItemId)
        : blankPrevious(doc.ItemId);

    setSaving(true);
    setError(null);
    try {
      await createVersion.mutateAsync({
        docId: doc.ItemId,
        version: trimmedLabel,
        previousVersion,
      });
      toast.success(
        mode === "duplicate"
          ? `Version "${trimmedLabel}" created (duplicated)`
          : `Version "${trimmedLabel}" created (blank)`,
      );
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  const pagesCount =
    currentVersionQuery.data?.Pages?.length ?? (mode === "blank" ? 0 : null);
  const showDuplicateHint =
    mode === "duplicate" && pagesCount !== null && pagesCount !== undefined;

  return (
    <Dialog
      isOpen={open}
      onClose={onClose}
      title="Add version"
      description={`Create a new DocVersion for "${doc.Name}".`}
      maxWidthClass="max-w-lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="add-version-label">
            Version label <span className="text-destructive">*</span>
          </Label>
          <Input
            id="add-version-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. 0.0.2"
            disabled={saving}
            required
            autoFocus
          />
        </div>

        <div className="space-y-2">
          <Label>Start from</Label>
          <div className="grid gap-2">
            <label
              className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors ${
                mode === "duplicate"
                  ? "border-primary bg-primary/5"
                  : "hover:bg-accent/40"
              }`}
            >
              <input
                type="radio"
                name="version-mode"
                value="duplicate"
                checked={mode === "duplicate"}
                onChange={() => setMode("duplicate")}
                disabled={saving}
                className="mt-0.5"
              />
              <div className="min-w-0 space-y-0.5">
                <div className="flex items-center gap-1.5 text-sm font-medium">
                  <Copy className="h-3.5 w-3.5" />
                  Duplicate current version
                  {showDuplicateHint && (
                    <span className="text-xs text-muted-foreground">
                      ({pagesCount} page{pagesCount === 1 ? "" : "s"})
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Copies the current version's page list onto the new
                  version. You can add, remove, or reorder pages after.
                </p>
              </div>
            </label>

            <label
              className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors ${
                mode === "blank"
                  ? "border-primary bg-primary/5"
                  : "hover:bg-accent/40"
              }`}
            >
              <input
                type="radio"
                name="version-mode"
                value="blank"
                checked={mode === "blank"}
                onChange={() => setMode("blank")}
                disabled={saving}
                className="mt-0.5"
              />
              <div className="min-w-0 space-y-0.5">
                <div className="flex items-center gap-1.5 text-sm font-medium">
                  <FilePlus className="h-3.5 w-3.5" />
                  Blank version
                </div>
                <p className="text-xs text-muted-foreground">
                  Starts with no pages. Use this when the new version
                  represents a major rewrite.
                </p>
              </div>
            </label>
          </div>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex items-center justify-end gap-3 border-t pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={saving || !trimmedLabel}>
            {saving ? "Creating…" : "Create version"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/**
 * Fabricate a DocVersion with an empty Pages array — used for the
 * "blank version" path so `useCreateDocVersion` copies `[]` onto the
 * new version. Only `ItemId` + `Pages` are actually read by the hook.
 */
function blankPrevious(docId: string): DocVersion {
  return {
    ItemId: "",
    DocId: docId,
    Version: "",
    Pages: [],
    IsPublished: false,
    IsActive: true,
  };
}
