package auth

import (
	"context"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/masterkeysrd/saturn/api"
	"github.com/masterkeysrd/saturn/internal/domain/identity"
	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	"github.com/masterkeysrd/saturn/internal/platform/token"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
)

// UserStoreProvider provides auth_version lookups for the interceptor.
type UserStoreProvider interface {
	GetAuthVersion(ctx context.Context, id identity.UserID) (int64, error)
}

// resolvedPolicy holds the evaluated authentication and authorization policy for a method.
type resolvedPolicy struct {
	AuthRequired bool
	AccessLevels []string
}

// AuthInterceptor validates JWT access tokens and injects Principal into gRPC context.
type AuthInterceptor struct {
	validator token.Service
	store     UserStoreProvider
	rules     []api.AuthRule
	cache     sync.Map // Cache of: string (method) -> *resolvedPolicy
}

// NewAuthInterceptor creates an interceptor with the given token service, user store, and auth rules.
func NewAuthInterceptor(validator token.Service, store UserStoreProvider, rules []api.AuthRule) *AuthInterceptor {
	return &AuthInterceptor{
		validator: validator,
		store:     store,
		rules:     rules,
	}
}

// UnaryServerInterceptor returns a gRPC unary interceptor that authenticates requests.
func (ai *AuthInterceptor) UnaryServerInterceptor() grpc.UnaryServerInterceptor {
	return func(ctx context.Context, req any, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (any, error) {
		policy, _ := ai.resolvePolicy(info.FullMethod)
		if policy != nil && policy.AuthRequired {
			var err error
			ctx, err = ai.authenticate(ctx, policy.AccessLevels)
			if err != nil {
				return nil, err
			}
		}
		return handler(ctx, req)
	}
}

// StreamServerInterceptor returns a gRPC stream interceptor that authenticates requests.
func (ai *AuthInterceptor) StreamServerInterceptor() grpc.StreamServerInterceptor {
	return func(srv any, stream grpc.ServerStream, info *grpc.StreamServerInfo, handler grpc.StreamHandler) error {
		policy, _ := ai.resolvePolicy(info.FullMethod)
		if policy != nil && policy.AuthRequired {
			ctx, err := ai.authenticate(stream.Context(), policy.AccessLevels)
			if err != nil {
				return err
			}
			stream = &authenticatedStream{ServerStream: stream, ctx: ctx}
		}
		return handler(srv, stream)
	}
}

// authenticatedStream wraps a ServerStream to use an authenticated context.
type authenticatedStream struct {
	grpc.ServerStream
	ctx context.Context
}

func (s *authenticatedStream) Context() context.Context {
	return s.ctx
}

// resolvePolicy evaluates the auth rules for a given gRPC method name.
// Returns the resolved policy and a cache hit flag.
func (ai *AuthInterceptor) resolvePolicy(method string) (*resolvedPolicy, bool) {
	// Check cache first
	if cached, ok := ai.cache.Load(method); ok {
		return cached.(*resolvedPolicy), true
	}

	// Normalize gRPC method (e.g. "/saturn.identity.v1.Identity/LoginUser" -> "saturn.identity.v1.Identity.LoginUser")
	normalizedMethod := strings.TrimPrefix(method, "/")
	normalizedMethod = strings.ReplaceAll(normalizedMethod, "/", ".")

	// Iterate all rules; last matching rule wins
	var policy *resolvedPolicy
	for _, rule := range ai.rules {
		if matchSelector(rule.Selector, normalizedMethod) {
			policy = &resolvedPolicy{
				AuthRequired: rule.AuthRequired,
				AccessLevels: rule.AccessLevels,
			}
		}
	}

	if policy == nil {
		// No matching rule found; default to no auth required
		policy = &resolvedPolicy{AuthRequired: false}
	}

	// Cache the result
	ai.cache.Store(method, policy)
	return policy, false
}

// authenticate validates the JWT from gRPC metadata and injects Principal into context.
// If accessLevels is non-empty, it asserts that the token's principal matches one of them.
func (ai *AuthInterceptor) authenticate(ctx context.Context, accessLevels []string) (context.Context, error) {
	md, ok := metadata.FromIncomingContext(ctx)
	if !ok {
		return ctx, status.Error(codes.Unauthenticated, "missing metadata")
	}

	tokens := md["authorization"]
	if len(tokens) == 0 {
		return ctx, status.Error(codes.Unauthenticated, "missing authorization header")
	}

	tokenStr := tokens[0]
	tokenStr = strings.TrimPrefix(tokenStr, "Bearer ")
	if len(strings.TrimSpace(tokenStr)) == 0 {
		return ctx, status.Error(codes.Unauthenticated, "invalid authorization scheme")
	}

	claims, err := ai.validator.ValidateAccessToken(tokenStr, timeNow())
	if err != nil {
		return ctx, status.Error(codes.Unauthenticated, "invalid token")
	}

	// Check auth version against the database
	authVersion, err := ai.store.GetAuthVersion(ctx, identity.UserID(claims.Subject))
	if err != nil {
		return ctx, status.Error(codes.Unauthenticated, "auth version check failed")
	}

	if claims.AuthVersion != authVersion {
		return ctx, status.Error(codes.Unauthenticated, "token invalidated")
	}

	// Attach Principal to context
	principal := auth.Principal{
		Subject:     claims.Subject,
		AccessLevel: claims.AccessLevel,
		TokenID:     claims.ID,
		AuthVersion: claims.AuthVersion,
	}

	// Check access level restrictions
	if len(accessLevels) > 0 {
		allowed := false
		for _, level := range accessLevels {
			if principal.AccessLevel == level {
				allowed = true
				break
			}
		}
		if !allowed {
			return ctx, status.Error(codes.PermissionDenied, "insufficient access level")
		}
	}

	return auth.WithPrincipal(ctx, principal), nil
}

// matchSelector matches a fully-qualified method name against a YAML selector pattern.
// Supports wildcards: "*" matches anything, ".*" matches suffix.
func matchSelector(selector, method string) bool {
	// Convert selector to regex: "*" → ".*"
	pattern := "^" + regexp.QuoteMeta(selector) + "$"
	pattern = strings.ReplaceAll(pattern, `\*`, `.*`)
	matched, _ := regexp.MatchString(pattern, method)
	return matched
}

func timeNow() time.Time {
	return time.Now()
}
