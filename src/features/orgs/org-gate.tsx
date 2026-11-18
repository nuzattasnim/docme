import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { AlertCircle, Building2, LogOut, RotateCw, ShieldOff } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/layout/empty-state";
import { RouteLoading } from "@/components/layout/route-loading";
import { logout } from "@/features/auth/logout";
import { errorMessage } from "@/features/data/errors";
import { useRecentDocs } from "@/features/docs/recent-docs";
import { useActiveOrganizationId, useDocmeRole } from "@/features/access/use-docme-role";
import { useMyOrganizations, useOrgSwitching, useSwitchOrganization } from "./hooks";
import { preferredOrganization } from "./switch";

/** Routes that work without an organization or a docme role. */
const OPEN_ROUTES = ["/profile"];

/**
 * Organization and role gate for every authenticated route (SPEC2 C5, C6).
 *
 * - switching                    → full-content loader
 * - no organization (besides the root context) → no-organization state, no docs queries
 * - session in the root context  → switch to the last-used (or first) organization
 * - no docme role in the active organization → no-docme-role state
 */
export function OrgGate({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const orgsQuery = useMyOrganizations();
  const orgs = orgsQuery.data;
  const activeId = useActiveOrganizationId();
  const { role } = useDocmeRole();
  const switching = useOrgSwitching((s) => s.switching);
  const switchTo = useSwitchOrganization();
  const setRecentsOrganization = useRecentDocs((s) => s.setOrganization);
  const [autoSwitchError, setAutoSwitchError] = useState<string | null>(null);
  const autoSwitchTried = useRef(false);

  const activeOrg = orgs?.find((o) => o.itemId === activeId) ?? null;
  const open = OPEN_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`));

  useEffect(() => {
    setRecentsOrganization(activeOrg ? activeOrg.itemId : null);
  }, [activeOrg, setRecentsOrganization]);

  async function enterPreferred() {
    if (!orgs) return;
    const target = preferredOrganization(orgs);
    if (!target) return;
    setAutoSwitchError(null);
    const ok = await switchTo(target.itemId, { navigateTo: null, quiet: true });
    if (!ok) setAutoSwitchError(`Couldn't open ${target.name}.`);
  }

  useEffect(() => {
    if (!orgs || orgs.length === 0 || activeOrg || switching || autoSwitchTried.current) return;
    autoSwitchTried.current = true;
    void enterPreferred();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgs, activeOrg, switching]);

  if (open) return <>{children}</>;
  if (switching || orgsQuery.isPending) return <RouteLoading />;

  if (orgsQuery.error) {
    return (
      <GateMessage>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Couldn't load your organizations</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>{errorMessage(orgsQuery.error)}</p>
            <Button size="sm" variant="outline" onClick={() => orgsQuery.refetch()}>
              <RotateCw className="h-3.5 w-3.5" /> Retry
            </Button>
          </AlertDescription>
        </Alert>
      </GateMessage>
    );
  }

  if (!orgs || orgs.length === 0) {
    return (
      <GateMessage>
        <EmptyState
          icon={<Building2 className="h-10 w-10" />}
          title="You're not in an organization yet"
          description="docme works inside an organization. Ask your docme admin to add you to one, then sign in again."
          action={
            <Button variant="outline" onClick={() => void logout()}>
              <LogOut /> Sign out
            </Button>
          }
        />
      </GateMessage>
    );
  }

  if (!activeOrg) {
    if (!autoSwitchError) return <RouteLoading />;
    return (
      <GateMessage>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Couldn't open your organization</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>{autoSwitchError} Pick an organization from the user menu, or retry.</p>
            <Button size="sm" variant="outline" onClick={() => void enterPreferred()}>
              <RotateCw className="h-3.5 w-3.5" /> Retry
            </Button>
          </AlertDescription>
        </Alert>
      </GateMessage>
    );
  }

  if (!role) {
    return (
      <GateMessage>
        <EmptyState
          icon={<ShieldOff className="h-10 w-10" />}
          title="No access to docme here"
          description={`You don't have access to docme in ${activeOrg.name}. Ask an admin for a role.`}
        />
      </GateMessage>
    );
  }

  return <>{children}</>;
}

function GateMessage({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-xl p-6">{children}</div>;
}
