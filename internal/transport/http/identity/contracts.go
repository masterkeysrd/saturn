package identityhttp

import (
	"context"

	"github.com/masterkeysrd/saturn/internal/application"
	"github.com/masterkeysrd/saturn/internal/domain/identity"
)

type IdentityApplication interface {
	RegisterUser(context.Context, *application.RegisterUserInput) (*identity.User, error)
}
