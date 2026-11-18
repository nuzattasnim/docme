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
 *   - a data access rule refusal ("No policy grants access to this resource")
 *                                 → `DocmeDataError("Forbidden")`. A refused write is
 *     also reported to `usePermissionErrors`, which shows a page Alert (SPEC2 C14).
 */
import { BlocksApiError } from "@seliseblocks/client";
import { getBlocksClient } from "@/lib/blocks/client";
import { useAuthStore } from "@/features/auth/auth-store";
import { SessionExpiredError, withSession } from "@/features/auth/session";
import { DocmeDataError } from "./errors";
import {
  isPolicyRefusal,
  permissionMessage,
  usePermissionErrors,
} from "@/features/access/permission-errors";

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

/**
 * The gateway answers some GraphQL errors (bad field, bad argument) with
 * HTTP 400 and `{ errors: [...] }`. The SDK's BlocksApiError message drops
 * an `errors` array, so recover the server's messages from the body.
 */
function graphqlErrorsFrom(err: unknown): GqlError[] | null {
  if (!(err instanceof BlocksApiError)) return null;
  const body = err.body as { errors?: unknown; message?: unknown } | string | null | undefined;
  if (body && typeof body === "object" && Array.isArray(body.errors) && body.errors.length > 0) {
    return body.errors.map((e) =>
      e && typeof e === "object" && typeof (e as GqlError).message === "string"
        ? (e as GqlError)
        : { message: JSON.stringify(e) },
    );
  }
  if (typeof body === "string" && body.trim()) {
    return [{ message: `HTTP ${err.status}: ${body.trim().slice(0, 500)}` }];
  }
  return null;
}

/** First operation in a query, e.g. "getDocVersions", for error context. */
function operationOf(query: string): string {
  return /\b((?:get|insert|update|delete)\w+)\s*\(/.exec(query)?.[1] ?? "gateway";
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

/** A rule refusal becomes `Forbidden`; other GraphQL errors pass through. */
function refusalOf(query: string, errors: GqlError[]): DocmeDataError | null {
  if (!errors.some((e) => isPolicyRefusal(e.message))) return null;
  const op = operationOf(query);
  const message = permissionMessage(op);
  if (/^(insert|update|delete)/.test(op)) usePermissionErrors.getState().report(message);
  return new DocmeDataError("Forbidden", message, { cause: new GraphQLError(errors) });
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
    const errors = graphqlErrorsFrom(err);
    if (errors) {
      throw (
        refusalOf(query, errors) ??
        new GraphQLError(errors.map((e) => ({ ...e, message: `${operationOf(query)}: ${e.message}` })))
      );
    }
    throw err;
  }
  const parsed = (body ?? {}) as GqlBody<T>;
  if (parsed.errors && parsed.errors.length > 0) {
    const refusal = refusalOf(query, parsed.errors);
    if (refusal) throw refusal;
  }
  return unwrap<T>(body);
}
