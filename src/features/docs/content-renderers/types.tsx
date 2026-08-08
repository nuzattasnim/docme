import type { ComponentType } from "react";

/**
 * Props every content renderer receives. Each renderer decides how to
 * turn the raw `content` string into rendered output.
 */
export interface ContentRendererProps {
  /** The raw content of the page (markdown source, MDX source, etc.). */
  content: string;
}

/**
 * A content renderer is a React component that takes the raw content and
 * renders it. Renderers are keyed in the registry by their lowercase
 * `ContentType` string (e.g. "md", "mdx").
 */
export type ContentRenderer = ComponentType<ContentRendererProps>;
