# SPEC — Repo link (DocSource) and paragraph comments: data layer and anchoring (Phase 3 of 3)

- **Task type:** Feature (confirmed 2026-11-17). Source branch: `dev`.
- **Target repo:** docme
- **Repository:** https://github.com/nuzattasnim/docme
- **Implementation scope:** Frontend (the React SPA in `src/`), plus Blocks project configuration (two new schemas, indexes, validations and data access rules). The configuration is an **external-service prerequisite**: applied only through `blocks … --dry-run`, then the user's approval, then `--yes`. No backend code. The **comment panel UI isn't in this phase**; it's built in the UI-modernization spec on top of this data layer (A10).
- **External dependencies:**
  - SELISE Blocks Data (gateway, rules, schemas) and IAM (`me` for the author's name).
  - `@seliseblocks/client` 0.3.0 and the `blocks` CLI 0.11.0.
  - **`diff-match-patch`** (npm, Apache-2.0), a proposed new dependency for fuzzy re-anchoring.
  - No GitHub API calls in this phase.
- **Ecosystem consideration:** Excluded (the user's choice on 2026-11-17). The broad survey was skipped.
- **Work location:** `e:\Blocks\docme`.
  - Allowed: `src/features/docs/**` (services, hooks, `content-renderers/**`, `components/edit-doc-modal.tsx`), `src/lib/**`, `package.json`, `README.md`.
  - Proposed new: `src/features/comments/**`, `src/features/sources/**`, `blocks/data/schemas/{Comment,DocSource}.json`, additions to `blocks/data/rules.json`.
- **GitHub validation:** Ref `dev` @ `45902309c6a74fc7b4346e8af09d976596b0d0c1`. Frontend SPA only (see SPEC1). The local checkout is at the same commit with a clean tree.
- **Phase dependencies:** **Predecessors:** Phase 1 ([SPEC1](SPEC1.md)) and Phase 2 ([SPEC2](SPEC2.md)). This phase relies on:
  - the docme roles;
  - the S0 findings in `docs/blocks-data-access.md`;
  - `ReaderVisible`;
  - the cascade services.

---

## 1. GOAL

Lay the data groundwork for two features the user asked for.

1. **Repo link.** Remember which GitHub repository and branch a doc describes, and which commit the docs currently reflect. The future agent-driven sync will update docs from newer commits, so it needs this stored data.
2. **Paragraph comments.** Readers and editors can comment on a specific paragraph or passage of a page, using the conventional W3C Web Annotation anchoring model. A comment keeps pointing at the right text when the page is edited. When its text is gone, the comment is shown as "outdated" and never silently lost.

**Priority:** correctness and robustness of anchoring. The user said: "better quality of work, doesn't matter the time".

**Success measures:**
- Anchors survive unrelated edits.
- Removed text produces orphaned comments, not wrong ones.
- The permissions are enforced by the server.
- No GitHub credentials are stored.

## 2. USER STORIES

- As an **admin**, I want to link a doc to its GitHub repository, branch and baseline commit, so that the planned sync agent knows where the docs come from and what they reflect.
- As a **viewer**, I want to comment on a specific paragraph of a published page and reply to threads, so that I can ask about exactly the passage I mean.
- As an **editor**, I want to resolve and reopen comment threads, so that the team can track which feedback has been handled.
- As a **comment author**, I want to edit or delete my own comments, so that I can correct mistakes.
- As an **admin**, I want to delete any comment, so that I can remove inappropriate content.

The role matrix was confirmed on 2026-11-17: viewers comment, editors resolve, admins manage the repo link.

## 3. CONTEXT

### Purpose
- **GitHub sync.** The user plans a sync: "users will be able to sync the github repo … remember the commit no and branch name … use agents to update the docs based on the new commits". That's still vague and gets its own discovery and spec. This phase only adds the storage it needs.
- **Comments.** The user wants "commenting on this or that paragraph" and delegated the design: "you decide it based on … appropriate convention".

### Users and core workflows
- **Admins** set or clear the repo link in the Edit Doc modal. Other roles see it read-only.
- **Comments** are created, replied to, edited, deleted, resolved and reopened through hooks in this phase. The visible panel and highlights come with the UI redesign.

### Architecture and ownership
- **Page content** is a single `Content` string per Page (Markdown, MDX or raw).
- **Rendering** goes through `content-renderers/registry.tsx`:
  - `markdown.tsx` uses `react-markdown` with `remark-gfm` and overrides block components (h1–h4, p, ul, ol, li, …): [markdown.tsx].
  - `mdx.tsx` uses `@mdx-js/mdx`.
  - `raw.tsx` renders preformatted text.
- **Source positions.** `react-markdown` passes each element's hast `node` (with `position.start.offset` and `position.end.offset` into the source) to component overrides. A block element can therefore be tied to its exact range in the source.
- **The doc edit modal** is `src/features/docs/components/edit-doc-modal.tsx`.
- **Phase 1 cascades** (`deletePage`, `deleteVersion`, `deleteDocCascade`) are extended here to also delete comments and DocSource records.

### Shared capabilities
- **W3C Web Annotation Data Model** (W3C Recommendation, 23 Feb 2017, https://www.w3.org/TR/annotation-model/):
  - `TextQuoteSelector` (exact, prefix, suffix) and `TextPositionSelector` (start, end), §4.2.4–4.2.5.
  - The convention of combining both and re-anchoring by quote is what annotation tools such as Hypothesis use.
- **Blocks:**
  - unique indexes (`blocks data schema indexes create --unique`);
  - validations;
  - data access rules, using the `ruleGroup` forms documented by SPEC2 S0, including Q3(d) `CreatedBy` equals the caller;
  - `updateMany` and `deleteMany` through `data.graphql`.

### Constraints and conventions
- **No credentials in data.** No GitHub tokens are stored in Blocks Data. Access to private repos is a later sync concern, through the Blocks secret store.
- **Comment bodies are untrusted.** They are stored as plain text and must never be rendered as HTML.
- **AGENTS.md:** SDK only; dry-run, then approval, then `--yes`.

### Ecosystem review
Excluded by the user's choice, so the broad survey was skipped. The required checks covered:
- docme `dev` @ `4590230` (the renderers, the docs feature and the modals);
- the Blocks SDK and CLI contracts from SPEC1 and SPEC2;
- the W3C Web Annotation Recommendation, as the external convention.

[markdown.tsx]: https://github.com/nuzattasnim/docme/blob/45902309c6a74fc7b4346e8af09d976596b0d0c1/src/features/docs/content-renderers/markdown.tsx

## 4. DESIGN CONTRACT

There are two UI changes in this phase. The comment panel is deferred to the UI spec.

1. **A "Source repository" section in the Edit Doc modal.**
2. **Invisible source-range attributes on rendered blocks.** Nothing should change visually.

- **References:**
  - `src/features/docs/components/edit-doc-modal.tsx` and `doc-form.tsx` (field layout)
  - `docs/design-system.md` §2 and §5
- **Tokens and components** (existing only):

  | Element | Component |
  |---|---|
  | Section heading | `Separator`, plus the eyebrow style `text-xs font-medium uppercase tracking-wide text-muted-foreground` |
  | Fields | `Label` + `Input`: "Repository URL", "Branch", "Docs path", "Baseline commit (optional)" |
  | Field errors | text below the field (`text-sm text-destructive`), linked with `aria-describedby` |
  | Remove link | `ConfirmPopover` (destructive) |
  | Save failure | `Alert` |
  | Feedback | `toast` on every save or remove |

  Viewers and editors see a read-only summary instead: the repository as a link with `rel="noopener noreferrer"` and `target="_blank"`, the branch, the docs path and a short commit (`font-mono text-xs`, first 7 characters).
- **Layout and states:**
  - The section sits under the existing name and description fields. It has these states: empty ("Not linked"), editing, saving (Save disabled with a spinner), error, and linked (summary).
  - Light and dark themes both use the existing variables.
  - **Renderer change:** adds `data-src-start` and `data-src-end` attributes to block elements (p, h1–h6, li, blockquote, pre, table, and each tr) in the Markdown and MDX renderers. There's no change to classes or the DOM structure.
- **Visual verification:**
  - Screenshots at 1440×900 and 390×844, in light and dark, of the Edit Doc modal for an admin (empty, filled with an error, linked) and the read-only summary for an editor.
  - A pixel comparison of a rendered reference page before and after the renderer change must show **no differences**.
  - The modal fields are reachable in tab order.

## 5. PERFORMANCE CONTRACT

- **Affected journeys:**
  - J2 (page content visible), which must not regress from the renderer attributes;
  - J10: loading a page's comments;
  - J11: resolving all anchors on a page;
  - J12: saving the repo link.
- **Baseline:** the SPEC2 after-change J2 measurements. J10–J12 are new, so they get a capture-only first measurement.
- **Workload:**
  - The confirmed small-team scale: 100 pages per version, 200 KB per page.
  - Comments: up to 200 threads and 1,000 comments per page (A11).
- **Budgets:**
  - J2 p95 ≤ 1.0 s still holds. Comments load **after** the content and never block it.
  - J10 is one gateway request per page view (page size 1,000, filtered by PageId). This is a design bound.
  - J11 (anchor resolution) takes p95 ≤ 50 ms for 200 anchors on a 200 KB page where 20 anchors need fuzzy matching. This is measured in Vitest with `performance.now()`, 50 runs, on the reference machine recorded in the SPEC1 baseline file (A12).
  - J12 is ≤ 2 requests: find the existing DocSource by DocId, then insert or update it.
- **Degradation:**
  - If comments fail to load, the page content stays usable and an inline "Comments unavailable — Retry" message appears.
  - Fuzzy matching is skipped for an anchor whose `AnchorExact` is longer than 4,000 characters (stored lengths can't exceed that anyway).

## 6. DATA CONTRACTS

### 6.1 Schema `DocSource` (new; one per doc)

| Field | Type | Required | Rule |
|---|---|---|---|
| `DocId` | String | yes | ItemId of a Doc. **Unique index** on `DocId`. |
| `Provider` | String | yes | `"GitHub"` (the only value for now) |
| `RepoOwner` | String | yes | `^[A-Za-z0-9-]{1,39}$` |
| `RepoName` | String | yes | `^[A-Za-z0-9._-]{1,100}$`; not `.` or `..` |
| `RepoUrl` | String | yes | normalized to `https://github.com/<owner>/<repo>` |
| `Branch` | String | yes | git ref rules: 1–255 characters; no spaces, control characters, `..`, `~`, `^`, `:`, `?`, `*`, `[`, `\`, `@{`; must not start or end with `/` or `.`; must not end with `.lock` |
| `DocsPath` | String | yes | default `"/"`; starts with `/`; ≤ 500 characters; no `..` segment |
| `BaselineCommitSha` | String | no | `^[0-9a-f]{40}$` (lowercased on input). This is the commit the docs currently reflect. |
| `LastSyncedCommitSha` | String | no | `^[0-9a-f]{40}$`. Reserved for the sync feature; read-only in the UI. |
| `LastSyncedAt` | DateTime | no | Reserved; read-only. |

**Accepted URL inputs**, all normalized to the same `RepoUrl`:
- `https://github.com/o/r`
- `https://github.com/o/r.git`
- `https://github.com/o/r/` (trailing slash)
- `https://github.com/o/r/tree/<branch>` (this also pre-fills Branch when Branch is empty)
- `git@github.com:o/r.git`

Any other host is rejected with "Only github.com repositories are supported for now".

**Services:**
- `getDocSource(docId)` returns the record or `null`.
- `saveDocSource(docId, input)` reads by DocId, then inserts or updates. If the insert hits the unique-index violation (two admins saving at once), it reads again and updates.
- `removeDocSource(docId)` deletes the record.
- `deleteDocCascade` (SPEC1) gains a step: delete the DocSource where DocId equals the doc, before deleting the Doc.

### 6.2 Schema `Comment` (new)

| Field | Type | Required | Rule |
|---|---|---|---|
| `DocId`, `VersionId`, `PageId` | String | yes | ItemIds of the doc, version and page being commented on |
| `ParentCommentId` | String | no | Null for a thread root. Replies point at the **root** (one level of nesting). |
| `Body` | String | yes | 1–5,000 characters after trimming. Plain text; line breaks are kept. |
| `AuthorName` | String | yes | Copied from `iam.me()` (first and last name, or else the email) when the comment is created, because viewers can't list users. |
| `Status` | String | root only | `"Open"` \| `"Resolved"`, default `"Open"`. Null on replies. |
| `ResolvedBy` / `ResolvedDate` | String / DateTime | no | Set on resolve, cleared on reopen. |
| `EditedDate` | DateTime | no | Set when the author edits Body. |
| `AnchorKind` | String | root only | `"Quote"` \| `"Block"` \| `"Page"` |
| `AnchorExact` | String | Quote/Block | 1–4,000 characters: the source text being commented on |
| `AnchorPrefix` / `AnchorSuffix` | String | Quote/Block | up to 32 characters of source text immediately before and after |
| `AnchorStart` / `AnchorEnd` | Int | Quote/Block | UTF-16 offsets into `Page.Content` when the comment was created; 0 ≤ start < end ≤ length |
| `AnchoredContentDate` | DateTime | Quote/Block | The page's `LastUpdatedDate` when the comment was created (for diagnostics) |
| `ReaderVisible` | Boolean | yes | Equals the page's `ReaderVisible`. Maintained by SPEC2 §6.2's `updateMany` steps, extended to `updateManyComment where {VersionId}` in the same order. |

**Indexes:**
- `Comment(PageId, CreatedDate)`
- `Comment(ParentCommentId)`
- `Comment(VersionId)`
- `Comment(DocId)`

**Data access rules** (in `blocks/data/rules.json`; "org" and the role forms come from SPEC2 S0):

| Operation | Allowed when |
|---|---|
| READ | org ∧ ((editor ∨ admin) ∨ (viewer ∧ ReaderVisible)) |
| WRITE (insert) | org ∧ ((editor ∨ admin) ∨ (viewer ∧ ReaderVisible)) |
| EDIT, row-level | org ∧ (CreatedBy = caller ∨ editor ∨ admin) |
| EDIT, column-level on `Body`, `AnchorKind`, `AnchorExact`, `AnchorPrefix`, `AnchorSuffix`, `AnchorStart`, `AnchorEnd` | CreatedBy = caller |
| DELETE | org ∧ (CreatedBy = caller ∨ admin) |

**Spike S0 addendum (Q8).** Before implementation, confirm in the spike organizations that:
- a column-level EDIT rule (policyType 1 with `fieldNames`) refuses an editor's attempt to change another user's `Body`, while allowing a `Status` change;
- a WRITE rule can test a field of the record being inserted.

If either can't be expressed, stop and take the evidence to the user (the same gate as SPEC2 C12).

### 6.3 Anchoring library (`src/features/comments/anchoring.ts`, pure functions)

```ts
type Selector = { kind: "Quote"|"Block"; exact: string; prefix: string; suffix: string; start: number; end: number };
type Resolution = { status: "exact"|"relocated"|"fuzzy"|"orphaned"; start?: number; end?: number };

createSelector(content: string, block: {start: number; end: number}, selectedText?: string): Selector
resolveSelector(content: string, s: Selector): Resolution
```

**`createSelector`:**
1. `blockText = content.slice(block.start, block.end)`.
2. If `selectedText` (trimmed, non-empty) appears in `blockText` **exactly once**, then kind = `"Quote"`, start = block.start + index, end = start + selectedText.length.
3. Otherwise kind = `"Block"`, covering the whole block. This happens when the selection crosses inline markup, so the rendered text doesn't appear verbatim in the source, or when it's ambiguous.
4. If end − start > 4,000, clamp end = start + 4,000.
5. exact = `content.slice(start, end)`. prefix = the up to 32 characters before start; suffix = the up to 32 characters after end.

**`resolveSelector`**, applied in order:
1. **exact:** `content.slice(start, end) === exact`.
2. **relocated:** every occurrence of `exact` in `content` is scored as *(length of the common suffix between the 32 characters before it and `prefix`) + (length of the common prefix between the 32 characters after it and `suffix`)*. The highest score wins; a tie goes to the occurrence nearest the original `start`.
3. **fuzzy:** `diff-match-patch` `match_main(content, exact.slice(0, 32), start)` with `Match_Threshold = 0.4` and `Match_Distance = 1000`, which gives a candidate location L. Take the window `content.slice(L, L + exact.length)`. Accept it if `1 − levenshtein(diff_main(window, exact)) / exact.length ≥ 0.75`.
4. **orphaned:** none of the above.

The `"Page"` kind is never resolved; it applies to the whole page.

**Renderer support.** Block elements carry `data-src-start` and `data-src-end` from `node.position.*.offset`. In the raw renderer, the whole content is one block (0, length). The future UI turns a browser selection into `(block, selectedText)` by finding the nearest ancestor that has these attributes.

### 6.4 Comment services and hooks (`src/features/comments/`)

| Function | Effect |
|---|---|
| `listComments(pageId)` | One request (page size 1,000, ordered by CreatedDate ASC). Returns threads: each root with its replies. |
| `createThread({page, selector \| "Page", body})` | Insert a root comment. Sets `AuthorName` and `ReaderVisible` from the page, and `AnchoredContentDate` from the page's `LastUpdatedDate`. |
| `reply({root, body})` | Insert a reply with ParentCommentId = root.ItemId and the root's DocId, VersionId, PageId and ReaderVisible. |
| `editBody(id, body)` | Update `Body` and `EditedDate`. In the UI, only the author can do this. |
| `resolve(rootId)` / `reopen(rootId)` | Update `Status`, `ResolvedBy`, `ResolvedDate`. In the UI, only editors and admins can do this. |
| `deleteComment(id)` | For a root: `deleteManyComment where {ParentCommentId:{eq:id}}`, then delete the root. For a reply: delete just the reply. |

Hooks (`useComments(pageId)` and the mutations) invalidate `["comments", pageId]`. Every mutation shows a toast, following the design system.

**Changes to Phase 1 operations:**
- Cascades: `deletePage` removes comments `where PageId`, `deleteVersion` removes them `where VersionId`, and `deleteDocCascade` removes them `where DocId`. Comments are deleted **before** their parent records, so a retry resumes cleanly.
- `duplicateVersion` doesn't copy comments (A13). The duplicate dialog says "Comments stay on version <label>".

## 7. EXAMPLES

1. **Exact.** Content `"Intro.\n\nInstall with npm i docme.\n"`. The user selects "npm i docme" inside the second paragraph, so the selector is `{kind:"Quote", exact:"npm i docme", start:21, end:32, prefix:"Intro.\n\nInstall with ", suffix:".\n"}`. Resolving against the same content gives `exact` at 21–32.
2. **Relocated.** An editor adds a 100-character paragraph before "Install…". The slice at 21–32 no longer matches, but the quote is found once, at 121. Resolution: `relocated`, 121–132.
3. **Fuzzy, then orphaned.**
   - **Fuzzy:** a selector stored with exact `"Instal with npm i docme"` (23 characters, with a typo) at start 8. The editor fixes the typo, so the content becomes `"Intro.\n\nInstall with npm i docme.\n"`. The quote isn't found verbatim. `match_main` finds L = 8. The window `"Install with npm i docm"` has a Levenshtein distance of 2 from the exact text, so similarity = 1 − 2/23 = 0.91 ≥ 0.75. Resolution: `fuzzy`, start 8, end 31.
   - **Orphaned:** for the same selector, if the editor deletes the whole sentence (the content becomes `"Intro.\n"`), no occurrence or acceptable window exists. Resolution: `orphaned`, with no range.
4. **Invalid repo link.** Saving `https://gitlab.com/o/r` shows "Only github.com repositories are supported for now". Saving branch `feature..x` shows "Branch name is not valid". Saving baseline `abc123` shows "Enter the full 40-character commit SHA". No request is sent in any of these cases.
5. **Permissions.** Viewer V comments on a published page and succeeds. V tries to resolve a thread from the console: the server allows the row-level EDIT (the author check fails, and V isn't an editor), so the request is refused. Editor E changes another user's `Body` from the console: the column-level rule refuses it. E resolves the thread and succeeds.

## 8. ACCEPTANCE CRITERIA — HAPPY PATH

- **H1.** WHEN an admin saves a valid repo link for a doc THE SYSTEM SHALL store exactly one DocSource for that DocId, with the normalized `RepoUrl`, `RepoOwner`, `RepoName`, `Branch`, `DocsPath` (default "/") and the lowercased `BaselineCommitSha` if one was given, and show the linked summary with a toast.
- **H2.** WHEN a repository URL is entered in any accepted form (§6.1) THE SYSTEM SHALL normalize it to `https://github.com/<owner>/<repo>`, and pre-fill Branch from a `/tree/<branch>` URL when Branch is empty.
- **H3.** WHEN an editor or viewer opens a linked doc's details THE SYSTEM SHALL show the read-only summary (repository link, branch, docs path, 7-character baseline commit) and no edit controls.
- **H4.** WHEN an admin removes the repo link and confirms THE SYSTEM SHALL delete the DocSource, show "Not linked", and leave the Doc, versions and pages unchanged.
- **H5.** WHEN `createSelector` is given a selection that appears once in its block THE SYSTEM SHALL return kind "Quote", with offsets into `Page.Content` and up to 32 characters of prefix and suffix, matching example 1 exactly.
- **H6.** WHEN `resolveSelector` runs against content where the quote moved (example 2) THE SYSTEM SHALL return `relocated` at 121–132, and when the quote has a small edit within the threshold (example 3, fuzzy case) it SHALL return `fuzzy` at 8–31.
- **H7.** WHEN the Markdown, MDX or raw renderer displays a page THE SYSTEM SHALL put `data-src-start` and `data-src-end` on each block element, such that `Content.slice(start, end)` is that block's source, with no visual change.
- **H8.** WHEN a viewer creates a thread on a published page THE SYSTEM SHALL insert a root Comment with Status "Open", `AuthorName`, the anchor fields, `ReaderVisible` true and `AnchoredContentDate`, and `listComments` SHALL return it.
- **H9.** WHEN any member who can read the page replies to a thread THE SYSTEM SHALL insert a reply whose ParentCommentId is the root, and `listComments` SHALL return it under that root, ordered by CreatedDate.
- **H10.** WHEN an editor resolves, then reopens, a thread THE SYSTEM SHALL set Status "Resolved" with `ResolvedBy` and `ResolvedDate`, then Status "Open" with both cleared.
- **H11.** WHEN an author edits their own comment THE SYSTEM SHALL update `Body` and set `EditedDate`.
- **H12.** WHEN a page, version or doc is deleted THE SYSTEM SHALL delete its comments (and, for a doc, its DocSource) before the parent record, and leave no Comment or DocSource referring to the deleted ids.
- **H13.** WHEN 200 anchors (20 of them needing fuzzy matching) are resolved on a 200 KB page THE SYSTEM SHALL finish in p95 ≤ 50 ms over 50 runs, and J2 SHALL still meet p95 ≤ 1.0 s.

## 9. ACCEPTANCE CRITERIA — CRITICAL PATH

- **C1.** IF the repo link input is invalid (a host other than github.com, a bad owner or repo, a branch that breaks git ref rules, a SHA that isn't 40 hex characters, or a docs path that doesn't start with `/` or contains `..`) THE SYSTEM SHALL show the field-specific message from example 4 and send no request.
- **C2.** IF two admins save a repo link for the same doc at the same time THE SYSTEM SHALL end with exactly one DocSource (the unique index plus the read-again-and-update fallback), holding the later save's values.
- **C3.** IF an editor or viewer calls insert, update or delete on DocSource through the SDK THE SYSTEM SHALL refuse it on the server.
- **C4.** IF a comment's quoted text has been deleted (example 3, orphaned case), or changed beyond the fuzzy threshold, THE SYSTEM SHALL resolve it as `orphaned` and never attach it to unrelated text. The thread stays readable through `listComments` with its stored `AnchorExact`.
- **C5.** IF the selected text crosses inline markup (for example, it spans `**bold**`) or appears more than once in its block THE SYSTEM SHALL create a `Block` selector covering the whole block, not fail.
- **C6.** IF a comment body is empty after trimming, or longer than 5,000 characters, THE SYSTEM SHALL reject it before sending, with "Comment can't be empty" / "Comments are limited to 5,000 characters".
- **C7.** IF a viewer requests comments on a page whose version isn't reader-visible THE SYSTEM SHALL return no records from the server (ReaderVisible rule).
- **C8.** IF an editor tries to change another user's comment `Body`, or a viewer tries to resolve a thread, THE SYSTEM SHALL refuse it on the server. In the UI-facing hooks these actions are also unavailable to those roles.
- **C9.** IF anyone other than the author or an admin tries to delete a comment THE SYSTEM SHALL refuse it on the server.
- **C10.** IF a comment body contains HTML or script (for example `<img src=x onerror=alert(1)>`) THE SYSTEM SHALL store it verbatim, and every consumer in this phase SHALL treat it as text. No `dangerouslySetInnerHTML` is used for comment content (grep check).
- **C11.** IF deleting a root comment fails after its replies were deleted THE SYSTEM SHALL keep the root, show `toast.error` with Retry, and the retry SHALL finish without error.
- **C12.** IF a version's reader visibility changes THE SYSTEM SHALL update `Comment.ReaderVisible` for that version in the same order as pages (SPEC2 §6.2), and the SPEC2 reconciler SHALL also reconcile comments.
- **C13.** IF loading comments fails THE SYSTEM SHALL keep the page content rendered and usable, and expose an error state with Retry from `useComments`.
- **C14.** IF the renderer change is applied THE SYSTEM SHALL produce rendered pages identical to before it, as shown by the §4 pixel comparison of a reference page.
- **C15.** IF the S0 addendum (Q8) shows that column-level or insert-field rules can't be expressed THE SYSTEM SHALL NOT ship comment write access protected only by the client. The comment work stops and the evidence goes to the user.

## 10. E2E TEST INSTRUCTIONS

- **Environment:**
  - Local dev and the deployed Release URL.
  - For the comment flows, which have no UI in this phase, a dev-only console helper `window.__docmeDev.comments`. It's registered only when `VITE_ENABLE_DEV_TOOLS === "true"` and is absent from the `.env.release` bundle (grep `__docmeDev`, expect no matches).
- **Identities:** U-ADM, U-ED and U-VW in org X; U-B in org Y (from SPEC2).
- **Fixtures:**
  - Doc D in org X with v1 (published) containing page P (the example 1 content, plus a paragraph with `**bold**`) and v2 (draft) containing page Q.
  - A 200 KB page R for H13.
- **Steps:**
  1. As U-ADM, edit D. Enter each invalid input from example 4 (C1). Save `https://github.com/o/r/tree/main` (H1, H2).
  2. Save at the same moment from a second U-ADM tab (C2).
  3. Sign in as U-ED, then U-VW: the summary is read-only (H3). Try DocSource writes from the console (C3).
  4. As U-ADM, remove the link (H4).
  5. Run the anchoring unit suites (H5, H6, C4, C5).
  6. Inspect the DOM of P for the `data-src-*` attributes and check them against `Content.slice` (H7). Run the pixel comparison (C14).
  7. As U-VW, use the helper: create a thread on P (H8); create an empty and a 5,001-character comment (C6); try to read Q's comments (C7); try to resolve (C8); try to delete U-ED's comment (C9).
  8. As U-ED: reply (H9); resolve and reopen (H10); edit U-VW's Body from the console (C8); edit your own (H11).
  9. Store an XSS payload as a body and render it through the debug output as text (C10).
  10. Block the 2nd request while deleting a root comment, then Retry (C11).
  11. Publish v2 → Q's comments become visible to U-VW (C12).
  12. Make the comment requests fail → the content stays usable and `useComments` reports the error (C13).
  13. Delete P, then v1, then D: comments and DocSource are gone (H12).
  14. As U-B, query D's comments through the SDK: no records (org isolation).
  15. Run the H13 benchmark and the J2 re-measure.
- **Cleanup:** cascade-delete D and the fixture pages, and turn off `VITE_ENABLE_DEV_TOOLS`.

## 11. OUT OF SCOPE

- The comment panel, inline highlights, the selection popover and notifications. These belong to the UI-modernization spec, built on this data layer.
- @mentions, emoji reactions, and Markdown in comment bodies.
- Copying comments to duplicated versions.
- GitHub API access: checking that the repo or branch exists, webhooks, reading commits, private-repo credentials. The agent sync itself is a separate discovery and spec.
- Anchoring inside MDX JSX components beyond the block level.

## 12. VERIFICATION

- **Existing commands** (`e:\Blocks\docme`): `npm run typecheck` and `npm run build`. `npm run test` and `npm run lint` are available once SPEC1's tooling proposals land.
- **New dependency:** `npm i diff-match-patch` and `npm i -D @types/diff-match-patch`. Record the license (Apache-2.0) in the PR.
- **Unit tests** (Vitest):
  - `anchoring.test.ts`: examples 1–3; edge cases (empty content, a selection at offset 0 or at the end, unicode/emoji offsets, quotes repeated twice, clamping at 4,000 characters); the H13 benchmark (H5, H6, C4, C5, H13).
  - `docsource.test.ts`: URL, branch, SHA and path validation, and normalization tables (H1, H2, C1).
  - `comments.test.ts`: thread grouping, reply-to-root, delete order, `ReaderVisible` propagation, body limits (H8–H12, C6, C11, C12).
  - Renderer tests: render a fixture with `@testing-library/react` (proposed devDependency) and check that `data-src-*` matches the source slices (H7).
- **Static checks:**
  - `grep -rn "dangerouslySetInnerHTML" src/features/comments` → no matches (C10).
  - The `__docmeDev` bundle grep (§10).
- **Blocks configuration evidence:**
  - `blocks data schema list --json` shows `Comment` and `DocSource`.
  - `blocks data schema indexes list` shows the unique `DocSource(DocId)` index and the Comment indexes.
  - `blocks data rules policy get Comment|DocSource --json`.
  - Each mutation's dry-run, with the user's approval, is recorded in the PR.
- **Server-side checks:** C3, C7, C8 and C9 count only as E2E evidence against the real project.
- **Design:** the §4 screenshots and the pixel comparison (C14).
- **Completion checklist:** H1–H13 and C1–C15, each with its evidence.

## ASSUMPTIONS / DECISIONS

- **A10 — Comment UI comes later.**
  - Decision: comments get the data layer, anchoring library and hooks now; the panel and highlights come in the UI-modernization spec.
  - Basis: avoids building the panel twice, since the redesign follows straight after.
  - Status: delegated by the user ("you decide … whether you want to add it in this spec or not").
- **A11 — Comment volume.**
  - Decision: plan for up to 200 threads and 1,000 comments per page.
  - Basis: scaled from the confirmed small-team workload.
  - Status: delegated decision.
- **A12 — Anchor resolution budget.**
  - Decision: p95 ≤ 50 ms for 200 anchors.
  - Basis: it keeps highlighting within a single frame budget after the content renders.
  - Status: delegated decision.
- **A13 — Comments aren't copied.**
  - Decision: comments stay on the version and page where they were made.
  - Basis: feedback refers to the exact text that was reviewed. Copying would duplicate threads.
  - Status: delegated decision.
- **A14 — Anchoring model.**
  - Decision: W3C quote selector plus position selector, against the Markdown **source**, with block-level fallback and fuzzy re-anchoring.
  - Basis: the W3C Web Annotation convention. The source is the canonical, versioned text; the rendered DOM isn't stable.
  - Status: delegated decision.
- **A15 — One level of replies.**
  - Decision: replies always attach to the thread root.
  - Basis: the common convention for document comments; it keeps threads readable.
  - Status: delegated decision.
