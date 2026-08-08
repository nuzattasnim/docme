import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { users, type Me, type ProfileUpdate, type TimelineEntry } from "./api";
import { useAuthStore } from "@/features/auth/auth-store";

/**
 * Auth-state source of truth. `GET /iam/me` succeeds only when the
 * session cookie is valid, so this doubles as the "am I logged in?"
 * probe used by `<AppShell>` and the `RequireAuth` route guard.
 *
 * - Returns `null` (rather than throwing) on 401, so a logged-out state
 *   isn't a retry-worthy error.
 * - On 401 the auth store refreshes once and we retry.
 * - staleTime 60s — the profile rarely changes, but mutations invalidate
 *   the key, so edits show up immediately.
 */
export function useMe() {
  const refresh = useAuthStore((s) => s.refresh);
  return useQuery<Me | null>({
    queryKey: ["iam", "me"],
    queryFn: () => users.meOrNull(() => refresh()),
    staleTime: 60_000,
    retry: false,
  });
}

/** Convenience wrapper for components that just need "is the user in?". */
export function useIsLoggedIn() {
  const { data, isPending } = useMe();
  return { isLoggedIn: !!data, isChecking: isPending, me: data ?? null };
}

/** Gate UI on a single permission string. */
export function useHasPermission() {
  const { data: me } = useMe();
  return (perm: string) => !!me?.permissions?.includes(perm);
}

/**
 * Update the caller's own profile.
 *
 * Underlying call is `POST /iam/users/{itemId}` with `itemId` in the body
 * (PATCH /iam/me returns 405 on this Blocks install — see api.ts).
 * `itemId` is pulled from the cached "me" payload so callers only pass
 * the patch.
 *
 * On success: invalidate the `["iam", "me"]` query so the page re-reads
 * the fresh profile from the server.
 */
export function useUpdateMyProfile() {
  const qc = useQueryClient();
  const me = useAuthStore((s) => s.user);
  return useMutation({
    mutationFn: async (body: ProfileUpdate) => {
      const itemId = me?.itemId;
      if (!itemId) throw new Error("Not signed in");
      return users.updateMe(itemId, body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["iam", "me"] });
    },
  });
}

/**
 * Audit timeline for the given user.
 *
 * Per the skill: the body must include `ItemId`; the server accepts it
 * over POST even though the swagger says GET-with-body. Disabled when
 * `userId` is falsy so we don't fire a no-op query.
 */
export function useMyTimeline(userId: string, pageSize = 20) {
  const refresh = useAuthStore((s) => s.refresh);
  return useQuery<TimelineEntry[]>({
    queryKey: ["iam", "timeline", userId, pageSize],
    queryFn: async () => {
      const res = await users.timeline(userId, 0, pageSize, () => refresh());
      return res.data ?? [];
    },
    enabled: !!userId,
    staleTime: 30_000,
  });
}
