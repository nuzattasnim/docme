/**
 * Content-type renderers for the DocDetailPage.
 *
 * The default export is `getContentRenderer` — a single function that
 * maps a `ContentType` string to a React component that renders the
 * page content in live view mode. Built-in renderers:
 *
 *   - `md`    → GitHub-flavored Markdown via react-markdown
 *   - `mdx`   → MDX via @mdx-js/mdx (compiled at runtime)
 *   - any other / null / undefined → raw `<pre>` fallback
 *
 * To add a new content type, register it in `./registry.tsx`.
 */
export { getContentRenderer } from "./registry";
export type { ContentRenderer, ContentRendererProps } from "./types";
