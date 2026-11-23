# Frontend & Monorepo Conventions

Saturn uses a Turborepo monorepo with strict package boundaries between shared logic and application interfaces.

---

## 1. Monorepo Package Boundaries

```
packages/
├── tokens/     # @saturn/tokens: PURE design tokens (colors, radii, spacing, 12-hue palette)
│               # (ZERO runtime dependencies — consumed by Web CSS and Mobile useTheme)
├── i18n/       # @saturn/i18n: PURE localization catalogs (locales/*.json, enums/*.json, schemas/*.json)
│               # (ZERO runtime dependencies — consumed by schemas, hooks, Web, and Mobile)
├── core/       # @saturn/core: PURE business logic, date/timezone math, formatting
│               # (ZERO runtime dependencies — standard Web/Node APIs only)
├── hooks/      # @saturn/hooks: React context providers and shared custom hooks
│               # (TimezoneProvider, useTimezone, useCurrencyConversion, useI18n, etc.)
├── schemas/    # @saturn/schemas: Shared Zod validation schemas
└── api/        # @saturn/api: Auto-generated TypeScript gRPC/HTTP clients & types
apps/
├── web/        # saturn-web: Desktop & tablet web application (React, Vite, Tailwind)
└── mobile/     # saturn-mobile: Cross-platform mobile application (React Native, Expo)
```

> [!IMPORTANT]
> **Strict Monorepo Dependency Flow**:
> - `apps/web` and `apps/mobile` may import from `@saturn/*`.
> - `@saturn/hooks` may import from `@saturn/core`, `@saturn/i18n`, `@saturn/tokens`, `@saturn/schemas`, and `@saturn/api`.
> - `@saturn/schemas` may import from `@saturn/core` and `@saturn/i18n`.
> - `@saturn/core`, `@saturn/i18n`, and `@saturn/tokens` must **NEVER** import React, hooks, or application packages, must maintain **zero runtime dependencies**, and must remain 100% UI-framework agnostic.
> - **NEVER** cross-import between `apps/web` and `apps/mobile`.

---

## 2. Date, Timezone & Internationalization (i18n)

1. **Zero Inline Formatting**:
   - **NEVER** call `new Date().toLocaleDateString(undefined, { timeZone: "UTC" })` or native date/currency formatting inline in components.
   - Always consume `const tz = useTimezone()` from `@saturn/hooks` and render monetary values with `<MoneyAmount />` (Web) or `<MonoAmount />` (Mobile) using `tabular-nums`.
2. **Standard Methods & Preferences on `tz`**:
   - `tz.format(date, options)` / `tz.formatTime(date, options)`: Formats with active workspace timezone and user-scoped `locale` / `hourCycle` (`"h12"` or `"h23"`).
   - `tz.formatMoney(cents, currency, options)`: Deterministic locale-aware currency formatting.
   - `tz.startOfDay(date)` / `tz.endOfDay(date)`: Computes localized day boundaries.
   - `tz.isToday(date)` / `tz.isYesterday(date)` / `tz.isTomorrow(date)`: Timezone-aware relative checks.
   - `tz.timezone` (Space-scoped), `tz.locale`, `tz.hourCycle`, `tz.weekStartsOn` (User-scoped).
3. **Timezone Selection**:
   - Use `COMMON_TIMEZONES` imported from `@saturn/core`. Do not define duplicate timezone arrays.
4. **Mandatory `@saturn/i18n` Localization (Zero Hardcoded UI Copy)**:
   - **NEVER** hardcode user-facing strings (headings, labels, placeholders, buttons, confirmation dialogs, toast messages, empty states, error fallbacks, `aria-label`s, sidebar items, or breadcrumbs) or write inline `isEs ? ... : ...` / parallel `*_ES` maps.
   - Always add symmetric nested keys to **both** `packages/i18n/locales/en.json` and `packages/i18n/locales/es.json` (and `schemas/{en,es}.json` for Zod refinements, `enums/{en,es}.json` for enums).
   - Consume keys via `const { t } = useI18n()` in React components, `translate(locale, key)` in pure TypeScript helpers (e.g., `apps/web/lib/breadcrumbs.ts`), and `URL_TO_NAV_KEY` in `apps/web/components/app-sidebar.tsx`.
   - Reuse centralized domain label maps and components across features (e.g., `apps/web/lib/scopes.ts` + `<ScopePicker />` for API Key and OAuth scopes).
   - Always run `npx vitest run packages/i18n` after modifying localization catalogs to enforce zero-dot nested structure and 100% leaf-key parity.

---

## 3. Component & State Ergonomics

1. **Zero-Prop Context Consumption**:
   - Do not drill `spaceId`, `timezone`, or permissions through deeply nested props.
   - Use `useActiveSpaceContext()` / `useSpacePermissions()` (Web) or `useSpace()` (Mobile).
   - Use `useTimezone()` inside any child component requiring localized date math.
2. **React Query Cache Invalidation**:
   - After running mutations, invalidate the corresponding query keys via `queryClient.invalidateQueries` so lists and summary widgets update immediately.
3. **Component Placement**:
   - Shared cross-domain components $\rightarrow$ `components/ui/`
   - Feature-specific UI $\rightarrow$ `features/<domain>/components/` (Web) or `components/<domain>/` (Mobile)

---

## 4. UI, Page Shells & Form Design Rules

See [Saturn Design System Charter](design-system.md) for the complete **Orbital Precision** token, radius, typography, and `/__design` verification standards.

1. **Three Canonical Page Shells**:
   - Use `<DocumentPage>` for scrollable settings, insights, budgets, and admin views.
   - Use `<SplitWorkspacePage>` for list/detail workspaces (Mail, Transactions + Inspector, Review Queue, AI Chat).
   - Use `<StudioCanvasPage>` for full-bleed tools (Workflow Editor, Calendar Grid, Statement Reconciliation).
2. **No Double-Nested Card Containers**:
   - **NEVER** render a bordered card or collapsible card inside another bordered card, drawer, sheet, or inspector panel.
   - Inside drawers, sheets, and side inspectors, use flat vertical sections separated by `border-t border-border/40` hairlines instead of nested `rounded-2xl border bg-card` wrappers.
3. **Drawer & Inspector Grid Rhythm (`< 520px`)**:
   - Any panel narrower than `520px` (right-hand inspectors, side sheets, mobile forms) must **never** squeeze 3+ column grids or cramped multi-input table rows.
   - Prefer clean vertical stacking (`space-y-4`) with **semantic 2-field micro-pairings** where inputs form a single conceptual unit (`[Currency | Amount]`, `[Start Time | End Time]`, `[Interval | Day of Month]`).
   - Use sentence-case field labels (`text-[13px] font-medium`); never use shouting `10px ALL-CAPS BOLD` labels.
4. **Schema-Driven Typed Controls**:
   - When rendering form fields backed by a JSON Schema (`inputsSchema` / `paramsSchema`), map field types to native UI controls: `boolean` $\rightarrow$ `Switch`, `enum` $\rightarrow$ `Select`, `number` / `integer` $\rightarrow$ numeric `Input`, with an optional expression (`fx`) toggle when dynamic `{{ ... }}` bindings are needed.
   - Do not render generic monospace code boxes for every field.
5. **Progressive Disclosure**:
   - Keep primary form sections focused on the core fields a user edits first (e.g., Name, Prompt, Model, Topic).
   - Tuck low-level plumbing (internal IDs, raw CEL filters, `input_mapping`, retry/timeout knobs, `on_error` toggles) inside a collapsed **Advanced** section.

---

## 5. Testing Conventions

Frontend and shared packages follow Vitest and React Testing Library standards:

- **Pure Packages (`@saturn/core`, `@saturn/schemas`)**:
  - Test pure functions (timezone math, currency conversion, Zod parsing) with **Vitest**.
  - Co-locate tests as `<filename>.test.ts`. Zero DOM overhead.
- **Shared Hooks (`@saturn/hooks`)**:
  - Test context consumers and stateful hooks with **Vitest** + **`@testing-library/react`** (`renderHook`).
- **Web Application (`apps/web`)**:
  - Test client parsing algorithms, complex form validations, and interactive components with **Vitest** + **`@testing-library/react`** + **`happy-dom`**.
  - Query by accessible role/label (`getByRole`, `getByLabelText`). Do not test Tailwind styles or markup directly.
- **Detailed Guide**: See [Testing Conventions & Guide](testing.md).

---

## 6. Verification

Always format, lint, and typecheck before considering any frontend or package change complete:

```bash
make web-format     # Format all frontend source files with Prettier
make web-lint       # Run ESLint across web and mobile packages
make web-typecheck  # Run TypeScript compiler across all monorepo packages
```
