import { create } from "zustand";
import { refreshSession } from "./sso";

export interface SessionUser {
  itemId: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  roles?: string[];
  permissions?: string[];
  active?: boolean;
  [key: string]: unknown;
}

interface AuthState {
  user: SessionUser | null;
  status: "idle" | "loading" | "authenticated" | "unauthenticated";
  setUser: (user: SessionUser | null) => void;
  setStatus: (status: AuthState["status"]) => void;
  reset: () => void;
  /** Cookie-based refresh; call when a request 401s, then retry once. */
  refresh: () => Promise<void>;
}

/**
 * Auth store. The session cookies themselves are HttpOnly — we never hold the
 * access token in JS unless the project exposes one. `user` is hydrated from
 * /iam/v4/iam/me after login; status drives the "am I logged in?" UI.
 */
export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  status: "idle",
  setUser: (user) =>
    set({
      user,
      status: user ? "authenticated" : "unauthenticated",
    }),
  setStatus: (status) => set({ status }),
  reset: () => set({ user: null, status: "unauthenticated" }),
  refresh: async () => {
    try {
      await refreshSession();
    } catch (err) {
      // Refresh failed — drop user state so the UI routes to login.
      set({ user: null, status: "unauthenticated" });
      throw err;
    }
  },
}));
