import { create } from "zustand";

/**
 * Recent docs — the last N opened docs, stored per organization under
 * `docme.recentDocs.<organizationId>`, so switching organization never
 * shows another organization's doc names (SPEC2 C13). No PII, no server.
 */
export interface RecentDoc {
  itemId: string;
  name: string;
  openedAt: number;
}

interface RecentDocsState {
  organizationId: string | null;
  recents: RecentDoc[];
  /** Load the list for `organizationId` (null = nothing shown). */
  setOrganization: (organizationId: string | null) => void;
  record: (itemId: string, name: string) => void;
  /** Drop a doc, e.g. after it is deleted. */
  remove: (itemId: string) => void;
  clear: () => void;
  /** Forget the in-memory list (used while switching organization). */
  reset: () => void;
}

const MAX_RECENTS = 5;
export const RECENTS_KEY_PREFIX = "docme.recentDocs.";
/** Keys written before the list was scoped by organization. */
const LEGACY_KEYS = ["docme.recent-docs", "docme.recentDocs"];

export const recentsKey = (organizationId: string) => `${RECENTS_KEY_PREFIX}${organizationId}`;

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

let legacyCleared = false;
function clearLegacyKeys() {
  if (legacyCleared) return;
  legacyCleared = true;
  const s = storage();
  try {
    for (const key of LEGACY_KEYS) s?.removeItem(key);
  } catch {
    /* storage blocked: nothing to clear */
  }
}

function load(organizationId: string): RecentDoc[] {
  clearLegacyKeys();
  try {
    const raw = storage()?.getItem(recentsKey(organizationId));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed
          .filter(
            (r): r is RecentDoc =>
              !!r && typeof r.itemId === "string" && typeof r.name === "string",
          )
          .slice(0, MAX_RECENTS)
      : [];
  } catch {
    return [];
  }
}

function save(organizationId: string | null, recents: RecentDoc[]) {
  if (!organizationId) return;
  try {
    storage()?.setItem(recentsKey(organizationId), JSON.stringify(recents));
  } catch {
    /* storage full or blocked: keep the in-memory list */
  }
}

export const useRecentDocs = create<RecentDocsState>()((set, get) => ({
  organizationId: null,
  recents: [],
  setOrganization: (organizationId) => {
    if (organizationId === get().organizationId) return;
    set({ organizationId, recents: organizationId ? load(organizationId) : [] });
  },
  record: (itemId, name) => {
    const { organizationId, recents } = get();
    if (!organizationId) return;
    const next = [
      { itemId, name, openedAt: Date.now() },
      ...recents.filter((r) => r.itemId !== itemId),
    ].slice(0, MAX_RECENTS);
    save(organizationId, next);
    set({ recents: next });
  },
  remove: (itemId) => {
    const { organizationId, recents } = get();
    const next = recents.filter((r) => r.itemId !== itemId);
    save(organizationId, next);
    set({ recents: next });
  },
  clear: () => {
    save(get().organizationId, []);
    set({ recents: [] });
  },
  reset: () => set({ organizationId: null, recents: [] }),
}));
