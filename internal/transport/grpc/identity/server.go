package identitygrpc

import (
	"context"

	identitypb "github.com/masterkeysrd/saturn/gen/proto/go/saturn/identity/v1"
	"github.com/masterkeysrd/saturn/internal/application"
	"github.com/masterkeysrd/saturn/internal/domain/identity"
)

var _ identitypb.IdentityServer = (*IdentityServer)(nil)

// Application represents the identity application.
type Application interface {
	CreateUser(context.Context, *application.CreateUserRequest) (*identity.User, error)
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
