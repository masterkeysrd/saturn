package spaceaggregator

import (
	"context"
	"testing"
	"time"

	"github.com/masterkeysrd/saturn/internal/domain/identity"
	"github.com/masterkeysrd/saturn/internal/domain/space"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

func TestService_SpaceOAuthQueries(t *testing.T) {
	const (
		spaceID  = space.SpaceID("spc_01H7B6K5Z8A3QW9J4C2N6P0Y1A")
		otherID  = "spc_01H7B6K5Z8A3QW9J4C2N6P0Y1B"
		userID   = space.UserID("usr_01H7B6K5Z8A3QW9J4C2N6P0Y1R")
		clientID = identity.OAuthClientID("oac_01H7B6K5Z8A3QW9J4C2N6P0Y1W")
	)
	now := time.Date(2026, 4, 15, 12, 0, 0, 0, time.UTC)

	t.Run("GetSpaceOAuthClient enforces workspace ownership", func(t *testing.T) {
		tests := []struct {
			name        string
			clientSpace *string
			adminErr    error
			wantErrKind errors.Kind
			wantErr     bool
		}{
			{
				name:        "Returns client belonging to space",
				clientSpace: new(string(spaceID)),
			},
			{
				name:        "Rejects client belonging to sibling space",
				clientSpace: new(otherID),
				wantErrKind: errors.NotExist,
				wantErr:     true,
			},
			{
				name:        "Rejects global client",
				clientSpace: nil,
				wantErrKind: errors.NotExist,
				wantErr:     true,
			},
			{
				name:        "Rejects non-admin",
				clientSpace: new(string(spaceID)),
				adminErr:    errors.E(errors.Permission, "forbidden"),
				wantErrKind: errors.Permission,
				wantErr:     true,
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				spSvc := &SpaceServiceMock{
					AuthorizeSpaceAdminFunc: func(_ context.Context, _ space.Session) (*space.Member, error) {
						return &space.Member{Role: space.RoleAdmin}, tc.adminErr
					},
				}
				idSvc := &IdentityServiceMock{
					GetOAuthClientFunc: func(_ context.Context, id identity.OAuthClientID) (*identity.OAuthClient, error) {
						return &identity.OAuthClient{ID: id, SpaceID: tc.clientSpace, Name: "App"}, nil
					},
				}

				svc := NewService(spSvc, idSvc)
				cl, err := svc.GetSpaceOAuthClient(context.Background(), spaceID, userID, clientID)
				if tc.wantErr {
					if err == nil {
						t.Fatal("expected error, got nil")
					}
					if errors.KindOf(err) != tc.wantErrKind {
						t.Fatalf("expected kind %v, got %v", tc.wantErrKind, errors.KindOf(err))
					}
					return
				}
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				if cl.ID != clientID {
					t.Errorf("got client %q, want %q", cl.ID, clientID)
				}
			})
		}
	})

	t.Run("ListSpaceOAuthGrants hydrates client names and user profiles", func(t *testing.T) {
		spSvc := &SpaceServiceMock{
			AuthorizeSpaceAdminFunc: func(_ context.Context, _ space.Session) (*space.Member, error) {
				return &space.Member{Role: space.RoleOwner}, nil
			},
		}
		idSvc := &IdentityServiceMock{
			ListSpaceOAuthGrantsFunc: func(_ context.Context, _ string) ([]*identity.OAuthGrant, error) {
				return []*identity.OAuthGrant{
					{
						ID:         "oag_1",
						ClientID:   clientID,
						UserID:     identity.UserID(userID),
						SpaceID:    string(spaceID),
						Scopes:     []string{"finance:read"},
						CreateTime: now,
					},
				}, nil
			},
			ListOAuthClientsByIDsFunc: func(_ context.Context, _ []identity.OAuthClientID) ([]*identity.OAuthClient, error) {
				return []*identity.OAuthClient{
					{ID: clientID, Name: "MCP Connector"},
				}, nil
			},
			GetUsersByIDsFunc: func(_ context.Context, _ []identity.UserID) ([]*identity.User, error) {
				return []*identity.User{
					{ID: identity.UserID(userID), Name: "Alice", Email: "alice@example.com"},
				}, nil
			},
		}

		svc := NewService(spSvc, idSvc)
		grants, err := svc.ListSpaceOAuthGrants(context.Background(), spaceID, userID)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(grants) != 1 {
			t.Fatalf("expected 1 grant, got %d", len(grants))
		}
		if grants[0].ClientName != "MCP Connector" || grants[0].UserName != "Alice" || grants[0].UserEmail != "alice@example.com" {
			t.Errorf("unexpected hydrated grant: %+v", grants[0])
		}
	})
}
