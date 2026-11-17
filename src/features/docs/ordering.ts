/**
 * Page ordering rules.
 *
 * Pages are ordered by `SortOrder` ASC, then `CreatedDate` ASC, then `ItemId`
 * ASC. Two pages added at the same moment can share a SortOrder; the
 * tie-breaks keep their order stable and neither is lost.
 */

export const SORT_STEP = 1024;

export interface Orderable {
  ItemId: string;
  SortOrder?: number | null;
  CreatedDate?: string | null;
}

function sortKey(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
}

function dateKey(value: string | null | undefined): number {
  if (!value) return Number.POSITIVE_INFINITY;
  const t = Date.parse(value);
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
}

export function comparePages(a: Orderable, b: Orderable): number {
  const bySort = sortKey(a.SortOrder) - sortKey(b.SortOrder);
  if (bySort !== 0 && !Number.isNaN(bySort)) return bySort;
  const byDate = dateKey(a.CreatedDate) - dateKey(b.CreatedDate);
  if (byDate !== 0 && !Number.isNaN(byDate)) return byDate;
  return a.ItemId < b.ItemId ? -1 : a.ItemId > b.ItemId ? 1 : 0;
}

/** A sorted copy; the input is not modified. */
export function sortPages<T extends Orderable>(pages: readonly T[]): T[] {
  return [...pages].sort(comparePages);
}

/** SortOrder for a page appended after the current highest one. */
export function nextSortOrder(currentMax: number | null | undefined): number {
  const max = typeof currentMax === "number" && Number.isFinite(currentMax) ? currentMax : 0;
  return max + SORT_STEP;
}

/** SortOrder for position `index` (0-based) in a freshly numbered list. */
export function sortOrderAt(index: number): number {
  return (index + 1) * SORT_STEP;
}

export interface SortOrderUpdate {
  ItemId: string;
  SortOrder: number;
}

/**
 * The writes needed to make `current` follow `orderedIds`.
 *
 * Target for position i is (i+1)×1024. Only pages whose stored SortOrder
 * differs get an update, so a retry after a partial failure sends only what's
 * still needed. Ids that no longer exist are ignored; pages that exist but are
 * missing from `orderedIds` (added by someone else meanwhile) keep their
 * relative order after the ordered ones.
 */
export function planReorder(
  current: readonly Orderable[],
  orderedIds: readonly string[],
): SortOrderUpdate[] {
  const byId = new Map(current.map((p) => [p.ItemId, p]));
  const seen = new Set<string>();
  const finalOrder: Orderable[] = [];
  for (const id of orderedIds) {
    const page = byId.get(id);
    if (page && !seen.has(id)) {
      finalOrder.push(page);
      seen.add(id);
    }
  }
  for (const page of sortPages(current)) {
    if (!seen.has(page.ItemId)) finalOrder.push(page);
  }

  const updates: SortOrderUpdate[] = [];
  finalOrder.forEach((page, i) => {
    const target = sortOrderAt(i);
    if (page.SortOrder !== target) updates.push({ ItemId: page.ItemId, SortOrder: target });
  });
  return updates;
}

export const INSERT_CHUNK_MAX_ITEMS = 20;
export const INSERT_CHUNK_MAX_BYTES = 2 * 1024 * 1024;

const encoder = new TextEncoder();

export function serializedBytes(value: unknown): number {
  return encoder.encode(JSON.stringify(value)).length;
}

/**
 * Split `items` into request-sized chunks: at most `maxItems` items and at
 * most `maxBytes` of serialized JSON per chunk. An item that is larger than
 * `maxBytes` on its own gets a chunk to itself (callers validate size first).
 */
export function chunkBySize<T>(
  items: readonly T[],
  { maxItems = INSERT_CHUNK_MAX_ITEMS, maxBytes = INSERT_CHUNK_MAX_BYTES } = {},
): T[][] {
  const chunks: T[][] = [];
  let current: T[] = [];
  let currentBytes = 2; // "[]"
  for (const item of items) {
    const size = serializedBytes(item) + 1; // + comma
    if (current.length > 0 && (current.length >= maxItems || currentBytes + size > maxBytes)) {
      chunks.push(current);
      current = [];
      currentBytes = 2;
    }
    current.push(item);
    currentBytes += size;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}
