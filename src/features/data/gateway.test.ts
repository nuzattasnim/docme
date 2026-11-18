import { beforeEach, describe, expect, it, vi } from "vitest";
import { BlocksApiError } from "@seliseblocks/client";

const graphql = vi.hoisted(() => vi.fn());
const refreshSession = vi.hoisted(() => vi.fn());

vi.mock("@/lib/blocks/client", () => ({
  getBlocksClient: () => ({ data: { graphql } }),
}));
vi.mock("@/features/auth/sso", () => ({ refreshSession }));

import { gql, GraphQLError } from "./gateway";
import { DocmeDataError } from "./errors";
import { useAuthStore } from "@/features/auth/auth-store";

const unauthorized = () => new BlocksApiError(401, "Unauthorized", {});

beforeEach(() => {
  graphql.mockReset();
  refreshSession.mockReset();
  useAuthStore.setState({ user: { itemId: "u1" }, status: "authenticated" });
});

describe("gql error mapping (C12)", () => {
  it("returns data on success, sent through the SDK", async () => {
    graphql.mockResolvedValue({ data: { getDocs: { items: [] } } });
    await expect(gql("query { getDocs { items { ItemId } } }", { a: 1 })).resolves.toEqual({
      getDocs: { items: [] },
    });
    expect(graphql).toHaveBeenCalledWith({ query: "query { getDocs { items { ItemId } } }", variables: { a: 1 } });
  });

  it("throws GraphQLError (code GatewayError) with messages joined by '; '", async () => {
    graphql.mockResolvedValue({ errors: [{ message: "first" }, { message: "second" }] });
    const err = await gql<never>("query {}").catch((e: DocmeDataError) => e);
    expect(err).toBeInstanceOf(GraphQLError);
    expect(err).toBeInstanceOf(DocmeDataError);
    expect(err.code).toBe("GatewayError");
    expect(err.message).toBe("first; second");
  });

  it("recovers GraphQL errors from an HTTP 400 body, with the operation name", async () => {
    graphql.mockRejectedValue(
      new BlocksApiError(400, "", { errors: [{ message: "The field `Foo` does not exist on `DocVersion`." }] }),
    );
    const err = await gql<never>("query($w: X) { getDocVersions(where: $w) { items { Foo } } }").catch(
      (e: DocmeDataError) => e,
    );
    expect(err).toBeInstanceOf(GraphQLError);
    expect(err.message).toBe("getDocVersions: The field `Foo` does not exist on `DocVersion`.");
  });

  it("throws when data is missing", async () => {
    graphql.mockResolvedValue({});
    await expect(gql("query {}")).rejects.toThrow("Gateway returned empty data");
  });

  it("rethrows network failures unchanged (no refresh)", async () => {
    graphql.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(gql("query {}")).rejects.toThrow("Failed to fetch");
    expect(refreshSession).not.toHaveBeenCalled();
  });
});

describe("gql 401 flow (C11)", () => {
  it("refreshes once and retries once", async () => {
    graphql.mockRejectedValueOnce(unauthorized()).mockResolvedValueOnce({ data: { ok: true } });
    refreshSession.mockResolvedValue(undefined);
    await expect(gql("query {}")).resolves.toEqual({ ok: true });
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(graphql).toHaveBeenCalledTimes(2);
  });

  it("when the refresh fails: Unauthorized, auth status unauthenticated, no retry", async () => {
    graphql.mockRejectedValue(unauthorized());
    refreshSession.mockRejectedValue(new Error("refresh failed"));
    const err = await gql<never>("query {}").catch((e: DocmeDataError) => e);
    expect(err).toBeInstanceOf(DocmeDataError);
    expect(err.code).toBe("Unauthorized");
    expect(useAuthStore.getState().status).toBe("unauthenticated");
    expect(graphql).toHaveBeenCalledTimes(1);
  });

  it("when the retry is also 401: Unauthorized after exactly one refresh (no loop)", async () => {
    graphql.mockRejectedValue(unauthorized());
    refreshSession.mockResolvedValue(undefined);
    const err = await gql<never>("query {}").catch((e: DocmeDataError) => e);
    expect(err.code).toBe("Unauthorized");
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(graphql).toHaveBeenCalledTimes(2);
    expect(useAuthStore.getState().status).toBe("unauthenticated");
  });

  it("concurrent 401s share a single refresh", async () => {
    let calls = 0;
    graphql.mockImplementation(async () => {
      calls++;
      if (calls <= 3) throw unauthorized();
      return { data: { ok: calls } };
    });
    let release!: () => void;
    refreshSession.mockReturnValue(new Promise<void>((r) => (release = r)));
    const all = Promise.all([gql("q1"), gql("q2"), gql("q3")]);
    await vi.waitFor(() => expect(calls).toBe(3));
    release();
    await all;
    expect(refreshSession).toHaveBeenCalledTimes(1);
  });
});
