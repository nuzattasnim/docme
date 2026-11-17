/**
 * One session-recovery policy for every Blocks call the app makes.
 *
 * `withSession(call)` runs `call`. On HTTP 401 it refreshes the hosted-login
 * session once (concurrent 401s share that refresh) and retries exactly once.
 * If the refresh fails, or the retry is also 401, it throws
 * `SessionExpiredError`; the caller decides whether that means "redirect to
 * /login" (data calls) or "not signed in" (the `me` probe).
 */
import { BlocksApiError } from "@seliseblocks/client";
import { useAuthStore } from "./auth-store";

export class SessionExpiredError extends Error {
  constructor(cause: unknown) {
    super("Your session has expired. Please sign in again.", { cause });
    this.name = "SessionExpiredError";
  }
}

export function isUnauthorized(err: unknown): boolean {
  return err instanceof BlocksApiError && err.status === 401;
}

let refreshInFlight: Promise<void> | null = null;

function refreshOnce(): Promise<void> {
  if (!refreshInFlight) {
    refreshInFlight = useAuthStore
      .getState()
      .refresh()
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

export async function withSession<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (err) {
    if (!isUnauthorized(err)) throw err;
  }
  try {
    await refreshOnce();
  } catch (refreshErr) {
    throw new SessionExpiredError(refreshErr);
  }
  try {
    return await call();
  } catch (retryErr) {
    if (isUnauthorized(retryErr)) {
      useAuthStore.getState().reset();
      throw new SessionExpiredError(retryErr);
    }
    throw retryErr;
  }
}
