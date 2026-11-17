/**
 * GraphQL access to the Blocks runtime Data Gateway, through the SDK.
 *
 * Every call goes through `getBlocksClient().data.graphql`, which sends
 * `x-blocks-key` and `credentials: "include"` (the hosted-login session
 * cookie). There is no direct HTTP call to the gateway anywhere in `src/`.
 *
 * Error mapping:
 *   - `errors[]` in the response  → `GraphQLError` (code `GatewayError`), messages joined by "; "
 *   - no `data` in the response   → `GraphQLError("Gateway returned empty data")`
 *   - HTTP 401                    → one session refresh, then exactly one retry.
 *     If the refresh (or the retry) fails, the auth store moves to
 *     `unauthenticated`, the browser goes to /login, and `Unauthorized` is thrown.
 */
import { getBlocksClient } from "@/lib/blocks/client";
import { useAuthStore } from "@/features/auth/auth-store";
import { SessionExpiredError, withSession } from "@/features/auth/session";
import { DocmeDataError } from "./errors";

export interface ActionResponse {
  acknowledged: boolean;
  itemId?: string | null;
  totalImpactedData: number;
  message?: string | null;
}

export interface GqlResult<T> {
  items: T[];
  totalCount: number;
  pageNo: number;
  pageSize: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface GqlError {
  message: string;
  locations?: Array<{ line: number; column: number }>;
  path?: Array<string | number>;
}

/** The gateway answered, but with GraphQL errors or without data. */
export class GraphQLError extends DocmeDataError {
  constructor(public readonly errors: GqlError[]) {
    super("GatewayError", errors.map((e) => e.message).join("; "));
    this.name = "GraphQLError";
  }
}

export interface GqlBody<T> {
  data?: T | null;
  errors?: GqlError[] | null;
}

function unwrap<T>(body: unknown): T {
  const parsed = (body ?? {}) as GqlBody<T>;
  if (parsed.errors && parsed.errors.length > 0) {
    throw new GraphQLError(parsed.errors);
  }
  if (parsed.data === undefined || parsed.data === null) {
    throw new GraphQLError([{ message: "Gateway returned empty data" }]);
  }
  return parsed.data;
}

function sessionLost(cause: unknown): DocmeDataError {
  useAuthStore.getState().reset();
  if (typeof window !== "undefined" && window.location.pathname !== "/login") {
    // A full navigation (not a router push) drops every in-flight query, so
    // nothing re-triggers the 401 → refresh cycle: no loop.
    window.location.replace("/login");
  }
  return new DocmeDataError("Unauthorized", "Your session has expired. Please sign in again.", {
    cause,
  });
}

/** Run a GraphQL query or mutation against the runtime gateway. */
export async function gql<T>(
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  let body: unknown;
  try {
    body = await withSession(() => getBlocksClient().data.graphql({ query, variables }));
  } catch (err) {
    if (err instanceof SessionExpiredError) throw sessionLost(err);
    throw err;
  }
  return unwrap<T>(body);
}
