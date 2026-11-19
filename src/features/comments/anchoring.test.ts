import { describe, expect, it } from "vitest";
import { CONTEXT, MAX_EXACT, createSelector, resolveSelector, type Selector } from "./anchoring";

const EX1 = "Intro.\n\nInstall with npm i docme.\n";

describe("createSelector", () => {
  it("example 1 / H5: a selection found once in its block becomes a Quote", () => {
    const blockStart = EX1.indexOf("Install");
    const blockEnd = EX1.indexOf(".\n", blockStart) + 1; // paragraph source "Install with npm i docme."
    const s = createSelector(EX1, { start: blockStart, end: blockEnd }, "npm i docme");
    expect(s).toEqual({
      kind: "Quote",
      exact: "npm i docme",
      start: 21,
      end: 32,
      prefix: "Intro.\n\nInstall with ",
      suffix: ".\n",
    });
    expect(resolveSelector(EX1, s)).toEqual({ status: "exact", start: 21, end: 32 });
  });

  it("C5: a selection crossing inline markup falls back to the whole block", () => {
    const content = "A **bold** claim here.\n";
    // Rendered text "bold claim" isn't in the source verbatim.
    const s = createSelector(content, { start: 0, end: 22 }, "bold claim");
    expect(s.kind).toBe("Block");
    expect(s.exact).toBe("A **bold** claim here.");
    expect([s.start, s.end]).toEqual([0, 22]);
  });

  it("C5: a selection repeated in its block falls back to the whole block", () => {
    const content = "the cat and the dog";
    const s = createSelector(content, { start: 0, end: content.length }, "the");
    expect(s.kind).toBe("Block");
    expect(s.exact).toBe(content);
  });

  it("no or blank selection → Block", () => {
    expect(createSelector("abc", { start: 0, end: 3 }).kind).toBe("Block");
    expect(createSelector("abc", { start: 0, end: 3 }, "   ").kind).toBe("Block");
  });

  it("trims the selection before matching", () => {
    const s = createSelector(EX1, { start: 8, end: 33 }, "  npm i docme \n");
    expect(s.kind).toBe("Quote");
    expect(s.exact).toBe("npm i docme");
  });

  it("selection at offset 0 and at the end of the content", () => {
    const content = "alpha beta gamma";
    const first = createSelector(content, { start: 0, end: content.length }, "alpha");
    expect([first.start, first.end, first.prefix]).toEqual([0, 5, ""]);
    const last = createSelector(content, { start: 0, end: content.length }, "gamma");
    expect([last.start, last.end, last.suffix]).toEqual([11, 16, ""]);
  });

  it("keeps at most 32 characters of context", () => {
    const content = `${"x".repeat(100)}TARGET${"y".repeat(100)}`;
    const s = createSelector(content, { start: 0, end: content.length }, "TARGET");
    expect(s.prefix).toHaveLength(CONTEXT);
    expect(s.suffix).toHaveLength(CONTEXT);
  });

  it("clamps the exact text at 4,000 characters", () => {
    const content = "z".repeat(10_000);
    const s = createSelector(content, { start: 100, end: 9_000 });
    expect(s.end - s.start).toBe(MAX_EXACT);
    expect(s.exact).toHaveLength(MAX_EXACT);
  });

  it("clamps an out-of-range block to the content", () => {
    const s = createSelector("short", { start: 2, end: 99 });
    expect([s.start, s.end, s.exact]).toEqual([2, 5, "ort"]);
  });

  it("uses UTF-16 offsets with emoji and non-Latin text", () => {
    const content = "Hi 👋 — 日本語 text 🎉 end";
    const s = createSelector(content, { start: 0, end: content.length }, "日本語");
    expect(content.slice(s.start, s.end)).toBe("日本語");
    expect(s.start).toBe(content.indexOf("日本語"));
    const moved = `🎉🎉${content}`;
    expect(resolveSelector(moved, s)).toEqual({ status: "relocated", start: s.start + 4, end: s.end + 4 });
  });
});

describe("resolveSelector", () => {
  const ex1 = createSelector(EX1, { start: 8, end: 33 }, "npm i docme");

  it("example 2 / H6: a quote moved by an inserted paragraph is relocated", () => {
    const inserted = `${"P".repeat(98)}\n\n`; // 100 characters
    const content = `Intro.\n\n${inserted}Install with npm i docme.\n`;
    expect(resolveSelector(content, ex1)).toEqual({ status: "relocated", start: 121, end: 132 });
  });

  it("relocation picks the occurrence whose context matches best", () => {
    const s: Selector = { kind: "Quote", exact: "run", prefix: "To build, ", suffix: " make.", start: 0, end: 3 };
    const content = "To test, run npm test. To build, run make.";
    const r = resolveSelector(content, s);
    expect(r.status).toBe("relocated");
    expect(r.start).toBe(content.lastIndexOf("run"));
  });

  it("relocation tie → the occurrence nearest the original start", () => {
    const s: Selector = { kind: "Quote", exact: "foo", prefix: "", suffix: "", start: 20, end: 23 };
    const content = "foo ............... x foo ....... foo";
    // Every occurrence scores 0; nearest to 20 is index 22.
    expect(resolveSelector(content, s)).toEqual({ status: "relocated", start: 22, end: 25 });
  });

  it("example 3 / H6: a small edit inside the threshold resolves fuzzy", () => {
    const s: Selector = {
      kind: "Quote",
      exact: "Instal with npm i docme",
      prefix: "Intro.\n\n",
      suffix: ".\n",
      start: 8,
      end: 31,
    };
    expect(resolveSelector(EX1, s)).toEqual({ status: "fuzzy", start: 8, end: 31 });
  });

  it("example 3 / C4: deleted text is orphaned, never attached elsewhere", () => {
    const s: Selector = {
      kind: "Quote",
      exact: "Instal with npm i docme",
      prefix: "Intro.\n\n",
      suffix: ".\n",
      start: 8,
      end: 31,
    };
    expect(resolveSelector("Intro.\n", s)).toEqual({ status: "orphaned" });
  });

  it("C4: text changed beyond the threshold is orphaned", () => {
    const original = "The quick brown fox jumps over the lazy dog near the river bank.";
    const s = createSelector(original, { start: 0, end: original.length });
    const rewritten = "A completely different sentence about cats sleeping all afternoon.";
    expect(resolveSelector(rewritten, s).status).toBe("orphaned");
  });

  it("empty content and empty exact are orphaned", () => {
    expect(resolveSelector("", ex1).status).toBe("orphaned");
    expect(resolveSelector(EX1, { ...ex1, exact: "" }).status).toBe("orphaned");
  });

  it("unrelated edits elsewhere keep the anchor exact", () => {
    const content = `${EX1}\n## Later\n\nMore text added after.\n`;
    expect(resolveSelector(content, ex1).status).toBe("exact");
  });

  it("a quote repeated twice relocates to the one with the matching context", () => {
    const content = "Install with npm i docme.\n\nIntro.\n\nInstall with npm i docme.\n";
    const r = resolveSelector(content, ex1);
    expect(r.status).toBe("relocated");
    expect(r.start).toBe(content.lastIndexOf("npm i docme"));
  });
});

describe("H13 benchmark: 200 anchors on a 200 KB page", () => {
  it("p95 ≤ 50 ms over 50 runs, with 20 anchors needing fuzzy matching", () => {
    // Deterministic pseudo-random paragraphs.
    // mulberry32: 32-bit integer math, so the sequence doesn't cycle early.
    let seed = 42;
    const rand = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const words = "alpha beta gamma delta epsilon zeta theta kappa lambda sigma omega docs page version".split(" ");
    const paragraphs: string[] = [];
    let size = 0;
    while (size < 200 * 1024) {
      const n = 20 + Math.floor(rand() * 40);
      const p = Array.from({ length: n }, () => words[Math.floor(rand() * words.length)]).join(" ") + ".";
      paragraphs.push(p);
      size += p.length + 2;
    }
    const original = paragraphs.join("\n\n");

    // 200 selectors on distinct paragraphs.
    const step = Math.floor(paragraphs.length / 200);
    const selectors: Selector[] = [];
    let offset = 0;
    const starts: number[] = [];
    for (const p of paragraphs) {
      starts.push(offset);
      offset += p.length + 2;
    }
    for (let i = 0; i < 200; i++) {
      const idx = i * step;
      selectors.push(createSelector(original, { start: starts[idx], end: starts[idx] + paragraphs[idx].length }));
    }

    // Edit: insert text at the top (everything relocates) and change one
    // character in 20 anchored paragraphs (those need fuzzy matching).
    const edited = paragraphs.map((p, idx) => {
      const i = idx / step;
      if (Number.isInteger(i) && i < 200 && i % 10 === 0) return p.slice(0, 10) + "#" + p.slice(11);
      return p;
    });
    const content = `New intro paragraph.\n\n${edited.join("\n\n")}`;

    const counts = { exact: 0, relocated: 0, fuzzy: 0, orphaned: 0 };
    for (const s of selectors) counts[resolveSelector(content, s).status]++;
    expect(counts.fuzzy).toBe(20);
    expect(counts.orphaned).toBe(0);

    const times: number[] = [];
    for (let run = 0; run < 50; run++) {
      const t0 = performance.now();
      for (const s of selectors) resolveSelector(content, s);
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    const p95 = times[Math.ceil(0.95 * times.length) - 1];
    console.info(`[H13] resolve 200 anchors on ${(content.length / 1024).toFixed(0)} KB: p95 ${p95.toFixed(1)} ms`);
    expect(p95).toBeLessThanOrEqual(50);
  });
});
