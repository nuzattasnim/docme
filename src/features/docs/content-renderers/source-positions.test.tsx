import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { evaluate } from "@mdx-js/mdx";
import * as runtime from "react/jsx-runtime";
import type { ComponentType } from "react";
import { MarkdownRenderer } from "./markdown";
import { RawRenderer } from "./raw";
import { rehypeSourcePositions } from "./source-positions";

const FIXTURE = [
  "# Title",
  "",
  "Intro with **bold** and `code`. 👋",
  "",
  "## Install",
  "",
  "- first item",
  "- second item",
  "",
  "> quoted text",
  "",
  "```js",
  "npm i docme",
  "```",
  "",
  "| a | b |",
  "| - | - |",
  "| 1 | 2 |",
  "",
  "###### Deep heading",
  "",
].join("\n");

/** [tag, start, end] for every element carrying data-src-*. */
function ranges(html: string): Array<[string, number, number]> {
  const out: Array<[string, number, number]> = [];
  for (const m of html.matchAll(/<(\w+)\b[^>]*?data-src-start="(\d+)"[^>]*?data-src-end="(\d+)"/g)) {
    out.push([m[1], Number(m[2]), Number(m[3])]);
  }
  return out;
}

describe("H7: block elements carry their exact source range", () => {
  it("Markdown renderer", () => {
    const html = renderToStaticMarkup(<MarkdownRenderer content={FIXTURE} />);
    const found = ranges(html);
    const byTag = (tag: string) => found.filter(([t]) => t === tag).map(([, s, e]) => FIXTURE.slice(s, e));

    expect(byTag("h1")).toEqual(["# Title"]);
    expect(byTag("h2")).toEqual(["## Install"]);
    expect(byTag("h6")).toEqual(["###### Deep heading"]);
    expect(byTag("p")).toContain("Intro with **bold** and `code`. 👋");
    expect(byTag("li")).toEqual(["- first item", "- second item"]);
    expect(byTag("blockquote")).toEqual(["> quoted text"]);
    expect(byTag("pre")).toEqual(["```js\nnpm i docme\n```"]);
    expect(byTag("table")).toEqual(["| a | b |\n| - | - |\n| 1 | 2 |"]);
    expect(byTag("tr")).toEqual(["| a | b |", "| 1 | 2 |"]);
  });

  it("only attributes are added: classes and structure are unchanged", () => {
    const strip = (h: string) => h.replace(/ data-src-(start|end)="\d+"/g, "");
    const withPlugin = renderToStaticMarkup(<MarkdownRenderer content={FIXTURE} />);
    // Same tags and classes in the same order, with the attributes stripped.
    expect(strip(withPlugin)).not.toContain("data-src");
    expect(withPlugin.match(/<\w+/g)).toEqual(strip(withPlugin).match(/<\w+/g));
    expect(withPlugin.match(/class="[^"]*"/g)).toEqual(strip(withPlugin).match(/class="[^"]*"/g));
  });

  it("MDX renderer pipeline", async () => {
    const mdx = "# Hello\n\nSome *text* here.\n\n- one\n";
    const mod = await evaluate(mdx, { ...runtime, rehypePlugins: [rehypeSourcePositions] });
    const Content = mod.default as ComponentType;
    const found = ranges(renderToStaticMarkup(<Content />)).map(([t, s, e]) => [t, mdx.slice(s, e)]);
    expect(found).toEqual([
      ["h1", "# Hello"],
      ["p", "Some *text* here."],
      ["li", "- one"],
    ]);
  });

  it("raw renderer: the whole content is one block", () => {
    const content = "plain\ntext 🎉";
    const found = ranges(renderToStaticMarkup(<RawRenderer content={content} />));
    expect(found).toEqual([["pre", 0, content.length]]);
  });
});
