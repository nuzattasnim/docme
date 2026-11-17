import { getBlocksClient } from "@/lib/blocks/client";
import { useAuthStore } from "./auth-store";

/**
 * Cookie/session logout through the SDK (`POST /iam/v4/auth/logout`). The
 * server reads the session from the cookies and clears them.
 */
export async function logout(): Promise<void> {
  // Always clear local state, even if the network call fails — the UI must
  // never show a stale signed-in state.
  try {
    await getBlocksClient().auth.logout({});
  } finally {
    useAuthStore.getState().reset();
  }
}
