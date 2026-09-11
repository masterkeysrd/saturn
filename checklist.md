# Architecture Homogeneity Checklist

This checklist tracks the architectural alignment of all domains across the Saturn repository. The goal is to achieve a homogenous, maintainable design adhering to our core platform principles.

---

## Homogenous Design Principles

1. **Storage & DB Abstraction**:
   - Stores inject the minimal [`db.DB`](file:///Users/masterkeysrd/Projects/saturn/internal/platform/db/db.go) interface instead of concrete `*sqlx.DB` or `*sql.DB`.
   - Driver error translation is transparent: stores never inspect `sql.ErrNoRows` or SQLSTATE codes; `db.Get` and `db.ExecOne` automatically return platform errors (`errors.NotExist`, `errors.Exist`, `errors.Invalid`, etc.).
   - Mutating operations that must affect exactly one row use `db.ExecOne(ctx, query, args...)`.
   - Native error imports: `"github.com/masterkeysrd/saturn/internal/platform/errors"` imported directly as `errors` (never aliased).

2. **Error Handling Architecture**:
   - Zero sentinel errors: eliminate `var Err... = errors.New(...)`.
   - Typed domain error codes: define `const Code<Name> errors.Code = "<domain>.<code_name>"`.
   - Structured error construction: `errors.E(op, kind, code, err, meta)`.
   - Canonical `Op` formatting:
     - Storage: `"domain/<domain>/storage.<Method>"`
     - Domain Service: `"domain/<domain>.<Method>"`
     - Application Coordinator: `"application/<domain>.<Method>"`
   - Domain services differentiate infrastructure failures from business conditions (e.g., distinguishing DB outage from `NotExist`).

3. **Optimistic Locking**:
   - Mutable entities include a `Version int64` field.
   - Updates enforce `WHERE id = $1 AND version = $N` and `SET version = $N + 1`.
   - Stores assert single-row updates with `ExecOne`.
   - Domain services detect version conflicts and classify them as `errors.Conflict` with code `<domain>.VersionMismatch`.

4. **Transaction Management**:
   - Coordinator interfaces declare atomic boundaries using `// @transactional` method annotations.
   - Code generation via `txgen` (`tools/txgen`) automatically produces transactional decorators (`Transactional<Target>`).
   - Context-first propagation: `ctx, tx, err := t.txr.Begin(ctx)` injects `*db.TxController` into `ctx`.
   - Safe lifecycle: `defer tx.Rollback()` is a zero-cost safe no-op after `tx.Commit()`; unexpected rollback failures are logged with `log.Error` ([`internal/platform/log`](file:///Users/masterkeysrd/Projects/saturn/internal/platform/log)).
   - Transparent store routing: stores inject minimal [`db.DB`](file:///Users/masterkeysrd/Projects/saturn/internal/platform/db/db.go); queries (`Get`, `Select`, `Exec`, `ExecOne`) automatically route through the active transaction on `ctx` via `db.TxFromContext(ctx)`.
   - Nested transaction safety: nested `Begin()` calls attach child controllers; if a nested transaction aborts, all ancestor transactions abort safely, preventing partial commits.

5. **Structured Logging ([`internal/platform/log`](file:///Users/masterkeysrd/Projects/saturn/internal/platform/log))**:
   - Standardized structured logging at entry/orchestration boundaries (coordinators and transport handlers) using `internal/platform/log`.
   - Domain and storage layers avoid logging errors directly; operational context bubbles up via `errors.Op` stack traces.
   - Audit logging for critical lifecycle events (e.g., user creation, member removal, statement finalization, financial transfers).

6. **Paging & Sorting**:
   - Standardized cursor-based or offset pagination using [`internal/platform/paging`](file:///Users/masterkeysrd/Projects/saturn/internal/platform/paging).
   - Unified limit guards and base64 cursor encoding/decoding.

7. **Transport & Interceptor Integration**:
   - gRPC handlers delegate error code mapping entirely to [`interceptors.UnaryServerInterceptor()`](file:///Users/masterkeysrd/Projects/saturn/internal/transport/grpc/interceptors/error.go).
   - Eliminate custom error mapping functions (e.g., `mapError`) and string matching (e.g., `strings.Contains(err.Error(), "access denied")`) in handlers.

8. **Coordinator Request Struct Convention**:
   - Coordinator methods accept a single pointer request struct (e.g., `CreateAgent(ctx, *CreateAgentRequest)`) rather than loose positional primitive parameters.
   - Preserves extensibility, backwards compatibility, and clean code generation (`txgen`, `loggen`).

9. **Store Purity & Ambient Transactions**:
   - Stores are pure persistence adapters: they must not contain business validation, invariant enforcement, or cross-aggregate orchestration.
   - Stores never manage local transactions (no `withTx`, no `db.Transactor` assertions). All database transactions are declared at the coordinator layer (`// @transactional`) and flow ambiently through `ctx` (`db.TxFromContext(ctx)`).

---

## 1. Space Domain (`internal/domain/space`)

### Status: Completed

- [x] **Database Abstraction & Storage**:
  - [x] Migrated [`SpaceStore`](file:///Users/masterkeysrd/Projects/saturn/internal/domain/space/storage/space_store.go) and [`MemberStore`](file:///Users/masterkeysrd/Projects/saturn/internal/domain/space/storage/member_store.go) from `*sqlx.DB` to `db.DB`.
  - [x] Replaced raw SQL queries with `goqu` query builder (`pgDialect`).
  - [x] Replaced manual rows-affected checks with `db.ExecOne`.
  - [x] Eliminated direct `database/sql` driver error imports and `sql.ErrNoRows` inspection.
  - [x] Unit tests for stores with mock DB in [`store_test.go`](file:///Users/masterkeysrd/Projects/saturn/internal/domain/space/storage/store_test.go).
- [x] **Error Handling & Domain Guards**:
  - [x] Sentinels removed; typed codes added in [`errors.go`](file:///Users/masterkeysrd/Projects/saturn/internal/domain/space/errors.go) (`space.CodeNotFound`, `space.CodeMemberNotFound`, `space.CodeRoleRequired`, `space.OwnerOnly`, `space.InvalidRole`, etc.).
  - [x] Domain service uses `errors.E(op, ...)` and distinguishes `NotExist` from DB connectivity errors.
  - [x] Canonical operation names applied (`"domain/space/storage.*"`, `"domain/space.*"`, `"application/space.*"`).
  - [x] Domain service unit tests updated to assert `errors.KindOf` and `errors.CodeOf`.
  - [x] Protected workspace owner: prevented owner demotion or removal, and restricted owner role assignment in `UpdateSpaceMemberRole` and `RemoveSpaceMember`.
- [x] **Paging Standardization**:
  - [x] Keyset pagination returning `*paging.Page[T]` across `SpaceStore` (`ListByUser`, `ListByUserOwned`), `MemberStore` (`ListBySpace`), `Service`, `Aggregator`, and `Coordinator`.
  - [x] Applied `paging.ApplyPagination` with direction, limit, and cursor decoding; returned `paging.NewPage` with opaque base64 cursor tokens.
  - [x] Transport handler unpacks `page.Items` and sets `next_page_token = page.NextPageToken`.
- [x] **Query Aggregator Pattern**:
  - [x] Created `internal/aggregator/space` to separate CQRS reads from transactional coordinator writes.
  - [x] Enriched member listings with user profiles hydrated from the Identity service without N+1 queries.
  - [x] Wired space aggregator into gRPC transport handler and application dependency injection in `server.go`.
- [x] **Transport Layer**:
  - [x] [`handler.go`](file:///Users/masterkeysrd/Projects/saturn/internal/transport/grpc/space/handler.go) clean, passes errors directly to gRPC interceptor without manual switch/cases.
  - [x] Unpacks `*paging.Page[T]` items and maps next page tokens.
- [x] **Frontend Integration & Forms**:
  - [x] Added `spaces` tab to `SettingsView` ([`settings-view.tsx`](file:///Users/masterkeysrd/Projects/saturn/apps/web/features/settings/settings-view.tsx)) enabling direct workspace management at `/settings?tab=spaces` and `/spaces`.
  - [x] Integrated `SpaceSelector` ([`space-selector.tsx`](file:///Users/masterkeysrd/Projects/saturn/apps/web/components/space-selector.tsx)) "Manage Spaces" to navigate to `/settings?tab=spaces`.
  - [x] Added "Workspaces" entry in [`app-sidebar.tsx`](file:///Users/masterkeysrd/Projects/saturn/apps/web/components/app-sidebar.tsx) profile menu.
  - [x] Added toast notifications (`toast.add`) for success and error states across all space/member operations ([`space-settings.tsx`](file:///Users/masterkeysrd/Projects/saturn/apps/web/features/settings/space-settings.tsx), [`manage-space-sheet.tsx`](file:///Users/masterkeysrd/Projects/saturn/apps/web/features/settings/manage-space-sheet.tsx), [`no-space-active.tsx`](file:///Users/masterkeysrd/Projects/saturn/apps/web/components/no-space-active.tsx)).
  - [x] Standardized Create Space dialog in [`space-settings.tsx`](file:///Users/masterkeysrd/Projects/saturn/apps/web/features/settings/space-settings.tsx) with `useForm` and `zodResolver`.
  - [x] Standardized Add Member sub-form in [`manage-space-sheet.tsx`](file:///Users/masterkeysrd/Projects/saturn/apps/web/features/settings/manage-space-sheet.tsx) with `useForm`, `zodResolver`, and `Controller`.
- [x] **Transaction Management**:
  - [x] Implemented `internal/platform/db` context-first transaction engine (`TxController`, `Transactor`, context propagation, safe defer rollback, transparent routing via `TxFromContext`).
  - [x] Implemented `txgen` CLI tool (`tools/txgen`) to generate transactional decorator wrappers from interface method annotations (`@transactional`).
  - [x] Generated `TransactionalCoordinator` in [`coordinator_tx.go`](file:///Users/masterkeysrd/Projects/saturn/internal/application/space/coordinator_tx.go).
  - [x] Wired `TransactionalCoordinator` into gRPC handler and [`server.go`](file:///Users/masterkeysrd/Projects/saturn/cmd/saturn/app/server.go).
  - [x] Removed manual compensating rollback from `domain/space/service.go`.
- [x] **Optimistic Locking & Partial Updates (Budget Pattern Alignment)**:
  - [x] Standardized `UpdateSpaceRequest` in [`api/saturn/space/v1/space.proto`](file:///Users/masterkeysrd/Projects/saturn/api/saturn/space/v1/space.proto) to follow the Budget pattern (`body: "space"`, `Space space`, `optional google.protobuf.FieldMask update_mask`, `optional int64 version`).
  - [x] Recompiled protobuf bindings and web SDK using `make codegen`.
  - [x] Implemented `SpacePatchSchema` with [`internal/platform/patch`](file:///Users/masterkeysrd/Projects/saturn/internal/platform/patch/patch.go) and `(s *Space) ApplyPatch(incoming *Space, mask []string) error` in [`space.go`](file:///Users/masterkeysrd/Projects/saturn/internal/domain/space/space.go).
  - [x] Updated domain service `UpdateSpace(ctx, session, space, mask)` with zero boilerplate: validates version when specified, applies field mask, and performs atomic CAS update with `space.VersionMismatch` conflict handling.
  - [x] Updated coordinator and regenerated `coordinator_tx.go` with `txgen`.
  - [x] Adapted gRPC transport handler [`handler.go`](file:///Users/masterkeysrd/Projects/saturn/internal/transport/grpc/space/handler.go) with `toDomainSpace`, field mask forwarding, and version mapping.
  - [x] Aligned frontend space management ([`manage-space-sheet.tsx`](file:///Users/masterkeysrd/Projects/saturn/apps/web/features/settings/manage-space-sheet.tsx)) with Saturn form and patch conventions (`usePatch`, `useForm`, `zodResolver`, `dirtyFields`, and `updateMask`).
  - [x] Enhanced [`use-patch.ts`](file:///Users/masterkeysrd/Projects/saturn/apps/web/hooks/use-patch.ts) to support arbitrary array response containers for optimistic query updates.
- [x] **Structured Logging**:
  - [x] Used `loggen` with `internal/platform/log` to generate [`coordinator_log.go`](file:///Users/masterkeysrd/Projects/saturn/internal/application/space/coordinator_log.go) (`NewLoggingCoordinator`) wrapping all methods with structured execution duration and error logging.

---

## 2. Identity Domain (`internal/domain/identity` / IAM)

### Status: Completed

- [x] **Storage Abstraction & Migration**:
  - [x] Migrate [`UserStore`](file:///Users/masterkeysrd/Projects/saturn/internal/domain/identity/storage/user_store.go) to `db.DB` and `goqu`.
  - [x] Migrate [`CredentialStore`](file:///Users/masterkeysrd/Projects/saturn/internal/domain/identity/storage/credential_store.go) to `db.DB` and `goqu`.
  - [x] Migrate [`SessionStore`](file:///Users/masterkeysrd/Projects/saturn/internal/domain/identity/storage/session_store.go) to `db.DB` and `goqu`.
  - [x] Migrate [`SecurityEventStore`](file:///Users/masterkeysrd/Projects/saturn/internal/domain/identity/storage/security_event_store.go) to `db.DB` and `goqu`.
  - [x] Replace manual `RowsAffected()` calls with `db.ExecOne`.
  - [x] Replace `sql.ErrNoRows` checks with transparent `errors.NotExist`.
  - [x] Keyset pagination returning `*paging.Page[T]` across `UserStore` (`GetUsers`), `SecurityEventStore` (`List`), `Service`, and `Coordinator`.
  - [x] Apply canonical `Op` naming: `"domain/identity/storage.<Method>"`.
  - [x] Add unit tests with mock `db.DB` for all 4 stores (`store_test.go`).
- [x] **Error Handling**:
  - [x] Remove sentinels in [`service.go`](file:///Users/masterkeysrd/Projects/saturn/internal/domain/identity/service.go) (`ErrUserNotFound`, `ErrUserExists`, `ErrCredentialExists`).
  - [x] Remove sentinel file `session_service.go` (`ErrSessionNotFound`, `ErrSessionExpired`, `ErrSessionRevoked`, `ErrSessionReused`).
  - [x] Define typed error codes matching Space domain convention (unprefixed, uppercase SCREAMING_SNAKE_CASE):
    - `identity.NotFound` ("USER_NOT_FOUND")
    - `identity.UserExists` ("USER_EXISTS")
    - `identity.CredentialNotFound` ("CREDENTIAL_NOT_FOUND")
    - `identity.CredentialExists` ("CREDENTIAL_EXISTS")
    - `identity.InvalidCredentials` ("INVALID_CREDENTIALS")
    - `identity.AccountLocked` ("ACCOUNT_LOCKED")
    - `identity.AccountPending` ("ACCOUNT_PENDING")
    - `identity.AccountSuspended` ("ACCOUNT_SUSPENDED")
    - `identity.AccountInactive` ("ACCOUNT_INACTIVE")
    - `identity.SessionNotFound` ("SESSION_NOT_FOUND")
    - `identity.SessionExpired` ("SESSION_EXPIRED")
    - `identity.SessionRevoked` ("SESSION_REVOKED")
    - `identity.SessionReused` ("SESSION_REUSED")
    - `identity.VersionMismatch` ("USER_VERSION_MISMATCH")
    - `identity.InvalidUserID` ("INVALID_USER_ID")
  - [x] Update domain logic to return `errors.E(op, kind, code, err)`.
- [x] **Optimistic Locking**:
  - [x] Enforce version check on `UserStore.Update` using `db.ExecOne`.
  - [x] Domain service maps version mismatch to `errors.Conflict` with code `identity.VersionMismatch`.
- [x] **Transaction Management**:
  - [x] Interface-based `iam.Coordinator` with `@transactional` annotations on `Register` and `AdminCreateUser`.
  - [x] Used `txgen` to generate `coordinator_tx.go`.
- [x] **Structured Logging**:
  - [x] Used `loggen` with `internal/platform/log` to generate `coordinator_log.go` (`NewLoggingCoordinator`).
- [x] **Transport Layer**:
  - [x] Adapt [`admin.go`](file:///Users/masterkeysrd/Projects/saturn/internal/transport/grpc/identity/admin.go) and [`handler.go`](file:///Users/masterkeysrd/Projects/saturn/internal/transport/grpc/identity/handler.go) to accept `iam.Coordinator` interface, unpack `*paging.Page[T]` items and next page tokens, and delegate error mapping to gRPC interceptor.
- [x] **Repository Decoupling & Domain Logic Extraction**:
  - [x] Extracted session rotation business logic, token reuse detection, and session state verification from `SessionStore.Rotate` to [`Session.Rotate`](file:///Users/masterkeysrd/Projects/saturn/internal/domain/identity/session.go) and [`Service.RotateSession`](file:///Users/masterkeysrd/Projects/saturn/internal/domain/identity/service.go).
  - [x] Added rich domain methods to `Session` (`IsRevoked`, `IsReplaced`, `IsExpired`, `IsActive`, `Revoke`, `Rotate`).
  - [x] Simplified [`SessionStoreProvider`](file:///Users/masterkeysrd/Projects/saturn/internal/domain/identity/session_storage.go) to pure persistence primitives (`Create`, `GetByID`, `GetByRefreshTokenHash`, `Update`, `ListActiveSessions`, `RevokeFamily`, `RevokeAllForUser`).
  - [x] Removed ad-hoc transaction management (`WithTx`) from storage; added `@transactional` annotation to `Coordinator.RefreshSession` for context-first transactional wrapping with `txgen`.
- [x] **Testing**:
  - [x] Update `service_test.go` and `registration_test.go` to assert on `errors.KindOf` and `errors.CodeOf` with 100% pass rate.
  - [x] Added unit tests for session rotation, reuse detection, revocation, and active session listing in `service_test.go` and `store_test.go`.

---

## 3. Finance Domain (`internal/domain/finance`)

### Status: Completed

- [x] **Storage Abstraction & Migration**:
  - [x] Migrate all stores in [`internal/domain/finance/storage/`](file:///Users/masterkeysrd/Projects/saturn/internal/domain/finance/storage) to use `db.DB`:
    - `account_store.go`
    - `transaction_store.go`
    - `recurring_transaction_store.go`
    - `scheduled_transaction_store.go`
    - `transfer_store.go`
    - `budget_store.go`
    - `period_store.go`
    - `institution_store.go`
    - `borrowing_store.go`
    - `statement_store.go`
    - `inbox_item_store.go`
    - `insights_store.go`
    - `settings_store.go`
    - `transaction_event_store.go`
    - `exchange_rate_store.go`
  - [x] Eliminate `sql.ErrNoRows` inspection across all storage methods.
  - [x] Replace custom rows-affected checks with `db.ExecOne`.
  - [x] Set canonical `Op` on all storage queries: `"domain/finance/storage.<Method>"`.
  - [x] Add storage unit tests using mock `db.DB` ([`store_test.go`](file:///Users/masterkeysrd/Projects/saturn/internal/domain/finance/storage/store_test.go)).
- [x] **Error Handling**:
  - [x] Delete all 28 sentinels in [`internal/domain/finance/errors.go`](file:///Users/masterkeysrd/Projects/saturn/internal/domain/finance/errors.go) (`ErrSettingsNotFound`, `ErrBudgetNotFound`, `ErrAccountNotFound`, `Err...VersionMismatch`, etc.).
  - [x] Define typed error codes matching Space domain convention (unprefixed, uppercase SCREAMING_SNAKE_CASE):
    - `finance.AccountNotFound` ("ACCOUNT_NOT_FOUND")
    - `finance.BudgetNotFound` ("BUDGET_NOT_FOUND")
    - `finance.TransactionNotFound` ("TRANSACTION_NOT_FOUND")
    - `finance.BorrowingNotFound` ("BORROWING_NOT_FOUND")
    - `finance.StatementNotFound` ("STATEMENT_NOT_FOUND")
    - `finance.CannotDeleteDefaultAccount` ("CANNOT_DELETE_DEFAULT_ACCOUNT")
    - `finance.BudgetHasTransactions` ("BUDGET_HAS_TRANSACTIONS")
    - `finance.ActiveStatementExists` ("ACTIVE_STATEMENT_EXISTS")
    - `finance.StatementBalanceMismatch` ("STATEMENT_BALANCE_MISMATCH")
    - `finance.VersionMismatch` ("VERSION_MISMATCH")
  - [x] Update domain services ([`service.go`](file:///Users/masterkeysrd/Projects/saturn/internal/domain/finance/service.go), etc.) to construct errors with `errors.E(op, kind, code, ...)`.
  - [x] Canonical `Op` formatting: `"domain/finance.<Method>"`, `"application/finance.<Method>"`.
- [x] **Optimistic Locking**:
  - [x] Enforce optimistic locking and `db.ExecOne` for mutable financial entities: `Account`, `Budget`, `Institution`, `Borrowing`, `RecurringTransaction`, `Statement`, `StatementLine`.
  - [x] Return `errors.Conflict` with code `finance.VersionMismatch` when row version does not match.
- [x] **Transaction Management**:
  - [x] Interface-based `financeapp.Coordinator` with `@transactional` annotations on high-stakes operations:
    - **Transfers**: Atomically update source account balance, destination account balance, and create both transaction legs (`CreateTransfer`, `DeleteTransfer`).
    - **Statement Reconciliation**: Finalize statement status, link statement lines, and reconcile matched transactions in one transaction (`CompleteStatement`, `ImportStatement`, `DeleteStatement`, `InvertStatementSigns`).
    - **Budget & Scheduled Transactions**: Cascade status changes or deletions atomically (`DeleteBudget`, `ConfirmScheduledTransaction`, `MatchScheduledTransaction`, `SkipScheduledTransaction`, `GenerateScheduledTransactions`).
    - **Account & Borrowing Adjustments**: Atomically adjust ledger balances and record adjustment transactions (`AdjustAccountBalance`, `AdjustBorrowingBalance`, `LogBorrowingTransaction`, `DeleteBorrowingTransaction`).
  - [x] Removed ad-hoc storage transaction management (`withTx`) from [`StatementStore`](file:///Users/masterkeysrd/Projects/saturn/internal/domain/finance/storage/statement_store.go) in favor of coordinator-level `@transactional` boundaries.
  - [x] Used `txgen` to generate [`coordinator_tx.go`](file:///Users/masterkeysrd/Projects/saturn/internal/application/finance/coordinator_tx.go).
- [x] **Structured Logging**:
  - [x] Used `loggen` with `internal/platform/log` to generate [`coordinator_log.go`](file:///Users/masterkeysrd/Projects/saturn/internal/application/finance/coordinator_log.go) (`NewLoggingCoordinator`) wrapping all methods with structured execution duration and error logging.
- [x] **Transport Layer**:
  - [x] Remove the 32-line manual [`mapError`](file:///Users/masterkeysrd/Projects/saturn/internal/transport/grpc/finance/handler.go#L568-L599) in `internal/transport/grpc/finance/handler.go`.
  - [x] Eliminate `strings.Contains(err.Error(), "access denied")` string parsing.
  - [x] Modernize all input guards across [`internal/transport/grpc/finance/`](file:///Users/masterkeysrd/Projects/saturn/internal/transport/grpc/finance) (`handler.go`, `borrowing.go`, `recurring_transactions.go`) to use platform errors (`errors.E(op, errors.Invalid, ...)` and `errors.E(op, errors.Unauthenticated, ...)`), eliminating all direct `status.Error(codes.*)` calls.
  - [x] Rely on `interceptors.ToStatus` / gRPC error interceptor for automatic status mapping.
  - [x] Adapt [`handler.go`](file:///Users/masterkeysrd/Projects/saturn/internal/transport/grpc/finance/handler.go) to accept `financeapp.Coordinator` interface.
- [x] **Testing**:
  - [x] Added unit tests in `storage/store_test.go` asserting on `errors.NotExist`, canonical `Op`, and optimistic CAS conflict.
  - [x] Full test suites passing (`go test ./...` and `tests/finance` 100% green).

---

## 4. Platform & Application Subsystems (Agent & Integration)

### Status: Completed

- [x] **Agent Subsystem (`internal/application/agent`, `internal/transport/grpc/agent`)**:
  - [x] Map LLM/model failures to `errors.Unavailable` or `errors.Internal` with canonical `Op`.
  - [x] Converted `agentapp.Coordinator` to interface and generated `coordinator_log.go` with `tools/loggen`.
  - [x] Migrated `platform/agent` store to `db.DB` with canonical `Op` and `errors.NotExist`.
  - [x] Converted Coordinator methods (`CreateAgent`, `UpdateAgent`, `CreateProvider`, `UpdateProvider`) to use typed pointer request structs (`*CreateAgentRequest`, etc.) instead of loose positional parameters.
  - [x] Verify gRPC handler returns platform errors directly to the interceptor without manual gRPC status conversions.
  - [x] Add structured log attributes via `internal/platform/log` for token usage, latency, and model identifiers.
- [x] **Integration Subsystem (`internal/application/integration`, `internal/transport/grpc/integration`)**:
  - [x] Standardize webhook delivery and third-party API error mapping across forwarder, simulate, and email handlers.
  - [x] Standardize database store (`Registry`) to `db.DB` with canonical `Op` and `db.ExecOne`.
  - [x] Converted `integrationapp.Coordinator` to interface and generated `coordinator_log.go` with `tools/loggen`.
  - [x] Structured logging for webhook processing lifecycle (arrival, verification, enqueue, processing duration) and token secret rotation.
  - [x] Verify gRPC handler returns platform errors directly to the interceptor.

---

## 5. Platform Infrastructure Subsystems (Scheduler, EventBus, Backup)

### Status: Completed

- [x] **Scheduler Engine (`internal/platform/scheduler`, `internal/transport/grpc/scheduler`)**:
  - [x] Migrate [`internal/platform/scheduler/scheduler.go`](file:///Users/masterkeysrd/Projects/saturn/internal/platform/scheduler/scheduler.go) and [`worker.go`](file:///Users/masterkeysrd/Projects/saturn/internal/platform/scheduler/worker.go) from concrete `*sqlx.DB` to consumer-side `Database` (`db.DB` + `WithTx`) interface.
  - [x] Standardize error construction with canonical `Op` (`"platform/scheduler.<Method>"`) and eliminate raw SQL error propagation.
  - [x] Modernize [`internal/transport/grpc/scheduler/handler.go`](file:///Users/masterkeysrd/Projects/saturn/internal/transport/grpc/scheduler/handler.go) input guards (`errors.E(op, errors.Invalid, ...)`) and eliminate all direct `status.Error(codes.*)` calls in favor of the error interceptor.
  - [x] Integrate structured logging via [`internal/platform/log`](file:///Users/masterkeysrd/Projects/saturn/internal/platform/log) for job dispatch, completion, and failure retries.

- [x] **EventBus / Message Delivery (`internal/platform/eventbus`, `internal/transport/grpc/message`)**:
  - [x] Migrate [`internal/platform/eventbus/eventbus.go`](file:///Users/masterkeysrd/Projects/saturn/internal/platform/eventbus/eventbus.go) and [`worker.go`](file:///Users/masterkeysrd/Projects/saturn/internal/platform/eventbus/worker.go) from concrete `*sqlx.DB` to consumer-side `Database` (`db.DB` + `WithTx`) interface.
  - [x] Standardize error construction with canonical `Op` (`"platform/eventbus.<Method>"`) and eliminate raw error returns.
  - [x] Modernize [`internal/transport/grpc/message/handler.go`](file:///Users/masterkeysrd/Projects/saturn/internal/transport/grpc/message/handler.go) input guards (`errors.E(op, errors.Invalid, ...)`) and eliminate all direct `status.Error(codes.*)` calls in favor of the error interceptor.
  - [x] Integrate structured logging via [`internal/platform/log`](file:///Users/masterkeysrd/Projects/saturn/internal/platform/log) for message publishing, subscriber delivery attempts, and dead-letter queueing.

- [x] **Backup Subsystem (`internal/platform/backup`, `internal/transport/grpc/backup`)**:
  - [x] Modernize [`internal/transport/grpc/backup/handler.go`](file:///Users/masterkeysrd/Projects/saturn/internal/transport/grpc/backup/handler.go) input guards and authorization checks (`errors.E(op, errors.Unauthenticated, ...)`, `errors.E(op, errors.Permission, ...)`) to eliminate direct `status.Error(codes.*)` calls.
  - [x] Ensure canonical `Op` naming across storage and transport layers (`"platform/backup.<Method>"`, `"transport/grpc/backup.<Method>"`).
  - [x] Integrate structured logging via [`internal/platform/log`](file:///Users/masterkeysrd/Projects/saturn/internal/platform/log) for backup lifecycle events (dump, checksum, compression, storage upload, failure).

---

## 6. Integration & End-to-End Test Suite Expansion (`tests/`)

### Status: Completed

- [x] **SDK Code Generator (`tools/protoc-gen-go-sdk`)**:
  - [x] Refactored protoc SDK plugin generator with generic protoreflect inspection for all GET and DELETE requests.
  - [x] Correctly serializes scalar fields, pagination options (`page_size`, `page_token`), and filter masks into URL query strings.
- [x] **Test Driver Framework Enhancements (`tests/driver/`)**:
  - [x] Extended [`TestEnv`](file:///Users/masterkeysrd/Projects/saturn/tests/driver/env.go) with `EventBus()`, `Scheduler()`, and `AdminToken()` accessors.
  - [x] Enhanced [`Driver`](file:///Users/masterkeysrd/Projects/saturn/tests/driver/driver.go) with auto-truncation for platform tables and accessor helpers.
  - [x] Implemented [`AuthDriver`](file:///Users/masterkeysrd/Projects/saturn/tests/driver/auth.go) for complete identity management: registration, approval, rejection, role modification, session rotation, revocation, and security audit logs.
  - [x] Implemented [`SpaceDriver`](file:///Users/masterkeysrd/Projects/saturn/tests/driver/space.go) for space CRUD, member additions, removals, role promotions, and keyset pagination.
  - [x] Implemented [`PlatformDriver`](file:///Users/masterkeysrd/Projects/saturn/tests/driver/platform.go) for scheduler metrics, triggers, pauses, resumes, job retries, event publishing, delivery tracking, and dead-letter retry.
- [x] **Identity / Auth Suite ([`tests/identity/`](file:///Users/masterkeysrd/Projects/saturn/tests/identity/))**:
  - [x] [`auth_test.go`](file:///Users/masterkeysrd/Projects/saturn/tests/identity/auth_test.go): User registration, approval lifecycle, admin user rejection, role changes, and user listing pagination.
  - [x] [`session_test.go`](file:///Users/masterkeysrd/Projects/saturn/tests/identity/session_test.go): Token rotation, token reuse attack detection & immediate family revocation, multi-device session listing & selective revocation, revoke-all-sessions, and security audit trail verification.
- [x] **Space Management Suite ([`tests/space/`](file:///Users/masterkeysrd/Projects/saturn/tests/space/))**:
  - [x] [`space_test.go`](file:///Users/masterkeysrd/Projects/saturn/tests/space/space_test.go): Space CRUD with field masks, optimistic concurrency control version checks, and multi-tenant isolation guarantees.
  - [x] [`member_test.go`](file:///Users/masterkeysrd/Projects/saturn/tests/space/member_test.go): Space member lifecycle, role transitions, owner protection guards (cannot remove or demote owner), and keyset member listing.
- [x] **Platform Subsystems Suite ([`tests/platform/`](file:///Users/masterkeysrd/Projects/saturn/tests/platform/))**:
  - [x] [`scheduler_test.go`](file:///Users/masterkeysrd/Projects/saturn/tests/platform/scheduler_test.go): Worker status/queue size metrics, recurring schedule registration, pause & resume, manual schedule triggering, job listing, retry, and deletion.
  - [x] [`eventbus_test.go`](file:///Users/masterkeysrd/Projects/saturn/tests/platform/eventbus_test.go): Aggregate and per-topic queue metrics, event publishing and asynchronous worker consumption, context propagation (request_id) through producer/consumer middlewares, and failed delivery retries.
  - [x] [`backup_test.go`](file:///Users/masterkeysrd/Projects/saturn/tests/platform/backup_test.go): Admin authorization guards (401 unauthenticated, 403 member rejection), manual backup snapshot triggering, physical disk artifact & sha256 checksum verification, metadata index synchronization (`backups.json`), and recurring scheduler background worker backup execution.
- [x] **Agent & AI Ingestion Suite ([`tests/agent/`](file:///Users/masterkeysrd/Projects/saturn/tests/agent/))**:
  - [x] [`provider_test.go`](file:///Users/masterkeysrd/Projects/saturn/tests/agent/provider_test.go): LLM Provider CRUD, system provider catalog verification, API key masking assertions, and workspace isolation guarantees.
  - [x] [`agent_test.go`](file:///Users/masterkeysrd/Projects/saturn/tests/agent/agent_test.go): Agent instance lifecycle management, blueprint catalog inspection, and live end-to-end execution/suggestions via ephemeral [`MockLLMServer`](file:///Users/masterkeysrd/Projects/saturn/tests/driver/mock_llm.go) with decrypted auth header verification and audit logging into `platform.agent_runs`.
- [x] **Integration & Webhooks Suite ([`tests/integration/`](file:///Users/masterkeysrd/Projects/saturn/tests/integration/))**:
  - [x] [`integration_test.go`](file:///Users/masterkeysrd/Projects/saturn/tests/integration/integration_test.go): Integration catalog descriptor discovery, space integration lifecycle configuration, and token provisioning, listing, and revocation.
  - [x] [`webhook_test.go`](file:///Users/masterkeysrd/Projects/saturn/tests/integration/webhook_test.go): Webhook HTTP security guards (secret & token validation), sandbox webhook simulation, and live HTTP webhook ingestion through Dispatcher and EventBus async worker staging into `finance.inbox_item`.

---

## Suggested Migration Roadmap

| Order | Domain / Subsystem | Complexity | Key Impact |
| :--- | :--- | :--- | :--- |
| 1 | **Space** | Low | **Completed**: `db.DB`, `goqu`, keyset paging, query aggregator, `txgen`, optimistic locking & forms. (Logging on hold) |
| 2 | **Identity / IAM** | Medium | **Completed**: 4 stores (`db.DB`), remove auth sentinels, atomic user+credential registration with `txgen`. |
| 3 | **Finance** | High | **Completed**: 16 stores (`db.DB`), 28 sentinels, critical transfer & statement transaction boundaries with `txgen`, transport guard modernization. |
| 4 | **Agent & Integration** | Low | **Completed**: `db.DB`, standardized external error wrapping, structured logging with `loggen`, coordinator request struct refactor, and webhook lifecycle tracing. |
| 5 | **Platform Infrastructure** | Medium | **Completed**: Scheduler, EventBus, and Backup DB migration, canonical `Op` naming, structured logging, and gRPC input guard modernization. |
| 6 | **End-to-End Test Suite** | Medium | **Completed**: Comprehensive test suites across Finance, Identity/Auth, Space, Platform (Scheduler/EventBus), Agent, and Integration/Webhooks against live HTTP/gRPC gateways and PostgreSQL. |
