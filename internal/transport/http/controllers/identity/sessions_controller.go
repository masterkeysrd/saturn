package identityhttp

// import (
// 	"context"
// 	"net/http"
//
// 	"github.com/masterkeysrd/saturn/api"
// 	"github.com/masterkeysrd/saturn/internal/pkg/deps"
// 	"github.com/masterkeysrd/saturn/internal/pkg/httphandler"
// )
//
// // SessionsController handles user-related HTTP requests.
// type SessionsController struct {
// 	identityApplication IdentityApplication
// }
//
// type SessionsControllerParams struct {
// 	deps.In
//
// 	IdentityApplication IdentityApplication
// }
//
// func NewSessionsController(params SessionsControllerParams) *SessionsController {
// 	return &SessionsController{
// 		identityApplication: params.IdentityApplication,
// 	}
// }
//
// // RegisterRoutes registers the session-related routes to the provided ServeMux.
// func (c *SessionsController) RegisterRoutes(mux *http.ServeMux) {
// 	mux.Handle("POST /sessions:refresh", httphandler.Handle(c.RefreshSession))
// 	mux.Handle("DELETE /sessions/{session_id}", httphandler.Handle(c.RevokeSession))
// }
//
// func (c *SessionsController) RefreshSession(ctx context.Context, in *api.RefreshSessionRequest) (*api.TokenResponse, error) {
// 	session, err := c.identityApplication.RefreshSessionToken(ctx, in.RefreshToken)
// 	if err != nil {
// 		return nil, err
// 	}
//
// 	return TokenPairToAPI(session), nil
// }
//
// func (c *SessionsController) RevokeSession(ctx context.Context, in *api.RevokeSessionRequest) (*httphandler.Empty, error) {
// 	err := c.identityApplication.RevokeSession(ctx, in.Token)
// 	if err != nil {
// 		return nil, err
// 	}
// 	return &httphandler.Empty{}, nil
// }
