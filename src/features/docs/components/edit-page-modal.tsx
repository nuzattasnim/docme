import { useEffect, useState, type FormEvent } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { toast } from "sonner";
import type { Page, PageUpdate } from "../types";

const CONTENT_TYPES = [
  { value: "md", label: "Markdown (.md)" },
  { value: "mdx", label: "MDX (.mdx)" },
] as const;

export interface EditPageModalProps {
  open: boolean;
  onClose: () => void;
  page: Page;
  onSave: (pageId: string, updates: PageUpdate) => Promise<void>;
}

/**
 * Edit Page modal — title, contentType, content. Re-seeds whenever the
 * underlying Page changes so navigating between pages while the modal
 * is open never shows stale form state.
 */
export function EditPageModal({
  open,
  onClose,
  page,
  onSave,
}: EditPageModalProps) {
  const [titleDraft, setTitleDraft] = useState(page.Title);
  const [typeDraft, setTypeDraft] = useState(page.ContentType ?? "md");
  const [contentDraft, setContentDraft] = useState(page.Content ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setTitleDraft(page.Title);
      setTypeDraft(page.ContentType ?? "md");
      setContentDraft(page.Content ?? "");
      setError(null);
      setSaving(false);
    }
  }, [open, page]);

  const titleDirty = titleDraft.trim() !== page.Title;
  const typeDirty = typeDraft !== (page.ContentType ?? "md");
  const contentDirty = contentDraft !== (page.Content ?? "");
  const dirty = titleDirty || typeDirty || contentDirty;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!dirty || saving) return;
    const updates: PageUpdate = {};
    const trimmedTitle = titleDraft.trim();
    if (trimmedTitle && trimmedTitle !== page.Title) updates.Title = trimmedTitle;
    if (typeDraft !== (page.ContentType ?? "md"))
      updates.ContentType = typeDraft;
    if (contentDraft !== (page.Content ?? "")) updates.Content = contentDraft;
    if (Object.keys(updates).length === 0) return;

    setSaving(true);
    setError(null);
    try {
      await onSave(page.ItemId, updates);
      toast.success(`Page "${trimmedTitle}" updated`);
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
      title="Edit page"
      description="Update the page title, content type, and content. Saves to the Blocks data gateway."
      maxWidthClass="max-w-3xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="edit-page-title">
              Title <span className="text-destructive">*</span>
            </Label>
            <Input
              id="edit-page-title"
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              placeholder="Page title"
              disabled={saving}
              required
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-page-type">Content type</Label>
            <select
              id="edit-page-type"
              value={typeDraft}
              onChange={(e) =>
                setTypeDraft(e.target.value as "md" | "mdx")
              }
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={saving}
            >
              {CONTENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="edit-page-content">
            Content ({typeDraft.toUpperCase()})
          </Label>
          <Textarea
            id="edit-page-content"
            value={contentDraft}
            onChange={(e) => setContentDraft(e.target.value)}
            placeholder="# Page Title&#10;&#10;Write or paste markdown content here…"
            rows={18}
            className="font-mono text-xs"
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
            disabled={saving || !dirty || !titleDraft.trim()}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
