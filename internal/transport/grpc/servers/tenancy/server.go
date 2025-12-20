package tenancygrpc

import (
	"context"

	tenancypb "github.com/masterkeysrd/saturn/gen/proto/go/saturn/tenancy/v1"
	"github.com/masterkeysrd/saturn/internal/application"
	"github.com/masterkeysrd/saturn/internal/domain/tenancy"
)

var _ tenancypb.TenancyServer = (*Server)(nil)

// Application represents the tenancy application.
type Application interface {
	CreateSpace(context.Context, *application.CreateSpaceRequest) (*tenancy.Space, error)
	ListSpaces(context.Context) ([]*tenancy.Space, error)
}

type Server struct {
	tenancypb.UnimplementedTenancyServer

	app Application
}

func NewServer(app Application) *Server {
	return &Server{
		app: app,
	}
}

func (s *Server) ListSpaces(ctx context.Context, req *tenancypb.ListSpacesRequest) (*tenancypb.ListSpacesResponse, error) {
	spaces, err := s.app.ListSpaces(ctx)
	if err != nil {
		return nil, err
	}

	resp := &tenancypb.ListSpacesResponse{
		Spaces: SpacesPb(spaces),
	}
	return resp, nil
}
