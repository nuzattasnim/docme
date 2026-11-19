import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeGateway } from "@/features/data/testing/fake-gateway";

const gw = vi.hoisted(() => ({ current: null as unknown as FakeGateway }));
vi.mock("@/lib/blocks/client", () => ({
  getBlocksClient: () => ({
    data: { graphql: (r: Parameters<FakeGateway["graphql"]>[0]) => gw.current.graphql(r) },
  }),
}));

import { REPO_LINK_MESSAGES as M, isValidBranch, normalizeRepoLink, parseRepoUrl, shortSha } from "./repo-link";
import { RepoLinkInvalidError, getDocSource, removeDocSource, saveDocSource } from "./services";
import { deleteDocCascade } from "@/features/docs/services";

let fake: FakeGateway;
beforeEach(() => {
  fake = new FakeGateway();
  gw.current = fake;
});

const SHA = "0123456789abcdef0123456789abcdef01234567";
const input = (over: Partial<Parameters<typeof normalizeRepoLink>[0]> = {}) => ({
  repoUrl: "https://github.com/o/r",
  branch: "main",
  docsPath: "",
  baselineCommitSha: "",
  ...over,
});

describe("parseRepoUrl — H2 accepted forms all normalize the same", () => {
  it.each([
    "https://github.com/o/r",
    "https://github.com/o/r.git",
    "https://github.com/o/r/",
    "https://github.com/o/r/tree/main",
    "git@github.com:o/r.git",
    "github.com/o/r",
    "https://www.github.com/o/r",
    "  https://GitHub.com/o/r  ",
  ])("%s", (url) => {
    const r = normalizeRepoLink(input({ repoUrl: url }));
    expect(r.ok && r.value.RepoUrl).toBe("https://github.com/o/r");
  });

  it("pre-fills Branch from /tree/<branch> when Branch is empty, including slashes", () => {
    const r = normalizeRepoLink(input({ repoUrl: "https://github.com/o/r/tree/feature/docs-v2", branch: "" }));
    expect(r.ok && r.value.Branch).toBe("feature/docs-v2");
  });

  it("keeps an explicit Branch over the URL's", () => {
    const r = normalizeRepoLink(input({ repoUrl: "https://github.com/o/r/tree/dev", branch: "main" }));
    expect(r.ok && r.value.Branch).toBe("main");
  });

  it.each([
    ["https://gitlab.com/o/r", M.notGitHub],
    ["git@gitlab.com:o/r.git", M.notGitHub],
    ["ftp://github.com/o/r", M.notGitHub],
    ["https://github.com.evil.com/o/r", M.notGitHub],
    ["https://github.com/o", M.badRepo],
    ["https://github.com/o/r/blob/main/README.md", M.badRepo],
    ["https://github.com/bad_owner!/r", M.badRepo],
    ["https://github.com/o/..", M.badRepo],
    ["https://user:pw@github.com/o/r", M.badRepo],
    ["", M.repoRequired],
  ])("rejects %s", (url, message) => {
    const r = parseRepoUrl(url);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toBe(message);
  });
});

describe("isValidBranch — git ref rules", () => {
  it.each(["main", "feature/x", "release-1.2", "v1.0.0", "user/name/topic"])("accepts %s", (b) =>
    expect(isValidBranch(b)).toBe(true),
  );
  it.each([
    "feature..x",
    "has space",
    "tilde~1",
    "caret^",
    "co:lon",
    "q?",
    "star*",
    "br[acket",
    "back\\slash",
    "at@{brace",
    "/leading",
    "trailing/",
    ".dot",
    "dot.",
    "name.lock",
    "a/.hidden",
    "double//slash",
    "@",
    "tab\tchar",
    "x".repeat(256),
    "",
  ])("rejects %j", (b) => expect(isValidBranch(b)).toBe(false));
});

describe("normalizeRepoLink — C1 field errors, example 4", () => {
  it("example 4 messages", () => {
    const r1 = normalizeRepoLink(input({ repoUrl: "https://gitlab.com/o/r" }));
    expect(!r1.ok && r1.errors.repoUrl).toBe("Only github.com repositories are supported for now");
    const r2 = normalizeRepoLink(input({ branch: "feature..x" }));
    expect(!r2.ok && r2.errors.branch).toBe("Branch name is not valid");
    const r3 = normalizeRepoLink(input({ baselineCommitSha: "abc123" }));
    expect(!r3.ok && r3.errors.baselineCommitSha).toBe("Enter the full 40-character commit SHA");
  });

  it("docs path: default '/', must start with '/', no '..' segment, ≤ 500", () => {
    expect(normalizeRepoLink(input()).ok && (normalizeRepoLink(input()) as { value: { DocsPath: string } }).value.DocsPath).toBe("/");
    expect(normalizeRepoLink(input({ docsPath: "docs" })).ok).toBe(false);
    expect(normalizeRepoLink(input({ docsPath: "/docs/../secret" })).ok).toBe(false);
    expect(normalizeRepoLink(input({ docsPath: "/docs/..x" })).ok).toBe(true);
    const long = normalizeRepoLink(input({ docsPath: "/" + "a".repeat(500) }));
    expect(!long.ok && long.errors.docsPath).toBe(M.pathTooLong);
  });

  it("H1: lowercases the SHA; empty SHA is null", () => {
    const r = normalizeRepoLink(input({ baselineCommitSha: SHA.toUpperCase() }));
    expect(r.ok && r.value.BaselineCommitSha).toBe(SHA);
    const none = normalizeRepoLink(input());
    expect(none.ok && none.value.BaselineCommitSha).toBeNull();
  });

  it("reports every invalid field at once", () => {
    const r = normalizeRepoLink({ repoUrl: "x", branch: "a..b", docsPath: "nope", baselineCommitSha: "1" });
    expect(!r.ok && Object.keys(r.errors).sort()).toEqual(["baselineCommitSha", "branch", "docsPath", "repoUrl"]);
  });

  it("shortSha", () => {
    expect(shortSha(SHA)).toBe("0123456");
    expect(shortSha(null)).toBe("");
  });
});

describe("DocSource services", () => {
  it("H1: stores exactly one normalized DocSource; J12 ≤ 2 requests", async () => {
    await saveDocSource("D1", input({ repoUrl: "https://github.com/o/r/tree/main", branch: "", baselineCommitSha: SHA.toUpperCase() }));
    expect(fake.log).toHaveLength(2);
    const rows = fake.all("DocSource");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      DocId: "D1",
      Provider: "GitHub",
      RepoOwner: "o",
      RepoName: "r",
      RepoUrl: "https://github.com/o/r",
      Branch: "main",
      DocsPath: "/",
      BaselineCommitSha: SHA,
    });
  });

  it("a second save updates in place (2 requests)", async () => {
    await saveDocSource("D1", input());
    fake.resetLog();
    await saveDocSource("D1", input({ branch: "dev" }));
    expect(fake.log).toHaveLength(2);
    expect(fake.all("DocSource")).toHaveLength(1);
    expect((await getDocSource("D1"))?.Branch).toBe("dev");
  });

  it("C1: invalid input sends no request", async () => {
    await expect(saveDocSource("D1", input({ repoUrl: "https://gitlab.com/o/r" }))).rejects.toBeInstanceOf(
      RepoLinkInvalidError,
    );
    expect(fake.log).toHaveLength(0);
  });

  it("C2: losing the insert race reads again and updates — one record, later values", async () => {
    // Another admin's insert lands between our read and our insert; the
    // unique index then refuses ours.
    fake.failHook = async (req) => {
      if (req.ops[0] === "insertDocSource") {
        fake.failHook = null;
        fake.seed("DocSource", { DocId: "D1", Branch: "theirs", RepoUrl: "https://github.com/a/b" });
        throw new Error("E11000 duplicate key error collection: sb_DocSources index: DocId_1");
      }
    };
    await saveDocSource("D1", input({ branch: "ours" }));
    const rows = fake.all("DocSource");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ Branch: "ours", RepoUrl: "https://github.com/o/r" });
  });

  it("an insert failure with no competing record rethrows", async () => {
    fake.failHook = async (req) => {
      if (req.ops[0] === "insertDocSource") throw new Error("network down");
    };
    await expect(saveDocSource("D1", input())).rejects.toThrow("network down");
  });

  it("H4: remove deletes only the DocSource", async () => {
    const doc = fake.seed("Doc", { Name: "Guide", Status: "Active" });
    fake.seed("DocSource", { DocId: doc.ItemId });
    await removeDocSource(doc.ItemId);
    expect(fake.all("DocSource")).toHaveLength(0);
    expect(fake.all("Doc")).toHaveLength(1);
    expect(await getDocSource(doc.ItemId)).toBeNull();
  });

  it("H12: deleteDocCascade removes the DocSource and comments before the Doc", async () => {
    const doc = fake.seed("Doc", { Name: "Guide", Status: "Active" });
    fake.seed("DocSource", { DocId: doc.ItemId });
    fake.seed("Comment", { DocId: doc.ItemId, Body: "x" });
    await deleteDocCascade(doc.ItemId);
    expect(fake.all("DocSource")).toHaveLength(0);
    expect(fake.all("Comment")).toHaveLength(0);
    expect(fake.all("Doc")).toHaveLength(0);
    const order = fake.mutations().map((r) => r.ops[0]);
    expect(order.indexOf("deleteComment")).toBeLessThan(order.indexOf("deleteDoc"));
    expect(order.indexOf("deleteDocSource")).toBeLessThan(order.indexOf("deleteDoc"));
  });
});
