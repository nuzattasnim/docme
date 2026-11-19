/**
 * DEV-ONLY console helper for the SPEC3 §10 E2E comment steps, which have no
 * UI in this phase. Loaded by main.tsx only when VITE_ENABLE_DEV_TOOLS is
 * "true"; Vite drops the import (and this whole chunk) from every other
 * build, so release bundles contain no `__docmeDev` (grep check, §10).
 *
 * Usage, in the browser console of a signed-in session:
 *   const c = window.__docmeDev.comments;
 *   await c.list(pageId)
 *   await c.createOnQuote(pageId, "npm i docme", "Is this the right command?")
 *   await c.reply(rootId, pageId, "Yes")
 *   await c.resolve(rootId) / c.reopen(rootId) / c.edit(id, "new body") / c.remove(id, pageId)
 *   await c.resolveAll(pageId)       // anchoring status of every thread on the page
 *   c.raw.updateComment(id, {Body: "x"})   // bypass the UI checks (server rule tests)
 */
import { getPage } from "@/features/docs/services";
import { updateRecords, deleteRecords, insertRecord } from "@/features/docs/services";
import { useAuthStore } from "@/features/auth/auth-store";
import { docmeRoleFrom } from "@/features/access/roles";
import { createSelector, resolveSelector } from "./anchoring";
import {
  createThread,
  deleteComment,
  editBody,
  listComments,
  reopenThread,
  reply,
  resolveThread,
  type Comment,
} from "./services";

function me() {
  const u = useAuthStore.getState().user;
  if (!u) throw new Error("Not signed in");
  return u;
}

async function page(pageId: string) {
  const p = await getPage(pageId);
  if (!p) throw new Error(`Page ${pageId} not found (or not readable)`);
  return p;
}

async function findRoot(rootId: string, pageId: string): Promise<Comment> {
  const thread = (await listComments(pageId)).find((t) => t.root.ItemId === rootId);
  if (!thread) throw new Error(`Thread ${rootId} not found on page ${pageId}`);
  return thread.root;
}

const helper = {
  list: listComments,
  /** Comment on the first exact occurrence of `quote` in the page source. */
  async createOnQuote(pageId: string, quote: string, body: string) {
    const p = await page(pageId);
    const content = p.Content ?? "";
    const i = content.indexOf(quote);
    if (i === -1) throw new Error("Quote not found in the page source");
    const selector = createSelector(content, { start: i, end: i + quote.length }, quote);
    return createThread({ page: p, selector, body, author: me() });
  },
  /** Comment on a source range, as the UI will from `data-src-*` + the selected text. */
  async createOnBlock(pageId: string, start: number, end: number, body: string, selectedText?: string) {
    const p = await page(pageId);
    const selector = createSelector(p.Content ?? "", { start, end }, selectedText);
    return createThread({ page: p, selector, body, author: me() });
  },
  async createOnPage(pageId: string, body: string) {
    return createThread({ page: await page(pageId), selector: "Page", body, author: me() });
  },
  async reply(rootId: string, pageId: string, body: string) {
    return reply({ root: await findRoot(rootId, pageId), body, author: me() });
  },
  edit: editBody,
  resolve: (rootId: string) => resolveThread(rootId, me().itemId),
  reopen: reopenThread,
  async remove(id: string, pageId: string) {
    const all = (await listComments(pageId)).flatMap((t) => [t.root, ...t.replies]);
    const c = all.find((x) => x.ItemId === id);
    if (!c) throw new Error(`Comment ${id} not found on page ${pageId}`);
    return deleteComment(c, { userId: me().itemId, isAdmin: docmeRoleFrom(me().roles) === "admin" });
  },
  /** Resolve every anchor on the page against its current content (J11). */
  async resolveAll(pageId: string) {
    const [p, threads] = await Promise.all([page(pageId), listComments(pageId)]);
    const content = p.Content ?? "";
    return threads.map(({ root }) => ({
      id: root.ItemId,
      kind: root.AnchorKind,
      exact: root.AnchorExact,
      ...(root.AnchorKind === "Page" || !root.AnchorExact
        ? { status: "page" }
        : resolveSelector(content, {
            exact: root.AnchorExact,
            prefix: root.AnchorPrefix ?? "",
            suffix: root.AnchorSuffix ?? "",
            start: root.AnchorStart ?? 0,
            end: root.AnchorEnd ?? 0,
          })),
    }));
  },
  /** Raw gateway calls with no client-side checks, to probe the server rules (C3, C8, C9). */
  raw: {
    insertComment: (input: Record<string, unknown>) => insertRecord("Comment", input),
    updateComment: (id: string, input: Record<string, unknown>) =>
      updateRecords("Comment", { ItemId: { eq: id } }, input),
    deleteComment: (id: string) => deleteRecords("Comment", { ItemId: { eq: id } }),
    insertDocSource: (input: Record<string, unknown>) => insertRecord("DocSource", input),
    updateDocSource: (docId: string, input: Record<string, unknown>) =>
      updateRecords("DocSource", { DocId: { eq: docId } }, input),
    deleteDocSource: (docId: string) => deleteRecords("DocSource", { DocId: { eq: docId } }),
  },
};

declare global {
  interface Window {
    __docmeDev?: { comments: typeof helper };
  }
}

window.__docmeDev = { ...(window.__docmeDev ?? {}), comments: helper };
console.info("[docme] dev tools: window.__docmeDev.comments");
