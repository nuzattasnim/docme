/**
 * Generates blocks/data/rules.json for SPEC2 §6.1 from the role matrix.
 * Run: node scripts/gen-rules.cjs   (then `blocks data rules deploy --dry-run`)
 *
 * Rule shapes come from spike S0 (docs/blocks-data-access.md, Q3):
 *   source 0 = signed-in user, 1 = record field, 2 = static value
 *   operator 0 = Equal, 6 = Contain; logicalOperator 0 = AND
 * Each allow policy is a single AND group. "A or B" is two allow policies,
 * because the gateway grants access when any policy matches ("No policy
 * grants access to this resource").
 */
const fs = require("fs");
const path = require("path");

const ORG = { leftSource: 1, leftOperand: "OrganizationId", operator: 0, rightSource: 0, rightOperand: "organizationId", rightOperands: [], staticValue: null, description: null };
const role = (slug) => ({ leftSource: 0, leftOperand: "roles", operator: 6, rightSource: 2, rightOperand: "", rightOperands: [], staticValue: slug, description: null });
const isTrue = (field) => ({ leftSource: 1, leftOperand: field, operator: 0, rightSource: 2, rightOperand: "", rightOperands: [], staticValue: "true", description: null });

const OPS = { READ: 0, WRITE: 1, EDIT: 2, DELETE: 3 };
const ADMIN = "docme-admin", EDITOR = "docme-editor", VIEWER = "docme-viewer";

function allow(schemaName, op, name, rules) {
  return {
    schemaName,
    policyName: `docme-${op.toLowerCase()}-${name}`,
    policyDescription: `SPEC2 §6.1 ${schemaName} ${op}: ${name}`,
    policyType: 0,
    operation: OPS[op],
    fieldNames: [],
    ruleGroup: { logicalOperator: 0, rules, nestedGroups: [] },
    priority: 1,
    isAllowPolicy: true,
  };
}

// Inserts are stamped with the caller's active organization (S0 Q1), so
// WRITE needs only the role; READ/EDIT/DELETE also need the same organization.
function common(schema, deleteRoles) {
  return [
    allow(schema, "READ", "admin", [ORG, role(ADMIN)]),
    allow(schema, "READ", "editor", [ORG, role(EDITOR)]),
    allow(schema, "WRITE", "admin", [role(ADMIN)]),
    allow(schema, "WRITE", "editor", [role(EDITOR)]),
    allow(schema, "EDIT", "admin", [ORG, role(ADMIN)]),
    allow(schema, "EDIT", "editor", [ORG, role(EDITOR)]),
    ...deleteRoles.map((r) => allow(schema, "DELETE", r.replace("docme-", ""), [ORG, role(r)])),
  ];
}

const policies = [
  ...common("Doc", [ADMIN]),
  allow("Doc", "READ", "viewer", [ORG, role(VIEWER)]),

  ...common("DocVersion", [ADMIN]),
  allow("DocVersion", "READ", "viewer-published", [ORG, role(VIEWER), isTrue("IsPublished")]),
  allow("DocVersion", "READ", "viewer-active", [ORG, role(VIEWER), isTrue("IsActive")]),

  ...common("Page", [ADMIN, EDITOR]),
  allow("Page", "READ", "viewer-visible", [ORG, role(VIEWER), isTrue("ReaderVisible")]),
];

// S0 Q5: the creator could change OrganizationId. A column-level EDIT policy
// on that field that only a role nobody holds can satisfy keeps every docme
// role from moving a record into another organization. (Its enforcement is
// an E2E check: docs/blocks-data-access.md, "Rules rollout".)
const LOCK_ORG = ["Doc", "DocVersion", "Page"].map((schemaName) => ({
  schemaName,
  policyName: "docme-edit-organizationid-locked",
  policyDescription: "SPEC2: nobody may change OrganizationId after the legacy assignment",
  policyType: 1,
  operation: OPS.EDIT,
  fieldNames: ["OrganizationId"],
  ruleGroup: { logicalOperator: 0, rules: [role("docme-org-mover-unassigned")], nestedGroups: [] },
  priority: 1,
  isAllowPolicy: true,
}));

// S0 probe policy (temporary; removed with the probe).
const s0 = {
  schemaName: "S0Probe", policyName: "Allow",
  policyDescription: "SPEC2 S0 probe: same-org and Visible only (positive test)",
  policyType: 0, operation: 0, fieldNames: [],
  ruleGroup: { logicalOperator: 0, rules: [ORG, isTrue("Visible")], nestedGroups: [] },
  priority: 1, isAllowPolicy: true,
};

const security = ["Doc", "DocVersion", "Page"].flatMap((schemaName) =>
  [0, 1, 2, 3].map((operation) => ({ schemaName, operation, policyType: 0, accessLevel: 3, fieldNames: [] })),
);

const out = { policies: [...policies, ...LOCK_ORG, s0], security };
fs.writeFileSync(path.join(__dirname, "..", "blocks", "data", "rules.json"), JSON.stringify(out, null, 2) + "\n");
console.log(`${policies.length} docme policies, ${security.length} security entries`);
