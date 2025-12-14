package tenancygrpc

import (
	tenancypb "github.com/masterkeysrd/saturn/gen/proto/go/saturn/tenancy/v1"
	"github.com/masterkeysrd/saturn/internal/application"
	"github.com/masterkeysrd/saturn/internal/domain/tenancy"
	"google.golang.org/protobuf/types/known/timestamppb"
)

func CreateRequest(req *tenancypb.CreateSpaceRequest) *application.CreateSpaceRequest {
	if req == nil {
		return nil
	}

	space := req.GetSpace()
	if space == nil {
		return nil
	}

	return &application.CreateSpaceRequest{
		Name:        space.Name,
		Alias:       space.Alias,
		Description: space.Description,
	}
}

func SpacePb(m *tenancy.Space) *tenancypb.Space {
	if m == nil {
		return nil
	}

	return &tenancypb.Space{
		Id:          m.ID.String(),
		Name:        m.Name,
		Alias:       m.Alias,
		Description: m.Description,
		OwnerId:     m.OwnerID.String(),
		CreateTime:  timestamppb.New(m.CreateTime),
		UpdateTime:  timestamppb.New(m.UpdateTime),
		DeleteTime:  timestamppb.New(m.DeleteTime),
	}
}
