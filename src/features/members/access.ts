/**
 * Pure rules for the Members screen (SPEC2 §6.3, BR1, S0 Q7).
 *
 * IAM grant semantics (`POST /iam/v4/iam/users/access`, from the CLI dry-run):
 * a non-empty `roles` list REPLACES the user's roles in that organization; an
 * empty or omitted list leaves them as they are. `revoke-access` removes the
 * user from the organization entirely.
 */
import { DOCME_ROLE_SLUGS, ROLE_SLUGS, docmeRoleFrom, type DocmeRole } from "@/features/access/roles";

export interface Member {
  userId: string;
  name: string;
  email: string;
  /** Every role the user holds in the organization (docme and others). */
  roles: string[];
  role: DocmeRole | null;
}

export type AccessRequest =
  | { kind: "update"; body: { userId: string; organizationId: string; roles: string[] } }
  | { kind: "revoke"; body: { userId: string; organizationId: string } };

/** The one IAM request that gives `member` the docme role `next` (null = none). */
export function planAccessChange(member: Member, organizationId: string, next: DocmeRole | null): AccessRequest {
  const others = member.roles.filter((r) => !DOCME_ROLE_SLUGS.includes(r));
  if (next) {
    return { kind: "update", body: { userId: member.userId, organizationId, roles: [...others, ROLE_SLUGS[next]] } };
  }
  if (others.length > 0) {
    return { kind: "update", body: { userId: member.userId, organizationId, roles: others } };
  }
  // An empty roles list would be ignored, so removing the only role means
  // leaving the organization.
  return { kind: "revoke", body: { userId: member.userId, organizationId } };
}

export const LAST_ADMIN_MESSAGE = "An organization needs at least one admin";

/** BR1: true when applying `changes` leaves the organization with no admin. */
export function leavesNoAdmin(members: readonly Member[], changes: ReadonlyMap<string, DocmeRole | null>): boolean {
  const admins = members.filter((m) => (changes.has(m.userId) ? changes.get(m.userId) : m.role) === "admin");
  return admins.length === 0;
}

/** Normalise an IAM user record for `organizationId`. */
export function toMember(user: Record<string, unknown>, organizationId: string): Member | null {
  const userId = typeof user.itemId === "string" ? user.itemId : "";
  if (!userId) return null;
  const rolesField = user.roles;
  let roles: string[] = [];
  if (Array.isArray(rolesField)) {
    roles = rolesField.filter((r): r is string => typeof r === "string");
  } else if (rolesField && typeof rolesField === "object") {
    const forOrg = (rolesField as Record<string, unknown>)[organizationId];
    if (Array.isArray(forOrg)) roles = forOrg.filter((r): r is string => typeof r === "string");
  }
  const first = typeof user.firstName === "string" ? user.firstName : "";
  const last = typeof user.lastName === "string" ? user.lastName : "";
  const email = typeof user.email === "string" ? user.email : "";
  const name = `${first} ${last}`.trim() || email || userId;
  return { userId, name, email, roles, role: docmeRoleFrom(roles) };
}
