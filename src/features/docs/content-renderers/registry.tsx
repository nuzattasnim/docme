import { RawRenderer } from "./raw";
import { MarkdownRenderer } from "./markdown";
import { MdxRenderer } from "./mdx";
import type { ContentRenderer } from "./types";

/**
 * Registry of content renderers, keyed by lowercase `ContentType`
 * (e.g. "md", "mdx", "html"). The map is the single source of truth
 * for "which renderer shows which ContentType".
 *
 * To support a new content type:
 *   1. Implement a component that accepts `ContentRendererProps`.
 *   2. Add a `.set('<type>', Renderer)` entry below.
 *   3. Done — the DocDetailPage will pick it up automatically.
 *
 * The fallback (`getContentRenderer`) returns `RawRenderer` for any
 * unknown type, so adding a new type is purely additive.
 */
const REGISTRY = new Map<string, ContentRenderer>();

// Built-in renderers (case-insensitive lookup).
REGISTRY.set("md", MarkdownRenderer);
REGISTRY.set("mdx", MdxRenderer);

/**
 * Look up the renderer for a `ContentType`. Lookup is case-insensitive
 * and whitespace-trimmed. Returns `RawRenderer` if the type is unknown
 * (or null/undefined), so unknown content types still render safely.
 */
export function getContentRenderer(
  contentType: string | null | undefined,
): ContentRenderer {
  const key = (contentType ?? "").toLowerCase().trim();
  return REGISTRY.get(key) ?? RawRenderer;
}
