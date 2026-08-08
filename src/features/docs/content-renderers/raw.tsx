import type { ContentRendererProps } from "./types";

/**
 * Fallback renderer — used when no specific renderer is registered for a
 * `ContentType`. Shows the raw content in a `<pre>` block, which is the
 * safe default for unknown types (e.g. "text/plain", an empty string, or
 * a typo'd "mardown").
 */
export function RawRenderer({ content }: ContentRendererProps) {
  if (!content) {
    return (
      <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
        This page has no content yet.
      </p>
    );
  }
  return (
    <pre className="max-h-[70vh] max-w-prose overflow-auto whitespace-pre-wrap rounded-md bg-muted p-4 text-sm">
      {content}
    </pre>
  );
}
