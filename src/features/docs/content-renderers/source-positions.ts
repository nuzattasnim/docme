/**
 * rehype plugin (SPEC3 §6.3 "Renderer support"): put the block's source range
 * on each block element as `data-src-start` / `data-src-end`, from the hast
 * node's `position.*.offset`. `Content.slice(start, end)` is then exactly the
 * block's Markdown source, which is what comment anchors are built from.
 *
 * Attributes only — no class or structure changes, so rendering is
 * pixel-identical (C14). Offsets are UTF-16 indices into the source string.
 */

/** Block elements that carry a source range (§4). */
export const SOURCE_BLOCK_TAGS: ReadonlySet<string> = new Set([
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "li",
  "blockquote",
  "pre",
  "table",
  "tr",
]);

interface HastPoint {
  offset?: number;
}

interface HastNode {
  type: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  position?: { start?: HastPoint; end?: HastPoint };
  children?: HastNode[];
}

function walk(node: HastNode): void {
  if (node.type === "element" && node.tagName && SOURCE_BLOCK_TAGS.has(node.tagName)) {
    const start = node.position?.start?.offset;
    const end = node.position?.end?.offset;
    if (typeof start === "number" && typeof end === "number" && end >= start) {
      node.properties = { ...(node.properties ?? {}), dataSrcStart: start, dataSrcEnd: end };
    }
  }
  if (node.children) for (const child of node.children) walk(child);
}

export function rehypeSourcePositions() {
  return (tree: HastNode) => {
    walk(tree);
  };
}

/** Props for a renderer that shows the whole content as one block (raw). */
export function wholeContentRange(content: string): { "data-src-start": number; "data-src-end": number } {
  return { "data-src-start": 0, "data-src-end": content.length };
}
