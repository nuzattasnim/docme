/**
 * Comment hooks (SPEC3 §6.4). The comment panel arrives with the UI
 * redesign (A10); these hooks are its data layer.
 *
 * - `useComments(pageId)` loads after the page content and never blocks it
 *   (J2, C13): pass `enabled` once the content is visible.
 * - Every mutation invalidates ["comments", pageId] and shows a toast.
 * - `useCommentPermissions` hides actions a role can't take (C8); the server
 *   rules still enforce them.
 */
import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuthStore } from "@/features/auth/auth-store";
import { useDocmeRole } from "@/features/access/use-docme-role";
import { errorMessage, isDocmeDataError } from "@/features/data/errors";
import type { Selector } from "./anchoring";
import {
  createThread,
  deleteComment,
  editBody,
  listComments,
  reopenThread,
  reply,
  resolveThread,
  type Author,
  type Comment,
} from "./services";
import type { Page } from "@/features/docs/types";

export const COMMENT_KEYS = {
  all: ["comments"] as const,
  ofPage: (pageId: string) => ["comments", pageId] as const,
};

export function useComments(pageId: string, enabled = true) {
  return useQuery({
    queryKey: COMMENT_KEYS.ofPage(pageId),
    queryFn: () => listComments(pageId),
    enabled: !!pageId && enabled,
    retry: (count, error) => !isDocmeDataError(error, "Forbidden") && count < 3,
  });
}

function useCurrentAuthor(): Author | null {
  const user = useAuthStore((s) => s.user);
  if (!user?.itemId) return null;
  return { itemId: user.itemId, firstName: user.firstName, lastName: user.lastName, email: user.email };
}

export function useCommentPermissions() {
  const { role } = useDocmeRole();
  const userId = useAuthStore((s) => s.user?.itemId ?? null);
  const isAuthor = useCallback(
    (c: Pick<Comment, "CreatedBy">) => !!userId && c.CreatedBy === userId,
    [userId],
  );
  return {
    userId,
    isAdmin: role === "admin",
    canComment: role !== null,
    canResolve: role === "admin" || role === "editor",
    canEdit: (c: Pick<Comment, "CreatedBy">) => isAuthor(c),
    canDelete: (c: Pick<Comment, "CreatedBy">) => role === "admin" || isAuthor(c),
  };
}

function requireAuthor(author: Author | null): Author {
  if (!author) throw new Error("Sign in to comment");
  return author;
}

/** Shared toast + invalidate wiring. A failed mutation offers Retry (C11). */
function useCommentMutation<V>(
  pageId: string,
  fn: (vars: V) => Promise<unknown>,
  success: string,
) {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: fn,
    onSuccess: () => toast.success(success),
    onSettled: () => qc.invalidateQueries({ queryKey: COMMENT_KEYS.ofPage(pageId) }),
  });
  const run = useCallback(
    (vars: V) =>
      mutation.mutateAsync(vars).catch((err: unknown) => {
        toast.error(errorMessage(err), {
          action: isDocmeDataError(err, "InvalidInput") || isDocmeDataError(err, "Forbidden")
            ? undefined
            : { label: "Retry", onClick: () => void run(vars) },
        });
        throw err;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mutation.mutateAsync],
  );
  return { ...mutation, run };
}

type PageRef = Pick<Page, "ItemId" | "DocId" | "VersionId" | "ReaderVisible" | "LastUpdatedDate">;

export function useCreateThread(page: PageRef) {
  const author = useCurrentAuthor();
  return useCommentMutation(
    page.ItemId,
    (vars: { selector: Selector | "Page"; body: string }) =>
      createThread({ page, selector: vars.selector, body: vars.body, author: requireAuthor(author) }),
    "Comment added",
  );
}

export function useReply(pageId: string) {
  const author = useCurrentAuthor();
  return useCommentMutation(
    pageId,
    (vars: { root: Comment; body: string }) => reply({ ...vars, author: requireAuthor(author) }),
    "Reply added",
  );
}

export function useEditComment(pageId: string) {
  return useCommentMutation(pageId, (vars: { id: string; body: string }) => editBody(vars.id, vars.body), "Comment updated");
}

export function useResolveThread(pageId: string) {
  const userId = useAuthStore((s) => s.user?.itemId ?? "");
  return useCommentMutation(pageId, (rootId: string) => resolveThread(rootId, userId), "Thread resolved");
}

export function useReopenThread(pageId: string) {
  return useCommentMutation(pageId, (rootId: string) => reopenThread(rootId), "Thread reopened");
}

export function useDeleteComment(pageId: string) {
  const { userId, isAdmin } = useCommentPermissions();
  return useCommentMutation(
    pageId,
    (comment: Pick<Comment, "ItemId" | "ParentCommentId">) =>
      deleteComment(comment, { userId: userId ?? "", isAdmin }),
    "Comment deleted",
  );
}
