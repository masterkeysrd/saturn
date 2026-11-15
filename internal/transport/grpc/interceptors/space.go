package interceptors

import (
	"context"
	"slices"
	"strings"
	"sync"
	"time"

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

// SpaceInterceptor validates space-scoped gRPC requests by checking user membership and API key grants.
type SpaceInterceptor struct {
	memberStore    MemberStoreProvider
	rules          []api.SpaceRule
	cache          sync.Map // Cache of: string (method) -> bool (needs scoping)
	memberCache    sync.Map // Cache of: memberCacheKey -> memberCacheEntry
	memberCacheTTL time.Duration
}

type memberCacheKey struct {
	spaceID space.SpaceID
	userID  space.SpaceID
}

type memberCacheEntry struct {
	member    *space.Member
	expiresAt time.Time
}

const defaultMemberCacheTTL = 5 * time.Second

// NewSpaceInterceptor creates a new SpaceInterceptor.
func NewSpaceInterceptor(memberStore MemberStoreProvider, rules []api.SpaceRule) *SpaceInterceptor {
	return &SpaceInterceptor{
		memberStore:    memberStore,
		rules:          rules,
		memberCacheTTL: defaultMemberCacheTTL,
	}
}

// InvalidateMember evicts a cached workspace membership record.
func (si *SpaceInterceptor) InvalidateMember(spaceID, userID space.SpaceID) {
	si.memberCache.Delete(memberCacheKey{spaceID: spaceID, userID: userID})
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

// intercept validates space scope for the given method and updates context.
func (si *SpaceInterceptor) intercept(ctx context.Context, fullMethod string) (context.Context, error) {
	if !si.resolveSpacePolicy(fullMethod) {
		return ctx, nil
	}

	principal, ok := foundationauth.PrincipalFromContext(ctx)
	if !ok {
		return ctx, status.Error(codes.Unauthenticated, "missing principal")
	}

	md, hasMD := metadata.FromIncomingContext(ctx)
	var spaceIDStr string
	if hasMD {
		if spaceIDs := md["space-id"]; len(spaceIDs) > 0 {
			spaceIDStr = strings.TrimSpace(spaceIDs[0])
		}
	}

	if principal.IsAPIKey() {
		if spaceIDStr == "" {
			switch len(principal.GrantedSpaceIDs) {
			case 0:
				return ctx, status.Error(codes.PermissionDenied, "API key has no active space grants")
			case 1:
				spaceIDStr = principal.GrantedSpaceIDs[0]
			default:
				return ctx, status.Error(codes.InvalidArgument, "multiple spaces granted to this API key; provide the space-id header")
			}
		} else if !slices.Contains(principal.GrantedSpaceIDs, spaceIDStr) {
			return ctx, status.Error(codes.PermissionDenied, "API key does not have access to this space")
		}
	} else {
		if !hasMD {
			return ctx, status.Error(codes.InvalidArgument, "missing metadata")
		}
		if len(md["space-id"]) == 0 {
			return ctx, status.Error(codes.InvalidArgument, "missing space-id header")
		}
		if spaceIDStr == "" {
			return ctx, status.Error(codes.InvalidArgument, "empty space-id header")
		}
	}

	spaceID, err := space.ParseSpaceID(spaceIDStr)
	if err != nil {
		return ctx, status.Error(codes.InvalidArgument, "invalid space-id format")
	}

	userID := space.SpaceID(principal.Subject)

	member, err := si.getMember(ctx, spaceID, userID)
	if err != nil {
		return ctx, status.Error(codes.PermissionDenied, "user is not a member of this space")
	}

	return foundationauth.WithSpaceScope(ctx, string(spaceID), string(member.Role)), nil
}

func (si *SpaceInterceptor) getMember(ctx context.Context, spaceID, userID space.SpaceID) (*space.Member, error) {
	key := memberCacheKey{spaceID: spaceID, userID: userID}
	now := timeNow()
	if si.memberCacheTTL > 0 {
		if raw, ok := si.memberCache.Load(key); ok {
			entry := raw.(memberCacheEntry)
			if now.Before(entry.expiresAt) {
				return entry.member, nil
			}
		}
	}

	member, err := si.memberStore.GetByID(ctx, spaceID, userID)
	if err != nil {
		return nil, err
	}
	if si.memberCacheTTL > 0 && member != nil {
		si.memberCache.Store(key, memberCacheEntry{
			member:    member,
			expiresAt: now.Add(si.memberCacheTTL),
		})
	}
	return member, nil
}

// resolveSpacePolicy evaluates the space scoping rules for a given gRPC method name.
// Returns true if space scoping is required.
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
