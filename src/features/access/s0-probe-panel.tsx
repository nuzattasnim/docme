import { useEffect, useState } from "react";
import { Copy, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getBlocksClient } from "@/lib/blocks/client";
import { gql } from "@/features/data/gateway";
import { errorMessage } from "@/features/data/errors";

/**
 * SPEC2 spike S0 probe — TEMPORARY. Compiled in only when the build sets
 * VITE_ENABLE_SPIKE=true; delete this file once docs/blocks-data-access.md
 * is complete.
 *
 * Every button runs one S0 question as the signed-in user and appends a
 * redacted entry to a log kept in this browser (so it survives signing out
 * and in as another user). "Copy log" puts the whole log on the clipboard.
 * Redaction: token/secret/password values, and names, emails and phone
 * numbers are never recorded.
 */

const LOG_KEY = "docme.s0-probe.log";
const PROBE_KEY = "docme.s0-probe.lastDocId";
const SENSITIVE = /token|secret|password|cookie|email|phone|firstName|lastName|userName|displayName/i;

interface LogEntry {
  q: string;
  at: string;
  user?: string;
  request: unknown;
  response: unknown;
}

function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[…]";
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SENSITIVE.test(k) ? "[redacted]" : redact(v, depth + 1);
    }
    return out;
  }
  if (typeof value === "string" && /^eyJ[\w-]+\.[\w-]+\./.test(value)) return "[redacted jwt]";
  return value;
}

function readLog(): LogEntry[] {
  try {
    return JSON.parse(localStorage.getItem(LOG_KEY) ?? "[]") as LogEntry[];
  } catch {
    return [];
  }
}

function errorBody(err: unknown) {
  const e = err as { status?: number; body?: unknown; message?: string };
  return { error: errorMessage(err), status: e?.status, body: redact(e?.body) };
}

const DOC_FIELDS = "ItemId Name OrganizationId CreatedBy CreatedDate";

export default function S0ProbePanel() {
  const [log, setLog] = useState<LogEntry[]>(readLog);
  const [busy, setBusy] = useState(false);
  const [userId, setUserId] = useState<string>();
  const [orgs, setOrgs] = useState<Array<{ itemId: string; name?: string }>>([]);
  const [docId, setDocId] = useState(() => localStorage.getItem(PROBE_KEY) ?? "");
  const [targetOrg, setTargetOrg] = useState("");

  useEffect(() => {
    try {
      localStorage.setItem(LOG_KEY, JSON.stringify(log));
    } catch {
      /* storage unavailable: the log still shows on screen */
    }
  }, [log]);

  async function step(q: string, request: unknown, run: () => Promise<unknown>) {
    setBusy(true);
    let response: unknown;
    try {
      response = redact(await run());
    } catch (err) {
      response = errorBody(err);
    }
    setLog((l) => [...l, { q, at: new Date().toISOString(), user: userId, request, response }]);
    setBusy(false);
    return response;
  }

  const me = () =>
    step("whoami", "iam.me() + iam.organizations.my()", async () => {
      const client = getBlocksClient();
      const meRes = (await client.iam.me()) as { data?: Record<string, unknown> };
      const data = meRes.data ?? {};
      setUserId(String(data.itemId ?? ""));
      const my = await client.iam.organizations.my();
      const list = (my.organizations ?? []).map((o) => ({
        itemId: String((o as { itemId?: string }).itemId),
        name: (o as { name?: string }).name,
      }));
      setOrgs(list);
      return {
        me: {
          itemId: data.itemId,
          roles: data.roles,
          permissions: data.permissions,
          keys: Object.keys(data),
          orgFields: Object.fromEntries(
            Object.entries(data).filter(([k]) => /org/i.test(k)),
          ),
        },
        myOrganizations: list,
      };
    });

  const q1Insert = () =>
    step("Q1 insert probe Doc", "insertDoc {Name:'S0 probe …', Status:'Active'}", async () => {
      const name = `S0 probe ${new Date().toISOString()}`;
      const ins = await gql<{ insertDoc: { itemId?: string } }>(
        `mutation($input: DocInsertInput!) { insertDoc(input: $input) { acknowledged itemId message } }`,
        { input: { Name: name, Description: "SPEC2 spike S0 — safe to delete", Status: "Active" } },
      );
      const id = ins.insertDoc.itemId ?? "";
      setDocId(id);
      localStorage.setItem(PROBE_KEY, id);
      const read = await readDoc(id);
      return { insert: ins, readBack: read };
    });

  const readDoc = (id: string) =>
    gql<{ getDocs: { totalCount: number; items: unknown[] } }>(
      `query($where: DocFilterInput) { getDocs(where: $where, paging: {pageNo: 1, pageSize: 5}) { totalCount items { ${DOC_FIELDS} } } }`,
      { where: { ItemId: { eq: id } } },
    );

  const q2Read = () =>
    step("Q2 read Doc by id", { ItemId: docId }, async () => {
      const one = await readDoc(docId);
      const all = await gql<{ getDocs: { totalCount: number; items: Array<{ OrganizationId?: string }> } }>(
        `query { getDocs(paging: {pageNo: 1, pageSize: 200}) { totalCount items { ItemId OrganizationId } } }`,
      );
      const byOrg: Record<string, number> = {};
      for (const d of all.getDocs.items) {
        const k = String(d.OrganizationId ?? "(none)");
        byOrg[k] = (byOrg[k] ?? 0) + 1;
      }
      return { byId: one, visibleDocsTotal: all.getDocs.totalCount, visibleDocsByOrganizationId: byOrg };
    });

  const q3Acl = () =>
    step("Q3 record ACL fields", { ItemId: docId }, () =>
      gql(
        `query($where: DocFilterInput) { getDocs(where: $where) { items { ItemId OrganizationId Read { Roles UserIds Permissions } Update { Roles UserIds Permissions } Delete { Roles UserIds Permissions } } } }`,
        { where: { ItemId: { eq: docId } } },
      ),
    );

  const q4Switch = () =>
    step("Q4 switch organization", { organizationId: targetOrg }, async () => {
      const client = getBlocksClient();
      const before = (await client.iam.me()) as { data?: Record<string, unknown> };
      const sw = await client.auth.switchOrganization({ organizationId: targetOrg });
      const after = (await client.iam.me()) as { data?: Record<string, unknown> };
      const pick = (d?: Record<string, unknown>) => ({
        roles: d?.roles,
        permissions: d?.permissions,
        orgFields: Object.fromEntries(Object.entries(d ?? {}).filter(([k]) => /org/i.test(k))),
      });
      return { before: pick(before.data), switchResponseKeys: Object.keys(sw ?? {}), switchResponse: sw, after: pick(after.data) };
    });

  const q5Reassign = () =>
    step("Q5 set OrganizationId on existing Doc", { ItemId: docId, OrganizationId: targetOrg }, async () => {
      const upd = await gql(
        `mutation($where: DocFilterInput, $input: DocUpdateInput!) { updateDoc(where: $where, input: $input) { acknowledged totalImpactedData message } }`,
        { where: { ItemId: { eq: docId } }, input: { OrganizationId: targetOrg } },
      );
      return { update: upd, readBack: await readDoc(docId) };
    });

  const cleanup = () =>
    step("cleanup probe Docs", "deleteDoc where Description = spike marker", () =>
      gql(
        `mutation($where: DocFilterInput) { deleteDoc(where: $where) { acknowledged totalImpactedData message } }`,
        { where: { Description: { eq: "SPEC2 spike S0 — safe to delete" } } },
      ),
    );

  async function copyLog() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(log, null, 2));
      toast.success("S0 log copied");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">S0 data-access probe</CardTitle>
        <CardDescription>
          Temporary. Runs SPEC2 spike questions as the signed-in user ({userId || "click Who am I"}).
          The log is kept in this browser across sign-ins. Names, emails and tokens are never recorded.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={me} disabled={busy}>Who am I</Button>
          <Button size="sm" onClick={q1Insert} disabled={busy}>Q1 insert probe doc</Button>
          <Button size="sm" variant="outline" onClick={q2Read} disabled={busy || !docId}>Q2 read probe doc</Button>
          <Button size="sm" variant="outline" onClick={q3Acl} disabled={busy || !docId}>Q3 record ACL fields</Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="s0-doc">Probe doc ItemId</Label>
            <Input id="s0-doc" value={docId} onChange={(e) => setDocId(e.target.value.trim())} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="s0-org">Target organization</Label>
            <select
              id="s0-org"
              value={targetOrg}
              onChange={(e) => setTargetOrg(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">{orgs.length ? "Choose…" : "Click Who am I first"}</option>
              {orgs.map((o) => (
                <option key={o.itemId} value={o.itemId}>
                  {o.name ?? o.itemId}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={q4Switch} disabled={busy || !targetOrg}>Q4 switch to target org</Button>
          <Button size="sm" variant="outline" onClick={q5Reassign} disabled={busy || !docId || !targetOrg}>Q5 move probe doc to target org</Button>
          <Button size="sm" variant="outline" onClick={cleanup} disabled={busy}>Delete probe docs</Button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
          <span className="text-muted-foreground">{log.length} log entries</span>
          <div className="flex gap-2">
            <Button size="sm" onClick={copyLog} disabled={log.length === 0}>
              <Copy className="h-3.5 w-3.5" /> Copy log
            </Button>
            <Button size="sm" variant="outline" onClick={() => setLog([])} disabled={log.length === 0}>
              <Trash2 className="h-3.5 w-3.5" /> Clear
            </Button>
          </div>
        </div>
        <pre className="max-h-80 overflow-auto rounded-md border bg-muted p-3 text-xs" aria-live="polite">
          {log.length ? JSON.stringify(log.slice(-3), null, 2) : "No entries yet."}
        </pre>
      </CardContent>
    </Card>
  );
}
