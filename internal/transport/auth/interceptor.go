package auth

import (
	"context"
	"strings"
	"time"

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

// AuthInterceptor validates JWT access tokens and injects Principal into gRPC context.
type AuthInterceptor struct {
	validator token.Service
	store     UserStoreProvider
}

// NewAuthInterceptor creates an interceptor with the given token service and user store.
func NewAuthInterceptor(validator token.Service, store UserStoreProvider) *AuthInterceptor {
	return &AuthInterceptor{
		validator: validator,
		store:     store,
	}
}

// UnaryServerInterceptor returns a gRPC unary interceptor that authenticates requests.
func (ai *AuthInterceptor) UnaryServerInterceptor() grpc.UnaryServerInterceptor {
	return func(ctx context.Context, req any, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (any, error) {
		if requiresAuth(info.FullMethod) {
			var err error
			ctx, err = ai.authenticate(ctx)
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
		if requiresAuth(info.FullMethod) {
			ctx, err := ai.authenticate(stream.Context())
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

// requiresAuth returns true if the given RPC method should require authentication.
func requiresAuth(fullMethod string) bool {
	switch fullMethod {
	case "/saturn.identity.v1.Identity/RefreshSession",
		"/saturn.identity.admin.v1.AdminIdentity/ListUsers",
		"/saturn.identity.admin.v1.AdminIdentity/ApproveUser",
		"/saturn.identity.admin.v1.AdminIdentity/RejectUser",
		"/saturn.identity.admin.v1.AdminIdentity/UpdateUserRole",
		"/saturn.identity.admin.v1.AdminIdentity/RevokeAllSessions":
		return true
	default:
		return false
	}
}

// authenticate validates the JWT from gRPC metadata and injects Principal into context.
func (ai *AuthInterceptor) authenticate(ctx context.Context) (context.Context, error) {
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

	return auth.WithPrincipal(ctx, principal), nil
}

func timeNow() time.Time {
	return time.Now()
}
