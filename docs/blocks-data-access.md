# Blocks data access — spike S0 findings (SPEC2 §6.0)

Project `Dce5c9843b5a64f1394ddadc8be8e7a3a`. CLI `@seliseblocks/cli-os` 0.11.0, SDK `@seliseblocks/client` 0.3.0.
Status: **in progress**. The SPEC2 gate (Q3a, Q3b) is **not yet resolved**, so no Phase 2 configuration or rule work has started.

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
- Probe: Settings → **S0 data-access probe**, in local builds with `VITE_ENABLE_SPIKE=true` (`src/features/access/s0-probe-panel.tsx`, temporary).

## Answers so far

### Q3 — `ruleGroup` structure — open
The CLI passes `ruleGroup` through without reading it: `dist/lib/data-files.js` copies `raw.ruleGroup` as is, and `dist/commands/data/rules/deploy.js` posts it to `/data/v4/data-access/policy/create` (or `…/update`). Neither the CLI nor its docs describe the structure. **Next step:** author rules (a) and (b) in the portal rule editor, then run `blocks data rules pull --json`.

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

### Q1, Q2, Q4, Q5 — open (need signed-in users)
The CLI has no record-level data commands, so these must run in the app (or the browser console via `getBlocksClient()`) as real users:
- **Q1:** as a member of org A, insert a Doc, then read back its `OrganizationId`.
- **Q2:** as a member of org B only, read that Doc by ItemId, with no rules (access level 0 or 2).
- **Q4:** call `iam.me()`, then `auth.switchOrganization({organizationId})`, then `iam.me()` again. Compare the roles and find the active-organization field.
- **Q5:** try `updateDoc` with `{OrganizationId: …}` on a test record.
