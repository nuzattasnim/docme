import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/layout/empty-state";
import { errorMessage } from "@/features/data/errors";
import {
  useDeleteVersion,
  useListVersions,
  usePublishVersion,
  useSetCurrentVersion,
  useSetVersionActive,
  useUnpublishVersion,
} from "../hooks";
import type { Doc, DocVersion } from "../types";
import { VersionCard } from "./version-card";
import { AddVersionModal } from "./add-version-modal";
import { QueryErrorAlert } from "./query-error-alert";
import { useDocmeRole } from "@/features/access/use-docme-role";

export interface VersionsDialogProps {
  open: boolean;
  onClose: () => void;
  doc: Doc;
  /** The version the page shows now (readers don't use CurrentVersion). */
  openedVersionId?: string;
  /**
   * Readers: "Open" shows that version locally instead of writing
   * Doc.CurrentVersion, which they may not change.
   */
  onOpenVersion?: (versionId: string) => void;
}

/**
 * Every version of a doc, newest first, with open / publish / active /
 * delete. Versions are fetched only while the dialog is open, so opening a
 * doc stays at three gateway requests (J1).
 */
export function VersionsDialog({ open, onClose, doc, openedVersionId, onOpenVersion }: VersionsDialogProps) {
  const versionsQuery = useListVersions(doc.ItemId, open);
  const { can } = useDocmeRole();
  const canCreate = can("version.create");
  const canPublish = can("version.publish");
  const canDelete = can("version.delete");
  const [addOpen, setAddOpen] = useState(false);

  const setCurrent = useSetCurrentVersion();
  const publish = usePublishVersion();
  const unpublish = useUnpublishVersion();
  const setActive = useSetVersionActive();
  const remove = useDeleteVersion();
  const busy =
    setCurrent.isPending || publish.isPending || unpublish.isPending || setActive.isPending || remove.isPending;

  async function run(action: () => Promise<unknown>, success: string) {
    try {
      await action();
      toast.success(success);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  const label = (v: DocVersion) => v.Version || v.ItemId;
  const versions = [...(versionsQuery.data ?? [])].reverse();

  return (
    <>
      <Dialog
        isOpen={open && !addOpen}
        onClose={onClose}
        title="Versions"
        description={`Versions of "${doc.Name}". The current version is the one editors open by default.`}
        maxWidthClass="max-w-2xl"
      >
        <div className="space-y-3">
          {canCreate && (
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setAddOpen(true)}>
                <Plus /> Add version
              </Button>
            </div>
          )}
          {versionsQuery.isPending ? (
            <div className="space-y-2">
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-28 w-full" />
            </div>
          ) : versionsQuery.error ? (
            <QueryErrorAlert
              message={`Failed to load versions: ${errorMessage(versionsQuery.error)}`}
              onRetry={() => versionsQuery.refetch()}
            />
          ) : versions.length === 0 ? (
            <EmptyState title="No versions yet" description="Add a version to start writing pages." />
          ) : (
            <ul className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
              {versions.map((v) => (
                <li key={v.ItemId}>
                  <VersionCard
                    version={v}
                    isCurrent={(onOpenVersion ? openedVersionId : doc.CurrentVersion) === v.ItemId}
                    busy={busy}
                    canPublish={canPublish}
                    canDelete={canDelete}
                    onOpen={() =>
                      onOpenVersion
                        ? Promise.resolve(onOpenVersion(v.ItemId)).then(onClose)
                        : run(
                            () => setCurrent.mutateAsync({ docId: doc.ItemId, versionId: v.ItemId }),
                            `Opened version ${label(v)}`,
                          )
                    }
                    onTogglePublished={() =>
                      v.IsPublished
                        ? run(() => unpublish.mutateAsync(v.ItemId), `Version ${label(v)} unpublished`)
                        : run(
                            () => publish.mutateAsync({ docId: doc.ItemId, versionId: v.ItemId }),
                            `Version ${label(v)} published`,
                          )
                    }
                    onToggleActive={() =>
                      run(
                        () => setActive.mutateAsync({ versionId: v.ItemId, isActive: !v.IsActive }),
                        `Version ${label(v)} ${v.IsActive ? "deactivated" : "activated"}`,
                      )
                    }
                    onDelete={() =>
                      run(
                        () => remove.mutateAsync({ docId: doc.ItemId, versionId: v.ItemId }),
                        `Version ${label(v)} deleted`,
                      )
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </Dialog>
      <AddVersionModal open={addOpen} onClose={() => setAddOpen(false)} doc={doc} />
    </>
  );
}
