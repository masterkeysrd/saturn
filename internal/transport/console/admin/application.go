package adminconsole

import (
	"context"

	"github.com/masterkeysrd/saturn/internal/application"
	"github.com/masterkeysrd/saturn/internal/domain/identity"
)

type IdentityApplication interface {
	CreateAdminUser(context.Context, *application.CreateUserRequest) (*identity.User, error)
}
