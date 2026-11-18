import { describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { MY_ORGS_KEY, switchOrganization, type SwitchDeps } from "./switch";

Object.defineProperty(globalThis, "window", {
  value: { localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } },
  configurable: true,
});

function deps(overrides: Partial<SwitchDeps> = {}) {
  const queryClient = new QueryClient();
  queryClient.setQueryData(["docs", "list", {}], { items: [{ ItemId: "doc-in-x" }] });
  queryClient.setQueryData(MY_ORGS_KEY, [{ itemId: "x", name: "X" }, { itemId: "y", name: "Y" }]);
  const d: SwitchDeps = {
    queryClient,
    switchOnServer: vi.fn(async () => {}),
    fetchMe: vi.fn(async () => ({ itemId: "u", organizationId: "y", roles: ["docme-viewer"] })),
    setUser: vi.fn(),
    resetRecents: vi.fn(),
    setRecentsOrganization: vi.fn(),
    ...overrides,
  };
  return d;
}

describe("switchOrganization", () => {
  it("switches, clears the cache, keeps me + orgs, loads the new recents (H4, C8, C13)", async () => {
    const d = deps();
    await switchOrganization("y", d);
    expect(d.switchOnServer).toHaveBeenCalledWith("y");
    expect(d.queryClient.getQueryData(["docs", "list", {}])).toBeUndefined();
    expect(d.queryClient.getQueryData(MY_ORGS_KEY)).toHaveLength(2);
    expect(d.queryClient.getQueryData(["auth", "me"])).toMatchObject({ organizationId: "y" });
    expect(d.queryClient.getQueryData(["iam", "me"])).toMatchObject({ organizationId: "y" });
    expect(d.resetRecents).toHaveBeenCalled();
    expect(d.setRecentsOrganization).toHaveBeenCalledWith("y");
    expect(d.setUser).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "y" }));
  });

  it("leaves everything untouched when the server switch fails (C7)", async () => {
    const d = deps({ switchOnServer: vi.fn(async () => Promise.reject(new Error("boom"))) });
    await expect(switchOrganization("y", d)).rejects.toThrow("boom");
    expect(d.queryClient.getQueryData(["docs", "list", {}])).toBeDefined();
    expect(d.resetRecents).not.toHaveBeenCalled();
    expect(d.setUser).not.toHaveBeenCalled();
  });

  it("still drops the old organization's data when me fails after the switch", async () => {
    const d = deps({ fetchMe: vi.fn(async () => Promise.reject(new Error("me failed"))) });
    await expect(switchOrganization("y", d)).rejects.toThrow("me failed");
    expect(d.queryClient.getQueryData(["docs", "list", {}])).toBeUndefined();
  });
});
