# docme

Backendless React + Vite app built on [SELISE Blocks](https://api.seliseblocks.com).
Auth flows via the hosted OIDC SSO; data via the runtime GraphQL gateway.

## Project-specific config

| Item | Value |
|---|---|
| Project | `docme` (env: `dev`) |
| App domain | `https://dmqhre.slsblx.com` |
| OIDC client | `docme web` — public, PKCE (`dc65fa6a-24a7-4319-aeca-b8393717f976`) |
| OIDC redirect URI (local dev) | `https://dmqhre.slsblx.com:5173/login/callback` |
| OIDC redirect URI (deployed) | `https://<release-domain>/login/callback` — registered by `--register-callback` |
| Activation / reset / signup | Blocks-hosted (`iam.seliseblocks.com`) — OIDC is enabled |
| API base (same-site as app) | `https://blocksapi.slsblx.com` |
| Schemas (so far) | `Doc`, `Page`, `DocVersion` |
| Multi-org | not enabled |

## One-time setup (do these once)

### 1. Point the domain at your machine

Edit `C:\Windows\System32\drivers\etc\hosts` as Administrator and add:

```
127.0.0.1   dmqhre.slsblx.com
```

(Only on your machine — the public domain still resolves normally for everyone else.)

(`fix-hosts.ps1` does this if the line is already there but commented out.)

### 2. Install, then generate a self-signed HTTPS cert

```bash
npm install
npm run cert          # writes .cert/dev-cert.pem + .cert/dev-key.pem (no OpenSSL needed)
```

### 3. Trust the cert (Windows PowerShell)

```powershell
.\trust-cert.ps1      # imports into Cert:\CurrentUser\Root — click "Yes" on the dialog
```

Restart the browser for the trust to take effect.

### 4. Create `.env.local`

```powershell
copy .env.local.example .env.local
```

Fill in `VITE_BLOCKS_PROJECT_KEY` (your `x-blocks-key`) and `VITE_BLOCKS_OIDC_CLIENT_ID`
(the public `docme web` client). No secrets go in this file.

### 5. Run

```bash
npm run dev
```

Opens at `https://dmqhre.slsblx.com:5173` (HTTPS, on the project's real domain — required for the SSO cookie).

## What you get out of the box

| Route | Purpose |
|---|---|
| `/` | Home; shows login button or profile + logout depending on session |
| `/login` | Sign-in screen |
| `/login/callback` | The OIDC redirect URI — finalizes the session cookie (`/callback` kept as an alias) |
| `/profile` | Raw `/iam/v4/iam/me` payload (for debugging) |
| `/docs` | List + create new Doc (data-gateway CRUD) |
| `/docs/:docId` | Read + mutate one Doc, its current DocVersion, and its Pages |

## Auth flow

Sign-in, signup, invitation activation and password reset all happen on the
Blocks-hosted IAM pages (`iam.seliseblocks.com`), because `isOidcEnabled` is on.
The app only starts the flow and finishes the callback, via `@seliseblocks/client`
(`src/lib/blocks/client.ts`).

1. Click **Sign in** → `blocksClient.auth.idp.redirectToProvider()` → browser goes to `iam.seliseblocks.com`.
2. Authenticate on the hosted login page.
3. IAM redirects back to `/login/callback?code=...&state=...`.
4. `blocksClient.auth.idp.callback()` → sets the session cookie.
5. App calls `GET /iam/v4/iam/me` → 200 → user is signed in.
6. On 401 anywhere → `POST /iam/v4/oidc/token` (`grant_type=refresh_token`) → retry once.
7. Sign out → `POST /iam/v4/auth/Logout` (empty body, `credentials: include`) → server clears cookies.

## Data gateway (CRUD)

All Blocks Data access goes through the SDK: `gql()` in
`src/features/data/gateway.ts` calls `getBlocksClient().data.graphql`, which sends
`x-blocks-key` and `credentials: "include"`. There is no direct HTTP call to the
gateway in `src/`. A 401 triggers one session refresh and one retry; if that
fails the app returns to `/login`.

Schemas are kept as CLI files in `blocks/data/schemas/*.json` (pulled with
`blocks data schema pull`, applied with `blocks data sync`). Field validations
live in `blocks/data/validations/*.json` (`blocks data validation save --file …`).

| Schema | Fields |
|---|---|
| `Doc` | `Name`, `Description`, `CurrentVersion`, `Status` (`Active` \| `Deleting`) |
| `DocVersion` | `DocId`, `Version`, `IsPublished`, `IsActive`, `Status` (`Ready` \| `Copying` \| `CopyFailed`), `SourceVersionId`, `SchemaVersion` (2), `Pages` (deprecated) |
| `Page` | `DocId`, `VersionId`, `Title`, `ContentType`, `Content`, `SortOrder`, `SourcePageId` |

### Relationship model (v2)

```
Doc 1───* DocVersion   (DocVersion.DocId = Doc.ItemId; Doc.CurrentVersion = the editors' default)
DocVersion 1───* Page  (Page.VersionId = DocVersion.ItemId, Page.DocId = Doc.ItemId)
```

- Each version owns its own pages. Duplicating a version copies every page
  (`SourcePageId` points at the original), so editing one version never
  changes another.
- Page order is `SortOrder` ASC, then `CreatedDate`, then `ItemId`. Adding a
  page writes only the new page (highest SortOrder + 1024); reordering writes
  only the pages that moved.
- Multi-step writes resume instead of corrupting: a failed duplicate leaves
  the new version "Copy failed" with a Retry; a failed doc delete leaves it
  "Deletion incomplete" with a Retry; a doc without a version offers
  "Create first version".
- `DocVersion.Pages` is the v1 order array. Only the migration reads it.

### Files

```
src/features/
├── data/
│   ├── gateway.ts          # gql() over the SDK, GraphQLError, 401 refresh-and-retry
│   └── errors.ts           # DocmeDataError + codes
├── docs/
│   ├── types.ts            # Doc, DocVersion, Page, version states
│   ├── services.ts         # every read/write (createDoc, addPage, duplicateVersion, …)
│   ├── ordering.ts         # SortOrder rules, reorder diff, insert chunking
│   ├── validation.ts       # input limits (mirrors blocks/data/validations)
│   ├── hooks.ts            # TanStack Query wrappers
│   ├── docs-list-page.tsx  # /docs
│   └── doc-detail-page.tsx # /docs/:docId
└── migration/              # v1 → v2 data migration (flag-gated)
```

### Data migration (v1 → v2)

Existing data written by the v1 app (shared `Pages[]` arrays) is migrated in
place, from the app, by a signed-in user — the CLI has no record commands.

1. Push the schema: `blocks data sync --dry-run --json`, then `--yes`.
2. Announce an editing freeze.
3. In `.env.local`, set `VITE_ENABLE_MIGRATION=true` and run `npm run dev`.
4. Settings → **Data migration** → **Scan** (read-only) → **Run migration**.
   Every report row must pass (`pagesNow = legacyRefs − dangling`). Orphan
   pages are listed and only deleted if you confirm **Delete orphans**.
   Running it again is safe: finished versions are skipped.
5. Deploy the new app with Release, then lift the freeze.

Never set `VITE_ENABLE_MIGRATION` in `.env.release`: without it the panel is
not even compiled into the bundle. Versions the old app wrote during the
freeze show as read-only "Needs migration" until the migration runs again.

### Checks

```bash
npm run typecheck
npm run lint
npm test            # vitest: ordering, services, migration, gateway (in-memory gateway fake)
npm run build
```

Set `VITE_PERF_MARKS=true` to log `doc-open` and `page-content` timings
(`performance.measure`) to the console.

## Folder layout

```
src/
├── lib/                  # cn() helper
├── components/ui/        # shadcn/ui primitives (button, …)
├── features/
│   ├── auth/             # SSO + auth store (existing)
│   ├── data/             # gql() over the SDK, typed errors
│   ├── docs/             # Doc / DocVersion / Page types, services, pages
│   └── migration/        # v1 → v2 data migration (flag-gated)
├── pages/                # home, login, profile
├── router.tsx
├── App.tsx
└── main.tsx
```

## Deploying with Blocks Release

`Dockerfile` (node build → unprivileged nginx on 8080) and `nginx.conf` (SPA
fallback) are what Release builds. The public `VITE_BLOCKS_*` values are passed
as build args from the repo's secret set.

1. **Link the repo (portal-only):** in https://os.seliseblocks.com, link GitHub
   `nuzattasnim/docme`, branch **`dev`** (the branch must match the project's
   environment name, `dev`).
2. **Build args:**
   `blocks release secrets sync --file .env.release --dry-run --json`, then `--yes`.
3. **First deploy:**
   `blocks release setup --register-callback --dry-run --json`, then `--yes --follow`.
   `--register-callback` adds `https://<assigned-domain>/login/callback` to the
   `docme web` OIDC client so sign-in works on the deployed URL.
4. **Later deploys:** `blocks release deploy --dry-run --json`, then `--yes --wait`.

Release builds what is pushed to `dev`, so commit and push `Dockerfile`,
`nginx.conf` and `.dockerignore` before step 3.

## Common gotchas

- **HTTP instead of HTTPS** → the session cookie is `Secure`, browser refuses to store it, login looks successful but every subsequent call 401s. Always run on `https://dmqhre.slsblx.com:5173`.
- **Wrong `VITE_BLOCKS_API_URL`** → cookie is scoped to `dmqhre.slsblx.com`, so the API must sit under the same registrable domain. Use `https://blocksapi.slsblx.com`, not `https://api.seliseblocks.com`.
- **`redirect_uri_not_registered`** → the app sends `<current origin>/login/callback`; that exact URL must be registered on the `docme web` client. The local-dev URL has `:5173` in it; deployed URLs don't.
- **No `Subject Alternative Name` in the cert** → modern browsers reject the cert. The `openssl` command above uses `-addext "subjectAltName=..."` to include the domain.
- **Committing `.env`** → add the `.env` line to `.gitignore` (already there) and never paste secrets into the chat.
- **`Field 'getDocs' does not exist on type 'Query'`** → the `Doc` schema
  hasn't been reloaded in the portal. Re-run **Reload** in the data
  service admin surface (see `blocks-data-gateway-configuration` skill).

## Next round

- Add other schemas (`npx shadcn@latest add <component>` for more UI primitives).
- Phase 2: organization isolation, roles and data access rules; remove the deprecated `DocVersion.Pages` field.

## Third-party licenses

- `diff-match-patch` (Apache-2.0) — fuzzy re-anchoring of paragraph comments (SPEC3 §6.3).
