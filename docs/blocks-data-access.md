# Blocks data access — spike S0 findings (SPEC2 §6.0)

Project `Dce5c9843b5a64f1394ddadc8be8e7a3a`. CLI `@seliseblocks/cli-os` 0.11.0, SDK `@seliseblocks/client` 0.3.0.
Status: **gate passed; Phase 2 rollout in progress** (updated 2026-11-19; see "Phase 2 rollout" at the end). Q1, Q4 (partly), Q5 and Q7 are answered; Q2 is partly answered. **The SPEC2 gate passed:** Q3(a) and Q3(b) can be expressed as `ruleGroup` conditions, and the server enforces them (see Q3 runs 1–3). Phase 2 IAM and schema configuration is applied; the rules are staged.

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

**Run 1 (2026-11-18, test user `7ec05f5f…`, no roles, active org testorg2): NOT filtered.**
- The user inserted two rows, `Visible: true` and `Visible: false`, and could read both. The rule requires `roles contains clouduser` and `Visible = true`, so it should have returned none.
- `readAccessLevel` was already 3 (Custom), but `blocks data schema list` showed `totalReadPolicies: 0` for S0Probe. The rule was saved but not attached to the live schema.
- Two explanations are open:
  - (i) The gateway was not reloaded after the portal save. `blocks data reload` says it "makes staged schema/rule changes live".
  - (ii) The creator reads through the record's own `Read.UserIds` ACL, which bypasses the rule.
- Run 2 checks both: reload first, then a row whose `Read` ACL names nobody.

**Run 2 (2026-11-18, after `blocks data reload`, same user, no roles): ENFORCED (deny).**
- `getS0Probes` failed with "No policy grants access to this resource." That included a row this user had created, so the record's creator ACL does **not** get around the policy, and explanation (ii) is ruled out.
- A denied read is a GraphQL **error**, not an empty list. Phase 2 code must map it to a "no access" state.
- The record ACL cannot be set by the app: `Read` does not exist on `S0ProbeInsertInput`.
- A positive check of the role condition waits until the docme roles exist.

**Run 3 (2026-11-18): ENFORCED (allow + organization isolation).**
- The policy was replaced, via `blocks data rules deploy` (which also reloads), with `OrganizationId = Auth.organizationId AND Visible = true`.
- In testorg2 the user inserted a `Visible: true` row and a `Visible: false` row. A list returned only the visible row.
- After switching to "test org", the list was empty (`totalCount: 0`, not an error).
- After switching back, the visible row was listed again.
- A policy that matches the caller but not a row **filters** that row. A policy whose caller-side condition (`roles`) fails **denies** the whole query (run 2).

### SPEC2 gate (C12) — **PASSED** (2026-11-18)
- Q3(a), "record `OrganizationId` = caller's active organization", can be expressed and the server enforces it (runs 2 and 3).
- Q3(b), "caller has role X", can be expressed. A caller without the role is refused by the server (run 2).
- The *grant* side of (b) is confirmed once docme roles exist and are granted. That check is the first Phase 2 configuration step.

Notes for Phase 2:
- Rules saved in the portal need `blocks data reload`. `blocks data rules deploy` reloads by itself.
- Policy updates match by `policyName` per schema.

Side findings from run 1:
- **An empty delete is not acknowledged.** `delete<S>(where)` matching nothing returns `acknowledged: false`, `totalImpactedData: 0`, "No data found to DELETE or you don't have permission to DELETE this record." `deleteRecords` now treats this as "already done", so cascade deletes stay resumable.
- **Filter delete removes only one match per call** (confirmed in run 3: two matches took calls returning 1, then 1, then 0). `deleteRecords` now repeats until nothing matches. `publishVersion` now unpublishes the other versions one by one, by id. Earlier doc and version deletes on the dev site may have left pages or versions behind; the migration panel's scan lists them.
- **`auth.switchOrganization` returns 401** once the 15-minute access token has expired, and the SDK does not refresh it. The org switcher must go through `withSession`, as data calls do.

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

## Phase 2 rollout (started 2026-11-19)

### Decisions taken during rollout (delegated by the user)
| # | Decision | Why |
|---|---|---|
| R1 | Organization X = `test org` (`d9f4477c…`), Y = `testorg2` (`2e7eff9c…`). No new organizations created. | They already exist and the test user is in both. Rename them in the portal or CLI whenever real names are known. |
| R2 | The root context `default` is not a docme organization. A user whose only organization is `default` gets the no-organization state; a session that starts in `default` switches to the last-used (else first) real organization. | Every user is a member of `default`, so it can't stand for a team. |
| R3 | Legacy records (OrganizationId `default` or empty) are assigned to X. | §6.5; Q5 allows updating in place. |
| R4 | `docme-editor` and `docme-viewer` get **no** Endpoint permissions; `docme-admin` gets `blocks-iam::iam::users`, `…::manage-user-roles`, `…::roles`, `…::revoke-user-access`. | Q6: a user with no roles already calls `iam/me`, `organizations/my`, `switch-org` and the gateway (S0 runs). The admin permissions cover the users list, `updateAccess`, `roles/assignable`, and `revoke-access` (the Members screen uses it to remove a member's only role, because an empty roles list is ignored). |
| R5 | "A or B" in the §6.1 matrix is written as separate allow policies (one AND group each), not `logicalOperator: 1`. | Only AND (`0`) was observed in S0; S0 run 2 ("No policy grants access") shows the gateway grants when any policy matches. |
| R6 | WRITE (insert) policies check only the role. | Q1: inserts are stamped with the caller's active organization, so an organization check adds nothing. |
| R7 | A column-level EDIT policy on `OrganizationId` requires a role nobody holds (`docme-org-mover-unassigned`). | Q5 security consequence: stops an editor moving a record into another organization. Its server behaviour is unverified (open check 3). |
| R8 | Test user `7ec05f5f…` = `docme-admin` in X, `docme-viewer` in Y. | Lets one account check admin, viewer and switching. |

### Applied with the CLI (dry-run reviewed, then `--yes`)
| Step | Command | Result |
|---|---|---|
| Roles | `blocks iam roles create --slug docme-admin\|docme-editor\|docme-viewer …` | itemIds `a047db0a…`, `bd41f67e…`, `acfebdee…` |
| Admin permissions | `blocks iam roles assign-permissions docme-admin --add-permissions blocks-iam::iam::users,blocks-iam::iam::manage-user-roles,blocks-iam::iam::roles`, then `… blocks-iam::iam::revoke-user-access` | `isSuccess: true`, role `count: 4` |
| Grants | `blocks iam users access grant 7ec05f5f… --organization-id <X> --roles docme-admin`, `… <Y> --roles docme-viewer` | roles now `{"default":[],"<X>":["docme-admin"],"<Y>":["docme-viewer"]}`. The dry-run confirms Q7: a non-empty `roles` list replaces the organization's list; an empty or omitted one is kept. |
| Org config | `blocks iam organizations config save --allow-org-creation-from-signup=false` | `allowOrgCreationFromSignup: false` (A7) |
| Schema | `Page.ReaderVisible` (Boolean, default false) → `blocks data schema push` (reloads) | gateway version 14 |

### Staged, NOT yet deployed
`blocks/data/rules.json` (generated by `node scripts/gen-rules.cjs`): 26 docme allow policies + 3 `OrganizationId` column locks + the S0 probe policy, and 12 security entries (`accessLevel: 3` for READ/WRITE/EDIT/DELETE on Doc, DocVersion, Page). `blocks data rules deploy --dry-run` validates it (30 policies, 12 security entries).

It waits for the in-app steps, in this order (§6 rollout):
1. Deploy the app (push `dev`).
2. Signed in as the admin, with **test org** active: Settings → Organization tools → **Assign to test org**, then **Reconcile**. A second Assign must report 0 pending (C15).
3. `blocks data rules deploy --dry-run`, then `--yes` (it reloads the gateway).
4. Sign out and in again, so the session carries the new roles.

### Open checks (E2E, after the rules are live)
1. Q4 remainder: switching X → Y changes `me().roles` (admin → viewer in the UI). If not, the UI gating is wrong but the server still enforces.
2. Viewer in Y sees only published/active versions; a draft page id returns nothing (C4).
3. Rule R7: editing a doc's name still works for an editor/admin, and `updateDoc(where, {OrganizationId: "<Y>"})` is refused. If every edit is refused instead, remove `LOCK_ORG` from `scripts/gen-rules.cjs`, regenerate and redeploy.
4. C10: as the viewer (Y), `getBlocksClient().iam.users.updateAccess({...})` from the console is refused.
5. The §10 identities other than the test user need accounts (U-ED, U-B, U-NONE, U-NOROLE, U-MULTI); none exist yet.
