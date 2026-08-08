# docme Feature Roadmap — `/docs/:docId` enhancements

> Six follow-on tasks to the UI redesign. Each task is broken down with: current state, target state, files touched, dependencies, and effort. Order matters — later tasks depend on the page-level layout from earlier ones.

---

## Task 1 — Page content: left-aligned, not centered

**Current state**

The grid `md:grid-cols-[260px_1fr]` puts the pages sidebar at 260 px and the page-content card in the remaining column. Inside the card, the MarkdownRenderer fills the column width — for very wide columns, the body text spans 800+ px which hurts readability, and any visual centering of sub-elements within the card looks "floating in the middle".

**Target state**

- The grid uses `items-start` so columns don't stretch to equal heights
- The page-content card stays left-aligned within its column
- The Markdown renderer constrains its body to `max-w-prose` (~65ch) and the section headings + TOC can stretch wider
- No element inside the page uses `mx-auto` for centering

**Files touched**

- `src/features/docs/doc-detail-page.tsx` — add `items-start` to the grid; remove any `mx-auto` inside
- `src/features/docs/content-renderers/markdown.tsx` — wrap the `<div className="doc-md …">` with `max-w-prose` (the headings can stay outside this constraint so they can stretch when a TOC is present later, see Task 6)
- `src/features/docs/content-renderers/raw.tsx` — same `max-w-prose` treatment

**Effort:** ~15 min

---

## Task 2 — Doc header: back button + edit (pen) button

**Current state**

The doc header in `doc-detail-page.tsx` is a plain two-line block:

```tsx
<div className="flex flex-col gap-1">
  <h1>{doc.Name}</h1>
  <span>{doc.Description}</span>
</div>
```

No navigation, no inline edit affordance. The unused `<DocForm>` is imported but never rendered.

**Target state**

3-column header inside the page:

```
[← Back]   Mock Doc                              [✎]
           Mock doc containing 3 mock pages.
```

- **Back button** (`ghost` icon): navigates to `/docs`
- **Title + description** in the middle (existing)
- **Pen button** (`ghost` icon, tooltip "Edit doc details"): opens `<EditDocModal>`

The `<EditDocModal>` reuses the field-level logic from the existing `<DocForm>` (name + description inputs, dirty tracking, save mutation). Plan: extract a shared `<DocFormFields doc onSave saving />` so both the inline Card form (if we ever bring it back) and the modal share behavior.

**New file**

- `src/features/docs/components/edit-doc-modal.tsx`
  - Wraps the existing custom `<Dialog>` (from `src/components/ui/dialog.tsx`)
  - Uses the same `<Input>` / `<Textarea>` primitives
  - Calls the parent's `onSaveDoc` handler (which we'll un-comment)
  - Closes on success, shows toast + `<Alert variant="destructive">` on error

**Files touched**

- `src/features/docs/doc-detail-page.tsx` — restructure the header to 3 columns; un-wire `onSaveDoc`; open the modal on pen click
- `src/features/docs/components/doc-form.tsx` — extract `<DocFormFields>` so the modal can use the same input behavior without the Card chrome

**Effort:** ~1 hour

---

## Task 3 — Pages sidebar: two icon buttons (Add + Organize)

**Current state**

The sidebar header has a single full-width `<Button>+ Add Page</Button>`.

**Target state**

```
PAGES (4)                              [+]  [⇅]
```

- Replace the wide button with **two icon-only buttons** (`size="icon"`, `variant="ghost"`)
- Wrap each in a `<Tooltip>` (via the existing `<TooltipProvider>` we'll mount inside the page)
- **`+`** (`Plus` icon): tooltip "Add page" — triggers `<AddPageModal.Trigger>` (already exists)
- **`⇅`** (`ArrowUpDown` from lucide): tooltip "Reorder pages" — opens `<ReorderPagesModal>` (Task 4)
- The "↑ / ↓" arrows on each row in the list can stay (quick nudge) but the new modal is the canonical reorder UX

**Files touched**

- `src/features/docs/components/page-list-sidebar.tsx` — swap the single button for the two icon buttons wrapped in `<Tooltip>`

**Dependencies**

- None — all primitives exist (Tooltip, Button, Plus/ArrowUpDown icons)

**Effort:** ~30 min

---

## Task 4 — Reorder Pages modal (drag-and-drop)

**Current state**

Reordering only via `↑ / ↓` buttons on each row. Each click triggers an individual `updateVersion` mutation (round-trip per move).

**Target state**

A modal opens showing the same pages as a drag-and-drop list. Drop a row in a new position, hit **Save**, and one `updateVersion` mutation persists the whole new order. **Cancel** discards local changes.

```
┌─ Reorder pages ────────────────────────────────────┐
│ Drag the rows to set the new order.               │
│                                                   │
│ �⋮ 1. To Do                                       │
│ ⋮⋮ 2. Getting Started                             │
│ ⋮⋮ 3. Meeting Notes          ←── dragged here    │
│ ⋮⋮ 4. Storybook - Component Documentation         │
│                                                   │
│                              [Cancel]  [Save]      │
└───────────────────────────────────────────────────┘
```

**New file**

- `src/features/docs/components/reorder-pages-modal.tsx`
  - Wraps the existing custom `<Dialog>`
  - Uses `@dnd-kit/core` `DndContext` + `@dnd-kit/sortable` `SortableContext` with `verticalListSortingStrategy`
  - Per-row: `useSortable` → drag handle (grip dots via `GripVertical` lucide icon)
  - Local state: `Array.from(pageIds)` — mutated on drop via `arrayMove`
  - On **Save**: `updateVersion.mutateAsync({ Pages: orderedIds })` + toast + close
  - On **Cancel**: reset to original `pageIds` + close
  - Empty state: same `<EmptyState>` primitive

**Dependencies to add**

```
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

**Files touched**

- `src/features/docs/doc-detail-page.tsx` — provide an `onReorderPages` handler that the modal calls with the new array
- `package.json` + `package-lock.json` (auto)

**Effort:** ~2 hours (including the drag-and-drop learning curve if you've never used dnd-kit)

---

## Task 5 — Edit Page modal (pencil on page content)

**Current state**

`<PageContentView>` only has a **Delete** button in the card header. No way to edit a page's title, content type, or content without going to the raw CRUD layer.

**Target state**

Add an **Edit** button next to Delete in the page-content header:

```
┌─────────────────────────────────────┐
│ Storybook — Component Documentation │   [✎ Edit] [🗑 Delete]
│ ContentType: md · created 8/7/2026  │
└─────────────────────────────────────┘
```

Clicking **Edit** opens `<EditPageModal>`:

```
┌─ Edit page ──────────────────────────────────────┐
│ Title:    [Storybook — Component Documentation]  │
│ Type:     [md ▾]                                 │
│ Content:                                            │
│ ┌─────────────────────────────────────────────┐  │
│ │ # Component Documentation                     │  │
│ │ ## Accordion                                  │  │
│ │ …                                             │  │
│ └─────────────────────────────────────────────┘  │
│                                  [Cancel]  [Save] │
└──────────────────────────────────────────────────┘
```

**New file**

- `src/features/docs/components/edit-page-modal.tsx`
  - Wraps the existing custom `<Dialog>`
  - Fields: Title (`<Input>`), ContentType (raw `<select>` styled to match `<Select>`), Content (`<Textarea rows={20}>`)
  - Dirty tracking: enables **Save** only when something changed
  - On save: `useUpdatePage()` mutation → toast.success + close + cache invalidates via existing hooks
  - On error: toast.error + inline `<Alert variant="destructive">`
  - Re-seed state when `page.ItemId` changes (so navigating to another page doesn't show stale content)

**Files touched**

- `src/features/docs/components/page-content-view.tsx` — add the **Edit** button; open the modal; pass `onSave` callback

**Effort:** ~1.5 hours

---

## Task 6 — Auto-detect sections + right-side TOC

**Current state**

Pages can be long. There's no way to see the structure or jump to a section.

**Target state**

- Parse the markdown source for `## …` and `### …` headings
- Render a sticky right-side TOC (only when ≥ 1 heading exists)
- Each TOC entry is a button that smoothly scrolls to its heading and briefly highlights it

```
┌─ PAGES ──┐ ┌─ Storybook ────────┐ ┌─ On this page ──┐
│ 1 To Do  │ │ # Storybook …      │ │ • Accordion       │
│ 2 Get …  │ │ ## Accordion       │ │ • AlertDialog     │
│ 3 Meet … │ │ …                  │ │ • Button          │
│ 4 Story… │ │ ## AlertDialog     │ │                   │
└──────────┘ │ …                  │ └───────────────────┘
              └────────────────────�
```

**Layout**

New grid on wide screens: `md:grid-cols-[260px_minmax(0,1fr)_220px]`. The TOC column collapses on `<md` (stacks below content).

**New files**

- `src/lib/slugify.ts` — slugifies heading text to `kebab-case`. Pure function, easy to test.
- `src/features/docs/components/page-toc.tsx`
  - Takes `sections: Array<{ id, level, text }>`
  - Renders a sticky `<aside>` with `<nav>` + `<ol>` of clickable buttons
  - `onClick` → `document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })` + brief highlight ring
  - Empty state: renders nothing (parent hides the column)

**Files touched**

- `src/features/docs/content-renderers/markdown.tsx` — override `h2` and `h3` components to inject `id={slugify(text)}`
- `src/features/docs/components/page-content-view.tsx` — compute `sections` via `extractSections(page.Content)`, render `<PageToc>` to the right of the card
- `src/features/docs/doc-detail-page.tsx` — change grid to 3 columns when `sections.length > 0`

**Helper logic** (`src/lib/slugify.ts`)

```ts
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")      // strip punctuation
    .trim()
    .replace(/\s+/g, "-")          // spaces → dashes
    .replace(/-+/g, "-");          // collapse multiple dashes
}

const HEADING_RE = /^(#{2,3})\s+(.+)$/gm;
export function extractSections(
  markdown: string | null | undefined,
): Array<{ id: string; level: 2 | 3; text: string }> {
  if (!markdown) return [];
  const out: Array<{ id: string; level: 2 | 3; text: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = HEADING_RE.exec(markdown)) !== null) {
    const level = m[1].length as 2 | 3;
    const text = m[2].trim();
    out.push({ id: slugify(text), level, text });
  }
  return out;
}
```

**Effort:** ~2 hours

---

## Dependency summary

| Package | Why | Tasks |
|---|---|---|
| `@dnd-kit/core` | Drag-and-drop primitives | 4 |
| `@dnd-kit/sortable` | Sortable list on top of dnd-kit | 4 |
| `@dnd-kit/utilities` | CSS transform helpers (`arrayMove`, `CSS.Transform.toString`) | 4 |

Total: 3 new packages.

---

## Effort summary

| Task | Effort |
|---|---|
| 1. Page content alignment | 15 min |
| 2. Doc header back + pen | 1 hour |
| 3. Pages sidebar icon buttons | 30 min |
| 4. Reorder Pages modal (dnd-kit) | 2 hours |
| 5. Edit Page modal | 1.5 hours |
| 6. Sections + TOC | 2 hours |
| **Total** | **~7 hours** |

---

## Suggested implementation order

1. **Task 1** — quickest win, unblocks the layout for 3, 6
2. **Task 3** — small, sets up the `<Tooltip>` usage needed by 5/6 too
3. **Task 2** — straightforward modal, unblocks the doc-level interaction
4. **Task 5** — same modal pattern as 2, smaller surface, useful in isolation
5. **Task 6** — depends on the layout from 1; TOC enhances 5's edit flow
6. **Task 4** — biggest single task (dnd-kit), saved for last so the rest can be reviewed first

---

## Files added / changed

**New files (5)**

```
src/features/docs/components/edit-doc-modal.tsx
src/features/docs/components/reorder-pages-modal.tsx
src/features/docs/components/edit-page-modal.tsx
src/features/docs/components/page-toc.tsx
src/lib/slugify.ts
```

**Modified files (4)**

```
src/features/docs/doc-detail-page.tsx
src/features/docs/components/page-list-sidebar.tsx
src/features/docs/components/page-content-view.tsx
src/features/docs/components/doc-form.tsx            (extract DocFormFields)
src/features/docs/content-renderers/markdown.tsx    (add IDs to h2/h3)
```

---

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| dnd-kit learning curve | Use the official sortable-list example as a starting template; one well-bounded integration point |
| EditPageModal accidentally lets users change `ContentType` to an unknown type | Validate against the registry — fall back to a non-blocking warning if "mdx" is selected without the page being valid MDX |
| TOC scrollIntoView collides with sticky topbar | Compute `scroll-margin-top: 4rem` on `h2`/`h3` so the heading doesn't disappear under the topbar |
| The 3-column layout (260px + 1fr + 220px) is too cramped on 13" laptops | Hide the TOC column at `<lg` and show it inline at the top of the card instead |
| Modal stacking (Edit Page open, then Add Page clicked from a different row) | Use a single shared `<EditPageModal>` instance — only one edit at a time. The pen icon is inside the page-content card, so this isn't a real conflict today |

---

**Last updated:** 2026-08-07
