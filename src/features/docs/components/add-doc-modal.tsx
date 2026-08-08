import { useEffect, useState, type FormEvent } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { toast } from "sonner";

export interface AddDocModalProps {
  open: boolean;
  onClose: () => void;
  onCreate: (input: {
    name: string;
    description?: string | null;
  }) => Promise<void>;
}

/**
 * AddDocModal — modal for creating a new Doc. Inputs match the
 * `useCreateDoc` hook (`{ name, description? }`). On success the hook
 * auto-creates a v0.0.1 DocVersion and attaches it, so this is a
 * one-step create.
 */
export function AddDocModal({ open, onClose, onCreate }: AddDocModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-seed when the modal opens — never show stale state from a
  // previous attempt.
  useEffect(() => {
    if (open) {
      setName("");
      setDescription("");
      setError(null);
      setSaving(false);
    }
  }, [open]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onCreate({
        name: trimmed,
        description: description.trim() || null,
      });
      toast.success(`Doc "${trimmed}" created`);
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
      title="Create new doc"
      description="Creates the Doc and a fresh v0.0.1 DocVersion in one step."
      maxWidthClass="max-w-lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="add-doc-name">
            Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="add-doc-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. API reference"
            disabled={saving}
            required
            autoFocus
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="add-doc-description">Description</Label>
          <Textarea
            id="add-doc-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
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
          <Button type="submit" disabled={saving || !name.trim()}>
            {saving ? "Creating…" : "Create"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
