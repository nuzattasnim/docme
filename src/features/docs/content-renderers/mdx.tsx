import { useEffect, useState, type ComponentType } from "react";
import { evaluate } from "@mdx-js/mdx";
import * as runtime from "react/jsx-runtime";
import type { ContentRendererProps } from "./types";

/**
 * Cache of compiled MDX components keyed by the source content string.
 * Re-compiles only when the content changes. The cache is unbounded on
 * purpose — these are page-level compilations scoped to a single
 * DocVersion, and the working set is small.
 *
 * `errorCache` separately surfaces the last compile error so a failed
 * compile doesn't fall out of the in-flight `cache` entry.
 */
const cache = new Map<string, Promise<{ default: ComponentType }>>();

function compile(content: string): Promise<{ default: ComponentType }> {
  const hit = cache.get(content);
  if (hit) return hit;
  const promise = evaluate(content, { ...runtime }).then((mod) => ({
    default: mod.default as ComponentType,
  }));
  cache.set(content, promise);
  // If the compile fails, drop the failed entry so the next render can
  // retry instead of being stuck on the rejection.
  promise.catch(() => {
    if (cache.get(content) === promise) cache.delete(content);
  });
  return promise;
}

/**
 * MDX renderer — compiles MDX at runtime via `@mdx-js/mdx` and renders
 * the resulting component. Compilation is async (a few hundred ms for
 * typical pages), so we render a small loading state while it's in
 * flight. If MDX is invalid, the compile error is shown inline.
 *
 * Security note: MDX evaluates inline JSX. Users who can create pages
 * in this project can therefore embed arbitrary React components.
 * Treat that as a deliberate trust boundary.
 */
export function MdxRenderer({ content }: ContentRendererProps) {
  const [Component, setComponent] = useState<ComponentType | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setComponent(null);
    setError(null);
    compile(content)
      .then((mod) => {
        if (!cancelled) setComponent(() => mod.default);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [content]);

  if (error) {
    return (
      <div className="space-y-2">
        <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          Failed to compile MDX: {error}
        </p>
        <details>
          <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
            Show source
          </summary>
          <pre className="mt-2 max-h-[50vh] overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-xs">
            {content}
          </pre>
        </details>
      </div>
    );
  }

  if (!Component) {
    return (
      <p className="text-sm text-muted-foreground">Compiling MDX…</p>
    );
  }

  return (
    <div className="doc-mdx">
      <Component />
    </div>
  );
}
