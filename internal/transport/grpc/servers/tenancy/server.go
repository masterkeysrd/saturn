package tenancygrpc

import (
	tenancypb "github.com/masterkeysrd/saturn/gen/proto/go/saturn/tenancy/v1"
	"github.com/masterkeysrd/saturn/internal/application"
)

var _ tenancypb.TenancyServer = (*TenancyServer)(nil)

// Application represents the tenancy application.
type Application interface {
	CreateSpace(request *application.CreateSpaceRequest) (*tenancypb.Space, error)
}

type TenancyServer struct {
	tenancypb.UnimplementedTenancyServer
}
