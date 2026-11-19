import { useEffect, useState, type FormEvent } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { toast } from "sonner";
import type { Doc, DocUpdate } from "../types";
import { RepoSourceSection } from "@/features/sources/components/repo-source-section";

export interface EditDocModalProps {
  open: boolean;
  onClose: () => void;
  doc: Doc;
  onSave: (patch: DocUpdate) => Promise<void>;
  /** Admins edit the repo link; everyone else sees the summary (SPEC3 §4). */
  canManageSource?: boolean;
}

/**
 * Edit Doc modal — title + description. Re-seeds when the underlying
 * Doc changes (e.g. after a save in another tab) so navigating between
 * docs while it's open never shows stale state.
 */
export function EditDocModal({
  open,
  onClose,
  doc,
  onSave,
  canManageSource = false,
}: EditDocModalProps) {
  const [nameDraft, setNameDraft] = useState(doc.Name);
  const [descriptionDraft, setDescriptionDraft] = useState(
    doc.Description ?? "",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setNameDraft(doc.Name);
      setDescriptionDraft(doc.Description ?? "");
      setError(null);
      setSaving(false);
    }
  }, [open, doc]);

  const nameDirty = nameDraft.trim() !== doc.Name;
  const descDirty =
    descriptionDraft.trim() !== (doc.Description ?? "").trim();
  const dirty = nameDirty || descDirty;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!dirty || saving) return;
    const patch: DocUpdate = {};
    const trimmedName = nameDraft.trim();
    if (trimmedName && trimmedName !== doc.Name) patch.Name = trimmedName;
    const nextDesc = descriptionDraft.trim();
    const currentDesc = doc.Description ?? "";
    if (nextDesc !== currentDesc) patch.Description = nextDesc || null;
    if (Object.keys(patch).length === 0) return;

    setSaving(true);
    setError(null);
    try {
      await onSave(patch);
      toast.success("Doc updated");
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      isOpen={open}
      onClose={onClose}
      title="Edit doc details"
      description="Update the doc name, description and source repository."
      maxWidthClass="max-w-lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="edit-doc-name">
            Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="edit-doc-name"
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            placeholder="Doc name"
            disabled={saving}
            required
            autoFocus
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="edit-doc-description">Description</Label>
          <Textarea
            id="edit-doc-description"
            value={descriptionDraft}
            onChange={(e) => setDescriptionDraft(e.target.value)}
            placeholder="Description (optional)"
            rows={3}
            disabled={saving}
          />
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
          <Button
            type="submit"
            disabled={saving || !dirty || !nameDraft.trim()}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
      {open && (
        <div className="mt-4">
          <RepoSourceSection docId={doc.ItemId} canManage={canManageSource} />
        </div>
      )}
    </Dialog>
  );
}
