/**
 * The organization switch (SPEC2 §6.3, H4, C7).
 *
 * 1. switch-org on the server. If it fails nothing local changes (C7).
 * 2. `iam.me()` for the new organization's roles.
 * 3. Clear the whole query cache (so Back can't show the previous
 *    organization's data, C8), keep only `me` and the organization list,
 *    load the new organization's recent docs.
 * The docs list that the caller then navigates to is the third request.
 */
import type { QueryClient } from "@tanstack/react-query";
import type { SessionUser } from "@/features/auth/auth-store";
import type { Organization } from "./api";

export const ME_KEYS = [["auth", "me"], ["iam", "me"]] as const;
export const MY_ORGS_KEY = ["orgs", "my"] as const;
export const LAST_ORG_KEY = "docme.lastOrganizationId";

export interface SwitchDeps {
  queryClient: QueryClient;
  switchOnServer: (organizationId: string) => Promise<void>;
  fetchMe: () => Promise<SessionUser | null>;
  setUser: (user: SessionUser | null) => void;
  resetRecents: () => void;
  setRecentsOrganization: (organizationId: string | null) => void;
}

export async function switchOrganization(organizationId: string, deps: SwitchDeps): Promise<SessionUser | null> {
  await deps.switchOnServer(organizationId);

  const orgs = deps.queryClient.getQueryData<Organization[]>(MY_ORGS_KEY);
  deps.resetRecents();
  let me: SessionUser | null = null;
  try {
    me = await deps.fetchMe();
  } finally {
    // The server context has changed even if `me` failed: never keep the
    // previous organization's data.
    deps.queryClient.clear();
    if (orgs) deps.queryClient.setQueryData(MY_ORGS_KEY, orgs);
  }
  for (const key of ME_KEYS) deps.queryClient.setQueryData(key, me);
  deps.setUser(me);
  const activeId = typeof me?.organizationId === "string" ? me.organizationId : organizationId;
  deps.setRecentsOrganization(activeId);
  rememberOrganization(activeId);
  return me;
}

export function rememberOrganization(organizationId: string) {
  try {
    window.localStorage.setItem(LAST_ORG_KEY, organizationId);
  } catch {
    /* storage blocked: the first organization is used next time */
  }
}

/** Which organization to enter when the session starts in the root context. */
export function preferredOrganization(orgs: readonly Organization[]): Organization | null {
  let last: string | null = null;
  try {
    last = window.localStorage.getItem(LAST_ORG_KEY);
  } catch {
    last = null;
  }
  return orgs.find((o) => o.itemId === last) ?? orgs[0] ?? null;
}
