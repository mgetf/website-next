# RFC: UI Component Centralization & Design Token System

**Author:** Development Team  
**Date:** March 13, 2026  
**Status:** 📋 Proposed  
**Priority:** Medium (quality-of-life, long-term maintainability)

---

## Summary

The codebase has grown to 36+ route pages with no centralized design tokens and no shared components for the most repeated UI patterns (buttons, cards, badges). Tailwind classes are written inline everywhere, with long class strings (100-170+ characters) duplicated across files. The site has an implicit visual identity — orange for the mge.tf brand, blue for 2v2, purple for 1v1 — but it was never formalized, causing color drift and inconsistencies.

This proposal defines a phased plan to introduce a semantic color system (including format-aware tokens) via Tailwind v4's `@theme` directive and a small set of base UI components to replace the most common duplicated patterns.

---

## Problems Identified

### 1. No Design Tokens

There is no `@theme` block, no CSS custom properties, and no Tailwind config defining semantic colors. The only contents of `app.css` beyond `@import "tailwindcss"` are scrollbar styles and a toast animation. Every color decision is made ad-hoc at the point of use.

**Impact:**
- Changing the primary brand color requires finding and updating 60+ files
- No single source of truth for "what is our primary color?" or "what shade is a card background?"

### 2. No Color Identity System — Three Colors Used Without Rules

Orange, blue, and indigo are all used for primary action buttons depending on the page, with no documented rule for which to use when:

| Context | Color | Files |
|---------|-------|-------|
| User-facing actions (signup, team edit, join) | Orange (`bg-orange-600`) | Navigation, signup, teams/edit, 2v2/create |
| Admin actions (invite, copy, dashboard) | Blue (`bg-blue-600`) | admin/+page, teams/[id] (invite), users, matches/[id] |
| Tournaments | Indigo (`bg-indigo-600`) | tournaments/+page |

The implicit intent (discovered through codebase audit) is actually a format-based color system that was never formalized:
- **Orange** = mge.tf brand / format-neutral actions
- **Blue** = 2v2 format identity (homepage 2v2 card, 2v2 league pages)
- **Purple** = 1v1 format identity (homepage 1v1 card, 1v1 league pages, user profile 1v1 sections)

But because this was never documented, blue leaked into admin pages as a generic action color (it should be orange), and indigo was used on the tournaments page arbitrarily.

**Known bug:** The tournaments page (`/tournaments`) has format badge colors **swapped** — 1v1 badges are blue and 2v2 badges are purple, which is the opposite of the rest of the site.

### 3. Inconsistent Focus Ring Colors

| Color | Approx. Count | Where |
|-------|---------------|-------|
| `focus:ring-orange-500` | ~35 | Most forms and inputs |
| `focus:ring-blue-500` | ~15 | Admin matches, admin site, pending-players, RulebookTOC |
| `focus:ring-indigo-500` | ~15 | Tournaments page |
| `focus:ring-red-500` | ~5 | Danger inputs |

### 4. Status Color Family Conflict

Toasts use `emerald` for success and `amber` for warning. The rest of the app uses `green` for success and `yellow` for warning.

| Status | Toasts | Everywhere else |
|--------|--------|-----------------|
| Success | `emerald-400` | `green-400` / `green-500` |
| Warning | `amber-400` | `yellow-400` / `yellow-500` |
| Error | `red-400` | `red-400` / `red-500` |
| Info | `blue-400` | `blue-400` / `blue-500` |

### 5. gray vs zinc for Text

`text-gray-400` and `text-zinc-400` are used interchangeably for secondary text. Placeholder text alternates between `placeholder-gray-500` and `placeholder-gray-600`.

### 6. No Button Component (~65+ Inline Instances)

Primary, secondary, and danger button styles are written inline across the entire codebase. Examples of the same pattern repeated:

```
bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors
```

```
bg-orange-600 hover:bg-orange-500 disabled:bg-orange-600/50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors
```

```
bg-zinc-800 hover:bg-zinc-700 text-gray-300 rounded-lg font-medium transition-colors
```

Approximate counts: ~30 primary (blue/orange), ~25 secondary (zinc), ~10 danger (red).

### 7. No Card Component (~40+ Inline Instances)

The card container pattern `bg-zinc-900 border border-zinc-800 rounded-lg` (with minor variations in padding, backdrop-blur, opacity) appears 40+ times across route files.

### 8. No Badge Component (~100+ Inline Instances)

Status badge pattern `bg-{color}-500/20 text-{color}-400 border border-{color}-500/30` is repeated 100+ times with various color families (green, red, yellow, blue, purple, orange).

### 9. Hardcoded Hex Values

`app.css`, `MarkdownRenderer.svelte`, and `LoadingBar.svelte` use raw hex values (`#3f3f46`, `#18181b`, `#3b82f6`, etc.) instead of Tailwind classes or theme tokens.

---

## Current Shared Component State

### Components that work well (keep as-is)

| Component | Imported in | Notes |
|-----------|-------------|-------|
| DataTable | 14 route files | Well-adopted, good API |
| Dialog | 6 route files | Base modal, used correctly |
| Paginator | (via DataTable) | Works, no direct issues |
| SearchInput | 4 route files | Reasonable adoption |
| SelectFilter | 5 route files | Reasonable adoption |
| Toast/ToastContainer | (layout) | Works fine |

### Components with low adoption

| Component | Imported in | Raw equivalent in |
|-----------|-------------|-------------------|
| FormInput | 5 files | ~18 files use raw `<input>` |
| FormSelect | 7 files | ~18 files use raw `<select>` |
| ConfirmDialog | 1 file | Several pages likely need confirm flows |

### Dead code

| Component | Imported in | Action |
|-----------|-------------|--------|
| FormDialog | 0 route files | Delete |

---

## Proposed Solution

### Phase 1: Design Tokens (app.css)

Define semantic color tokens using Tailwind v4's `@theme` directive. This has **zero breaking impact** — all existing Tailwind classes continue to work. It simply adds new semantic class names.

#### Resolved decisions

1. **Primary brand color:** Orange. This is the mge.tf identity color, used for all format-neutral actions (navigation CTA, generic form submits, admin buttons, links). Blue and indigo are **not** generic primary colors.
2. **Format colors:** Blue = 2v2, Purple = 1v1. These are used only in contexts where format distinction matters (league cards, signup flows, format-specific page sections, format badges).
3. **Event colors (tournaments, fight nights, world championship):** Neutral gray for now. No accent color assigned yet — these features are under a separate overhaul proposal and don't need a premature color identity.
4. **Focus ring:** `focus:ring-primary-500` (orange) everywhere, except `focus:ring-danger-500` (red) for destructive inputs.
5. **Status family:** `green`/`red`/`yellow`/`blue` everywhere. Drop `emerald` and `amber` from toasts to match the rest of the app.
6. **Text color family:** `gray-*` exclusively. Drop `text-zinc-*` for text, `placeholder-gray-500` everywhere.
7. **Admin pages:** Same brand color (orange) as user-facing pages. No separate admin accent.

#### Proposed token structure

Two categories of tokens: **shared** (used across the entire site regardless of context) and **format-specific** (used only when visually distinguishing between formats).

```css
@theme {
  /* ── Brand (mge.tf identity, format-neutral) ── */
  --color-primary-400: var(--color-orange-400);
  --color-primary-500: var(--color-orange-500);
  --color-primary-600: var(--color-orange-600);

  /* ── Format: 2v2 ── */
  --color-format-2v2-400: var(--color-blue-400);
  --color-format-2v2-500: var(--color-blue-500);
  --color-format-2v2-600: var(--color-blue-600);

  /* ── Format: 1v1 ── */
  --color-format-1v1-400: var(--color-purple-400);
  --color-format-1v1-500: var(--color-purple-500);
  --color-format-1v1-600: var(--color-purple-600);

  /* ── Surfaces ── */
  --color-surface-page: var(--color-zinc-950);
  --color-surface-card: var(--color-zinc-900);
  --color-surface-input: var(--color-zinc-800);
  --color-surface-hover: var(--color-zinc-700);

  /* ── Borders ── */
  --color-border-default: var(--color-zinc-800);
  --color-border-input: var(--color-zinc-700);

  /* ── Text ── */
  --color-text-heading: var(--color-white);
  --color-text-body: var(--color-gray-400);
  --color-text-label: var(--color-gray-300);
  --color-text-muted: var(--color-gray-500);

  /* ── Status ── */
  --color-success-400: var(--color-green-400);
  --color-success-500: var(--color-green-500);
  --color-success-600: var(--color-green-600);
  --color-danger-400: var(--color-red-400);
  --color-danger-500: var(--color-red-500);
  --color-danger-600: var(--color-red-600);
  --color-warning-400: var(--color-yellow-400);
  --color-warning-500: var(--color-yellow-500);
  --color-warning-600: var(--color-yellow-600);
  --color-info-400: var(--color-blue-400);
  --color-info-500: var(--color-blue-500);
  --color-info-600: var(--color-blue-600);
}
```

**Shared tokens** enable classes like `bg-surface-card`, `text-text-body`, `border-border-default`, `bg-primary-600`. These are used everywhere regardless of format context.

**Format tokens** enable classes like `bg-format-2v2-600`, `text-format-1v1-400`, `border-format-2v2-500`. These are used only in contexts that need to visually distinguish between 1v1 and 2v2 — league cards, signup flows, format badges, format-specific page sections. Most of the site does not need them.

**Events (tournaments, fight nights, world championship)** intentionally have no accent token yet. They use the shared surface/text/border tokens with neutral gray styling until a color identity is decided. This avoids a premature color choice for features still under separate redesign.

### Phase 2: Core Components

Three new components, kept deliberately minimal.

#### Button.svelte

Props: `variant` (primary | secondary | danger | success | ghost), `size` (sm | md | lg), `disabled`, `type`, standard HTML button attributes.

Replaces: ~65 inline button style patterns.

#### Card.svelte

Props: `padding` (sm | md | lg | none), optional snippet for header/footer sections.

Replaces: ~40 inline `bg-zinc-900 border border-zinc-800 rounded-lg` containers.

#### Badge.svelte

Props: `color` (green | red | yellow | blue | purple | orange | zinc), `size` (sm | md).

Replaces: ~100 inline `bg-{color}-500/20 text-{color}-400` badge patterns.

### Phase 3: Migration

Migrate existing pages to use the new components and tokens. One page at a time, prioritized by traffic/complexity.

**This is the critical phase.** Creating components without migrating is how the current half-adopted state happened.

### Phase 4: Cleanup

- Delete `FormDialog.svelte` (unused)
- Replace hex values in `app.css`, `MarkdownRenderer.svelte`, `LoadingBar.svelte` with theme tokens
- Align Toast.svelte to use `success`/`warning`/`danger`/`info` tokens instead of `emerald`/`amber`

---

## Migration Strategy

### Verification approach

AI cannot be trusted to find all instances or confirm completeness. Migration must be verified mechanically.

#### Step 1: Establish baseline counts

Before any migration, run broad searches to get exact counts of patterns that should eventually disappear from route files:

```powershell
# Buttons — any colored bg that should become Button component or use tokens
Select-String -Path src\routes\**\*.svelte -Pattern "bg-blue-600" | Measure-Object
Select-String -Path src\routes\**\*.svelte -Pattern "bg-orange-600" | Measure-Object
Select-String -Path src\routes\**\*.svelte -Pattern "bg-red-600" | Measure-Object
Select-String -Path src\routes\**\*.svelte -Pattern "bg-green-600" | Measure-Object
Select-String -Path src\routes\**\*.svelte -Pattern "bg-indigo-600" | Measure-Object
Select-String -Path src\routes\**\*.svelte -Pattern "bg-purple-600" | Measure-Object

# Cards
Select-String -Path src\routes\**\*.svelte -Pattern "bg-zinc-900 border border-zinc-800 rounded" | Measure-Object

# Badges
Select-String -Path src\routes\**\*.svelte -Pattern "bg-.*-500/20 text-.*-400" | Measure-Object

# Inconsistent text colors (zinc used for text instead of gray)
Select-String -Path src\routes\**\*.svelte -Pattern "text-zinc-[3-5]00" | Measure-Object

# Focus ring inconsistencies (should all be primary or danger)
Select-String -Path src\routes\**\*.svelte -Pattern "focus:ring-blue-500" | Measure-Object
Select-String -Path src\routes\**\*.svelte -Pattern "focus:ring-indigo-500" | Measure-Object
```

Record these numbers. They are the ground truth.

#### Step 2: Migrate one file at a time

For each file, AI performs the replacement. After each file, re-run the same searches and confirm the count decreased by the expected amount.

#### Step 3: Final verification

After all migrations, the following should return zero results in `src/routes/`:

```powershell
# No raw colored action buttons in routes (only inside Button.svelte)
Select-String -Path src\routes\**\*.svelte -Pattern "bg-(blue|orange|indigo|purple)-600"

# No raw card containers in routes (only inside Card.svelte)
Select-String -Path src\routes\**\*.svelte -Pattern "bg-zinc-900 border border-zinc-800 rounded-lg"

# No emerald/amber in toasts
Select-String -Path src\lib\components\ui\Toast.svelte -Pattern "emerald|amber"

# No inconsistent focus rings
Select-String -Path src\routes\**\*.svelte -Pattern "focus:ring-(blue|indigo)-500"

# No zinc for text
Select-String -Path src\routes\**\*.svelte -Pattern "text-zinc-[3-5]00"
```

Some searches (like `bg-red-600` or `bg-purple-600`) may have legitimate non-button hits in format-specific contexts. Those are reviewed manually — but the set will be small and finite.

#### Step 4: Prevent regression

Add a Cursor rule (`.cursor/rules/use-shared-components.mdc`) that instructs AI to always use `Button`, `Card`, and `Badge` instead of inline styles.

Optionally, add a CI script that fails if raw color patterns appear in new route files.

---

## Priority Order

| # | Task | Effort | Impact |
|---|------|--------|--------|
| 1 | Define `@theme` tokens in `app.css` | ~30 min | Foundation for everything else |
| 2 | Build `Button.svelte` | ~1 hr | Eliminates most duplication |
| 3 | Build `Badge.svelte` | ~30 min | Highest instance count (~100) |
| 4 | Build `Card.svelte` | ~30 min | Simplifies layout patterns |
| 5 | Migrate high-traffic pages | ~2-3 hrs | Immediate consistency improvement |
| 6 | Migrate remaining pages | ~3-4 hrs | Full consistency |
| 7 | Fix Toast/hex/text-zinc inconsistencies | ~1 hr | Polish |
| 8 | Delete FormDialog, add Cursor rule | ~15 min | Prevent regression |

