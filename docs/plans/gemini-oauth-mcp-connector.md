# Implementation Plan: Saturn OAuth 2.1 Authorization Server & Remote MCP Authorization (Hybrid Model)

## 1. Goal & Principles

Build a **standards-first, vendor-neutral OAuth 2.1 Authorization Server** in Saturn that secures both Saturn's **Streamable HTTP MCP Server** (`/mcp` and `/spaces/{space_id}/mcp`) and **REST/gRPC APIs** (`/api/v1/*`).

By implementing open IETF & Model Context Protocol (MCP) specifications—**without any hardcoded vendor URLs, quirks, or proprietary assumptions**—Saturn works natively with **any** OAuth 2.1 or remote MCP host (Claude Web/Desktop/Code, ChatGPT Connectors, Google Gemini Connected Apps & Gemini Enterprise, Cursor, VS Code, Raycast, MCP Inspector, and custom third-party integrations).

---

## 2. Core Architectural Decisions

| Area | Decision | Rationale |
| :--- | :--- | :--- |
| **Vendor Neutrality** | **100% Open IETF & MCP Standards** (OAuth 2.1, RFC 7636 PKCE `S256`, RFC 8414, RFC 9728, RFC 8707, RFC 7591, RFC 7009, RFC 8252 loopback, IETF CIMD) | Zero vendor-specific domains, presets, or hardcoded logic anywhere in backend or frontend code. |
| **Hybrid Client Ownership (`space_id` nullable)** | **Workspace Clients (`space_id = spc_...`)** managed by Space `owner`/`admin` (`Spaces` API) **+** **Instance Clients (`space_id IS NULL`)** managed by System Admins (`AdminIdentity` API) | Workspace owners/admins self-serve isolated per-Space connectors (`/spaces/{space_id}/mcp` + scope ceiling), while sysadmins (or global DCR/CIMD) can register instance-wide clients (`/mcp`) where users pick a Space at consent time. |
| **Three-Tier Governance** | 1. **System Admin** (`/admin/oauth-clients`): Instance clients + DCR/CIMD oversight<br>2. **Workspace Admin** (`/settings/oauth-apps`): Space clients + Space grant audit/revocation<br>3. **Individual User** (`/settings/security/oauth-apps`): Personal authorized grants & revocation | Mirrors Saturn's existing 3-tier governance for API Keys (`AdminIdentity`, `Spaces.ListSpaceAPIKeyGrants`, and `Identity.ListAPIKeys`). |
| **Client Registration** | Manual registration (Workspace & Instance) always enabled + configurable **RFC 7591 DCR & IETF CIMD** (`SATURN_OAUTH_ALLOW_DYNAMIC_REGISTRATION`, default `false`) | Supports both locked-down credentialed clients (`client_secret_basic` / `client_secret_post` / `none`) and zero-config dynamic registration (`/oauth/register`, `/spaces/{space_id}/oauth/register`, and HTTPS URL `client_id` metadata documents). |
| **Refresh Token Policy** | Configurable per `OAuthClient`: **`rotate`** (default — OAuth 2.1 rotation with 30s network-retry grace window & reuse revocation) or **`persistent`** (sliding-TTL reusable refresh token) | Public PKCE clients get full RFC 9700 rotation & replay protection by default, while server-to-server account-linking brokers that do not persist rotated refresh tokens can opt into `persistent` mode cleanly. |
| **Unified Token Surface** | `sat_oat_<random>` opaque tokens authenticate via `transportauth.Authenticator` across **both MCP and `/api/v1/*`** | Populates `auth.Principal` with `OAuthGrantID`, `Scopes`, and `GrantedSpaceIDs: []string{spaceID}`, reusing Saturn's existing scope and single-space resolution pipeline. |

---

## 3. Standards & Protocol Matrix

- **RFC 9728 — OAuth 2.0 Protected Resource Metadata**:
  - `GET /.well-known/oauth-protected-resource` (plus path-aware `/mcp` and `/spaces/{space_id}/mcp` suffixes).
  - Unauthenticated requests to `/mcp` or `/spaces/{space_id}/mcp` return `401 Unauthorized` with `WWW-Authenticate: Bearer resource_metadata="..."`.
- **RFC 8414 — OAuth 2.0 Authorization Server Metadata**:
  - `GET /.well-known/oauth-authorization-server` (and `/.well-known/openid-configuration` discovery alias for clients that probe OIDC paths; plus `/spaces/{space_id}` path-aware metadata so DCR against a Workspace MCP URL binds clients to `{space_id}`).
- **OAuth 2.1 & RFC 7636 — Authorization Code + Mandatory PKCE (`S256`)**:
  - `response_type=code` with mandatory `code_challenge` and `code_challenge_method=S256`.
  - Browser consent screen at `/oauth/authorize` followed by server-side `GET /oauth/authorize/callback?handoff=...` issuing an explicit `HTTP 302 Found` redirect to the validated `redirect_uri`.
- **RFC 8707 — Resource Indicators**:
  - Honors optional `resource` parameter (e.g., `https://<host>/spaces/{space_id}/mcp`) during `/oauth/authorize` and `/oauth/token` to lock or verify target Workspace alignment.
- **RFC 8252 & Redirect URI Validation (Vendor-Agnostic)**:
  - Exact `https://` redirect URIs.
  - Loopback `http://127.0.0.1:<port>/...`, `http://[::1]:<port>/...`, and `http://localhost:<port>/...` matching arbitrary ephemeral ports per RFC 8252 §7.3 for local CLI/desktop tools.
  - Explicit admin-configured HTTPS subpath prefix rules (`https://example.com/callback/*` — concrete HTTPS host + non-root path prefix, zero wildcard hosts) for brokers using dynamic callback subpaths.
- **RFC 7591 & IETF CIMD — Dynamic Client Registration & Client ID Metadata Documents**:
  - `POST /oauth/register` (instance-level) and `POST /spaces/{space_id}/oauth/register` (workspace-level), plus SSRF-protected HTTPS JSON metadata resolution when `client_id` is an `https://` URL, gated by `SATURN_OAUTH_ALLOW_DYNAMIC_REGISTRATION`.
- **RFC 7009 — Token Revocation**:
  - `POST /oauth/revoke` invalidating `sat_oat_...` access tokens or `sat_ort_...` refresh tokens (and their parent grant).

---

## 4. Architecture & Layer Breakdown

### Phase 1: Database Migration (`migrations/058_identity_oauth_provider.sql`)

Create pure persistence tables under `identity` with strict relational cascades to `space.space`, `space.member`, and `identity.user`:

1. **`identity.oauth_clients`** (Hybrid: `space_id IS NULL` = Instance Client; `space_id IS NOT NULL` = Workspace Client):
   - `id` (`TEXT COLLATE "C" PRIMARY KEY` — `oac_<ksuid>`, or canonical HTTPS URL for cached CIMD clients)
   - `space_id` (`TEXT COLLATE "C" REFERENCES space.space(id) ON DELETE CASCADE`, nullable)
   - `name` (`VARCHAR(255) NOT NULL`)
   - `description` (`TEXT NOT NULL DEFAULT ''`)
   - `secret_prefix` (`VARCHAR(24) NOT NULL DEFAULT ''`)
   - `secret_hash` (`VARCHAR(64)`, nullable for `none` public PKCE clients)
   - `redirect_uris` (`TEXT[] NOT NULL`)
   - `allowed_scopes` (`TEXT[] NOT NULL` — non-empty scope ceiling enforced on every grant issued to this client; defaults to `AllAPIKeyScopes` for DCR/CIMD)
   - `token_endpoint_auth_method` (`VARCHAR(32) NOT NULL` — `client_secret_basic`, `client_secret_post`, `none`)
   - `refresh_token_policy` (`VARCHAR(20) NOT NULL DEFAULT 'rotate'` — `rotate` | `persistent`)
   - `registration_source` (`VARCHAR(20) NOT NULL` — `admin`, `space`, `dcr`, `cimd`)
   - `metadata_etag` (`TEXT NOT NULL DEFAULT ''`), `metadata_fetched_at` (`TIMESTAMPTZ`)
   - `create_time`, `update_time` (`TIMESTAMPTZ NOT NULL DEFAULT NOW()`)
   - Index: `idx_identity_oauth_clients_space ON identity.oauth_clients(space_id, create_time DESC)`

2. **`identity.oauth_grants`** (Per-User & Per-Workspace active authorization):
   - `id` (`TEXT COLLATE "C" PRIMARY KEY` — `oag_<ksuid>`)
   - `client_id` (`TEXT COLLATE "C" NOT NULL REFERENCES identity.oauth_clients(id) ON DELETE CASCADE`)
   - `user_id` (`TEXT COLLATE "C" NOT NULL REFERENCES identity.user(id) ON DELETE CASCADE`)
   - `space_id` (`TEXT COLLATE "C" NOT NULL`)
   - `scopes` (`TEXT[] NOT NULL`)
   - `refresh_token_hash` (`VARCHAR(64) UNIQUE`)
   - `previous_refresh_token_hash` (`VARCHAR(64)`)
   - `previous_refresh_grace_until` (`TIMESTAMPTZ`)
   - `refresh_expires_at`, `last_used_at`, `revoked_at`, `create_time`, `update_time` (`TIMESTAMPTZ`)
   - `CONSTRAINT fk_oauth_grant_member FOREIGN KEY (space_id, user_id) REFERENCES space.member(space_id, user_id) ON DELETE CASCADE`

3. **`identity.oauth_auth_codes`** (Single-use authorization codes + browser redirect handoff nonces):
   - `id` (`TEXT COLLATE "C" PRIMARY KEY` — `oaz_<ksuid>`)
   - `code_hash` (`VARCHAR(64) UNIQUE`, nullable when user denies consent)
   - `handoff_hash` (`VARCHAR(64) NOT NULL UNIQUE`)
   - `approved` (`BOOLEAN NOT NULL`)
   - `client_id` (`TEXT COLLATE "C" NOT NULL REFERENCES identity.oauth_clients(id) ON DELETE CASCADE`)
   - `user_id` (`TEXT COLLATE "C" NOT NULL REFERENCES identity.user(id) ON DELETE CASCADE`)
   - `space_id` (`TEXT COLLATE "C" NOT NULL DEFAULT ''`)
   - `redirect_uri`, `state`, `resource` (`TEXT NOT NULL DEFAULT ''`)
   - `scopes` (`TEXT[] NOT NULL DEFAULT '{}'`)
   - `code_challenge` (`VARCHAR(128) NOT NULL`), `code_challenge_method` (`VARCHAR(16) NOT NULL`)
   - `expires_at`, `consumed_at`, `handoff_consumed_at`, `create_time` (`TIMESTAMPTZ`)

4. **`identity.oauth_access_tokens`**:
   - `id` (`TEXT COLLATE "C" PRIMARY KEY` — `oat_<ksuid>`)
   - `grant_id` (`TEXT COLLATE "C" NOT NULL REFERENCES identity.oauth_grants(id) ON DELETE CASCADE`)
   - `token_hash` (`VARCHAR(64) NOT NULL UNIQUE`)
   - `expires_at`, `revoked_at`, `create_time` (`TIMESTAMPTZ`)

---

### Phase 2: Pure Domain & SQL Storage (`internal/domain/identity/`)

- **Domain Entities & Rules (`internal/domain/identity/oauth.go`)**:
  - Prefixed IDs (`oac_`, `oag_`, `oaz_`, `oat_`) and token prefixes (`sat_ocs_`, `sat_oat_`, `sat_ort_`).
  - `OAuthClient.Validate()`: Validates name, auth method (`none` vs secret-backed), `refresh_token_policy` (`rotate` vs `persistent`), `allowed_scopes` subset of `AllAPIKeyScopes`, and vendor-agnostic `redirect_uris` (HTTPS exact, HTTPS `/*` subpath prefix on concrete host, or RFC 8252 loopback HTTP).
  - `OAuthClient.MatchesRedirectURI(candidate string) bool`: Pure RFC 8252 loopback port-insensitive match + exact HTTPS match + explicit `/*` subpath prefix match.
  - `ResolveRequestedOAuthScopes(requested []string, clientAllowed []string, memberRole string)`: Filters requested scopes (ignoring standard OIDC identity hints like `openid`/`profile`/`email` while tracking `offline_access`), intersects against `client.AllowedScopes`, defaults to `client.AllowedScopes` read-only subset when omitted, and restricts `viewer` Space roles to `:read` scopes.
  - `VerifyPKCES256(verifier, challenge string) bool` using `crypto/subtle.ConstantTimeCompare`.
  - Patch schema (`OAuthClientPatchSchema`) for `name`, `description`, `redirect_uris`, `allowed_scopes`, `token_endpoint_auth_method`, and `refresh_token_policy`.
- **Storage Ports (`internal/domain/identity/storage.go`) & PostgreSQL (`internal/domain/identity/storage/oauth_store.go`)**:
  - `@Mock` interfaces `OAuthClientStore`, `OAuthGrantStore`, `OAuthAuthCodeStore`, and `OAuthAccessTokenStore` with zero-logic SQL implementations; regenerate mocks via `tools/mockgen`.

---

### Phase 3: Application Coordinators & Space Aggregator

1. **`internal/application/iam/oauth.go` (`iam.Coordinator`)**:
   - **Instance Admin (`AdminIdentity`)**: `AdminCreateOAuthClient`, `AdminGetOAuthClient`, `AdminListOAuthClients`, `AdminUpdateOAuthClient` (`@transactional`), `AdminRotateOAuthClientSecret` (`@transactional`), `AdminDeleteOAuthClient` (`@transactional`) — operates on global clients (`space_id == nil`, plus read/delete visibility into `dcr`/`cimd` clients).
   - **Personal User (`Identity`)**:
     - `ListUserOAuthGrants` (hydrates Space names via `spaceService` + Client names), `RevokeUserOAuthGrant` (`@transactional`).
     - `InspectOAuthConsent`: Validates `client_id` (resolving HTTPS CIMD with SSRF guard if `AllowDynamicRegistration`), `redirect_uri`, `response_type=code`, `code_challenge_method=S256`, and optional RFC 8707 `resource` (`/spaces/{space_id}/mcp`). Enforces that if `client.SpaceID != nil` and `resource` specifies a different Space, the request is rejected (`invalid_target`). Returns client metadata, locked `space_id` (if Workspace client or Space `resource` URL), and effective allowed scopes.
     - `DecideOAuthConsent` (`@transactional`): Verifies caller's active membership in target `space_id` (and `space_id == *client.SpaceID` for Workspace clients), creates single-use `OAuthAuthCode` (5m TTL) or `access_denied` record, and returns a 60s `handoff_token`.
   - **Public OAuth 2.1 Protocol**:
     - `RegisterDynamicOAuthClient` (`@transactional`): Supports both global (`spaceID == nil`) and Workspace-scoped (`spaceID != nil`, verifying Space exists) RFC 7591 registration when `AllowDynamicRegistration` is enabled.
     - `ConsumeOAuthRedirectHandoff` (`@transactional`): Atomically consumes `handoff_token` and builds the exact redirect URL (`?code=...&state=...` or `?error=access_denied&state=...`).
     - `ExchangeOAuthToken` (`@transactional`):
       - `authorization_code`: Verifies client credentials, consumes single-use code, checks `redirect_uri`, RFC 8707 `resource`, and PKCE `S256`, verifies user & Space membership, creates/updates `OAuthGrant`, and issues `sat_oat_...` + `sat_ort_...`.
       - `refresh_token`: Verifies client credentials & grant membership; under `rotate` policy, rotates `sat_ort_...` with a 30s retry grace window and revokes the grant on replay outside the grace window; under `persistent` policy, keeps the same `sat_ort_...` and slides `refresh_expires_at`.
     - `RevokeOAuthToken` (`@transactional`): RFC 7009 revocation for access or refresh tokens.

2. **`internal/application/space/` & `internal/aggregator/space/` (`Spaces`)**:
   - Verify Space `owner`/`admin` session via `spaceService`, then delegate Workspace OAuth Client CRUD + secret rotation (`space_id = &req.SpaceID`) and Workspace `OAuthGrant` listing/revocation (`ListSpaceOAuthGrants` hydrated with user profile + client name, `RevokeSpaceOAuthGrant`) — exact mirror of `SpaceAPIKeyGrants`.
   - Regenerate `coordinator_tx.go` (`txgen`), `coordinator_log.go` (`loggen`), and `mocks_test.go` (`mockgen`).

---

### Phase 4: Unified Token Authentication (`internal/foundation/auth` & `internal/transport/`)

- Add `OAuthGrantID string` and `IsScopedGrant() bool` (`p.APIKeyID != "" || p.OAuthGrantID != ""`) on `auth.Principal` (`internal/foundation/auth/context.go`), updating `HasScope` and `HasSpaceGrant` to check `p.IsScopedGrant()`.
- Extend `transportauth.Authenticator` (`internal/transport/auth/authenticator.go`):
  - Check `identity.OAuthAccessTokenPrefix` (`"sat_oat_"`) **before** `identity.APIKeyTokenPrefix` (`"sat_"`).
  - Validate active access token, unrevoked `OAuthGrant`, and active/unlocked user; return `Principal` with `OAuthGrantID`, `Scopes`, and `GrantedSpaceIDs: []string{grant.SpaceID}` (debouncing `TouchGrantLastUsed` every 1m asynchronously like API keys).
  - Update `ResolveSpace`, `AuthInterceptor`, and MCP `callerHasScope` to check `principal.IsScopedGrant()`.

---

### Phase 5: Protobufs, HTTP OAuth 2.1 Transport, Config & MCP `Instructions`

1. **Protobuf Definitions (`make codegen`)**:
   - `api/saturn/identity/admin/v1/admin_identity.proto`: Instance-level `OAuthClient` resource & CRUD + `:rotate-secret` RPCs under `/v1/admin/identity/oauth-clients`.
   - `api/saturn/space/v1/space.proto`: Workspace-level `SpaceOAuthClient` CRUD + `:rotate-secret` under `/v1/spaces/{space_id}/oauth-clients`, and `SpaceOAuthGrant` list/revoke under `/v1/spaces/{space_id}/oauth-grants`.
   - `api/saturn/identity/v1/identity.proto`: Personal `UserOAuthGrant` list/revoke under `/v1/identity/oauth/grants`, plus `InspectOAuthConsent` (`GET /v1/identity/oauth/consent`) and `DecideOAuthConsent` (`POST /v1/identity/oauth/consent:decide`).
2. **HTTP OAuth 2.1 & `.well-known` Handlers (`internal/transport/http/oauth/`)**:
   - Built with Go 1.27 `"encoding/json/v2"` and mounted in `cmd/saturn/app/server.go` ahead of the SPA fallback:
     - `GET /.well-known/oauth-protected-resource` and `GET /.well-known/oauth-protected-resource/{path...}`
     - `GET /.well-known/oauth-authorization-server`, `GET /.well-known/oauth-authorization-server/{path...}`, and `GET /.well-known/openid-configuration`
     - `POST /oauth/register` and `POST /spaces/{space_id}/oauth/register`
     - `GET /oauth/authorize/callback` (explicit `http.StatusFound` `302` redirect)
     - `POST /oauth/token` and `POST /oauth/revoke`
   - Update `mcpmiddleware.AuthMiddleware` to emit request-path-aware `WWW-Authenticate: Bearer resource_metadata="..."` headers so `/mcp` points to `/.well-known/oauth-protected-resource/mcp` and `/spaces/{space_id}/mcp` points to `/.well-known/oauth-protected-resource/spaces/{space_id}/mcp`.
3. **Config (`cmd/saturn/app/config.go`)**:
   - `SATURN_OAUTH_ISSUER_URL` (`oauth.issuer_url`, optional public base URL override; auto-derived from request host when unset)
   - `SATURN_OAUTH_ALLOW_DYNAMIC_REGISTRATION` (`oauth.allow_dynamic_registration`, default `false`)
   - `SATURN_OAUTH_ACCESS_TOKEN_TTL` (`oauth.access_token_ttl`, default `1h`)
   - `SATURN_OAUTH_REFRESH_TOKEN_TTL` (`oauth.refresh_token_ttl`, default `2160h` / 90d)
4. **Vendor-Neutral MCP `Instructions` (`internal/transport/mcp/server.go`)**:
   - Pass `Instructions` into `sdkmcp.ServerOptions` summarizing Saturn's Space-isolated domains (Finance accounts/budgets/periods/transactions/borrowings, Calendar, Mail, Workflows, Spaces), currency/date formatting conventions, and guidance to inspect existing accounts/categories via read tools before executing mutations.

---

### Phase 6: Web UI (`apps/web/`)

1. **Login & MFA Return Redirect (`apps/web/components/protected-route.tsx`, `apps/web/features/auth/login-view.tsx`)**:
   - Preserve `?return_to=<encoded path+query>` through `<ProtectedRoute />`, password login, and MFA verification (validated as a safe relative internal path).
2. **OAuth 2.1 Consent View (`apps/web/features/auth/oauth-consent-view.tsx`)**:
   - Route `/oauth/authorize` inside `<ProtectedRoute />` using `<AuthCard>` (clean single-column layout).
   - Shows Client Name, Client Scope badge (*Workspace App* vs. *Instance App*), Redirect URI host, **Workspace Selector** (locked automatically when the client is a Workspace Client or RFC 8707 `resource` targets `/spaces/{space_id}/mcp`), and interactive scope permissions.
   - Approval/Denial navigates to `/oauth/authorize/callback?handoff=...` for the `302 Found` redirect.
3. **Workspace Settings — Workspace OAuth Apps (`apps/web/features/settings/components/space-oauth-apps-settings.tsx`)**:
   - Route `/settings/oauth-apps` ("Workspace OAuth Apps") under *Workspace* in `settings-view.tsx` (for Space `owner`/`admin`).
   - Displays copyable Space MCP endpoint (`https://<origin>/spaces/<space_id>/mcp`), Workspace `OAuthClient` CRUD (Name, Auth Method, Refresh Policy `Rotate` vs `Persistent`, Redirect URIs, Allowed Scopes ceiling, one-time secret reveal & secret rotation), and active Workspace `OAuthGrant` audit/revocation list.
4. **Personal Settings — Authorized OAuth Apps (`apps/web/features/settings/components/personal-oauth-apps-settings.tsx`)**:
   - Route `/settings/security/oauth-apps` ("Authorized OAuth Apps") under *Access & Security* in `settings-view.tsx`.
   - Lists the user's active `OAuthGrants` across all Workspaces (formatted with `useTimezone()`) with one-click **Revoke**.
5. **Admin Panel — Instance OAuth Clients (`apps/web/features/admin/oauth-clients-view.tsx`)**:
   - Route `/admin/oauth-clients` ("OAuth Clients") in `apps/web/features/admin/` behind `<AdminGuard>` for managing global instance clients (`https://<origin>/mcp`) and inspecting/deleting DCR & CIMD registrations.

---

## 5. Testing & Verification Plan

1. **Table-Driven Unit Tests (In-Memory)**:
   - `internal/domain/identity/oauth_test.go`: Hybrid Workspace vs. Instance validation, RFC 8252 loopback port matching, HTTPS subpath `/*` matching, PKCE `S256`, scope ceiling intersection, `viewer` read-only enforcement.
   - `internal/application/iam/oauth_test.go` & `internal/application/space/oauth_test.go`: Workspace vs. Instance client isolation (ensuring Space A's client cannot authorize Space B), single-use code replay rejection, `rotate` (with 30s grace + replay revocation) vs. `persistent` refresh token policies, DCR & SSRF-guarded CIMD flows, RFC 7009 revocation.
   - `internal/transport/auth/authenticator_test.go`, `internal/transport/http/oauth/handler_test.go`, `internal/transport/mcp/server_test.go`.
   - Frontend Vitest suites (`login-view.test.tsx`, `oauth-consent-view.test.tsx`, `space-oauth-apps-settings.test.tsx`).
2. **PostgreSQL + MCP Integration Test (`tests/oauth_mcp_integration_test.go`, `//go:build integration`)**:
   - Full end-to-end verification of **both** a Workspace OAuth Client (`/spaces/{space_id}/mcp`) and an Instance OAuth Client (`/mcp` + DCR), covering `401 WWW-Authenticate` discovery $\rightarrow$ `.well-known` metadata $\rightarrow$ consent & `302 Found` callback $\rightarrow$ PKCE token exchange $\rightarrow$ authenticated Streamable HTTP MCP `initialize` (`instructions`), scope-filtered `tools/list`, and `tools/call` $\rightarrow$ `rotate` & `persistent` token refresh $\rightarrow$ `/oauth/revoke` immediate invalidation.
3. **Verification Gates**:
   - `make codegen`, `go fix ./...`, `make lint`, `make test-unit`, `make test-integration`.
