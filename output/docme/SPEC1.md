# SPEC â€” Data model v2, SDK data layer and legacy migration (Phase 1 of 3)

- **Task type:** Feature (confirmed 2026-11-17). Source branch: `dev`.
- **Target repo:** docme
- **Repository:** https://github.com/nuzattasnim/docme
- **Implementation scope:** Frontend (the React SPA in `src/`), plus Blocks project configuration for this project, managed as CLI files under `blocks/data/`. The configuration (schema fields, indexes, validations) is an **external-service prerequisite**. It is applied only through `blocks â€¦ --dry-run` followed by a separately approved `--yes`. No backend code, because this repo has no backend layer.
- **External dependencies:**
  - **SELISE Blocks Data gateway** (project `Dce5c9843b5a64f1394ddadc8be8e7a3a`, `https://blocksapi.slsblx.com/data/v4/gateway`). The app reads and writes data through it, and its schemas are configured for this spec.
  - **`@seliseblocks/client` 0.3.0**: the SDK, consumed by the app.
  - **`blocks` CLI** (`@seliseblocks/cli-os` 0.11.0): applies the configuration.
- **Ecosystem consideration:** Excluded. The user chose this on 2026-11-17, so the broad survey was skipped. Only docme and the Blocks contracts it uses were checked.
- **Work location:** `e:\Blocks\docme`.
  - Allowed: `src/features/data/**`, `src/features/docs/**`, `src/pages/settings-page.tsx`, `src/router.tsx`, `src/vite-env.d.ts`, `package.json`, `README.md`.
  - Proposed new: `blocks/data/schemas/*.json`, `src/features/docs/ordering.ts`, `src/features/migration/**`, `src/**/*.test.ts`, `vitest.config.ts`.
- **GitHub validation:**
  - Ref `dev` @ `45902309c6a74fc7b4346e8af09d976596b0d0c1`, resolved with `gh api repos/nuzattasnim/docme/branches/dev` on 2026-11-17.
  - Present: a frontend SPA (`src/main.tsx`, `src/router.tsx`, Vite build) and a static nginx image (`Dockerfile`, `nginx.conf`). No backend/service layer.
  - The local checkout is at the same commit with a clean tree.
- **Phase dependencies:** None (first phase). Phase 2 ([SPEC2](SPEC2.md)) and Phase 3 ([SPEC3](SPEC3.md)) depend on this phase.

---

## 1. GOAL

Make the docme data model correct before the UI is redesigned and AI features are added:

- Each DocVersion owns its own Pages.
- Pages point back to their Doc and Version.
- Page order no longer depends on rewriting one shared array.
- Multi-step writes can be resumed after a failure.
- All Blocks Data access goes through the SDK.
- Existing records are migrated in place, without losing data.

**Priority tradeoff:** correctness and recoverability come before speed of delivery. The user said: "I want better quality of work, doesn't matter the time".

**Success measures** (confirmed outcomes, testable):
- Editing a page in one version never changes another version.
- `src/` contains zero `fetch(` calls to `/data/v4/gateway`.
- After migration, each version's page count equals its legacy page-reference count, minus the dangling references listed in the report.
- Opening a doc meets the confirmed performance targets (Â§5).

**Overall plan.** This spec is the first of four tracks the user listed, in this order:
1. Data: Phases 1â€“3 of this series.
2. UI modernization: also builds the comment panel on top of Phase 3's data layer. A basic repo-link form ships in Phase 3.
3. The AI "revise content" sparkle button.
4. GitHub sync with agent-driven doc updates. This one gets its own discovery first.

## 2. USER STORIES

- As an **editor**, I want a duplicated version to have its own copy of each page, so that editing the new version never changes what readers of the old version see.
- As an **editor**, I want adding, reordering and deleting pages to keep working when a colleague is editing the same doc, so that nobody's page disappears.
- As an **editor**, I want a failed multi-step action (creating a doc, duplicating a version, deleting a doc) to tell me and offer a retry, so that I'm never left with half-created or half-deleted docs.
- As an **admin**, I want the existing docs, versions and pages migrated to the new model, with a report I can check, so that no existing content is lost.

The roles (admin, editor, viewer) were confirmed on 2026-11-17. Phase 2 enforces them. In this phase, every signed-in user can do what an editor does, which is the current behavior. The migration tool is restricted by a build flag (C10).

## 3. CONTEXT

### Purpose
docme stores product documentation as Docs. Each Doc has versions, and each version is an ordered set of pages (Markdown, MDX or raw). This phase is the data foundation for:
- organization isolation and roles (Phase 2);
- the repo link and paragraph comments (Phase 3);
- the redesigned UI, the AI revise feature and GitHub sync, which come later.

### Users and core workflows
- **Roles:** admin, editor and viewer within an organization (confirmed; enforced in Phase 2).
- **Workflows today**, at the validated commit:
  - list and create docs ([`docs-list-page.tsx`]);
  - open a doc and see its current version's pages ([`doc-detail-page.tsx`]);
  - add a page (manually or from a file), edit a page, delete a page, reorder pages;
  - create a version, duplicated or blank ([`add-version-modal.tsx`]);
  - publish a version and set it active or inactive;
  - delete a doc.

### Architecture and ownership
- The SPA owns everything. Blocks Data is the backend; there is no server code.
- The data access chain, from top to bottom:
  - React components;
  - `src/features/docs/hooks.ts` (TanStack Query);
  - `src/features/docs/services.ts`, which holds the GraphQL strings;
  - `src/features/data/gateway.ts` â†’ `gql()`, which **calls `fetch` directly against `${VITE_BLOCKS_API_URL}/data/v4/gateway`**.
- `src/features/data/make-crud.ts` isn't imported anywhere; the only reference is a comment in `hooks.ts:25`.
- The SDK client already exists: `src/lib/blocks/client.ts` â†’ `getBlocksClient()`. It's used for login today.

**Defects found in the source** (at the commit above):
- **D1 (shared pages).** `useCreateDocVersion` passes `previousVersion.Pages` into the new version ([`hooks.ts:119-134`]). Both versions point at the same Page records, so editing a page in v2 changes v1.
- **D2 (cascading delete).** `useDeleteDocVersion` deletes every page in `version.Pages` ([`hooks.ts:144-159`]). That deletes pages that other versions still use (follows from D1).
- **D3 (lost updates).** `useAddPage` and `useDeletePage` read `currentVersion.Pages`, change it, and write it back ([`hooks.ts:227-267`]). If two editors do this at the same time, one change is lost.
- **D4 (partial failures).** `useCreateDoc`, `useCreateDocVersion` and `usePublishVersion` make 2â€“3 separate writes with no recovery ([`hooks.ts:56-71`], [`hooks.ts:161-176`]). A failure partway through leaves a Doc with no version, a version that isn't current, or two published versions.
- **D5 (no back-reference).** Pages have no `DocId` or `VersionId`, so a page can't be found from its doc. Orphaned pages are invisible.
- **D6 (rule violation).** Data access uses raw `fetch`, which AGENTS.md (Blocks section) forbids: "Never raw fetch/curl against the Blocks API".

**Live Blocks schema**, from `blocks data schema list --json` on 2026-11-17. Every collection has access level 0 and no policies or validations.

| Collection | Schema | Custom fields |
|---|---|---|
| `sb_Docs` | `Doc` | `Name`, `Description`, `CurrentVersion` (String) |
| `sb_DocVersions` | `DocVersion` | `DocId`, `Version` (String), `Pages` (String[]), `IsPublished`, `IsActive` (Boolean) |
| `sb_Pages` | `Page` | `Title`, `ContentType`, `Content` (String) |

Every collection also has the system fields `ItemId`, `CreatedDate`, `LastUpdatedDate`, `CreatedBy`, `LastUpdatedBy`, `Language`, `OrganizationId` and `Tags`.

### Shared capabilities
- **SDK data API** (`node_modules/@seliseblocks/client/dist/data/types.d.ts`, version 0.3.0):
  - `data.collection<T>(schemaName,{fields})`, with `list`, `get`, `create`, `update` and `delete`. `delete` soft-deletes unless `{hardDelete:true}` is passed (`data-client.js:319`).
  - `data.graphql({query, variables, operationName})` â†’ `Promise<unknown>`.
  - Bulk mutations `insertMany<Schema>`, `updateMany<Schema>` and `deleteMany<Schema>` are available through `data.graphql` (skill `blocks-data-gateway-crud`).
  - There are no multi-document transactions.
- **Schema field types:** `String`, `Int`, `Float`, `Boolean`, `DateTime`, `ID`, `GeoJson` (skill `blocks-data-gateway-configuration`).
- **Validations:** `blocks data validation save` (NotEmpty, MaxLength, â€¦).
- **Indexes:** `blocks data schema indexes create`.
- **Going live:** `blocks data sync` is the only flow that guarantees a reload, so changes actually go live.
- **No record-level CLI.** There's no CLI command to read or write records (`blocks help data`, 64 commands). The migration therefore has to run inside the app, through the SDK, as a signed-in user. This gap is logged locally in `blocks-reports.md`.
- **Existing design system:** `docs/design-system.md`, `src/components/ui/*` and `src/components/layout/*`.

### Constraints and conventions
- AGENTS.md (Blocks section):
  - SDK only;
  - never read CLI token or config files;
  - never expose secrets;
  - every CLI mutation runs `--dry-run` before `--yes`, with explicit approval;
  - no AI-tool attribution anywhere in the repo.
- Session cookies require HTTPS on the project domain (README "Common gotchas").
- Pages inside the app shell follow `docs/design-system.md` Â§5: Skeleton, Alert, EmptyState and ConfirmPopover, and a toast on every mutation.
- **Tooling gaps at the validated commit:**
  - no test runner;
  - no CI (`.github/` is absent);
  - `npm run lint` calls `eslint`, which isn't in `devDependencies`.

### Ecosystem review
Excluded by the user's choice (2026-11-17), so the broad survey was skipped. The required checks covered:
- docme `dev` @ `4590230` (deep-read of `src/features/**` and `src/lib/blocks/**`);
- the Blocks contracts: SDK 0.3.0 type definitions, CLI 0.11.0 `AGENT_GUIDE.md` and command help, and the live schema list.

No overlap claims are made beyond that scope.

[`docs-list-page.tsx`]: https://github.com/nuzattasnim/docme/blob/45902309c6a74fc7b4346e8af09d976596b0d0c1/src/features/docs/docs-list-page.tsx
[`doc-detail-page.tsx`]: https://github.com/nuzattasnim/docme/blob/45902309c6a74fc7b4346e8af09d976596b0d0c1/src/features/docs/doc-detail-page.tsx
[`add-version-modal.tsx`]: https://github.com/nuzattasnim/docme/blob/45902309c6a74fc7b4346e8af09d976596b0d0c1/src/features/docs/components/add-version-modal.tsx
[`hooks.ts:119-134`]: https://github.com/nuzattasnim/docme/blob/45902309c6a74fc7b4346e8af09d976596b0d0c1/src/features/docs/hooks.ts#L119-L134
[`hooks.ts:144-159`]: https://github.com/nuzattasnim/docme/blob/45902309c6a74fc7b4346e8af09d976596b0d0c1/src/features/docs/hooks.ts#L144-L159
[`hooks.ts:227-267`]: https://github.com/nuzattasnim/docme/blob/45902309c6a74fc7b4346e8af09d976596b0d0c1/src/features/docs/hooks.ts#L227-L267
[`hooks.ts:56-71`]: https://github.com/nuzattasnim/docme/blob/45902309c6a74fc7b4346e8af09d976596b0d0c1/src/features/docs/hooks.ts#L56-L71
[`hooks.ts:161-176`]: https://github.com/nuzattasnim/docme/blob/45902309c6a74fc7b4346e8af09d976596b0d0c1/src/features/docs/hooks.ts#L161-L176

## 4. DESIGN CONTRACT

This phase only adds **state UI** inside existing screens. The full visual redesign is a separate later spec.

- **References:**
  - `src/pages/settings-page.tsx`, which hosts the migration panel;
  - `src/features/docs/components/version-card.tsx` and `version-status-badges.tsx`, for the version states;
  - `src/features/docs/docs-list-page.tsx`, for the doc row states;
  - `docs/design-system.md` Â§2 (tokens) and Â§5 (conventions).
- **Tokens and components** (existing ones only; no new tokens):

  | Element | Component |
  |---|---|
  | Migration panel | `Card` / `CardHeader` / `CardContent` |
  | Counts table | plain `<table>` with `text-sm`, `border-border` |
  | Run button | `Button` |
  | Orphan delete | `ConfirmPopover` (destructive) |
  | Version "Copying", "Copy failed" and "Needs migration" states | `Badge` (variant `secondary` / `destructive`), plus `Alert` with a Retry `Button` |
  | Doc row "Deletion incomplete" | `Badge` `destructive`, plus a Retry `Button` (`size="sm"`, `variant="outline"`) |
  | Disabled delete with a reason | `Tooltip` around a disabled `Button` |
  | All feedback | `toast` (sonner) |

- **Layout and states:**
  - The migration panel is one `Card` inside the existing Settings page column (`mx-auto max-w-3xl space-y-6`). It moves through these states: idle â†’ scanning (`Skeleton` rows) â†’ scan result â†’ running (progress text "Migrating version 3 of 12â€¦", announced with `aria-live="polite"`) â†’ verification report â†’ error (`Alert` destructive, with Retry).
  - Version states appear in `VersionCard`.
  - Typography follows design-system Â§2.4 (CardTitle `text-lg font-semibold`, body `text-sm`).
  - Light and dark themes both use the existing CSS variables.
- **Visual verification:**
  - Screenshots at 1440Ã—900 and 390Ã—844, in light and dark, of:
    - the migration panel in its scan-result and report states;
    - the version card in its Copying, Copy-failed and Needs-migration states;
    - a doc row with "Deletion incomplete".
  - Compare each with the current Settings page and VersionCard: same Card padding, type scale and colors, with the new badge or alert as the only difference.
  - Every new control can be reached with the keyboard and has a visible focus ring (`focus-visible:ring-2 ring-ring`).

## 5. PERFORMANCE CONTRACT

- **Affected journeys:**
  - J1: open a doc, until the page list is visible.
  - J2: select a page, until its content is visible.
  - J3: add a page.
  - J4: save a reorder.
  - J5: duplicate a version.
  - J6: delete a doc.
  - J7: migration scan and run.
- **Baseline:** not measured yet. **Prerequisite (before any code change):** capture J1â€“J4, J5 and J6 at commit `4590230`. Use fixture F-PERF on the deployed Release URL and the method below. Record the results in `output/docme/SPEC1-baseline.md`. Until then, the baseline values are unknown.
- **Workload** (confirmed "small team" scale): up to 200 docs per organization, 100 pages per version and 200 KB of content per page.
- **Fixture F-PERF:** 1 doc, 1 version, 100 pages of about 200 KB each, plus 199 small filler docs.
- **Budgets:**

  | Journey | Budget | Status |
  |---|---|---|
  | J1 (page list visible) | p95 â‰¤ 1.5 s | confirmed |
  | J2 (page content visible) | p95 â‰¤ 1.0 s | confirmed |
  | J1 request count | â‰¤ 3 gateway requests: Doc, Version, page titles | design bound |
  | J3 (add page) | 2 gateway requests: read the highest SortOrder, insert the Page | design bound |
  | J5 (duplicate version) | âŒˆn/20âŒ‰ + 3 requests (n = page count), progress shown, no time budget | design bound |

  - J1 never fetches `Content`, so the size of the list request doesn't depend on page size.
  - The design bounds follow from the design; they aren't response-time targets.
- **Method:**
  - Chrome on the reference machine (record its CPU and RAM in the baseline file), DevTools network "No throttling", warm cache.
  - 20 runs per journey. Report the p50 and p95 of `performance.measure` spans.
  - **Proposed tooling:** `src/lib/perf.ts` adds `performance.mark` calls (`doc-open:start`, `doc-open:list-visible`, `page:content-visible`). They're enabled when `VITE_PERF_MARKS=true` and logged with `console.table`.
- **Overload and degradation:**
  - Reads use TanStack Query's default of 3 retries with exponential backoff, then show an `Alert` with Retry.
  - Writes are never retried automatically. Resumable operations (J5, J6, J7) expose an explicit Retry that is idempotent.
  - Bulk inserts are sent in chunks of at most 20 pages **and** at most 2 MB of serialized payload per request (A3).

## 6. DATA CONTRACTS

### 6.1 Schema changes

These changes are additive and backward-compatible. They're kept in `blocks/data/schemas/{Doc,DocVersion,Page}.json`, created with `blocks data schema pull`, and applied with `blocks data sync`.

**Doc**

| Field | Type | Required | Rule / default | Notes |
|---|---|---|---|---|
| `Name` | String | yes | not empty, â‰¤ 200 characters | existing |
| `Description` | String | no | â‰¤ 2,000 characters | existing |
| `CurrentVersion` | String | no | an ItemId of a DocVersion with the same `DocId` | existing. The version editors open by default. |
| `Status` | String | yes (new writes) | `"Active"` \| `"Deleting"`, default `"Active"` | **new.** A missing value is read as `"Active"`. |

**DocVersion**

| Field | Type | Required | Rule / default | Notes |
|---|---|---|---|---|
| `DocId` | String | yes | ItemId of a Doc | existing |
| `Version` | String | yes | not empty, â‰¤ 50 characters, unique per `DocId` (checked in the app) | existing |
| `IsPublished` | Boolean | yes | default `false`; at most one `true` per `DocId` (the system converges to this, Â§6.3) | existing |
| `IsActive` | Boolean | yes | default `false` for new versions | existing. Controls whether a non-published version is listed for viewers (Phase 2), so a new draft stays hidden from viewers until an editor lists or publishes it. Migrated versions keep their stored value; a missing value is read as `false`. |
| `Pages` | String[] | â€” | **deprecated.** Read only by the migration; never written by new code. | existing; kept until Phase 2 cleanup |
| `Status` | String | yes (new writes) | `"Ready"` \| `"Copying"` \| `"CopyFailed"` | **new** |
| `SourceVersionId` | String | no | the ItemId it was duplicated from | **new** |
| `SchemaVersion` | Int | yes (new writes) | `2`. A missing value means legacy (unmigrated). | **new** |

**Page**

| Field | Type | Required | Rule / default | Notes |
|---|---|---|---|---|
| `DocId` | String | yes (v2) | ItemId of a Doc | **new** |
| `VersionId` | String | yes (v2) | ItemId of a DocVersion | **new** |
| `Title` | String | yes | not empty, â‰¤ 200 characters | existing |
| `ContentType` | String | yes | `"md"` \| `"mdx"` \| any other value, which renders as raw (`content-renderers/registry.tsx`); default `"md"` | existing |
| `Content` | String | no | â‰¤ 204,800 characters (200 KB) | existing |
| `SortOrder` | Float | yes (v2) | > 0; spaced 1024 apart when assigned | **new** |
| `SourcePageId` | String | no | the ItemId of the page it was copied from | **new** |

**Indexes** (`blocks data schema indexes create`):
- `Page(VersionId, SortOrder)`
- `Page(DocId)`
- `DocVersion(DocId)`

**Validations** (`blocks data validation save`): NotEmpty and MaxLength, as listed in the tables above. The app checks the same limits before sending anything (C7).

### 6.2 Service layer (proposed module contract)

All of these go through `getBlocksClient().data.graphql`.

`src/features/data/gateway.ts` keeps the exported signature `gql<T>(query, variables): Promise<T>`, but is reimplemented on the SDK:
- If the response has an `errors[]` array, it throws `GraphQLError` with the messages joined by `"; "`.
- If `data` is missing, it throws `Error("Gateway returned empty data")`.
- An HTTP 401 (`BlocksApiError.status === 401`) triggers one call to `useAuthStore.getState().refresh()`, then exactly one retry. If the refresh fails, the error is rethrown and the auth store moves to `unauthenticated`.
- `make-crud.ts` is deleted.

| Function | Input | Output | Writes, in order |
|---|---|---|---|
| `createDoc` | `{name, description?}` | `{docId, versionId}` | 1. insert Doc{Status:"Active"} 2. insert DocVersion{DocId, Version:"0.0.1", Status:"Ready", SchemaVersion:2, IsPublished:false, IsActive:false} 3. update Doc.CurrentVersion |
| `ensureFirstVersion` | `docId` | `versionId` | If any DocVersion with that DocId exists, set CurrentVersion to the oldest and return it. Otherwise do steps 2â€“3 above. |
| `listPageSummaries` | `versionId` | `Array<{ItemId, Title, SortOrder, CreatedDate}>` | One read: `where {VersionId:{eq}}`, `order [SortOrder ASC, CreatedDate ASC]`, page size 500. Sorted again on the client with the ItemId tie-break. |
| `addPage` | `{docId, versionId, title, contentType, content}` | `pageId` | 1. read the highest SortOrder in the version (1 row, SortOrder DESC) 2. insert Page{SortOrder: max+1024, or 1024 if there are none} |
| `reorderPages` | `{versionId, orderedIds: string[]}` | `{updated: number}` | For each index i: target = (i+1)Ã—1024. Update only pages whose current SortOrder â‰  target, at most 5 at a time. Idempotent. |
| `deletePage` | `pageId` | void | Delete the Page. The DocVersion isn't touched. |
| `duplicateVersion` | `{docId, sourceVersionId, label}` | `versionId` | 1. insert DocVersion{Status:"Copying", SourceVersionId, SchemaVersion:2, IsPublished:false, IsActive:false} 2. read all source pages (full content) 3. `insertManyPage` in chunks (Â§5) with {DocId, VersionId:new, SourcePageId, Title, ContentType, Content, SortOrder} 4. update DocVersion.Status "Ready" 5. update Doc.CurrentVersion |
| `createBlankVersion` | `{docId, label}` | `versionId` | insert DocVersion{Status:"Ready", SchemaVersion:2, â€¦}, then update Doc.CurrentVersion |
| `resumeDuplicate` | `versionId` | void | Read the target's pages' SourcePageIds, insert the source pages that are missing, then do steps 4â€“5. |
| `deleteVersion` | `{docId, versionId}` | void | **Rejects** with `CannotDeleteCurrentVersion` if Doc.CurrentVersion === versionId. Otherwise `deleteManyPage where {VersionId:{eq}}`, then delete the DocVersion. |
| `deleteDocCascade` | `docId` | void | 1. update Doc.Status "Deleting" 2. `deleteManyPage where {DocId}` 3. `deleteManyDocVersion where {DocId}` 4. delete the Doc. Running it again resumes. |
| `publishVersion` | `{docId, versionId}` | void | 1. update version IsPublished:true 2. update Doc.CurrentVersion 3. `updateManyDocVersion where {DocId:{eq}, ItemId:{neq: versionId}, IsPublished:{eq:true}}` â†’ IsPublished:false |

Deletes use the SDK default, which is a soft delete. Hard deletes are out of scope (A4).

**Errors** (typed `DocmeDataError` with a `code`):
- `CannotDeleteCurrentVersion`
- `ContentTooLarge`, raised before sending anything
- `VersionLabelTaken`, raised when the label is already used on the same doc
- `GatewayError`, which wraps a GraphQLError
- `Unauthorized`, raised after the single refresh-and-retry fails

### 6.3 Invariants and concurrency

- **Page order.** Pages are ordered by `SortOrder` ASC, then `CreatedDate` ASC, then `ItemId` ASC. Two pages with the same SortOrder (for example, two adds at the same moment) therefore still have a stable order, and no page is lost.
- **Published version.** There is at most one `IsPublished:true` per doc. While `publishVersion` is running, two versions may briefly both be published. Readers resolve the version to show through `Doc.CurrentVersion` (editors) or the newest published version (Phase 2 viewers), so the result is still well-defined. Running the operation again restores the invariant.
- **No silent corruption.** A version with `Status â‰  "Ready"` or a missing `SchemaVersion` is never edited by the UI (C2, C8).
- **Tenant boundary.** No change in this phase. Phase 2 adds organization isolation and roles, and those are a precondition for any multi-tenant use.

### 6.4 Migration (in place, in the app, behind a flag)

- **Location:** a Card in `/settings`, shown only when `import.meta.env.VITE_ENABLE_MIGRATION === "true"`. The flag is never set in `.env.release`.
- **Scan** (read-only). Pages through every Doc, DocVersion and Page with page size 200 and computes:
  - `docs`, `versions`, and `versionsMigrated` (SchemaVersion = 2);
  - `legacyRefs` (the total of `Pages[]` lengths over unmigrated versions);
  - `sharedPages` (page ids referenced by more than one version);
  - `orphanPages` (pages referenced by no version and without a `VersionId`);
  - `danglingRefs` (references to page ids that don't exist).
- **Run.** Unmigrated versions are processed in order of CreatedDate, oldest first. For each version, for each index i and page id p in `Pages`:
  - If p doesn't exist, record it as dangling and skip it.
  - Otherwise, if p has no `VersionId`, update p to {DocId, VersionId: this version, SortOrder: (i+1)Ã—1024}.
  - Otherwise, if p already belongs to another version, a copy is needed. If no page with {VersionId: this, SourcePageId: p} exists yet, insert a copy of p with SourcePageId p and SortOrder (i+1)Ã—1024.
  - After the pages, update the version to {SchemaVersion: 2, Status: "Ready"}.
  - Finally, set Status "Active" on every Doc that has no Status.
- **Report.** One row per version: `version`, `legacyRefs`, `dangling`, `pagesNow`. The row passes when `pagesNow === legacyRefs âˆ’ dangling`.
- **Orphans.** Orphan pages are listed with their Title and CreatedDate and are never changed automatically. A "Delete orphans" `ConfirmPopover` soft-deletes them.
- **Rollout order:**
  1. Push the schema with `blocks data sync` (additive; the deployed app ignores the new fields).
  2. Announce an editing freeze.
  3. Run the migration from the local dev build (`.env.local` with `VITE_ENABLE_MIGRATION=true`).
  4. Check the report.
  5. Push and deploy the new app with Release.
  6. Lift the freeze.

  If someone writes through the old app during the freeze, the affected versions keep `SchemaVersion` missing. The new app shows them as read-only "Needs migration" (C8), and running the migration again fixes them (C9).

## 7. EXAMPLES

1. **Duplicate.** v1 has pages A (SortOrder 1024) and B (2048). `duplicateVersion(v1, "1.1.0")` creates v2 with pages Aâ€² and Bâ€², where Aâ€² has {SourcePageId: A, SortOrder: 1024, VersionId: v2}. Editing Aâ€².Content leaves A.Content unchanged.
2. **Add-page race.** Editors X and Y both add a page to a version whose highest SortOrder is 3072. Both new pages get SortOrder 4096, and the list shows both, ordered by CreatedDate. Before this change, one of them disappeared.
3. **Invalid input.** `addPage` with 204,801 characters of content raises `ContentTooLarge` ("Page content is limited to 200 KB"). No gateway request is sent.
4. **Recovery after a failure.** `createDoc` inserts the Doc, then the version insert fails with a network error. The detail page shows "This doc has no version yet" with a "Create first version" button. `ensureFirstVersion(docId)` finds 0 versions and creates "0.0.1". Running it a second time returns the same version id and creates nothing.
5. **Migration boundary.** v1.Pages = [A, B, Z], where Z doesn't exist, and v2.Pages = [A, C].
   - Run: A gets VersionId v1; B gets v1; Z is recorded as dangling; v2 receives a copy Aâ€³ (SourcePageId A) at SortOrder 1024; C gets v2 at 2048.
   - Report: v1 has legacyRefs 3, dangling 1, pagesNow 2 (pass). v2 has 2, 0, 2 (pass).
   - Running it again writes nothing.

## 8. ACCEPTANCE CRITERIA â€” HAPPY PATH

- **H1.** WHEN a signed-in user creates a doc named "Guide" THE SYSTEM SHALL persist a Doc {Name:"Guide", Status:"Active"} and a DocVersion {DocId, Version:"0.0.1", Status:"Ready", SchemaVersion:2, IsPublished:false, IsActive:false}, set Doc.CurrentVersion to that version's ItemId, and navigate to `/docs/:docId`, which shows the empty-pages state.
- **H2.** WHEN a user adds a page to a version THE SYSTEM SHALL insert exactly one Page with that DocId and VersionId, and SortOrder = (the version's highest SortOrder, or 0) + 1024, without writing to the DocVersion record, and show the page last in the list.
- **H3.** WHEN a doc is opened THE SYSTEM SHALL request the page list as `ItemId, Title, SortOrder, CreatedDate` only (no `Content`), filtered by VersionId, and render it ordered by SortOrder, then CreatedDate, then ItemId.
- **H4.** WHEN a user saves a new order in the Reorder modal THE SYSTEM SHALL set SortOrder = (index+1)Ã—1024 on exactly the pages whose value differs, and after a page reload show the saved order.
- **H5.** WHEN a user duplicates the current version THE SYSTEM SHALL create a new DocVersion with SourceVersionId set and one new Page per source page (same Title, ContentType, Content and SortOrder, with SourcePageId set), then set its Status to "Ready" and make it Doc.CurrentVersion.
- **H6.** WHEN a page in a duplicated version is edited and saved THE SYSTEM SHALL leave the source version's corresponding page Content byte-for-byte unchanged.
- **H7.** WHEN a user deletes a version that isn't the doc's CurrentVersion THE SYSTEM SHALL delete only the Pages with that VersionId, then the DocVersion, leaving every other version's page count unchanged.
- **H8.** WHEN a user confirms deleting a doc THE SYSTEM SHALL set Doc.Status "Deleting", then delete its Pages (by DocId), then its DocVersions (by DocId), then the Doc, and remove it from the docs list and the "Recent docs" sidebar.
- **H9.** WHEN a user publishes version V THE SYSTEM SHALL set V.IsPublished true and Doc.CurrentVersion = V, then set IsPublished false on every other version of that doc, so that exactly one version is published at the end.
- **H10.** WHEN the migration scan runs THE SYSTEM SHALL display `docs`, `versions`, `versionsMigrated`, `legacyRefs`, `sharedPages`, `orphanPages` and `danglingRefs` without issuing any mutation.
- **H11.** WHEN the migration runs THE SYSTEM SHALL apply the Â§6.4 algorithm and display a per-version report in which every row satisfies `pagesNow === legacyRefs âˆ’ dangling`.
- **H12.** WHEN the app performs any Blocks Data read or write THE SYSTEM SHALL do so through `getBlocksClient().data`. `grep -rn "data/v4/gateway" src` and `grep -rn "fetch(" src/features/data src/features/docs` both return no matches.
- **H13.** WHEN a doc in fixture F-PERF is opened 20 times on the deployed app THE SYSTEM SHALL show the page list at p95 â‰¤ 1.5 s and selected-page content at p95 â‰¤ 1.0 s, using â‰¤ 3 gateway requests before the list is visible.

## 9. ACCEPTANCE CRITERIA â€” CRITICAL PATH

- **C1.** IF a Doc exists without a CurrentVersion (because creation was interrupted) THE SYSTEM SHALL show "This doc has no version yet" with a "Create first version" button that calls `ensureFirstVersion`. That call reuses the oldest existing version of the doc if there is one, so a doc never gets two "0.0.1" versions.
- **C2.** IF copying pages fails partway through `duplicateVersion` THE SYSTEM SHALL:
  - leave the new version's Status as "Copying", or set "CopyFailed";
  - leave Doc.CurrentVersion unchanged;
  - show "Copy incomplete" with a Retry button.

  Retry SHALL insert only the source pages whose ItemId isn't yet a SourcePageId in the target, so the final page count equals the source count, with no duplicates.
- **C3.** IF a user tries to delete the doc's CurrentVersion THE SYSTEM SHALL render the delete control disabled with the tooltip "Switch to another version before deleting it", and `deleteVersion` SHALL reject with `CannotDeleteCurrentVersion` without deleting anything.
- **C4.** IF `deleteDocCascade` fails after Status is set to "Deleting" THE SYSTEM SHALL list the doc with a "Deletion incomplete" badge and a Retry button. Retry SHALL finish the remaining steps idempotently, and the doc SHALL NOT be openable for editing in the meantime.
- **C5.** IF two pages are added to the same version at the same time THE SYSTEM SHALL persist both and show both, in a deterministic order (SortOrder, then CreatedDate, then ItemId). This is a regression test for D3.
- **C6.** IF some page updates in a reorder save fail THE SYSTEM SHALL keep the modal open with an `Alert` and keep the user's chosen order. Saving again SHALL apply only the updates still needed, so the final persisted order equals the chosen order.
- **C7.** IF page content is longer than 204,800 characters, or a title is empty or longer than 200 characters, THE SYSTEM SHALL block the save with an inline field error ("Page content is limited to 200 KB" / "Title is required" / "Title is limited to 200 characters") and send no request.
- **C8.** IF a DocVersion has no SchemaVersion, or its Status isn't "Ready", THE SYSTEM SHALL render it read-only with an `Alert` explaining the state ("This version uses the old data format â€” run the migration" / "Copy incomplete"), and hide the add, edit, reorder and delete page controls.
- **C9.** IF the migration runs again after a successful run THE SYSTEM SHALL issue no mutations for versions with SchemaVersion 2, create no duplicate copies, and the next scan SHALL report 0 unmigrated versions.
- **C10.** IF `VITE_ENABLE_MIGRATION` isn't `"true"` at build time THE SYSTEM SHALL NOT render the migration panel, and the production bundle built with `.env.release` SHALL NOT contain the string `"Data migration"`.
- **C11.** IF a gateway call returns HTTP 401 THE SYSTEM SHALL refresh the session once and retry the call once. If the refresh fails, it SHALL set the auth status to `unauthenticated` and redirect to `/login` without looping.
- **C12.** IF the gateway responds with a GraphQL `errors[]` array or a network failure THE SYSTEM SHALL:
  - for queries: retry up to 3 times, then show an `Alert` with the error message and a Retry button;
  - for mutations: show `toast.error` with the message and keep the form input.
- **C13.** IF the migration finds a dangling page reference or an orphan page THE SYSTEM SHALL skip it without failing the run, list it in the report, and change orphan pages only after the user confirms "Delete orphans".
- **C14.** IF a version label already exists on the same doc THE SYSTEM SHALL reject the create with "Version 1.1.0 already exists on this doc" before inserting anything.
- **C15.** IF a duplicated version has 100 pages of 200 KB each THE SYSTEM SHALL send no single insert request with more than 20 pages or more than 2 MB of serialized payload, and show progress ("Copying pages 40 of 100").

## 10. E2E TEST INSTRUCTIONS

- **Environment:**
  - Local dev at `https://dmqhre.slsblx.com:5173` (trusted cert, hosts entry), with `VITE_ENABLE_MIGRATION=true` for migration tests.
  - The deployed Release URL `https://dmqhre-ehttj.slsblx.com` for performance tests and C10.
  - Blocks project `Dce5c9843b5a64f1394ddadc8be8e7a3a`, after the schema sync.
- **Identities:** two signed-in browser profiles, U1 and U2. Both are existing project users (in Phase 1 every signed-in user can edit).
- **Fixtures:**
  - **F-LEGACY:** created with the *old* app (commit `4590230`) before the schema sync, and kept in a test project, or captured from the existing data. It contains:
    - doc L1 with v1 [A, B] and v2 duplicated from v1, giving shared [A, B];
    - doc L2 with v1 [C, Z-deleted];
    - one orphan page O.
  - **F-PERF:** as defined in Â§5.
  - **F-BIG:** 1 version with 100 pages of 200 KB each, for C15.
- **Steps:**
  1. Settings â†’ Data migration â†’ Scan. Expect docs = 2, sharedPages = 2, orphanPages = 1, danglingRefs = 1, and no mutations in the DevTools Network tab (H10).
  2. Run. All report rows pass, and v2 of L1 has copies Aâ€² and Bâ€² with SourcePageId (H11).
  3. Run again; expect 0 mutations (C9).
  4. Delete the orphans via the ConfirmPopover (C13).
  5. Open L1 v2, edit Aâ€², then open v1: A is unchanged (H6).
  6. Create the doc "Guide" (H1).
  7. Add 3 pages (H2, H3).
  8. Reorder them and reload (H4).
  9. Have U1 and U2 click Add page within one second of each other; both pages appear (C5).
  10. Duplicate "Guide" (H5).
  11. Set DevTools "Offline" partway through the copy on F-BIG â†’ "Copy incomplete". Go back online â†’ Retry â†’ page counts match (C2, C15).
  12. Try to delete the current version; it's disabled with a tooltip (C3).
  13. Delete the old version (H7).
  14. Publish v2 â†’ exactly one version is published (H9).
  15. Block the 3rd request with DevTools request blocking during a doc delete â†’ "Deletion incomplete" â†’ Retry succeeds (C4, H8).
  16. Enter 204,801 characters of content â†’ inline error, no request (C7).
  17. Duplicate label â†’ error (C14).
  18. Invalidate the session cookie, then act â†’ one refresh, one retry (C11).
  19. Block the gateway â†’ Alert with Retry after the retries (C12).
  20. Open an unmigrated version created through the old app â†’ read-only alert (C8, C1).
  21. Performance: 20 runs on F-PERF on the deployed app; record p50 and p95 against the baseline (H13).
  22. Search the production bundle for "Data migration" (C10), and run the H12 greps.
- **Cleanup:** soft-delete the "Guide", F-PERF and F-BIG docs with the cascade delete. Turn `VITE_ENABLE_MIGRATION` off locally.

## 11. OUT OF SCOPE

- Organization isolation, roles, data access rules, the organization switcher and membership management. These are Phase 2 ([SPEC2](SPEC2.md)).
- Removing the deprecated `DocVersion.Pages` field (Phase 2 cleanup).
- The repo link (DocSource) and paragraph comments (Phase 3, [SPEC3](SPEC3.md)).
- The visual redesign, the AI revise feature and GitHub sync (later specs).
- Hard deletes and a trash/restore UI.
- Moving auth, users and storage off raw `fetch` (Phase 2).

## 12. VERIFICATION

- **Existing commands** (`package.json` at `4590230`), run in `e:\Blocks\docme`:
  - `npm run typecheck` (`tsc -b --noEmit`)
  - `npm run build` (`tsc -b && vite build`)
- **Known gap:** `npm run lint` fails because `eslint` isn't installed. **Proposed:** add `eslint`, `@eslint/js`, `typescript-eslint` and `eslint-plugin-react-hooks` as devDependencies with a flat config, so the script runs.
- **Proposed test tooling:** add `vitest` and the script `"test": "vitest run"`. Required unit tests (gateway and SDK mocked with `vi.mock("@/lib/blocks/client")`):
  - the ordering rules and tie-break (H3, C5);
  - the `reorderPages` diff (H4, C6);
  - `duplicateVersion`, `resumeDuplicate` and chunking (H5, C2, C15);
  - the `deleteVersion` guard (C3);
  - the `deleteDocCascade` order and resume (H8, C4);
  - the `publishVersion` order (H9);
  - the migration algorithm on example 5 (H11, C9, C13);
  - validation (C7, C14);
  - `gql` error mapping and the 401 flow (C11, C12).
- **Blocks configuration** (each step: `--dry-run`, then the user's approval, then `--yes`):
  - `blocks data schema pull --json`
  - edit `blocks/data/schemas/*.json`
  - `blocks data validate --json`
  - `blocks data sync --dry-run --json`
  - `blocks data schema indexes create â€¦`
  - `blocks data validation save â€¦`

  Afterwards, `blocks data schema list --json` shows the new fields.
- **Static checks:** the H12 greps, and the C10 bundle grep (`Select-String -Path dist/assets/*.js -Pattern "Data migration"` â†’ no matches).
- **Performance:** capture the baseline into `output/docme/SPEC1-baseline.md`, then the after-change run. Pass when H13's budgets are met.
- **Design:** the Â§4 screenshots (2 viewports Ã— 2 themes Ã— the listed states), plus a check of imports (only `@/components/ui/*` and `@/components/layout/*` primitives).
- **E2E:** run Â§10 and record each step's result against its H#/C#.
- **Completion checklist:** the implementer ticks H1â€“H13 and C1â€“C15, each with its evidence (a test name, a screenshot, or an E2E step).

## ASSUMPTIONS / DECISIONS

- **A1 â€” Version semantics are kept as they are today.**
  - Decision: `CurrentVersion` is the editors' default version. `IsPublished` marks at most one released version. `IsActive` controls whether a non-published version is listed for viewers.
  - Basis: the existing hooks and the confirmed role matrix ("viewers read published or active versions").
  - Consequence: Phase 2 builds the viewer rules on these flags.
  - Status: derived from the source, consistent with confirmed requirements.
- **A2 â€” Page order uses a SortOrder number.**
  - Decision: a Float `SortOrder` spaced 1024 apart replaces the order array on the version.
  - Basis: it removes the D3 lost-update problem, and a reorder of up to 100 pages writes only the pages that moved.
  - Consequence: `DocVersion.Pages` is deprecated.
  - Status: decided under the user's delegation ("better quality of work").
- **A3 â€” Bulk insert chunk size.**
  - Decision: at most 20 pages and at most 2 MB per request.
  - Basis: the gateway's request size limit isn't documented, so the limit is conservative.
  - Consequence: it can be raised after the spike measures the real limit.
  - Status: delegated decision; check it during E2E step 11.
- **A4 â€” Soft deletes.**
  - Decision: keep the SDK's default soft delete.
  - Basis: soft-deleted records can be recovered through Blocks.
  - Consequence: there's no trash UI in this phase.
  - Status: delegated decision.
- **A5 â€” Migration runs in the app.**
  - Decision: an in-place migration that runs inside the app behind a build flag, during an editing freeze.
  - Basis: the CLI has no command for records, and AGENTS.md forbids raw API calls.
  - Consequence: an admin runs it from a local build.
  - Status: the user chose "Migrate it"; this method is a delegated decision.
