import { beforeEach, describe, expect, it } from "vitest";
import { recentsKey, useRecentDocs } from "./recent-docs";

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, String(v)),
  };
}

describe("recent docs per organization (C13)", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "window", {
      value: { localStorage: memoryStorage() },
      configurable: true,
    });
    useRecentDocs.getState().reset();
  });

  it("keeps each organization's list under its own key", () => {
    const s = useRecentDocs.getState();
    s.setOrganization("org-x");
    s.record("d1", "Doc in X");
    useRecentDocs.getState().setOrganization("org-y");
    expect(useRecentDocs.getState().recents).toEqual([]);
    useRecentDocs.getState().record("d2", "Doc in Y");

    useRecentDocs.getState().setOrganization("org-x");
    expect(useRecentDocs.getState().recents.map((r) => r.itemId)).toEqual(["d1"]);
    expect(window.localStorage.getItem(recentsKey("org-y"))).toContain("d2");
  });

  it("removes the old unscoped key on first read", async () => {
    // A fresh module instance, so its one-time cleanup runs against this storage.
    const { vi } = await import("vitest");
    vi.resetModules();
    window.localStorage.setItem("docme.recent-docs", '{"state":{"recents":[]}}');
    window.localStorage.setItem("docme.recentDocs", "[]");
    const fresh = await import("./recent-docs");
    fresh.useRecentDocs.getState().setOrganization("org-x");
    expect(window.localStorage.getItem("docme.recent-docs")).toBeNull();
    expect(window.localStorage.getItem("docme.recentDocs")).toBeNull();
  });

  it("reset shows nothing until an organization is set", () => {
    useRecentDocs.getState().setOrganization("org-x");
    useRecentDocs.getState().record("d1", "A");
    useRecentDocs.getState().reset();
    expect(useRecentDocs.getState().recents).toEqual([]);
    useRecentDocs.getState().record("d9", "ignored");
    expect(useRecentDocs.getState().recents).toEqual([]);
  });
});
