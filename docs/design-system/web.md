# Saturn Web Design System (`apps/web`)

Visual, spatial, and component specification for Saturn's Web application (React 19, Vite, Tailwind CSS v4, `@base-ui/react`, `cmdk`, Lucide). See [Orbital Precision Foundations](./README.md) for shared color tokens, typography, spacing, and concentric radii.

---

## 1. Application Frame & Spatial Ownership

Desktop screens reserve fixed visual zones so navigation, primary work, entity inspection, and AI assistance coexist cleanly without overlapping backdrops:

```text
┌──────────────┬──────────────────────────────────────────────────────────┬────────────────────┐
│  AppSidebar  │  [≡] | [Space ▾] / Domain / Detail    [Search ⌘K] [AI ⌘J] [AV▾]  (48px Top Bar) │
│   (Left)     ├─────────────────────────────────────┬────────────────────┼────────────────────┤
│              │                                     │                    │                    │
│  Daily Pulse │   <main> Primary Page Shell         │ Tier 3 In-Flow     │ DockedCopilot      │
│  Money       │   (<DocumentPage>,                  │ Inspector Panel    │ Sidebar            │
│  Automation  │    <SplitWorkspacePage>, or         │ (e.g. Transaction  │ (⌘J, Right Edge)   │
│  Admin       │    <StudioCanvasPage>)              │  Events, Run Trace)│                    │
│              │                                     │                    │                    │
│  Settings    │                                     │                    │                    │
└──────────────┴─────────────────────────────────────┴────────────────────┴────────────────────┘
```

### Three-Tier Overlay Model
1. **Tier 1 — Anchored `<Popover>` (Zero Backdrop)**: Lightweight contextual controls anchored to their trigger (`FinancePeriodPicker`, `+ Filter` faceted menus, Calendar `EventPreviewPopover`, `CustomizeDashboardPopover`).
2. **Tier 2 — Centered `<Dialog>` & `<AlertDialog>`**: Focused creation, editing, and destructive confirmation flows (`<FormDrawer />` / `<FormDialog />`, `CreateTransactionSheet`, `EditBudgetSheet`, `AlertDialog`). On mobile web (`< 640px`), `DialogContent` (`mobileFullscreen = true`) expands edge-to-edge (`100dvh`) with safe-area header/footer insets so virtual keyboards never compress form fields; short `<AlertDialog>` confirmations stay centered.
3. **Tier 3 — In-Flow `<WorkspaceInspectorPanel>`**: Deep entity inspection (`TransactionEventsSheet`, `RecurringTransactionHistorySheet`, `RunTraceSheet`) docks side-by-side inside `<main>` on `lg+` viewports (leaving `DockedCopilotSidebar` unobstructed on the right) and expands cleanly to `100dvh` below `lg`.

---

## 2. Canonical Page Shells

Defined in `apps/web/components/ui/page-shells.tsx`.

### `<DocumentPage>` — Scrollable Workspaces & Detail Views
Used by Dashboard, Insights, Accounts, Budgets, Borrowing, Detail Workspaces, Settings, and Admin.

```text
┌─────────────────────────────────────────────────────────────────────────┐
│  [leading / icon]  Page Title  [Badge] [Badge]          [Primary] [···] │
│  Entity metadata · Secondary context / optional notes                   │
├─────────────────────────────────────────────────────────────────────────┤
│  Content stack (gap-6, maxWidth: md | lg | xl | full)                   │
└─────────────────────────────────────────────────────────────────────────┘
```

```tsx
<DocumentPage
  leading={<CategoryIconTile />}   // Left of <h1> (e.g. Budget category tile)
  icon={Landmark}                  // Or monochrome size-5 primary icon
  title={account.name}
  badge={
    <>
      <Badge variant="secondary">{account.currency}</Badge>
      {account.isDefault && <Badge variant="info" dot>{t("...")}</Badge>}
    </>
  }
  description={metadataLine}
  actions={
    <>
      <Button onClick={onRecord}><Plus />{t("...")}</Button>
      <Button variant="outline" onClick={onTransfer}><ArrowLeftRight />{t("...")}</Button>
      <DetailActions items={overflowItems} />
    </>
  }
  maxWidth="xl"
>
  {children}
</DocumentPage>
```

### `<SplitWorkspacePage>` — Master / Detail Streams
Used by Mail, Transactions + Inspector, Review Queue, and AI Chat. Composes an optional `toolbar`, optional `leftRail` (`w-56` on `lg+`), scrollable `listPane` (`md:w-80 lg:w-96`), and fluid `detailPane`.

### `<StudioCanvasPage>` — Full-Bleed Tools
Used by Workflow Editor, Calendar Grid, and Statement Reconciliation. Provides a full-viewport canvas with a slim top bar (`leading`, `status`, `actions`), optional `banner`, and collapsible `inspector` with mobile pane switching.

---

## 3. Core Primitives (`apps/web/components/ui/`)

### Actions & Brand
- **`<Button>`** (`button.tsx`): Concentric `rounded-lg` geometry, `text-sm font-medium`, tactile `1px` top inner specular highlight on `default`, and subtle `translate-y-px` active press feedback.
  - **Variants**: `default` (solid primary CTA), `outline` (`border-border bg-control shadow-2xs`), `secondary` (tonal fill), `ghost` (transparent hover tint), `destructive` (soft crimson tint), `link`.
  - **Sizes**: `xs` (`h-6`), `sm` (`h-8`), `default` (`h-9`, aligns flush with `h-9` toolbars), `lg` (`h-10`), and square icon buttons (`icon-xs`, `icon-sm`, `icon`, `icon-lg`).
  - **Link Composition**: Pass `render={<Link to={...} />} nativeButton={false}` on `<Button variant="outline">` when a navigation link sits beside action buttons.
- **`<SaturnMark>`** (`saturn-mark.tsx`): Inline SVG brand mark with `size="xs|sm|md|lg|xl"` and `variant="mark|badge"`.

### Forms & Inputs
All text and selection controls use `rounded-lg`, `border-border`, `bg-control`, and a `2px` `ring-ring/40` focus ring.
- **`<Input>` & `<Textarea>`** (`input.tsx`, `textarea.tsx`): Base text and multiline controls (`h-9` in compact toolbars, `h-10` in standard forms).
- **`<InputGroup>`** (`input-group.tsx`): Composes leading/trailing icons, clear buttons, or prefixes around an input via `InputGroup`, `InputGroupAddon` (`align="inline-start|inline-end|block-start|block-end"`), `InputGroupInput`, `InputGroupTextarea`, `InputGroupButton`, and `InputGroupText`.
- **`<AmountInput>`** (`amount-input.tsx`): React Hook Form-bound currency input with locale-aware formatting and `tabular-nums`.
- **`<Label>` & `<FormFieldItem>`** (`label.tsx`, `form-drawer.tsx`): Sentence-case `text-[13px] font-medium` field labels with optional hint and validation error messaging.
- **`<Select>` & `<FormSelect>`** (`select.tsx`, `form-select.tsx`): Base-UI dropdown select and React Hook Form-bound wrapper.
- **`<Checkbox>`, `<RadioGroup>`, `<Switch>`** (`checkbox.tsx`, `radio-group.tsx`, `switch.tsx`): Boolean and single-choice controls; schema-driven editors map booleans to `<Switch>` and enums to `<Select>`.
- **`<DatePicker>` & `<Calendar>`** (`date-picker.tsx`, `calendar.tsx`): Popover date selector and calendar grid honoring `useTimezone()` (`locale`, `weekStartsOn`).
- **`<InputOTP>`** (`input-otp.tsx`): Segmented 6-digit verification code input for MFA and security step-up flows.

### Data Display & Identity
- **`<MoneyAmount>`** (`money-amount.tsx`): Formats integer minor units (cents) via `useTimezone()` in `font-mono tabular-nums`. Supports `size="sm|md|lg|xl"`, `showSign`, and `colored` (`text-success` / `text-destructive` / `text-muted-foreground`).
- **`<Badge>`** (`badge.tsx`): Sentence-case `rounded-md` `h-5 px-2 text-xs font-medium` pills with optional `dot` status indicator (`size-1.5 rounded-full`). Variants: `default`, `secondary`, `outline`, `ghost`, `neutral`, `success`, `warning`, `destructive`, `info`, `link`. Add `className="font-mono tabular-nums"` for percentages and ratios.
- **`<Avatar>`** (`avatar.tsx`): User/contact identity circles (`Avatar`, `AvatarImage`, `AvatarFallback`, `AvatarBadge`, `AvatarGroup`).
- **`<Kbd>`** (`kbd.tsx`): `rounded-md` keyboard shortcut badges (`Kbd`, `KbdGroup`) for hints like `⌘K` and `⌘J`.

### Layout, Containers & Navigation
- **`<Card>`** (`card.tsx`): Solid `rounded-xl border border-border bg-card shadow-2xs` container composing `CardHeader`, `CardTitle`, `CardDescription`, `CardAction`, `CardContent`, and `CardFooter`.
- **`<Tabs>`** (`tabs.tsx`): Supports concentric segmented tabs (`TabsList` `rounded-lg p-1`, `TabsTrigger` `rounded-md`) and `variant="line"` underline tabs (`2px bg-primary` indicator) for page sub-navigation (`Transactions` | `Analytics`).
- **`<Separator>`, `<ScrollArea>`, `<Collapsible>`** (`separator.tsx`, `scroll-area.tsx`, `collapsible.tsx`): `1px` hairlines, custom scroll containers, and progressive-disclosure sections (e.g., **Advanced** panels).
- **`<Pagination>` & `<Sidebar>`** (`pagination.tsx`, `sidebar.tsx`): Paged list navigation and the collapsible left application rail.

### Overlays, Menus & Inspectors
- **`<Dialog>` & `<FormDrawer>` / `<FormDialog>`** (`dialog.tsx`, `form-drawer.tsx`): Tier 2 centered composer modals (`mobileFullscreen = true` on `< sm`) with scrollable body and pinned sticky action footer (`FormDialogShell`).
- **`<AlertDialog>`** (`alert-dialog.tsx`): Compact centered destructive confirmation modal (paired with `toast.add(...)`).
- **`<WorkspaceInspectorPanel>`** (`inspector-panel.tsx`): Tier 3 in-flow side inspector inside `<main>` with flat hairline-separated sections.
- **`<Popover>`, `<DropdownMenu>`, `<Command>`, `<Tooltip>`** (`popover.tsx`, `dropdown-menu.tsx`, `command.tsx`, `tooltip.tsx`): Tier 1 anchored menus, `⌘K` command search, faceted filter popovers, and hover/focus hints.
- **`<Sheet>`** (`sheet.tsx`): Slide-over drawer reserved exclusively for mobile-viewport left navigation.

### Feedback & States
- **`toast`** (`toast.tsx`): Non-blocking status notifications (`toast.add({ type: "success" | "error" | "info" | "warning", title, description })`).
- **`<Skeleton>`** (`skeleton.tsx`): Pulsing `rounded-xl bg-muted` placeholders matching the final card/chart/row silhouette (`role="status"` + `sr-only` label).
- **`<Empty>`** (`empty.tsx`): Dashed `rounded-xl border border-dashed border-border/60` empty state composing `EmptyHeader`, `EmptyMedia variant="icon"`, `EmptyTitle`, `EmptyDescription`, and `EmptyContent`.
- **Error Banners (`DetailError`)**: Inline `rounded-xl border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive` with `<AlertCircle className="size-4 shrink-0" />`.

---

## 4. Composed UI Patterns

### KPI Metric Strip
A responsive grid (`grid gap-4 sm:grid-cols-2 lg:grid-cols-4`) of flat `rounded-xl border border-border bg-card p-4 shadow-2xs` cards:
- **Top Row**: Sentence-case label (`text-xs font-medium text-muted-foreground`) on left + semantic `size-4` Lucide icon on right.
- **Body**: `<MoneyAmount size="lg" className="mt-2 block" />`, plus optional muted `≈ <MoneyAmount size="sm" />` base-currency conversion line underneath.

### 1-Row `h-9` Faceted Filter Toolbar (`TransactionFilterToolbar`)
Shared across `TransactionsView` and `DetailWorkspace`:

```text
┌─────────────────────────────────────────────────────────────────────────┐
│ [🔍 Search...          ×] [+ Filter ▾]      [‹ Oct 2026 › ▾] [Sort ▾]   │  ← All h-9 (36px)
│ [Type: Expense | ×] [Budget: Meals | ×]  Clear filters                  │  ← Removable h-7 chips
└─────────────────────────────────────────────────────────────────────────┘
```

- **Search**: `h-9` input with left `<Search className="size-3.5" />`, `300ms` debounce, and inline clear button.
- **`+ Filter` Popover**: Two-step `<Command>` facet menu (Type, Account, Budget) with active count pill.
- **`<FinancePeriodPicker />`**: Month stepping (`‹` / `›`), presets (`This Month`, `Last Month`, `3M`, `6M`, `YTD`, `12M`, `All Time`), and custom `From` → `To` date range.

### Shared Day-Grouped Ledger (`<TransactionLedgerList />`)
Used identically by `TransactionsView` and all Finance detail workspaces:
- **Day Sections (`space-y-5`)**: Sticky day header (`bg-background/95 backdrop-blur-xs`) showing localized day title (`Today`, `Yesterday`, `Fri, Oct 18, 2026`) + count pill on left, and **Daily Net** (`Net -$45.00`) on right.
- **Day Card**: `divide-y divide-border/60 overflow-hidden rounded-xl border border-border bg-card shadow-2xs`.
- **Row Anatomy**:
  - Left: `size-9 rounded-lg border` icon tile (Budget icon & hue for expenses; emerald `ArrowUpRight` for income; info `ArrowRightLeft` for transfers; `Scale` for adjustments).
  - Middle: Truncated `text-sm font-medium` title + inline metadata pills (`Recurring`, `Transfer`, `Borrowing role`), followed by `text-[11px]` subtitle row with optional Account pill (falling back to hydrated `txn.account?.name` for archived accounts), colored Budget pill, and localized transaction type.
  - Right: Hover/focus `<CopilotAttachButton />`, signed `<MoneyAmount />` + cross-currency base `<MoneyAmount />`, and optional `MoreVertical` action menu.
  - Active State: Inspecting a row in `TransactionEventsSheet` applies `bg-primary/5 ring-1 ring-primary/30 ring-inset`.

### Data Visualization (`InsightsCharts`, `DetailChart`)
- **Container**: `rounded-xl border border-border bg-card p-5 shadow-2xs` with title + icon on left and mode/granularity controls on right.
- **Pinned Inspection Strip**: `<output aria-live="polite" className="rounded-lg border border-border/70 bg-muted/30 px-3 py-2 text-xs">` displaying the inspected date and color-dot labeled `tabular-nums` values. Rests on the **latest observed point** when not hovering and updates via mouse hover or `ArrowLeft`/`ArrowRight` roving focus.
- **SVG Canvas**: Consistent height (`h-[220px]`–`h-[240px]`), compact `tabular-nums` Y-axis labels, dashed horizontal gridlines (`3 3`, solid at `0`), `<linearGradient>` area fades scoped with React `useId()`, rounded bars (`rx={3}`), active column highlight + hairline crosshair, and explicit circle markers for single-point series.

### Progress & Pace Bars
- `h-2 w-full overflow-hidden rounded-full bg-secondary` track with `role="progressbar"` and `aria-valuemin`/`aria-valuemax`/`aria-valuenow`.
- Budget progress adds a vertical `2px` `bg-foreground` `"Today"` elapsed-time pace tick.
- Semantic fill colors communicate progress honestly: `primary` / `success` for positive progress (debt payoff, on-track budgets), `warning` for elevated utilization (`>= 75%` credit / `>= 85%` budget), `destructive` for over-budget or `>= 90%` credit utilization, `neutral` for completed/paid-off states.

---

## 5. Interactive Workbench & Reference Views

- **Live Kitchen Sink**: Visit `/__design` in development (`import.meta.env.DEV`) to preview all `@saturn/tokens` swatches, typography, `<MoneyAmount />`, core primitives, page shells, and `FormDrawer` **side-by-side in Light and Dark mode**.
- **Canonical Reference Implementations**:
  - Ledgers & Toolbars: `apps/web/features/finance/transactions-view.tsx`, `apps/web/features/finance/components/transaction-ledger-list.tsx`
  - Analytics & KPIs: `apps/web/features/finance/insights-view.tsx`, `apps/web/features/finance/account-detail-view.tsx`
  - Progress & Cards: `apps/web/features/finance/components/budget-card.tsx`, `apps/web/features/finance/components/budget-period-progress.tsx`, `apps/web/features/finance/borrowing-view.tsx`
