import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Persisted UI prefs — collapsed/expanded states for the two
 * left-hand sidebars (the global AppSidebar and the per-doc
 * PageListSidebar). Survives reloads via localStorage.
 */
interface SidebarPrefs {
  appSidebarCollapsed: boolean;
  pageSidebarCollapsed: boolean;
  toggleAppSidebar: () => void;
  togglePageSidebar: () => void;
  setAppSidebarCollapsed: (collapsed: boolean) => void;
  setPageSidebarCollapsed: (collapsed: boolean) => void;
}

export const useSidebarPrefs = create<SidebarPrefs>()(
  persist(
    (set) => ({
      appSidebarCollapsed: false,
      pageSidebarCollapsed: false,
      toggleAppSidebar: () =>
        set((s) => ({ appSidebarCollapsed: !s.appSidebarCollapsed })),
      togglePageSidebar: () =>
        set((s) => ({ pageSidebarCollapsed: !s.pageSidebarCollapsed })),
      setAppSidebarCollapsed: (collapsed) =>
        set({ appSidebarCollapsed: collapsed }),
      setPageSidebarCollapsed: (collapsed) =>
        set({ pageSidebarCollapsed: collapsed }),
    }),
    { name: "docme.sidebar-prefs" },
  ),
);
