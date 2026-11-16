package middleware

//go:generate go run github.com/masterkeysrd/saturn/tools/mockgen .

import (
	"context"
	"net/http"
	"slices"
	"strings"
	"time"

	"github.com/masterkeysrd/saturn/internal/domain/identity"
	"github.com/masterkeysrd/saturn/internal/domain/space"
	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/token"
	transportauth "github.com/masterkeysrd/saturn/internal/transport/auth"
	sdkauth "github.com/modelcontextprotocol/go-sdk/auth"
)

// TokenValidator validates JWT access tokens.
// @Mock
type TokenValidator interface {
	ValidateAccessToken(tokenString string, now time.Time) (*token.Claims, error)
}

// UserStoreProvider provides user status and auth_version lookups for MCP authentication.
// @Mock
type UserStoreProvider interface {
	GetAuthVersion(ctx context.Context, id identity.UserID) (int64, error)
	GetByID(ctx context.Context, id identity.UserID) (*identity.User, error)
}

// APIKeyStoreProvider provides API key lookup and last-used updates.
// @Mock
type APIKeyStoreProvider interface {
	GetByHash(ctx context.Context, keyHash string) (*identity.APIKey, error)
	TouchLastUsed(ctx context.Context, id identity.APIKeyID, lastUsedAt time.Time) error
}

// APIKeyGrantProvider lists spaces granted to an API key.
// @Mock
type APIKeyGrantProvider interface {
	ListSpaceIDsByAPIKeyID(ctx context.Context, apiKeyID string) ([]space.SpaceID, error)
}

// MemberStoreProvider verifies workspace membership and role.
// @Mock
type MemberStoreProvider interface {
	GetByID(ctx context.Context, spaceID space.SpaceID, userID space.UserID) (*space.Member, error)
}

// AuthConfig configures HTTP Bearer authentication and workspace scoping for MCP endpoints.
type AuthConfig struct {
	Authenticator       *transportauth.Authenticator
	TokenValidator      TokenValidator
	UserStore           UserStoreProvider
	APIKeyStore         APIKeyStoreProvider
	GrantStore          APIKeyGrantProvider
	MemberStore         MemberStoreProvider
	ResourceMetadataURL string
	AuthCacheTTL        time.Duration
	MemberCacheTTL      time.Duration
}

const principalExtraKey = "saturn_principal"

var timeNow = time.Now

// AuthMiddleware builds an HTTP middleware using github.com/modelcontextprotocol/go-sdk/auth.RequireBearerToken
// that delegates token and space verification to internal/transport/auth.Authenticator, rejects query-parameter
// credentials with 400, resolves {space_id} paths or Space-Id headers, and injects Principal and SpaceContext.
func AuthMiddleware(cfg AuthConfig) func(http.Handler) http.Handler {
	authenticator := cfg.Authenticator
	if authenticator == nil {
		authenticator = transportauth.NewAuthenticator(transportauth.Config{
			TokenValidator: cfg.TokenValidator,
			UserStore:      cfg.UserStore,
			APIKeyStore:    cfg.APIKeyStore,
			GrantStore:     cfg.GrantStore,
			MemberStore:    cfg.MemberStore,
			AuthCacheTTL:   cfg.AuthCacheTTL,
			MemberCacheTTL: cfg.MemberCacheTTL,
			NowFunc:        func() time.Time { return timeNow() },
		})
	}

	verifier := func(ctx context.Context, rawToken string, _ *http.Request) (*sdkauth.TokenInfo, error) {
		res, err := authenticator.AuthenticateToken(ctx, rawToken)
		if err != nil {
			return nil, sdkauth.ErrInvalidToken
		}
		return &sdkauth.TokenInfo{
			UserID:     res.Principal.Subject,
			Scopes:     slices.Clone(res.Principal.Scopes),
			Expiration: res.Expiration,
			Extra: map[string]any{
				principalExtraKey: res.Principal,
			},
		}, nil
	}

	bearer := sdkauth.RequireBearerToken(verifier, &sdkauth.RequireBearerTokenOptions{
		ResourceMetadataURL:    cfg.ResourceMetadataURL,
		AllowMissingExpiration: true,
	})

	return func(next http.Handler) http.Handler {
		protected := bearer(requireSpaceMembership(authenticator, next))
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			q := r.URL.Query()
			if q.Has("api_key") || q.Has("token") {
				WriteHTTPError(w, http.StatusBadRequest, "credentials must not be passed in URL query parameters; use Authorization: Bearer")
				return
			}
			protected.ServeHTTP(w, r)
		})
	}
}

func requireSpaceMembership(authenticator *transportauth.Authenticator, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		tokenInfo := sdkauth.TokenInfoFromContext(r.Context())
		if tokenInfo == nil || tokenInfo.Extra == nil {
			WriteHTTPError(w, http.StatusUnauthorized, "missing authentication token")
			return
		}

		principal, ok := tokenInfo.Extra[principalExtraKey].(auth.Principal)
		if !ok || principal.Subject == "" {
			WriteHTTPError(w, http.StatusUnauthorized, "invalid authentication principal")
			return
		}

		sc, err := authenticator.ResolveSpace(r.Context(), principal, extractSpaceIDFromRequest(r))
		if err != nil {
			switch errors.KindOf(err) {
			case errors.Permission:
				WriteHTTPError(w, http.StatusForbidden, errors.UserMessage(err))
			case errors.Invalid:
				WriteHTTPError(w, http.StatusBadRequest, errors.UserMessage(err))
			default:
				WriteHTTPError(w, http.StatusUnauthorized, errors.UserMessage(err))
			}
			return
		}

		ctx := auth.WithPrincipal(r.Context(), principal)
		ctx = auth.WithSpaceScope(ctx, sc.SpaceID, sc.Role)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func extractSpaceIDFromRequest(r *http.Request) string {
	if v := strings.TrimSpace(r.PathValue("space_id")); v != "" {
		return v
	}

	// Fallback path extraction for routers that do not populate PathValue("space_id"):
	// supports /spaces/{space_id}/mcp and /api/spaces/{space_id}/mcp.
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	for i := 0; i+2 < len(parts); i++ {
		if parts[i] == "spaces" && parts[i+2] == "mcp" && parts[i+1] != "" {
			return strings.TrimSpace(parts[i+1])
		}
	}

	return strings.TrimSpace(r.Header.Get("Space-Id"))
}
