/**
 * Comment anchoring (SPEC3 §6.3) — W3C Web Annotation selectors against the
 * page's Markdown SOURCE (`Page.Content`), not the rendered DOM.
 *
 *  - TextQuoteSelector  (exact, prefix, suffix)   §4.2.4
 *  - TextPositionSelector (start, end)            §4.2.5
 *
 * Both are stored. Resolution tries the position first, then re-finds the
 * quote using prefix/suffix context, then fuzzy-matches with
 * diff-match-patch, and otherwise reports the anchor as orphaned — it never
 * attaches a comment to unrelated text.
 *
 * Offsets are UTF-16 code units (JavaScript string indices), the same units
 * as the hast `position.*.offset` the renderers expose.
 *
 * Pure functions; no I/O.
 */
import DiffMatchPatch from "diff-match-patch";

export type SelectorKind = "Quote" | "Block";

export interface Selector {
  kind: SelectorKind;
  exact: string;
  prefix: string;
  suffix: string;
  start: number;
  end: number;
}

export type ResolutionStatus = "exact" | "relocated" | "fuzzy" | "orphaned";

export interface Resolution {
  status: ResolutionStatus;
  start?: number;
  end?: number;
}

/** Maximum stored anchor length; longer blocks are clamped (§6.3 step 4). */
export const MAX_EXACT = 4000;
/** Characters of context kept on each side. */
export const CONTEXT = 32;
/** diff-match-patch bitap search works on at most 32 characters. */
const MATCH_PATTERN = 32;
/** Fuzzy search radius around the stored start: > Match_Threshold × Match_Distance (400). */
const SEARCH_RADIUS = 1100;
/** Minimum similarity for a fuzzy match (§6.3 step 3). */
export const FUZZY_MIN_SIMILARITY = 0.75;

function countOccurrences(haystack: string, needle: string, stopAt = 2): { count: number; first: number } {
  let count = 0;
  let first = -1;
  let from = 0;
  while (count < stopAt) {
    const i = haystack.indexOf(needle, from);
    if (i === -1) break;
    if (first === -1) first = i;
    count++;
    from = i + 1;
  }
  return { count, first };
}

/**
 * Build a selector for a selection inside one rendered block.
 *
 * `block` is the block's source range (`data-src-start`/`data-src-end`).
 * When `selectedText` (trimmed) occurs exactly once in the block's source, the
 * selector quotes just that text; otherwise — the selection crosses inline
 * markup, or is ambiguous, or empty — it covers the whole block (C5).
 */
export function createSelector(
  content: string,
  block: { start: number; end: number },
  selectedText?: string,
): Selector {
  const blockStart = Math.max(0, Math.min(block.start, content.length));
  const blockEnd = Math.max(blockStart, Math.min(block.end, content.length));
  const blockText = content.slice(blockStart, blockEnd);

  let kind: SelectorKind = "Block";
  let start = blockStart;
  let end = blockEnd;

  const sel = selectedText?.trim();
  if (sel) {
    const { count, first } = countOccurrences(blockText, sel);
    if (count === 1) {
      kind = "Quote";
      start = blockStart + first;
      end = start + sel.length;
    }
  }

  if (end - start > MAX_EXACT) end = start + MAX_EXACT;

  return {
    kind,
    exact: content.slice(start, end),
    prefix: content.slice(Math.max(0, start - CONTEXT), start),
    suffix: content.slice(end, end + CONTEXT),
    start,
    end,
  };
}

function commonSuffixLength(a: string, b: string): number {
  let n = 0;
  const max = Math.min(a.length, b.length);
  while (n < max && a[a.length - 1 - n] === b[b.length - 1 - n]) n++;
  return n;
}

function commonPrefixLength(a: string, b: string): number {
  let n = 0;
  const max = Math.min(a.length, b.length);
  while (n < max && a[n] === b[n]) n++;
  return n;
}

let dmpInstance: DiffMatchPatch | null = null;
function dmp(): DiffMatchPatch {
  if (!dmpInstance) {
    dmpInstance = new DiffMatchPatch();
    dmpInstance.Match_Threshold = 0.4;
    dmpInstance.Match_Distance = 1000;
    // Bound one diff; windows are ≤ 4,000 characters so this rarely binds.
    dmpInstance.Diff_Timeout = 0.1;
  }
  return dmpInstance;
}

/** Re-find a selector in (possibly edited) content. */
export function resolveSelector(
  content: string,
  s: Pick<Selector, "exact" | "prefix" | "suffix" | "start" | "end">,
): Resolution {
  const { exact } = s;
  if (!exact) return { status: "orphaned" };

  // 1. exact — the stored position still holds the quote.
  if (s.start >= 0 && s.end <= content.length && content.slice(s.start, s.end) === exact) {
    return { status: "exact", start: s.start, end: s.end };
  }

  // 2. relocated — best occurrence by prefix/suffix agreement, then nearest.
  let best = -1;
  let bestScore = -1;
  let bestDistance = Infinity;
  for (let i = content.indexOf(exact); i !== -1; i = content.indexOf(exact, i + 1)) {
    const before = content.slice(Math.max(0, i - CONTEXT), i);
    const after = content.slice(i + exact.length, i + exact.length + CONTEXT);
    const score = commonSuffixLength(before, s.prefix) + commonPrefixLength(after, s.suffix);
    const distance = Math.abs(i - s.start);
    if (score > bestScore || (score === bestScore && distance < bestDistance)) {
      best = i;
      bestScore = score;
      bestDistance = distance;
    }
  }
  if (best !== -1) return { status: "relocated", start: best, end: best + exact.length };

  // 3. fuzzy — locate by the quote's first 32 characters, then compare the window.
  if (exact.length <= MAX_EXACT && content.length > 0) {
    const d = dmp();
    const expected = Math.max(0, Math.min(s.start, content.length));
    // Bitap scores a candidate errors/32 + |x − expected| / Match_Distance and
    // rejects scores above Match_Threshold, so no match can lie farther than
    // 0.4 × 1000 = 400 characters away. Searching a slice with margin returns
    // the same location without scanning the whole page.
    const from = Math.max(0, expected - SEARCH_RADIUS);
    const region = content.slice(from, expected + SEARCH_RADIUS + MATCH_PATTERN);
    const found = d.match_main(region, exact.slice(0, MATCH_PATTERN), expected - from);
    const loc = found === -1 ? -1 : from + found;
    if (loc !== -1) {
      const window = content.slice(loc, loc + exact.length);
      const distance = d.diff_levenshtein(d.diff_main(window, exact, false));
      const similarity = 1 - distance / exact.length;
      if (similarity >= FUZZY_MIN_SIMILARITY) {
        return { status: "fuzzy", start: loc, end: loc + window.length };
      }
    }
  }

  // 4. orphaned — keep the comment, show it as outdated (C4).
  return { status: "orphaned" };
}
