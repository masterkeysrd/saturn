package identityhttp

// import (
// 	"context"
// 	"net/http"
//
// 	"github.com/masterkeysrd/saturn/api"
// 	"github.com/masterkeysrd/saturn/internal/pkg/deps"
// 	"github.com/masterkeysrd/saturn/internal/pkg/httphandler"
// )

// // UsersController handles user-related HTTP requests.
// type UsersController struct {
// 	identityApplication IdentityApplication
// }
//
// type UsersControllerParams struct {
// 	deps.In
//
// 	IdentityApplication IdentityApplication
// }
//
// func NewUsersController(params UsersControllerParams) *UsersController {
// 	return &UsersController{
// 		identityApplication: params.IdentityApplication,
// 	}
// }
//
// // RegisterRoutes registers the user-related routes to the provided ServeMux.
// func (c *UsersController) RegisterRoutes(mux *http.ServeMux) {
// 	mux.Handle("POST /users", httphandler.Handle(c.RegisterUser,
// 		httphandler.WithCreated[*api.RegisterUserRequest, *api.User](),
// 	))
// 	mux.Handle("POST /users:login", httphandler.Handle(c.LoginUser))
// 	mux.Handle("POST /users:logoutAll", httphandler.Handle(c.LogoutUserAll))
// }
//
// // RegisterUser handles the user registration request.
// func (c *UsersController) RegisterUser(ctx context.Context, in *api.RegisterUserRequest) (*api.User, error) {
// 	appInput := RegisterUserInputFromAPI(in)
//
// 	user, err := c.identityApplication.RegisterUser(ctx, appInput)
// 	if err != nil {
// 		return nil, err
// 	}
//
// 	return UserToAPI(user), nil
// }
//
// func (c *UsersController) LoginUser(ctx context.Context, in *api.LoginRequest) (*api.TokenResponse, error) {
// 	appInput := LoginUserInputFromAPI(in)
//
// 	session, err := c.identityApplication.LoginUser(ctx, appInput)
// 	if err != nil {
// 		return nil, err
// 	}
//
// 	return TokenPairToAPI(session), nil
// }
//
// func (c *UsersController) LogoutUserAll(ctx context.Context, _ *httphandler.Empty) (*httphandler.Empty, error) {
// 	err := c.identityApplication.EndAllUserSessions(ctx)
// 	if err != nil {
// 		return nil, err
// 	}
// 	return &httphandler.Empty{}, nil
// }
