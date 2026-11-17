import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getBlocksClient } from "@/lib/blocks/client";
import { useAuthStore, type SessionUser } from "./auth-store";
import { SessionExpiredError, isUnauthorized, withSession } from "./session";

/** `iam.me()` → the signed-in user, or null when there is no valid session. */
export async function fetchSessionUser(): Promise<SessionUser | null> {
  try {
    const res = await withSession(() => getBlocksClient().iam.me());
    return (res?.data as SessionUser | undefined) ?? null;
  } catch (err) {
    if (err instanceof SessionExpiredError || isUnauthorized(err)) return null;
    throw err;
  }
}

/**
 * "Am I logged in?" check, through the SDK's `iam.me()` and the shared
 * one-refresh-then-retry session policy. Runs on page load and right after
 * the SSO callback sets the cookie.
 */
export function useCurrentUser() {
  const setUser = useAuthStore((s) => s.setUser);
  const setStatus = useAuthStore((s) => s.setStatus);

  const query = useQuery<SessionUser | null>({
    queryKey: ["auth", "me"],
    queryFn: fetchSessionUser,
    staleTime: 60_000,
  });

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
