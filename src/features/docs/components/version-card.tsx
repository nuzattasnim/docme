import { Trash2, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ConfirmPopover } from "@/components/layout/confirm-popover";
import { CURRENT_SCHEMA_VERSION, isVersionEditable, type DocVersion } from "../types";
import { VersionStatusBadges } from "./version-status-badges";
import { VersionStateAlert, VersionStateBadge } from "./version-state";

export interface VersionCardProps {
  version: DocVersion;
  /** This version is Doc.CurrentVersion. */
  isCurrent: boolean;
  onOpen: () => Promise<void>;
  onTogglePublished: () => Promise<void>;
  onToggleActive: () => Promise<void>;
  onDelete: () => Promise<void>;
  busy?: boolean;
  /** Role allows publish/active toggles (SPEC2 §6.1). */
  canPublish?: boolean;
  /** Role allows deleting versions (admin only). */
  canDelete?: boolean;
}

/**
 * One DocVersion in the Versions dialog: label, publish/active pills, its
 * data state (Copying, Copy failed, Needs migration) and its actions.
 *
 * The current version can't be deleted (C3); a legacy version can't be
 * deleted until it is migrated, because its pages may be shared.
 */
export function VersionCard({
  version,
  isCurrent,
  onOpen,
  onTogglePublished,
  onToggleActive,
  onDelete,
  busy,
  canPublish = true,
  canDelete = true,
}: VersionCardProps) {
  const editable = isVersionEditable(version);
  const isLegacy = version.SchemaVersion !== CURRENT_SCHEMA_VERSION;
  const deleteBlockedReason = isCurrent
    ? "Switch to another version before deleting it"
    : isLegacy
      ? "Run the migration before deleting this version"
      : null;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 space-y-0 p-4">
        <div className="min-w-0 space-y-1">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <span className="font-mono">{version.Version || "—"}</span>
            {isCurrent && <Badge variant="outline">Current</Badge>}
            <VersionStateBadge version={version} />
          </CardTitle>
          <CardDescription className="font-mono text-xs">{version.ItemId}</CardDescription>
        </div>
        <VersionStatusBadges
          isPublished={version.IsPublished}
          isActive={version.IsActive}
          onTogglePublished={canPublish ? onTogglePublished : undefined}
          onToggleActive={canPublish ? onToggleActive : undefined}
          disabled={busy || !editable}
        />
      </CardHeader>
      <CardContent className="space-y-3 p-4 pt-0">
        {!editable && <VersionStateAlert version={version} />}
        <div className="flex flex-wrap items-center justify-end gap-2">
          {!isCurrent && (
            <Button size="sm" variant="outline" onClick={onOpen} disabled={busy}>
              <FolderOpen className="h-3.5 w-3.5" /> Open
            </Button>
          )}
          {!canDelete ? null : deleteBlockedReason ? (
            <Tooltip>
              <TooltipTrigger asChild>
                {/* A disabled button gets no pointer events; the span carries the tooltip and focus. */}
                <span tabIndex={0} className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled
                    aria-label={`Delete version ${version.Version ?? ""} — ${deleteBlockedReason}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent side="top">{deleteBlockedReason}</TooltipContent>
            </Tooltip>
          ) : (
            <ConfirmPopover
              trigger={
                <Button size="sm" variant="outline" disabled={busy}>
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </Button>
              }
              title={`Delete version ${version.Version ?? ""}?`}
              description="Removes this version and its pages. Other versions are not affected."
              confirmLabel="Delete"
              destructive
              onConfirm={onDelete}
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
