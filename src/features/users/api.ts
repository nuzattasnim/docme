/**
 * Frontend client for the Blocks IAM `/iam/me` surface.
 *
 * Per the `blocks-iam-users` skill:
 *   - Browser/runtime calls go through the same Blocks session cookie.
 *   - `x-blocks-key` = PTENANT (the project's tenant id, public).
 *   - `credentials: "include"` sends the HttpOnly SSO cookie set by the
 *     hosted login.
 *   - 401 → session expired; refresh via the auth store, retry once.
 *
 * The IAM API and the data gateway share the same session cookie, but the
 * IAM surface is REST (not GraphQL) — we use plain `fetch` instead of `gql`.
 */

const API = import.meta.env.VITE_BLOCKS_API_URL as string;
const KEY = import.meta.env.VITE_BLOCKS_PROJECT_KEY as string;

const IAM = `${API}/iam/v4/iam`;

/**
 * The "me" payload — the effective identity of the caller.
 *
 * Field shape mirrors the live `/iam/me` response. Fields are optional
 * because legacy records may omit some; UI code should treat them
 * defensively.
 */
export interface Me {
  itemId: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phoneNumber?: string;
  salutation?: string;
  language?: string;
  roles?: string[];
  permissions?: string[];
  active?: boolean;
  status?: number;
  isVerified?: boolean;
  mfaEnabled?: boolean;
  isMfaVerified?: boolean;
  userMfaType?: number;
  externalIdentities?: Array<Record<string, unknown>>;
  attributes?: Record<string, unknown>;
  logInCount?: number;
  lastLoggedInTime?: string;
  /** Object-storage id of the user's avatar image, if any. */
  profileImageId?: string;
  /** Direct URL to the avatar image (may be a CDN / presigned URL). */
  profileImageUrl?: string;
  tags?: string[];
  [key: string]: unknown;
}

/** PATCH /iam/me input shape — caller fills only the fields they want to edit. */
export interface ProfileUpdate {
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  salutation?: string;
  language?: string;
  profileImageId?: string;
  profileImageUrl?: string;
  tags?: string[];
  [key: string]: unknown;
}

export interface Paged<T> {
  totalCount: number;
  data: T[];
}

/** One audit entry returned by `POST /iam/users/timeline`. */
export interface TimelineEntry {
  itemId: string;
  createdDate?: string;
  lastUpdatedDate?: string;
  createdBy?: string;
  lastUpdatedBy?: string;
  tags?: string[];
  /** Snapshot of the user profile / access at this point in time. */
  currentData?: Record<string, unknown>;
  [key: string]: unknown;
}

class IamError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
  ) {
    super(`iam ${status}: ${body || "(empty)"}`);
    this.name = "IamError";
  }
}

/**
 * Wrapper around `fetch` for the IAM REST surface.
 *
 * - Sends `x-blocks-key` and `credentials: "include"` automatically.
 * - Adds `Content-Type: application/json` when a body is present.
 * - On 401: calls `refreshOnce` (the auth-store refresh) and retries once.
 * - Throws `IamError` on any non-2xx.
 */
async function iam<T>(
  path: string,
  init: RequestInit = {},
  refreshOnce?: () => Promise<void>,
): Promise<T> {
  const res = await fetch(`${IAM}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "x-blocks-key": KEY,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });

  if (res.status === 401 && refreshOnce) {
    try {
      await refreshOnce();
    } catch {
      throw new IamError(401, "refresh failed");
    }
    const retried = await fetch(`${IAM}${path}`, {
      ...init,
      credentials: "include",
      headers: {
        "x-blocks-key": KEY,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });
    if (!retried.ok) throw new IamError(retried.status, await retried.text().catch(() => ""));
    return (await retried.json()) as T;
  }

  if (!res.ok) throw new IamError(res.status, await res.text().catch(() => ""));
  return (await res.json()) as T;
}

export const users = {
  /**
   * GET /iam/me — returns the full profile of the signed-in user.
   * 401 means "not logged in"; the auth store surfaces that.
   */
  me: (refreshOnce?: () => Promise<void>) =>
    iam<{ data: Me }>(`/me`, {}, refreshOnce),

  /**
   * Same as `me`, but returns `null` on 401 instead of throwing — useful
   * for the "am I logged in?" check on page load.
   */
  meOrNull: async (refreshOnce?: () => Promise<void>): Promise<Me | null> => {
    try {
      const r = await users.me(refreshOnce);
      return r.data;
    } catch (e) {
      if (e instanceof IamError && e.status === 401) return null;
      throw e;
    }
  },

  /**
   * Edit the caller's own profile.
   *
   * Per the skill, the canonical update path is `POST /iam/users/{id}` with
   * `itemId` in both the path AND the body (so the server can route the
   * update without ambiguity). `PATCH /iam/me` is documented but returns
   * 405 on this install — `POST /iam/users/{self.itemId}` is the working
   * call. We send only the keys we actually want to change so we don't
   * overwrite unrelated fields.
   */
  updateMe: (itemId: string, body: ProfileUpdate) =>
    iam<{ data?: unknown; errors?: Record<string, string> }>(
      `/me`,
      {
        method: "POST",
        body: JSON.stringify({ itemId, ...body }),
      },
    ),

  /**
   * Audit timeline for a user. The swagger lists it as GET-with-body, but
   * a browser fetch can't send a body on GET — and the server accepts
   * POST, so call it as POST from the frontend.
   *
   * Body must include `ItemId` (the timeline subject) plus paging.
   */
  timeline: (
    targetUserId: string,
    page = 0,
    pageSize = 20,
    refreshOnce?: () => Promise<void>,
  ) =>
    iam<{ data?: TimelineEntry[]; errors?: Record<string, string> }>(
      `/users/timeline`,
      {
        method: "POST",
        body: JSON.stringify({
          ItemId: targetUserId,
          page,
          pageSize,
          sort: { property: "createdDate", isDescending: true },
          filter: { event: "" },
        }),
      },
      refreshOnce,
    ),
};

export { IamError };
