/**
 * SPEC2 §6.5 — give the migrated legacy records an organization.
 *
 * Records created before Phase 2 carry the root context ("default") or no
 * OrganizationId. S0 Q5 showed OrganizationId can be updated in place, so
 * this updates each such Doc, DocVersion and Page to the target organization
 * by id. It must run BEFORE the §6.1 rules are deployed: once they are,
 * nobody can read (or move) records outside their active organization.
 *
 * Idempotent: a second run finds nothing pending and changes 0 records (C15).
 */
import { listAllRecords, updateRecords, type SchemaName } from "@/features/docs/services";
import { ROOT_ORGANIZATION_ID } from "@/features/orgs/api";

// Only the pre-Phase-2 schemas can hold legacy records; DocSource and Comment
// (SPEC3) are always inserted with the caller's active organization (S0 Q1).
const SCHEMAS = ["Doc", "DocVersion", "Page"] as const satisfies readonly SchemaName[];
type LegacySchema = (typeof SCHEMAS)[number];

interface OrgRow {
  ItemId: string;
  OrganizationId?: string | null;
}

export function isLegacyOrganization(organizationId: string | null | undefined): boolean {
  return !organizationId || organizationId === ROOT_ORGANIZATION_ID;
}

export interface LegacyCounts {
  Doc: number;
  DocVersion: number;
  Page: number;
}

export interface LegacyAssignmentReport {
  organizationId: string;
  pendingBefore: LegacyCounts;
  updated: LegacyCounts;
  pendingAfter: LegacyCounts;
  /** Records per collection that now belong to the organization. */
  inOrganization: LegacyCounts;
}

const zero = (): LegacyCounts => ({ Doc: 0, DocVersion: 0, Page: 0 });

async function readOrgRows(schema: LegacySchema): Promise<OrgRow[]> {
  return listAllRecords<OrgRow>(schema, "ItemId OrganizationId", { pageSize: 200 });
}

export async function scanLegacyOrganization(organizationId: string): Promise<{
  pending: LegacyCounts;
  inOrganization: LegacyCounts;
}> {
  const pending = zero();
  const inOrganization = zero();
  for (const schema of SCHEMAS) {
    const rows = await readOrgRows(schema);
    pending[schema] = rows.filter((r) => isLegacyOrganization(r.OrganizationId)).length;
    inOrganization[schema] = rows.filter((r) => r.OrganizationId === organizationId).length;
  }
  return { pending, inOrganization };
}

export type LegacyProgress = (schema: LegacySchema, done: number, total: number) => void;

/** Move every legacy record into `organizationId`. Docs first, pages last. */
export async function assignLegacyToOrganization(
  organizationId: string,
  onProgress?: LegacyProgress,
): Promise<LegacyAssignmentReport> {
  if (isLegacyOrganization(organizationId)) {
    throw new Error("Pick a real organization, not the root context.");
  }
  const pendingBefore = zero();
  const updated = zero();
  for (const schema of SCHEMAS) {
    const legacy = (await readOrgRows(schema)).filter((r) => isLegacyOrganization(r.OrganizationId));
    pendingBefore[schema] = legacy.length;
    onProgress?.(schema, 0, legacy.length);
    for (const row of legacy) {
      await updateRecords(schema, { ItemId: { eq: row.ItemId } }, { OrganizationId: organizationId });
      updated[schema]++;
      onProgress?.(schema, updated[schema], legacy.length);
    }
  }
  const after = await scanLegacyOrganization(organizationId);
  return {
    organizationId,
    pendingBefore,
    updated,
    pendingAfter: after.pending,
    inOrganization: after.inOrganization,
  };
}
