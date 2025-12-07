package identityhttp

import (
	"context"
	"net/http"

	"github.com/masterkeysrd/saturn/api"
	"github.com/masterkeysrd/saturn/internal/pkg/deps"
	"github.com/masterkeysrd/saturn/internal/pkg/httphandler"
)

// UsersController handles user-related HTTP requests.
type UsersController struct {
	identityApplication IdentityApplication
}

type UsersControllerParams struct {
	deps.In

	IdentityApplication IdentityApplication
}

func NewUsersController(params UsersControllerParams) *UsersController {
	return &UsersController{
		identityApplication: params.IdentityApplication,
	}
}

// RegisterRoutes registers the user-related routes to the provided ServeMux.
func (c *UsersController) RegisterRoutes(mux *http.ServeMux) {
	mux.Handle("POST /users:register", httphandler.Handle(c.RegisterUser,
		httphandler.WithCreated[*api.RegisterUserRequest, *api.User](),
	))
}

// RegisterUser handles the user registration request.
func (c *UsersController) RegisterUser(ctx context.Context, in *api.RegisterUserRequest) (*api.User, error) {
	appInput := RegisterUserInputFromAPI(in)

	user, err := c.identityApplication.RegisterUser(ctx, appInput)
	if err != nil {
		return nil, err
	}

	return UserToAPI(user), nil
}
