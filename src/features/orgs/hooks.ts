import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { create } from "zustand";
import { useAuthStore } from "@/features/auth/auth-store";
import { fetchSessionUser } from "@/features/auth/use-current-user";
import { useRecentDocs } from "@/features/docs/recent-docs";
import { errorMessage } from "@/features/data/errors";
import { fetchMyOrganizations, switchOrganizationOnServer, type Organization } from "./api";
import { MY_ORGS_KEY, switchOrganization } from "./switch";

export function useMyOrganizations(enabled = true) {
  return useQuery<Organization[]>({
    queryKey: MY_ORGS_KEY,
    queryFn: fetchMyOrganizations,
    staleTime: 5 * 60_000,
    enabled,
  });
}

/** True while a switch is in flight; the shell shows a full-content loader. */
export const useOrgSwitching = create<{ switching: boolean; set: (v: boolean) => void }>((set) => ({
  switching: false,
  set: (switching) => set({ switching }),
}));

/**
 * Switch the active organization. Navigates to `/docs` unless
 * `navigateTo` is null (the automatic switch when a session starts in the
 * root context stays on the requested URL).
 */
export function useSwitchOrganization() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const setUser = useAuthStore((s) => s.setUser);
  const setSwitching = useOrgSwitching((s) => s.set);

  return useCallback(
    async (organizationId: string, opts: { navigateTo?: string | null; quiet?: boolean } = {}) => {
      setSwitching(true);
      try {
        await switchOrganization(organizationId, {
          queryClient,
          switchOnServer: switchOrganizationOnServer,
          fetchMe: fetchSessionUser,
          setUser,
          resetRecents: () => useRecentDocs.getState().reset(),
          setRecentsOrganization: (id) => useRecentDocs.getState().setOrganization(id),
        });
        const to = opts.navigateTo === undefined ? "/docs" : opts.navigateTo;
        if (to) navigate(to);
        return true;
      } catch (err) {
        if (!opts.quiet) toast.error(`Couldn't switch organization: ${errorMessage(err)}`);
        return false;
      } finally {
        setSwitching(false);
      }
    },
    [queryClient, navigate, setUser, setSwitching],
  );
}
