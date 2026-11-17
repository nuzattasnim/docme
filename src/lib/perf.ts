/**
 * Opt-in performance marks for the §5 journeys (SPEC1).
 *
 * Enabled only when the build has `VITE_PERF_MARKS=true`; otherwise every
 * function is a no-op. Spans are logged with `console.table` so 20 runs can
 * be copied out of DevTools and summarized as p50/p95.
 *
 *   doc-open:start → doc-open:list-visible   (J1, measure "doc-open")
 *   page:select    → page:content-visible    (J2, measure "page-content")
 */
const enabled = import.meta.env.VITE_PERF_MARKS === "true";

export function perfMark(name: string): void {
  if (!enabled || typeof performance === "undefined") return;
  performance.mark(name);
}

/** Measure from `startMark` to now and log it once. */
export function perfMeasure(measureName: string, startMark: string, endMark: string): void {
  if (!enabled || typeof performance === "undefined") return;
  if (performance.getEntriesByName(startMark, "mark").length === 0) return;
  performance.mark(endMark);
  const entry = performance.measure(measureName, startMark, endMark);
  console.table([{ span: measureName, ms: Math.round(entry.duration) }]);
  performance.clearMarks(startMark);
  performance.clearMarks(endMark);
}
