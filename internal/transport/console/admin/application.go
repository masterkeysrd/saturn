package adminconsole

import (
	"context"

	"github.com/masterkeysrd/saturn/internal/application"
	"github.com/masterkeysrd/saturn/internal/domain/identity"
)

type IdentityApplication interface {
	RegisterAdminUser(context.Context, *application.RegisterUserInput) (*identity.User, error)
}
