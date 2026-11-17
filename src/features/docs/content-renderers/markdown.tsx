import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ContentRendererProps } from "./types";
import { slugify } from "@/lib/slugify";

/**
 * Markdown renderer — uses `react-markdown` with GitHub-flavored markdown
 * (tables, strikethrough, task lists, autolinks). Component overrides
 * keep the rendered output in the docme Tailwind palette so it matches
 * the surrounding chrome.
 */
export function MarkdownRenderer({ content }: ContentRendererProps) {
  if (!content) {
    return (
      <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
        This page has no content yet.
      </p>
    );
  }
  return (
    <div className="doc-md max-w-prose space-y-3 text-sm leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children, ...props }) => (
            <h1
              className="mt-4 max-w-none scroll-mt-20 text-2xl font-semibold"
              {...props}
            >
              {children}
            </h1>
          ),
          h2: ({ children, ...props }) => {
            const text = stringifyChildren(children);
            return (
              <h2
                id={slugify(text)}
                className="mt-4 max-w-none scroll-mt-20 text-xl font-semibold"
                {...props}
              >
                {children}
              </h2>
            );
          },
          h3: ({ children, ...props }) => {
            const text = stringifyChildren(children);
            return (
              <h3
                id={slugify(text)}
                className="mt-3 max-w-none scroll-mt-20 text-lg font-semibold"
                {...props}
              >
                {children}
              </h3>
            );
          },
          h4: ({ children, ...props }) => (
            <h4
              className="mt-3 max-w-none scroll-mt-20 text-base font-semibold"
              {...props}
            >
              {children}
            </h4>
          ),
          p: ({ children, ...props }) => (
            <p className="leading-relaxed" {...props}>
              {children}
            </p>
          ),
          ul: ({ children, ...props }) => (
            <ul className="list-disc space-y-1 pl-6" {...props}>
              {children}
            </ul>
          ),
          ol: ({ children, ...props }) => (
            <ol className="list-decimal space-y-1 pl-6" {...props}>
              {children}
            </ol>
          ),
          li: ({ children, ...props }) => (
            <li className="leading-relaxed" {...props}>
              {children}
            </li>
          ),
          a: ({ children, ...props }) => (
            <a
              className="text-primary underline underline-offset-2 hover:text-primary/80"
              target="_blank"
              rel="noreferrer"
              {...props}
            >
              {children}
            </a>
          ),
          // `inline` is a custom hint we set via the `code` override below.
          // react-markdown doesn't pass it natively; we use a className
          // convention to detect inline vs block code.
          code: ({ children, className, ...props }) => {
            const isBlock = /language-/.test(className ?? "");
            if (isBlock) {
              return (
                <code className={className} {...props}>
                  {children}
                </code>
              );
            }
            return (
              <code
                className="rounded bg-muted px-1 py-0.5 font-mono text-xs"
                {...props}
              >
                {children}
              </code>
            );
          },
          pre: ({ children, ...props }) => (
            <pre
              className="my-3 max-h-[70vh] overflow-auto whitespace-pre-wrap rounded-md bg-muted p-4 font-mono text-xs"
              {...props}
            >
              {children}
            </pre>
          ),
          blockquote: ({ children, ...props }) => (
            <blockquote
              className="border-l-4 border-muted-foreground/30 pl-4 italic text-muted-foreground"
              {...props}
            >
              {children}
            </blockquote>
          ),
          table: ({ children, ...props }) => (
            <table className="w-full border-collapse text-xs" {...props}>
              {children}
            </table>
          ),
          thead: ({ children, ...props }) => (
            <thead className="bg-muted" {...props}>
              {children}
            </thead>
          ),
          th: ({ children, ...props }) => (
            <th className="border px-2 py-1 text-left font-medium" {...props}>
              {children}
            </th>
          ),
          td: ({ children, ...props }) => (
            <td className="border px-2 py-1 align-top" {...props}>
              {children}
            </td>
          ),
          hr: ({ ...props }) => (
            <hr className="my-4 border-muted" {...props} />
          ),
          img: ({ alt, ...props }) => (
            <img className="my-2 max-w-full rounded-md" alt={alt ?? ""} {...props} />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

/**
 * react-markdown passes `children` as a React node (string | array |
 * element). Coerce it to a string so we can slugify it for the
 * heading's `id`. Numbers and booleans are stringified; everything
 * else falls back to "".
 */
function stringifyChildren(children: React.ReactNode): string {
  if (typeof children === "string") return children;
  if (typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(stringifyChildren).join("");
  if (children && typeof children === "object" && "props" in children) {
    // Walk the rendered tree once more — covers nested wrappers.
    return stringifyChildren(
      (children as { props: { children?: React.ReactNode } }).props.children,
    );
  }
  return "";
}
