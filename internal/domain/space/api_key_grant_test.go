package space

import (
	"context"
	"testing"

	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

func TestService_APIKeyGrants(t *testing.T) {
	ctx := context.Background()
	spc1, _ := NewSpaceID()
	spc2, _ := NewSpaceID()

	t.Run("SyncAPIKeyGrants", func(t *testing.T) {
		tests := []struct {
			name     string
			apiKeyID string
			userID   UserID
			spaceIDs []SpaceID
			setup    func(m *MemberStoreMock, g *APIKeyGrantStoreMock)
			wantErr  bool
			wantKind errors.Kind
		}{
			{
				name:     "Success deduplicating spaces",
				apiKeyID: "apk_1",
				userID:   "usr_1",
				spaceIDs: []SpaceID{spc1, spc2, spc1},
				setup: func(m *MemberStoreMock, g *APIKeyGrantStoreMock) {
					m.ExistsFunc = func(ctx context.Context, spaceID SpaceID, userID UserID) (bool, error) {
						return true, nil
					}
					g.DeleteGrantsForKeyExceptFunc = func(ctx context.Context, apiKeyID string, keepSpaceIDs []SpaceID) error {
						if len(keepSpaceIDs) != 2 {
							t.Errorf("expected 2 deduplicated spaces, got %d", len(keepSpaceIDs))
						}
						return nil
					}
					g.UpsertGrantsFunc = func(ctx context.Context, grants []*APIKeyGrant) error {
						if len(grants) != 2 {
							t.Errorf("expected 2 grants, got %d", len(grants))
						}
						return nil
					}
				},
			},
			{
				name:     "Non-member space rejected",
				apiKeyID: "apk_1",
				userID:   "usr_1",
				spaceIDs: []SpaceID{spc1},
				setup: func(m *MemberStoreMock, g *APIKeyGrantStoreMock) {
					m.ExistsFunc = func(ctx context.Context, spaceID SpaceID, userID UserID) (bool, error) {
						return false, nil
					}
				},
				wantErr:  true,
				wantKind: errors.Permission,
			},
			{
				name:     "Empty space IDs rejected",
				apiKeyID: "apk_1",
				userID:   "usr_1",
				spaceIDs: nil,
				wantErr:  true,
				wantKind: errors.Invalid,
			},
			{
				name:     "Invalid space ID format rejected",
				apiKeyID: "apk_1",
				userID:   "usr_1",
				spaceIDs: []SpaceID{"bad_id"},
				wantErr:  true,
				wantKind: errors.Invalid,
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				mStore := &MemberStoreMock{}
				gStore := &APIKeyGrantStoreMock{}
				if tc.setup != nil {
					tc.setup(mStore, gStore)
				}
				svc := NewService(Dependencies{
					MemberStore:      mStore,
					APIKeyGrantStore: gStore,
				})
				err := svc.SyncAPIKeyGrants(ctx, tc.apiKeyID, tc.userID, tc.spaceIDs)
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
			})
		}
	})

	t.Run("ListAndRevokeSpaceAPIKeyGrants", func(t *testing.T) {
		tests := []struct {
			name     string
			role     SpaceRole
			wantErr  bool
			wantKind errors.Kind
		}{
			{name: "Owner allowed", role: RoleOwner},
			{name: "Admin allowed", role: RoleAdmin},
			{name: "Member denied", role: RoleMember, wantErr: true, wantKind: errors.Permission},
			{name: "Viewer denied", role: RoleViewer, wantErr: true, wantKind: errors.Permission},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				mStore := &MemberStoreMock{
					GetByIDFunc: func(ctx context.Context, spaceID SpaceID, userID UserID) (*Member, error) {
						return &Member{SpaceID: spaceID, UserID: userID, Role: tc.role}, nil
					},
				}
				gStore := &APIKeyGrantStoreMock{
					ListBySpaceIDFunc: func(ctx context.Context, spaceID SpaceID) ([]*APIKeyGrant, error) {
						return []*APIKeyGrant{{APIKeyID: "apk_1", SpaceID: spaceID, UserID: "usr_2"}}, nil
					},
					DeleteGrantFunc: func(ctx context.Context, apiKeyID string, spaceID SpaceID) error {
						return nil
					},
				}
				svc := NewService(Dependencies{
					MemberStore:      mStore,
					APIKeyGrantStore: gStore,
				})
				sess := Session{SpaceID: spc1, UserID: "usr_admin"}

				grants, err := svc.ListSpaceAPIKeyGrants(ctx, sess)
				if tc.wantErr {
					if err == nil || errors.KindOf(err) != tc.wantKind {
						t.Fatalf("ListSpaceAPIKeyGrants expected %v error, got %v", tc.wantKind, err)
					}
				} else if err != nil || len(grants) != 1 {
					t.Fatalf("ListSpaceAPIKeyGrants unexpected: grants=%v err=%v", grants, err)
				}

				err = svc.RevokeSpaceAPIKeyGrant(ctx, sess, "apk_1")
				if tc.wantErr {
					if err == nil || errors.KindOf(err) != tc.wantKind {
						t.Fatalf("RevokeSpaceAPIKeyGrant expected %v error, got %v", tc.wantKind, err)
					}
				} else if err != nil {
					t.Fatalf("RevokeSpaceAPIKeyGrant unexpected error: %v", err)
				}
			})
		}
	})
}
