package interceptors

import (
	"context"
	"regexp"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/masterkeysrd/saturn/api"
	"github.com/masterkeysrd/saturn/internal/domain/identity"
	"github.com/masterkeysrd/saturn/internal/domain/space"
	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	"github.com/masterkeysrd/saturn/internal/platform/token"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
)

// UserStoreProvider provides auth_version and user status lookups for the interceptor.
type UserStoreProvider interface {
	GetAuthVersion(ctx context.Context, id identity.UserID) (int64, error)
	GetByID(ctx context.Context, id identity.UserID) (*identity.User, error)
}

// APIKeyStoreProvider provides API key lookup and last-used timestamp updates for the interceptor.
type APIKeyStoreProvider interface {
	GetByHash(ctx context.Context, keyHash string) (*identity.APIKey, error)
	TouchLastUsed(ctx context.Context, id identity.APIKeyID, lastUsedAt time.Time) error
}

// APIKeyGrantProvider provides active granted space lookups for an API key.
type APIKeyGrantProvider interface {
	ListSpaceIDsByAPIKeyID(ctx context.Context, apiKeyID string) ([]space.SpaceID, error)
}

// resolvedPolicy holds the evaluated authentication and authorization policy for a method.
type resolvedPolicy struct {
	AuthRequired bool
	AccessLevels []string
	APIKeyScopes []string
}

// AuthInterceptor validates JWT access tokens and sat_ API keys, injecting Principal into gRPC context.
type AuthInterceptor struct {
	validator   token.Service
	store       UserStoreProvider
	apiKeyStore APIKeyStoreProvider
	grantStore  APIKeyGrantProvider
	rules       []api.AuthRule
	cache       sync.Map // Cache of: string (method) -> *resolvedPolicy
}

// NewAuthInterceptor creates an interceptor with the given token service, user store, API key stores, and auth rules.
func NewAuthInterceptor(
	validator token.Service,
	store UserStoreProvider,
	apiKeyStore APIKeyStoreProvider,
	grantStore APIKeyGrantProvider,
	rules []api.AuthRule,
) *AuthInterceptor {
	return &AuthInterceptor{
		validator:   validator,
		store:       store,
		apiKeyStore: apiKeyStore,
		grantStore:  grantStore,
		rules:       rules,
	}
}

// UnaryServerInterceptor returns a gRPC unary interceptor that authenticates requests.
func (ai *AuthInterceptor) UnaryServerInterceptor() grpc.UnaryServerInterceptor {
	return func(ctx context.Context, req any, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (any, error) {
		ctx, err := ai.intercept(ctx, info.FullMethod)
		if err != nil {
			return nil, err
		}
		return handler(ctx, req)
	}
}

// StreamServerInterceptor returns a gRPC stream interceptor that authenticates requests.
func (ai *AuthInterceptor) StreamServerInterceptor() grpc.StreamServerInterceptor {
	return func(srv any, stream grpc.ServerStream, info *grpc.StreamServerInfo, handler grpc.StreamHandler) error {
		ctx, err := ai.intercept(stream.Context(), info.FullMethod)
		if err != nil {
			return err
		}
		return handler(srv, WrapServerStream(ctx, stream))
	}
}

func (ai *AuthInterceptor) intercept(ctx context.Context, fullMethod string) (context.Context, error) {
	policy, _ := ai.resolvePolicy(fullMethod)
	if policy != nil && policy.AuthRequired {
		return ai.authenticate(ctx, policy)
	}
	return ctx, nil
}

// resolvePolicy evaluates the auth rules for a given gRPC method name.
// Returns the resolved policy and a cache hit flag.
func (ai *AuthInterceptor) resolvePolicy(method string) (*resolvedPolicy, bool) {
	if cached, ok := ai.cache.Load(method); ok {
		return cached.(*resolvedPolicy), true
	}

	normalizedMethod := strings.TrimPrefix(method, "/")
	normalizedMethod = strings.ReplaceAll(normalizedMethod, "/", ".")

	var policy *resolvedPolicy
	for _, rule := range ai.rules {
		if matchSelector(rule.Selector, normalizedMethod) {
			policy = &resolvedPolicy{
				AuthRequired: rule.AuthRequired,
				AccessLevels: rule.AccessLevels,
				APIKeyScopes: rule.APIKeyScopes,
			}
		}
	}

	if policy == nil {
		policy = &resolvedPolicy{AuthRequired: false}
	}

	ai.cache.Store(method, policy)
	return policy, false
}

// authenticate validates either a JWT or a sat_ API key from gRPC metadata and injects Principal into context.
func (ai *AuthInterceptor) authenticate(ctx context.Context, policy *resolvedPolicy) (context.Context, error) {
	md, ok := metadata.FromIncomingContext(ctx)
	if !ok {
		return ctx, status.Error(codes.Unauthenticated, "missing metadata")
	}

	var tokenStr string
	tokens := md["authorization"]
	if len(tokens) > 0 {
		tokenStr = tokens[0]
		tokenStr = strings.TrimPrefix(tokenStr, "Bearer ")
	}

	if len(strings.TrimSpace(tokenStr)) == 0 {
		if cookies := md["grpcgateway-cookie"]; len(cookies) > 0 {
			tokenStr = extractCookieValue(cookies[0], "access_token")
		}
	}

	tokenStr = strings.TrimSpace(tokenStr)
	if tokenStr == "" {
		return ctx, status.Error(codes.Unauthenticated, "missing or invalid authorization credentials")
	}

	if strings.HasPrefix(tokenStr, identity.APIKeyTokenPrefix) {
		return ai.authenticateAPIKey(ctx, tokenStr, policy)
	}

	claims, err := ai.validator.ValidateAccessToken(tokenStr, timeNow())
	if err != nil {
		return ctx, status.Error(codes.Unauthenticated, "invalid token")
	}

	authVersion, err := ai.store.GetAuthVersion(ctx, identity.UserID(claims.Subject))
	if err != nil {
		return ctx, status.Error(codes.Unauthenticated, "auth version check failed")
	}

	if claims.AuthVersion != authVersion {
		return ctx, status.Error(codes.Unauthenticated, "token invalidated")
	}

	principal := auth.Principal{
		Subject:     claims.Subject,
		AccessLevel: claims.AccessLevel,
		TokenID:     claims.ID,
		AuthVersion: claims.AuthVersion,
		SessionID:   claims.SessionID,
	}

	if len(policy.AccessLevels) > 0 {
		if !slices.Contains(policy.AccessLevels, principal.AccessLevel) {
			return ctx, status.Error(codes.PermissionDenied, "insufficient access level")
		}
	}

	return auth.WithPrincipal(ctx, principal), nil
}

func (ai *AuthInterceptor) authenticateAPIKey(ctx context.Context, tokenStr string, policy *resolvedPolicy) (context.Context, error) {
	if ai.apiKeyStore == nil || ai.grantStore == nil {
		return ctx, status.Error(codes.Unauthenticated, "API key authentication unavailable")
	}

	now := timeNow()
	keyHash := identity.HashAPIKeyToken(tokenStr)
	key, err := ai.apiKeyStore.GetByHash(ctx, keyHash)
	if err != nil || key == nil {
		return ctx, status.Error(codes.Unauthenticated, "invalid API key")
	}

	if key.IsExpired(now) {
		return ctx, status.Error(codes.Unauthenticated, "API key expired")
	}

	user, err := ai.store.GetByID(ctx, key.UserID)
	if err != nil || user == nil || user.Status != identity.UserStatusActive || user.IsLocked(now) {
		return ctx, status.Error(codes.Unauthenticated, "account is inactive or locked")
	}

	grantedSpaces, err := ai.grantStore.ListSpaceIDsByAPIKeyID(ctx, string(key.ID))
	if err != nil || len(grantedSpaces) == 0 {
		return ctx, status.Error(codes.Unauthenticated, "API key has no active space grants")
	}

	if len(policy.APIKeyScopes) == 0 || !hasAnyScope(policy.APIKeyScopes, key.Scopes) {
		return ctx, status.Error(codes.PermissionDenied, "API key lacks required scope")
	}

	if len(policy.AccessLevels) > 0 {
		if !slices.Contains(policy.AccessLevels, string(user.AccessLevel)) {
			return ctx, status.Error(codes.PermissionDenied, "insufficient access level")
		}
	}

	if key.LastUsedAt == nil || now.Sub(*key.LastUsedAt) >= time.Minute {
		go func(id identity.APIKeyID, ts time.Time) {
			touchCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			_ = ai.apiKeyStore.TouchLastUsed(touchCtx, id, ts)
		}(key.ID, now)
	}

	grantedSpaceIDs := make([]string, len(grantedSpaces))
	for i, sid := range grantedSpaces {
		grantedSpaceIDs[i] = string(sid)
	}

	principal := auth.Principal{
		Subject:         string(key.UserID),
		AccessLevel:     string(user.AccessLevel),
		APIKeyID:        string(key.ID),
		Scopes:          key.Scopes,
		GrantedSpaceIDs: grantedSpaceIDs,
	}

	return auth.WithPrincipal(ctx, principal), nil
}

func hasAnyScope(required, granted []string) bool {
	for _, r := range required {
		if slices.Contains(granted, r) {
			return true
		}
	}
	return false
}

// matchSelector matches a fully-qualified method name against a YAML selector pattern.
// Supports wildcards: "*" matches anything, ".*" matches suffix.
func matchSelector(selector, method string) bool {
	pattern := "^" + regexp.QuoteMeta(selector) + "$"
	pattern = strings.ReplaceAll(pattern, `\*`, `.*`)
	matched, _ := regexp.MatchString(pattern, method)
	return matched
}

func timeNow() time.Time {
	return time.Now()
}

func extractCookieValue(cookieHeader string, name string) string {
	parts := strings.SplitSeq(cookieHeader, ";")
	for part := range parts {
		part = strings.TrimSpace(part)
		if after, ok := strings.CutPrefix(part, name+"="); ok {
			return after
		}
	}
	return ""
}
