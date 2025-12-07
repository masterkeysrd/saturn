package identityhttp

import (
	"github.com/masterkeysrd/saturn/api"
	"github.com/masterkeysrd/saturn/internal/application"
	"github.com/masterkeysrd/saturn/internal/domain/identity"
	"github.com/masterkeysrd/saturn/internal/pkg/ptr"
	"github.com/oapi-codegen/runtime/types"
)

func RegisterUserInputFromAPI(in *api.RegisterUserRequest) *application.RegisterUserInput {
	return &application.RegisterUserInput{
		Username:  in.Username,
		Email:     string(in.Email),
		FirstName: in.FirstName,
		LastName:  in.LastName,
		Password:  in.Password,
	}
}

func UserToAPI(in *identity.User) *api.User {
	return &api.User{
		Id:       ptr.Of(in.ID.String()),
		Username: in.Username,
		Email:    types.Email(in.Email),
	}
}
