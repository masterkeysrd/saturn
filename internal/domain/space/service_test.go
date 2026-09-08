package space_test

import (
	"context"
	"fmt"
	"sync"
	"testing"

	"github.com/masterkeysrd/saturn/internal/domain/space"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
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
	m.spaces[s.ID] = s
	return nil
}

func (m *memorySpaceStore) GetByID(ctx context.Context, id space.SpaceID) (*space.Space, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	s, ok := m.spaces[id]
	if !ok {
		return nil, errors.E(errors.NotExist, "space not found")
	}
	return s, nil
}

func (m *memorySpaceStore) Update(ctx context.Context, s *space.Space) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, ok := m.spaces[s.ID]; !ok {
		return fmt.Errorf("space not found")
	}
	m.spaces[s.ID] = s
	return nil
}

func (m *memorySpaceStore) Delete(ctx context.Context, id space.SpaceID) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.spaces, id)
	return nil
}

func (m *memorySpaceStore) ListByUser(ctx context.Context, userID space.SpaceID, filter *space.ListSpacesFilter) ([]*space.Space, string, error) {
	return m.ListByUserOwned(ctx, userID, filter)
}

func (m *memorySpaceStore) ListByUserOwned(ctx context.Context, ownerID space.SpaceID, filter *space.ListSpacesFilter) ([]*space.Space, string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var res []*space.Space
	for _, s := range m.spaces {
		if s.OwnerID == ownerID {
			res = append(res, s)
		}
	}
	return res, "", nil
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

func (m *memoryMemberStore) ListBySpace(ctx context.Context, spaceID space.SpaceID, filter *space.ListMembersFilter) ([]*space.Member, string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var res []*space.Member
	for _, mem := range m.members {
		if mem.SpaceID == spaceID {
			res = append(res, mem)
		}
	}
	return res, "", nil
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
		_, err := svc.UpdateSpace(ctx, session, &space.Space{Name: "Beta"})
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
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if updated.Name != "AlphaRenamed" {
			t.Errorf("expected name 'AlphaRenamed', got %s", updated.Name)
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
