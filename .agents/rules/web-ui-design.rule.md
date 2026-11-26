---
apiVersion: warp/v1alpha1
kind: Rule
metadata:
  name: web-ui-design
  description: Enforce Saturn Orbital Precision design-system primitives, layouts, and chart ergonomics in Web React views
spec:
  priority: 20
  triggers:
    globs:
      - "apps/web/**/*.tsx"
      - "!apps/web/**/*.test.tsx"
    keywords: [web, ui, design, view, chart, drawer, modal, sheet]
    useWhen: Creating, modifying, or reviewing Web UI views and components under apps/web
---

Follow Saturn's **Orbital Precision** design system ([Design System Charter](docs/conventions/design-system.md) and [Frontend Conventions](docs/conventions/frontend.md)).

### 1. Mirror Reference Views Before Coding
- Before building or redesigning a view, inspect sibling reference views (`apps/web/features/finance/insights-view.tsx`, `apps/web/features/finance/components/budget-card.tsx`, `apps/web/features/finance/borrowing-view.tsx`) and match their card density, typography, iconography, and visual hierarchy.
- Never optimize for minimal JSX line count by stripping visual craft or falling back to unstyled HTML wireframes.

### 2. Canonical Page Shells & Saturn Primitives
- Use `<DocumentPage>` (or `<SplitWorkspacePage>` / `<StudioCanvasPage>`), placing icon tiles in `leading` (left of `<h1>`), status/currency `<Badge>` pills in `badge`, metadata in `description`, and primary/overflow controls in `actions`—never dump loose `<p>` metadata or action rows into the body.
- **Confirmations & Feedback**: Always use `<AlertDialog>` + `toast.add(...)`—never `window.confirm()`, `window.alert()`, or `window.prompt()`.
- **Progress Bars**: Always use a styled `h-2 rounded-full bg-secondary` track + semantic fill with `role="progressbar"` and `aria-valuemin`/`aria-valuemax`/`aria-valuenow`—never native `<progress>`.
- **Navigation Links Beside Buttons**: Render links as `<Button variant="outline" render={<Link ... />} nativeButton={false}>` with a `size-4` Lucide icon—never bare unstyled `<Link>` text.
- **Icons**: Use Lucide `size-4` icons (`ChevronLeft`, `ChevronRight`, `Search`, `Plus`, etc.)—never raw Unicode arrows (`‹`, `›`).
- **Loading, Empty & Error States**: Use `<Skeleton>` layouts (never `<p>Loading...</p>`), `<Empty>` (`EmptyHeader`/`EmptyMedia variant="icon"`), and styled destructive alert banners (`border-destructive/25 bg-destructive/10 text-destructive`).
- **Numbers & Ratios**: Render all currency amounts via `<MoneyAmount>` and apply `font-mono tabular-nums` on every percentage badge, ratio, and axis label.

### 3. Interactive States, Semantic Colors & Charts
- **Segmented Controls**: Every `aria-pressed` toggle group must have an unmistakable active state (`rounded-lg bg-muted/60 p-0.5` track; active `bg-card text-foreground shadow-2xs`, inactive `text-muted-foreground hover:text-foreground`).
- **Semantic Color Intent**: Paying down debt is positive/neutral (`primary`/`success`/`neutral`), never `destructive`; utilization bars escalate (`primary` → `warning` at `>= 75%` → `destructive` at `>= 90%`); over-budget hero figures use `text-destructive`.
- **Charts**: Constrain SVG height (`h-[220px]`–`h-[240px]`), default the inspected point to the **latest observed value** (never index `0`), reset hover on `onMouseLeave`, scope `<linearGradient>` IDs with `useId()`, label every series in the `<output aria-live="polite">` strip, and highlight active bars when interactive.
- **Ledgers**: Debounce search (`useDebounce(..., 300)`) with an inline clear button, group rows by workspace-local day (`useTimezone()`), highlight the row inspected in a side sheet, and append `+` to paginated count badges when `hasNextPage`.

### 4. Code Review Lens
When reviewing Web UI diffs, audit **both** behavioral correctness and full compliance with this rule and `docs/conventions/design-system.md`.
