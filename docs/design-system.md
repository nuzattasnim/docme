# docme Design System

> The complete set of primitives, tokens, and conventions used to build the docme UI. Anything not documented here is a bug — either the design system needs to grow, or the page is doing too much.

---

## 1. Stack

| Layer         | Library                                                           |
| ------------- | ----------------------------------------------------------------- |
| Framework     | React 19 + React Router v7 (file-less routes)                     |
| Styling       | Tailwind CSS 3 + shadcn/ui primitives + Radix UI (under the hood) |
| Theming       | Custom `<ThemeProvider>` (light / dark / system) + CSS variables  |
| Notifications | `sonner` toasts                                                   |
| Data fetching | TanStack Query v5                                                 |
| State         | Zustand (`auth-store`, `recent-docs`)                             |
| Icons         | `lucide-react`                                                    |

---

## 2. Design tokens

All colors, radii, and theme values are CSS variables in `src/index.css`. They flip automatically when the `.dark` class is on `<html>`.

### 2.1 Colors

| Token                  | Light     | Dark      | Used for                    |
| ---------------------- | --------- | --------- | --------------------------- |
| `--background`         | white     | slate-950 | App background              |
| `--foreground`         | slate-950 | slate-50  | Primary text                |
| `--card`               | white     | slate-950 | Card surfaces               |
| `--card-foreground`    | slate-950 | slate-50  | Card text                   |
| `--primary`            | slate-950 | slate-50  | Primary buttons, links      |
| `--primary-foreground` | slate-50  | slate-950 | Text on primary             |
| `--secondary`          | slate-100 | slate-800 | Secondary buttons           |
| `--muted`              | slate-100 | slate-800 | Skeletons, subdued surfaces |
| `--muted-foreground`   | slate-500 | slate-400 | Secondary text              |
| `--accent`             | slate-100 | slate-800 | Hover/focus backgrounds     |
| `--accent-foreground`  | slate-950 | slate-50  | Text on accent              |
| `--destructive`        | red-600   | red-900   | Destructive buttons, alerts |
| `--border`             | slate-200 | slate-800 | Borders, separators         |
| `--input`              | slate-200 | slate-800 | Input borders               |
| `--ring`               | slate-950 | slate-50  | Focus ring                  |
| `--radius`             | 0.5rem    | —         | Base border radius          |

### 2.2 Spacing rhythm

Stick to this 4-step scale:

| Class                 | Pixels | Use                           |
| --------------------- | ------ | ----------------------------- |
| `gap-1` / `space-y-1` | 4      | Tight stacking (badges, tags) |
| `gap-2` / `space-y-2` | 8      | Between related form fields   |
| `gap-4` / `space-y-4` | 16     | Between sections in a card    |
| `gap-6` / `space-y-6` | 24     | Between cards                 |
| `gap-8` / `space-y-8` | 32     | Between page-level regions    |

### 2.3 Container widths

| Context           | Class                     | Pixel target |
| ----------------- | ------------------------- | ------------ |
| App shell         | `h-screen w-screen`       | viewport     |
| Page content      | `mx-auto max-w-screen-xl` | 1280         |
| Wide form / table | `mx-auto max-w-3xl`       | 768          |
| Article reading   | `max-w-prose`             | 65ch (~ 672) |
| Login / auth      | `max-w-sm`                | 384          |

### 2.4 Typography

| Role            | Class                                                                                    |
| --------------- | ---------------------------------------------------------------------------------------- |
| Page H1         | `text-2xl font-semibold`                                                                 |
| CardTitle       | `text-lg font-semibold`                                                                  |
| Section eyebrow | `text-xs font-medium uppercase tracking-wide text-muted-foreground`                      |
| Body            | `text-sm leading-relaxed`                                                                |
| Code inline     | `<code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">`                      |
| Code block      | `<pre className="max-h-[70vh] overflow-auto rounded-md bg-muted p-4 font-mono text-xs">` |

---

## 3. Primitives — `src/components/ui/`

All built on Radix UI where applicable. Every primitive is wrapped in `React.forwardRef` and exports a `displayName`.

| Primitive                                                                                  | File                | Underlying                                                             |
| ------------------------------------------------------------------------------------------ | ------------------- | ---------------------------------------------------------------------- |
| `<Button>`                                                                                 | `button.tsx`        | Radix Slot + CVA (6 variants × 4 sizes)                                |
| `<Input>`                                                                                  | `input.tsx`         | native `<input>`                                                       |
| `<Textarea>`                                                                               | `textarea.tsx`      | native `<textarea>`                                                    |
| `<Label>`                                                                                  | `label.tsx`         | Radix Label                                                            |
| `<Card>` (+ `CardHeader` / `CardTitle` / `CardDescription` / `CardContent` / `CardFooter`) | `card.tsx`          | composition                                                            |
| `<Badge>`                                                                                  | `badge.tsx`         | CVA (8 variants incl. bespoke `published`/`draft`/`active`/`inactive`) |
| `<Skeleton>`                                                                               | `skeleton.tsx`      | `animate-pulse`                                                        |
| `<Alert>` (+ `AlertTitle` / `AlertDescription`)                                            | `alert.tsx`         | composition                                                            |
| `<Separator>`                                                                              | `separator.tsx`     | Radix Separator                                                        |
| `<Avatar>` (+ `AvatarImage` / `AvatarFallback`)                                            | `avatar.tsx`        | Radix Avatar                                                           |
| `<Select>` (+ `SelectTrigger` / `SelectContent` / `SelectItem` / …)                        | `select.tsx`        | Radix Select                                                           |
| `<Tabs>` (+ `TabsList` / `TabsTrigger` / `TabsContent`)                                    | `tabs.tsx`          | Radix Tabs                                                             |
| `<Switch>`                                                                                 | `switch.tsx`        | Radix Switch                                                           |
| `<Tooltip>` (+ `TooltipProvider` / `TooltipTrigger` / `TooltipContent`)                    | `tooltip.tsx`       | Radix Tooltip                                                          |
| `<Popover>` (+ `PopoverTrigger` / `PopoverContent`)                                        | `popover.tsx`       | Radix Popover                                                          |
| `<DropdownMenu>` (full set)                                                                | `dropdown-menu.tsx` | Radix DropdownMenu                                                     |
| `<ScrollArea>` (+ `ScrollBar`)                                                             | `scroll-area.tsx`   | Radix ScrollArea                                                       |
| `<Sheet>` (+ `SheetTrigger` / `SheetContent` / `SheetTitle` / …)                           | `sheet.tsx`         | Radix Dialog                                                           |
| `<Dialog>` (legacy, custom)                                                                | `dialog.tsx`        | none — used by `AddPageModal`                                          |

---

## 4. Layout — `src/components/layout/`

| Component                   | File                  | Role                                                                                      |
| --------------------------- | --------------------- | ----------------------------------------------------------------------------------------- |
| `<AppShell>`                | `app-shell.tsx`       | Auth-gated wrapper for every authenticated route. Renders sidebar + topbar + `<Outlet />` |
| `<AppSidebar>`              | `app-sidebar.tsx`     | Persistent left nav: primary links, scrollable Recent docs, ThemeToggle                   |
| `<AppTopbar>`               | `app-topbar.tsx`      | Header strip: breadcrumbs, theme toggle, user menu                                        |
| `<Breadcrumbs>`             | `breadcrumbs.tsx`     | Auto-derived trail from `useLocation` + recent-docs cache                                 |
| `<UserMenu>`                | `user-menu.tsx`       | Avatar dropdown: profile / settings / sign out                                            |
| `<ThemeProvider>`           | `theme-provider.tsx`  | Light / dark / system theme via `localStorage` + matchMedia                               |
| `<ThemeToggle>`             | `theme-toggle.tsx`    | Dropdown that flips the theme                                                             |
| `<StatusBadge>`             | `status-badge.tsx`    | Typed wrapper over `<Badge>` for DocVersion state pills                                   |
| `<EmptyState>`              | `empty-state.tsx`     | Reusable icon + title + description + CTA block                                           |
| `<RouteLoading>`            | `route-loading.tsx`   | Generic skeleton fallback for route transitions                                           |
| `<ConfirmPopover>`          | `confirm-popover.tsx` | Replacement for `window.confirm()` — Popover-based confirmation                           |
| `<Toaster>` (from `sonner`) | wired in `main.tsx`   | Global toast notifications                                                                |

---

## 5. Conventions

### 5.1 Page composition

A page inside `<AppShell>` is **never** a `<main>` and **never** centers itself vertically. The shell owns vertical layout. A page is just the content area:

```tsx
export function MyPage() {
	return (
		<div className="mx-auto max-w-3xl space-y-6">
			<header>...</header>
			<Card>...</Card>
		</div>
	);
}
```

### 5.2 Loading

Use `<Skeleton>` sized to the eventual content:

```tsx
<Skeleton className="h-24 w-full" />
```

Use `<RouteLoading />` only when the page is the route's loading element (Suspense fallback). Use `<Skeleton>` blocks inline when a region is loading.

### 5.3 Errors

- **Block-level** errors → `<Alert variant="destructive">` inside the page.
- **Transient** mutation errors → `toast.error("…")` plus the inline alert if the user needs the message visible.

### 5.4 Empty states

Always use `<EmptyState>`, never a centered `<p>`:

```tsx
<EmptyState
	icon={<FileText className="h-10 w-10" />}
	title="No docs yet"
	description="Create your first doc above."
/>
```

### 5.5 Confirmations

Always use `<ConfirmPopover>`, never `window.confirm()`:

```tsx
<ConfirmPopover
	trigger={
		<Button variant="ghost" size="sm">
			Delete
		</Button>
	}
	title="Delete this doc?"
	description="Removes the Doc record only."
	confirmLabel="Delete"
	destructive
	onConfirm={() => onDelete(itemId)}
/>
```

### 5.6 Mutations

Every mutation must:

1. Show success → `toast.success("Doc saved")`
2. On error → `toast.error(err.message)` + inline `<Alert>` if the user is still on the page
3. Reset local form state on success

### 5.7 Icons

- Always from `lucide-react`
- Standard sizes: `h-4 w-4` (inline in buttons/labels), `h-5 w-5` (topbar buttons), `h-10 w-10` (empty-state icons), `h-12 w-12` (large hero)
- Stroke width is the default (2) — no need to specify

### 5.8 Hover / focus

- Hover background: `hover:bg-accent` or `hover:bg-accent/60` for subtle hover
- Focus ring: `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`
- Disabled: `disabled:opacity-50 disabled:pointer-events-none`

---

## 6. Forbidden patterns

These will be flagged in code review:

| Pattern                                                                                                       | Why                                           |
| ------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `<main className="min-h-screen items-center justify-center">` outside `/login` + `/callback`                  | The shell handles layout                      |
| `rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring` | Use `<Input>` or `<Textarea>`                 |
| `rounded-lg border bg-card p-N shadow-sm` outside `<Card>`                                                    | Use `<Card>`                                  |
| `<p>Loading…</p>`                                                                                             | Use `<Skeleton>`                              |
| `<p className="text-destructive">{error}</p>` for block errors                                                | Use `<Alert variant="destructive">`           |
| `window.confirm()`                                                                                            | Use `<ConfirmPopover>`                        |
| Inline `border-emerald-500/40 bg-emerald-500/10 text-emerald-700` for state pills                             | Use `<StatusBadge status="published" />` etc. |
| Page file > 200 lines (data-gateway glue excepted)                                                            | Split into focused components                 |
| Missing `toast.success`/`toast.error` on a mutation                                                           | Add it                                        |

---

## 7. Adding a new primitive

1. Drop a Radix-based file in `src/components/ui/` (follow the existing file naming)
2. Re-export from this doc
3. Use `React.forwardRef`, `displayName`, and `cn()` for className composition
4. Default to inheriting the docme theme — no hard-coded colors
5. Wire it into `docs/design-system.md` and the Forbidden-patterns list

---

**Last updated:** 2026-08-07
