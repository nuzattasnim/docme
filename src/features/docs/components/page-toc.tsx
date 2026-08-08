import { useCallback } from "react";
import { cn } from "@/lib/utils";
import type { ExtractedSection } from "@/lib/slugify";

export interface PageTocProps {
  sections: ExtractedSection[];
}

/**
 * Sticky right-side table of contents. Each entry scrolls to the
 * matching heading via `scrollIntoView` and briefly highlights it so
 * the reader can see where they landed.
 *
 * Renders nothing when there are no sections — the parent should hide
 * its column instead.
 *
 * The aside is its own scroll container so a long TOC doesn't push
 * the page content's scrollbar around.
 */
export function PageToc({ sections }: PageTocProps) {
  const handleClick = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    el.classList.add(
      "ring-2",
      "ring-primary/40",
      "ring-offset-2",
      "ring-offset-background",
      "rounded",
      "transition",
    );
    window.setTimeout(() => {
      el.classList.remove(
        "ring-2",
        "ring-primary/40",
        "ring-offset-2",
        "ring-offset-background",
        "rounded",
        "transition",
      );
    }, 1200);
  }, []);

  if (sections.length === 0) return null;

  return (
    <aside className="hidden h-full min-h-0 overflow-y-auto pt-1 lg:block">
      <div className="sticky top-2">
        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          On this page
        </p>
        <nav aria-label="Table of contents">
          <ol className="space-y-1 border-l border-border text-sm">
            {sections.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => handleClick(s.id)}
                  className={cn(
                    "-ml-px block w-full truncate rounded border-l-2 border-transparent py-1 text-left text-muted-foreground transition-colors hover:border-primary hover:text-foreground",
                    s.level === 2 ? "pl-3" : "pl-6 text-xs",
                  )}
                  title={s.text}
                >
                  {s.text}
                </button>
              </li>
            ))}
          </ol>
        </nav>
      </div>
    </aside>
  );
}
