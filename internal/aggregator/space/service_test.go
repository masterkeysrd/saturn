package spaceaggregator

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/masterkeysrd/saturn/internal/domain/identity"
	"github.com/masterkeysrd/saturn/internal/domain/space"
	"github.com/masterkeysrd/saturn/internal/platform/paging"
)

func TestGetSpace(t *testing.T) {
	ctx := context.Background()
	spaceID := space.SpaceID("sp_1")
	userID := space.SpaceID("usr_1")

	t.Run("Success", func(t *testing.T) {
		mockSpace := &SpaceServiceMock{
			GetSpaceFunc: func(ctx context.Context, session space.Session) (*space.Space, error) {
				if session.SpaceID != spaceID || session.UserID != userID {
					t.Errorf("unexpected session: %v", session)
				}
				return &space.Space{
					ID:   spaceID,
					Name: "Personal",
				}, nil
			},
		}

		svc := NewService(mockSpace, nil)
		sp, err := svc.GetSpace(ctx, spaceID, userID)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if sp == nil || sp.ID != spaceID || sp.Name != "Personal" {
			t.Errorf("unexpected space: %v", sp)
		}
		if len(mockSpace.GetSpaceCalls()) != 1 {
			t.Errorf("expected 1 call to GetSpace, got %d", len(mockSpace.GetSpaceCalls()))
		}
	})

	t.Run("Domain error", func(t *testing.T) {
		mockSpace := &SpaceServiceMock{
			GetSpaceFunc: func(ctx context.Context, session space.Session) (*space.Space, error) {
				return nil, errors.New("space not found")
			},
		}

		svc := NewService(mockSpace, nil)
		_, err := svc.GetSpace(ctx, spaceID, userID)
		if err == nil {
			t.Fatal("expected error, got nil")
		}
	})
}

func TestListSpaces(t *testing.T) {
	ctx := context.Background()
	userID := space.SpaceID("usr_1")

	t.Run("Success", func(t *testing.T) {
		mockSpace := &SpaceServiceMock{
			ListSpacesFunc: func(ctx context.Context, uid space.SpaceID, filter *space.ListSpacesFilter) (*paging.Page[*space.Space], error) {
				return &paging.Page[*space.Space]{
					Items: []*space.Space{
						{ID: "sp_1", Name: "Personal"},
					},
					NextPageToken: "next_token",
					HasMore:       true,
				}, nil
			},
		}

		svc := NewService(mockSpace, nil)
		page, err := svc.ListSpaces(ctx, userID, &space.ListSpacesFilter{PageSize: 10})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(page.Items) != 1 || page.Items[0].Name != "Personal" {
			t.Errorf("unexpected items: %v", page.Items)
		}
		if page.NextPageToken != "next_token" {
			t.Errorf("expected next_token, got %s", page.NextPageToken)
		}
		if !page.HasMore {
			t.Error("expected HasMore to be true")
		}
	})

	t.Run("Domain error", func(t *testing.T) {
		mockSpace := &SpaceServiceMock{
			ListSpacesFunc: func(ctx context.Context, uid space.SpaceID, filter *space.ListSpacesFilter) (*paging.Page[*space.Space], error) {
				return nil, errors.New("query failed")
			},
		}

		svc := NewService(mockSpace, nil)
		_, err := svc.ListSpaces(ctx, userID, &space.ListSpacesFilter{})
		if err == nil {
			t.Fatal("expected error, got nil")
		}
	})
}

func TestListSpaceMembers(t *testing.T) {
	ctx := context.Background()
	spaceID := space.SpaceID("sp_1")
	userID := space.SpaceID("usr_1")

	member1 := &space.Member{
		SpaceID:    spaceID,
		UserID:     userID,
		Role:       space.RoleOwner,
		CreateTime: time.Now(),
	}
	member2 := &space.Member{
		SpaceID:    spaceID,
		UserID:     "usr_2",
		Role:       space.RoleMember,
		CreateTime: time.Now(),
	}

	t.Run("Success with full identity profile hydration", func(t *testing.T) {
		mockSpace := &SpaceServiceMock{
			ListSpaceMembersFunc: func(ctx context.Context, session space.Session, filter *space.ListMembersFilter) (*paging.Page[*space.Member], error) {
				return &paging.Page[*space.Member]{
					Items:         []*space.Member{member1, member2},
					NextPageToken: "token_mem",
					HasMore:       true,
				}, nil
			},
		}

		mockIdentity := &IdentityServiceMock{
			GetUserByIDFunc: func(ctx context.Context, id identity.UserID) (*identity.User, error) {
				if id == "usr_1" {
					return &identity.User{
						ID:        "usr_1",
						Name:      "Alice",
						Username:  "alice",
						AvatarURL: "https://example.com/alice.png",
					}, nil
				}
				return &identity.User{
					ID:        "usr_2",
					Name:      "Bob",
					Username:  "bob",
					AvatarURL: "https://example.com/bob.png",
				}, nil
			},
		}

		svc := NewService(mockSpace, mockIdentity)
		page, err := svc.ListSpaceMembers(ctx, spaceID, userID, &space.ListMembersFilter{PageSize: 10})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(page.Items) != 2 {
			t.Fatalf("expected 2 members, got %d", len(page.Items))
		}
		if page.Items[0].Profile == nil || page.Items[0].Profile.Name != "Alice" || page.Items[0].Profile.AvatarURL != "https://example.com/alice.png" {
			t.Errorf("unexpected profile for member 1: %v", page.Items[0].Profile)
		}
		if page.Items[1].Profile == nil || page.Items[1].Profile.Name != "Bob" {
			t.Errorf("unexpected profile for member 2: %v", page.Items[1].Profile)
		}
		if page.NextPageToken != "token_mem" || !page.HasMore {
			t.Errorf("unexpected paging metadata: token=%s hasMore=%v", page.NextPageToken, page.HasMore)
		}
	})

	t.Run("Success when identityService is nil", func(t *testing.T) {
		mockSpace := &SpaceServiceMock{
			ListSpaceMembersFunc: func(ctx context.Context, session space.Session, filter *space.ListMembersFilter) (*paging.Page[*space.Member], error) {
				return &paging.Page[*space.Member]{
					Items: []*space.Member{member1},
				}, nil
			},
		}

		svc := NewService(mockSpace, nil)
		page, err := svc.ListSpaceMembers(ctx, spaceID, userID, &space.ListMembersFilter{})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(page.Items) != 1 {
			t.Fatalf("expected 1 member, got %d", len(page.Items))
		}
		if page.Items[0].Profile != nil {
			t.Errorf("expected nil profile when identityService is nil, got %v", page.Items[0].Profile)
		}
	})

	t.Run("Success when identityService returns error or nil user", func(t *testing.T) {
		mockSpace := &SpaceServiceMock{
			ListSpaceMembersFunc: func(ctx context.Context, session space.Session, filter *space.ListMembersFilter) (*paging.Page[*space.Member], error) {
				return &paging.Page[*space.Member]{
					Items: []*space.Member{member1, member2},
				}, nil
			},
		}

		mockIdentity := &IdentityServiceMock{
			GetUserByIDFunc: func(ctx context.Context, id identity.UserID) (*identity.User, error) {
				if id == "usr_1" {
					return nil, errors.New("user not found")
				}
				return nil, nil
			},
		}

		svc := NewService(mockSpace, mockIdentity)
		page, err := svc.ListSpaceMembers(ctx, spaceID, userID, &space.ListMembersFilter{})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(page.Items) != 2 {
			t.Fatalf("expected 2 members, got %d", len(page.Items))
		}
		if page.Items[0].Profile != nil || page.Items[1].Profile != nil {
			t.Errorf("expected nil profile when user lookup fails, got %v, %v", page.Items[0].Profile, page.Items[1].Profile)
		}
	})

	t.Run("Space service error", func(t *testing.T) {
		mockSpace := &SpaceServiceMock{
			ListSpaceMembersFunc: func(ctx context.Context, session space.Session, filter *space.ListMembersFilter) (*paging.Page[*space.Member], error) {
				return nil, errors.New("permission denied")
			},
		}

		svc := NewService(mockSpace, nil)
		_, err := svc.ListSpaceMembers(ctx, spaceID, userID, &space.ListMembersFilter{})
		if err == nil {
			t.Fatal("expected error, got nil")
		}
	})
}
