# Saturn Design System — Orbital Precision

**Orbital Precision** is Saturn's unified visual language across **Web (`apps/web`)** and **Mobile (`apps/mobile`)**. It is designed to feel like a calm, high-precision personal instrument—combining crisp editorial surfaces, `1px` hairline geometry, tabular financial typography, and a restrained teal/iris accent system rooted in Saturn's planetary mark.

- **[Web Design System](./web.md)** — Application frame, page shells, 3-tier overlays, Web component specs, and interactive patterns.
- **[Mobile Design System](./mobile.md)** — Reactive native theming, phone thumb-zone anatomy, native component specs, haptics, and charts.

---

## 1. Design Principles

1. **Editorial Calm Over Chrome Noise**: Surfaces stay quiet and flat (`1px` borders, subtle luminance steps) so balances, schedules, messages, and charts carry visual weight—not glowing cards, heavy blurs, or decorative gradients.
2. **Spatial Honesty**: Geometry is concentric across every nesting level (`R_outer = R_inner + padding`), and elevation comes from three clear surface tiers rather than heavy shadows.
3. **Tabular Financial Precision**: Every currency figure, balance, percentage, ratio, chart tick, and timestamp aligns vertically to the pixel with `tabular-nums lining-nums`.
4. **Intentional Color Restraint**: Color communicates meaning—Orbital Teal (`primary`) marks active controls and focus, Celestial Iris (`brand-secondary`) marks AI Copilot and automation, semantic colors mark status, and the 12-hue categorical ramp differentiates user entities.

---

## 2. Token Architecture

Saturn shares a single zero-dependency token layer (`@saturn/tokens` in `packages/tokens/`) across both platforms:

```text
packages/tokens/ (Layer 1 — Source of Truth)
  ├── apps/web/index.css        ──▶ OKLCH CSS custom properties (--background, --card, --primary, ...)
  └── apps/mobile/lib/theme.ts  ──▶ Reactive useTheme() / useThemedStyles() palettes (lightColors / darkColors)
```

---

## 3. Color System

### Surface & Neutral Palette

Both Light and Dark modes separate into **three luminance tiers** (`canvas` → `surface` → `overlay`) so cards and floating menus lift cleanly without heavy drop shadows.

| Role | Web CSS Variable | Web Light (OKLCH) | Web Dark (OKLCH) | Mobile Token | Mobile Light | Mobile Dark |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **App Canvas** | `--background` | `oklch(0.982 0.004 225)` | `oklch(0.145 0.014 245)` | `colors.background` | `#f6f9fb` | `#090d16` |
| **Primary Card Surface** | `--card` | `oklch(1 0 0)` | `oklch(0.192 0.016 245)` | `colors.surface` | `#ffffff` | `#111827` |
| **Floating Overlay / Menu** | `--popover` | `oklch(1 0 0)` | `oklch(0.222 0.018 245)` | `colors.surfaceElevated` | `#ffffff` | `#182235` |
| **Recessed Well / Track** | `--muted` / `--secondary` | `oklch(0.955 0.005 225)` | `oklch(0.235 0.015 245)` | `colors.surfaceSubtle` | `#edf3f7` | `#0d131f` |
| **Form Control Surface** | `--control` | `oklch(1 0 0)` | `oklch(0.165 0.015 245)` | `colors.surface` | `#ffffff` | `#111827` |
| **Hover / Selection Tint** | `--accent` | `oklch(0.948 0.008 215)` | `oklch(0.255 0.018 245)` | `colors.surfaceHighlight` | `#e5eef4` | `#1e293b` |
| **Primary Ink** | `--foreground` | `oklch(0.165 0.014 235)` | `oklch(0.965 0.005 225)` | `colors.textPrimary` | `#0f172a` | `#f8fafc` |
| **Secondary / Muted Ink** | `--muted-foreground` | `oklch(0.49 0.018 230)` | `oklch(0.68 0.016 235)` | `colors.textMuted` | `#64748b` | `#94a3b8` |
| **Hairline Border** | `--border` | `oklch(0.905 0.008 225)` | `oklch(1 0 0 / 9%)` | `colors.border` | `rgba(15,23,42,0.10)` | `rgba(255,255,255,0.09)` |

### Brand & Semantic Status Palette

| Role | Web CSS Variable | Web Light | Web Dark | Mobile Light | Mobile Dark | Semantic Meaning |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Primary** | `--primary` | `oklch(0.53 0.125 202)` | `oklch(0.76 0.135 196)` | `#0c7e95` | `#4de2cf` | Primary CTAs, active indicators, focus rings |
| **Primary Ink** | `--primary-foreground` | `oklch(0.99 0.005 202)` | `oklch(0.15 0.02 235)` | `#f8feff` | `#09131c` | Foreground text/icons on filled primary buttons |
| **Brand Secondary** | `--brand-secondary` | `oklch(0.55 0.18 272)` | `oklch(0.70 0.16 275)` | `#5449e6` | `#818cf8` | AI Copilot, streaming shimmer, automation flows |
| **Success** | `--success` | `oklch(0.58 0.15 160)` | `oklch(0.72 0.15 160)` | `#059669` | `#34d399` | Inflows, reconciled states, on-track/collected progress |
| **Warning** | `--warning` | `oklch(0.68 0.16 75)` | `oklch(0.78 0.15 80)` | `#d97706` | `#fbbf24` | Near-limit budgets (`>= 85%`), credit utilization (`75–89%`), due soon |
| **Destructive** | `--destructive` | `oklch(0.58 0.22 25)` | `oklch(0.68 0.19 22)` | `#dc2626` | `#fb7185` | Errors, destructive actions, over-budget, overdue, credit utilization (`>= 90%`) |
| **Info** | `--info` | `oklch(0.56 0.13 230)` | `oklch(0.74 0.13 225)` | `#0284c7` | `#38bdf8` | Neutral status, transfers, reference ceiling lines, disbursements |

### Categorical & Data Visualization Palettes

- **12-Hue Categorical Palette (`CATEGORICAL_PALETTE` in `packages/tokens/colors.ts`)**: Used for user-configured budgets, accounts, institutions, and calendar labels so distinct entities stay readable in both themes. Each hue provides `{ bg, border, text, bar }` pairs for Light and Dark modes:
  `teal` (`#0d9488`), `sky` (`#0ea5e9`), `blue` (`#3b82f6`), `indigo` (`#6366f1`), `violet` (`#8b5cf6`), `plum`, `pink`, `coral`, `orange`, `amber`, `lime`, `emerald` (with `rose` aliased to `coral` for backward compatibility).
- **Multi-Hue Chart Ramp**: `--chart-1` (Orbital Teal), `--chart-2` (Celestial Iris), `--chart-3` (Emerald), `--chart-4` (Amber Gold), `--chart-5` (Coral Rose).
- **JSON Syntax Tokens**: Designed for `>= 4.5:1` WCAG AA contrast in both themes:

| Token | Light | Dark |
| :--- | :--- | :--- |
| Keys (`syntaxKey`) | `#0369a1` | `#7dd3fc` |
| Strings (`syntaxString`) | `#047857` | `#6ee7b7` |
| Numbers (`syntaxNumber`) | `#b45309` | `#fcd34d` |
| Booleans (`syntaxBoolean`) | `#4f46e5` | `#a5b4fc` |
| Null & Punctuation (`syntaxNull` / `syntaxPunctuation`) | `#64748b` | `#94a3b8` / `#64748b` |

---

## 4. Typography & Numerals

### Typefaces
- **Sans (`--font-sans`)**: `Inter Variable`, `Inter`, system UI sans (`SF Pro Text` / `Segoe UI`). OpenType features `cv02`, `cv03`, `cv04`, `cv11` are enabled on Web for crisp distinction between `1`, `l`, `I`, and `0`.
- **Monospace (`--font-mono`)**: `Geist Mono`, `JetBrains Mono` on Web; `Menlo` (iOS) and `monospace` (Android) on Mobile.

### Type Scale

| Role | Size | Weight | Tracking / Case | Web Class | Usage |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Page Title** | `20–24px` | `600` (Semibold) | `tracking-tight`, sentence case | `text-xl md:text-2xl font-semibold tracking-tight` | View headers (`<h1>`) |
| **Hero Figure** | `24px` | `600` (Semibold) | `tracking-tight`, `tabular-nums` | `<MoneyAmount size="xl" />` | Primary balance, remaining budget |
| **KPI Figure** | `18px` | `600` (Semibold) | `tabular-nums` | `<MoneyAmount size="lg" />` | Metric strip values |
| **Section / Card Title** | `15–16px` | `600` (Semibold) | `tracking-tight`, sentence case | `text-[15px] font-semibold tracking-tight` | Card & section headers (`<h2>`/`<h3>`) |
| **Body / Ledger Row** | `14px` | `400` / `500` | Default | `text-sm` / `text-sm font-medium` | Descriptions, row titles, menu items |
| **Field Label** | `13px` | `500` (Medium) | Sentence case | `text-[13px] font-medium text-foreground/90` | Form labels |
| **Caption / Metadata** | `12px` | `400` / `500` | Default | `text-xs text-muted-foreground` | Dates, subtitles, KPI labels, chart strips |
| **Badge / Kbd Floor** | `11–12px` | `500` (Medium) | Sentence case | `text-xs` / `text-[11px]` | Status pills, metadata tags, keyboard hints |

### Regional & Temporal Formatting
- Workspace `timezone` and `baseCurrency` are scoped to the active **Space**; user `locale`, `hourCycle` (`h12`/`h23`), and `weekStartsOn` flow through `useTimezone()` from `@saturn/hooks`.
- Compact date ranges drop redundant years (`Oct 1 - Oct 31` for the current year, `Dec 20, 2025 - Jan 19, 2026` when spanning years).

---

## 5. Spacing, Concentric Radii & Iconography

### Spacing Grid (`packages/tokens/geometry.ts`)
`xs: 4px` · `sm: 8px` · `md: 16px` · `lg: 24px` · `xl: 32px` · `xxl: 40px`

- **Page Gutters**: `24px` (`p-6`) on Web; `16px` horizontal padding on Mobile.
- **Section Rhythm**: `24px` (`gap-6`) between major page sections on Web; `12–16px` (`gap: 12–16`) on Mobile.
- **Card Padding**: `16px` (`p-4`) for dense KPI/metric cards; `20px` (`p-5`) for hero/chart cards.

### Concentric Radii (`R_outer = R_inner + padding`)

| Surface Tier | Pixel Target | Web Tailwind | Mobile `t.radius` | Examples |
| :--- | :--- | :--- | :--- | :--- |
| **Micro** | `6px` | `rounded-md` | `sm` (`6`) | Badges, `<Kbd />`, active pills inside a segmented track |
| **Control** | `8–10px` | `rounded-lg` | `md` (`10`) | Buttons, inputs, selects, segmented tracks, row icon tiles |
| **Container** | `12–14px` | `rounded-xl` | `lg` (`14`) | Cards, charts, popovers, dropdown menus, ledger groups |
| **Feature / Sheet** | `16–20px` | `rounded-2xl` | `xl` (`20`) | Physical account cards, dialogs, hero cards, bottom sheets |
| **Pill / Circular** | `9999px` | `rounded-full` | `full` (`9999`) | Avatars, status dots, progress tracks, filter chips |

### Iconography & Brand Mark
- **Brand Mark**: Inline SVG `<SaturnMark />` (adaptive light/dark favicon, zero raster bloat).
- **Lucide Icons**: Standardize on `16px` (`size-4`, `strokeWidth={1.75}`) in toolbars, buttons, rows, and menus, and `20px` (`size-5`, `strokeWidth={1.6}`) in page headers and empty states.
- **Motion Restraint**: Reserve pulse/shimmer animations strictly for active loading skeletons and live AI streaming/syncing indicators.

---

## 6. Localization & Multilingual Geometry

Saturn ships symmetrically in **English (`en`)** and **Spanish (`es`)**, where translated labels routinely expand by **25–35%**:
- Controls size intrinsically via horizontal padding (`px-3`) rather than fixed pixel widths.
- Headers, badges, and toolbars use flex wrapping (`flex-wrap`) or truncation (`min-w-0 truncate`) so longer Spanish phrases (`"Responder a todos"`, `"Desembolso adicional"`) never clip or collide.
- Enum values render through explicit localized lookup maps (`getLocalizedEnumLabel` in `@saturn/i18n`) rather than string-transformed enum keys.
