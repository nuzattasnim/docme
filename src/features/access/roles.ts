/**
 * docme roles and the SPEC2 §6.1 permission matrix.
 *
 * The Blocks data access rules enforce this matrix on the server. This file
 * only decides which controls the UI shows; hiding a control is never the
 * access check.
 */
export type DocmeRole = "admin" | "editor" | "viewer";

export const ROLE_SLUGS: Record<DocmeRole, string> = {
  admin: "docme-admin",
  editor: "docme-editor",
  viewer: "docme-viewer",
};

export const DOCME_ROLE_SLUGS: readonly string[] = Object.values(ROLE_SLUGS);

export const ROLE_LABELS: Record<DocmeRole, string> = {
  admin: "Admin",
  editor: "Editor",
  viewer: "Viewer",
};

/** Highest first. */
const PRECEDENCE: readonly DocmeRole[] = ["admin", "editor", "viewer"];

/** The highest docme role in `roles` (role slugs), or null when there is none. */
export function docmeRoleFrom(roles: readonly unknown[] | null | undefined): DocmeRole | null {
  if (!roles) return null;
  const slugs = new Set(roles.filter((r): r is string => typeof r === "string"));
  return PRECEDENCE.find((role) => slugs.has(ROLE_SLUGS[role])) ?? null;
}

export function roleFromSlug(slug: string): DocmeRole | null {
  return PRECEDENCE.find((role) => ROLE_SLUGS[role] === slug) ?? null;
}

export type DocmeAction =
  | "doc.create"
  | "doc.edit"
  | "doc.delete"
  | "version.create"
  | "version.publish"
  | "version.delete"
  | "page.write"
  | "members.manage"
  | "source.manage";

const MATRIX: Record<DocmeAction, readonly DocmeRole[]> = {
  "doc.create": ["admin", "editor"],
  "doc.edit": ["admin", "editor"],
  "doc.delete": ["admin"],
  "version.create": ["admin", "editor"],
  "version.publish": ["admin", "editor"],
  "version.delete": ["admin"],
  "page.write": ["admin", "editor"],
  "members.manage": ["admin"],
  "source.manage": ["admin"],
};

export function can(role: DocmeRole | null, action: DocmeAction): boolean {
  return role !== null && MATRIX[action].includes(role);
}
