package identitygrpc

import (
	"context"

	identitypb "github.com/masterkeysrd/saturn/gen/proto/go/saturn/identity/v1"
	"github.com/masterkeysrd/saturn/internal/application"
	"github.com/masterkeysrd/saturn/internal/domain/identity"
	"google.golang.org/protobuf/types/known/emptypb"
)

var _ identitypb.IdentityServer = (*IdentityServer)(nil)

// Application represents the identity application.
type Application interface {
	CreateUser(context.Context, *application.CreateUserRequest) (*identity.User, error)
	LoginUser(context.Context, *application.LoginUserRequest) (*application.TokenPair, error)
	LogoutUser(context.Context) error
	RefreshSession(context.Context, string) (*application.TokenPair, error)
	RevokeSession(context.Context, identity.SessionID) error
	RevokeAllSessions(context.Context) error
}

type IdentityServer struct {
	identitypb.UnimplementedIdentityServer

	app Application
}

func NewIdentityServer(app Application) *IdentityServer {
	return &IdentityServer{
		app: app,
	}
}

func (s *IdentityServer) CreateUser(ctx context.Context, req *identitypb.CreateUserRequest) (*identitypb.User, error) {
	user, err := s.app.CreateUser(ctx, CreateRequest(req))
	if err != nil {
		return nil, err
	}
	return UserPb(user), nil
}

func (s *IdentityServer) LoginUser(ctx context.Context, req *identitypb.LoginUserRequest) (*identitypb.TokenPair, error) {
	pair, err := s.app.LoginUser(ctx, LoginRequest(req))
	if err != nil {
		return nil, err
	}
	return TokenPairPb(pair), nil
}

func (s *IdentityServer) LogoutUser(ctx context.Context, _ *emptypb.Empty) (*emptypb.Empty, error) {
	if err := s.app.LogoutUser(ctx); err != nil {
		return nil, err
	}
	return &emptypb.Empty{}, nil
}

func (s *IdentityServer) RefreshSession(ctx context.Context, req *identitypb.RefreshSessionRequest) (*identitypb.TokenPair, error) {
	pair, err := s.app.RefreshSession(ctx, req.RefreshToken)
	if err != nil {
		return nil, err
	}
	return TokenPairPb(pair), nil
}

func (s *IdentityServer) RevokeSession(ctx context.Context, req *identitypb.RevokeSessionRequest) (*emptypb.Empty, error) {
	if err := s.app.RevokeSession(ctx, identity.SessionID(req.GetId())); err != nil {
		return nil, err
	}
	return &emptypb.Empty{}, nil
}

func (s *IdentityServer) RevokeAllSessions(ctx context.Context, req *emptypb.Empty) (*emptypb.Empty, error) {
	if err := s.app.RevokeAllSessions(ctx); err != nil {
		return nil, err
	}
	return &emptypb.Empty{}, nil
}
