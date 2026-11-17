import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeGateway } from "@/features/data/testing/fake-gateway";

const gw = vi.hoisted(() => ({ current: null as unknown as FakeGateway }));
vi.mock("@/lib/blocks/client", () => ({
  getBlocksClient: () => ({
    data: { graphql: (r: Parameters<FakeGateway["graphql"]>[0]) => gw.current.graphql(r) },
  }),
}));

import { deleteOrphans, runMigration, scanMigration } from "./migration";

let fake: FakeGateway;

beforeEach(() => {
  fake = new FakeGateway();
  gw.current = fake;
});

/** SPEC1 §7 example 5: v1.Pages = [A, B, Z(missing)], v2.Pages = [A, C]. */
function seedExample5() {
  const doc = fake.seed("Doc", { Name: "L1" });
  const A = fake.seed("Page", { Title: "A", ContentType: "md", Content: "alpha" });
  const B = fake.seed("Page", { Title: "B", ContentType: "md", Content: "beta" });
  const C = fake.seed("Page", { Title: "C", ContentType: "mdx", Content: "gamma" });
  const v1 = fake.seed("DocVersion", { DocId: doc.ItemId, Version: "1", Pages: [A.ItemId, B.ItemId, "Z"] });
  const v2 = fake.seed("DocVersion", { DocId: doc.ItemId, Version: "2", Pages: [A.ItemId, C.ItemId] });
  fake.resetLog();
  return { doc, A, B, C, v1, v2 };
}

describe("scan (H10)", () => {
  it("counts the F-LEGACY fixture and issues no mutation", async () => {
    // L1: v1 [A, B], v2 duplicated from v1 → shares [A, B]
    const l1 = fake.seed("Doc", { Name: "L1" });
    const A = fake.seed("Page", { Title: "A" });
    const B = fake.seed("Page", { Title: "B" });
    fake.seed("DocVersion", { DocId: l1.ItemId, Version: "1", Pages: [A.ItemId, B.ItemId] });
    fake.seed("DocVersion", { DocId: l1.ItemId, Version: "2", Pages: [A.ItemId, B.ItemId] });
    // L2: v1 [C, Z-deleted]
    const l2 = fake.seed("Doc", { Name: "L2" });
    const C = fake.seed("Page", { Title: "C" });
    fake.seed("DocVersion", { DocId: l2.ItemId, Version: "1", Pages: [C.ItemId, "Z-deleted"] });
    // one orphan page O
    fake.seed("Page", { Title: "O" });
    fake.resetLog();

    const scan = await scanMigration();
    expect(scan).toMatchObject({
      docs: 2,
      versions: 3,
      versionsMigrated: 0,
      legacyRefs: 6,
      sharedPages: 2,
      orphanPages: 1,
      danglingRefs: 1,
    });
    expect(scan.orphans.map((o) => o.Title)).toEqual(["O"]);
    expect(fake.mutations()).toHaveLength(0);
  });
});

describe("run (H11, C9, C13)", () => {
  it("applies example 5 and every report row passes", async () => {
    const { doc, A, B, C, v1, v2 } = seedExample5();
    const report = await runMigration();

    expect(fake.get("Page", A.ItemId)).toMatchObject({ VersionId: v1.ItemId, DocId: doc.ItemId, SortOrder: 1024 });
    expect(fake.get("Page", B.ItemId)).toMatchObject({ VersionId: v1.ItemId, SortOrder: 2048 });
    expect(fake.get("Page", C.ItemId)).toMatchObject({ VersionId: v2.ItemId, SortOrder: 2048 });
    const copy = fake.all("Page").find((p) => p.SourcePageId === A.ItemId);
    expect(copy).toMatchObject({
      VersionId: v2.ItemId,
      DocId: doc.ItemId,
      SortOrder: 1024,
      Title: "A",
      Content: "alpha",
    });
    expect(fake.get("DocVersion", v1.ItemId)).toMatchObject({ SchemaVersion: 2, Status: "Ready" });
    expect(fake.get("DocVersion", v2.ItemId)).toMatchObject({ SchemaVersion: 2, Status: "Ready" });
    expect(fake.get("Doc", doc.ItemId)?.Status).toBe("Active");

    expect(report.rows.map(({ version, legacyRefs, dangling, pagesNow, pass }) => ({
      version,
      legacyRefs,
      dangling,
      pagesNow,
      pass,
    }))).toEqual([
      { version: "1", legacyRefs: 3, dangling: 1, pagesNow: 2, pass: true },
      { version: "2", legacyRefs: 2, dangling: 0, pagesNow: 2, pass: true },
    ]);
    expect(report.rows[0].danglingIds).toEqual(["Z"]);
    expect(report.scanAfter.versions - report.scanAfter.versionsMigrated).toBe(0);
  });

  it("running again writes nothing and the next scan reports 0 unmigrated versions (C9)", async () => {
    seedExample5();
    await runMigration();
    const pageCount = fake.all("Page").length;
    fake.resetLog();

    const again = await runMigration();
    expect(fake.mutations()).toHaveLength(0);
    expect(again.rows).toHaveLength(0);
    expect(fake.all("Page")).toHaveLength(pageCount);
    const scan = await scanMigration();
    expect(scan.versions - scan.versionsMigrated).toBe(0);
  });

  it("an interrupted run resumes without duplicate copies", async () => {
    const { v2 } = seedExample5();
    let n = 0;
    fake.failHook = (req) => {
      if (req.kind === "mutation" && ++n === 4) throw new TypeError("Failed to fetch"); // during v2
    };
    await expect(runMigration()).rejects.toThrow();
    fake.failHook = null;
    const report = await runMigration();
    expect(report.rows.every((r) => r.pass)).toBe(true);
    expect(fake.all("Page").filter((p) => p.VersionId === v2.ItemId)).toHaveLength(2);
    expect(fake.all("Page").filter((p) => p.SourcePageId)).toHaveLength(1);
  });

  it("never changes orphan pages until the user deletes them (C13)", async () => {
    seedExample5();
    const O = fake.seed("Page", { Title: "O", Content: "orphan" });
    const report = await runMigration();
    expect(fake.get("Page", O.ItemId)).toMatchObject({ Title: "O", Content: "orphan" });
    expect(fake.get("Page", O.ItemId)?.VersionId).toBeUndefined();
    expect(report.scanAfter.orphans.map((o) => o.ItemId)).toEqual([O.ItemId]);

    await deleteOrphans([O.ItemId]);
    expect(fake.get("Page", O.ItemId)).toBeUndefined();
    expect((await scanMigration()).orphanPages).toBe(0);
  });

  it("leaves already-migrated v2 versions alone", async () => {
    const doc = fake.seed("Doc", { Name: "New", Status: "Active" });
    const v = fake.seed("DocVersion", { DocId: doc.ItemId, Version: "1", SchemaVersion: 2, Status: "Ready" });
    fake.seed("Page", { DocId: doc.ItemId, VersionId: v.ItemId, Title: "P", SortOrder: 1024 });
    fake.resetLog();
    const report = await runMigration();
    expect(report.rows).toHaveLength(0);
    expect(fake.mutations()).toHaveLength(0);
  });
});
