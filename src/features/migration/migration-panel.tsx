import { useState } from "react";
import { AlertCircle, CheckCircle2, RotateCw, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ConfirmPopover } from "@/components/layout/confirm-popover";
import { errorMessage } from "@/features/data/errors";
import {
  deleteOrphans,
  runMigration,
  scanMigration,
  type MigrationReport,
  type ScanResult,
} from "./migration";

type PanelState =
  | { kind: "idle" }
  | { kind: "scanning" }
  | { kind: "scanned"; scan: ScanResult }
  | { kind: "running"; scan: ScanResult; current: number; total: number }
  | { kind: "report"; report: MigrationReport }
  | { kind: "error"; message: string; retry: () => void };

const SCAN_LABELS: Array<[keyof Omit<ScanResult, "orphans">, string]> = [
  ["docs", "Docs"],
  ["versions", "Versions"],
  ["versionsMigrated", "Versions already migrated"],
  ["legacyRefs", "Legacy page references"],
  ["sharedPages", "Pages shared by several versions"],
  ["orphanPages", "Orphan pages"],
  ["danglingRefs", "References to missing pages"],
];

/**
 * Data migration (SPEC1 §6.4). Only bundled when the build has
 * VITE_ENABLE_MIGRATION=true. Run it during an editing freeze.
 */
export default function MigrationPanel() {
  const [state, setState] = useState<PanelState>({ kind: "idle" });

  async function scan() {
    setState({ kind: "scanning" });
    try {
      setState({ kind: "scanned", scan: await scanMigration() });
    } catch (err) {
      setState({ kind: "error", message: errorMessage(err), retry: scan });
    }
  }

  async function run(scanResult: ScanResult) {
    setState({ kind: "running", scan: scanResult, current: 0, total: scanResult.versions - scanResult.versionsMigrated });
    try {
      const report = await runMigration((current, total) =>
        setState({ kind: "running", scan: scanResult, current, total }),
      );
      setState({ kind: "report", report });
      const failed = report.rows.filter((r) => !r.pass).length;
      if (failed > 0) toast.error(`Migration finished: ${failed} version(s) need attention`);
      else toast.success(`Migration finished: ${report.rows.length} version(s) migrated`);
    } catch (err) {
      // Running again resumes: migrated versions are skipped, copies are not repeated.
      setState({ kind: "error", message: errorMessage(err), retry: () => run(scanResult) });
      toast.error(errorMessage(err));
    }
  }

  async function removeOrphans(ids: string[]) {
    try {
      await deleteOrphans(ids);
      toast.success(`${ids.length} orphan page(s) deleted`);
      await scan();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Data migration</CardTitle>
        <CardDescription>
          Moves docs, versions and pages to the v2 data model: each version gets its own pages. Run it
          during an editing freeze. Scanning only reads data.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {state.kind === "idle" && <Button onClick={scan}>Scan</Button>}

        {state.kind === "scanning" && (
          <div className="space-y-2" aria-busy="true">
            {SCAN_LABELS.map(([key]) => (
              <Skeleton key={key} className="h-5 w-full" />
            ))}
          </div>
        )}

        {(state.kind === "scanned" || state.kind === "running") && (
          <>
            <ScanTable scan={state.scan} />
            <OrphanList
              scan={state.scan}
              disabled={state.kind === "running"}
              onDelete={removeOrphans}
            />
            {state.kind === "running" ? (
              <p aria-live="polite" className="text-muted-foreground">
                {state.current > 0
                  ? `Migrating version ${state.current} of ${state.total}…`
                  : "Preparing…"}
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => run(state.scan)}>
                  Run migration
                </Button>
                <Button variant="outline" onClick={scan}>
                  <RotateCw className="h-3.5 w-3.5" /> Scan again
                </Button>
              </div>
            )}
          </>
        )}

        {state.kind === "report" && (
          <>
            <ReportTable report={state.report} />
            <ScanTable scan={state.report.scanAfter} caption="Scan after the run" />
            <OrphanList scan={state.report.scanAfter} onDelete={removeOrphans} />
            <Button variant="outline" onClick={scan}>
              <RotateCw className="h-3.5 w-3.5" /> Scan again
            </Button>
          </>
        )}

        {state.kind === "error" && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Migration step failed</AlertTitle>
            <AlertDescription className="space-y-2">
              <p>{state.message}</p>
              <p>Retrying is safe: finished versions are skipped and no page is copied twice.</p>
              <Button size="sm" variant="outline" onClick={state.retry}>
                <RotateCw className="h-3.5 w-3.5" /> Retry
              </Button>
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

function ScanTable({ scan, caption = "Scan result" }: { scan: ScanResult; caption?: string }) {
  return (
    <table className="w-full border-collapse text-sm">
      <caption className="mb-2 text-left font-medium">{caption}</caption>
      <tbody>
        {SCAN_LABELS.map(([key, label]) => (
          <tr key={key} className="border-b border-border last:border-0">
            <th scope="row" className="py-1.5 pr-4 text-left font-normal text-muted-foreground">
              {label}
            </th>
            <td className="py-1.5 text-right font-mono tabular-nums">{scan[key]}</td>
          </tr>
        ))}
        <tr>
          <th scope="row" className="py-1.5 pr-4 text-left font-normal text-muted-foreground">
            Versions to migrate
          </th>
          <td className="py-1.5 text-right font-mono tabular-nums">
            {scan.versions - scan.versionsMigrated}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

function ReportTable({ report }: { report: MigrationReport }) {
  if (report.rows.length === 0) {
    return (
      <Alert>
        <CheckCircle2 className="h-4 w-4" />
        <AlertDescription>
          Nothing to migrate: every version already uses the v2 data model.
          {report.docsStatusSet > 0 && ` Set Status on ${report.docsStatusSet} doc(s).`}
        </AlertDescription>
      </Alert>
    );
  }
  const failed = report.rows.filter((r) => !r.pass).length;
  return (
    <div className="space-y-2">
      <p className="font-medium">
        Verification report —{" "}
        {failed === 0 ? `all ${report.rows.length} versions pass` : `${failed} of ${report.rows.length} versions fail`}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="py-1.5 pr-3 font-normal">Doc</th>
              <th className="py-1.5 pr-3 font-normal">Version</th>
              <th className="py-1.5 pr-3 text-right font-normal">Legacy refs</th>
              <th className="py-1.5 pr-3 text-right font-normal">Dangling</th>
              <th className="py-1.5 pr-3 text-right font-normal">Pages now</th>
              <th className="py-1.5 font-normal">Result</th>
            </tr>
          </thead>
          <tbody>
            {report.rows.map((r) => (
              <tr key={r.versionId} className="border-b border-border last:border-0 align-top">
                <td className="py-1.5 pr-3">{r.docName}</td>
                <td className="py-1.5 pr-3 font-mono">
                  {r.version}
                  {r.danglingIds.length > 0 && (
                    <div className="text-xs text-muted-foreground">
                      missing: {r.danglingIds.join(", ")}
                    </div>
                  )}
                </td>
                <td className="py-1.5 pr-3 text-right font-mono tabular-nums">{r.legacyRefs}</td>
                <td className="py-1.5 pr-3 text-right font-mono tabular-nums">{r.dangling}</td>
                <td className="py-1.5 pr-3 text-right font-mono tabular-nums">{r.pagesNow}</td>
                <td className="py-1.5">
                  {r.pass ? (
                    <Badge variant="secondary">
                      <CheckCircle2 className="mr-1 h-3 w-3" /> Pass
                    </Badge>
                  ) : (
                    <Badge variant="destructive">
                      <XCircle className="mr-1 h-3 w-3" /> Fail
                    </Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function OrphanList({
  scan,
  disabled,
  onDelete,
}: {
  scan: ScanResult;
  disabled?: boolean;
  onDelete: (ids: string[]) => Promise<void>;
}) {
  if (scan.orphans.length === 0) return null;
  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <p className="font-medium">Orphan pages ({scan.orphans.length})</p>
      <p className="text-muted-foreground">
        Not referenced by any version. They are never changed automatically.
      </p>
      <ul className="space-y-1">
        {scan.orphans.map((o) => (
          <li key={o.ItemId} className="flex justify-between gap-3">
            <span className="truncate">{o.Title || "(untitled)"}</span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {o.CreatedDate ? new Date(o.CreatedDate).toLocaleString() : ""}
            </span>
          </li>
        ))}
      </ul>
      <ConfirmPopover
        trigger={
          <Button size="sm" variant="outline" disabled={disabled}>
            Delete orphans
          </Button>
        }
        title={`Delete ${scan.orphans.length} orphan page(s)?`}
        description="Soft-deletes them. They can be recovered through Blocks."
        confirmLabel="Delete orphans"
        destructive
        onConfirm={() => onDelete(scan.orphans.map((o) => o.ItemId))}
      />
    </div>
  );
}
