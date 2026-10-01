# Testing Conventions & Guide

Saturn enforces strict testing standards across unit, domain, application, and integration layers.

---

## 1. Test Scope & Mandatory Requirements

### A. Backend Unit Tests — ALWAYS Required
Unit tests are **always mandatory** for every backend feature:
- **Scope**: Every domain entity, domain service (`service.go`), application coordinator (`<use_case>.go`), and aggregator query (`<entity>.go`).
- **Isolation**: 100% in-memory, parallel-safe (`-race`), **zero database calls**, zero network I/O.
- **Strategy**: Table-driven tests with `@Mock` generated mocks for all dependencies.
- **Standard Cases**: Success, unauthenticated/unauthorized contexts, nil/invalid inputs, and domain error propagation.

### B. Backend Integration Tests — Required for Workflows & Integrations ONLY
Integration tests (`tests/` with `//go:build integration`) run against a live PostgreSQL instance. They are **required specifically to cover end-to-end workflows and infrastructure integrations**:

1. **Multi-Step Workflows**:
   - Sequential user lifecycles: User Registration $\rightarrow$ Admin Approval $\rightarrow$ Login $\rightarrow$ Space Setup $\rightarrow$ Member Invitation.
   - Financial lifecycles: Account creation $\rightarrow$ Budget definition $\rightarrow$ Transaction posting $\rightarrow$ Period spent calculation & limit enforcement.
   - Statement processing: File import $\rightarrow$ Parsing $\rightarrow$ Transaction matching $\rightarrow$ Balance reconciliation.
2. **Infrastructure & System Boundaries**:
   - Real PostgreSQL transactions (`tx.Run`), rollbacks, schema migrations, and database constraints (foreign keys, uniqueness).
   - End-to-end transport pipelines: gRPC request $\rightarrow$ `AuthInterceptor` $\rightarrow$ `SpaceInterceptor` $\rightarrow$ handler $\rightarrow$ error mapping.
   - Event bus publishing, consumer delivery, and background scheduler jobs.

> [!IMPORTANT]
> **Anti-Pattern**: Do **not** duplicate unit test permutations in integration tests. Never write integration tests for simple input validations, nil checks, or parameter bounds that can be verified in milliseconds with in-memory unit tests. Reserve integration tests for full workflows and real integration points.

| Test Type | Location | Requirement | Execution | Database | Command |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Unit Tests** | `internal/**/*_test.go` | **Always Mandatory** | In-memory, `-race` | **Zero DB** (mocked) | `make test-unit` |
| **Domain Tests** | `internal/domain/*_test.go` | **Always Mandatory** | In-memory, pure logic | **Zero DB** | `make test-unit` |
| **Aggregator Tests**| `internal/aggregator/**/*_test.go`| **Always Mandatory** | In-memory, mocked services | **Zero DB** | `make test-unit` |
| **Integration Tests**| `tests/**/*_test.go` | **Mandatory for Workflows/Integrations** | Sequential (`-p=1`), `integration` tag | **Real PostgreSQL** | `make test-integration` |
| **Coverage Floor** | Root / CI | Verified on pull requests | Profile & threshold check | Both | `make test-coverage` |

---

## 2. Table-Driven Tests Pattern

All unit and coordinator tests must use Go table-driven tests (`tests := []struct{ ... }`) with `t.Run(tc.name, ...)`.

### Standard Test Case Coverage

Every use case / coordinator method must test at least:
1. **Success / Happy Path**: Valid request and context return expected response and mutation.
2. **Unauthenticated / Unauthorized**: Request context missing `Principal` or `SpaceContext`, or insufficient permissions.
3. **Validation / Nil Requests**: `req == nil`, missing required payload entities, or invalid parameter bounds.
4. **Domain Error Propagation**: Underlying domain service or store returns an error (e.g. `ErrNotFound`, `ErrDuplicate`).

### Canonical Example

```go
func TestCoordinator_CreateBudget(t *testing.T) {
	tests := []struct {
		name          string
		ctx           context.Context
		req           *CreateBudgetRequest
		mockFn        func(ctx context.Context, rCtx finance.Context, budget *finance.Budget) (*finance.Budget, error)
		expectedID    finance.BudgetID
		expectedError bool
	}{
		{
			name: "Success",
			ctx:  newTestContext("spc_1", "usr_1"),
			req: &CreateBudgetRequest{
				Budget: &finance.Budget{Name: "Dining", LimitAmount: 50000},
			},
			mockFn: func(ctx context.Context, rCtx finance.Context, budget *finance.Budget) (*finance.Budget, error) {
				if rCtx.SpaceID() != "spc_1" || budget.Name != "Dining" {
					t.Errorf("unexpected budget payload: space=%v budget=%+v", rCtx.SpaceID(), budget)
				}
				return &finance.Budget{ID: "bgt_1", Name: budget.Name}, nil
			},
			expectedID:    "bgt_1",
			expectedError: false,
		},
		{
			name:          "Unauthenticated",
			ctx:           context.Background(),
			req:           &CreateBudgetRequest{Budget: &finance.Budget{Name: "Dining"}},
			expectedError: true,
		},
		{
			name:          "Nil request",
			ctx:           newTestContext("spc_1", "usr_1"),
			req:           nil,
			expectedError: true,
		},
		{
			name: "Domain error propagation",
			ctx:  newTestContext("spc_1", "usr_1"),
			req:  &CreateBudgetRequest{Budget: &finance.Budget{Name: "Dining"}},
			mockFn: func(ctx context.Context, rCtx finance.Context, budget *finance.Budget) (*finance.Budget, error) {
				return nil, errors.New("budget name exists")
			},
			expectedError: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			fsMock := &FinanceServiceMock{CreateBudgetFunc: tc.mockFn}
			coord := NewCoordinator(Dependencies{FinanceService: fsMock})

			res, err := coord.CreateBudget(tc.ctx, tc.req)
			if tc.expectedError {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if res == nil || res.ID != tc.expectedID {
				t.Errorf("expected ID %v, got %+v", tc.expectedID, res)
			}
		})
	}
}
```

---

## 3. Mocking Strategy (`tools/mockgen`)

Saturn avoids bulky third-party mock libraries (`gomock`, `testify/mock`) in favor of light, fast, thread-safe mocks generated by our own generator.

### 1. Annotate Interfaces with `@Mock`

Annotate any storage interface or domain dependency in doc comments:

```go
//go:generate go run github.com/masterkeysrd/saturn/tools/mockgen .

// FinanceService defines decoupled domain operations required by coordinators or aggregators.
// @Mock
type FinanceService interface {
	GetBudget(ctx context.Context, rCtx finance.Context, id finance.BudgetID) (*finance.Budget, error)
	CreateBudget(ctx context.Context, rCtx finance.Context, budget *finance.Budget) (*finance.Budget, error)
}
```

### 2. Generate Mocks

Run `go generate` inside the package directory, or use `mockgen`:

```bash
go generate ./internal/domain/...
go generate ./internal/application/...
# or scan entire directory
go run ./tools/mockgen -dir ./internal/domain -all
```

This generates `mocks_test.go` with:
- Thread-safe method implementations using `sync.RWMutex`.
- Function fields for overriding behavior: `mock.GetBudgetFunc = func(...) ...`.
- Call history tracking: `mock.GetBudgetCalls() []struct{ ... }`.
- Compile-time interface assertion: `var _ FinanceService = (*FinanceServiceMock)(nil)`.

### 3. Assert Mock Calls

Verify that methods were called with the expected parameters and frequency:

```go
calls := fsMock.CreateBudgetCalls()
if len(calls) != 1 {
    t.Fatalf("expected 1 call to CreateBudget, got %d", len(calls))
}
if calls[0].Budget.Name != "Dining" {
    t.Errorf("expected budget name Dining, got %s", calls[0].Budget.Name)
}
```

---

## 4. Integration Tests (`tests/`)

Integration tests run against real PostgreSQL instances and verify full transport, authentication, database migrations, and transactions end-to-end.

### Rules for Integration Tests

1. **Build Tag**: Every file under `tests/` must declare `//go:build integration` on line 1.
2. **Sequential Run**: Tests execute with `-p=1` to avoid race conditions on shared database fixtures (`make test-integration`).
3. **Use the Test Driver (`tests/driver`)**:
   Use the fluent test driver to scaffold spaces, users, sessions, and client connections:

```go
//go:build integration

package space_test

import (
	"testing"
	"github.com/masterkeysrd/saturn/tests/driver"
)

func TestSpaceCreation(t *testing.T) {
	d := driver.New(t, testEnv)

	// Fluent authentication setup
	d.Auth().
		CreateApprovedUser(t).
		Login(t)

	// Exercise transport/gRPC client
	created, err := d.Space().CreateSpace(t, "Personal Workspace", "Primary space")
	if err != nil {
		t.Fatalf("failed to create space: %v", err)
	}

	if created.GetVersion() != 1 {
		t.Errorf("expected version 1, got %d", created.GetVersion())
	}
}
```

---

## 5. Test Coverage Verification (`tools/covercheck`)

Saturn enforces code coverage floors to prevent untested regressions:

```bash
make test-coverage
```

This target:
1. Generates `coverage/coverage.out` via `go test -coverprofile=...`.
2. Runs `go run ./tools/covercheck` to evaluate package coverage thresholds.
3. Produces an interactive HTML visualization at `coverage/coverage.html`.

---

## 6. Frontend & Mobile Testing Conventions

### A. Pure Packages (`packages/core`, `packages/schemas`)
- **Tool**: **Vitest** (runs pure TypeScript in milliseconds).
- **Scope**:
  - **Date & Timezone Math**: Test `startOfDay`, `endOfDay`, `isToday`, and IANA timezone shifts using explicit, fixed timestamps.
  - **Currency & Money Calculations**: Test conversion formulas, rounding precision, and symbol formatting.
  - **Zod Schemas**: Validate expected inputs, rejection of malformed payloads, and custom refinements.
- **Convention**: Test files are co-located with their source code (e.g., `timezone.test.ts` next to `timezone.ts`). Zero DOM or mocking needed.

### B. Shared Hooks (`packages/hooks`)
- **Tool**: **Vitest** + **`@testing-library/react`** (`renderHook`).
- **Scope**:
  - Verify context consumers (`useTimezone()`, `useSpace()`) behave correctly both inside explicit providers and with default fallback values.
  - Test custom stateful hook lifecycles, event dispatchers, and cleanup functions.

### C. Web Application (`apps/web`)
- **Tool**: **Vitest** + **`@testing-library/react`** + **`happy-dom`**.
- **What to Test**:
  - **Client Calculations & Utilities**: Complex algorithms (transaction-statement reconciliation matching, statement parsing, category totals).
  - **Form Validation & State**: Interactive form submission, dirty state tracking, and error messaging.
  - **Critical UI Components**: Complex widgets (date/timezone pickers, budget period sliders, filter sheets).
- **Anti-Patterns**:
  - Do **not** test static styling or pure markup (e.g. asserting Tailwind CSS utility classes).
  - Query elements by accessible role and label (`screen.getByRole("button", { name: /save/i })`), never CSS class selectors.

### D. Mobile Application (`apps/mobile`)
- **Tool**: **Jest** + **`jest-expo`** + **`@testing-library/react-native`**.
- **Why `jest-expo`**: Provides preconfigured mocks for React Native and Expo native modules (Expo Haptics, Expo Router, Safe Area Context) so tests run reliably in Node without native compilation.
- **What to Test**:
  - **Data Grouping**: Section list transforms such as `groupTransactionsByDate(transactions, tz.timezone)`.
  - **Mobile Hooks & State**: Navigation parameters, workspace switching, and theme token resolution.
  - **Haptic Feedback**: Assert that tactile feedback triggers (`haptics.light()`, `haptics.selection()`) execute on interactive taps and sheet dismissals.
  - **Input Components**: Number pads, currency inputs, and category selectors.
- **Anti-Patterns**:
  - Do **not** unit-test low-level native animations (Reanimated frame rates).
  - Never test generated native code under `ios/` or `android/` (managed by Continuous Native Generation).

---

## 7. Universal Frontend/Mobile Testing Rules

1. **Deterministic Timestamps**: Never invoke `Date.now()` or `new Date()` without passing a fixed reference date or mocking system time (`vi.setSystemTime`).
2. **Behavior Over Implementation**: Assert visible user interactions and displayed feedback rather than inspecting private component state.
3. **No Direct Network Access**: Mock API query hooks or network handlers; unit tests must never reach out to real external networks.
