package space_test

import (
	"context"
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/masterkeysrd/saturn/internal/domain/space"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/paging"
)

type memorySpaceStore struct {
	mu     sync.Mutex
	spaces map[space.SpaceID]*space.Space
}

func newMemorySpaceStore() *memorySpaceStore {
	return &memorySpaceStore{spaces: make(map[space.SpaceID]*space.Space)}
}

func (m *memorySpaceStore) Create(ctx context.Context, s *space.Space) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	cp := *s
	m.spaces[s.ID] = &cp
	return nil
}

func (m *memorySpaceStore) GetByID(ctx context.Context, id space.SpaceID) (*space.Space, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	s, ok := m.spaces[id]
	if !ok {
		return nil, errors.E(errors.NotExist, "space not found")
	}
	cp := *s
	return &cp, nil
}

func (m *memorySpaceStore) Update(ctx context.Context, s *space.Space) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	current, ok := m.spaces[s.ID]
	if !ok {
		return errors.E(errors.NotExist, space.NotFound, "space not found")
	}
	if current.Version != s.Version {
		return errors.E(errors.Conflict, space.VersionMismatch, "space was modified concurrently")
	}
	cp := *s
	cp.Version++
	m.spaces[s.ID] = &cp
	s.Version = cp.Version
	return nil
}

func (m *memorySpaceStore) Delete(ctx context.Context, id space.SpaceID) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.spaces, id)
	return nil
}

func (m *memorySpaceStore) ListByUser(ctx context.Context, userID space.SpaceID, filter *space.ListSpacesFilter) (*paging.Page[*space.Space], error) {
	return m.ListByUserOwned(ctx, userID, filter)
}

func (m *memorySpaceStore) ListByUserOwned(ctx context.Context, ownerID space.SpaceID, filter *space.ListSpacesFilter) (*paging.Page[*space.Space], error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var res []*space.Space
	for _, s := range m.spaces {
		if s.OwnerID == ownerID {
			res = append(res, s)
		}
	}
	return &paging.Page[*space.Space]{
		Items: res,
	}, nil
}

type memoryMemberStore struct {
	mu      sync.Mutex
	members map[string]*space.Member
}

func newMemoryMemberStore() *memoryMemberStore {
	return &memoryMemberStore{members: make(map[string]*space.Member)}
}

func memberKey(spaceID, userID space.SpaceID) string {
	return string(spaceID) + ":" + string(userID)
}

func (m *memoryMemberStore) Create(ctx context.Context, member *space.Member) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	key := memberKey(member.SpaceID, member.UserID)
	m.members[key] = member
	return nil
}

func (m *memoryMemberStore) GetByID(ctx context.Context, spaceID, userID space.SpaceID) (*space.Member, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	mem, ok := m.members[memberKey(spaceID, userID)]
	if !ok {
		return nil, errors.E(errors.NotExist, "member not found")
	}
	return mem, nil
}

func (m *memoryMemberStore) Update(ctx context.Context, member *space.Member) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	key := memberKey(member.SpaceID, member.UserID)
	if _, ok := m.members[key]; !ok {
		return fmt.Errorf("member not found")
	}
	m.members[key] = member
	return nil
}

func (m *memoryMemberStore) Delete(ctx context.Context, spaceID, userID space.SpaceID) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.members, memberKey(spaceID, userID))
	return nil
}

func (m *memoryMemberStore) ListBySpace(ctx context.Context, spaceID space.SpaceID, filter *space.ListMembersFilter) (*paging.Page[*space.Member], error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var res []*space.Member
	for _, mem := range m.members {
		if mem.SpaceID == spaceID {
			res = append(res, mem)
		}
	}
	return &paging.Page[*space.Member]{
		Items: res,
	}, nil
}

func (m *memoryMemberStore) ListByUser(ctx context.Context, userID space.SpaceID) ([]*space.Member, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var res []*space.Member
	for _, mem := range m.members {
		if mem.UserID == userID {
			res = append(res, mem)
		}
	}
	return res, nil
}

func (m *memoryMemberStore) Exists(ctx context.Context, spaceID, userID space.SpaceID) (bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	_, ok := m.members[memberKey(spaceID, userID)]
	return ok, nil
}

func setupTestService() (*space.Service, *memorySpaceStore, *memoryMemberStore) {
	spaceStore := newMemorySpaceStore()
	memberStore := newMemoryMemberStore()
	svc := space.NewService(space.Dependencies{
		SpaceStore:  spaceStore,
		MemberStore: memberStore,
	})
	return svc, spaceStore, memberStore
}

func TestCreateSpace(t *testing.T) {
	svc, _, _ := setupTestService()
	ctx := context.Background()

	t.Run("success", func(t *testing.T) {
		sp, err := svc.CreateSpace(ctx, &space.Space{
			OwnerID: "user-1",
			Name:    "Engineering",
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if sp.ID == "" {
			t.Errorf("expected non-empty space ID")
		}
		if sp.Name != "Engineering" {
			t.Errorf("expected name 'Engineering', got %s", sp.Name)
		}
	})

	t.Run("empty name returns Invalid", func(t *testing.T) {
		_, err := svc.CreateSpace(ctx, &space.Space{
			OwnerID: "user-1",
			Name:    "   ",
		})
		if err == nil {
			t.Fatal("expected error, got nil")
		}
		if kind := errors.KindOf(err); kind != errors.Invalid {
			t.Errorf("expected kind Invalid, got %v", kind)
		}
	})

	t.Run("duplicate name returns NameExists", func(t *testing.T) {
		_, err := svc.CreateSpace(ctx, &space.Space{
			OwnerID: "user-1",
			Name:    "Engineering",
		})
		if err == nil {
			t.Fatal("expected error, got nil")
		}
		if kind := errors.KindOf(err); kind != errors.Exist {
			t.Errorf("expected kind Exist, got %v", kind)
		}
		if code := errors.CodeOf(err); code != space.NameExists {
			t.Errorf("expected code %v, got %v", space.NameExists, code)
		}
	})
}

func TestGetSpace(t *testing.T) {
	svc, _, _ := setupTestService()
	ctx := context.Background()

	created, err := svc.CreateSpace(ctx, &space.Space{
		OwnerID: "user-1",
		Name:    "Product",
	})
	if err != nil {
		t.Fatalf("setup failed: %v", err)
	}

	t.Run("success for owner member", func(t *testing.T) {
		session := space.Session{SpaceID: created.ID, UserID: "user-1"}
		sp, err := svc.GetSpace(ctx, session)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if sp.ID != created.ID {
			t.Errorf("expected space ID %s, got %s", created.ID, sp.ID)
		}
	})

	t.Run("not a member returns InsufficientRole", func(t *testing.T) {
		session := space.Session{SpaceID: created.ID, UserID: "outsider"}
		_, err := svc.GetSpace(ctx, session)
		if err == nil {
			t.Fatal("expected error, got nil")
		}
		if kind := errors.KindOf(err); kind != errors.Permission {
			t.Errorf("expected kind Permission, got %v", kind)
		}
		if code := errors.CodeOf(err); code != space.InsufficientRole {
			t.Errorf("expected code %v, got %v", space.InsufficientRole, code)
		}
	})

	t.Run("space not found returns NotFound", func(t *testing.T) {
		session := space.Session{SpaceID: "non-existent", UserID: "user-1"}
		_, err := svc.GetSpace(ctx, session)
		if err == nil {
			t.Fatal("expected error, got nil")
		}
		if kind := errors.KindOf(err); kind != errors.Permission {
			// Note: membership check fails first before space lookup
			t.Errorf("expected kind Permission, got %v", kind)
		}
	})
}

func TestUpdateSpace(t *testing.T) {
	svc, _, _ := setupTestService()
	ctx := context.Background()

	created, err := svc.CreateSpace(ctx, &space.Space{
		OwnerID: "owner-1",
		Name:    "Alpha",
	})
	if err != nil {
		t.Fatalf("setup failed: %v", err)
	}

	t.Run("non-owner returns OwnerOnly", func(t *testing.T) {
		session := space.Session{SpaceID: created.ID, UserID: "non-owner"}
		_, err := svc.UpdateSpace(ctx, session, &space.Space{Name: "Beta"}, nil)
		if err == nil {
			t.Fatal("expected error, got nil")
		}
		if kind := errors.KindOf(err); kind != errors.Permission {
			t.Errorf("expected kind Permission, got %v", kind)
		}
		if code := errors.CodeOf(err); code != space.OwnerOnly {
			t.Errorf("expected code %v, got %v", space.OwnerOnly, code)
		}
	})

	t.Run("success for owner", func(t *testing.T) {
		session := space.Session{SpaceID: created.ID, UserID: "owner-1"}
		updated, err := svc.UpdateSpace(ctx, session, &space.Space{
			Name:        "Alpha Renamed",
			Description: "New Description",
		}, nil)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if updated.Name != "AlphaRenamed" {
			t.Errorf("expected name 'AlphaRenamed', got %s", updated.Name)
		}
		if updated.Version != 2 {
			t.Errorf("expected version 2, got %d", updated.Version)
		}
	})

	t.Run("partial update with mask", func(t *testing.T) {
		session := space.Session{SpaceID: created.ID, UserID: "owner-1"}
		updated, err := svc.UpdateSpace(ctx, session, &space.Space{
			Name:        "Should Be Ignored",
			Description: "Updated Description Only",
		}, []string{"description"})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		// Name should remain "AlphaRenamed" from previous update
		if updated.Name != "AlphaRenamed" {
			t.Errorf("expected name 'AlphaRenamed' preserved, got %s", updated.Name)
		}
		if updated.Description != "Updated Description Only" {
			t.Errorf("expected description 'Updated Description Only', got %s", updated.Description)
		}
		if updated.Version != 3 {
			t.Errorf("expected version 3, got %d", updated.Version)
		}
	})

	t.Run("concurrent modification returns VersionMismatch", func(t *testing.T) {
		session := space.Session{SpaceID: created.ID, UserID: "owner-1"}
		// Pass an outdated version (1) when current is 3
		_, err := svc.UpdateSpace(ctx, session, &space.Space{
			Name:    "Alpha Stale",
			Version: 1,
		}, nil)
		if err == nil {
			t.Fatal("expected error, got nil")
		}
		if kind := errors.KindOf(err); kind != errors.Conflict {
			t.Errorf("expected kind Conflict, got %v", kind)
		}
		if code := errors.CodeOf(err); code != space.VersionMismatch {
			t.Errorf("expected code VersionMismatch, got %v", code)
		}
	})

	t.Run("non-existent space returns NotFound", func(t *testing.T) {
		session := space.Session{SpaceID: "sp_does_not_exist", UserID: "owner-1"}
		_, err := svc.UpdateSpace(ctx, session, &space.Space{
			Name: "Non Existent",
		}, nil)
		if err == nil {
			t.Fatal("expected error, got nil")
		}
		if kind := errors.KindOf(err); kind != errors.NotExist {
			t.Errorf("expected kind NotExist, got %v", kind)
		}
		if code := errors.CodeOf(err); code != space.NotFound {
			t.Errorf("expected code NotFound, got %v", code)
		}
	})
}

func TestDeleteSpace(t *testing.T) {
	svc, _, _ := setupTestService()
	ctx := context.Background()

	created, err := svc.CreateSpace(ctx, &space.Space{
		OwnerID: "owner-1",
		Name:    "To Delete",
	})
	if err != nil {
		t.Fatalf("setup failed: %v", err)
	}

	t.Run("non-owner returns OwnerOnly", func(t *testing.T) {
		session := space.Session{SpaceID: created.ID, UserID: "intruder"}
		err := svc.DeleteSpace(ctx, session)
		if err == nil {
			t.Fatal("expected error, got nil")
		}
		if kind := errors.KindOf(err); kind != errors.Permission {
			t.Errorf("expected kind Permission, got %v", kind)
		}
		if code := errors.CodeOf(err); code != space.OwnerOnly {
			t.Errorf("expected code %v, got %v", space.OwnerOnly, code)
		}
	})

	t.Run("success for owner", func(t *testing.T) {
		session := space.Session{SpaceID: created.ID, UserID: "owner-1"}
		if err := svc.DeleteSpace(ctx, session); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})
}

func TestMemberOperations(t *testing.T) {
	svc, _, _ := setupTestService()
	ctx := context.Background()

	created, err := svc.CreateSpace(ctx, &space.Space{
		OwnerID: "owner-1",
		Name:    "Members Test Space",
	})
	if err != nil {
		t.Fatalf("setup failed: %v", err)
	}

	ownerSession := space.Session{SpaceID: created.ID, UserID: "owner-1"}

	t.Run("add member with invalid role", func(t *testing.T) {
		_, err := svc.AddSpaceMember(ctx, ownerSession, &space.Member{
			UserID: "user-2",
			Role:   "invalid_role",
		})
		if err == nil {
			t.Fatal("expected error, got nil")
		}
		if kind := errors.KindOf(err); kind != errors.Invalid {
			t.Errorf("expected kind Invalid, got %v", kind)
		}
		if code := errors.CodeOf(err); code != space.InvalidRole {
			t.Errorf("expected code %v, got %v", space.InvalidRole, code)
		}
	})

	t.Run("add member success", func(t *testing.T) {
		mem, err := svc.AddSpaceMember(ctx, ownerSession, &space.Member{
			UserID: "user-2",
			Role:   space.RoleMember,
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if mem.UserID != "user-2" || mem.Role != space.RoleMember {
			t.Errorf("unexpected member returned: %+v", mem)
		}
	})

	t.Run("add existing member returns MemberAlreadyExists", func(t *testing.T) {
		_, err := svc.AddSpaceMember(ctx, ownerSession, &space.Member{
			UserID: "user-2",
			Role:   space.RoleMember,
		})
		if err == nil {
			t.Fatal("expected error, got nil")
		}
		if kind := errors.KindOf(err); kind != errors.Exist {
			t.Errorf("expected kind Exist, got %v", kind)
		}
		if code := errors.CodeOf(err); code != space.MemberAlreadyExists {
			t.Errorf("expected code %v, got %v", space.MemberAlreadyExists, code)
		}
	})

	t.Run("remove owner returns OwnerOnly", func(t *testing.T) {
		err := svc.RemoveSpaceMember(ctx, ownerSession, "owner-1")
		if err == nil {
			t.Fatal("expected error, got nil")
		}
		if kind := errors.KindOf(err); kind != errors.Permission {
			t.Errorf("expected kind Permission, got %v", kind)
		}
		if code := errors.CodeOf(err); code != space.OwnerOnly {
			t.Errorf("expected code %v, got %v", space.OwnerOnly, code)
		}
	})

	t.Run("update own role returns OwnerOnly", func(t *testing.T) {
		_, err := svc.UpdateSpaceMemberRole(ctx, ownerSession, &space.Member{
			UserID: "owner-1",
			Role:   space.RoleAdmin,
		})
		if err == nil {
			t.Fatal("expected error, got nil")
		}
		if kind := errors.KindOf(err); kind != errors.Permission {
			t.Errorf("expected kind Permission, got %v", kind)
		}
		if code := errors.CodeOf(err); code != space.OwnerOnly {
			t.Errorf("expected code %v, got %v", space.OwnerOnly, code)
		}
	})

	t.Run("update member role success", func(t *testing.T) {
		updated, err := svc.UpdateSpaceMemberRole(ctx, ownerSession, &space.Member{
			UserID: "user-2",
			Role:   space.RoleAdmin,
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if updated.Role != space.RoleAdmin {
			t.Errorf("expected role Admin, got %s", updated.Role)
		}
	})

	t.Run("remove member success", func(t *testing.T) {
		if err := svc.RemoveSpaceMember(ctx, ownerSession, "user-2"); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})
}

func TestSpace_ApplyPatch(t *testing.T) {
	spaceID, err := space.NewSpaceID()
	if err != nil {
		t.Fatalf("failed generating space ID: %v", err)
	}

	createTime := time.Now().Add(-24 * time.Hour).UTC()
	original := &space.Space{
		ID:          spaceID,
		Name:        "OriginalWorkspace",
		Description: "Initial description",
		OwnerID:     "usr_owner",
		Version:     1,
		CreateTime:  createTime,
		UpdateTime:  createTime,
	}

	t.Run("successfully patches name and description with mask", func(t *testing.T) {
		sp := *original
		incoming := &space.Space{
			Name:        "Patched Workspace",
			Description: "Patched description",
		}

		mask := []string{"name", "description"}
		err := sp.ApplyPatch(incoming, mask)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if sp.Name != "PatchedWorkspace" {
			t.Errorf("expected Name 'PatchedWorkspace', got '%s'", sp.Name)
		}
		if sp.Description != "Patched description" {
			t.Errorf("expected Description 'Patched description', got '%s'", sp.Description)
		}
		if !sp.UpdateTime.After(original.UpdateTime) {
			t.Errorf("expected UpdateTime to be updated")
		}
	})

	t.Run("patches only specified field in mask", func(t *testing.T) {
		sp := *original
		incoming := &space.Space{
			Name:        "Ignored Name",
			Description: "Updated Description Only",
		}

		mask := []string{"description"}
		err := sp.ApplyPatch(incoming, mask)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if sp.Name != "OriginalWorkspace" {
			t.Errorf("expected Name to remain 'OriginalWorkspace', got '%s'", sp.Name)
		}
		if sp.Description != "Updated Description Only" {
			t.Errorf("expected Description 'Updated Description Only', got '%s'", sp.Description)
		}
	})

	t.Run("returns error on unsupported mask field", func(t *testing.T) {
		sp := *original
		incoming := &space.Space{
			Name: "New Name",
		}

		mask := []string{"unsupported_field"}
		err := sp.ApplyPatch(incoming, mask)
		if err == nil {
			t.Fatal("expected error for unsupported field in mask, got nil")
		}
	})

	t.Run("full update when mask is nil or empty", func(t *testing.T) {
		sp := *original
		incoming := &space.Space{
			Name:        "Full Update Space",
			Description: "Full update description",
		}

		err := sp.ApplyPatch(incoming, nil)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if sp.Name != "FullUpdateSpace" {
			t.Errorf("expected Name 'FullUpdateSpace', got '%s'", sp.Name)
		}
		if sp.Description != "Full update description" {
			t.Errorf("expected Description 'Full update description', got '%s'", sp.Description)
		}
	})
}
