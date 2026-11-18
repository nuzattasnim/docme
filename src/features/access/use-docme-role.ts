import { useCallback } from "react";
import { useAuthStore } from "@/features/auth/auth-store";
import { can as canDo, docmeRoleFrom, type DocmeAction, type DocmeRole } from "./roles";

export { ROLE_SLUGS, DOCME_ROLE_SLUGS, docmeRoleFrom, type DocmeRole, type DocmeAction } from "./roles";

/**
 * The signed-in user's docme role in the active organization, from
 * `iam.me().data.roles` (hydrated into the auth store by `<AppShell>`).
 * For showing and hiding controls only — the server enforces access.
 */
export function useDocmeRole(): {
  role: DocmeRole | null;
  can: (action: DocmeAction) => boolean;
} {
  const roles = useAuthStore((s) => s.user?.roles);
  const role = docmeRoleFrom(roles);
  const can = useCallback((action: DocmeAction) => canDo(role, action), [role]);
  return { role, can };
}

/** The active organization id from `iam.me().data.organizationId` (S0 Q4). */
export function useActiveOrganizationId(): string | null {
  return useAuthStore((s) => {
    const id = s.user?.organizationId;
    return typeof id === "string" && id ? id : null;
  });
}
