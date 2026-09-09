package space_test

import (
	"context"
	"fmt"
	"testing"

	spaceapp "github.com/masterkeysrd/saturn/internal/application/space"
	"github.com/masterkeysrd/saturn/internal/domain/identity"
	"github.com/masterkeysrd/saturn/internal/domain/space"
	"github.com/masterkeysrd/saturn/internal/platform/db"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

type mockSpaceService struct {
	createSpaceFunc           func(ctx context.Context, sp *space.Space) (*space.Space, error)
	getSpaceFunc              func(ctx context.Context, session space.Session) (*space.Space, error)
	updateSpaceFunc           func(ctx context.Context, session space.Session, sp *space.Space, mask []string) (*space.Space, error)
	deleteSpaceFunc           func(ctx context.Context, session space.Session) error
	listSpacesFunc            func(ctx context.Context, userID space.SpaceID, filter *space.ListSpacesFilter) ([]*space.Space, string, error)
	addSpaceMemberFunc        func(ctx context.Context, session space.Session, member *space.Member) (*space.Member, error)
	removeSpaceMemberFunc     func(ctx context.Context, session space.Session, targetUserID space.SpaceID) error
	updateSpaceMemberRoleFunc func(ctx context.Context, session space.Session, member *space.Member) (*space.Member, error)
	listSpaceMembersFunc      func(ctx context.Context, session space.Session, filter *space.ListMembersFilter) ([]*space.Member, string, error)
}

func (m *mockSpaceService) CreateSpace(ctx context.Context, sp *space.Space) (*space.Space, error) {
	if m.createSpaceFunc != nil {
		return m.createSpaceFunc(ctx, sp)
	}
	return sp, nil
}

func (m *mockSpaceService) GetSpace(ctx context.Context, session space.Session) (*space.Space, error) {
	if m.getSpaceFunc != nil {
		return m.getSpaceFunc(ctx, session)
	}
	return &space.Space{ID: session.SpaceID}, nil
}

func (m *mockSpaceService) UpdateSpace(ctx context.Context, session space.Session, sp *space.Space, mask []string) (*space.Space, error) {
	if m.updateSpaceFunc != nil {
		return m.updateSpaceFunc(ctx, session, sp, mask)
	}
	return sp, nil
}

func (m *mockSpaceService) DeleteSpace(ctx context.Context, session space.Session) error {
	if m.deleteSpaceFunc != nil {
		return m.deleteSpaceFunc(ctx, session)
	}
	return nil
}

func (m *mockSpaceService) ListSpaces(ctx context.Context, userID space.SpaceID, filter *space.ListSpacesFilter) ([]*space.Space, string, error) {
	if m.listSpacesFunc != nil {
		return m.listSpacesFunc(ctx, userID, filter)
	}
	return []*space.Space{}, "", nil
}

func (m *mockSpaceService) AddSpaceMember(ctx context.Context, session space.Session, member *space.Member) (*space.Member, error) {
	if m.addSpaceMemberFunc != nil {
		return m.addSpaceMemberFunc(ctx, session, member)
	}
	return member, nil
}

func (m *mockSpaceService) RemoveSpaceMember(ctx context.Context, session space.Session, targetUserID space.SpaceID) error {
	if m.removeSpaceMemberFunc != nil {
		return m.removeSpaceMemberFunc(ctx, session, targetUserID)
	}
	return nil
}

func (m *mockSpaceService) UpdateSpaceMemberRole(ctx context.Context, session space.Session, member *space.Member) (*space.Member, error) {
	if m.updateSpaceMemberRoleFunc != nil {
		return m.updateSpaceMemberRoleFunc(ctx, session, member)
	}
	return member, nil
}

func (m *mockSpaceService) ListSpaceMembers(ctx context.Context, session space.Session, filter *space.ListMembersFilter) ([]*space.Member, string, error) {
	if m.listSpaceMembersFunc != nil {
		return m.listSpaceMembersFunc(ctx, session, filter)
	}
	return []*space.Member{}, "", nil
}

type mockIdentityService struct {
	getUserByIDFunc func(ctx context.Context, id identity.UserID) (*identity.User, error)
}

func (m *mockIdentityService) GetUserByID(ctx context.Context, id identity.UserID) (*identity.User, error) {
	if m.getUserByIDFunc != nil {
		return m.getUserByIDFunc(ctx, id)
	}
	return &identity.User{
		ID:       id,
		Username: "testuser",
		Name:     "Test User",
		Status:   identity.UserStatusActive,
	}, nil
}

func TestCoordinator_CreateSpace(t *testing.T) {
	ctx := context.Background()
	mockSpace := &mockSpaceService{}
	mockID := &mockIdentityService{}
	coord := spaceapp.NewCoordinator(spaceapp.Dependencies{
		SpaceService:    mockSpace,
		IdentityService: mockID,
	})

	t.Run("success", func(t *testing.T) {
		mockSpace.createSpaceFunc = func(ctx context.Context, sp *space.Space) (*space.Space, error) {
			sp.ID = "sp_123"
			return sp, nil
		}

		res, err := coord.CreateSpace(ctx, &spaceapp.CreateSpaceRequest{
			OwnerID: "usr_owner",
			Name:    "Workspace 1",
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if res.ID != "sp_123" {
			t.Errorf("expected ID sp_123, got %s", res.ID)
		}
	})

	t.Run("error wrapped with op", func(t *testing.T) {
		mockSpace.createSpaceFunc = func(ctx context.Context, sp *space.Space) (*space.Space, error) {
			return nil, errors.E(errors.Exist, space.NameExists, "space name already exists")
		}

		_, err := coord.CreateSpace(ctx, &spaceapp.CreateSpaceRequest{
			OwnerID: "usr_owner",
			Name:    "Workspace 1",
		})
		if err == nil {
			t.Fatal("expected error, got nil")
		}
		if !errors.Is(err, space.NameExists) {
			t.Errorf("expected error to match NameExists code")
		}
		if code := errors.CodeOf(err); code != space.NameExists {
			t.Errorf("expected code %v, got %v", space.NameExists, code)
		}
	})
}

func TestCoordinator_AddSpaceMember(t *testing.T) {
	ctx := context.Background()
	mockSpace := &mockSpaceService{}
	mockID := &mockIdentityService{}
	coord := spaceapp.NewCoordinator(spaceapp.Dependencies{
		SpaceService:    mockSpace,
		IdentityService: mockID,
	})

	t.Run("user not active returns UserNotActive", func(t *testing.T) {
		mockID.getUserByIDFunc = func(ctx context.Context, id identity.UserID) (*identity.User, error) {
			return &identity.User{
				ID:     id,
				Status: identity.UserStatusSuspended,
			}, nil
		}

		_, err := coord.AddSpaceMember(ctx, &spaceapp.AddSpaceMemberRequest{
			SpaceID:      "sp_123",
			UserID:       "usr_owner",
			TargetUserID: "usr_target",
			Role:         string(space.RoleMember),
		})
		if err == nil {
			t.Fatal("expected error, got nil")
		}
		if code := errors.CodeOf(err); code != spaceapp.UserNotActive {
			t.Errorf("expected code %v, got %v", spaceapp.UserNotActive, code)
		}
		if kind := errors.KindOf(err); kind != errors.Precondition {
			t.Errorf("expected kind Precondition, got %v", kind)
		}
	})

	t.Run("identity lookup failure", func(t *testing.T) {
		mockID.getUserByIDFunc = func(ctx context.Context, id identity.UserID) (*identity.User, error) {
			return nil, fmt.Errorf("network timeout")
		}

		_, err := coord.AddSpaceMember(ctx, &spaceapp.AddSpaceMemberRequest{
			SpaceID:      "sp_123",
			UserID:       "usr_owner",
			TargetUserID: "usr_target",
			Role:         string(space.RoleMember),
		})
		if err == nil {
			t.Fatal("expected error, got nil")
		}
	})

	t.Run("success for active user", func(t *testing.T) {
		mockID.getUserByIDFunc = func(ctx context.Context, id identity.UserID) (*identity.User, error) {
			return &identity.User{
				ID:     id,
				Status: identity.UserStatusActive,
			}, nil
		}
		mockSpace.addSpaceMemberFunc = func(ctx context.Context, session space.Session, member *space.Member) (*space.Member, error) {
			return member, nil
		}

		mem, err := coord.AddSpaceMember(ctx, &spaceapp.AddSpaceMemberRequest{
			SpaceID:      "sp_123",
			UserID:       "usr_owner",
			TargetUserID: "usr_target",
			Role:         string(space.RoleMember),
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if mem.UserID != "usr_target" {
			t.Errorf("expected UserID usr_target, got %s", mem.UserID)
		}
	})
}

func TestCoordinator_ListSpaceMembers(t *testing.T) {
	ctx := context.Background()
	mockSpace := &mockSpaceService{}
	mockID := &mockIdentityService{}
	coord := spaceapp.NewCoordinator(spaceapp.Dependencies{
		SpaceService:    mockSpace,
		IdentityService: mockID,
	})

	mockSpace.listSpaceMembersFunc = func(ctx context.Context, session space.Session, filter *space.ListMembersFilter) ([]*space.Member, string, error) {
		return []*space.Member{
			{SpaceID: "sp_1", UserID: "usr_1", Role: space.RoleOwner},
			{SpaceID: "sp_1", UserID: "usr_2", Role: space.RoleMember},
		}, "token_123", nil
	}

	mockID.getUserByIDFunc = func(ctx context.Context, id identity.UserID) (*identity.User, error) {
		if id == "usr_1" {
			return &identity.User{
				ID:        "usr_1",
				Username:  "owner_user",
				Name:      "Owner",
				AvatarURL: "https://example.com/avatar1.png",
			}, nil
		}
		return nil, fmt.Errorf("user not found")
	}

	members, token, err := coord.ListSpaceMembers(ctx, &spaceapp.ListSpaceMembersRequest{
		SpaceID: "sp_1",
		UserID:  "usr_1",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if token != "token_123" {
		t.Errorf("expected token token_123, got %s", token)
	}
	if len(members) != 2 {
		t.Fatalf("expected 2 members, got %d", len(members))
	}
	if members[0].Profile == nil || members[0].Profile.Username != "owner_user" {
		t.Errorf("expected enriched profile for member 0")
	}
	if members[1].Profile != nil {
		t.Errorf("expected nil profile fallback for member 1")
	}
}

type mockTransactor struct {
	beginCalled bool
	lastCtrl    *db.TxController
	beginErr    error
}

func (m *mockTransactor) Begin(ctx context.Context) (context.Context, *db.TxController, error) {
	m.beginCalled = true
	if m.beginErr != nil {
		return ctx, nil, m.beginErr
	}
	ctrl := &db.TxController{}
	m.lastCtrl = ctrl
	return db.WithTxContext(ctx, ctrl), ctrl, nil
}

func (m *mockTransactor) WithTx(ctx context.Context, fn func(ctx context.Context) error) error {
	txCtx, tx, err := m.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err := fn(txCtx); err != nil {
		return err
	}
	return tx.Commit()
}

func TestTransactionalCoordinator(t *testing.T) {
	mockSpace := &mockSpaceService{}
	mockID := &mockIdentityService{}
	baseCoord := spaceapp.NewCoordinator(spaceapp.Dependencies{
		SpaceService:    mockSpace,
		IdentityService: mockID,
	})

	t.Run("CreateSpace commits on success", func(t *testing.T) {
		txr := &mockTransactor{}
		decorator := spaceapp.NewTransactionalCoordinator(baseCoord, txr)

		ctx := context.Background()
		var seenCtx context.Context
		mockSpace.createSpaceFunc = func(ctx context.Context, sp *space.Space) (*space.Space, error) {
			seenCtx = ctx
			return sp, nil
		}

		sp, err := decorator.CreateSpace(ctx, &spaceapp.CreateSpaceRequest{
			OwnerID: "usr_1",
			Name:    "Test Space",
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if sp.Name != "Test Space" {
			t.Errorf("expected space name Test Space, got %s", sp.Name)
		}
		if !txr.beginCalled {
			t.Errorf("expected Begin to be called on Transactor")
		}
		if txr.lastCtrl == nil || !txr.lastCtrl.IsDone() {
			t.Errorf("expected transaction to be committed and marked done")
		}
		if txr.lastCtrl.IsAborted() {
			t.Errorf("expected transaction NOT to be aborted")
		}
		if db.TxControllerFromContext(seenCtx) == nil {
			t.Errorf("expected transaction context to be passed to underlying service")
		}
	})

	t.Run("CreateSpace rolls back on error", func(t *testing.T) {
		txr := &mockTransactor{}
		decorator := spaceapp.NewTransactionalCoordinator(baseCoord, txr)

		ctx := context.Background()
		mockSpace.createSpaceFunc = func(ctx context.Context, sp *space.Space) (*space.Space, error) {
			return nil, errors.E(errors.Internal, "database crash")
		}

		_, err := decorator.CreateSpace(ctx, &spaceapp.CreateSpaceRequest{
			OwnerID: "usr_1",
			Name:    "Test Space",
		})
		if err == nil {
			t.Fatal("expected error, got nil")
		}
		if !txr.beginCalled {
			t.Errorf("expected Begin to be called on Transactor")
		}
		if txr.lastCtrl == nil || !txr.lastCtrl.IsDone() {
			t.Errorf("expected transaction to be marked done")
		}
		if !txr.lastCtrl.IsAborted() {
			t.Errorf("expected transaction to be aborted due to error")
		}
	})

	t.Run("GetSpace does not begin transaction", func(t *testing.T) {
		txr := &mockTransactor{}
		decorator := spaceapp.NewTransactionalCoordinator(baseCoord, txr)

		ctx := context.Background()
		mockSpace.getSpaceFunc = func(ctx context.Context, session space.Session) (*space.Space, error) {
			return &space.Space{ID: session.SpaceID}, nil
		}

		sp, err := decorator.GetSpace(ctx, "sp_1", "usr_1")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if sp.ID != "sp_1" {
			t.Errorf("expected space ID sp_1, got %s", sp.ID)
		}
		if txr.beginCalled {
			t.Errorf("expected GetSpace to NOT begin transaction")
		}
	})

	t.Run("UpdateSpace executes in transaction and passes mask", func(t *testing.T) {
		txr := &mockTransactor{}
		decorator := spaceapp.NewTransactionalCoordinator(baseCoord, txr)

		ctx := context.Background()
		var capturedMask []string
		mockSpace.updateSpaceFunc = func(ctx context.Context, session space.Session, sp *space.Space, mask []string) (*space.Space, error) {
			capturedMask = mask
			sp.Name = "Updated"
			return sp, nil
		}

		sp, err := decorator.UpdateSpace(ctx, &spaceapp.UpdateSpaceRequest{
			SpaceID:    "sp_1",
			UserID:     "usr_1",
			Space:      &space.Space{Name: "New Name"},
			UpdateMask: []string{"name"},
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if sp.Name != "Updated" {
			t.Errorf("expected updated name, got %s", sp.Name)
		}
		if len(capturedMask) != 1 || capturedMask[0] != "name" {
			t.Errorf("expected mask ['name'], got %v", capturedMask)
		}
		if !txr.beginCalled {
			t.Errorf("expected Begin to be called on Transactor")
		}
		if txr.lastCtrl == nil || !txr.lastCtrl.IsDone() || txr.lastCtrl.IsAborted() {
			t.Errorf("expected transaction to be committed successfully")
		}
	})
}
