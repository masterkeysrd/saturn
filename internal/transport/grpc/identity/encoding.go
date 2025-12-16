package identitygrpc

import (
	identitypb "github.com/masterkeysrd/saturn/gen/proto/go/saturn/identity/v1"
	"github.com/masterkeysrd/saturn/internal/application"
	"github.com/masterkeysrd/saturn/internal/domain/identity"
	"google.golang.org/protobuf/types/known/timestamppb"
)

func CreateRequest(req *identitypb.CreateUserRequest) *application.CreateUserRequest {
	if req == nil {
		return nil
	}

	return &application.CreateUserRequest{
		Name:      req.Name,
		Username:  req.Username,
		Email:     req.Email,
		Password:  req.Password,
		AvatarURL: req.AvatarUrl,
	}
}

func UserPb(m *identity.User) *identitypb.User {
	if m == nil {
		return nil
	}

	return &identitypb.User{
		Id:         m.ID.String(),
		Name:       m.Name,
		Username:   m.Username,
		Email:      m.Email,
		AvatarUrl:  m.AvatarURL,
		CreateTime: timestamppb.New(m.CreateTime),
		UpdateTime: timestamppb.New(m.UpdateTime),
	}
}
