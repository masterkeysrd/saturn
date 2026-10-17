# Go Backend Architecture & Conventions

Saturn's backend follows clean hexagonal architecture with explicit layering.

---

## 1. Directory Structure & Responsibilities

```
internal/
├── domain/                      # 1. Pure Domain Layer (Entities, Service, Storage Ports)
│   └── <module>/                # e.g., finance, identity, space
│       ├── <entity>.go          # Entity definitions, domain rules, and methods (user.go, budget.go, etc.)
│       ├── service.go           # Domain service orchestrating domain rules & state validations
│       ├── storage.go           # Storage interfaces (UserStore, SessionStore, etc.) with @Mock annotations
│       ├── errors.go            # Domain-specific sentinel errors
│       └── storage/             # Pure SQL persistence layer
│           ├── postgres.go      # Aggregated Store struct & New(db) constructor
│           └── <entity>_store.go# Concrete SQL implementations (user_store.go, budget_store.go, etc.)
├── application/                 # 2. Application Layer (Commands, Orchestration & Use Cases)
│   └── <module>/                # e.g., iam, finance, space, agent, integration
│       ├── coordinator.go       # Coordinator interface, struct, and constructor
│       ├── <use_case>.go        # Feature use cases (login.go, mfa.go, budgeting.go, transactions.go)
│       ├── coordinator_tx.go    # Auto-generated transaction decorators (txgen)
│       └── coordinator_log.go   # Auto-generated structured logging decorators (loggen)
├── aggregator/                  # 3. Aggregator Layer (CQRS Read Projections & Multi-Entity Views)
│   └── <module>/                # e.g., finance, space
│       ├── service.go           # Aggregator service interface & constructor
│       ├── <entity>.go          # Complex hydrated query projections (budget.go, transaction.go)
│       └── mocks_test.go        # Generated mocks for aggregator tests
├── transport/                   # 4. Transport Layer (gRPC, HTTP, Webhooks)
│   ├── grpc/<module>/           # gRPC service implementation (routes commands -> coordinators, queries -> aggregators)
│   └── http/                    # REST gateway, middleware, and webhooks
└── platform/                    # 5. Shared Foundation Infrastructure
    ├── db/                      # Connection pooling & migrations
    ├── errors/                  # Semantic error kinds (NotFound, PermissionDenied, InvalidArgument)
    ├── id/                      # Type-prefixed ID generators (usr_, spc_, txn_)
    ├── log/                     # Structured slog logging
    └── settings/                # Centralized dynamic JSONB settings engine
tools/                           # 6. Code Generation & Analysis Toolchain
├── mockgen/                     # Generates thread-safe mocks from @Mock annotated interfaces
├── txgen/                       # Generates database transaction decorators (coordinator_tx.go)
├── loggen/                      # Generates structured slog decorators (coordinator_log.go)
├── protoc-gen-ts-simple/        # Generates TypeScript clients & React Query hooks for packages/api
├── protoc-gen-go-scheduler/     # Generates Go scheduler runners from proto definitions
├── protoc-gen-go-message/       # Generates event bus message schemas & envelopes
├── protoc-gen-go-sdk/           # Generates Go client SDKs for cross-domain calls
└── covercheck/                  # Evaluates and enforces test coverage thresholds
```

---

---

## 2. Core Backend Layers (CQRS & Pure Storage)

```
[ Client / Network ]
         │
         ▼
┌────────────────────────────────────────────────────────┐
│ 1. Transport Layer (internal/transport/)               │
│    - Protocol decoding (gRPC, HTTP, Webhook)           │
│    - Interceptors (Auth, Space, Logging, Recovery)     │
│    - Routes mutating actions -> Coordinators (App)     │
│    - Routes read queries -> Aggregators                │
│    - Maps platform errors -> gRPC/HTTP status codes    │
└────────────────────────────────────────────────────────┘
          │                                  │
 (Commands / Mutations)             (Complex Read Queries)
          │                                  │
          ▼                                  ▼
┌──────────────────────────────┐   ┌──────────────────────────────┐
│ 2A. Application Layer        │   │ 2B. Aggregator Layer         │
│     (internal/application/)  │   │     (internal/aggregator/)   │
│ - Use-case Coordinators      │   │ - CQRS read query models     │
│ - Transaction boundaries (tx)│   │ - Hydration & batch joins    │
│ - Event publishing           │   │ - Parallel multi-entity fetch│
│ - Structured audit logs      │   │ - View projections           │
└──────────────────────────────┘   └──────────────────────────────┘
          │                                  │
          └─────────────────┬────────────────┘
                            ▼
┌────────────────────────────────────────────────────────┐
│ 3. Pure Domain Layer (internal/domain/)                │
│    - Entity structs & business invariants              │
│    - Domain Service (state machines, token rotation)   │
│    - Storage Interfaces (storage.go with @Mock)        │
│    - Sentinel errors (errors.go)                       │
└────────────────────────────────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│ 4. Storage Layer (internal/domain/<module>/storage/)   │
│    - Concrete SQL queries & row scanning               │
│    - PostgreSQL store implementations                  │
│    - STRICTLY ZERO business logic                      │
└────────────────────────────────────────────────────────┘
```

---

### Layer 1: Transport Layer (`internal/transport/`)

**Purpose**: Adapts external network requests to Saturn's internal application and aggregator interfaces.

- **Responsibilities**:
  - Implements gRPC service handlers (`grpc/<module>/handler.go`) and HTTP gateway routes.
  - Extracts security context from incoming metadata via `internal/foundation/auth`:
    - `auth.PrincipalFromContext(ctx)` (authenticated user ID, session ID, access level).
    - `auth.SpaceIDFromContext(ctx)` and `auth.SpaceRoleFromContext(ctx)` (tenant workspace context).
  - Unmarshals protobuf requests and routes commands to Application Coordinators and queries to Aggregators.
  - Translates `internal/platform/errors` kinds into gRPC `codes.Code` and HTTP status codes via transport interceptors.
- **Allowed**:
  - Importing gRPC stubs, HTTP packages, application coordinators, aggregators, `internal/foundation/auth`, and `internal/platform/errors`.
- **Forbidden**:
  - **NO database operations**: Never import `storage/` or execute SQL in transport.
  - **NO business logic**: Do not perform entity validation, calculations, or state transitions in transport handlers.
  - **NO raw error leakage**: Never expose raw database errors or stack traces to clients.

---

### Layer 2A: Application Layer (`internal/application/`)

**Purpose**: Orchestrates use cases, command workflows, transactions, and event emissions.

- **Responsibilities**:
  - Implements Coordinators (`coordinator.go` and feature files like `budgeting.go`, `login.go`).
  - Verifies authorization requirements for operations (e.g. checking whether `SpaceContext.Role` is admin before modifying settings).
  - Manages database transaction boundaries using `tx.Run` or auto-generated `coordinator_tx.go`.
  - Emits domain events to the event bus and enqueues background scheduler jobs.
  - Wrapped by `LoggingCoordinator` (`coordinator_log.go` generated by `loggen`) for structured audit logging.
- **Allowed**:
  - Calling domain services, store interfaces, event bus, and external integration adapters.
- **Forbidden**:
  - **NO direct SQL**: Never write SQL queries or import database drivers in application coordinators.
  - **NO transport imports**: Never import `google.golang.org/grpc`, `net/http`, or protobuf transport stubs.
  - **NO domain invariant bypass**: Never mutate entity state directly; always call domain entity methods or domain services.

---

### Layer 2B: Aggregator Layer (`internal/aggregator/`)

**Purpose**: High-performance CQRS read projections and multi-entity query hydration that keep read queries decoupled from command coordinators.

- **Responsibilities**:
  - Implements read aggregation services (`financeaggregator`, `spaceaggregator`).
  - Hydrates domain models in parallel (e.g. fetching budget period spent bounds, exchange rates, and line-item counts in concurrent goroutines).
  - Supports flexible view projections (e.g. `ViewBasic` vs `ViewFull`).
  - Depends on decoupled domain service interfaces (`FinanceService` with `@Mock`).
- **Allowed**:
  - Calling domain services, in-memory projections, sorting, cursor-based pagination, and concurrent fetches.
- **Forbidden**:
  - **NO direct SQL**: Aggregators must query through Domain Service or Store ports; never execute direct SQL.
  - **NO mutations**: Aggregators are strictly read-only. All mutations and transactional state changes belong in Layer 2A Coordinators.
  - **NO transport imports**: Zero gRPC or HTTP transport imports.

---

### Layer 3: Domain Layer (`internal/domain/`)

**Purpose**: Encapsulates pure business entities, domain services, lifecycle state rules, and persistence contracts.

- **Structure**:
  - `<entity>.go`: Pure domain models, constructors (`New...`), validation rules, calculations (e.g. `Budget.CalculateBounds`), and status state machines.
  - `service.go`: Domain service governing business logic across entities (e.g. password verification, token rotation, session lifecycle, compromise detection).
  - `storage.go`: Storage interfaces (`*Store` and aggregate `Storage`) decorated with `//go:generate go run .../tools/mockgen .`.
  - `errors.go`: Domain-specific sentinel errors (`ErrUserNotFound`, `ErrInvalidCredentials`).
- **Allowed**:
  - Pure Go code, standard library (`time`, `crypto`), `internal/platform/id`, and `internal/platform/errors`.
- **Forbidden**:
  - **STRICTLY ZERO database imports**: Never import `database/sql`, `pgx`, `lib/pq`, or any SQL driver.
  - **STRICTLY ZERO transport imports**: Never import `net/http`, `google.golang.org/grpc`, or network stubs.
  - **STRICTLY ZERO framework dependencies**: The domain must remain 100% pure, self-contained Go.

---

### Layer 4: Storage Layer (`internal/domain/<module>/storage/`)

**Purpose**: Pure PostgreSQL persistence implementation of the domain's storage contracts.

- **Structure**:
  - `postgres.go`: Root `Store` struct implementing the domain's `Storage` interface with constructor `New(db *sql.DB) Storage`.
  - `<entity>_store.go`: Concrete SQL implementation for each entity store (e.g. `user_store.go`, `transaction_store.go`).
- **Responsibilities**:
  - Executes raw SQL queries, row scans, parameter binding, and connection pool management.
- **Forbidden**:
  - **STRICTLY ZERO BUSINESS LOGIC**:
    - **NO** token rotation or compromise detection rules.
    - **NO** password hashing or salt generation.
    - **NO** session expiration or lifecycle validation logic.
    - **NO** status transitions or business rule evaluations.
  - The storage layer blindly stores and retrieves data as commanded by the domain and application layers. All business decisions happen in Layer 3 or Layer 2.

---

## 3. Cross-Cutting Foundation (`internal/platform/`)

- **`platform/errors`**: Defines typed semantic error kinds (`NotFound`, `PermissionDenied`, `InvalidArgument`, `FailedPrecondition`, `Conflict`) with call operation tracing.
- **`platform/id`**: Type-prefixed ID generation (e.g. `usr_...`, `spc_...`, `txn_...`).
- **`platform/settings`**: Dynamic, scoped JSONB workspace/system settings engine with optimistic concurrency control.
- **`foundation/auth`**: Request context carrier for `Principal` (user ID, session ID, access level) and `SpaceContext` (space ID, member role).

---

---

## 4. Go 1.27 Language Standards & Idioms

All backend Go code in Saturn adheres to **Go 1.27 (`go 1.27.2`)**. Engineers and AI agents must strictly follow modern language idioms and standard library capabilities.

### A. Generic Methods (`func (r *Receiver) Method[T any](...)`)
Go 1.27 introduces full language support for type parameters on methods. Whenever a generic operation logically belongs to a receiver type, define a **generic method** on the receiver rather than a standalone package-level generic helper function or an untyped `any` callback wrapper.

Saturn adopts canonical generic receiver methods across platform engines:
1. **Patch Schemas (`internal/platform/patch`)**:
   Register typed entity fields directly on `*patch.Schema[E]` using the generic `.Field` method (`func (s *Schema[E]) Field[V any](path string, accessor func(*E) *V, validators ...Validator[V]) *Schema[E]`):
   ```go
   var AccountPatchSchema = patch.NewSchema[Account]().
       Field("name", func(a *Account) *string { return &a.Name }, ValidateAccountName).
       Field("balance_cents", func(a *Account) *int64 { return &a.BalanceCents })
   ```
2. **Scheduler Engine (`internal/platform/scheduler`)**:
   Register strongly-typed JSON job handlers directly on `*scheduler.Engine`:
   ```go
   // Generic method e.RegisterJSON[T any](jobType string, handler func(context.Context, *T) error)
   e.RegisterJSON("finance.statement.reconcile", func(ctx context.Context, payload *ReconcilePayload) error {
       return coordinator.Reconcile(ctx, payload)
   })
   ```
3. **EventBus Engine (`internal/platform/eventbus`)**:
   Publish and subscribe to strongly-typed Protobuf messages directly on `*eventbus.Engine`:
   ```go
   // Generic methods eb.PublishProto[M proto.Message](ctx, topic, msg) and eb.SubscribeProto[M, PM](topic, subscriberID, handler)
   err := eb.PublishProto(ctx, "finance.budget.created", budgetProto)

   eb.SubscribeProto("finance.budget.created", "aggregator-cache-sync", func(ctx context.Context, msg *financev1.Budget) error {
       return cache.Invalidate(ctx, msg.Id)
   })
   ```

### B. Modern JSON Serialization (`encoding/json/v2` & `encoding/json/jsontext`)
Saturn standardizes strictly on Go 1.27's `encoding/json/v2`.
- **Imports**: Always import `"encoding/json/v2"` (and `"encoding/json/jsontext"` for formatting, streaming, or raw tokens). **Never** import legacy `"encoding/json"` v1.
- **Byte Slice Operations**: Use `json.Marshal(v)` and `json.Unmarshal(data, &v)`.
- **Stream I/O (`io.Writer` / `io.Reader`)**: Use `json.MarshalWrite(w, v)` and `json.UnmarshalRead(r, &v)` instead of legacy `json.NewEncoder(w).Encode(v)` and `json.NewDecoder(r).Decode(&v)`.
- **Raw JSON Values**: Use `jsontext.Value` instead of legacy `json.RawMessage`.
- **Indented Formatting**: Use `json.Marshal(v, jsontext.WithIndent("  "))` instead of legacy `json.MarshalIndent`.
- **Inlined Struct Fields (`json:",embed"`)**: When flattening a named struct field into its parent JSON object, use `json:",embed"` (alongside anonymous struct embedding).
- **Deterministic Map Key Ordering**: Pass `json.Deterministic(true)` to `json.Marshal` when deterministic key sorting is required (e.g. canonical audit signatures or test snapshot comparisons):
  ```go
  data, err := json.Marshal(payload, json.Deterministic(true), jsontext.WithIndent("  "))
  ```

### C. Embedded Structs & Flat Composite Literals (`embedlit`)
Go 1.27 allows any valid field selector—including promoted fields of embedded value structs—to be used directly as a key in a composite literal (`Outer{PromotedField: val}`).
1. **Prefer Struct Embedding Over Field Duplication**:
   When an application or aggregator filter/request/response type extends or forwards a domain struct without changing its field types (e.g. `financeaggregator.ListBudgetsFilter`, `iam.ListUsersFilter`, `iam.DeleteMFAFactorRequest`, `financeapp.AdjustAccountBalanceRequest`), **embed the domain struct by value** instead of duplicating its fields and copying them field-by-field:
   ```go
   // Correct: Embed domain struct by value
   type ListBudgetsFilter struct {
       finance.ListBudgetsFilter
       TargetDate time.Time
       View       ViewType
   }
   ```
2. **Initialize Promoted Fields Directly in Composite Literals**:
   Always initialize promoted fields of embedded value structs flatly on the outer struct literal. Never write redundant nested struct literals for embedded value structs:
   ```go
   // Correct (Go 1.27 flat promoted field keys)
   filter := financeaggregator.ListBudgetsFilter{
       PageSize:   20,
       Statuses:   []finance.BudgetStatus{finance.BudgetStatusActive},
       TargetDate: now,
       View:       financeaggregator.ViewFull,
   }

   // Anti-Pattern: DO NOT nest the embedded struct literal
   filter := financeaggregator.ListBudgetsFilter{
       ListBudgetsFilter: finance.ListBudgetsFilter{
           PageSize: 20,
           Statuses: []finance.BudgetStatus{finance.BudgetStatusActive},
       },
       TargetDate: now,
       View:       financeaggregator.ViewFull,
   }
   ```
   *(Note: Promoted field keys in composite literals apply to value-embedded structs `T`, not pointer-embedded structs `*T`.)*

### D. Typed Error Inspection (`errors.AsType[E]`)
Always use `errors.AsType[E](err)` (from `internal/platform/errors` or standard library `errors.AsType`) instead of declaring a mutable target variable with `var target E; errors.As(err, &target)`:

```go
// Correct (Go 1.27 functional type assertion)
if pgErr, ok := errors.AsType[*pgconn.PgError](err); ok {
    if pgErr.Code == "23505" {
        return errors.Conflict("entity already exists")
    }
}

if domErr, ok := errors.AsType[*errors.Error](err); ok {
    log.Warn("domain operation rejected", "kind", domErr.Kind, "op", domErr.Op)
}

// Anti-Pattern: DO NOT USE
var pgErr *pgconn.PgError
if errors.As(err, &pgErr) { ... }
```

### E. Value Pointer Construction (`new(expr)`)
Use Go 1.27's built-in `new(expr)` expression to allocate a pointer initialized to a value in a single concise step:
- Construct literal pointers directly: `new("active")`, `new(int64(100))`, `new(true)`.
- Pass dynamic values: `new(v)`, `new(req.GetAmount())`.
- **Anti-Pattern**: Do not declare intermediate temporary variables (`temp := expr; &temp`) or define custom pointer helper functions (`ptrString(s)`).

### F. Modern Standard Library Idioms
1. **String Manipulation**:
   - Use `strings.Cut`, `strings.CutLast` (Go 1.27), `strings.CutPrefix`, and `strings.CutSuffix` instead of manual `strings.Index` / `strings.LastIndex` arithmetic combined with manual slice indexing:
     ```go
     // Extract resource name and ID using CutLast
     prefix, id, found := strings.CutLast(fullPath, "/")
     ```
   - Use iterator-based `strings.SplitSeq` and `strings.FieldsSeq` in `for ... range` loops to eliminate intermediate slice allocations:
     ```go
     for segment := range strings.SplitSeq(csvLine, ",") {
         process(segment)
     }
     ```
2. **Slices, Maps & Loops**:
   - **Slices**: Use `slices.Contains`, `slices.Sort`, `slices.Compact`, and `slices.Backward(slice)` for zero-allocation reverse iteration (`for i, item := range slices.Backward(history)`).
   - **Maps**: Use `maps.Copy`, `maps.Clone`, and `maps.DeleteFunc`.
   - **Built-in Min/Max**: Use built-in `min(a, b)` and `max(a, b)` rather than custom conditionals or math conversions.
   - **Integer Range Loops**: Use `for i := range n` instead of `for i := 0; i < n; i++`.

### G. Code Modernization Check (`go fix`)
Saturn maintains automated modernization passes (including `embedlit`, `newexpr`, `errorsastype`, `rangeint`, `stringsseq`, and `slicescontains`). Before committing backend changes or submitting PRs, run `go fix` to ensure modern idioms are consistently applied:
```bash
go fix ./api/... ./cmd/... ./internal/... ./tools/... ./tests/...
```

---

## 5. Code Generation Toolchain (`tools/`, `internal/codegen/`)

Saturn leverages custom code generators to automate boilerplate, maintain type-safety, and decorate coordinators consistently:

### A. Core Architecture Generators

1. **`tools/mockgen`**:
   - Scans files for interfaces decorated with `// @Mock`.
   - Generates thread-safe mock structs with recorded call histories in `mocks_test.go`.
   - Invocation: `//go:generate go run github.com/masterkeysrd/saturn/tools/mockgen .`

2. **`tools/txgen`**:
   - Generates database transaction decorators (`coordinator_tx.go`).
   - Automatically wraps coordinator methods inside `tx.Run(ctx, func(txCtx context.Context) error { ... })`.

3. **`tools/loggen`**:
   - Generates structured logging decorators (`coordinator_log.go`).
   - Wraps coordinator methods with execution latency measurement, request parameters, and error logging via `slog`.

### B. Protobuf & Transport Plugins (`tools/protoc-gen-*`)

Invoked via `buf generate` / `make codegen`:

1. **`protoc-gen-ts-simple`**: Generates type-safe TypeScript API clients and React Query hooks (`packages/api/gen`).
2. **`protoc-gen-go-scheduler`**: Generates Go worker stubs and task schedulers from proto annotations.
3. **`protoc-gen-go-message`**: Generates event bus message envelopes and payload serializers.
4. **`protoc-gen-go-sdk`**: Generates internal Go client SDKs for cross-domain RPC.

### C. Quality & Coverage Enforcement

- **`tools/covercheck`**: Evaluates coverage profile (`coverage/coverage.out`) and asserts package coverage against defined thresholds during `make test-coverage`.

---

## 6. Testing & Verification

Saturn strictly segregates fast unit tests from workflow integration suites:

- **Unit Tests (`internal/**/*_test.go`) — ALWAYS REQUIRED**:
  - Mandatory for 100% of domain entities, services, application coordinators, and aggregator queries.
  - Fast, in-memory, zero database access (`make test-unit`). Table-driven with `@Mock` generated mocks.
- **Integration Tests (`tests/**/*_test.go`) — REQUIRED FOR WORKFLOWS & INTEGRATIONS**:
  - Required specifically to validate multi-step workflows (e.g. signup $\rightarrow$ approval $\rightarrow$ workspace setup; budget $\rightarrow$ transactions $\rightarrow$ bounds) and infrastructure integration points (PostgreSQL transactions, rollbacks, migrations, gRPC interceptors).
  - Tagged with `//go:build integration` and executed sequentially (`make test-integration`).
- **Detailed Testing Guide**: See [Testing Conventions & Guide](testing.md) for table-driven patterns, mock assertions, and the fluent test driver.

```bash
go fix ./...           # Modernize code with Go 1.27 fix passes
gofmt -w <file>        # Format modified Go source files
make lint-go           # Run golangci-lint static analysis
make test-unit         # Run Go unit tests with race detection (go test -race ./...)
make test-integration  # Run integration tests against test PostgreSQL
make test-coverage     # Generate coverage report and verify threshold
```
