# Pending Tasks & Architectural Decisions

## Architecture & Storage

- [x] **Transactional Handling Design & Implementation** (Completed)
  - **Implemented**:
    - Context-first transaction runtime engine in [`internal/platform/db`](file:///Users/masterkeysrd/Projects/saturn/internal/platform/db): `TxController` supporting re-entrant / nested transactions, safe `defer tx.Rollback()` after `tx.Commit()`, rollback error logging with `slog.Error`, context injection (`WithTxContext`, `TxControllerFromContext`, `TxFromContext`), and automatic transparent routing in `Client.Get/Select/Exec/ExecOne`.
    - AST-based code generator CLI tool in [`tools/txgen`](file:///Users/masterkeysrd/Projects/saturn/tools/txgen) to generate transactional decorators (`Transactional<Interface>`) from interface method annotations (`@transactional`).
    - Wired transactional decorator in `internal/application/space` (`coordinator_tx.go`), connected to gRPC transport and server composition root, and eliminated manual compensating rollbacks in domain services.

- [x] **Space Domain Architectural Alignment & Keyset Pagination** (Completed)
  - **Implemented**:
    - Stores migrated 100% to `goqu` query builder (`pgDialect`), `db.DB`, and `*paging.Page[T]` keyset pagination.
    - Standardized keyset pagination across `SpaceStore`, `MemberStore`, `Service`, `Coordinator`, and `Aggregator`.
    - Implemented CQRS Query Aggregator in [`internal/aggregator/space`](file:///Users/masterkeysrd/Projects/saturn/internal/aggregator/space) with bulk Identity user profile hydration (0 N+1 queries).
    - Hardened workspace owner protection (guards against demoting/removing owner or promoting new owner without transfer).
    - Aligned frontend forms with `useForm`, `zodResolver`, and `Controller` in [`space-settings.tsx`](file:///Users/masterkeysrd/Projects/saturn/apps/web/features/settings/space-settings.tsx) and [`manage-space-sheet.tsx`](file:///Users/masterkeysrd/Projects/saturn/apps/web/features/settings/manage-space-sheet.tsx).

- [ ] **Identity Session Business Logic Refactoring**
  - Move session business logic (token family reuse detection, session expiration, and revocation rules) out of [`internal/domain/identity/storage/session_store.go`](file:///Users/masterkeysrd/Projects/saturn/internal/domain/identity/storage/session_store.go) into the domain service layer (`internal/domain/identity`). Storage stores should only handle pure persistence/queries, while the domain service should govern token rotation, reuse compromise detection, and lifecycle validation.

