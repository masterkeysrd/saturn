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

## 4. Testing Conventions

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

## 5. Verification

Always format, lint, and typecheck before considering any frontend or package change complete:

```bash
make web-format     # Format all frontend source files with Prettier
make web-lint       # Run ESLint across web and mobile packages
make web-typecheck  # Run TypeScript compiler across all 6 monorepo packages
```
