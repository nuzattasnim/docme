/**
 * Members of the active organization, through the SDK's `iam.users.*` and
 * `iam.roles.assignable()` (`blocks-iam-users` skill). The server refuses
 * these for anyone whose role lacks the users-admin Endpoint permissions;
 * only `docme-admin` has them (SPEC2 C10).
 */
import { getBlocksClient } from "@/lib/blocks/client";
import { withSession } from "@/features/auth/session";
import { DOCME_ROLE_SLUGS, roleFromSlug, type DocmeRole } from "@/features/access/roles";
import { toMember, type AccessRequest, type Member } from "./access";

/** Up to 50 members per organization (SPEC2 A6), so one page is enough. */
const PAGE_SIZE = 50;

export async function listMembers(organizationId: string): Promise<Member[]> {
  const res = await withSession(() =>
    getBlocksClient().iam.users.list({
      page: 0,
      pageSize: PAGE_SIZE,
      sort: { property: "firstName", isDescending: false },
      filter: { organizationIds: [organizationId] },
    }),
  );
  const rows = ((res as { data?: unknown }).data ?? []) as Array<Record<string, unknown>>;
  return rows
    .map((u) => toMember(u, organizationId))
    .filter((m): m is Member => m !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** The docme roles this admin may assign, in admin → viewer order. */
export async function listAssignableDocmeRoles(): Promise<DocmeRole[]> {
  const res = await withSession(() => getBlocksClient().iam.roles.assignable());
  const body = res as { data?: unknown; roles?: unknown } | unknown[];
  const list = Array.isArray(body) ? body : Array.isArray(body?.data) ? body.data : Array.isArray(body?.roles) ? body.roles : [];
  const slugs = new Set(
    list
      .map((r) => (typeof r === "string" ? r : (r as { slug?: unknown })?.slug))
      .filter((s): s is string => typeof s === "string"),
  );
  return DOCME_ROLE_SLUGS.filter((s) => slugs.has(s))
    .map(roleFromSlug)
    .filter((r): r is DocmeRole => r !== null);
}

export async function applyAccessChange(req: AccessRequest): Promise<void> {
  const client = getBlocksClient();
  const res = await withSession(() =>
    req.kind === "update" ? client.iam.users.updateAccess(req.body) : client.iam.users.revokeAccess(req.body),
  );
  const r = res as { isSuccess?: boolean; errors?: unknown };
  if (r && r.isSuccess === false) {
    throw new Error(`IAM refused the change: ${JSON.stringify(r.errors ?? {})}`);
  }
}
