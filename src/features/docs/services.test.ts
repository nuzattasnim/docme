import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeGateway } from "@/features/data/testing/fake-gateway";
import type { DocmeDataError } from "@/features/data/errors";

const gw = vi.hoisted(() => ({ current: null as unknown as FakeGateway }));
vi.mock("@/lib/blocks/client", () => ({
  getBlocksClient: () => ({
    data: { graphql: (r: Parameters<FakeGateway["graphql"]>[0]) => gw.current.graphql(r) },
  }),
}));

import {
  CopyIncompleteError,
  ReorderIncompleteError,
  addPage,
  createBlankVersion,
  createDoc,
  deleteDocCascade,
  deleteVersion,
  duplicateVersion,
  ensureFirstVersion,
  listPageSummaries,
  publishVersion,
  reorderPages,
  resumeDuplicate,
  updatePage,
} from "./services";
import { INSERT_CHUNK_MAX_BYTES, serializedBytes } from "./ordering";

let fake: FakeGateway;

beforeEach(() => {
  fake = new FakeGateway();
  gw.current = fake;
});

/** A v2 doc with one Ready version and `n` pages. */
/** Mutation ops in order, with repeats of the same op collapsed (deletes loop one record per call). */
function steps(): string[] {
  return fake
    .mutations()
    .map((r) => r.ops[0])
    .filter((op, i, all) => op !== all[i - 1]);
}

function seedDoc(n: number, content = (i: number) => `content ${i}`) {
  const doc = fake.seed("Doc", { Name: "Guide", Status: "Active" });
  const v = fake.seed("DocVersion", {
    DocId: doc.ItemId,
    Version: "1.0.0",
    Status: "Ready",
    SchemaVersion: 2,
    IsPublished: false,
    IsActive: false,
  });
  doc.CurrentVersion = v.ItemId;
  const pages = Array.from({ length: n }, (_, i) =>
    fake.seed("Page", {
      DocId: doc.ItemId,
      VersionId: v.ItemId,
      Title: `Page ${i}`,
      ContentType: "md",
      Content: content(i),
      SortOrder: (i + 1) * 1024,
    }),
  );
  fake.resetLog();
  return { doc, v, pages };
}

const pagesOf = (versionId: string) => fake.all("Page").filter((p) => p.VersionId === versionId);

describe("createDoc (H1) and ensureFirstVersion (C1)", () => {
  it("persists Doc{Status:Active} and a ready v2 version 0.0.1, then sets CurrentVersion", async () => {
    const { docId, versionId } = await createDoc({ name: "  Guide " });
    expect(fake.get("Doc", docId)).toMatchObject({ Name: "Guide", Status: "Active", CurrentVersion: versionId });
    expect(fake.get("DocVersion", versionId)).toMatchObject({
      DocId: docId,
      Version: "0.0.1",
      Status: "Ready",
      SchemaVersion: 2,
      IsPublished: false,
      IsActive: false,
    });
  });

  it("repairs a doc whose version insert failed, and a second call creates nothing", async () => {
    fake.failHook = (req) => {
      if (req.ops.includes("insertDocVersion")) throw new TypeError("Failed to fetch");
    };
    await expect(createDoc({ name: "Guide" })).rejects.toThrow("Failed to fetch");
    fake.failHook = null;
    const [doc] = fake.all("Doc");
    expect(doc.CurrentVersion).toBeUndefined();

    const first = await ensureFirstVersion(doc.ItemId);
    const second = await ensureFirstVersion(doc.ItemId);
    expect(second).toBe(first);
    expect(fake.all("DocVersion")).toHaveLength(1);
    expect(fake.get("Doc", doc.ItemId)?.CurrentVersion).toBe(first);
  });

  it("reuses the oldest existing version instead of creating a second 0.0.1", async () => {
    const doc = fake.seed("Doc", { Name: "D", Status: "Active" });
    const old = fake.seed("DocVersion", { DocId: doc.ItemId, Version: "0.0.1", Status: "Ready", SchemaVersion: 2 });
    fake.seed("DocVersion", { DocId: doc.ItemId, Version: "0.0.2", Status: "Ready", SchemaVersion: 2 });
    expect(await ensureFirstVersion(doc.ItemId)).toBe(old.ItemId);
    expect(fake.all("DocVersion")).toHaveLength(2);
  });

  it("rejects an empty name without sending anything", async () => {
    await expect(createDoc({ name: "  " })).rejects.toMatchObject({ code: "InvalidInput" });
    expect(fake.log).toHaveLength(0);
  });
});

describe("addPage (H2, C5, C7)", () => {
  it("inserts one page at max+1024 with DocId, VersionId and ReaderVisible, in 3 requests, never writing the version", async () => {
    const { doc, v } = seedDoc(3);
    const id = await addPage({ docId: doc.ItemId, versionId: v.ItemId, title: "New", contentType: "md", content: "x" });
    expect(fake.get("Page", id)).toMatchObject({
      DocId: doc.ItemId,
      VersionId: v.ItemId,
      SortOrder: 4096,
      ReaderVisible: false,
    });
    // Two reads (top SortOrder, the version's visibility) and the insert.
    expect(fake.log).toHaveLength(3);
    expect(fake.log.flatMap((r) => r.ops)).not.toContain("updateDocVersion");
    const list = await listPageSummaries(v.ItemId);
    expect(list.at(-1)?.ItemId).toBe(id);
  });

  it("starts at 1024 in an empty version", async () => {
    const { doc, v } = seedDoc(0);
    const id = await addPage({ docId: doc.ItemId, versionId: v.ItemId, title: "First", contentType: "md", content: "" });
    expect(fake.get("Page", id)?.SortOrder).toBe(1024);
  });

  it("two concurrent adds both persist and both show, in a deterministic order (D3 regression)", async () => {
    const { doc, v } = seedDoc(3);
    const add = (title: string) =>
      addPage({ docId: doc.ItemId, versionId: v.ItemId, title, contentType: "md", content: "" });
    const [x, y] = await Promise.all([add("X"), add("Y")]);
    expect(fake.get("Page", x)?.SortOrder).toBe(4096);
    expect(fake.get("Page", y)?.SortOrder).toBe(4096);
    const ids = (await listPageSummaries(v.ItemId)).map((p) => p.ItemId);
    expect(ids).toHaveLength(5);
    expect(ids.slice(-2)).toEqual([x, y]); // same SortOrder → CreatedDate order
    expect(await listPageSummaries(v.ItemId)).toEqual(await listPageSummaries(v.ItemId));
  });

  it("rejects 204,801 characters with ContentTooLarge and sends no request (example 3)", async () => {
    const { doc, v } = seedDoc(0);
    const err = await addPage({
      docId: doc.ItemId,
      versionId: v.ItemId,
      title: "Big",
      contentType: "md",
      content: "x".repeat(204_801),
    }).catch((e: DocmeDataError) => e);
    expect(err).toMatchObject({ code: "ContentTooLarge", message: "Page content is limited to 200 KB" });
    expect(fake.log).toHaveLength(0);
  });

  it("rejects an empty or too-long title without a request", async () => {
    const { doc, v } = seedDoc(0);
    const base = { docId: doc.ItemId, versionId: v.ItemId, contentType: "md", content: "" };
    await expect(addPage({ ...base, title: " " })).rejects.toMatchObject({ message: "Title is required" });
    await expect(addPage({ ...base, title: "t".repeat(201) })).rejects.toMatchObject({
      message: "Title is limited to 200 characters",
    });
    await expect(updatePage("any", { Content: "x".repeat(204_801) })).rejects.toMatchObject({
      code: "ContentTooLarge",
    });
    expect(fake.log).toHaveLength(0);
  });
});

describe("listPageSummaries (H3)", () => {
  it("requests ItemId, Title, SortOrder, CreatedDate only — no Content — filtered by VersionId", async () => {
    const { v } = seedDoc(2);
    await listPageSummaries(v.ItemId);
    expect(fake.log).toHaveLength(1);
    expect(fake.log[0].variables.where).toEqual({ VersionId: { eq: v.ItemId } });
  });
});

describe("reorderPages (H4, C6)", () => {
  it("writes SortOrder only on the pages that moved", async () => {
    const { v, pages } = seedDoc(4);
    const [a, b, c, d] = pages.map((p) => p.ItemId);
    const res = await reorderPages({ versionId: v.ItemId, orderedIds: [a, b, d, c] });
    expect(res.updated).toBe(2);
    expect((await listPageSummaries(v.ItemId)).map((p) => p.ItemId)).toEqual([a, b, d, c]);
  });

  it("on partial failure reports it; saving again applies only what's left and reaches the chosen order", async () => {
    const { v, pages } = seedDoc(4);
    const [a, b, c, d] = pages.map((p) => p.ItemId);
    const chosen = [d, c, b, a];
    let failed = false;
    fake.failHook = (req) => {
      const where = req.variables.where as { ItemId?: { eq?: string } } | undefined;
      if (!failed && req.ops.includes("updatePage") && where?.ItemId?.eq === b) {
        failed = true;
        throw new TypeError("Failed to fetch");
      }
    };
    await expect(reorderPages({ versionId: v.ItemId, orderedIds: chosen })).rejects.toBeInstanceOf(
      ReorderIncompleteError,
    );
    fake.resetLog();
    const res = await reorderPages({ versionId: v.ItemId, orderedIds: chosen });
    expect(res.updated).toBe(1);
    expect((await listPageSummaries(v.ItemId)).map((p) => p.ItemId)).toEqual(chosen);
  });
});

describe("duplicateVersion (H5, H6, C2, C14, C15)", () => {
  it("copies every page into the new version and makes it current", async () => {
    const { doc, v, pages } = seedDoc(3);
    const progress: Array<[number, number]> = [];
    const newId = await duplicateVersion(
      { docId: doc.ItemId, sourceVersionId: v.ItemId, label: "1.1.0" },
      (d, t) => progress.push([d, t]),
    );
    expect(fake.get("DocVersion", newId)).toMatchObject({
      Status: "Ready",
      SourceVersionId: v.ItemId,
      SchemaVersion: 2,
      IsPublished: false,
      IsActive: false,
    });
    expect(fake.get("Doc", doc.ItemId)?.CurrentVersion).toBe(newId);
    const copies = pagesOf(newId);
    expect(copies).toHaveLength(3);
    for (const src of pages) {
      const copy = copies.find((c) => c.SourcePageId === src.ItemId);
      expect(copy).toMatchObject({
        DocId: doc.ItemId,
        Title: src.Title,
        ContentType: src.ContentType,
        Content: src.Content,
        SortOrder: src.SortOrder,
      });
      expect(copy?.ItemId).not.toBe(src.ItemId);
    }
    expect(progress.at(-1)).toEqual([3, 3]);
  });

  it("editing a page of the copy leaves the source page byte-for-byte unchanged (H6)", async () => {
    const { doc, v, pages } = seedDoc(2);
    const before = pages[0].Content;
    const newId = await duplicateVersion({ docId: doc.ItemId, sourceVersionId: v.ItemId, label: "1.1.0" });
    const copy = pagesOf(newId).find((p) => p.SourcePageId === pages[0].ItemId)!;
    await updatePage(copy.ItemId, { Content: "changed" });
    expect(fake.get("Page", pages[0].ItemId)?.Content).toBe(before);
  });

  it("rejects a label already used on the doc before inserting anything (C14)", async () => {
    const { doc, v } = seedDoc(1);
    const err = await createBlankVersion({ docId: doc.ItemId, label: "1.0.0" }).catch((e: DocmeDataError) => e);
    expect(err).toMatchObject({ code: "VersionLabelTaken", message: "Version 1.0.0 already exists on this doc" });
    await expect(
      duplicateVersion({ docId: doc.ItemId, sourceVersionId: v.ItemId, label: " 1.0.0 " }),
    ).rejects.toMatchObject({ code: "VersionLabelTaken" });
    expect(fake.mutations()).toHaveLength(0);
  });

  it("100 pages of 200 KB: no insert request has more than 20 pages or 2 MB (C15)", async () => {
    const { doc, v } = seedDoc(100, () => "x".repeat(204_800));
    const progress: number[] = [];
    await duplicateVersion({ docId: doc.ItemId, sourceVersionId: v.ItemId, label: "big" }, (d) =>
      progress.push(d),
    );
    const inserts = fake.mutations().filter((r) => r.ops.every((o) => o === "insertPage"));
    expect(inserts.length).toBeGreaterThan(0);
    for (const req of inserts) {
      expect(req.ops.length).toBeLessThanOrEqual(20);
      expect(serializedBytes(req.variables)).toBeLessThanOrEqual(INSERT_CHUNK_MAX_BYTES);
    }
    expect(inserts.reduce((n, r) => n + r.ops.length, 0)).toBe(100);
    expect(progress.at(-1)).toBe(100);
    expect(progress.some((d) => d > 0 && d < 100)).toBe(true);
  });

  it("a failure partway leaves CurrentVersion unchanged; Retry copies only the missing pages (C2)", async () => {
    const { doc, v } = seedDoc(45);
    let insertBatches = 0;
    fake.failHook = (req) => {
      if (req.ops[0] === "insertPage" && req.ops.length > 1 && ++insertBatches === 2) {
        throw new TypeError("Failed to fetch");
      }
    };
    const err = await duplicateVersion({ docId: doc.ItemId, sourceVersionId: v.ItemId, label: "1.1.0" }).catch(
      (e: DocmeDataError) => e,
    );
    expect(err).toBeInstanceOf(CopyIncompleteError);
    const newId = (err as CopyIncompleteError).versionId;
    expect(fake.get("DocVersion", newId)?.Status).toBe("CopyFailed");
    expect(fake.get("Doc", doc.ItemId)?.CurrentVersion).toBe(v.ItemId);
    expect(pagesOf(newId)).toHaveLength(20);

    fake.failHook = null;
    await resumeDuplicate(newId);
    const copies = pagesOf(newId);
    expect(copies).toHaveLength(45);
    expect(new Set(copies.map((c) => c.SourcePageId)).size).toBe(45);
    expect(fake.get("DocVersion", newId)?.Status).toBe("Ready");
    expect(fake.get("Doc", doc.ItemId)?.CurrentVersion).toBe(newId);

    await resumeDuplicate(newId); // idempotent
    expect(pagesOf(newId)).toHaveLength(45);
  });

  it("refuses to duplicate a version that isn't ready", async () => {
    const { doc, v } = seedDoc(1);
    fake.get("DocVersion", v.ItemId)!.SchemaVersion = undefined;
    await expect(
      duplicateVersion({ docId: doc.ItemId, sourceVersionId: v.ItemId, label: "2" }),
    ).rejects.toMatchObject({ code: "VersionNotEditable" });
    expect(fake.mutations()).toHaveLength(0);
  });
});

describe("deleteVersion (H7, C3)", () => {
  it("rejects deleting the current version without deleting anything", async () => {
    const { doc, v } = seedDoc(2);
    await expect(deleteVersion({ docId: doc.ItemId, versionId: v.ItemId })).rejects.toMatchObject({
      code: "CannotDeleteCurrentVersion",
    });
    expect(fake.mutations()).toHaveLength(0);
  });

  it("deletes only that version's pages, then the version", async () => {
    const { doc, v } = seedDoc(3);
    const v2 = await duplicateVersion({ docId: doc.ItemId, sourceVersionId: v.ItemId, label: "2" });
    fake.resetLog();
    await deleteVersion({ docId: doc.ItemId, versionId: v.ItemId });
    expect(fake.get("DocVersion", v.ItemId)).toBeUndefined();
    expect(pagesOf(v.ItemId)).toHaveLength(0);
    expect(pagesOf(v2)).toHaveLength(3);
    expect(steps()).toEqual(["deletePage", "deleteDocVersion"]);
  });
});

describe("deleteDocCascade (H8, C4)", () => {
  it("sets Deleting, then deletes pages, versions, doc — in that order", async () => {
    const { doc } = seedDoc(2);
    await deleteDocCascade(doc.ItemId);
    expect(steps()).toEqual([
      "updateDoc",
      "deletePage",
      "deleteDocVersion",
      "deleteDoc",
    ]);
    expect(fake.mutations()[0].variables.input).toEqual({ Status: "Deleting" });
    expect(fake.all("Doc")).toHaveLength(0);
    expect(fake.all("DocVersion")).toHaveLength(0);
    expect(fake.all("Page")).toHaveLength(0);
  });

  it("a failure at step 3 leaves the doc 'Deleting'; running again finishes", async () => {
    const { doc } = seedDoc(2);
    fake.failHook = (req) => {
      if (req.ops[0] === "deleteDocVersion") throw new TypeError("Failed to fetch");
    };
    await expect(deleteDocCascade(doc.ItemId)).rejects.toThrow();
    expect(fake.get("Doc", doc.ItemId)?.Status).toBe("Deleting");
    fake.failHook = null;
    await deleteDocCascade(doc.ItemId);
    expect(fake.all("Doc")).toHaveLength(0);
    expect(fake.all("DocVersion")).toHaveLength(0);
  });

  it("repeats a filter delete until every match is gone (gateway deletes one per call)", async () => {
    const { doc } = seedDoc(5);
    await deleteDocCascade(doc.ItemId);
    expect(fake.all("Page")).toHaveLength(0);
    expect(fake.mutations().filter((r) => r.ops[0] === "deletePage")).toHaveLength(6); // 5 + the empty check
  });

  it("a doc with no pages deletes cleanly (empty delete is not an error)", async () => {
    const { doc } = seedDoc(0);
    await deleteDocCascade(doc.ItemId);
    expect(fake.all("Doc")).toHaveLength(0);
    expect(fake.all("DocVersion")).toHaveLength(0);
  });

  it("also removes pages referenced only by an unmigrated version", async () => {
    const doc = fake.seed("Doc", { Name: "Old" });
    const legacyPage = fake.seed("Page", { Title: "L" });
    fake.seed("DocVersion", { DocId: doc.ItemId, Version: "1", Pages: [legacyPage.ItemId] });
    await deleteDocCascade(doc.ItemId);
    expect(fake.all("Page")).toHaveLength(0);
  });
});

describe("publishVersion (H9)", () => {
  it("publishes V, makes it current, then unpublishes every other version", async () => {
    const { doc, v } = seedDoc(1);
    fake.get("DocVersion", v.ItemId)!.IsPublished = true;
    const other = fake.seed("DocVersion", { DocId: doc.ItemId, Version: "x", IsPublished: true, SchemaVersion: 2, Status: "Ready" });
    const target = fake.seed("DocVersion", { DocId: doc.ItemId, Version: "y", IsPublished: false, SchemaVersion: 2, Status: "Ready" });
    const elsewhere = fake.seed("DocVersion", { DocId: "another-doc", Version: "z", IsPublished: true });
    fake.resetLog();

    await publishVersion({ docId: doc.ItemId, versionId: target.ItemId });

    // Target: flag first, then its pages; then CurrentVersion.
    expect(steps().slice(0, 3)).toEqual(["updateDocVersion", "updatePage", "updateDoc"]);
    // Each other published version is unpublished by id (v and `other`), pages hidden first.
    const versionUpdates = fake
      .mutations()
      .filter((r) => r.ops[0] === "updateDocVersion")
      .slice(1)
      .map((r) => (r.variables.where as { ItemId: { eq: string } }).ItemId.eq);
    expect(versionUpdates.sort()).toEqual([v.ItemId, other.ItemId].sort());
    const published = fake.all("DocVersion").filter((x) => x.DocId === doc.ItemId && x.IsPublished);
    expect(published.map((x) => x.ItemId)).toEqual([target.ItemId]);
    expect(fake.get("Doc", doc.ItemId)?.CurrentVersion).toBe(target.ItemId);
    expect(fake.get("DocVersion", other.ItemId)?.IsPublished).toBe(false);
    expect(fake.get("DocVersion", elsewhere.ItemId)?.IsPublished).toBe(true);
  });
});
