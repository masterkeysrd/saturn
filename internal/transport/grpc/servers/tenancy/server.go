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
}

type Server struct {
	tenancypb.UnimplementedTenancyServer
}

func NewServer(app Application) *Server {
	return &Server{}
}
