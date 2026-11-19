import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeGateway } from "@/features/data/testing/fake-gateway";

const gw = vi.hoisted(() => ({ current: null as unknown as FakeGateway }));
vi.mock("@/lib/blocks/client", () => ({
  getBlocksClient: () => ({
    data: { graphql: (r: Parameters<FakeGateway["graphql"]>[0]) => gw.current.graphql(r) },
  }),
}));

import {
  COMMENT_MESSAGES,
  MAX_BODY,
  authorName,
  createThread,
  deleteComment,
  editBody,
  groupThreads,
  listComments,
  reopenThread,
  reply,
  resolveThread,
  validateBody,
  type Comment,
} from "./services";
import { createSelector } from "./anchoring";
import {
  COMMENTS_BLOCK_DELETE,
  deletePage,
  deleteVersion,
  publishVersion,
  reconcileReaderVisibility,
  unpublishVersion,
} from "@/features/docs/services";
import { isDocmeDataError } from "@/features/data/errors";

let fake: FakeGateway;
beforeEach(() => {
  fake = new FakeGateway();
  gw.current = fake;
});

const VIEWER = { itemId: "U-VW", firstName: "Vera", lastName: "Viewer", email: "v@example.test" };
const EDITOR = { itemId: "U-ED", firstName: "", lastName: "", email: "ed@example.test" };
const CONTENT = "Intro.\n\nInstall with npm i docme.\n\nA **bold** claim.\n";

function seedPage({ visible = true } = {}) {
  const doc = fake.seed("Doc", { Name: "Guide", Status: "Active" });
  const v = fake.seed("DocVersion", {
    DocId: doc.ItemId,
    Version: "1.0.0",
    Status: "Ready",
    SchemaVersion: 2,
    IsPublished: visible,
    IsActive: false,
  });
  doc.CurrentVersion = "other";
  const page = fake.seed("Page", {
    DocId: doc.ItemId,
    VersionId: v.ItemId,
    Title: "P",
    Content: CONTENT,
    ReaderVisible: visible,
    LastUpdatedDate: "2026-11-01T00:00:00Z",
  });
  return { doc, v, page: page as typeof page & { DocId: string; VersionId: string; ReaderVisible: boolean } };
}

/** The fake doesn't stamp CreatedBy; tests set the author like the gateway would. */
function stampAuthor(id: string, userId: string) {
  fake.get("Comment", id)!.CreatedBy = userId;
}

describe("validateBody — C6", () => {
  it("rejects empty and over-long bodies before sending", () => {
    expect(() => validateBody("   \n ")).toThrow(COMMENT_MESSAGES.empty);
    expect(() => validateBody("x".repeat(MAX_BODY + 1))).toThrow(COMMENT_MESSAGES.tooLong);
    expect(validateBody(`  ${"x".repeat(MAX_BODY)}  `)).toHaveLength(MAX_BODY);
  });
  it("keeps line breaks inside the body", () => {
    expect(validateBody("\n line 1\nline 2 \n")).toBe("line 1\nline 2");
  });
  it("C6: invalid bodies send no request", async () => {
    const { page } = seedPage();
    await expect(createThread({ page, selector: "Page", body: " ", author: VIEWER })).rejects.toThrow(
      "Comment can't be empty",
    );
    await expect(
      createThread({ page, selector: "Page", body: "x".repeat(5001), author: VIEWER }),
    ).rejects.toThrow("Comments are limited to 5,000 characters");
    expect(fake.log).toHaveLength(0);
  });
});

describe("authorName", () => {
  it("first + last, else email, else a placeholder", () => {
    expect(authorName(VIEWER)).toBe("Vera Viewer");
    expect(authorName(EDITOR)).toBe("ed@example.test");
    expect(authorName({ itemId: "x" })).toBe("Unknown user");
  });
});

describe("threads", () => {
  it("H8: a viewer's thread on a published page stores anchor, author and visibility", async () => {
    const { page } = seedPage();
    const selector = createSelector(CONTENT, { start: 8, end: 33 }, "npm i docme");
    const id = await createThread({ page, selector, body: "Is this right?", author: VIEWER });
    expect(fake.get("Comment", id)).toMatchObject({
      DocId: page.DocId,
      VersionId: page.VersionId,
      PageId: page.ItemId,
      ParentCommentId: null,
      Body: "Is this right?",
      AuthorName: "Vera Viewer",
      Status: "Open",
      ReaderVisible: true,
      AnchorKind: "Quote",
      AnchorExact: "npm i docme",
      AnchorStart: 21,
      AnchorEnd: 32,
      AnchoredContentDate: "2026-11-01T00:00:00Z",
    });
    const threads = await listComments(page.ItemId);
    expect(threads).toHaveLength(1);
    expect(threads[0].root.ItemId).toBe(id);
  });

  it("J10: listComments is one request with page size 1,000, ordered by CreatedDate", async () => {
    const { page } = seedPage();
    await listComments(page.ItemId);
    expect(fake.log).toHaveLength(1);
    expect(fake.log[0].variables).toMatchObject({
      where: { PageId: { eq: page.ItemId } },
      order: [{ field: "CreatedDate", direction: "ASC" }],
      paging: { pageNo: 1, pageSize: 1000 },
    });
  });

  it("a Page comment stores only AnchorKind 'Page'", async () => {
    const { page } = seedPage();
    const id = await createThread({ page, selector: "Page", body: "General", author: VIEWER });
    const rec = fake.get("Comment", id)!;
    expect(rec.AnchorKind).toBe("Page");
    expect(rec.AnchorExact).toBeUndefined();
  });

  it("H9: replies attach to the root and come back ordered under it", async () => {
    const { page } = seedPage();
    const rootId = await createThread({ page, selector: "Page", body: "Q", author: VIEWER });
    const [{ root }] = await listComments(page.ItemId);
    const r1 = await reply({ root, body: "A1", author: EDITOR });
    const r2 = await reply({ root, body: "A2", author: VIEWER });
    expect(fake.get("Comment", r1)).toMatchObject({
      ParentCommentId: rootId,
      DocId: page.DocId,
      VersionId: page.VersionId,
      PageId: page.ItemId,
      ReaderVisible: true,
      AuthorName: "ed@example.test",
    });
    expect(fake.get("Comment", r1)!.Status).toBeUndefined();
    const threads = await listComments(page.ItemId);
    expect(threads[0].replies.map((c) => c.ItemId)).toEqual([r1, r2]);
  });

  it("A15: a reply to a reply is refused", async () => {
    const { page } = seedPage();
    await createThread({ page, selector: "Page", body: "Q", author: VIEWER });
    const [{ root }] = await listComments(page.ItemId);
    await reply({ root, body: "A", author: EDITOR });
    const [{ replies }] = await listComments(page.ItemId);
    await expect(reply({ root: replies[0], body: "nested", author: VIEWER })).rejects.toThrow(
      COMMENT_MESSAGES.notRoot,
    );
  });

  it("H10: resolve then reopen sets and clears ResolvedBy/ResolvedDate", async () => {
    const { page } = seedPage();
    const id = await createThread({ page, selector: "Page", body: "Q", author: VIEWER });
    await resolveThread(id, "U-ED");
    expect(fake.get("Comment", id)).toMatchObject({ Status: "Resolved", ResolvedBy: "U-ED" });
    expect(typeof fake.get("Comment", id)!.ResolvedDate).toBe("string");
    await reopenThread(id);
    expect(fake.get("Comment", id)).toMatchObject({ Status: "Open", ResolvedBy: null, ResolvedDate: null });
  });

  it("H11: editing sets Body and EditedDate", async () => {
    const { page } = seedPage();
    const id = await createThread({ page, selector: "Page", body: "Q", author: VIEWER });
    await editBody(id, " Fixed \n");
    expect(fake.get("Comment", id)!.Body).toBe("Fixed");
    expect(typeof fake.get("Comment", id)!.EditedDate).toBe("string");
  });

  it("C10: an HTML/script body is stored verbatim", async () => {
    const { page } = seedPage();
    const xss = `<img src=x onerror=alert(1)>`;
    const id = await createThread({ page, selector: "Page", body: xss, author: VIEWER });
    expect(fake.get("Comment", id)!.Body).toBe(xss);
  });

  it("groupThreads drops replies whose root is gone", () => {
    const c = (ItemId: string, ParentCommentId: string | null) => ({ ItemId, ParentCommentId }) as Comment;
    const threads = groupThreads([c("a", null), c("b", "a"), c("x", "missing")]);
    expect(threads).toHaveLength(1);
    expect(threads[0].replies.map((r) => r.ItemId)).toEqual(["b"]);
  });
});

describe("deleteComment", () => {
  async function thread() {
    const { page } = seedPage();
    const rootId = await createThread({ page, selector: "Page", body: "Q", author: VIEWER });
    stampAuthor(rootId, "U-VW");
    const [{ root }] = await listComments(page.ItemId);
    return { page, root, rootId };
  }

  it("a root: replies first, then the root", async () => {
    const { root, rootId } = await thread();
    const r = await reply({ root, body: "own reply", author: VIEWER });
    stampAuthor(r, "U-VW");
    fake.resetLog();
    await deleteComment(root, { userId: "U-VW", isAdmin: false });
    expect(fake.all("Comment")).toHaveLength(0);
    const ops = fake.mutations().map((m) => [m.ops[0], m.variables.where]);
    expect(ops.at(-1)).toEqual(["deleteComment", { ItemId: { eq: rootId } }]);
    expect(ops[0]).toEqual(["deleteComment", { ParentCommentId: { eq: rootId } }]);
  });

  it("a reply: only the reply", async () => {
    const { root } = await thread();
    const r = await reply({ root, body: "x", author: EDITOR });
    await deleteComment({ ItemId: r, ParentCommentId: root.ItemId }, { userId: "U-ED", isAdmin: false });
    expect(fake.all("Comment").map((c) => c.ItemId)).toEqual([root.ItemId]);
  });

  it("a non-admin author can't delete a thread with other people's replies (no orphans)", async () => {
    const { root } = await thread();
    const r = await reply({ root, body: "x", author: EDITOR });
    stampAuthor(r, "U-ED");
    fake.resetLog();
    await expect(deleteComment(root, { userId: "U-VW", isAdmin: false })).rejects.toThrow(
      COMMENT_MESSAGES.othersReplies,
    );
    expect(fake.mutations()).toHaveLength(0);
    expect(fake.all("Comment")).toHaveLength(2);
  });

  it("an admin deletes the whole thread", async () => {
    const { root } = await thread();
    stampAuthor(await reply({ root, body: "x", author: EDITOR }), "U-ED");
    await deleteComment(root, { userId: "U-ADM", isAdmin: true });
    expect(fake.all("Comment")).toHaveLength(0);
  });

  it("C11: a failure after the replies are deleted keeps the root; retry finishes", async () => {
    const { root, rootId } = await thread();
    stampAuthor(await reply({ root, body: "own", author: VIEWER }), "U-VW");
    fake.failHook = async (req) => {
      const where = req.variables.where as Record<string, unknown> | undefined;
      if (req.ops[0] === "deleteComment" && where && "ItemId" in where) {
        fake.failHook = null;
        throw new Error("network down");
      }
    };
    await expect(deleteComment(root, { userId: "U-VW", isAdmin: false })).rejects.toThrow("network down");
    expect(fake.all("Comment").map((c) => c.ItemId)).toEqual([rootId]);
    await deleteComment(root, { userId: "U-VW", isAdmin: false });
    expect(fake.all("Comment")).toHaveLength(0);
  });
});

describe("cascades and visibility (Phase 1 / SPEC2 changes)", () => {
  it("H12: deletePage removes its comments before the page", async () => {
    const { page } = seedPage();
    await createThread({ page, selector: "Page", body: "Q", author: VIEWER });
    await deletePage(page.ItemId);
    expect(fake.all("Comment")).toHaveLength(0);
    expect(fake.all("Page")).toHaveLength(0);
    const order = fake.mutations().map((r) => r.ops[0]);
    expect(order.indexOf("deleteComment")).toBeLessThan(order.indexOf("deletePage"));
  });

  it("deletePage stops (page kept) when comments survive the delete — e.g. refused for an editor", async () => {
    const { page } = seedPage();
    await createThread({ page, selector: "Page", body: "Q", author: VIEWER });
    // The live gateway answers a refused filter delete like an empty one.
    const real = fake.graphql;
    const spy = vi.spyOn(fake, "graphql").mockImplementation(async (req) =>
      /deleteComment\(/.test(req.query)
        ? {
            data: {
              deleteComment: {
                acknowledged: false,
                totalImpactedData: 0,
                message: "No data found to DELETE or you don't have permission to DELETE this record.",
              },
            },
          }
        : real(req),
    );
    const err = await deletePage(page.ItemId).catch((e: unknown) => e);
    spy.mockRestore();
    expect(isDocmeDataError(err, "Forbidden")).toBe(true);
    expect((err as Error).message).toBe(COMMENTS_BLOCK_DELETE);
    expect(fake.all("Page")).toHaveLength(1);
  });

  it("H12: deleteVersion removes the version's comments before its pages", async () => {
    const { v, page } = seedPage();
    await createThread({ page, selector: "Page", body: "Q", author: VIEWER });
    await deleteVersion({ docId: page.DocId, versionId: v.ItemId });
    expect(fake.all("Comment")).toHaveLength(0);
    const order = fake.mutations().map((r) => r.ops[0]);
    expect(order.indexOf("deleteComment")).toBeLessThan(order.indexOf("deletePage"));
  });

  it("C12: hiding a version hides its comments first; publishing shows them after the flag", async () => {
    const { v, page } = seedPage({ visible: true });
    const id = await createThread({ page, selector: "Page", body: "Q", author: VIEWER });
    fake.resetLog();
    await unpublishVersion(v.ItemId);
    expect(fake.get("Comment", id)!.ReaderVisible).toBe(false);
    const hide = fake.mutations().map((r) => r.ops[0]);
    expect(hide.indexOf("updateComment")).toBeLessThan(hide.indexOf("updateDocVersion"));

    fake.resetLog();
    await publishVersion({ docId: page.DocId, versionId: v.ItemId });
    expect(fake.get("Comment", id)!.ReaderVisible).toBe(true);
    const show = fake.mutations().map((r) => r.ops[0]);
    expect(show.indexOf("updateDocVersion")).toBeLessThan(show.indexOf("updateComment"));
  });

  it("C12: the reconciler also fixes comments, and a second run changes nothing", async () => {
    const { v, page } = seedPage({ visible: true });
    fake.get("DocVersion", v.ItemId)!.OrganizationId = "ORG";
    const id = await createThread({ page, selector: "Page", body: "Q", author: VIEWER });
    fake.get("Comment", id)!.ReaderVisible = false; // drifted
    const first = await reconcileReaderVisibility("ORG");
    expect(first.pagesChanged).toBe(1);
    expect(fake.get("Comment", id)!.ReaderVisible).toBe(true);
    const second = await reconcileReaderVisibility("ORG");
    expect(second.pagesChanged).toBe(0);
  });
});
