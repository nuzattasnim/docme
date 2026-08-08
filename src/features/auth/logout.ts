import { useAuthStore } from "./auth-store";

/**
 * Cookie/session logout. POST /iam/v4/auth/Logout with empty body + credentials.
 * The server reads the session from the cookies and clears them.
 */
export async function logout(): Promise<void> {
  const API = import.meta.env.VITE_BLOCKS_API_URL;
  const PROJECT_KEY = import.meta.env.VITE_BLOCKS_PROJECT_KEY;

  // Always clear local state, even if the network call fails — the UI must
  // never show a stale signed-in state.
  const reset = useAuthStore.getState().reset;

  try {
    await fetch(`${API}/iam/v4/auth/Logout`, {
      method: "POST",
      credentials: "include",
      headers: {
        "x-blocks-key": PROJECT_KEY,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
  } finally {
    reset();
  }
}
