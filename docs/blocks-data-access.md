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

### Deployed 2026-11-20
`blocks/data/rules.json` (generated by `node scripts/gen-rules.cjs`): 26 docme allow policies + 3 `OrganizationId` column locks + the S0 probe policy, and 12 security entries (`accessLevel: 3` for READ/WRITE/EDIT/DELETE on Doc, DocVersion, Page). `blocks data rules deploy --dry-run` validates it (30 policies, 12 security entries).

Rolled out in this order (§6 rollout):
1. Deploy the app (push `dev`). Done: Release build `35be7fb3…`, 2026-11-19.
2. Signed in as the admin, with **test org** active: Settings → Organization tools → **Assign to test org**, then **Reconcile**. A second Assign must report 0 pending (C15). Done 2026-11-20: 0 pending; test org holds 2 docs, 1 version, 4 pages (one doc has no version); Reconcile checked 1 version, changed 0 pages.
3. `blocks data rules deploy --dry-run`, then `--yes` (it reloads the gateway). Done 2026-11-20: 75/75 saved, gateway v28 (74 changes). `rules pull` returns the same 54 policy names; all five docme schemas show access level 3. `schema list` still shows 0 in its per-schema policy counters (stale counter, see 2026-11-18 note).
4. Sign out and in again, so the session carries the new roles.

### E2E run, 2026-11-20 (deployed dev build, rules live)
Driven by a headless Edge session on the deployed site (hosted login), signed in as test account `docmetest@yopmail.com` (`9d608a0e…`, created for this run, password login). Its role was changed with `blocks iam users access grant|revoke` between stages: editor in X → viewer in X → no role → admin in X + viewer in Y. All writes that could fail open ran on scratch records, which were deleted afterwards.

| Stage | Result | Checks |
|---|---|---|
| Editor (X) | 18/18 pass | create doc/version, publish; edit doc (R7 positive); move doc to Y refused, record stays in X (R7); delete doc/version refused; **Q8(a)**: another user's comment Body refused and unchanged, resolve + reopen allowed (H10); own comment create/edit/delete (H8, H11); `updateAccess` refused (C10); Members page "Admins only" |
| Viewer (X) | 20/20 pass | lists only published/active versions and ReaderVisible pages (C4); draft page by id returns nothing; no hidden comments; doc/page edit and doc insert refused; **Q8(b)**: comment insert with ReaderVisible true allowed, false refused; **D1**: resolving own thread refused (stays Open), hiding own comment refused; own body edit allowed; doc opens published 0.0.2 read-only with no edit controls (H7); Members "Admins only" |
| No role | 7/7 pass | every schema read returns nothing; insert refused; app shows "You're not in an organization yet" (C6) |
| Admin (X) + viewer (Y) | 13/14 pass | admin deletes comments/versions/docs (C9, cleanup); switcher X → Y changes roles admin → viewer (**Q4**); from Y, X's doc, pages and comments return nothing and the doc URL shows "Doc not found" (**C1**); Members in Y "Admins only"; switching back restores admin. **Fail: H8**, see below |

**H8 fails — Members page shows "Couldn't load members — Blocks API 403" for an admin.** `POST /iam/v4/iam/users` and `GET /iam/v4/iam/roles/assignable` return 403. The four R4 permissions were assigned to `docme-admin` in the root `default` organization only (`blocks iam permissions list --roles docme-admin` shows `organizationId: default`); IAM evaluates Endpoint permissions in the active organization. Fix (needs approval): `blocks iam roles assign-permissions docme-admin --organization-id <org> --add-permissions blocks-iam::iam::users,blocks-iam::iam::manage-user-roles,blocks-iam::iam::roles,blocks-iam::iam::revoke-user-access` for X and Y (and for every future organization), then re-run H8.

**Data finding:** version `ace094e8…` ("0.0.1", 4 pages) belongs to Doc `c2eb53cb…`, which no longer exists — left behind by an earlier delete (before the cascade fix for one-record-per-call filter deletes). It is in X and invisible in the UI. Clean up as admin.

**Harness notes:** `switch-org` works only with the hosted-login session cookie; a password-login session gets `401 session_expired`, and a raw `switch-org` call from the page did not change the app's organization — use the app's switcher (avatar menu). Scripts live outside the repo (scratchpad).

### Follow-up, 2026-11-20
- **H8 passes** after the user ran `blocks iam roles assign-permissions docme-admin --organization-id <X|Y> …`: the admin's Members page lists both members.
- **Orphans deleted** (admin session): DocVersion `ace094e8…` and its 4 Pages; nothing left.
- **Version history UI** (commit `712b668`, deployed): 13/13 pass on "Mock Doc." — the Versions dialog offers View / Restore as new version / Make current on non-current versions; View shows the read-only "Viewing version" banner without changing CurrentVersion; Back to current; Restore copies 0.0.2 (4 pages, `SourceVersionId` set) into a new current version; Make current switches back; the temporary version and its pages were deleted afterwards.

### Cleanup, 2026-11-20
- Release secrets: `VITE_ENABLE_MIGRATION`, `VITE_ENABLE_SPIKE`, `VITE_ENABLE_DEV_TOOLS` set to `false` (`blocks release secrets sync --file .env.tools`); effective from the next build. The migration/organization tools and the console helper stay in the repo behind their flags (SPEC1 C10).
- S0 probe removed: `src/features/access/s0-probe-panel.tsx`, `blocks/data/schemas/S0Probe.json`, the `VITE_ENABLE_SPIKE` flag, and the probe policy in `scripts/gen-rules.cjs`. In Blocks: policy `14c203cf…` deleted, schema `S0Probe` (`774efbe9…`) deleted, gateway reloaded (v31). `blocks/data/rules.json` now has 53 policies + 20 security entries.
- Test account `docmetest@yopmail.com` (`9d608a0e…`): roles revoked in test org and testorg2; the account is kept for future E2E runs.

## Phase 3 (SPEC3) — DocSource and Comment (2026-11-19)

### Applied with the CLI (dry-run reviewed, then `--yes`)
| Step | Command | Result |
|---|---|---|
| Schemas | `blocks data schema push` (adds `blocks/data/schemas/{DocSource,Comment}.json`) | DocSource `f5163dd9-3381-46ea-a385-33aa1d699967`, Comment `6f6a8668-b2c0-406f-8c55-7a2a674272b7`; new-schema access **User** (signed-in only) until the rules deploy; gateway v16. Operations: `getDocSources`/`insertDocSource`/…, `getComments`/`insertComment`/…/`deleteManyComment` |
| Indexes | `blocks data schema indexes create --schema-id <id> --fields … [--unique]` | `DocSource.DocId_1` (**unique**), `Comment.PageId_1_CreatedDate_1`, `ParentCommentId_1`, `VersionId_1`, `DocId_1` |
| Validations | `blocks data validation save --file blocks/data/validations/<Schema>.<Field>.json` | `Comment.Body` (not empty, ≤ 5,000), `DocSource.RepoOwner`/`RepoName` (regex), `Branch` (not empty, ≤ 255), `DocsPath` (not empty, ≤ 500) |
| Reload | `blocks data reload` | gateway v27 |
| Release secret | `blocks release secrets sync --file .env.tools` (merge) | adds `VITE_ENABLE_DEV_TOOLS=true` (temporary, for the §10 console helper) |

### Deployed 2026-11-20 (with SPEC2)
`node scripts/gen-rules.cjs` → `blocks/data/rules.json`: 26 SPEC2 + 22 SPEC3 policies, 5 `OrganizationId` locks, the S0 probe policy, and 20 security entries (`accessLevel: 3` on all five schemas). `blocks data rules deploy --dry-run` validates it (54 policies, 20 security entries). It ships in the **same** deploy as SPEC2 (step 3 of "Phase 2 rollout" above), after Assign + Reconcile. Reconcile now also fixes `Comment.ReaderVisible`.

### Decisions taken during implementation (delegated by the user)
| # | Decision | Why |
|---|---|---|
| D1 | Column-level EDIT locks: `Status`/`ResolvedBy`/`ResolvedDate` and `ReaderVisible` are editor/admin only. | The §6.2 row rule lets an author edit their own comment; without these a viewer could resolve their own thread, which the role matrix gives to editors. |
| D2 | A non-admin author can delete a thread root only when every reply is their own; otherwise "ask an admin". | Comment DELETE is author-or-admin (C9) and a refused filter delete looks like an empty one, so deleting the root would orphan other people's replies. |
| D3 | `deletePage` deletes the page's comments, then checks none are left; if some are (an editor can't delete others' comments), it stops with "ask an admin" and keeps the page. | Keeps C9 and H12 (no comments referring to a deleted page) both true. Doc and version deletes are admin-only, so they always clear comments. |
| D4 | Server validations only on fields every record has. Optional fields (`BaselineCommitSha`, anchor fields) are validated client-side. | Unverified how a regex/length validation treats a null field; a refusal there would block replies and Page comments. |
| D5 | The read-only repo summary also shows as one line under the doc title, for every role, when linked. | Viewers can't open the Edit Doc modal (doc.edit), but H3 needs them to see the link. |
| D6 | Renderer source ranges come from one rehype plugin (`content-renderers/source-positions.ts`) used by the Markdown and MDX renderers. | One place, no change to any component override; attributes only (C14). |
| D7 | Fuzzy re-anchoring searches a ±1,100-character slice around the stored start. | Bitap can't accept a match more than `Match_Threshold × Match_Distance` = 400 characters away, so results are identical; p95 for H13 went from 69 ms to 31 ms under a parallel test run. |
| D8 | Renderer tests use `react-dom/server` in the node test environment instead of adding `@testing-library/react`. | Same evidence for H7 without a new devDependency. |

### Open gate: S0 addendum Q8 (C15) — must pass before comment writes rely on the rules
Run after the rules deploy, signed in as the test user, with `window.__docmeDev.comments` (deployed dev build):
1. **Q8(b) insert-field rule.** As a viewer (testorg2): `raw.insertComment({... , ReaderVisible: true})` on a published page succeeds; the same with `ReaderVisible: false` is refused.
2. **Q8(a) column rule.** As an editor: `raw.updateComment(<someone else's id>, {Body: "x"})` is refused; `resolve(<root id>)` succeeds.
3. **D1.** As a viewer: `resolve(<own root id>)` is refused.

If 1 or 2 fails, comment write access is client-only: **stop** (C15), do not build the comment panel on it, and take the evidence to the user.
