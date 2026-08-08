import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore, type SessionUser } from "./auth-store";

/**
 * "Am I logged in?" check. Calls GET /iam/v4/iam/me against the session cookie.
 *  200 → user is logged in
 *  401 → not logged in (route to /login)
 *
 * Runs on page load and right after the SSO callback sets the cookie.
 */
export function useCurrentUser() {
  const setUser = useAuthStore((s) => s.setUser);
  const setStatus = useAuthStore((s) => s.setStatus);
  const refresh = useAuthStore((s) => s.refresh);

  const query = useQuery<SessionUser | null>({
    queryKey: ["auth", "me"],
    queryFn: async () => {
      const API = import.meta.env.VITE_BLOCKS_API_URL;
      const PROJECT_KEY = import.meta.env.VITE_BLOCKS_PROJECT_KEY;

      const res = await fetch(`${API}/iam/v4/iam/me`, {
        credentials: "include",
        headers: { "x-blocks-key": PROJECT_KEY },
      });

      if (res.status === 401) {
        // Try refreshing once, then retry.
        try {
          await refresh();
        } catch {
          return null;
        }
        const retried = await fetch(`${API}/iam/v4/iam/me`, {
          credentials: "include",
          headers: { "x-blocks-key": PROJECT_KEY },
        });
        if (!retried.ok) return null;
        const { data } = (await retried.json()) as { data: SessionUser };
        return data;
      }

      if (!res.ok) return null;
      const { data } = (await res.json()) as { data: SessionUser };
      return data;
    },
    staleTime: 60_000,
  });

  // Sync the auth store with the query result.
  useEffect(() => {
    if (query.isLoading) {
      setStatus("loading");
    } else if (query.data) {
      setUser(query.data);
    } else {
      setUser(null);
    }
  }, [query.data, query.isLoading, setUser, setStatus]);

  return query;
}
