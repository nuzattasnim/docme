# SPEC — Organization isolation, roles and server-enforced data access (Phase 2 of 3)

- **Task type:** Feature (confirmed 2026-11-17). Source branch: `dev`.
- **Target repo:** docme
- **Repository:** https://github.com/nuzattasnim/docme
- **Implementation scope:** Frontend (the React SPA in `src/`), plus Blocks project configuration for this project. The configuration covers organizations, roles, role grants, data access rules and a schema field. It is an **external-service prerequisite**: applied only through `blocks … --dry-run`, then the user's approval for that exact change, then `--yes`. No backend code, because this repo has no backend layer.
- **External dependencies:**
  - **SELISE Blocks IAM:** organizations, `auth/switch-org`, `iam/me`, users and access, roles.
  - **SELISE Blocks Data:** the gateway, data access rules, and reload.
  - **`@seliseblocks/client` 0.3.0** and the **`blocks` CLI** (`@seliseblocks/cli-os` 0.11.0).
- **Ecosystem consideration:** Excluded (the user's choice on 2026-11-17). The broad survey was skipped.
- **Work location:** `e:\Blocks\docme`.
  - Allowed: `src/features/auth/**`, `src/features/users/**`, `src/features/storage/**`, `src/features/data/**`, `src/features/docs/**`, `src/features/migration/**`, `src/components/layout/**`, `src/pages/**`, `src/router.tsx`, `README.md`.
  - Proposed new: `src/features/orgs/**`, `src/features/access/**`, `src/features/members/**`, `blocks/data/rules.json`, `blocks/data/schemas/*.json`, `docs/blocks-data-access.md`.
- **GitHub validation:** Ref `dev` @ `45902309c6a74fc7b4346e8af09d976596b0d0c1`. Frontend SPA only (see SPEC1). The local checkout is at the same commit with a clean tree.
- **Phase dependencies:** **Predecessor: Phase 1 ([SPEC1](SPEC1.md))**, which must be complete: schema v2, the SDK data layer, and a verified migration. Phase 3 ([SPEC3](SPEC3.md)) depends on this phase.

---

## 1. GOAL

Make docme safe to use by more than one team. Organization members must never see or change another organization's docs. Inside an organization, the confirmed role matrix must be enforced **by the Blocks server** (data access rules), not only by hidden buttons. Users need to switch organizations, admins need to manage member roles, and the remaining raw Blocks API calls move to the SDK.

**Priority:** security correctness first. A control that exists only in the client doesn't count as access control.

**Success measures:**
- Every negative cross-organization and cross-role test in §10 is refused by the server.
- `grep -rn "fetch(" src` returns only the storage-provider upload URL (not a Blocks API).
- The Phase 1 performance budgets still hold with the rules active.

## 2. USER STORIES

- As a **viewer**, I want to read the published and active versions of my organization's docs, and comment on them in Phase 3, so that I can use the documentation without the risk of changing it.
- As an **editor**, I want to create and edit docs, versions and pages, publish versions and resolve comments, so that I can maintain the documentation.
- As an **admin**, I want to also delete docs and versions, manage the repo link (Phase 3) and assign roles to members, so that I control the organization's documentation and who works on it.
- As a **member of several organizations**, I want to switch the organization I'm working in, so that I see only that organization's docs.

The role matrix was confirmed by the user on 2026-11-17.

## 3. CONTEXT

### Purpose
Multi-org is switched on for the project (`blocks iam organizations config get`, 2026-11-17):
- `isMultiOrgEnabled: true`
- `allowOrgCreationFromSignup / Portal / Cloud: true`
- `isOrgNameUniquenessEnabled: false`
- `isSignupAutoJoinEnabled: false`

However, the project has **0 organizations**, the app has no organization switcher, and Doc, DocVersion and Page have **no data access rules** (`blocks data rules policy get <schema> --json` → `data: []`). Every collection's access level is 0 (Inherited).

### Users and core workflows
- Roles: admin, editor and viewer within an organization.
- Workflows that change:
  - picking or switching the organization;
  - every doc, version and page action (now role-gated);
  - a new admin-only Members screen;
  - a no-organization state;
  - assigning the migrated legacy records to an organization.

### Architecture and ownership
- **Session.** It's an HttpOnly cookie session from hosted OIDC login (`src/lib/blocks/client.ts`, `src/features/auth/*`). `auth.switchOrganization({organizationId})` posts to `/iam/v4/auth/switch-org` and reads the refresh token **from the cookie**; the SDK drops any `refreshToken` in the body (`@seliseblocks/client/dist/auth/auth-client.js:68-74`). So switching works with the cookie session, and the app never holds tokens.
- **Raw `fetch` calls still left at the validated commit:**
  - `src/features/auth/use-current-user.ts:23,35` (`/iam/v4/iam/me`)
  - `src/features/auth/sso.ts:71` (`/iam/v4/oidc/token`)
  - `src/features/auth/logout.ts:16` (`/iam/v4/auth/Logout`)
  - `src/features/users/api.ts:109,125` (IAM)
  - `src/features/storage/api.ts:78,94` (data/files) and `:191` (a PUT to the storage provider's pre-signed URL)
- **Existing UI:**
  - The user menu (`src/components/layout/user-menu.tsx`) and topbar (`app-topbar.tsx`) host the switcher.
  - The settings page (`src/pages/settings-page.tsx`) hosts the Members screen and the migration tools.
  - `recent-docs.ts` stores the last 5 opened docs in `localStorage` with no organization scoping. That leaks across organizations.

### Shared capabilities
- **SDK** (0.3.0, `dist/iam/iam-client.d.ts`):
  - `iam.me()` → `{data:{roles[], permissions[], …}}`
  - `iam.organizations.my()`
  - `iam.users.list`, `iam.users.updateAccess(Record)` and `iam.users.revokeAccess(Record)`. The bodies are untyped; the field names are confirmed in spike S0.
  - `iam.roles.assignable()`
  - `auth.switchOrganization`
- **CLI:**
  - `blocks iam organizations create`
  - `blocks iam roles create`
  - `blocks iam users access grant`. A non-empty `--roles` **replaces** that organization's role list (`AGENT_GUIDE.md` line 366).
  - `blocks data rules pull/deploy`
  - `blocks data sync`
- **Data access rule contract** (CLI `dist/commands/data/rules/deploy.js`):
  - A rule has `policyName`, `policyDescription`, `operation` (0 READ, 1 WRITE, 2 EDIT, 3 DELETE), `policyType` (0 row-level, 1 column-level), `isAllowPolicy`, `priority`, `fieldNames` and `ruleGroup`.
  - Security entries set `accessLevel` (0 Inherited, 1 User, 2 Public, 3 Custom) per operation.
  - **The structure of `ruleGroup`, the read semantics of access levels 0 and 1, and whether reads are filtered by organization by default are not documented anywhere.** This is logged locally in `blocks-reports.md`, and spike S0 resolves it.

### Constraints and conventions
- **Approvals.** Changes to roles, organizations, grants and rules each need the user's explicit approval of a reviewed dry-run (AGENTS.md, and skills `blocks-iam-organizations` and `blocks-iam-access-control`).
- **No agent-initiated provisioning.** Default roles or organizations are never created on the agent's own initiative.
- **Design system:** `docs/design-system.md` (Skeleton, Alert, EmptyState, ConfirmPopover, toast on every mutation).

### Ecosystem review
Excluded by the user's choice, so the broad survey was skipped. The required checks covered:
- docme `dev` @ `4590230`;
- the Blocks SDK 0.3.0 type definitions and JS;
- CLI 0.11.0 `AGENT_GUIDE.md`, `CHANGELOG.md` and `deploy.js`;
- live reads of the organization config, organization list, signup settings, roles list and rule policies (2026-11-17).

## 4. DESIGN CONTRACT

- **References:**
  - `src/components/layout/user-menu.tsx` (dropdown pattern)
  - `app-topbar.tsx`
  - `app-shell.tsx` (auth gate states)
  - `src/pages/settings-page.tsx`
  - `src/components/layout/empty-state.tsx`
  - `docs/design-system.md` §2 and §5
- **Tokens and components** (existing only):

  | Element | Component |
  |---|---|
  | Organization switcher | `DropdownMenu` (group label "Organization", `DropdownMenuRadioGroup` with one item per organization, `Check` icon on the active one) |
  | Active organization name in the topbar | `text-sm font-medium` with `text-muted-foreground` for the label |
  | Switching in progress | full-content `RouteLoading` |
  | No-organization state | `EmptyState` (icon `Building2`) with a sign-out `Button` |
  | No-docme-role state | `EmptyState` (icon `ShieldOff`) |
  | Members table | `Card` containing a `<table>` (`text-sm`, `border-border`), role `Select` per row, `ConfirmPopover` for remove |
  | Change summary before saving | `Dialog` with an Alert-style summary |
  | Role-gated controls | not rendered when the role is missing (viewers don't see edit controls); server refusals shown as `toast.error` plus an `Alert` |

- **Layout and states:**
  - The switcher sits at the top of the user menu, with the topbar showing the active organization name next to the breadcrumbs. On screens narrower than `md` it sits inside the menu only.
  - Members page: `mx-auto max-w-3xl space-y-6`, with loading (Skeleton rows), empty ("No members yet"), error (`Alert` + Retry) and saving (disabled `Select`, spinner in the button) states.
  - Light and dark themes both use the existing CSS variables.
- **Visual verification:**
  - Screenshots at 1440×900 and 390×844, in light and dark, of:
    - the switcher open, with 2 organizations;
    - the no-organization and no-docme-role states;
    - the Members page with 3 members and the change-summary dialog;
    - the doc detail page as viewer versus editor (the edit controls are absent for viewers).
  - Keyboard: the switcher is fully operable with arrow keys and Enter, and focus returns to the trigger.
  - The Members role `Select` has the `aria-label` "Role for <name>".

## 5. PERFORMANCE CONTRACT

- **Affected journeys:**
  - J1/J2 from SPEC1: doc open and page open, now with data access rules evaluated.
  - J8: switching organization, until the docs list is visible.
  - J9: loading the Members page.
- **Baseline:** the SPEC1 after-change measurements (`output/docme/SPEC1-baseline.md` plus the Phase 1 results). J8 and J9 are new, so they get a capture-only first measurement.
- **Budgets:**
  - J1 p95 ≤ 1.5 s and J2 p95 ≤ 1.0 s. These are SPEC1's confirmed budgets, and they must still hold with the rules active.
  - J8 issues ≤ 3 requests (switch-org, `me`, docs list) and fetches nothing from the previous organization afterwards. This is a design bound.
  - J9 issues ≤ 2 requests (users list, assignable roles). This is a design bound.
- **Workload:** the confirmed small-team scale: 200 docs per organization, 100 pages per version, 200 KB per page. Members per organization: up to 50 (A6).
- **Method:** the same as SPEC1 §5 (20 runs, p50/p95 from `performance.mark`, the deployed Release URL, warm cache).
- **Degradation:**
  - If switching fails, the user stays in the current organization and sees a toast.
  - A 403 from the rules is shown as "You don't have permission to …" and never retried.
  - A 401 follows SPEC1's single refresh-and-retry.

## 6. DATA CONTRACTS

### 6.0 Spike S0 (prerequisite; blocks all other Phase 2 work)

This happens in the project, using two throwaway test organizations, `docme-spike-a` and `docme-spike-b`, after the user approves creating them. It may also use the portal's rule editor. Each answer is recorded in `docs/blocks-data-access.md` with the exact request and response evidence (no secrets).

| # | Question | How it's resolved |
|---|---|---|
| Q1 | On insert, is `OrganizationId` set from the caller's active organization? | Insert a test Doc in org A; read back `OrganizationId`. |
| Q2 | With no rules (access level 0), does a member of org B read org A's records? | Read as a user of org B. |
| Q3 | What `ruleGroup` JSON expresses (a) the record's `OrganizationId` equals the caller's active organization, (b) the caller has role slug X, (c) a field equals a constant (`ReaderVisible == true`), (d) `CreatedBy` equals the caller (needed in Phase 3)? | Author each in the portal, then `blocks data rules pull --json`. |
| Q4 | After `switchOrganization`, does `iam.me()` return the roles for the new organization, and which field gives the active organization id? | Call `me` before and after switching. |
| Q5 | Can an update set `OrganizationId` on existing records, and under which role? | Try it on a test record. |
| Q6 | Which Endpoint permissions (`--type 1`) do the docme roles need for the gateway, `iam/me`, `organizations/my`, `users` (admin only) and `switch-org`? | `blocks iam permissions list --type 1 --search …`, then a 403 check with a minimal role. |
| Q7 | What are the exact request body fields for `iam.users.updateAccess` and `revokeAccess` (organization id, role slugs)? | Dry-run `blocks iam users access grant`, then read it back. |

**Gate:**
- If Q3(a) and Q3(b) can be expressed, the server-enforced design below applies.
- If either **cannot** be expressed, Phase 2 stops and goes back to the user with the evidence. Filtering by organization or role **only in the client is not an acceptable fallback**, because it isn't a security control.
- If Q5 says `OrganizationId` can't be updated, §6.5 uses the copy-forward variant.

### 6.1 Blocks configuration (applied after S0, each step dry-run → approval → `--yes`)

1. **Roles.** Create:
   - `docme-admin` (name "docme Admin")
   - `docme-editor` ("docme Editor")
   - `docme-viewer` ("docme Viewer")

   Each gets exactly the Q6 Endpoint permissions its actions need, plus their `dependentPermissions`. Users-admin endpoints go to `docme-admin` only.
2. **Organizations.** Create the initial organization(s) with the names the user gives at rollout.
3. **Grants.** `blocks iam users access grant` for each existing user, with the role the user chooses, per organization.
4. **Org config.** Set `allowOrgCreationFromSignup=false`, so self-signup can't create an organization that has no docme admin (A7). This needs the user's approval like any other change.
5. **Schema.** Add `Page.ReaderVisible` (Boolean, default false). Remove `DocVersion.Pages` after §6.5 is verified.
6. **Data access rules.** Kept in `blocks/data/rules.json` and applied with `blocks data sync`, which reloads. "Org" below means record `OrganizationId` = the caller's active organization (Q3a).

   | Schema | READ | WRITE (insert) | EDIT | DELETE |
   |---|---|---|---|---|
   | Doc | org ∧ any docme role | org ∧ (editor ∨ admin) | org ∧ (editor ∨ admin) | org ∧ admin |
   | DocVersion | org ∧ ((editor ∨ admin) ∨ (viewer ∧ (IsPublished ∨ IsActive))) | org ∧ (editor ∨ admin) | org ∧ (editor ∨ admin) | org ∧ admin |
   | Page | org ∧ ((editor ∨ admin) ∨ (viewer ∧ ReaderVisible)) | org ∧ (editor ∨ admin) | org ∧ (editor ∨ admin) | org ∧ (editor ∨ admin) |

   Security entries set `accessLevel: 3` (Custom) for every operation (0–3) on all three schemas.

### 6.2 `Page.ReaderVisible` (a copy of the version's visibility)

- **Invariant:** `Page.ReaderVisible === (version.IsPublished || version.IsActive)`. It's maintained with one `updateManyPage where {VersionId:{eq}}` call:
  - **Making a version visible** (publish, or mark active): update the version flags first, then the pages.
  - **Hiding a version** (unpublish, mark inactive, or the unpublish step in `publishVersion`): update the pages first, then the version flags.

  With this order, an interrupted operation never shows viewers pages of a hidden version. In the worst case, viewers see a visible version with pages missing.
- New and copied pages get `ReaderVisible` from their target version at insert time.
- **Reconciler.** "Reconcile reader visibility" (admin, in the Phase 1 migration panel, behind the same flag) recomputes the field for every version in the active organization and reports how many records it changed.

### 6.3 Front-end modules (proposed)

- **`src/features/access/use-docme-role.ts`.** Returns `"admin" | "editor" | "viewer" | null` from `iam.me().data.roles`, choosing the highest of `docme-admin` > `docme-editor` > `docme-viewer`. Also exports `can(action)`, with actions `doc.create`, `doc.edit`, `doc.delete`, `version.create`, `version.publish`, `version.delete`, `page.write`, `members.manage` and `source.manage`. These follow the §6.1 matrix and are used only for showing or hiding controls.
- **`src/features/orgs/`:**
  - `useMyOrganizations()` wraps `iam.organizations.my()`.
  - `useActiveOrganizationId()` uses the field Q4 identifies.
  - `switchOrganization(id)` calls `auth.switchOrganization({organizationId:id})`, then `queryClient.clear()`, `useRecentDocs.reset()`, refetches `me`, and navigates to `/docs`.
- **`recent-docs.ts`.** Its localStorage key becomes `docme.recentDocs.<organizationId>`. The old key `docme.recentDocs` is removed when it's first read.
- **`src/features/members/`** (admin only, `/settings/members`):
  - List the active organization's users with their docme role.
  - Change a role: one `updateAccess` per member, using the Q7 shape. The request sends the user's complete docme role set for that organization, because grants replace the list.
  - Remove a member's docme role: `revokeAccess`, or `updateAccess` without docme roles, depending on Q7.
  - Role choices come from `iam.roles.assignable()`, filtered to the three docme slugs.
- **Finishing the SDK move:**
  - `useCurrentUser` → `iam.me()`
  - `refreshSession` → the SDK's OIDC refresh (`auth.oidc.refreshToken()`; the cookie flow is confirmed in S0)
  - `logout` → `auth.logout()`
  - `users/api.ts` → `iam.users.*`
  - `storage/api.ts` → `data.files.*` / `uploadToUrl`
- **Router.** `/settings/members` sits behind a guard that renders a 403 `EmptyState` for anyone who isn't an admin.

### 6.4 Business rules

- **BR1 — at least one admin.** An organization must always keep at least one `docme-admin`. The Members screen refuses to demote or remove the last admin and shows "An organization needs at least one admin".
- **BR2 — no role, no access.** A user with no docme role in the active organization sees the no-docme-role state. Their requests return nothing or 403, which the server enforces.
- **BR3 — viewers' default version.** Viewers open the newest version with `IsPublished`. If none is published, they open the newest with `IsActive`. If neither exists: "This doc has no published version yet".
- **BR4 — organization names.** Names are entered by admins in the portal or CLI. Creating organizations inside the app is out of scope.

### 6.5 Assigning the migrated legacy data to an organization

This runs **before** the §6.1 rules are deployed. Otherwise the legacy records, which have no organization, would become invisible.

- **Q5 says updatable:** "Assign legacy data to organization X" (in the migration panel) updates `OrganizationId` on every Doc, DocVersion and Page that has an empty or default `OrganizationId`. The report shows counts per collection.
- **Q5 says not updatable (copy-forward):**
  1. While in organization X, insert copies of each Doc, DocVersion and Page. Each copy keeps the old ItemId in a `LegacyId` field (String) and has its references remapped.
  2. Verify that the counts match.
  3. Soft-delete the originals only after the user confirms.
  4. Remap `CurrentVersion`, `DocId`, `VersionId` and `SourcePageId` through the LegacyId map.

**Rollout order:**
1. S0
2. Roles, organizations and grants
3. Deploy the app with the switcher and role gating (the rules aren't active yet)
4. §6.5
5. Rules plus `ReaderVisible` backfill (the reconciler), then `data sync`
6. The §10 isolation tests
7. Remove `DocVersion.Pages`

## 7. EXAMPLES

1. **Cross-organization read.** User U-B (an editor in org B only) opens `/docs/<id of a doc in org A>`. The server returns no record (or 403), and the app shows "Doc not found". Nothing from org A appears in the response.
2. **Viewer and drafts.** Doc D has v1 (published, ReaderVisible true) and v2 (draft, IsActive false, ReaderVisible false). Viewer V opens D and sees v1. Querying the gateway for a page of v2 by its ItemId returns nothing.
3. **Viewer writes from the console.** Viewer V runs `getBlocksClient().data.graphql({query:"mutation{updateDoc(...)}"})`. The server refuses it, and the record is unchanged.
4. **Last-admin rule.** Org X has one admin, A. A tries to change their own role to editor. The Save button is disabled and the message reads "An organization needs at least one admin". No `updateAccess` call is sent.
5. **Switching organizations.** A user in orgs X and Y is on `/docs/<doc in X>` and switches to Y. The cache is cleared, `/docs` shows Y's list, the "Recent docs" sidebar shows Y's recent docs (or nothing), and the browser back button doesn't show X's content from cache.

## 8. ACCEPTANCE CRITERIA — HAPPY PATH

- **H1.** WHEN spike S0 is complete THE SYSTEM SHALL have `docs/blocks-data-access.md` with answers to Q1–Q7, each backed by a recorded request/response excerpt (no secrets) and the date.
- **H2.** WHEN the configuration is applied THE SYSTEM SHALL have the roles `docme-admin`, `docme-editor` and `docme-viewer` (`blocks iam roles list --slugs …`), and the rules in `blocks/data/rules.json` deployed and reloaded for Doc, DocVersion and Page (`blocks data rules policy get <schema>` shows them).
- **H3.** WHEN a signed-in user belongs to two or more organizations THE SYSTEM SHALL list them in the user-menu switcher with the active one checked, and show the active organization's name in the topbar.
- **H4.** WHEN a user picks another organization THE SYSTEM SHALL call `auth.switchOrganization`, clear the query cache, refetch `me`, navigate to `/docs`, and show only the new organization's docs, using ≤ 3 requests.
- **H5.** WHEN an editor works in their organization THE SYSTEM SHALL let them create and edit docs, versions and pages and publish versions, with each action succeeding on the server.
- **H6.** WHEN an admin deletes a doc or a version THE SYSTEM SHALL succeed on the server and run the SPEC1 cascade.
- **H7.** WHEN a viewer opens a doc THE SYSTEM SHALL open the BR3 default version and render pages read-only: no add, edit, reorder, delete, publish or new-version controls.
- **H8.** WHEN an admin opens `/settings/members` THE SYSTEM SHALL list the active organization's members with their docme role, and save a role change with exactly one `updateAccess` request after the change-summary dialog is confirmed. The new role takes effect for that member on their next `me` refresh.
- **H9.** WHEN a version is published or marked active (or inactive) THE SYSTEM SHALL keep `Page.ReaderVisible` equal to `IsPublished || IsActive` for every page of that version, writing in the §6.2 order.
- **H10.** WHEN the legacy-assignment tool runs (§6.5) THE SYSTEM SHALL make every legacy Doc, DocVersion and Page belong to the chosen organization, and report counts per collection that match the SPEC1 post-migration counts.
- **H11.** WHEN the app calls Blocks IAM or Data THE SYSTEM SHALL do it through the SDK. `grep -rn "fetch(" src` matches only `src/features/storage/api.ts`'s PUT to the pre-signed storage URL, or nothing at all if `uploadToUrl` is used.
- **H12.** WHEN fixture F-PERF is opened 20 times by an editor with the rules active THE SYSTEM SHALL meet J1 p95 ≤ 1.5 s and J2 p95 ≤ 1.0 s.

## 9. ACCEPTANCE CRITERIA — CRITICAL PATH

- **C1.** IF a member of org B requests a Doc, DocVersion or Page ItemId that belongs to org A (from the UI or directly through the SDK) THE SYSTEM SHALL return no record, or a refusal, from the server, and the UI SHALL show "Doc not found" without revealing the doc's name.
- **C2.** IF a viewer calls insert, update or delete on Doc, DocVersion or Page through the SDK THE SYSTEM SHALL refuse it on the server and leave the record unchanged.
- **C3.** IF an editor calls delete on a Doc or DocVersion through the SDK THE SYSTEM SHALL refuse it on the server. Deleting a Page as an editor still succeeds.
- **C4.** IF a viewer requests a Page or DocVersion of a draft (not published, not active) by ItemId THE SYSTEM SHALL return no record from the server.
- **C5.** IF a user has no docme role in the active organization THE SYSTEM SHALL render the no-docme-role `EmptyState` ("You don't have access to docme in <org>. Ask an admin for a role."), and every docs request from that session SHALL return no records or a refusal.
- **C6.** IF a user belongs to no organization THE SYSTEM SHALL render the no-organization `EmptyState` with Sign out, and make no docs queries.
- **C7.** IF switching organization fails THE SYSTEM SHALL keep the previous organization active, leave the cache untouched, and show `toast.error("Couldn't switch organization: <message>")`.
- **C8.** IF, after a switch, the user goes back to a URL for a doc in the previous organization THE SYSTEM SHALL fetch it fresh, without cached data, and the server SHALL refuse it under C1.
- **C9.** IF an admin tries to demote or remove the organization's last `docme-admin` THE SYSTEM SHALL block it in the UI with "An organization needs at least one admin" and send no IAM request.
- **C10.** IF someone who isn't an admin opens `/settings/members`, or calls `iam.users.updateAccess` through the SDK, THE SYSTEM SHALL render a 403 `EmptyState`, and the server SHALL refuse the IAM call (the role lacks the users-admin Endpoint permission, Q6).
- **C11.** IF updating ReaderVisible fails partway through a publish or unpublish THE SYSTEM SHALL leave viewers unable to read pages of the hidden version (§6.2 order), show `toast.error` with Retry, and the reconciler SHALL restore the invariant (it reports 0 differences after one run).
- **C12.** IF spike S0 finds that organization or role conditions can't be expressed in `ruleGroup` THE SYSTEM SHALL NOT deploy client-only access gating as a substitute. Phase 2 work after S0 stops, and the evidence goes to the user.
- **C13.** IF the "Recent docs" store holds entries from another organization THE SYSTEM SHALL show only the active organization's entries (the key is per organization), and clear the old unscoped key when it's first read.
- **C14.** IF the server refuses a write the role should have been allowed (a misconfigured rule) THE SYSTEM SHALL show "You don't have permission to <action>. Ask an admin." as a toast and an `Alert`, and SHALL NOT retry automatically.
- **C15.** IF the legacy-assignment tool runs again after it completed THE SYSTEM SHALL change 0 records and report 0 pending.

## 10. E2E TEST INSTRUCTIONS

- **Environment:** the deployed Release URL, and local dev for the migration panel (`VITE_ENABLE_MIGRATION=true`). Blocks project `Dce5c9843b5a64f1394ddadc8be8e7a3a` after §6.1.
- **Identities** (test users created by the admin with the user's approval):
  - U-ADM: admin in X
  - U-ED: editor in X
  - U-VW: viewer in X
  - U-B: editor in Y only
  - U-MULTI: editor in X and viewer in Y
  - U-NONE: no organization
  - U-NOROLE: in X with no docme role
- **Fixtures:**
  - In X: doc D with v1 (published, 3 pages) and v2 (draft, 2 pages), plus F-PERF.
  - In Y: doc E with v1 (published).
- **Steps:**
  1. Run S0; review `docs/blocks-data-access.md` (H1).
  2. Check the roles and rules (H2).
  3. As U-MULTI: open the switcher (H3), switch X→Y (H4), press browser Back (C8), check Recent docs (C13).
  4. As U-ED: create, edit and publish (H5). Delete a page (allowed). Delete a doc or version through the SDK console (C3).
  5. As U-ADM: delete v2 and a doc (H6). Open Members (H8). Try to demote yourself while you're the only admin (C9).
  6. As U-VW:
     - open D and see v1 read-only (H7);
     - try `updateDoc` through the console (C2);
     - query a v2 page id (C4);
     - open `/settings/members` and call `updateAccess` through the console (C10).
  7. As U-B: open D's URL and query D's ItemIds through the console (C1).
  8. U-NONE (C6) and U-NOROLE (C5).
  9. Publish v2 while the 2nd `updateManyPage` is blocked → toast; as U-VW you can't read v2 pages; run the reconciler (C11, H9).
  10. Make a role-mismatch refusal by temporarily viewing as a role with a missing permission, in the spike organization only (C14).
  11. Legacy assignment, then run it again (H10, C15).
  12. Grep (H11).
  13. Performance on F-PERF as U-ED (H12).
- **Cleanup:** delete the spike organizations' test records and the test users' grants as the user directs. Leave the production organizations, roles and rules in place.

## 11. OUT OF SCOPE

- Inviting or creating users and organizations inside the app (done through the portal or CLI).
- Custom roles beyond the three docme roles.
- Public (anonymous) reading.
- DocSource and Comment rules (Phase 3; they reuse the S0 findings).
- The visual redesign, AI features and GitHub sync.
- Audit logs.

## 12. VERIFICATION

- **Existing commands** (`e:\Blocks\docme`): `npm run typecheck` and `npm run build`. `npm run test` and `npm run lint` are available once SPEC1's tooling proposals land.
- **Unit tests** (Vitest; SDK mocked):
  - `use-docme-role` precedence and `can()` matrix (H5–H7, C5)
  - switch flow: cache clear, recent reset, navigation, failure path (H4, C7, C13)
  - Members last-admin rule (C9) and the shape of the `updateAccess` body (H8)
  - ReaderVisible write order and the reconciler (H9, C11)
  - legacy assignment, including running it again (H10, C15)
- **Server-side checks.** These can't be mocked. The isolation, role and draft criteria (C1–C4, C10) count only as E2E evidence against the real project. Mocks don't prove them.
- **Blocks configuration evidence:**
  - `blocks iam roles list --json`
  - `blocks data rules policy get Doc|DocVersion|Page --json`
  - `blocks iam organizations list --json`
  - `blocks iam users list --organization-id <X> --json`
  - `blocks iam organizations config get --json`

  Each mutation's dry-run output and the user's approval are recorded in the implementation PR description.
- **Performance:** H12 before and after against SPEC1's after-change numbers, recorded in `output/docme/SPEC2-perf.md`.
- **Design:** the §4 screenshots and the keyboard check.
- **Completion checklist:** H1–H12 and C1–C15, each with its evidence.

## ASSUMPTIONS / DECISIONS

- **A6 — Members per organization.**
  - Decision: plan for up to 50, so the Members list doesn't need paging.
  - Basis: the confirmed "small team" scale.
  - Status: delegated decision.
- **A7 — Organization creation at signup.**
  - Decision: turn off organization creation from signup.
  - Basis: a self-created organization would have no docme admin (BR1).
  - Consequence: organizations are created by the project owner in the portal or CLI.
  - Status: delegated decision. The change itself still needs the user's approval of the CLI dry-run at rollout.
- **A8 — Visibility copied onto Page.**
  - Decision: keep a copy of the version's visibility on Page (`ReaderVisible`).
  - Basis: a row-level rule on Page can't reference its version's fields. Without the copy, viewers could read draft pages by id (security finding).
  - Status: delegated decision ("better quality").
- **A9 — Initial organizations and grants.**
  - Decision: the initial organization names and each user's role are given by the user at rollout, not fixed in this spec.
  - Status: execution-time input; no product question left open.
