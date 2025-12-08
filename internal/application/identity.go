package application

import (
	"context"

	"github.com/masterkeysrd/saturn/internal/domain/identity"
	"github.com/masterkeysrd/saturn/internal/pkg/deps"
)

type RegisterUserInput struct {
	Username  string
	Email     string
	FirstName string
	LastName  string
	Password  string
}

type IdentityService interface {
	CreateUser(context.Context, *identity.CreateUserInput) (*identity.User, error)
	CreateAdminUser(context.Context, *identity.CreateUserInput) (*identity.User, error)
}

// Identity represents the identity application.
type Identity struct {
	identityService IdentityService
}

type IdentityParams struct {
	deps.In

	IdentityService IdentityService
}

func NewIdentity(params IdentityParams) *Identity {
	return &Identity{
		identityService: params.IdentityService,
	}
}

// RegisterUser registers a new user in the system.
func (a *Identity) RegisterUser(ctx context.Context, in *RegisterUserInput) (*identity.User, error) {
	return a.identityService.CreateUser(ctx, &identity.CreateUserInput{
		Username: in.Username,
		Email:    in.Email,
		Password: in.Password,
	})
}

// RegisterAdminUser registers a new admin user in the system.
func (a *Identity) RegisterAdminUser(ctx context.Context, in *RegisterUserInput) (*identity.User, error) {
	return a.identityService.CreateAdminUser(ctx, &identity.CreateUserInput{
		Username: in.Username,
		Email:    in.Email,
		Password: in.Password,
	})
}
