/**
 * SSO / OIDC login flow helpers (blocks-iam-sso-oidc-implementation skill).
 *
 * Hosted Blocks IAM login, driven by the @seliseblocks/client SDK:
 *   1. startLogin()      → auth.idp.redirectToProvider() → browser goes to iam.seliseblocks.com
 *   2. user signs in on the hosted page
 *   3. browser returns to /login/callback?code=...&state=...
 *   4. finishLogin()     → auth.idp.callback() → Blocks sets the session cookie
 *   5. refreshSession()  → POST /iam/v4/oidc/token → rotates cookies (401-retry)
 *
 * The session is an HttpOnly cookie — we never read the access token in JS.
 * The redirect URI defaults to `${origin}/login/callback` (see lib/blocks/client.ts);
 * it must be registered on the OIDC client for every origin the app runs on.
 */
import { BlocksApiError } from "@seliseblocks/client";
import { getBlocksClient } from "@/lib/blocks/client";

const API = import.meta.env.VITE_BLOCKS_API_URL;
const PROJECT_KEY = import.meta.env.VITE_BLOCKS_PROJECT_KEY;
const CLIENT_ID = import.meta.env.VITE_BLOCKS_OIDC_CLIENT_ID;

function assertEnv() {
  if (!API) throw new Error("VITE_BLOCKS_API_URL is not set");
  if (!PROJECT_KEY) throw new Error("VITE_BLOCKS_PROJECT_KEY is not set");
  if (!CLIENT_ID) throw new Error("VITE_BLOCKS_OIDC_CLIENT_ID is not set");
}

function describe(err: unknown, step: string): Error {
  if (err instanceof BlocksApiError) {
    const body = typeof err.body === "string" ? err.body : JSON.stringify(err.body);
    return new Error(`${step} failed: ${err.status} ${body ?? ""}`.trim());
  }
  return err instanceof Error ? err : new Error(String(err));
}

/** Step 1+2: ask Blocks for the hosted login URL, then redirect the browser. */
export async function startLogin(): Promise<void> {
  assertEnv();
  try {
    await getBlocksClient().auth.idp.redirectToProvider();
  } catch (err) {
    throw describe(err, "Sign-in");
  }
}

/** Step 4: run on the callback route. Blocks sets the session cookie. */
export async function finishLogin(callbackUrl: string): Promise<void> {
  assertEnv();
  const params = new URL(callbackUrl).searchParams;
  const error = params.get("error_description") ?? params.get("error");
  if (error) throw new Error(error);
  if (!params.get("code") || !params.get("state")) {
    throw new Error("missing code/state on callback");
  }
  try {
    await getBlocksClient().auth.idp.callback(callbackUrl);
  } catch (err) {
    throw describe(err, "Callback");
  }
}

/**
 * Step 5: refresh the hosted SSO session. Blocks rotates the cookies on success.
 *
 * Sent through the SDK's HTTP client (credentials + x-blocks-key). Not
 * `auth.oidc.refreshToken()`: the SDK's auth helpers return the body without
 * checking the HTTP status, so a failed refresh would look like success.
 * The refresh token travels in the HttpOnly cookie, never in the body.
 */
export async function refreshSession(): Promise<void> {
  assertEnv();
  const body = new URLSearchParams({ grant_type: "refresh_token", client_id: CLIENT_ID });
  const res = await getBlocksClient().http.send("/iam/v4/oidc/token", {
    method: "POST",
    body,
    auth: false,
  });
  if (!res.ok) {
    throw new Error(`token refresh failed: ${res.status}`);
  }
}
