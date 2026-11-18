import { useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmPopover } from "@/components/layout/confirm-popover";
import { errorMessage } from "@/features/data/errors";
import { reconcileReaderVisibility, type ReconcileReport } from "@/features/docs/services";
import { useActiveOrganizationId, useDocmeRole } from "@/features/access/use-docme-role";
import { useMyOrganizations } from "@/features/orgs/hooks";
import {
  assignLegacyToOrganization,
  scanLegacyOrganization,
  type LegacyAssignmentReport,
  type LegacyCounts,
} from "./legacy-org";

const fmt = (c: LegacyCounts) => `${c.Doc} docs, ${c.DocVersion} versions, ${c.Page} pages`;

/**
 * SPEC2 §6.5 and §6.2 tools, admin only, in migration-enabled builds:
 *   1. Assign legacy data to the active organization (before the rules go live).
 *   2. Reconcile reader visibility.
 */
export default function OrgToolsPanel() {
  const { can } = useDocmeRole();
  const organizationId = useActiveOrganizationId();
  const { data: orgs } = useMyOrganizations();
  const orgName = orgs?.find((o) => o.itemId === organizationId)?.name ?? organizationId ?? "";

  const [busy, setBusy] = useState<null | "scan" | "assign" | "reconcile">(null);
  const [progress, setProgress] = useState("");
  const [scan, setScan] = useState<{ pending: LegacyCounts; inOrganization: LegacyCounts } | null>(null);
  const [report, setReport] = useState<LegacyAssignmentReport | null>(null);
  const [reconcile, setReconcile] = useState<ReconcileReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!can("members.manage") || !organizationId) return null;

  async function run<T>(kind: NonNullable<typeof busy>, task: () => Promise<T>, done: (r: T) => void) {
    setBusy(kind);
    setError(null);
    try {
      done(await task());
    } catch (err) {
      setError(errorMessage(err));
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
      setProgress("");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Organization tools</CardTitle>
        <CardDescription>
          One-off Phase 2 tools for {orgName}. Assign the legacy data before the data access rules are deployed.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Stopped</AlertTitle>
            <AlertDescription>{error} — running it again continues where it stopped.</AlertDescription>
          </Alert>
        )}

        <section className="space-y-2">
          <h3 className="text-sm font-medium">1. Assign legacy data to {orgName}</h3>
          <p className="text-sm text-muted-foreground">
            Moves every doc, version and page with no organization (or the root "default" context) into {orgName}.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={!!busy}
              onClick={() => run("scan", () => scanLegacyOrganization(organizationId), setScan)}
            >
              {busy === "scan" && <Loader2 className="h-4 w-4 animate-spin" />} Scan
            </Button>
            <ConfirmPopover
              trigger={
                <Button size="sm" disabled={!!busy}>
                  {busy === "assign" && <Loader2 className="h-4 w-4 animate-spin" />} Assign to {orgName}
                </Button>
              }
              title={`Move legacy data into ${orgName}?`}
              description="Every legacy doc, version and page will belong to this organization."
              confirmLabel="Assign"
              onConfirm={() =>
                run(
                  "assign",
                  () =>
                    assignLegacyToOrganization(organizationId, (schema, done, total) =>
                      setProgress(`${schema}: ${done}/${total}`),
                    ),
                  (r) => {
                    setReport(r);
                    toast.success(`Assigned ${fmt(r.updated)}`);
                  },
                )
              }
            />
          </div>
          {progress && <p className="text-xs text-muted-foreground">{progress}</p>}
          {scan && (
            <p className="text-sm">
              Pending: {fmt(scan.pending)}. Already in {orgName}: {fmt(scan.inOrganization)}.
            </p>
          )}
          {report && (
            <p className="text-sm">
              Updated {fmt(report.updated)}. Pending now: {fmt(report.pendingAfter)}. In {orgName}:{" "}
              {fmt(report.inOrganization)}.
            </p>
          )}
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-medium">2. Reconcile reader visibility</h3>
          <p className="text-sm text-muted-foreground">
            Sets each page's ReaderVisible to its version's "published or active" state, for every version in{" "}
            {orgName}.
          </p>
          <Button
            size="sm"
            variant="outline"
            disabled={!!busy}
            onClick={() =>
              run("reconcile", () => reconcileReaderVisibility(organizationId), (r) => {
                setReconcile(r);
                toast.success(`Reconciled ${r.versions} versions`);
              })
            }
          >
            {busy === "reconcile" && <Loader2 className="h-4 w-4 animate-spin" />} Reconcile
          </Button>
          {reconcile && (
            <p className="text-sm">
              Checked {reconcile.versions} versions; {reconcile.pagesChanged} pages changed.
            </p>
          )}
        </section>
      </CardContent>
    </Card>
  );
}
