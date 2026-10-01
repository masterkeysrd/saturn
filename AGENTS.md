# Saturn Development Guardrails

This is the central development guide for Saturn. All changes across the backend, web, mobile, and shared packages must adhere to these guardrails.

Detailed guidelines live in `docs/conventions/`. Read the relevant guide before modifying code in that subsystem.

---

## Non-Negotiable Core Rules

1. **The Backend Layers, Aggregators & Pure Storage**:
   - **Transport** (`internal/transport/`): Protocol adapters and interceptors only. Routes mutations to Coordinators and queries to Aggregators. Zero DB access, zero business logic.
   - **Application** (`internal/application/`): Use-case Coordinators and transaction boundaries (`tx.Run`). Zero SQL, zero transport imports.
   - **Aggregator** (`internal/aggregator/`): CQRS read models and multi-entity query hydration (parallel batching, view projections). Read-only, zero direct SQL, zero transport imports.
   - **Domain** (`internal/domain/`): Pure entities, domain services (`service.go`), storage interfaces (`storage.go`). 100% pure Go, zero DB or transport imports.
   - **Storage** (`internal/domain/*/storage/`): Strictly pure SQL persistence. **Zero business logic** (no token rotation, session expiry rules, or state validation).
   - See [Backend Architecture Conventions](docs/conventions/backend.md).

2. **Table-Driven Tests & Generated Mocks**:
   - **Unit Tests (Always Mandatory)**: Every domain entity, service, aggregator query, and application coordinator must have table-driven unit tests (`tests := []struct{ ... }` with `t.Run`). 100% in-memory, zero DB calls, testing success, unauthenticated/unauthorized, nil/invalid inputs, and domain error propagation.
   - **Mocking**: Use `tools/mockgen` from `@Mock` annotations (`mocks_test.go`). No heavy third-party mock frameworks.
   - **Integration Tests (Workflows & Integrations Only)**: Mandatory specifically for end-to-end multi-step workflows and real infrastructure integrations (PostgreSQL transactions, migrations, gRPC interceptor auth/space propagation). Tagged with `//go:build integration` and run sequentially (`-p=1`) against PostgreSQL. Never duplicate unit test permutations in integration tests.
   - See [Testing Conventions & Guide](docs/conventions/testing.md).

3. **Code Generation Toolchain**:
   - `tools/mockgen`: Generates thread-safe mock structs from `@Mock` interface annotations.
   - `tools/txgen`: Auto-generates transaction decorators (`coordinator_tx.go`).
   - `tools/loggen`: Auto-generates structured `slog` logging decorators (`coordinator_log.go`).
   - `tools/protoc-gen-*`: Custom plugins generating TypeScript clients (`protoc-gen-ts-simple`), scheduler runners (`protoc-gen-go-scheduler`), message schemas (`protoc-gen-go-message`), and Go SDKs (`protoc-gen-go-sdk`).
   - Rebuild plugins and regenerate API bindings with `make codegen`.
   - See [Backend Architecture Conventions](docs/conventions/backend.md).

4. **Declarative API Auth & Tenant (Space) Scoping**:
   - APIs configure `authentication.rules` (`auth_required`, `access_levels`) and `space.rules` (`scoped: true/false`) in `api/**/*.yaml`.
   - `AuthInterceptor` verifies JWT bearer tokens and sets `auth.PrincipalFromContext(ctx)`.
   - `SpaceInterceptor` requires `space-id` metadata header, verifies membership via `MemberStore`, and sets `auth.SpaceIDFromContext(ctx)` & `auth.SpaceRoleFromContext(ctx)`.
   - See [API & Protobuf Conventions](docs/conventions/api.md).

5. **AIP Resource Design**:
   - Standard CRUD methods (`Get`, `Create`, `Update`) return the resource directly per AIP-134 (e.g. `User`, `Settings`), **never** a wrapped `...Response` message.
   - Custom actions follow AIP-136 (`:approve`, `:reject`, `:setup`).
   - See [API & Protobuf Conventions](docs/conventions/api.md).

6. **Timezone & Date Math**:
   - **Never** format dates inline or hardcode UTC in UI components (`new Date().toLocaleDateString(...)`).
   - Always consume `const tz = useTimezone()` from `@saturn/hooks`.
   - Use `COMMON_TIMEZONES` from `@saturn/core` for timezone selection.
   - See [Frontend Conventions](docs/conventions/frontend.md).

7. **Monorepo Boundaries**:
   - `@saturn/core` must maintain **zero runtime dependencies** (standard Web/Node APIs only).
   - `@saturn/hooks` houses shared React hooks & contexts.
   - **Never** cross-import between `apps/web` and `apps/mobile`.
   - See [Frontend Conventions](docs/conventions/frontend.md).

8. **Mobile-First Patterns**:
   - Never edit `ios/` or `android/` folders directly (Continuous Native Generation).
   - Use `npx expo install <package>` for SDK-compatible versions.
   - See [Mobile Conventions](docs/conventions/mobile.md).

---

## Verification Gates

Always format, lint, typecheck, and test modified subsystems before declaring any task complete:

### 1. Verification Matrix

| Subsystem Modified | Format | Lint & Typecheck | Tests |
| :--- | :--- | :--- | :--- |
| **Frontend & Mobile** (`apps/*`, `packages/*`) | `make web-format` | `make web-typecheck`<br>`make web-lint` | *(typecheck in all 6 packages)* |
| **Backend** (`internal/`, `cmd/`) | `gofmt -w <file>` | `make lint-go` | `make test-unit`<br>`make test-integration` |
| **Database & Storage** (`internal/domain/*/storage`, `migrations/`) | `gofmt -w <file>` | `make lint-go` | `make test-integration` |
| **Protobuf / API** (`api/**/*.proto`) | `buf format -w` | `make lint-proto`<br>`make web-typecheck` | `make test-unit` |
| **Full Suite** (Pre-commit / Global) | `make web-format` | `make lint` | `make test` |

### 2. Commands Quick Reference

- **Formatters**:
  - `make web-format`: Prettier across web, mobile, and shared packages.
  - `gofmt -w <file>`: Standard Go formatting.
- **Linters & Typecheck**:
  - `make web-typecheck`: TypeScript compiler (`tsc --noEmit`) across all 6 monorepo packages.
  - `make web-lint`: ESLint across web and mobile packages.
  - `make lint-go`: `golangci-lint run ./...` for Go static analysis and unused checks.
  - `make lint-proto`: `buf lint` for Protobuf API standards.
  - `make lint`: Umbrella target running all linters (`lint-go`, `web-lint`, `web-typecheck`, `lint-proto`).
- **Tests**:
  - `make test-unit`: Fast in-memory unit tests with race detection (`go test -race ./...`).
  - `make test-integration`: Integration test suites against PostgreSQL (`go test -tags=integration -p=1 -v ./tests/...`).
  - `make test`: Runs both `test-unit` and `test-integration`.
  - `make test-coverage`: Generates coverage profile and validates coverage threshold (`tools/covercheck`).

---

## Detailed Convention References

- [API & Protobuf Conventions](docs/conventions/api.md) — Resource-oriented design, AIP-134/136 rules, and Protobuf generation.
- [Backend Architecture Conventions](docs/conventions/backend.md) — Domain vs. application vs. storage separation, error handling, and transaction management.
- [Testing Conventions & Guide](docs/conventions/testing.md) — Table-driven tests, generated `@Mock` interfaces, and integration test setup.
- [Frontend & Monorepo Conventions](docs/conventions/frontend.md) — Package dependency rules, `useTimezone` ergonomics, and React Query cache invalidation.
- [Mobile App Conventions](docs/conventions/mobile.md) — Expo Router, CNG rules, haptic patterns, and mobile UI tokens.
