package auth

import (
	"context"
	"strings"
	"sync"

	"github.com/masterkeysrd/saturn/api"
	"github.com/masterkeysrd/saturn/internal/domain/space"
	foundationauth "github.com/masterkeysrd/saturn/internal/foundation/auth"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
)

// MemberStoreProvider provides access to MemberStore for the interceptor.
type MemberStoreProvider interface {
	GetByID(ctx context.Context, spaceID space.SpaceID, userID space.SpaceID) (*space.Member, error)
}

// SpaceInterceptor validates space-scoped gRPC requests by checking user membership.
type SpaceInterceptor struct {
	memberStore MemberStoreProvider
	rules       []api.SpaceRule
	cache       sync.Map // Cache of: string (method) -> bool (needs scoping)
}

// NewSpaceInterceptor creates a new SpaceInterceptor.
func NewSpaceInterceptor(memberStore MemberStoreProvider, rules []api.SpaceRule) *SpaceInterceptor {
	return &SpaceInterceptor{
		memberStore: memberStore,
		rules:       rules,
	}
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
		wrapped := &scopedStream{ServerStream: stream, ctx: ctx}
		return handler(srv, wrapped)
	}
}

// intercept validates space scope for the given method and updates context.
func (si *SpaceInterceptor) intercept(ctx context.Context, fullMethod string) (context.Context, error) {
	// Determine if this method requires space scoping
	if !si.resolveSpacePolicy(fullMethod) {
		return ctx, nil
	}

	// Extract Space-Id from metadata
	md, ok := metadata.FromIncomingContext(ctx)
	if !ok {
		return ctx, status.Error(codes.InvalidArgument, "missing metadata")
	}

	spaceIDs := md["space-id"]
	if len(spaceIDs) == 0 {
		return ctx, status.Error(codes.InvalidArgument, "missing space-id header")
	}

	spaceIDStr := strings.TrimSpace(spaceIDs[0])
	if spaceIDStr == "" {
		return ctx, status.Error(codes.InvalidArgument, "empty space-id header")
	}

	// Extract user ID from principal
	principal, ok := foundationauth.PrincipalFromContext(ctx)
	if !ok {
		return ctx, status.Error(codes.Unauthenticated, "missing principal")
	}

	// Validate space ID format
	spaceID, err := space.ParseSpaceID(spaceIDStr)
	if err != nil {
		return ctx, status.Error(codes.InvalidArgument, "invalid space-id format")
	}

	userID := space.SpaceID(principal.Subject)

	// Check user membership
	member, err := si.memberStore.GetByID(ctx, spaceID, userID)
	if err != nil {
		return ctx, status.Error(codes.PermissionDenied, "user is not a member of this space")
	}

	// Inject space scope into context
	return foundationauth.WithSpaceScope(ctx, string(spaceID), string(member.Role)), nil
}

// resolveSpacePolicy evaluates the space scoping rules for a given gRPC method name.
// Returns true if space scoping is required.
func (si *SpaceInterceptor) resolveSpacePolicy(method string) bool {
	// Check cache first
	if cached, ok := si.cache.Load(method); ok {
		return cached.(bool)
	}

	// Normalize gRPC method (e.g. "/saturn.space.v1.Spaces/CreateSpace" -> "saturn.space.v1.Spaces.CreateSpace")
	normalizedMethod := strings.TrimPrefix(method, "/")
	normalizedMethod = strings.ReplaceAll(normalizedMethod, "/", ".")

	// Iterate all rules; last matching rule wins
	scoped := false
	for _, rule := range si.rules {
		if matchSelector(rule.Selector, normalizedMethod) {
			scoped = rule.Scoped
		}
	}

	// Cache the result
	si.cache.Store(method, scoped)
	return scoped
}

// scopedStream wraps a ServerStream to use a scoped context.
type scopedStream struct {
	grpc.ServerStream
	ctx context.Context
}

func (s *scopedStream) Context() context.Context {
	return s.ctx
}
