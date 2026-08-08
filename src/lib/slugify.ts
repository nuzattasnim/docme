/**
 * Slugify a string into a URL-safe id (kebab-case). Used by the markdown
 * renderer to attach `id="…"` to h2/h3 headings and by the TOC to scroll
 * to them. Strips punctuation, lowercases, collapses whitespace into
 * dashes.
 *
 *   slugify("Component Documentation")  // "component-documentation"
 *   slugify("AlertDialog — variants!")   // "alertdialog-variants"
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip combining diacritics
    .replace(/[^\w\s-]/g, "") // strip punctuation
    .trim()
    .replace(/\s+/g, "-") // spaces → dashes
    .replace(/-+/g, "-"); // collapse multiple dashes
}

/**
 * Walk a markdown source string and pull out h2/h3 headings. Each heading
 * becomes a TOC entry with `{ id, level, text }`. Matches the same
 * slugify rule used by `<MarkdownRenderer>`'s heading components.
 */
const HEADING_RE = /^(#{2,3})\s+(.+)$/gm;

export interface ExtractedSection {
  id: string;
  level: 2 | 3;
  text: string;
}

export function extractSections(
  markdown: string | null | undefined,
): ExtractedSection[] {
  if (!markdown) return [];
  const out: ExtractedSection[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  HEADING_RE.lastIndex = 0;
  while ((m = HEADING_RE.exec(markdown)) !== null) {
    const level = m[1].length as 2 | 3;
    const text = m[2].trim();
    // De-duplicate ids — append -2, -3, … when the same heading text
    // repeats (rare, but possible in technical docs).
    let id = slugify(text);
    let suffix = 2;
    while (seen.has(id)) {
      id = `${slugify(text)}-${suffix++}`;
    }
    seen.add(id);
    out.push({ id, level, text });
  }
  return out;
}
