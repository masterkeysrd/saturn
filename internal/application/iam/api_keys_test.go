package iam

import (
	"context"
	"slices"
	"testing"

	"github.com/masterkeysrd/saturn/internal/domain/identity"
	"github.com/masterkeysrd/saturn/internal/domain/space"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

func TestCoordinator_APIKeys(t *testing.T) {
	ctx := context.Background()
	spc1, _ := space.NewSpaceID()
	spc2, _ := space.NewSpaceID()

	t.Run("CreateAPIKey", func(t *testing.T) {
		tests := []struct {
			name     string
			req      *CreateAPIKeyRequest
			setup    func(idSvc *IdentityServiceMock, spSvc *SpaceServiceMock)
			wantErr  bool
			wantKind errors.Kind
		}{
			{
				name: "Success",
				req: &CreateAPIKeyRequest{
					UserID:   "usr_1",
					Name:     "CLI Key",
					Scopes:   []string{"finance:read"},
					SpaceIDs: []string{string(spc1)},
				},
				setup: func(idSvc *IdentityServiceMock, spSvc *SpaceServiceMock) {
					idSvc.CreateAPIKeyFunc = func(ctx context.Context, params identity.CreateAPIKeyParams) (*identity.APIKey, error) {
						return &identity.APIKey{
							ID:        "apk_1",
							UserID:    params.UserID,
							Name:      params.Name,
							RawKey:    "sat_secret",
							KeyPrefix: "sat_secret",
							Scopes:    params.Scopes,
						}, nil
					}
					spSvc.SyncAPIKeyGrantsFunc = func(ctx context.Context, apiKeyID string, userID space.SpaceID, spaceIDs []space.SpaceID) error {
						return nil
					}
					spSvc.ListAPIKeyGrantedSpacesFunc = func(ctx context.Context, apiKeyID string) ([]space.SpaceID, error) {
						return []space.SpaceID{spc1}, nil
					}
				},
			},
			{
				name:     "Nil request",
				req:      nil,
				wantErr:  true,
				wantKind: errors.Invalid,
			},
			{
				name: "Empty space IDs",
				req: &CreateAPIKeyRequest{
					UserID: "usr_1",
					Name:   "CLI Key",
					Scopes: []string{"finance:read"},
				},
				wantErr:  true,
				wantKind: errors.Invalid,
			},
			{
				name: "Invalid space ID",
				req: &CreateAPIKeyRequest{
					UserID:   "usr_1",
					Name:     "CLI Key",
					Scopes:   []string{"finance:read"},
					SpaceIDs: []string{"bad_id"},
				},
				wantErr:  true,
				wantKind: errors.Invalid,
			},
			{
				name: "Sync grants permission error",
				req: &CreateAPIKeyRequest{
					UserID:   "usr_1",
					Name:     "CLI Key",
					Scopes:   []string{"finance:read"},
					SpaceIDs: []string{string(spc1)},
				},
				setup: func(idSvc *IdentityServiceMock, spSvc *SpaceServiceMock) {
					idSvc.CreateAPIKeyFunc = func(ctx context.Context, params identity.CreateAPIKeyParams) (*identity.APIKey, error) {
						return &identity.APIKey{ID: "apk_1", UserID: params.UserID}, nil
					}
					spSvc.SyncAPIKeyGrantsFunc = func(ctx context.Context, apiKeyID string, userID space.SpaceID, spaceIDs []space.SpaceID) error {
						return errors.E(errors.Permission, "not a member")
					}
				},
				wantErr:  true,
				wantKind: errors.Permission,
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				idSvc := &IdentityServiceMock{}
				spSvc := &SpaceServiceMock{}
				if tc.setup != nil {
					tc.setup(idSvc, spSvc)
				}
				coord := NewCoordinator(Dependencies{
					IdentityService: idSvc,
					SpaceService:    spSvc,
				})
				key, err := coord.CreateAPIKey(ctx, tc.req)
				if tc.wantErr {
					if err == nil {
						t.Fatal("expected error, got nil")
					}
					if tc.wantKind != 0 && errors.KindOf(err) != tc.wantKind {
						t.Errorf("expected error kind %v, got %v", tc.wantKind, errors.KindOf(err))
					}
					return
				}
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				if key.RawKey != "sat_secret" || !slices.Equal(key.SpaceIDs, []string{string(spc1)}) {
					t.Errorf("unexpected created key: %+v", key)
				}
			})
		}
	})

	t.Run("ListAPIKeys", func(t *testing.T) {
		idSvc := &IdentityServiceMock{
			ListAPIKeysFunc: func(ctx context.Context, userID identity.UserID) ([]*identity.APIKey, error) {
				return []*identity.APIKey{
					{ID: "apk_1", Name: "Key 1"},
					{ID: "apk_2", Name: "Key 2"},
				}, nil
			},
		}
		spSvc := &SpaceServiceMock{
			ListAPIKeysGrantedSpacesFunc: func(ctx context.Context, apiKeyIDs []string) (map[string][]space.SpaceID, error) {
				return map[string][]space.SpaceID{
					"apk_1": {spc1, spc2},
				}, nil
			},
		}
		coord := NewCoordinator(Dependencies{IdentityService: idSvc, SpaceService: spSvc})
		keys, err := coord.ListAPIKeys(ctx, &ListAPIKeysRequest{UserID: "usr_1"})
		if err != nil {
			t.Fatalf("ListAPIKeys failed: %v", err)
		}
		if len(keys) != 2 || len(keys[0].SpaceIDs) != 2 || len(keys[1].SpaceIDs) != 0 {
			t.Errorf("unexpected space hydration: %+v", keys)
		}
	})

	t.Run("UpdateAndDeleteAPIKey", func(t *testing.T) {
		idSvc := &IdentityServiceMock{
			UpdateAPIKeyFunc: func(ctx context.Context, params identity.UpdateAPIKeyParams) (*identity.APIKey, error) {
				return &identity.APIKey{ID: params.ID, Name: params.Incoming.Name}, nil
			},
			DeleteAPIKeyFunc: func(ctx context.Context, params identity.DeleteAPIKeyParams) error {
				return nil
			},
		}
		spSvc := &SpaceServiceMock{
			SyncAPIKeyGrantsFunc: func(ctx context.Context, apiKeyID string, userID space.SpaceID, spaceIDs []space.SpaceID) error {
				return nil
			},
			ListAPIKeyGrantedSpacesFunc: func(ctx context.Context, apiKeyID string) ([]space.SpaceID, error) {
				return []space.SpaceID{spc2}, nil
			},
		}
		coord := NewCoordinator(Dependencies{IdentityService: idSvc, SpaceService: spSvc})

		updated, err := coord.UpdateAPIKey(ctx, &UpdateAPIKeyRequest{
			UserID:     "usr_1",
			ID:         "apk_1",
			Name:       "Renamed",
			SpaceIDs:   []string{string(spc2)},
			UpdateMask: []string{"name", "space_ids"},
		})
		if err != nil || updated.Name != "Renamed" || !slices.Equal(updated.SpaceIDs, []string{string(spc2)}) {
			t.Fatalf("UpdateAPIKey failed: updated=%+v err=%v", updated, err)
		}

		if err := coord.DeleteAPIKey(ctx, &DeleteAPIKeyRequest{UserID: "usr_1", ID: "apk_1"}); err != nil {
			t.Fatalf("DeleteAPIKey failed: %v", err)
		}
	})
}
