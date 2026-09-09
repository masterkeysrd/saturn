package spaceaggregator_test

import (
	"context"
	"testing"
	"time"

	spaceaggregator "github.com/masterkeysrd/saturn/internal/aggregator/space"
	"github.com/masterkeysrd/saturn/internal/domain/identity"
	"github.com/masterkeysrd/saturn/internal/domain/space"
	"github.com/masterkeysrd/saturn/internal/platform/paging"
)

type mockSpaceService struct {
	getSpaceFn         func(ctx context.Context, session space.Session) (*space.Space, error)
	listSpacesFn       func(ctx context.Context, userID space.SpaceID, filter *space.ListSpacesFilter) (*paging.Page[*space.Space], error)
	listSpaceMembersFn func(ctx context.Context, session space.Session, filter *space.ListMembersFilter) (*paging.Page[*space.Member], error)
}

func (m *mockSpaceService) GetSpace(ctx context.Context, session space.Session) (*space.Space, error) {
	if m.getSpaceFn != nil {
		return m.getSpaceFn(ctx, session)
	}
	return nil, nil
}

func (m *mockSpaceService) ListSpaces(ctx context.Context, userID space.SpaceID, filter *space.ListSpacesFilter) (*paging.Page[*space.Space], error) {
	if m.listSpacesFn != nil {
		return m.listSpacesFn(ctx, userID, filter)
	}
	return nil, nil
}

func (m *mockSpaceService) ListSpaceMembers(ctx context.Context, session space.Session, filter *space.ListMembersFilter) (*paging.Page[*space.Member], error) {
	if m.listSpaceMembersFn != nil {
		return m.listSpaceMembersFn(ctx, session, filter)
	}
	return nil, nil
}

type mockIdentityService struct {
	getUserByIDFn func(ctx context.Context, id identity.UserID) (*identity.User, error)
}

func (m *mockIdentityService) GetUserByID(ctx context.Context, id identity.UserID) (*identity.User, error) {
	if m.getUserByIDFn != nil {
		return m.getUserByIDFn(ctx, id)
	}
	return nil, nil
}

func TestSpaceAggregator(t *testing.T) {
	ctx := context.Background()

	t.Run("ListSpaces delegates and returns page", func(t *testing.T) {
		mockSpace := &mockSpaceService{
			listSpacesFn: func(ctx context.Context, userID space.SpaceID, filter *space.ListSpacesFilter) (*paging.Page[*space.Space], error) {
				return &paging.Page[*space.Space]{
					Items: []*space.Space{
						{ID: "sp_1", Name: "Personal"},
					},
					NextPageToken: "next_token",
				}, nil
			},
		}

		svc := spaceaggregator.NewService(mockSpace, nil)
		page, err := svc.ListSpaces(ctx, "usr_1", &space.ListSpacesFilter{PageSize: 10})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(page.Items) != 1 || page.Items[0].Name != "Personal" {
			t.Errorf("unexpected items: %v", page.Items)
		}
		if page.NextPageToken != "next_token" {
			t.Errorf("expected next_token, got %s", page.NextPageToken)
		}
	})

	t.Run("ListSpaceMembers aggregates member with user profile", func(t *testing.T) {
		mockSpace := &mockSpaceService{
			listSpaceMembersFn: func(ctx context.Context, session space.Session, filter *space.ListMembersFilter) (*paging.Page[*space.Member], error) {
				return &paging.Page[*space.Member]{
					Items: []*space.Member{
						{SpaceID: "sp_1", UserID: "usr_1", Role: space.RoleOwner, CreateTime: time.Now()},
					},
					NextPageToken: "",
				}, nil
			},
		}

		mockID := &mockIdentityService{
			getUserByIDFn: func(ctx context.Context, id identity.UserID) (*identity.User, error) {
				return &identity.User{
					ID:        "usr_1",
					Name:      "Alice",
					Username:  "alice",
					AvatarURL: "https://example.com/alice.png",
				}, nil
			},
		}

		svc := spaceaggregator.NewService(mockSpace, mockID)
		page, err := svc.ListSpaceMembers(ctx, "sp_1", "usr_1", &space.ListMembersFilter{PageSize: 10})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(page.Items) != 1 {
			t.Fatalf("expected 1 member, got %d", len(page.Items))
		}
		sm := page.Items[0]
		if sm.Profile == nil || sm.Profile.Name != "Alice" || sm.Profile.Username != "alice" {
			t.Errorf("unexpected profile: %v", sm.Profile)
		}
	})
}
