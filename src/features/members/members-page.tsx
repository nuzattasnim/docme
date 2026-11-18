import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ArrowLeft, Loader2, RotateCw, ShieldOff, Users } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/layout/empty-state";
import { errorMessage } from "@/features/data/errors";
import { ROLE_LABELS, type DocmeRole } from "@/features/access/roles";
import { useActiveOrganizationId, useDocmeRole } from "@/features/access/use-docme-role";
import { useMyOrganizations } from "@/features/orgs/hooks";
import { LAST_ADMIN_MESSAGE, leavesNoAdmin, planAccessChange, type Member } from "./access";
import { applyAccessChange, listAssignableDocmeRoles, listMembers } from "./api";

const NONE = "none";
type Choice = DocmeRole | typeof NONE;
const label = (r: DocmeRole | null) => (r ? ROLE_LABELS[r] : "No access");

/** `/settings/members` — admins only (SPEC2 H8, C9, C10). */
export function MembersPage() {
  const { can } = useDocmeRole();
  if (!can("members.manage")) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 px-3 pt-4">
        <EmptyState
          icon={<ShieldOff className="h-10 w-10" />}
          title="Admins only"
          description="Only a docme admin of this organization can manage members."
          action={
            <Button asChild variant="outline">
              <Link to="/settings">
                <ArrowLeft /> Back to settings
              </Link>
            </Button>
          }
        />
      </div>
    );
  }
  return <MembersManager />;
}

function MembersManager() {
  const organizationId = useActiveOrganizationId() ?? "";
  const { data: orgs } = useMyOrganizations();
  const orgName = orgs?.find((o) => o.itemId === organizationId)?.name ?? "this organization";
  const qc = useQueryClient();

  // J9: two requests — the member list and the assignable roles.
  const membersQuery = useQuery({
    queryKey: ["members", organizationId],
    queryFn: () => listMembers(organizationId),
    enabled: !!organizationId,
    retry: 1,
  });
  const rolesQuery = useQuery({
    queryKey: ["members", "assignable-roles"],
    queryFn: listAssignableDocmeRoles,
    staleTime: 5 * 60_000,
    retry: 1,
  });

  const [changes, setChanges] = useState<Map<string, DocmeRole | null>>(new Map());
  const [reviewOpen, setReviewOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const members = useMemo(() => membersQuery.data ?? [], [membersQuery.data]);
  const choices: DocmeRole[] = rolesQuery.data?.length ? rolesQuery.data : ["admin", "editor", "viewer"];
  const noAdminLeft = changes.size > 0 && leavesNoAdmin(members, changes);

  function choose(member: Member, choice: Choice) {
    const next = choice === NONE ? null : choice;
    setChanges((prev) => {
      const map = new Map(prev);
      if (next === member.role) map.delete(member.userId);
      else map.set(member.userId, next);
      return map;
    });
  }

  async function save() {
    setSaving(true);
    let done = 0;
    try {
      for (const member of members) {
        if (!changes.has(member.userId)) continue;
        // Exactly one IAM request per changed member.
        await applyAccessChange(planAccessChange(member, organizationId, changes.get(member.userId) ?? null));
        done++;
        setChanges((prev) => {
          const map = new Map(prev);
          map.delete(member.userId);
          return map;
        });
      }
      toast.success(done === 1 ? "Role updated" : `${done} roles updated`);
      setReviewOpen(false);
    } catch (err) {
      toast.error(`Couldn't save role changes: ${errorMessage(err)}`);
    } finally {
      setSaving(false);
      await qc.invalidateQueries({ queryKey: ["members", organizationId] });
    }
  }

  const changed = members.filter((m) => changes.has(m.userId));

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-3 pt-4">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div className="space-y-1.5">
            <CardTitle>Members</CardTitle>
            <CardDescription>
              docme roles in {orgName}. New roles take effect when the member's session next refreshes.
            </CardDescription>
          </div>
          <Button
            size="sm"
            disabled={changes.size === 0 || noAdminLeft || saving}
            onClick={() => setReviewOpen(true)}
          >
            Review changes{changes.size > 0 ? ` (${changes.size})` : ""}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {noAdminLeft && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{LAST_ADMIN_MESSAGE}</AlertDescription>
            </Alert>
          )}
          {membersQuery.isPending ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : membersQuery.error ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Couldn't load members</AlertTitle>
              <AlertDescription className="space-y-3">
                <p>{errorMessage(membersQuery.error)}</p>
                <Button size="sm" variant="outline" onClick={() => membersQuery.refetch()}>
                  <RotateCw className="h-3.5 w-3.5" /> Retry
                </Button>
              </AlertDescription>
            </Alert>
          ) : members.length === 0 ? (
            <EmptyState icon={<Users className="h-10 w-10" />} title="No members yet" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Member</th>
                    <th className="w-44 py-2 font-medium">Role</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((member) => {
                    const pending = changes.has(member.userId);
                    const value: Choice = (pending ? changes.get(member.userId) : member.role) ?? NONE;
                    return (
                      <tr key={member.userId} className="border-b border-border last:border-0">
                        <td className="py-2 pr-3">
                          <div className="font-medium">{member.name}</div>
                          {member.email && member.email !== member.name && (
                            <div className="text-xs text-muted-foreground">{member.email}</div>
                          )}
                        </td>
                        <td className="py-2">
                          <Select
                            value={value}
                            onValueChange={(v) => choose(member, v as Choice)}
                            disabled={saving}
                          >
                            <SelectTrigger aria-label={`Role for ${member.name}`} className={pending ? "border-primary" : ""}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {choices.map((r) => (
                                <SelectItem key={r} value={r}>
                                  {ROLE_LABELS[r]}
                                </SelectItem>
                              ))}
                              <SelectItem value={NONE}>No access</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        isOpen={reviewOpen}
        onClose={() => !saving && setReviewOpen(false)}
        title="Save role changes?"
        description={`These changes apply to ${orgName}.`}
        maxWidthClass="max-w-lg"
      >
        <div className="space-y-4">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <ul className="space-y-1">
                {changed.map((m) => {
                  const next = changes.get(m.userId) ?? null;
                  const leaves = planAccessChange(m, organizationId, next).kind === "revoke";
                  return (
                    <li key={m.userId}>
                      <span className="font-medium">{m.name}</span>: {label(m.role)} → {label(next)}
                      {leaves && <span className="text-muted-foreground"> (removed from the organization)</span>}
                    </li>
                  );
                })}
              </ul>
            </AlertDescription>
          </Alert>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setReviewOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => void save()} disabled={saving || noAdminLeft}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
