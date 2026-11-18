# Blocks data access — spike S0 findings (SPEC2 §6.0)

Project `Dce5c9843b5a64f1394ddadc8be8e7a3a`. CLI `@seliseblocks/cli-os` 0.11.0, SDK `@seliseblocks/client` 0.3.0.
Status: **in progress** (updated 2026-11-18). Q1, Q4 (partly), Q5 and Q7 are answered; Q2 is partly answered. For the SPEC2 gate, Q3(a) and Q3(b) **can be expressed** as `ruleGroup` conditions. Server enforcement is being checked. No Phase 2 configuration or rule work has started.

## Project state on 2026-11-17 (read-only CLI)

| Item | Command | Result |
|---|---|---|
| Org config | `blocks iam organizations config get --json` | `isMultiOrgEnabled: true`, `allowOrgCreationFromSignup: true`, `allowOrgCreationFromPortal: true`, `allowOrgCreationFromCloud: true`, `isOrgNameUniquenessEnabled: false`, `isSignupAutoJoinEnabled: false` |
| Organizations | `blocks iam organizations list --json` | **2**, not 0 as SPEC2 §3 says: `test org` (`d9f4477c-dbdb-40d1-bcc3-f6e023880cac`) and `testorg2` (`2e7eff9c-98bd-46d0-8618-4c563831496c`), both created 2026-11-17 |
| Roles | `blocks iam roles list --json` | 1 role: `clouduser` ("System User"). No docme roles yet |
| Data policies | `blocks data rules policy get Doc\|DocVersion\|Page --json` | `data: []` for all three |
| Schema access | `blocks data schema list --json` | Doc and Page: read/write/edit/delete level **2 (Public)**; DocVersion: 2/2/2 and delete 1 (User). SPEC2 §3 says 0 (Inherited) |
| Record ACL fields | `blocks data schema list --json` (after the SPEC1 reload) | Every schema now also lists `Create`, `Read`, `Update`, `Delete` (type `OperationAccess`, "Default field from BaseEntity"), each with `Roles`, `UserIds` and `Permissions` (String[]). IAM organization records carry the same `read`/`update`/`delete` shape. **Possibly a record-level ACL that could matter for Q3; not yet tested.** |

## Spike identities and organizations (approved 2026-11-17)

- Organization A: `test org` (`d9f4477c-dbdb-40d1-bcc3-f6e023880cac`); organization B: `testorg2` (`2e7eff9c-98bd-46d0-8618-4c563831496c`).
- Test user `7ec05f5f-4b50-4941-9e16-5bbc7a9e0f8f` is a member of `default`, A **and** B, with no roles in any of them. It is one user in both organizations, not one user per organization.
- The project owner account is the "outside" reader for Q2, assuming it is not a member of A or B (the probe's "Who am I" confirms it).
- Probe: Settings → **S0 data-access probe**, in builds with `VITE_ENABLE_SPIKE=true` (temporarily the deployed dev build) (`src/features/access/s0-probe-panel.tsx`, temporary).

## Answers so far

### Q3 — `ruleGroup` structure — expressible: **yes**; enforcement: being tested
The CLI passes `ruleGroup` through without reading it: `dist/lib/data-files.js` copies `raw.ruleGroup` as is, and `dist/commands/data/rules/deploy.js` posts it to `/data/v4/data-access/policy/create` (or `…/update`). Neither the CLI nor its docs describe the structure. So on 2026-11-18 one READ policy was built in the portal rule editor (S0Probe → Schema access → View) and pulled with `blocks data rules pull --json`:

```json
{
  "schemaName": "S0Probe", "policyName": "Allow", "policyType": 0, "operation": 0,
  "isAllowPolicy": true, "priority": 1, "fieldNames": [],
  "ruleGroup": {
    "logicalOperator": 0,
    "nestedGroups": [],
    "rules": [
      { "leftSource": 1, "leftOperand": "OrganizationId", "operator": 0, "rightSource": 0, "rightOperand": "organizationId", "rightOperands": [], "staticValue": null },
      { "leftSource": 0, "leftOperand": "roles",          "operator": 6, "rightSource": 2, "rightOperand": "",               "rightOperands": [], "staticValue": "clouduser" },
      { "leftSource": 1, "leftOperand": "Visible",        "operator": 0, "rightSource": 2, "rightOperand": "",               "rightOperands": [], "staticValue": "true" },
      { "leftSource": 1, "leftOperand": "CreatedBy",      "operator": 0, "rightSource": 0, "rightOperand": "userId",         "rightOperands": [], "staticValue": null }
    ]
  }
}
```

Meaning (from the editor labels):

| Code | Meaning |
|---|---|
| source `0` | signed-in user ("Auth"): `organizationId`, `userId`, `roles` |
| source `1` | the record (schema field) |
| source `2` | a fixed value (`staticValue`, always a string) |
| operator `0` | Equal |
| operator `6` | Contain (for an array such as `roles`) |
| `logicalOperator` `0` | AND (the editor's "And" rows); `nestedGroups` holds sub-groups |

The editor shows the role `clouduser` as "System User". Saving a View rule also changed the schema's `readAccessLevel` from 1 to 3 (Custom).

- **Q3(a)** "record `OrganizationId` = caller's active organization" → `{leftSource:1, leftOperand:"OrganizationId", operator:0, rightSource:0, rightOperand:"organizationId"}`. **Expressible.**
- **Q3(b)** "caller has role X" → `{leftSource:0, leftOperand:"roles", operator:6, rightSource:2, staticValue:"X"}`. **Expressible.**
- (c) field = constant and (d) `CreatedBy` = caller are also expressible.

**Still to show:** that the gateway *enforces* the rule. The probe panel's "Rule: insert / list rows" buttons do this. Each enforcement run is recorded below.

### Q6 — Endpoint permissions — partial
`blocks iam permissions list --type 1 --search <term> --json`:
- organizations: `blocks-iam::iam::organizations` (View), `…::create-organizations`, `…::mutate-organizations`
- users: `…::manage-user-roles`, `…::mutate-users`, `…::revoke-user-access`, `…::create-users`, `…::activate-users`, `…::deactivate-users`, `…::reset-user-password`, `…::mutate-mfa-configs` (12 in total)
- `switch`: 0 results. The `gateway` search timed out (HTTP 504) and needs a rerun.
- None of the listed permissions has `dependentPermissions`.

Still to do: the gateway, `iam/me` and `switch-org` permissions, and a 403 check with a minimal role.

### Q7 — `updateAccess` / `revokeAccess` bodies — answered (from CLI source; confirm with a dry-run)
- Grant: `POST /iam/v4/iam/users/access` with `{ userId, organizationId, roles?: string[], permissions?: string[] }`. A non-empty `roles` **replaces** the user's role list in that organization (`access-grant.js`).
- Revoke: `POST /iam/v4/iam/users/revoke-access` with `{ userId, organizationId }`. This removes the user's access to the whole organization, not just one role.
- For the Members screen: to remove only the docme role, send `updateAccess` with the user's current roles minus the docme ones; `revokeAccess` would remove them from the organization.

### Probe run, 2026-11-18 (deployed dev build, test user `7ec05f5f…`, no roles; schema access level 2 Public)
Excerpts from the probe log; tokens were redacted by the probe.

### Q1 — insert sets `OrganizationId` from the active organization — answered: **yes**
After `auth.switchOrganization({organizationId: "d9f4477c…"})` (test org), `insertDoc` → readBack `{"OrganizationId": "d9f4477c-dbdb-40d1-bcc3-f6e023880cac", "CreatedBy": "7ec05f5f-…"}`. The record is stamped with the caller's **active** organization, not with `default`.

### Q3 — partial: records carry a per-record ACL
The new record also has `Read`, `Update` and `Delete` objects, each `{"Roles": null, "UserIds": ["7ec05f5f-…"], "Permissions": null}`: the creator is put in all three. At access level 2 (Public) this ACL is **not enforced for reads** (Q2 below). Whether access level 1 (User) or 3 (Custom) enforces it is still unknown. It could express role- or user-based access per record, but not "same organization as the caller", so it does not replace Q3(a).

### Q4 — switching organizations — partly answered
- `iam.me().data.organizationId` is the **active organization id**: `"default"` → `"d9f4477c…"` after switching to test org → `"2e7eff9c…"` after switching to testorg2.
- `auth.switchOrganization` returns `{token_type, expires_in: 900, expires_utc, refresh_expires_utc, scope, id_token, cookie_set}` and rotates the session cookie. The app needs no token in JS.
- `iam.organizations.my()` lists `default` ("Default"), test org and testorg2.
- **Open:** whether `me().roles` changes per organization. The test user has no roles in any organization, so roles were `[]` everywhere. This needs a role granted in one organization only.

### Q2 — cross-organization reads with no rules — partly answered: **not isolated**
With testorg2 active, the test user read the test-org doc by ItemId (`totalCount: 1`), and the unfiltered list returned `{"default": 2, "d9f4477c…": 1}`. At access level 2 (Public) with no rules, **reads are not filtered by the active organization**. Caveat: this user is a member of both organizations and is the record's creator, so a read by a non-member (the project owner account) is still to do.

### Q5 — can `OrganizationId` be updated — answered: **yes, by the creator, with no role**
`updateDoc {OrganizationId: "2e7eff9c…"}` → `acknowledged: true, totalImpactedData: 1`; readBack shows the new `OrganizationId`.
- §6.5 can use the in-place "assign legacy data" variant, not copy-forward.
- **Security consequence:** the §6.1 EDIT rules must also stop non-admins from changing `OrganizationId` (for example a column-level rule on that field, or an EDIT condition on the new value). Otherwise an editor could move a doc into another organization.
