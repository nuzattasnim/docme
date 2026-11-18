import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeGateway } from "@/features/data/testing/fake-gateway";

const gw = vi.hoisted(() => ({ current: null as unknown as FakeGateway }));
vi.mock("@/lib/blocks/client", () => ({
  getBlocksClient: () => ({
    data: { graphql: (r: Parameters<FakeGateway["graphql"]>[0]) => gw.current.graphql(r) },
  }),
}));

import { assignLegacyToOrganization, scanLegacyOrganization } from "./legacy-org";

let fake: FakeGateway;

beforeEach(() => {
  fake = new FakeGateway();
  gw.current = fake;
});

describe("assignLegacyToOrganization (§6.5, H10, C15)", () => {
  it("moves default/empty records into the organization and leaves other organizations alone", async () => {
    const d1 = fake.seed("Doc", { Name: "L1", OrganizationId: "default" });
    fake.seed("Doc", { Name: "L2" });
    fake.seed("DocVersion", { DocId: d1.ItemId, OrganizationId: "default" });
    fake.seed("Page", { Title: "A", OrganizationId: "default" });
    fake.seed("Page", { Title: "B", OrganizationId: "" });
    const foreign = fake.seed("Doc", { Name: "Y", OrganizationId: "org-y" });

    const report = await assignLegacyToOrganization("org-x");

    expect(report.pendingBefore).toEqual({ Doc: 2, DocVersion: 1, Page: 2 });
    expect(report.updated).toEqual({ Doc: 2, DocVersion: 1, Page: 2 });
    expect(report.pendingAfter).toEqual({ Doc: 0, DocVersion: 0, Page: 0 });
    expect(report.inOrganization).toEqual({ Doc: 2, DocVersion: 1, Page: 2 });
    expect(fake.get("Doc", foreign.ItemId)?.OrganizationId).toBe("org-y");
  });

  it("a second run changes nothing and reports 0 pending", async () => {
    fake.seed("Doc", { Name: "L1", OrganizationId: "default" });
    await assignLegacyToOrganization("org-x");
    fake.resetLog();
    const again = await assignLegacyToOrganization("org-x");
    expect(again.updated).toEqual({ Doc: 0, DocVersion: 0, Page: 0 });
    expect(again.pendingAfter).toEqual({ Doc: 0, DocVersion: 0, Page: 0 });
    expect(fake.mutations()).toHaveLength(0);
  });

  it("refuses the root context as a target", async () => {
    await expect(assignLegacyToOrganization("default")).rejects.toThrow(/real organization/);
  });

  it("scan only reads", async () => {
    fake.seed("Doc", { Name: "L1", OrganizationId: "default" });
    const scan = await scanLegacyOrganization("org-x");
    expect(scan.pending.Doc).toBe(1);
    expect(fake.mutations()).toHaveLength(0);
  });
});
