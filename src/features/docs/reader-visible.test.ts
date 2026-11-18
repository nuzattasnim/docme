import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeGateway, type Rec } from "@/features/data/testing/fake-gateway";

const gw = vi.hoisted(() => ({ current: null as unknown as FakeGateway }));
vi.mock("@/lib/blocks/client", () => ({
  getBlocksClient: () => ({
    data: { graphql: (r: Parameters<FakeGateway["graphql"]>[0]) => gw.current.graphql(r) },
  }),
}));

import {
  publishVersion,
  reconcileReaderVisibility,
  setVersionActive,
  unpublishVersion,
  viewerDefaultVersion,
} from "./services";

let fake: FakeGateway;

beforeEach(() => {
  fake = new FakeGateway();
  gw.current = fake;
});

const ORG = "org-x";

function seedVersion(flags: { IsPublished?: boolean; IsActive?: boolean }, pages = 2, readerVisible?: boolean) {
  const doc = fake.seed("Doc", { Name: "D", Status: "Active", OrganizationId: ORG });
  const v = fake.seed("DocVersion", {
    DocId: doc.ItemId,
    Version: "1",
    Status: "Ready",
    SchemaVersion: 2,
    IsPublished: false,
    IsActive: false,
    OrganizationId: ORG,
    ...flags,
  });
  const ps: Rec[] = [];
  for (let i = 0; i < pages; i++) {
    ps.push(
      fake.seed("Page", {
        DocId: doc.ItemId,
        VersionId: v.ItemId,
        Title: `P${i}`,
        SortOrder: (i + 1) * 1024,
        ...(readerVisible === undefined ? {} : { ReaderVisible: readerVisible }),
        OrganizationId: ORG,
      }),
    );
  }
  fake.resetLog();
  return { doc, v, pages: ps };
}

const visibleFlags = (pages: Rec[]) => pages.map((p) => fake.get("Page", p.ItemId)?.ReaderVisible);

describe("ReaderVisible write order (§6.2, H9)", () => {
  it("publish: version flag first, then pages", async () => {
    const { doc, v, pages } = seedVersion({});
    await publishVersion({ docId: doc.ItemId, versionId: v.ItemId });
    const ops = fake.mutations().map((r) => r.ops[0]);
    expect(ops.indexOf("updateDocVersion")).toBeLessThan(ops.indexOf("updatePage"));
    expect(visibleFlags(pages)).toEqual([true, true]);
  });

  it("unpublish of an inactive version: pages first, then the flag", async () => {
    const { v, pages } = seedVersion({ IsPublished: true }, 2, true);
    await unpublishVersion(v.ItemId);
    const ops = fake.mutations().map((r) => r.ops[0]);
    expect(ops.indexOf("updatePage")).toBeLessThan(ops.indexOf("updateDocVersion"));
    expect(visibleFlags(pages)).toEqual([false, false]);
    expect(fake.get("DocVersion", v.ItemId)?.IsPublished).toBe(false);
  });

  it("unpublish of an active version keeps its pages visible", async () => {
    const { v, pages } = seedVersion({ IsPublished: true, IsActive: true }, 2, true);
    await unpublishVersion(v.ItemId);
    expect(visibleFlags(pages)).toEqual([true, true]);
  });

  it("deactivate (not published): pages first, then the flag", async () => {
    const { v, pages } = seedVersion({ IsActive: true }, 2, true);
    await setVersionActive(v.ItemId, false);
    const ops = fake.mutations().map((r) => r.ops[0]);
    expect(ops.indexOf("updatePage")).toBeLessThan(ops.indexOf("updateDocVersion"));
    expect(visibleFlags(pages)).toEqual([false, false]);
  });

  it("an interrupted hide never leaves pages visible for a hidden version (C11)", async () => {
    const { v, pages } = seedVersion({ IsPublished: true }, 2, true);
    fake.failHook = (req) => {
      if (req.ops[0] === "updateDocVersion") throw new Error("network down");
    };
    await expect(unpublishVersion(v.ItemId)).rejects.toThrow("network down");
    // The version still says published, and its pages are already hidden: safe for viewers.
    expect(visibleFlags(pages)).toEqual([false, false]);
  });
});

describe("reconcileReaderVisibility (C11)", () => {
  it("fixes every page and reports 0 on a second run", async () => {
    const pub = seedVersion({ IsPublished: true }, 2); // ReaderVisible missing
    const draft = seedVersion({}, 1, true); // wrongly visible
    const other = fake.seed("DocVersion", { IsPublished: true, OrganizationId: "org-y" });
    fake.seed("Page", { VersionId: other.ItemId, Title: "Y", OrganizationId: "org-y" });

    const first = await reconcileReaderVisibility(ORG);
    expect(first).toEqual({ versions: 2, pagesChanged: 3 });
    expect(visibleFlags(pub.pages)).toEqual([true, true]);
    expect(visibleFlags(draft.pages)).toEqual([false]);
    // Another organization's pages are not touched.
    expect(fake.all("Page").find((p) => p.Title === "Y")?.ReaderVisible).toBeUndefined();

    const second = await reconcileReaderVisibility(ORG);
    expect(second.pagesChanged).toBe(0);
  });
});

describe("viewerDefaultVersion (BR3)", () => {
  const v = (id: string, d: string, f: { IsPublished?: boolean; IsActive?: boolean }) => ({
    ItemId: id,
    CreatedDate: d,
    ...f,
  });

  it("prefers the newest published version", () => {
    expect(
      viewerDefaultVersion([
        v("a", "2026-01-01", { IsPublished: true }),
        v("b", "2026-03-01", { IsActive: true }),
        v("c", "2026-02-01", { IsPublished: true }),
      ])?.ItemId,
    ).toBe("c");
  });

  it("falls back to the newest active version, then to none", () => {
    expect(
      viewerDefaultVersion([v("a", "2026-01-01", { IsActive: true }), v("b", "2026-02-01", { IsActive: true })])
        ?.ItemId,
    ).toBe("b");
    expect(viewerDefaultVersion([v("a", "2026-01-01", {})])).toBeNull();
  });
});
