/**
 * Blocks IAM for the signed-in user, through the `@seliseblocks/client` SDK
 * (`blocks-iam-account` / `blocks-iam-users` skills). Every call uses the
 * shared session policy: one refresh on 401, then one retry.
 */
import { getBlocksClient } from "@/lib/blocks/client";
import { SessionExpiredError, isUnauthorized, withSession } from "@/features/auth/session";

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

export const users = {
  /** `iam.me()` — the full profile of the signed-in user. */
  me: async (): Promise<{ data: Me }> => {
    const res = await withSession(() => getBlocksClient().iam.me());
    return { data: res.data as unknown as Me };
  },

  /** Same as `me`, but `null` when there is no valid session. */
  meOrNull: async (): Promise<Me | null> => {
    try {
      return (await users.me()).data ?? null;
    } catch (e) {
      if (e instanceof SessionExpiredError || isUnauthorized(e)) return null;
      throw e;
    }
  },

  /**
   * Edit the caller's own profile (`iam.updateMe`, `POST /iam/v4/iam/me`)
   * with `itemId` in the body. Send only the keys that change.
   */
  updateMe: (itemId: string, body: ProfileUpdate) =>
    withSession(() => getBlocksClient().iam.updateMe({ itemId, ...body })) as Promise<{
      data?: unknown;
      errors?: Record<string, string>;
    }>,

  /**
   * Audit timeline for a user. The SDK has no helper for it, so it goes
   * through the SDK's HTTP client (`POST /iam/v4/iam/users/timeline`).
   */
  timeline: (targetUserId: string, page = 0, pageSize = 20) =>
    withSession(() =>
      getBlocksClient().http.request("/iam/v4/iam/users/timeline", {
        method: "POST",
        body: {
          ItemId: targetUserId,
          page,
          pageSize,
          sort: { property: "createdDate", isDescending: true },
          filter: { event: "" },
        },
      }),
    ) as Promise<{ data?: TimelineEntry[]; errors?: Record<string, string> }>,
};
