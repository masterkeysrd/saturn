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

func SpacesPb(spaces []*tenancy.Space) []*tenancypb.Space {
	result := make([]*tenancypb.Space, 0, len(spaces))
	for _, m := range spaces {
		result = append(result, SpacePb(m))
	}
	return result
}

func SpacePb(m *tenancy.Space) *tenancypb.Space {
	if m == nil {
		return nil
	}

	s := tenancypb.Space{
		Id:          m.ID.String(),
		Name:        m.Name,
		Alias:       m.Alias,
		Description: m.Description,
		OwnerId:     m.OwnerID.String(),
		CreateTime:  timestamppb.New(m.CreateTime),
		UpdateTime:  timestamppb.New(m.UpdateTime),
	}

	if m.DeleteTime != nil {
		s.DeleteTime = timestamppb.New(*m.DeleteTime)
	}

	return &s
}
