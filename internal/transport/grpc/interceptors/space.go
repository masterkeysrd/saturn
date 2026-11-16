package interceptors

import (
	"context"
	"strings"
	"sync"
	"time"

	"github.com/masterkeysrd/saturn/api"
	"github.com/masterkeysrd/saturn/internal/domain/space"
	foundationauth "github.com/masterkeysrd/saturn/internal/foundation/auth"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	transportauth "github.com/masterkeysrd/saturn/internal/transport/auth"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
)

// MemberStoreProvider provides access to MemberStore for the interceptor.
type MemberStoreProvider = transportauth.MemberStoreProvider

// SpaceInterceptor validates space-scoped gRPC requests by checking user membership and API key grants.
type SpaceInterceptor struct {
	auth  *transportauth.Authenticator
	rules []api.SpaceRule
	cache sync.Map // Cache of: string (method) -> bool (needs scoping)
}

// NewSpaceInterceptor creates a new SpaceInterceptor.
func NewSpaceInterceptor(memberStore MemberStoreProvider, rules []api.SpaceRule) *SpaceInterceptor {
	return &SpaceInterceptor{
		auth: transportauth.NewAuthenticator(transportauth.Config{
			MemberStore: memberStore,
			NowFunc:     func() time.Time { return timeNow() },
		}),
		rules: rules,
	}
}

// InvalidateMember evicts a cached workspace membership record.
func (si *SpaceInterceptor) InvalidateMember(spaceID space.SpaceID, userID space.UserID) {
	si.auth.InvalidateMember(spaceID, userID)
}

// UnaryServerInterceptor returns a gRPC unary interceptor that validates space scope.
func (si *SpaceInterceptor) UnaryServerInterceptor() grpc.UnaryServerInterceptor {
	return func(ctx context.Context, req any, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (any, error) {
		ctx, err := si.intercept(ctx, info.FullMethod)
		if err != nil {
			return nil, err
		}
		return handler(ctx, req)
	}
}

// StreamServerInterceptor returns a gRPC stream interceptor that validates space scope.
func (si *SpaceInterceptor) StreamServerInterceptor() grpc.StreamServerInterceptor {
	return func(srv any, stream grpc.ServerStream, info *grpc.StreamServerInfo, handler grpc.StreamHandler) error {
		ctx, err := si.intercept(stream.Context(), info.FullMethod)
		if err != nil {
			return err
		}
		return handler(srv, WrapServerStream(ctx, stream))
	}
}

func (si *SpaceInterceptor) intercept(ctx context.Context, fullMethod string) (context.Context, error) {
	if !si.resolveSpacePolicy(fullMethod) {
		return ctx, nil
	}

	principal, ok := foundationauth.PrincipalFromContext(ctx)
	if !ok {
		return ctx, status.Error(codes.Unauthenticated, "missing principal")
	}

	spaceIDStr := extractHeaderFromMetadata(ctx, "space-id")
	sc, err := si.auth.ResolveSpace(ctx, principal, spaceIDStr)
	if err != nil {
		switch errors.KindOf(err) {
		case errors.Permission:
			return ctx, status.Error(codes.PermissionDenied, errors.UserMessage(err))
		case errors.Invalid:
			return ctx, status.Error(codes.InvalidArgument, errors.UserMessage(err))
		default:
			return ctx, status.Error(codes.Unauthenticated, errors.UserMessage(err))
		}
	}

	return foundationauth.WithSpaceScope(ctx, sc.SpaceID, sc.Role), nil
}

func (si *SpaceInterceptor) resolveSpacePolicy(method string) bool {
	if cached, ok := si.cache.Load(method); ok {
		return cached.(bool)
	}

	normalizedMethod := strings.TrimPrefix(method, "/")
	normalizedMethod = strings.ReplaceAll(normalizedMethod, "/", ".")

	scoped := false
	for _, rule := range si.rules {
		if matchSelector(rule.Selector, normalizedMethod) {
			scoped = rule.Scoped
		}
	}

	si.cache.Store(method, scoped)
	return scoped
}

func extractHeaderFromMetadata(ctx context.Context, key string) string {
	md, ok := metadata.FromIncomingContext(ctx)
	if !ok {
		return ""
	}
	if vals := md[key]; len(vals) > 0 {
		return strings.TrimSpace(vals[0])
	}
	return ""
}
