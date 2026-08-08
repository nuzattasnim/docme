/**
 * SSO / OIDC login flow helpers.
 *
 * Authorization-code flow against the hosted Blocks IAM:
 *   1. startLogin()           → GET /iam/v4/idp/initiate → window.location to redirect_uri
 *   2. user authenticates on iam.seliseblocks.com
 *   3. browser returns to /callback?code=...&state=...
 *   4. finishLogin()          → GET /iam/v4/idp/callback → sets the session cookie
 *   5. refreshSession()       → POST /iam/v4/oidc/token → rotates cookies (401-retry)
 *
 * The session is an HttpOnly cookie — we never read the access token in JS unless
 * the project explicitly exposes one (see auth-store.ts).
 */

const API = import.meta.env.VITE_BLOCKS_API_URL;
const PROJECT_KEY = import.meta.env.VITE_BLOCKS_PROJECT_KEY;
const CLIENT_ID = import.meta.env.VITE_BLOCKS_OIDC_CLIENT_ID;
const REDIRECT_URI = import.meta.env.VITE_BLOCKS_REDIRECT_URI;

function assertEnv() {
  if (!API) throw new Error("VITE_BLOCKS_API_URL is not set");
  if (!PROJECT_KEY) throw new Error("VITE_BLOCKS_PROJECT_KEY is not set");
  if (!CLIENT_ID) throw new Error("VITE_BLOCKS_OIDC_CLIENT_ID is not set");
  if (!REDIRECT_URI) throw new Error("VITE_BLOCKS_REDIRECT_URI is not set");
}

/** Step 1+2: fetch the authorize URL from Blocks, then redirect the browser. */
export async function startLogin(): Promise<void> {
  assertEnv();

  // x-blocks-key must be sent in BOTH the query string and the header.
  const url =
    `${API}/iam/v4/idp/initiate` +
    `?x-blocks-key=${encodeURIComponent(PROJECT_KEY)}` +
    `&clientId=${encodeURIComponent(CLIENT_ID)}` +
    `&redirectUri=${encodeURIComponent(REDIRECT_URI)}`;

  const res = await fetch(url, { headers: { "x-blocks-key": PROJECT_KEY } });
  if (!res.ok) {
    throw new Error(`initiate failed: ${res.status} ${await res.text()}`);
  }
  const { redirect_uri } = (await res.json()) as { redirect_uri?: string };
  if (!redirect_uri) throw new Error("initiate returned no redirect_uri");

  window.location.assign(redirect_uri);
}

/** Step 4: run on the /callback route. The backend sets the session cookie. */
export async function finishLogin(search: string): Promise<void> {
  assertEnv();

  const params = new URLSearchParams(search);
  const code = params.get("code");
  const state = params.get("state");
  if (!code || !state) throw new Error("missing code/state on callback");

  const url =
    `${API}/iam/v4/idp/callback` +
    `?code=${encodeURIComponent(code)}` +
    `&state=${encodeURIComponent(state)}`;

  const res = await fetch(url, {
    credentials: "include",
    headers: { "x-blocks-key": PROJECT_KEY },
  });
  if (!res.ok) {
    throw new Error(`callback failed: ${res.status} ${await res.text()}`);
  }
}

/** Step 5: refresh the hosted SSO session. Blocks rotates cookies on success. */
export async function refreshSession(): Promise<void> {
  assertEnv();

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: CLIENT_ID,
  });

  const res = await fetch(`${API}/iam/v4/oidc/token`, {
    method: "POST",
    credentials: "include",
    headers: {
      "x-blocks-key": PROJECT_KEY,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!res.ok) {
    throw new Error(`token refresh failed: ${res.status} ${await res.text()}`);
  }
}
