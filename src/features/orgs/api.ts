/**
 * Organizations for the signed-in user, through the SDK
 * (`blocks-iam-organizations` skill). Switching is SDK-only: it posts to
 * `/iam/v4/auth/switch-org`, the server reads the refresh token from the
 * HttpOnly cookie and rotates the session cookie (S0 Q4). The app never
 * holds a token.
 */
import { getBlocksClient } from "@/lib/blocks/client";
import { withSession } from "@/features/auth/session";

export interface Organization {
  itemId: string;
  name: string;
}

/**
 * The project's root context. Every user is a member of it, so it is not a
 * docme team: docme treats a user whose only organization is "default" as
 * having no organization (SPEC2 C6), and never lists it in the switcher.
 */
export const ROOT_ORGANIZATION_ID = "default";

export async function fetchMyOrganizations(): Promise<Organization[]> {
  const res = await withSession(() => getBlocksClient().iam.organizations.my());
  return (res.organizations ?? [])
    .map((o) => {
      const r = o as { itemId?: unknown; name?: unknown; isDisabled?: unknown };
      return {
        itemId: typeof r.itemId === "string" ? r.itemId : "",
        name: typeof r.name === "string" && r.name ? r.name : String(r.itemId ?? ""),
        disabled: r.isDisabled === true,
      };
    })
    .filter((o) => o.itemId && o.itemId !== ROOT_ORGANIZATION_ID && !o.disabled)
    .map(({ itemId, name }) => ({ itemId, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Make `organizationId` the session's active organization. Goes through
 * `withSession` because the endpoint answers 401 once the access token has
 * expired and the SDK doesn't refresh it (S0 side finding).
 */
export async function switchOrganizationOnServer(organizationId: string): Promise<void> {
  await withSession(() => getBlocksClient().auth.switchOrganization({ organizationId }));
}
