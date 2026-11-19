import { useEffect, useState, type FormEvent } from "react";
import { AlertCircle, ExternalLink, GitBranch, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmPopover } from "@/components/layout/confirm-popover";
import { errorMessage } from "@/features/data/errors";
import { useDocSource, useRemoveDocSource, useSaveDocSource } from "../hooks";
import {
  normalizeRepoLink,
  shortSha,
  type RepoLinkErrors,
  type RepoLinkField,
  type RepoLinkInput,
} from "../repo-link";
import { RepoLinkInvalidError, type DocSource } from "../services";

const EYEBROW = "text-xs font-medium uppercase tracking-wide text-muted-foreground";

const FIELDS: ReadonlyArray<{ key: RepoLinkField; label: string; placeholder: string; mono?: boolean }> = [
  { key: "repoUrl", label: "Repository URL", placeholder: "https://github.com/owner/repo" },
  { key: "branch", label: "Branch", placeholder: "main" },
  { key: "docsPath", label: "Docs path", placeholder: "/" },
  { key: "baselineCommitSha", label: "Baseline commit (optional)", placeholder: "40-character SHA", mono: true },
];

function toInput(source: DocSource | null | undefined): RepoLinkInput {
  return {
    repoUrl: source?.RepoUrl ?? "",
    branch: source?.Branch ?? "",
    docsPath: source?.DocsPath ?? "/",
    baselineCommitSha: source?.BaselineCommitSha ?? "",
  };
}

/**
 * "Source repository" section of the Edit Doc modal (SPEC3 §4). Admins edit
 * the link; editors see the read-only summary. Renders its own <form>, so it
 * must sit outside the modal's doc form.
 */
export function RepoSourceSection({ docId, canManage }: { docId: string; canManage: boolean }) {
  const query = useDocSource(docId);
  const source = query.data ?? null;
  const save = useSaveDocSource(docId);
  const remove = useRemoveDocSource(docId);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<RepoLinkInput>(toInput(null));
  const [errors, setErrors] = useState<RepoLinkErrors>({});
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!editing) setDraft(toInput(source));
  }, [source, editing]);

  function startEditing() {
    setDraft(toInput(source));
    setErrors({});
    setSaveError(null);
    setEditing(true);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    // C1: validate everything before any request.
    const checked = normalizeRepoLink(draft);
    if (!checked.ok) {
      setErrors(checked.errors);
      return;
    }
    setErrors({});
    setSaveError(null);
    try {
      await save.mutateAsync(draft);
      toast.success("Repository linked");
      setEditing(false);
    } catch (err) {
      if (err instanceof RepoLinkInvalidError) setErrors(err.errors);
      const msg = errorMessage(err);
      setSaveError(msg);
      toast.error(msg);
    }
  }

  async function onRemove() {
    try {
      await remove.mutateAsync();
      toast.success("Repository link removed");
      setEditing(false);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  function onUrlBlur() {
    // H2: pre-fill Branch from a /tree/<branch> URL when Branch is empty.
    if (draft.branch.trim()) return;
    const m = /\/tree\/(.+?)\/?$/.exec(draft.repoUrl.trim());
    if (m) setDraft((d) => ({ ...d, branch: decodeURIComponentSafe(m[1]) }));
  }

  const saving = save.isPending;

  return (
    <section aria-labelledby={`repo-source-${docId}`} className="space-y-3">
      <Separator />
      <h3 id={`repo-source-${docId}`} className={EYEBROW}>
        Source repository
      </h3>

      {query.isPending ? (
        <Skeleton className="h-10 w-full" />
      ) : query.error ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between gap-3">
            <span>Couldn't load the repository link: {errorMessage(query.error)}</span>
            <Button type="button" size="sm" variant="outline" onClick={() => query.refetch()}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : canManage && editing ? (
        <form onSubmit={onSubmit} noValidate className="space-y-3">
          {FIELDS.map((f) => {
            const id = `repo-${f.key}-${docId}`;
            const err = errors[f.key];
            return (
              <div key={f.key} className="space-y-1.5">
                <Label htmlFor={id}>{f.label}</Label>
                <Input
                  id={id}
                  value={draft[f.key]}
                  onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                  onBlur={f.key === "repoUrl" ? onUrlBlur : undefined}
                  placeholder={f.placeholder}
                  disabled={saving}
                  aria-invalid={err ? true : undefined}
                  aria-describedby={err ? `${id}-error` : undefined}
                  className={f.mono ? "font-mono text-xs" : undefined}
                  autoComplete="off"
                  spellCheck={false}
                />
                {err && (
                  <p id={`${id}-error`} className="text-sm text-destructive">
                    {err}
                  </p>
                )}
              </div>
            );
          })}
          {saveError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{saveError}</AlertDescription>
            </Alert>
          )}
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setEditing(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={saving}>
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {saving ? "Saving…" : "Save link"}
            </Button>
          </div>
        </form>
      ) : source ? (
        <div className="space-y-2">
          <RepoSourceSummary source={source} />
          {canManage && (
            <div className="flex items-center justify-end gap-2">
              <ConfirmPopover
                trigger={
                  <Button type="button" variant="ghost" size="sm" disabled={remove.isPending}>
                    Remove link
                  </Button>
                }
                title="Remove the repository link?"
                description="The doc, its versions and pages are not changed."
                confirmLabel="Remove"
                destructive
                onConfirm={onRemove}
              />
              <Button type="button" variant="outline" size="sm" onClick={startEditing}>
                Edit link
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">Not linked</p>
          {canManage && (
            <Button type="button" variant="outline" size="sm" onClick={startEditing}>
              Link repository
            </Button>
          )}
        </div>
      )}
    </section>
  );
}

/** Read-only summary: repository link, branch, docs path, 7-character baseline (H3). */
export function RepoSourceSummary({ source, compact = false }: { source: DocSource; compact?: boolean }) {
  const repoLabel = `${source.RepoOwner}/${source.RepoName}`;
  return (
    <dl
      className={
        compact
          ? "flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground"
          : "grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm"
      }
    >
      <dt className={compact ? "sr-only" : "text-muted-foreground"}>Repository</dt>
      <dd className="min-w-0 truncate">
        <a
          href={source.RepoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
        >
          {repoLabel}
          <ExternalLink className="h-3 w-3" aria-hidden />
        </a>
      </dd>
      <dt className={compact ? "sr-only" : "text-muted-foreground"}>Branch</dt>
      <dd className="inline-flex min-w-0 items-center gap-1 truncate">
        {compact && <GitBranch className="h-3 w-3" aria-hidden />}
        {source.Branch}
      </dd>
      {(!compact || source.DocsPath !== "/") && (
        <>
          <dt className={compact ? "sr-only" : "text-muted-foreground"}>Docs path</dt>
          <dd className="min-w-0 truncate">{source.DocsPath}</dd>
        </>
      )}
      {(!compact || source.BaselineCommitSha) && (
        <>
          <dt className={compact ? "sr-only" : "text-muted-foreground"}>Baseline commit</dt>
          <dd>
            {source.BaselineCommitSha ? (
              <code className="font-mono text-xs" title={source.BaselineCommitSha}>
                {shortSha(source.BaselineCommitSha)}
              </code>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </dd>
        </>
      )}
    </dl>
  );
}

/** Compact header line for every role; renders nothing when the doc isn't linked. */
export function RepoSourceHeaderLine({ docId }: { docId: string }) {
  const { data } = useDocSource(docId);
  if (!data) return null;
  return (
    <div className="mt-1">
      <RepoSourceSummary source={data} compact />
    </div>
  );
}

function decodeURIComponentSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
