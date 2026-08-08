import { Skeleton } from "@/components/ui/skeleton";
import { useMyTimeline } from "./hooks";
import type { Me } from "@/features/users/api";

export interface ProfileActivityProps {
  me: Me;
}

/**
 * Read-only view of the signed-in user's audit timeline.
 *
 * Per the `blocks-iam-users` skill, `/iam/users/timeline` is a `GET` that
 * requires a body, and the server also accepts it as POST. We call it
 * as POST so the browser can carry the `ItemId` (timeline subject) in the
 * body.
 *
 * The `currentData` snapshot on each entry exposes `firstName`,
 * `lastName`, `email`, `roles`, `permissions` etc. — handy as an audit
 * trail of who had what access when.
 */
export function ProfileActivity({ me }: ProfileActivityProps) {
  const { data, isLoading, isError, error } = useMyTimeline(me.itemId);

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (isError) {
    return (
      <p className="text-sm text-destructive">
        {error instanceof Error
          ? `Couldn't load activity: ${error.message}`
          : "Couldn't load activity."}
      </p>
    );
  }

  const entries = data ?? [];

  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No activity recorded yet.
      </p>
    );
  }

  return (
    <ol className="space-y-2">
      {entries.map((entry) => {
        const snap = (entry.currentData ?? {}) as Record<string, unknown>;
        const name =
          [snap.firstName, snap.lastName].filter(Boolean).join(" ").trim() ||
          (snap.email as string | undefined) ||
          "—";
        const when = entry.lastUpdatedDate ?? entry.createdDate;
        return (
          <li
            key={entry.itemId}
            className="rounded-md border bg-card/50 px-3 py-2 text-sm"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium">{name}</span>
              {when && (
                <span className="text-xs text-muted-foreground">
                  {formatDate(when)}
                </span>
              )}
            </div>
            {Array.isArray(snap.roles) && (snap.roles as string[]).length > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                Roles: {(snap.roles as string[]).join(", ")}
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}
