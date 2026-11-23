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
	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/token"
	transportauth "github.com/masterkeysrd/saturn/internal/transport/auth"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
)

// UserStoreProvider provides auth_version and user status lookups for the interceptor.
type UserStoreProvider = transportauth.UserStoreProvider

// APIKeyStoreProvider provides API key lookup and last-used timestamp updates for the interceptor.
type APIKeyStoreProvider = transportauth.APIKeyStoreProvider

// APIKeyGrantProvider provides active granted space lookups for an API key.
type APIKeyGrantProvider = transportauth.APIKeyGrantProvider

type resolvedPolicy struct {
	AuthRequired bool
	AccessLevels []string
	APIKeyScopes []string
}

// AuthInterceptor validates JWT access tokens and sat_ API keys, injecting Principal into gRPC context.
type AuthInterceptor struct {
	auth  *transportauth.Authenticator
	rules []api.AuthRule
	cache sync.Map // Cache of: string (method) -> *resolvedPolicy
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
		auth: transportauth.NewAuthenticator(transportauth.Config{
			TokenValidator: validator,
			UserStore:      store,
			APIKeyStore:    apiKeyStore,
			GrantStore:     grantStore,
			NowFunc:        func() time.Time { return timeNow() },
		}),
		rules: rules,
	}
}

// NewAuthInterceptorWithAuthenticator creates an interceptor using an existing transport Authenticator.
func NewAuthInterceptorWithAuthenticator(authenticator *transportauth.Authenticator, rules []api.AuthRule) *AuthInterceptor {
	return &AuthInterceptor{
		auth:  authenticator,
		rules: rules,
	}
}

// InvalidateAuthVersion evicts a user's cached auth version so subsequent requests re-query storage.
func (ai *AuthInterceptor) InvalidateAuthVersion(userID identity.UserID) {
	ai.auth.InvalidateAuthVersion(userID)
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
		policy = &resolvedPolicy{AuthRequired: true}
	}

	ai.cache.Store(method, policy)
	return policy, false
}

func (ai *AuthInterceptor) authenticate(ctx context.Context, policy *resolvedPolicy) (context.Context, error) {
	md, ok := metadata.FromIncomingContext(ctx)
	if !ok {
		return ctx, status.Error(codes.Unauthenticated, "missing metadata")
	}

	var tokenStr string
	if tokens := md["authorization"]; len(tokens) > 0 {
		tokenStr = strings.TrimPrefix(tokens[0], "Bearer ")
	}
	if strings.TrimSpace(tokenStr) == "" {
		if cookies := md["grpcgateway-cookie"]; len(cookies) > 0 {
			tokenStr = extractCookieValue(cookies[0], "access_token")
		}
	}

	res, err := ai.auth.AuthenticateToken(ctx, tokenStr)
	if err != nil {
		return ctx, status.Error(codes.Unauthenticated, errors.UserMessage(err))
	}

	principal := res.Principal
	if principal.IsScopedGrant() && (len(policy.APIKeyScopes) == 0 || !principal.HasScope(policy.APIKeyScopes...)) {
		return ctx, status.Error(codes.PermissionDenied, "credential lacks required scope")
	}

	if len(policy.AccessLevels) > 0 && !slices.Contains(policy.AccessLevels, principal.AccessLevel) {
		return ctx, status.Error(codes.PermissionDenied, "insufficient access level")
	}

	return auth.WithPrincipal(ctx, principal), nil
}

func (ai *AuthInterceptor) getAuthVersion(ctx context.Context, userID identity.UserID, claimVersion int64) (int64, error) {
	return ai.auth.GetAuthVersion(ctx, userID, claimVersion)
}

func matchSelector(selector, method string) bool {
	pattern := "^" + regexp.QuoteMeta(selector) + "$"
	pattern = strings.ReplaceAll(pattern, `\*`, `.*`)
	matched, _ := regexp.MatchString(pattern, method)
	return matched
}

var timeNow = time.Now

func extractCookieValue(cookieHeader string, name string) string {
	for part := range strings.SplitSeq(cookieHeader, ";") {
		part = strings.TrimSpace(part)
		if after, ok := strings.CutPrefix(part, name+"="); ok {
			return after
		}
	}
	return ""
}
