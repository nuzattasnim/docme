import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Recent docs — local persistence of the last N opened Doc ItemIds,
 * so the sidebar can show "where you've been". No PII, no server.
 */
export interface RecentDoc {
  itemId: string;
  name: string;
  openedAt: number;
}

interface RecentDocsState {
  recents: RecentDoc[];
  record: (itemId: string, name: string) => void;
  clear: () => void;
}

const MAX_RECENTS = 5;

export const useRecentDocs = create<RecentDocsState>()(
  persist(
    (set) => ({
      recents: [],
      record: (itemId, name) =>
        set((state) => {
          const filtered = state.recents.filter((r) => r.itemId !== itemId);
          const next = [{ itemId, name, openedAt: Date.now() }, ...filtered].slice(
            0,
            MAX_RECENTS,
          );
          return { recents: next };
        }),
      clear: () => set({ recents: [] }),
    }),
    { name: "docme.recent-docs" },
  ),
);
