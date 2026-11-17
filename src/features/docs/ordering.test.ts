import { describe, expect, it } from "vitest";
import {
  INSERT_CHUNK_MAX_BYTES,
  chunkBySize,
  comparePages,
  nextSortOrder,
  planReorder,
  serializedBytes,
  sortPages,
} from "./ordering";

describe("page ordering (H3, C5)", () => {
  it("orders by SortOrder, then CreatedDate, then ItemId", () => {
    const pages = [
      { ItemId: "c", SortOrder: 2048, CreatedDate: "2026-01-01T00:00:01Z" },
      { ItemId: "b", SortOrder: 4096, CreatedDate: "2026-01-01T00:00:05Z" },
      { ItemId: "a", SortOrder: 4096, CreatedDate: "2026-01-01T00:00:05Z" },
      { ItemId: "d", SortOrder: 4096, CreatedDate: "2026-01-01T00:00:02Z" },
      { ItemId: "e", SortOrder: 1024, CreatedDate: "2026-01-01T00:00:09Z" },
    ];
    expect(sortPages(pages).map((p) => p.ItemId)).toEqual(["e", "c", "d", "a", "b"]);
  });

  it("puts pages without a SortOrder last instead of dropping them", () => {
    const sorted = sortPages([
      { ItemId: "x", SortOrder: null },
      { ItemId: "y", SortOrder: 1024 },
    ]);
    expect(sorted.map((p) => p.ItemId)).toEqual(["y", "x"]);
  });

  it("is a total order: equal records compare as 0 only to themselves", () => {
    const a = { ItemId: "a", SortOrder: 1, CreatedDate: "2026-01-01T00:00:00Z" };
    const b = { ItemId: "b", SortOrder: 1, CreatedDate: "2026-01-01T00:00:00Z" };
    expect(comparePages(a, b)).toBeLessThan(0);
    expect(comparePages(b, a)).toBeGreaterThan(0);
    expect(comparePages(a, a)).toBe(0);
  });

  it("does not modify its input", () => {
    const input = [{ ItemId: "b", SortOrder: 2 }, { ItemId: "a", SortOrder: 1 }];
    sortPages(input);
    expect(input[0].ItemId).toBe("b");
  });

  it("appends after the highest SortOrder, or at 1024 for an empty version", () => {
    expect(nextSortOrder(3072)).toBe(4096);
    expect(nextSortOrder(null)).toBe(1024);
    expect(nextSortOrder(undefined)).toBe(1024);
  });
});

describe("planReorder (H4, C6)", () => {
  const current = [
    { ItemId: "a", SortOrder: 1024 },
    { ItemId: "b", SortOrder: 2048 },
    { ItemId: "c", SortOrder: 3072 },
    { ItemId: "d", SortOrder: 4096 },
  ];

  it("updates only the pages whose value differs from (index+1)×1024", () => {
    expect(planReorder(current, ["a", "b", "d", "c"])).toEqual([
      { ItemId: "d", SortOrder: 3072 },
      { ItemId: "c", SortOrder: 4096 },
    ]);
  });

  it("returns nothing when the order is unchanged", () => {
    expect(planReorder(current, ["a", "b", "c", "d"])).toEqual([]);
  });

  it("after a partial save, plans only the updates still needed", () => {
    const afterPartial = [
      { ItemId: "a", SortOrder: 1024 },
      { ItemId: "b", SortOrder: 2048 },
      { ItemId: "c", SortOrder: 3072 },
      { ItemId: "d", SortOrder: 3072 }, // d moved, c's write failed
    ];
    expect(planReorder(afterPartial, ["a", "b", "d", "c"])).toEqual([{ ItemId: "c", SortOrder: 4096 }]);
  });

  it("renumbers legacy/colliding values and keeps pages added meanwhile at the end", () => {
    const withNew = [...current, { ItemId: "z", SortOrder: 4096 }];
    const plan = planReorder(withNew, ["d", "c", "b", "a"]);
    const final = new Map(withNew.map((p) => [p.ItemId, p.SortOrder]));
    for (const u of plan) final.set(u.ItemId, u.SortOrder);
    expect([...final.entries()].sort((x, y) => x[1] - y[1]).map(([id]) => id)).toEqual([
      "d",
      "c",
      "b",
      "a",
      "z",
    ]);
  });

  it("ignores ids that no longer exist", () => {
    expect(planReorder(current, ["gone", "a", "b", "c", "d"])).toEqual([]);
  });
});

describe("chunkBySize (C15)", () => {
  it("never puts more than 20 items in a chunk", () => {
    const items = Array.from({ length: 45 }, (_, i) => ({ i }));
    expect(chunkBySize(items).map((c) => c.length)).toEqual([20, 20, 5]);
  });

  it("never exceeds 2 MB of serialized payload per chunk", () => {
    const big = "x".repeat(204_800); // 200 KB pages
    const items = Array.from({ length: 100 }, (_, i) => ({ Title: `p${i}`, Content: big }));
    const chunks = chunkBySize(items);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(20);
      expect(serializedBytes(chunk)).toBeLessThanOrEqual(INSERT_CHUNK_MAX_BYTES);
    }
    expect(chunks.flat()).toHaveLength(100);
  });

  it("counts multi-byte characters as bytes, not characters", () => {
    const wide = "é".repeat(204_800); // 2 bytes each in UTF-8
    const chunks = chunkBySize(Array.from({ length: 10 }, () => ({ Content: wide })));
    for (const chunk of chunks) expect(serializedBytes(chunk)).toBeLessThanOrEqual(INSERT_CHUNK_MAX_BYTES);
    expect(chunks.length).toBeGreaterThan(1);
  });
});
