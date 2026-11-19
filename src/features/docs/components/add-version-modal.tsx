import { useEffect, useState, type FormEvent } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, Copy, FilePlus, RotateCw } from "lucide-react";
import { toast } from "sonner";
import { errorMessage, isDocmeDataError } from "@/features/data/errors";
import {
  useCreateBlankVersion,
  useDuplicateVersion,
  useGetDocVersion,
  useListPageSummaries,
  useResumeDuplicate,
} from "../hooks";
import { CopyIncompleteError } from "../services";
import { isVersionEditable, type Doc } from "../types";
import { validateVersionLabel } from "../validation";

export interface AddVersionModalProps {
  open: boolean;
  onClose: () => void;
  doc: Doc;
  /** Restore: copy this version instead of the current one. */
  sourceVersionId?: string;
}

type VersionMode = "duplicate" | "blank";

/**
 * Create a new DocVersion on an existing Doc.
 *
 * - "duplicate" copies every page of the current version into new Page
 *   records owned by the new version, with progress ("Copying pages 40 of
 *   100"). If the copy stops partway, the new version is left "Copy failed",
 *   CurrentVersion is unchanged, and Retry copies only the missing pages.
 * - "blank" creates an empty version.
 *
 * Either way the new version becomes Doc.CurrentVersion on success.
 *
 * With `sourceVersionId` it restores an older version: the duplicate copies
 * that version's pages, and the original stays as it was.
 */
export function AddVersionModal({ open, onClose, doc, sourceVersionId }: AddVersionModalProps) {
  const [label, setLabel] = useState("");
  const [mode, setMode] = useState<VersionMode>("duplicate");
  const [labelError, setLabelError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [failedVersionId, setFailedVersionId] = useState<string | null>(null);

  const duplicate = useDuplicateVersion();
  const blank = useCreateBlankVersion();
  const resume = useResumeDuplicate();
  const saving = duplicate.isPending || blank.isPending || resume.isPending;

  const restoring = !!sourceVersionId && sourceVersionId !== doc.CurrentVersion;
  const sourceId = open ? (sourceVersionId ?? doc.CurrentVersion ?? "") : "";
  const sourceQuery = useGetDocVersion(sourceId);
  const source = sourceQuery.data ?? undefined;
  const canDuplicate = !!source && isVersionEditable(source);
  const pagesQuery = useListPageSummaries(sourceId, open && canDuplicate && mode === "duplicate");

  useEffect(() => {
    if (open) {
      setLabel("");
      setMode("duplicate");
      setLabelError(null);
      setError(null);
      setProgress(null);
      setFailedVersionId(null);
    }
  }, [open]);

  useEffect(() => {
    if (open && source && !canDuplicate) setMode("blank");
  }, [open, source, canDuplicate]);

  const onProgress = (done: number, total: number) => setProgress({ done, total });

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    const errors = validateVersionLabel(label);
    setLabelError(errors.label ?? null);
    if (errors.label) return;
    const trimmed = label.trim();

    setError(null);
    setProgress(null);
    try {
      if (mode === "duplicate") {
        if (!sourceId) throw new Error("This doc has no current version to duplicate");
        await duplicate.mutateAsync({
          docId: doc.ItemId,
          sourceVersionId: sourceId,
          label: trimmed,
          onProgress,
        });
        toast.success(
          restoring
            ? `Version ${source?.Version ?? ""} restored as "${trimmed}"`
            : `Version "${trimmed}" created (duplicated)`,
        );
      } else {
        await blank.mutateAsync({ docId: doc.ItemId, label: trimmed });
        toast.success(`Version "${trimmed}" created (blank)`);
      }
      onClose();
    } catch (err) {
      if (err instanceof CopyIncompleteError) setFailedVersionId(err.versionId);
      if (isDocmeDataError(err, "VersionLabelTaken")) setLabelError(err.message);
      const msg = errorMessage(err);
      setError(msg);
      toast.error(msg);
    }
  }

  async function handleRetry() {
    if (!failedVersionId) return;
    setError(null);
    setProgress(null);
    try {
      await resume.mutateAsync({ versionId: failedVersionId, onProgress });
      toast.success(`Version "${label.trim()}" copied`);
      onClose();
    } catch (err) {
      const msg = errorMessage(err);
      setError(msg);
      toast.error(msg);
    }
  }

  const pagesCount = pagesQuery.data?.length;

  return (
    <Dialog
      isOpen={open}
      onClose={onClose}
      title={restoring ? `Restore version ${source?.Version ?? ""}` : "Add version"}
      description={
        restoring
          ? `Copies version ${source?.Version ?? ""} into a new version of "${doc.Name}" and makes it current. Version ${source?.Version ?? ""} itself is not changed.`
          : `Create a new version of "${doc.Name}".`
      }
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
            disabled={saving || !!failedVersionId}
            autoFocus
            aria-invalid={!!labelError}
            aria-describedby={labelError ? "add-version-label-error" : undefined}
          />
          {labelError && (
            <p id="add-version-label-error" className="text-xs text-destructive">
              {labelError}
            </p>
          )}
        </div>

        <fieldset className="space-y-2" disabled={saving || !!failedVersionId}>
          <legend className="text-sm font-medium">Start from</legend>
          <div className="grid gap-2">
            <label
              className={`flex items-start gap-3 rounded-md border p-3 transition-colors ${
                !canDuplicate
                  ? "cursor-not-allowed opacity-60"
                  : mode === "duplicate"
                    ? "cursor-pointer border-primary bg-primary/5"
                    : "cursor-pointer hover:bg-accent/40"
              }`}
            >
              <input
                type="radio"
                name="version-mode"
                value="duplicate"
                checked={mode === "duplicate"}
                onChange={() => setMode("duplicate")}
                disabled={!canDuplicate}
                className="mt-0.5"
              />
              <div className="min-w-0 space-y-0.5">
                <div className="flex items-center gap-1.5 text-sm font-medium">
                  <Copy className="h-3.5 w-3.5" />
                  {restoring ? `Copy of version ${source?.Version ?? ""}` : "Duplicate current version"}
                  {pagesCount !== undefined && (
                    <span className="text-xs text-muted-foreground">
                      ({pagesCount} page{pagesCount === 1 ? "" : "s"})
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {canDuplicate || !source
                    ? `Copies every page into the new version. Editing the copy never changes the original. Comments stay on version ${source?.Version ?? "the original"}.`
                    : `Not available: ${restoring ? "this" : "the current"} version isn't ready (it needs migration or its copy is incomplete).`}
                </p>
              </div>
            </label>

            {!restoring && (
              <label
                className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors ${
                  mode === "blank" ? "border-primary bg-primary/5" : "hover:bg-accent/40"
                }`}
              >
                <input
                  type="radio"
                  name="version-mode"
                  value="blank"
                  checked={mode === "blank"}
                  onChange={() => setMode("blank")}
                  className="mt-0.5"
                />
                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    <FilePlus className="h-3.5 w-3.5" />
                    Blank version
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Starts with no pages. Use this when the new version is a major rewrite.
                  </p>
                </div>
              </label>
            )}
          </div>
        </fieldset>

        <p aria-live="polite" className="text-sm text-muted-foreground">
          {saving && progress ? `Copying pages ${progress.done} of ${progress.total}…` : ""}
        </p>

        {failedVersionId ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Copy incomplete</AlertTitle>
            <AlertDescription className="space-y-2">
              <p>{error}</p>
              <p>The new version stays read-only, and the current version is unchanged, until the copy finishes.</p>
              <Button type="button" size="sm" variant="outline" onClick={handleRetry} disabled={saving}>
                <RotateCw className="h-3.5 w-3.5" /> {resume.isPending ? "Copying…" : "Retry"}
              </Button>
            </AlertDescription>
          </Alert>
        ) : (
          error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )
        )}

        <div className="flex items-center justify-end gap-3 border-t pt-4">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            {failedVersionId ? "Close" : "Cancel"}
          </Button>
          {!failedVersionId && (
            <Button type="submit" disabled={saving || !label.trim() || (restoring && !canDuplicate)}>
              {saving ? "Creating…" : "Create version"}
            </Button>
          )}
        </div>
      </form>
    </Dialog>
  );
}
