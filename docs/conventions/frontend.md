# Frontend & Monorepo Conventions

Saturn uses a Turborepo monorepo with strict package boundaries between shared logic and application interfaces.

---

## 1. Monorepo Package Boundaries

```
packages/
├── core/       # @saturn/core: PURE business logic, date/timezone math, formatting
│               # (ZERO runtime dependencies — standard Web/Node APIs only)
├── hooks/      # @saturn/hooks: React context providers and shared custom hooks
│               # (TimezoneProvider, useTimezone, useCurrencyConversion, etc.)
├── schemas/    # @saturn/schemas: Shared Zod validation schemas
└── api/        # @saturn/api: Auto-generated TypeScript gRPC/HTTP clients & types
apps/
├── web/        # saturn-web: Desktop & tablet web application (React, Vite, Tailwind)
└── mobile/     # saturn-mobile: Cross-platform mobile application (React Native, Expo)
```

> [!IMPORTANT]
> **Strict Monorepo Dependency Flow**:
> - `apps/web` and `apps/mobile` may import from `@saturn/*`.
> - `@saturn/hooks` may import from `@saturn/core` and `@saturn/api`.
> - `@saturn/core` must **NEVER** import React, hooks, or application packages.
> - **NEVER** cross-import between `apps/web` and `apps/mobile`.

---

## 2. Date & Timezone Handling

1. **Zero Inline Formatting**:
   - **NEVER** call `new Date().toLocaleDateString(undefined, { timeZone: "UTC" })` or native date methods inline in components.
   - Always consume `const tz = useTimezone()` from `@saturn/hooks`.
2. **Standard Methods on `tz`**:
   - `tz.format(date, options)`: Formats with active workspace timezone.
   - `tz.startOfDay(date)` / `tz.endOfDay(date)`: Computes localized day boundaries.
   - `tz.isToday(date)` / `tz.isYesterday(date)` / `tz.isTomorrow(date)`: Timezone-aware relative checks.
   - `tz.timezone`: Active IANA timezone string (e.g., `"America/New_York"`).
3. **Timezone Selection**:
   - Use `COMMON_TIMEZONES` imported from `@saturn/core`. Do not define duplicate timezone arrays.

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

## 4. UI & Form Design Rules

1. **No Double-Nested Card Containers**:
   - **NEVER** render a bordered card or collapsible card inside another bordered card, drawer, sheet, or inspector panel.
   - Inside drawers, sheets, and side inspectors, use flat vertical sections separated by `border-t border-border/40` hairlines instead of nested `rounded-2xl border bg-card` wrappers.
2. **Single-Column Rhythm in Narrow Inspectors & Drawers**:
   - Any panel narrower than `520px` (right-hand inspectors, side sheets, mobile forms) must use a **single-column vertical layout** (`space-y-4`) for fields—never squeeze 3+ inputs or 12-column horizontal grids into narrow sidebars.
   - Use full-width stacked field items or collapsible pill rows for structured array builders (such as schema field lists or key-value mappings) instead of cramped multi-input table rows.
3. **Schema-Driven Typed Controls**:
   - When rendering form fields backed by a JSON Schema (`inputsSchema` / `paramsSchema`), map field types to native UI controls: `boolean` $\rightarrow$ `Switch`, `enum` $\rightarrow$ `Select`, `number` / `integer` $\rightarrow$ numeric `Input`, with an optional expression (`fx`) toggle when dynamic `{{ ... }}` bindings are needed.
   - Do not render generic monospace code boxes for every field.
4. **Progressive Disclosure**:
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
make web-typecheck  # Run TypeScript compiler across all 6 monorepo packages
```
