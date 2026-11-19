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

// ---- SPEC3 §6.1 / §6.2: DocSource and Comment ----
const isCaller = { leftSource: 1, leftOperand: "CreatedBy", operator: 0, rightSource: 0, rightOperand: "userId", rightOperands: [], staticValue: null, description: null };

function spec3(schemaName, op, name, rules, extra = {}) {
  return { ...allow(schemaName, op, name, rules), policyDescription: `SPEC3 ${schemaName} ${op}: ${name}`, ...extra };
}

/** Column-level EDIT policy (policyType 1): only callers matching `rules` may change `fields`. */
function column(schemaName, name, fields, rules) {
  return spec3(schemaName, "EDIT", name, rules, { policyType: 1, fieldNames: fields });
}

const ANCHOR_AND_BODY = ["Body", "AnchorKind", "AnchorExact", "AnchorPrefix", "AnchorSuffix", "AnchorStart", "AnchorEnd"];
const RESOLUTION = ["Status", "ResolvedBy", "ResolvedDate"];

const spec3Policies = [
  // DocSource: every docme role reads (the read-only summary); admins manage.
  spec3("DocSource", "READ", "admin", [ORG, role(ADMIN)]),
  spec3("DocSource", "READ", "editor", [ORG, role(EDITOR)]),
  spec3("DocSource", "READ", "viewer", [ORG, role(VIEWER)]),
  spec3("DocSource", "WRITE", "admin", [role(ADMIN)]),
  spec3("DocSource", "EDIT", "admin", [ORG, role(ADMIN)]),
  spec3("DocSource", "DELETE", "admin", [ORG, role(ADMIN)]),

  // Comment READ / WRITE: editors and admins; viewers only where ReaderVisible.
  spec3("Comment", "READ", "admin", [ORG, role(ADMIN)]),
  spec3("Comment", "READ", "editor", [ORG, role(EDITOR)]),
  spec3("Comment", "READ", "viewer-visible", [ORG, role(VIEWER), isTrue("ReaderVisible")]),
  spec3("Comment", "WRITE", "admin", [role(ADMIN)]),
  spec3("Comment", "WRITE", "editor", [role(EDITOR)]),
  // S0 Q8(b): a WRITE rule that tests a field of the record being inserted.
  spec3("Comment", "WRITE", "viewer-visible", [role(VIEWER), isTrue("ReaderVisible")]),

  // Row-level EDIT: the author, an editor or an admin, in the same organization.
  spec3("Comment", "EDIT", "author", [ORG, isCaller]),
  spec3("Comment", "EDIT", "editor", [ORG, role(EDITOR)]),
  spec3("Comment", "EDIT", "admin", [ORG, role(ADMIN)]),
  // Column-level EDIT (S0 Q8(a)): only the author changes the body and anchor.
  column("Comment", "body-author", ANCHOR_AND_BODY, [isCaller]),
  // SPEC3 decision D1: only editors/admins resolve, reopen, or change visibility —
  // without these, a viewer could resolve their own thread through the author row rule.
  column("Comment", "resolution-editor", RESOLUTION, [role(EDITOR)]),
  column("Comment", "resolution-admin", RESOLUTION, [role(ADMIN)]),
  column("Comment", "readervisible-editor", ["ReaderVisible"], [role(EDITOR)]),
  column("Comment", "readervisible-admin", ["ReaderVisible"], [role(ADMIN)]),

  // DELETE: the author or an admin.
  spec3("Comment", "DELETE", "author", [ORG, isCaller]),
  spec3("Comment", "DELETE", "admin", [ORG, role(ADMIN)]),
];

// S0 Q5: the creator could change OrganizationId. A column-level EDIT policy
// on that field that only a role nobody holds can satisfy keeps every docme
// role from moving a record into another organization. (Its enforcement is
// an E2E check: docs/blocks-data-access.md, "Rules rollout".)
const LOCK_ORG = ["Doc", "DocVersion", "Page", "DocSource", "Comment"].map((schemaName) => ({
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

const security = ["Doc", "DocVersion", "Page", "DocSource", "Comment"].flatMap((schemaName) =>
  [0, 1, 2, 3].map((operation) => ({ schemaName, operation, policyType: 0, accessLevel: 3, fieldNames: [] })),
);

const out = { policies: [...policies, ...spec3Policies, ...LOCK_ORG], security };
fs.writeFileSync(path.join(__dirname, "..", "blocks", "data", "rules.json"), JSON.stringify(out, null, 2) + "\n");
console.log(
  `${policies.length} SPEC2 + ${spec3Policies.length} SPEC3 policies, ${LOCK_ORG.length} org locks, ${security.length} security entries`,
);
