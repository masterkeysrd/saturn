package space

import (
	"context"
	"testing"

	"github.com/masterkeysrd/saturn/internal/domain/identity"
	"github.com/masterkeysrd/saturn/internal/domain/space"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

func TestCoordinator_SpaceOAuth(t *testing.T) {
	const (
		spaceID  = "spc_01H7B6K5Z8A3QW9J4C2N6P0Y1A"
		userID   = "usr_01H7B6K5Z8A3QW9J4C2N6P0Y1R"
		clientID = identity.OAuthClientID("oac_01H7B6K5Z8A3QW9J4C2N6P0Y1W")
		grantID  = identity.OAuthGrantID("oag_01H7B6K5Z8A3QW9J4C2N6P0Y1G")
	)

	t.Run("CreateSpaceOAuthClient", func(t *testing.T) {
		tests := []struct {
			name        string
			req         *CreateSpaceOAuthClientRequest
			adminErr    error
			createErr   error
			wantErrKind errors.Kind
			wantErr     bool
		}{
			{
				name: "Success for space admin",
				req: &CreateSpaceOAuthClientRequest{
					SpaceID:       spaceID,
					UserID:        userID,
					Name:          "Workspace MCP",
					RedirectURIs:  []string{"https://app.example.com/cb"},
					AllowedScopes: []string{"finance:read"},
				},
			},
			{
				name:        "Nil request fails",
				req:         nil,
				wantErrKind: errors.Invalid,
				wantErr:     true,
			},
			{
				name: "Non-admin member rejected",
				req: &CreateSpaceOAuthClientRequest{
					SpaceID: spaceID,
					UserID:  userID,
					Name:    "Workspace MCP",
				},
				adminErr:    errors.E(errors.Permission, "only space admins and owners"),
				wantErrKind: errors.Permission,
				wantErr:     true,
			},
			{
				name: "Domain error propagated",
				req: &CreateSpaceOAuthClientRequest{
					SpaceID: spaceID,
					UserID:  userID,
					Name:    "Workspace MCP",
				},
				createErr:   errors.E(errors.Invalid, identity.OAuthInvalidRedirectURI, "bad redirect"),
				wantErrKind: errors.Invalid,
				wantErr:     true,
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				spSvc := &SpaceServiceMock{
					AuthorizeSpaceAdminFunc: func(_ context.Context, _ space.Session) (*space.Member, error) {
						if tc.adminErr != nil {
							return nil, tc.adminErr
						}
						return &space.Member{Role: space.RoleAdmin}, nil
					},
				}
				idSvc := &IdentityServiceMock{
					CreateOAuthClientFunc: func(_ context.Context, params identity.CreateOAuthClientParams) (*identity.OAuthClient, error) {
						if tc.createErr != nil {
							return nil, tc.createErr
						}
						if params.SpaceID == nil || *params.SpaceID != spaceID {
							t.Fatalf("expected spaceID %q, got %v", spaceID, params.SpaceID)
						}
						if params.RegistrationSource != identity.RegistrationSourceSpace {
							t.Fatalf("expected registration source space, got %v", params.RegistrationSource)
						}
						return &identity.OAuthClient{ID: clientID, SpaceID: params.SpaceID, Name: params.Name}, nil
					},
				}

				coord := NewCoordinator(Dependencies{SpaceService: spSvc, IdentityService: idSvc})
				res, err := coord.CreateSpaceOAuthClient(context.Background(), tc.req)
				if tc.wantErr {
					if err == nil {
						t.Fatal("expected error, got nil")
					}
					if domErr, ok := errors.AsType[*errors.Error](err); ok && tc.wantErrKind != 0 {
						if domErr.Kind != tc.wantErrKind {
							t.Fatalf("expected kind %v, got %v", tc.wantErrKind, domErr.Kind)
						}
					}
					return
				}
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				if res.ID != clientID {
					t.Errorf("expected ID %q, got %q", clientID, res.ID)
				}
			})
		}
	})

	t.Run("RevokeSpaceOAuthGrant", func(t *testing.T) {
		tests := []struct {
			name        string
			req         *RevokeSpaceOAuthGrantRequest
			adminErr    error
			revokeErr   error
			wantErrKind errors.Kind
			wantErr     bool
		}{
			{
				name: "Success",
				req:  &RevokeSpaceOAuthGrantRequest{SpaceID: spaceID, UserID: userID, GrantID: grantID},
			},
			{
				name:        "Nil request",
				req:         nil,
				wantErrKind: errors.Invalid,
				wantErr:     true,
			},
			{
				name:        "Unauthorized",
				req:         &RevokeSpaceOAuthGrantRequest{SpaceID: spaceID, UserID: userID, GrantID: grantID},
				adminErr:    errors.E(errors.Permission, "forbidden"),
				wantErrKind: errors.Permission,
				wantErr:     true,
			},
			{
				name:        "Not found propagated",
				req:         &RevokeSpaceOAuthGrantRequest{SpaceID: spaceID, UserID: userID, GrantID: grantID},
				revokeErr:   errors.E(errors.NotExist, identity.OAuthGrantNotFound, "not found"),
				wantErrKind: errors.NotExist,
				wantErr:     true,
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				spSvc := &SpaceServiceMock{
					AuthorizeSpaceAdminFunc: func(_ context.Context, _ space.Session) (*space.Member, error) {
						return &space.Member{Role: space.RoleOwner}, tc.adminErr
					},
				}
				idSvc := &IdentityServiceMock{
					RevokeSpaceOAuthGrantFunc: func(_ context.Context, _ string, _ identity.OAuthGrantID) error {
						return tc.revokeErr
					},
				}
				coord := NewCoordinator(Dependencies{SpaceService: spSvc, IdentityService: idSvc})
				err := coord.RevokeSpaceOAuthGrant(context.Background(), tc.req)
				if tc.wantErr {
					if err == nil {
						t.Fatal("expected error, got nil")
					}
					if tc.wantErrKind != 0 && errors.KindOf(err) != tc.wantErrKind {
						t.Fatalf("expected kind %v, got %v", tc.wantErrKind, errors.KindOf(err))
					}
					return
				}
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
			})
		}
	})
}
