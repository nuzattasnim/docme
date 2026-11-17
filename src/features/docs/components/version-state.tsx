import { useState } from "react";
import { AlertCircle, RotateCw } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/features/data/errors";
import { cn } from "@/lib/utils";
import { useResumeDuplicate } from "../hooks";
import { versionState, type DocVersion } from "../types";

/** "Needs migration" / "Copying" / "Copy failed"; nothing for a ready version. */
export function VersionStateBadge({ version }: { version: DocVersion }) {
  switch (versionState(version)) {
    case "legacy":
      return <Badge variant="secondary">Needs migration</Badge>;
    case "copying":
      return <Badge variant="secondary">Copying</Badge>;
    case "copyFailed":
      return <Badge variant="destructive">Copy failed</Badge>;
    default:
      return null;
  }
}

/**
 * Why a version is read-only (C8), and — for an interrupted duplicate — a
 * Retry that copies only the missing pages (C2).
 */
export function VersionStateAlert({
  version,
  className,
}: {
  version: DocVersion;
  className?: string;
}) {
  const resume = useResumeDuplicate();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const state = versionState(version);
  if (state === "ready") return null;

  if (state === "legacy") {
    return (
      <Alert variant="warning" className={className}>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          This version uses the old data format — run the migration. It is read-only until then.
        </AlertDescription>
      </Alert>
    );
  }

  async function onRetry() {
    setProgress(null);
    try {
      await resume.mutateAsync({
        versionId: version.ItemId,
        onProgress: (done, total) => setProgress({ done, total }),
      });
      toast.success(`Version "${version.Version}" copied`);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <Alert variant="destructive" className={cn(className)}>
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>Copy incomplete</AlertTitle>
      <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
        <span aria-live="polite">
          {resume.isPending && progress
            ? `Copying pages ${progress.done} of ${progress.total}…`
            : "Some pages weren't copied into this version. It is read-only until the copy finishes."}
        </span>
        <Button size="sm" variant="outline" onClick={onRetry} disabled={resume.isPending}>
          <RotateCw className="h-3.5 w-3.5" /> {resume.isPending ? "Copying…" : "Retry"}
        </Button>
      </AlertDescription>
    </Alert>
  );
}
