/**
 * Paragraph comments (SPEC3 §6.2, §6.4).
 *
 * A thread is a root comment (anchor, Status) plus replies that always point
 * at the root (one level, A15). `Body` is untrusted plain text: it is stored
 * verbatim and must only ever be rendered as text (C10).
 *
 * Server rules (blocks/data/rules.json) are the access check; the role
 * checks here only stop a request the server would refuse anyway.
 */
import { DocmeDataError } from "@/features/data/errors";
import {
  deleteRecords,
  insertRecord,
  listRecords,
  updateRecords,
} from "@/features/docs/services";
import type { Page } from "@/features/docs/types";
import { MAX_EXACT, type Selector } from "./anchoring";

export type CommentStatus = "Open" | "Resolved";
export type AnchorKind = "Quote" | "Block" | "Page";

export interface Comment {
  ItemId: string;
  DocId: string;
  VersionId: string;
  PageId: string;
  ParentCommentId?: string | null;
  Body: string;
  AuthorName: string;
  Status?: CommentStatus | null;
  ResolvedBy?: string | null;
  ResolvedDate?: string | null;
  EditedDate?: string | null;
  AnchorKind?: AnchorKind | null;
  AnchorExact?: string | null;
  AnchorPrefix?: string | null;
  AnchorSuffix?: string | null;
  AnchorStart?: number | null;
  AnchorEnd?: number | null;
  AnchoredContentDate?: string | null;
  ReaderVisible: boolean;
  CreatedBy?: string;
  CreatedDate?: string;
  LastUpdatedDate?: string;
}

export interface CommentThread {
  root: Comment;
  replies: Comment[];
}

export const COMMENT_FIELDS =
  "ItemId DocId VersionId PageId ParentCommentId Body AuthorName Status ResolvedBy ResolvedDate EditedDate " +
  "AnchorKind AnchorExact AnchorPrefix AnchorSuffix AnchorStart AnchorEnd AnchoredContentDate ReaderVisible " +
  "CreatedBy CreatedDate LastUpdatedDate";

export const MAX_BODY = 5000;
/** J10: one request per page view (A11: ≤ 1,000 comments per page). */
export const COMMENTS_PAGE_SIZE = 1000;

export const COMMENT_MESSAGES = {
  empty: "Comment can't be empty",
  tooLong: "Comments are limited to 5,000 characters",
  othersReplies:
    "This thread has replies from other people, and only an admin can delete those. Ask an admin to delete the thread.",
  notRoot: "Replies attach to a thread's first comment",
} as const;

/** Trimmed body, or a C6 error before anything is sent. Line breaks are kept. */
export function validateBody(body: string): string {
  const trimmed = body.trim();
  if (!trimmed) throw new DocmeDataError("InvalidInput", COMMENT_MESSAGES.empty, { field: "body" });
  if (trimmed.length > MAX_BODY) {
    throw new DocmeDataError("InvalidInput", COMMENT_MESSAGES.tooLong, { field: "body" });
  }
  return trimmed;
}

/** Group a CreatedDate-ascending list into threads; orphan replies are dropped. */
export function groupThreads(comments: readonly Comment[]): CommentThread[] {
  const threads = new Map<string, CommentThread>();
  for (const c of comments) {
    if (!c.ParentCommentId) threads.set(c.ItemId, { root: c, replies: [] });
  }
  for (const c of comments) {
    if (c.ParentCommentId) threads.get(c.ParentCommentId)?.replies.push(c);
  }
  return [...threads.values()];
}

/** J10: one gateway request, oldest first. */
export async function listComments(pageId: string): Promise<CommentThread[]> {
  const res = await listRecords<Comment>("Comment", COMMENT_FIELDS, {
    where: { PageId: { eq: pageId } },
    order: [{ field: "CreatedDate", direction: "ASC" }],
    paging: { pageNo: 1, pageSize: COMMENTS_PAGE_SIZE },
  });
  return groupThreads(res.items);
}

/** The author's display name (A: viewers can't list users, so it's copied). */
export interface Author {
  itemId: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}

export function authorName(user: Author): string {
  const full = [user.firstName, user.lastName].map((s) => (s ?? "").trim()).filter(Boolean).join(" ");
  return full || (user.email ?? "").trim() || "Unknown user";
}

type PageRef = Pick<Page, "ItemId" | "DocId" | "VersionId" | "ReaderVisible" | "LastUpdatedDate">;

function requirePageRef(page: PageRef): { DocId: string; VersionId: string } {
  if (!page.DocId || !page.VersionId) {
    throw new DocmeDataError("GatewayError", "This page is missing its doc or version id");
  }
  return { DocId: page.DocId, VersionId: page.VersionId };
}

/** Insert a thread root. `selector` "Page" comments on the whole page. */
export async function createThread(args: {
  page: PageRef;
  selector: Selector | "Page";
  body: string;
  author: Author;
}): Promise<string> {
  const body = validateBody(args.body);
  const { DocId, VersionId } = requirePageRef(args.page);
  const anchor =
    args.selector === "Page"
      ? { AnchorKind: "Page" as const }
      : (() => {
          const s = args.selector;
          if (!(s.start >= 0 && s.start < s.end) || s.end - s.start > MAX_EXACT || !s.exact) {
            throw new DocmeDataError("InvalidInput", "The selected text can't be commented on", {
              field: "selector",
            });
          }
          return {
            AnchorKind: s.kind,
            AnchorExact: s.exact,
            AnchorPrefix: s.prefix.slice(-32),
            AnchorSuffix: s.suffix.slice(0, 32),
            AnchorStart: s.start,
            AnchorEnd: s.end,
            AnchoredContentDate: args.page.LastUpdatedDate ?? null,
          };
        })();
  return insertRecord("Comment", {
    DocId,
    VersionId,
    PageId: args.page.ItemId,
    ParentCommentId: null,
    Body: body,
    AuthorName: authorName(args.author),
    Status: "Open",
    ReaderVisible: args.page.ReaderVisible === true,
    ...anchor,
  });
}

/** Insert a reply under the thread root, copying its ids and visibility. */
export async function reply(args: { root: Comment; body: string; author: Author }): Promise<string> {
  const body = validateBody(args.body);
  if (args.root.ParentCommentId) {
    throw new DocmeDataError("InvalidInput", COMMENT_MESSAGES.notRoot);
  }
  return insertRecord("Comment", {
    DocId: args.root.DocId,
    VersionId: args.root.VersionId,
    PageId: args.root.PageId,
    ParentCommentId: args.root.ItemId,
    Body: body,
    AuthorName: authorName(args.author),
    ReaderVisible: args.root.ReaderVisible === true,
  });
}

const byId = (id: string) => ({ ItemId: { eq: id } });

/** Author only (column rule on Body). */
export async function editBody(id: string, body: string): Promise<void> {
  const trimmed = validateBody(body);
  await updateRecords("Comment", byId(id), { Body: trimmed, EditedDate: new Date().toISOString() });
}

/** Editors and admins only (column rule on Status/ResolvedBy/ResolvedDate). */
export async function resolveThread(rootId: string, userId: string): Promise<void> {
  await updateRecords("Comment", byId(rootId), {
    Status: "Resolved",
    ResolvedBy: userId,
    ResolvedDate: new Date().toISOString(),
  });
}

export async function reopenThread(rootId: string): Promise<void> {
  await updateRecords("Comment", byId(rootId), { Status: "Open", ResolvedBy: null, ResolvedDate: null });
}

/**
 * A root: its replies first, then the root, so a failure between the two
 * keeps the root and a retry finishes (C11). A reply: just the reply.
 *
 * Comment DELETE is author-or-admin (C9), and a refused filter delete looks
 * like an empty one, so a non-admin author may delete a thread only when
 * every reply is their own — never leaving orphaned replies behind.
 */
export async function deleteComment(
  comment: Pick<Comment, "ItemId" | "ParentCommentId">,
  caller: { userId: string; isAdmin: boolean },
): Promise<void> {
  if (comment.ParentCommentId) {
    await deleteRecords("Comment", byId(comment.ItemId));
    return;
  }
  if (!caller.isAdmin) {
    const others = await listRecords<{ ItemId: string }>("Comment", "ItemId", {
      where: { ParentCommentId: { eq: comment.ItemId }, CreatedBy: { neq: caller.userId } },
      paging: { pageNo: 1, pageSize: 1 },
    });
    if (others.totalCount > 0 || others.items.length > 0) {
      throw new DocmeDataError("Forbidden", COMMENT_MESSAGES.othersReplies);
    }
  }
  await deleteRecords("Comment", { ParentCommentId: { eq: comment.ItemId } });
  await deleteRecords("Comment", byId(comment.ItemId));
}
