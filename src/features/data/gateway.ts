/**
 * GraphQL gateway client for the Blocks runtime data gateway.
 *
 * One endpoint, standard GraphQL body. Auth uses the same Blocks session cookie
 * as the rest of the app — `credentials: "include"` so the browser attaches the
 * HttpOnly SSO cookie. `x-blocks-key` is the project tenant id (PTENANT).
 *
 * Per the blocks-data-gateway-crud skill, browser/runtime calls must use
 * `x-blocks-key: <PTENANT>` + the session cookie. PTOK (impersonated admin
 * tokens) must never be put in frontend code.
 *
 * See: blocks-skills/skills/blocks-data-gateway-crud/references/react.md
 */

const GATEWAY = `${import.meta.env.VITE_BLOCKS_API_URL}/data/v4/gateway`;
const PROJECT_KEY = import.meta.env.VITE_BLOCKS_PROJECT_KEY as string;

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

export class GraphQLError extends Error {
  constructor(public readonly errors: GqlError[]) {
    super(errors.map((e) => e.message).join("; "));
    this.name = "GraphQLError";
  }
}

export interface GqlBody<T> {
  data?: T;
  errors?: GqlError[];
}

/**
 * Run a GraphQL query/mutation against the runtime gateway.
 *
 * - Sends `x-blocks-key: PTENANT` and `credentials: "include"` so the signed-in
 *   user's SSO cookie is sent.
 * - Throws `GraphQLError` on `{ errors: [...] }` responses; throws a plain
 *   `Error` on empty bodies or non-JSON.
 * - The 401-retry plumbing is left to the per-call sites (refresh-and-retry
 *   requires the auth store; doing it inside `gql` would create a circular
 *   import between this module and the auth store).
 */
export async function gql<T>(
  query: string,
  variables: Record<string, unknown> = {},
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(GATEWAY, {
    method: "POST",
    credentials: "include",
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-blocks-key": PROJECT_KEY,
      ...(init.headers ?? {}),
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Gateway HTTP ${res.status}: ${text || res.statusText}`);
  }

  const body = (await res.json()) as GqlBody<T>;
  if (body.errors?.length) {
    throw new GraphQLError(body.errors);
  }
  if (!body.data) {
    throw new Error("Gateway returned empty data");
  }
  return body.data;
}

/**
 * Variant that retries once on 401, refreshing the SSO session first.
 * Use for app-level fetches that should "just work" after token rotation.
 */
export async function gqlWithAuthRetry<T>(
  refresh: () => Promise<void>,
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  try {
    return await gql<T>(query, variables);
  } catch (err) {
    const isUnauthorized =
      err instanceof Error &&
      (err.message.startsWith("Gateway HTTP 401") || err.message === "Gateway returned empty data");
    if (!isUnauthorized) throw err;
    await refresh();
    return gql<T>(query, variables);
  }
}
