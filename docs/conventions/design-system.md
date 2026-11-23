# Saturn Design System — "Orbital Precision" Charter

Saturn's visual language across Web (`apps/web`) and Mobile (`apps/mobile`) is **Orbital Precision**: calm, high-contrast editorial surfaces, crisp `1px` hairline geometry, tabular financial typography, and a restrained teal/iris accent system rooted in Saturn's planetary mark.

---

## 1. Three-Layer Architecture

1. **Layer 1 — Shared Design Tokens (`@saturn/tokens` in `packages/tokens/`)**:
   - Zero-dependency pure TypeScript source of truth shared across Web and Mobile.
   - Exports Light/Dark semantic palettes (`lightColors`, `darkColors`), concentric `radii` and `spacing` scales, and the 12-hue categorical palette (`CATEGORICAL_PALETTE`).
   - Web (`apps/web/index.css`) maps these tokens to OKLCH CSS custom properties; Mobile (`apps/mobile/lib/theme.ts`) consumes them reactively via `useTheme()` and `useThemedStyles()`.
2. **Layer 2 — Headless Accessibility & Gesture Primitives**:
   - Web uses `@base-ui/react` and `cmdk` wrapped in `apps/web/components/ui/`.
   - Mobile uses `@gorhom/bottom-sheet` and native React Native primitives wrapped in `apps/mobile/components/ui/`.
   - Feature views must consume Layer 2 primitives via their `variant` / `size` props rather than overriding border radii, gradients, or shadows ad-hoc.
3. **Layer 3 — Saturn Domain & Layout Patterns**:
   - **3 Canonical Page Shells**: `<DocumentPage>`, `<SplitWorkspacePage>`, and `<StudioCanvasPage>`.
   - **Financial & Temporal Primitives**: `<MoneyAmount />` (Web) and `<MonoAmount />` (Mobile) with mandatory `tabular-nums`, plus deterministic user-scoped regional formatting via `useTimezone()`.
   - **Triage & Command Patterns**: Global `⌘K` `<CommandPalette />`, `<FormDrawer />` / `<FormDialog />` centered composer modals with pinned sticky footers, anchored `<Popover>`s for quick previews/controls, and in-flow `<WorkspaceInspectorPanel />` side inspectors with flat hairline-separated sections.

---

## 2. Color System

### Surface Elevation Tiers (Light & Dark)
Both modes must preserve **3 distinct luminance tiers** so cards and floating overlays separate naturally without heavy drop shadows:
- **Canvas (`--background`)**: Cool-porcelain (`oklch(0.982 0.004 225)`) in Light Mode; deep cosmos navy (`oklch(0.145 0.014 245)` / `#090d16`) in Dark Mode.
- **Primary Surface (`--card`)**: Crisp white (`oklch(1 0 0)`) in Light Mode; elevated slate-navy (`oklch(0.192 0.016 245)` / `#111827`) in Dark Mode.
- **Overlay / Floating (`--popover`)**: White (`oklch(1 0 0)`) with hairline ring in Light Mode; lifted slate (`oklch(0.222 0.018 245)` / `#182235`) in Dark Mode.

### Brand & Interactive Tokens
- **Primary (`--primary`)**: Orbital Teal (`oklch(0.53 0.125 202)` Light; luminous `oklch(0.76 0.135 196)` Dark) ensuring >= 4.5:1 WCAG AA contrast in both modes.
- **Brand Secondary (`--brand-secondary`)**: Celestial Iris (`oklch(0.55 0.18 272)` Light; `oklch(0.70 0.16 275)` Dark) reserved for AI Copilot and Automation workflows.
- **Interactive Hover (`--accent`)**: Strictly a neutral hover/focus surface tint. **Never** use `from-primary to-accent` for buttons or foreground fills.
- **Semantic Status Tokens**: `success` (emerald), `warning` (amber), `destructive` (crimson/coral), and `info` (sky).

### 12-Hue Categorical Palette
User-assigned entities (budgets, accounts, institutions, calendar labels) use the 12 perceptually balanced hues exported by `@saturn/tokens`:
`teal`, `sky`, `blue`, `indigo`, `violet`, `plum`, `pink`, `coral`, `orange`, `amber`, `lime`, `emerald` (with `rose` preserved as a backward-compatible alias for `coral` so existing saved records continue rendering).

---

## 3. Typography, Numerals & Regional Formatting

- **Font Pairing (Web)**:
  - `--font-sans`: `'Inter Variable', 'Inter', -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', 'Noto Sans Variable', system-ui, sans-serif` with OpenType features `cv02`, `cv03`, `cv04`, `cv11` enabled on `html`.
  - `--font-mono`: `'Geist Mono', 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`.
- **Type Scale**:
  - **Page Title**: `20px–22px` (`text-xl md:text-2xl font-semibold tracking-tight`).
  - **Section / Card Title**: `15px–16px` (`text-[15px]` or `text-base font-semibold`).
  - **Body / Table Cell**: `13.5px–14px` (`text-sm`).
  - **Field Label**: `13px` (`text-[13px] font-medium text-foreground/90`) in **sentence case**.
  - **Caption / Metadata**: `12px` (`text-xs text-muted-foreground`), with an `11px` floor for badges and `<Kbd />` hints.
- **Mandatory Tabular Numerals**: All currency figures, balances, ledger amounts, budget ratios, and timestamps must render with `tabular-nums` via `<MoneyAmount />` (Web) or `<MonoAmount />` (Mobile).
- **User-Scoped Regional Formatting**:
  - Workspace `timezone` and `baseCurrency` stay scoped to the **Space**.
  - Display `locale` (default `"en-US"`), `hourCycle` (`"h12" | "h23"`), and `weekStartsOn` (`0 | 1`) flow through `TimezoneProvider` / `useTimezone()` so numbers, dates, and calendars format deterministically without hardcoded `"en-US"` or ambient `undefined` calls.

---

## 4. Concentric Radii & "Kill vs. Embrace" Aesthetic Rules

### Concentric Radius Scale
| Surface Tier | Web Tailwind | Pixel Target |
| :--- | :--- | :--- |
| Badges, `<Kbd />`, inner segmented tabs | `rounded-md` | `6px` |
| Buttons, Inputs, Selects, Segmented tracks | `rounded-lg` | `8px–10px` |
| Cards, Popovers, Dropdown menus | `rounded-xl` | `12px–14px` |
| Physical Account Cards, Modals, Sheets | `rounded-2xl` | `16px–18px` |
| Filter chips, Avatars, Status dots | `rounded-full` | `9999px` |

### Kill vs. Embrace
- **Kill**: `rounded-4xl` stadium-pill form controls, `rounded-3xl` data cards, `backdrop-blur-xl` on resting cards, glowing corner orbs, `hover:scale-[1.01]` card bounce, `from-primary to-accent` gradients, `animate-pulse` on static icons, and `8px–10px` `ALL-CAPS BOLD` labels.
- **Embrace**: Concentric `6px / 8px / 12px / 16px` radii, solid `bg-card` surfaces with `1px` hairlines (`border-border/70`), tactile primary buttons (`bg-primary text-primary-foreground shadow-[inset_0_1px_0_oklch(1_0_0/0.16)]`), sentence-case labels, and sticky-footer drawers.

---

## 5. `i18n`-Ready Layout & Enum Rules

1. **Explicit Enum Lookup Maps**: Never format backend enums by regex-stripping prefixes (e.g., `.replace(/^STATUS_/, "")`). Map enums through explicit dictionaries in `@saturn/core` or `@saturn/i18n` so UI copy is clean and localized.
2. **Expansion-Safe Containers**: Never assign fixed pixel widths (`w-20`, `w-24`) to text buttons, tabs, or badges. Use intrinsic padding (`px-*`) plus `min-w-0 truncate` so +25–35% longer translations never clip.
3. **Zero Hardcoded Copy**: All UI labels, placeholders, buttons, toasts, errors, sidebar navigation items, and breadcrumbs must resolve through `@saturn/i18n` (`useI18n().t` / `translate`) with symmetric keys in `packages/i18n/locales/en.json` and `es.json`.

---

## 6. Global Shell & Three Canonical Page Shells

### `48px` Contextual Top Bar & Branded Sidebar Shell
- **Sidebar Header (`h-12`)**: `<SaturnMark />` + `"Saturn"` wordmark anchored in a `48px` `SidebarHeader` aligned flush with the top bar border (collapsing to the centered `<SaturnMark />` badge in icon-only mode).
- **Top-Left Context (`h-12`)**: `<SidebarTrigger />`, vertical divider, `<SpaceSelector />` (`[Space Name ▾]`), followed by `/` + active route breadcrumbs (`Domain / Page`) so Space context stays visible even when the sidebar is collapsed.
- **Top-Right Utilities**: Command Search trigger pill (`Search or jump… ⌘K`), `<GlobalAIDrawer />` (`Ask AI ⌘J`), and `<UserMenu />` (`[Avatar Initials ▾]`) containing the embedded 3-state Appearance switcher (`Light` / `Dark` / `System`) plus account/workspace links and Log Out.
- **Sidebar Navigation (`AppSidebar`)**: Organized into **Daily Pulse**, **Money**, **Automation**, and **Admin** (for admins), with **Settings** (`/settings`) anchored in `SidebarFooter`.

| Shell | Component | Intended Views |
| :--- | :--- | :--- |
| **Document Shell** | `<DocumentPage>` | Dashboard, Insights, Budgets, Accounts, Settings, Admin |
| **Split Workspace Shell** | `<SplitWorkspacePage>` | Mail, Transactions + Inspector, Review Queue, AI Chat |
| **Studio Canvas Shell** | `<StudioCanvasPage>` | Workflow Editor, Calendar Grid, Statement Reconciliation |

### 3-Tier Overlay & Spatial Ownership (Web)
- **Viewport Edges**: Left edge is reserved for `AppSidebar`; right edge is reserved exclusively for `DockedCopilotSidebar` (`⌘J`). Desktop views must **never** mount right-hand `<Sheet>` overlays (`<Sheet>` is restricted strictly to mobile-only left navigation drawers).
- **Tier 1 — Anchored `<Popover>`s (Zero Backdrop)**: Quick previews and view controls (`CustomizeDashboardPopover`, Calendar `EventPreviewPopover`).
- **Tier 2 — Centered `<Dialog>` Composer Modals (Full-Screen on Mobile Web `< 640px`)**: CRUD creation, edit, and action forms (`<FormDrawer />` / `<FormDialog />`, `AgentSheet`, `ModelSheet`, `ProviderSheet`, `MCPServerSheet`, `ConfirmTransactionSheet`, `ManageSpaceSheet`, `TestRunDrawer`, API Key composer). On `< sm` (`< 640px`), `DialogContent` (`mobileFullscreen = true`) expands to `100dvh` edge-to-edge with safe-area header/footer insets so virtual keyboards never crush form layouts; short destructive confirmations (`<AlertDialog />` or `mobileFullscreen={false}`) remain compact centered cards.
- **Tier 3 — In-Flow `<WorkspaceInspectorPanel />` Inside `<main>` (`< lg` Full-Screen on Mobile/Tablet)**: Deep entity inspection, ledgers, timelines, and execution traces (`BudgetHistorySheet`, `AccountHistorySheet`, `BorrowingDetailSheet`, `RecurringTransactionHistorySheet`, `TransactionEventsSheet`, `RunTraceSheet`) sit side-by-side in-flow inside `<main>` on `lg+` desktops to the left of `DockedCopilotSidebar` with zero backdrop or focus trap, and expand cleanly to `100dvh` on `< lg` viewports.

### Verification via `/__design`
- **Web**: Dev-only route `/__design` (`import.meta.env.DEV`) renders all `@saturn/tokens` swatches, typography, `<MoneyAmount />`, core primitives, page shell previews, and a live `FormDrawer` **side-by-side in Light and Dark mode**.
- **Mobile**: Dev-only route `settings/design-system` (`__DEV__`) in `apps/mobile` previews `@saturn/tokens`, live Light/Dark/System switching, and core mobile primitives.
