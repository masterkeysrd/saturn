# API & Protobuf Conventions

Saturn APIs follow the [Google API Improvement Proposals (AIP)](https://google.aip.dev/) for gRPC and REST design.

---

## 1. Resource-Oriented Design

- Resources are nouns representing entities (e.g., `Space`, `Transaction`, `Budget`, `User`).
- Resource IDs use prefixed type identifiers generated via `internal/platform/id` (e.g., `spc_...`, `txn_...`, `usr_...`, `bdg_...`).
- Service definitions live under `api/saturn/<domain>/v1/<domain>.proto`.

---

## 2. Standard Methods (AIP-131 - AIP-135)

| Method | Request | Response | HTTP Verb / Path | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `Get<Resource>` | `Get<Resource>Request` | `<Resource>` | `GET /api/v1/<resources>/{id}` | Direct resource return (AIP-131) |
| `List<Resources>` | `List<Resources>Request` | `List<Resources>Response` | `GET /api/v1/<resources>` | Includes `page_size`, `page_token`, `next_page_token` (AIP-132) |
| `Create<Resource>` | `Create<Resource>Request` | `<Resource>` | `POST /api/v1/<resources>` | Direct resource return (AIP-133) |
| `Update<Resource>` | `Update<Resource>Request` | `<Resource>` | `PATCH /api/v1/<resources>/{id}` | Requires `google.protobuf.FieldMask update_mask` (AIP-134) |
| `Delete<Resource>` | `Delete<Resource>Request` | `google.protobuf.Empty` | `DELETE /api/v1/<resources>/{id}` | Idempotent removal (AIP-135) |

> [!IMPORTANT]
> **AIP-134 / AIP-136 Return Value Rule**:
> Standard CRUD methods (`Get`, `Create`, `Update`) and mutating lifecycle actions must return the resource message directly (e.g. `User`, `Settings`), **not** a wrapped `...Response` message (`GetUserResponse`, `UpdateUserResponse`), unless specific batch or metadata results require it.

---

## 3. Custom Methods (AIP-136)

Use custom methods for actions that cannot be expressed as standard CRUD:

- Suffix with `:` and the verb in the HTTP path:
  ```protobuf
  rpc ApproveUser(ApproveUserRequest) returns (User) {
    option (google.api.http) = {
      post: "/api/v1/admin/identity/users/{id}:approve"
      body: "*"
    };
  }
  ```
- Naming convention: `<Verb><Resource>` (e.g. `ApproveUser`, `RejectUser`, `SkipScheduledTransaction`).
- Returns the modified resource directly whenever applicable.

---

## 4. API Authentication & Tenant (Space) Authorization

API access and workspace multi-tenancy are configured declaratively in `api/**/*.yaml` and enforced by gRPC interceptors.

### A. Authentication Configuration (`authentication.rules`)

Defined in `api/api.yaml` (global) and `api/saturn/<domain>/v1/<domain>.yaml` (module-level):

```yaml
authentication:
  rules:
    # Public endpoints (opt-out of auth)
    - selector: "saturn.identity.v1.Identity.LoginUser"
      auth_required: false

    # Standard authenticated endpoints
    - selector: "saturn.finance.v1.Finance.*"
      auth_required: true

    # Admin-restricted endpoints
    - selector: "saturn.identity.admin.v1.AdminIdentity.*"
      auth_required: true
      access_levels:
        - admin
```

- **Enforcement (`AuthInterceptor`)**:
  - Requires `Authorization: Bearer <jwt_access_token>`.
  - Validates token claims, signature, expiration, and compares `auth_version` against the user record.
  - Injects `auth.Principal` into `context.Context`.
  - In Go handlers, retrieve with:
    ```go
    principal, ok := auth.PrincipalFromContext(ctx)
    ```

### B. Tenant / Workspace Scoping (`space.rules`)

Multi-tenant isolation ensures data from one workspace can never leak to another.

```yaml
space:
  rules:
    # Global endpoints (no workspace context)
    - selector: "saturn.identity.v1.Identity.*"
      scoped: false

    # Space-scoped endpoints (must belong to a specific workspace)
    - selector: "saturn.finance.v1.Finance.*"
      scoped: true
```

- **Enforcement (`SpaceInterceptor`)**:
  - Requires the client to send the `space-id` metadata header (`space-id: spc_...`).
  - Verifies that the authenticated `Principal.Subject` is an active member of that space via `MemberStore`.
  - Rejects unauthorized requests with gRPC `codes.PermissionDenied`.
  - Injects `auth.SpaceContext` (containing `SpaceID` and member `Role`) into `context.Context`.
  - In Go handlers, retrieve with:
    ```go
    spaceID, ok := auth.SpaceIDFromContext(ctx)
    role, ok := auth.SpaceRoleFromContext(ctx)
    ```

---

## 5. Code Generation & Verification

Whenever modifying protobuf files (`api/**/*.proto`) or API configs (`api/**/*.yaml`):

```bash
buf format -w       # Format protobuf schema files
make lint-proto     # Run buf lint for API style guidelines
make proto-gen      # Runs buf generate across Go and TypeScript packages
make web-typecheck  # Verify TypeScript generated clients compile cleanly
make test-unit      # Verify Go generated bindings compile and unit tests pass
```
