package storage

import (
	"context"
	"database/sql"
	"testing"
	"time"

	"github.com/masterkeysrd/saturn/internal/domain/identity"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

type mockDB struct {
	getFn     func(ctx context.Context, dest any, query string, args ...any) error
	selectFn  func(ctx context.Context, dest any, query string, args ...any) error
	execFn    func(ctx context.Context, query string, args ...any) (sql.Result, error)
	execOneFn func(ctx context.Context, query string, args ...any) error
	rebindFn  func(query string) string
}

func (m *mockDB) Get(ctx context.Context, dest any, query string, args ...any) error {
	if m.getFn != nil {
		return m.getFn(ctx, dest, query, args...)
	}
	return nil
}

func (m *mockDB) Select(ctx context.Context, dest any, query string, args ...any) error {
	if m.selectFn != nil {
		return m.selectFn(ctx, dest, query, args...)
	}
	return nil
}

func (m *mockDB) Exec(ctx context.Context, query string, args ...any) (sql.Result, error) {
	if m.execFn != nil {
		return m.execFn(ctx, query, args...)
	}
	return nil, nil
}

func (m *mockDB) ExecOne(ctx context.Context, query string, args ...any) error {
	if m.execOneFn != nil {
		return m.execOneFn(ctx, query, args...)
	}
	return nil
}

func (m *mockDB) Rebind(query string) string {
	if m.rebindFn != nil {
		return m.rebindFn(query)
	}
	return query
}

func TestUserStore(t *testing.T) {
	ctx := context.Background()

	t.Run("GetByID returns translated NotExist error", func(t *testing.T) {
		mock := &mockDB{
			getFn: func(ctx context.Context, dest any, query string, args ...any) error {
				return errors.E(errors.NotExist, "record not found")
			},
		}

		store := NewUserStore(mock)
		u, err := store.GetByID(ctx, "usr_nonexistent")
		if u != nil {
			t.Errorf("expected nil user, got %v", u)
		}
		if !errors.Is(err, errors.NotExist) {
			t.Errorf("expected KindNotExist error, got %v", err)
		}
		if e, ok := err.(*errors.Error); !ok || e.Op != "domain/identity/storage.GetByID" {
			t.Errorf("expected op domain/identity/storage.GetByID, got %v", err)
		}
	})

	t.Run("Create calls Exec and persists user", func(t *testing.T) {
		called := false
		mock := &mockDB{
			execFn: func(ctx context.Context, query string, args ...any) (sql.Result, error) {
				called = true
				return nil, nil
			},
		}

		store := NewUserStore(mock)
		u := &identity.User{
			ID:          "usr_1",
			Email:       "test@example.com",
			Username:    "testuser",
			Name:        "Test User",
			Status:      identity.UserStatusActive,
			AccessLevel: identity.AccessLevelUser,
			Version:     1,
		}

		err := store.Create(ctx, u)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !called {
			t.Fatal("expected Exec to be called")
		}
	})

	t.Run("Update calls ExecOne and increments version on success", func(t *testing.T) {
		called := false
		mock := &mockDB{
			execOneFn: func(ctx context.Context, query string, args ...any) error {
				called = true
				return nil
			},
		}

		store := NewUserStore(mock)
		u := &identity.User{
			ID:      "usr_1",
			Name:    "Updated Name",
			Version: 2,
		}

		err := store.Update(ctx, u)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !called {
			t.Fatal("expected ExecOne to be called")
		}
		if u.Version != 3 {
			t.Errorf("expected version to increment to 3, got %d", u.Version)
		}
	})

	t.Run("Update returns error if ExecOne fails", func(t *testing.T) {
		mock := &mockDB{
			execOneFn: func(ctx context.Context, query string, args ...any) error {
				return errors.E(errors.NotExist, "record not found")
			},
		}

		store := NewUserStore(mock)
		u := &identity.User{
			ID:      "usr_1",
			Name:    "Updated Name",
			Version: 2,
		}

		err := store.Update(ctx, u)
		if err == nil {
			t.Fatal("expected error, got nil")
		}
		if !errors.Is(err, errors.Conflict) {
			t.Errorf("expected Conflict error, got %v", err)
		}
		if u.Version != 2 {
			t.Errorf("expected version to remain 2, got %d", u.Version)
		}
	})

	t.Run("GetUsers calls Select and returns Page", func(t *testing.T) {
		mock := &mockDB{
			selectFn: func(ctx context.Context, dest any, query string, args ...any) error {
				ptr, ok := dest.(*[]userDB)
				if !ok {
					t.Fatalf("expected *[]userDB, got %T", dest)
				}
				*ptr = []userDB{
					{ID: "usr_1", Email: "a@example.com", Username: "usra", Name: "User A", Status: "active", AccessLevel: "user"},
					{ID: "usr_2", Email: "b@example.com", Username: "usrb", Name: "User B", Status: "active", AccessLevel: "user"},
				}
				return nil
			},
		}

		store := NewUserStore(mock)
		page, err := store.GetUsers(ctx, &identity.ListUsersFilter{PageSize: 10})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(page.Items) != 2 {
			t.Fatalf("expected 2 users, got %d", len(page.Items))
		}
		if page.Items[0].Email != "a@example.com" {
			t.Errorf("expected user a@example.com, got %s", page.Items[0].Email)
		}
	})
}

func TestCredentialStore(t *testing.T) {
	ctx := context.Background()

	t.Run("Create calls Exec", func(t *testing.T) {
		called := false
		mock := &mockDB{
			execFn: func(ctx context.Context, query string, args ...any) (sql.Result, error) {
				called = true
				return nil, nil
			},
		}

		store := NewCredentialStore(mock)
		cred := &identity.Credential{
			UserID:     "usr_1",
			AuthType:   "password",
			SecretData: "secret_hash",
		}

		err := store.Create(ctx, cred)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !called {
			t.Fatal("expected Exec to be called")
		}
	})

	t.Run("GetByUserIDAndAuthType returns translated NotExist", func(t *testing.T) {
		mock := &mockDB{
			getFn: func(ctx context.Context, dest any, query string, args ...any) error {
				return errors.E(errors.NotExist, "not found")
			},
		}

		store := NewCredentialStore(mock)
		cred, err := store.GetByUserIDAndAuthType(ctx, "usr_1", "password")
		if cred != nil {
			t.Errorf("expected nil cred, got %v", cred)
		}
		if !errors.Is(err, errors.NotExist) {
			t.Errorf("expected NotExist, got %v", err)
		}
	})

	t.Run("Update calls ExecOne", func(t *testing.T) {
		called := false
		mock := &mockDB{
			execOneFn: func(ctx context.Context, query string, args ...any) error {
				called = true
				return nil
			},
		}

		store := NewCredentialStore(mock)
		cred := &identity.Credential{
			UserID:     "usr_1",
			AuthType:   "password",
			SecretData: "new_hash",
		}

		err := store.Update(ctx, cred)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !called {
			t.Fatal("expected ExecOne to be called")
		}
	})
}

func TestSessionStore(t *testing.T) {
	ctx := context.Background()

	t.Run("CreateSession calls Exec", func(t *testing.T) {
		called := false
		mock := &mockDB{
			execFn: func(ctx context.Context, query string, args ...any) (sql.Result, error) {
				called = true
				return nil, nil
			},
		}

		store := NewSessionStore(mock)
		now := time.Now()
		session := &identity.Session{
			ID:                "ses_1",
			UserID:            "usr_1",
			RefreshTokenHash:  []byte("hash"),
			TokenFamilyID:     "tfm_1",
			UserAgent:         "test-agent",
			IPAddress:         "127.0.0.1",
			ExpiresAt:         now.Add(time.Hour),
			AbsoluteExpiresAt: now.Add(24 * time.Hour),
			CreateTime:        now,
		}

		err := store.Create(ctx, session)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !called {
			t.Fatal("expected Exec to be called")
		}
	})

	t.Run("RevokeByID calls ExecOne", func(t *testing.T) {
		called := false
		mock := &mockDB{
			execOneFn: func(ctx context.Context, query string, args ...any) error {
				called = true
				return nil
			},
		}

		store := NewSessionStore(mock)
		err := store.RevokeByID(ctx, "ses_1", "usr_1", time.Now())
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !called {
			t.Fatal("expected ExecOne to be called")
		}
	})
}

func TestSecurityEventStore(t *testing.T) {
	ctx := context.Background()

	t.Run("Create calls Exec", func(t *testing.T) {
		called := false
		mock := &mockDB{
			execFn: func(ctx context.Context, query string, args ...any) (sql.Result, error) {
				called = true
				return nil, nil
			},
		}

		store := NewSecurityEventStore(mock)
		event := &identity.SecurityEvent{
			ID:        "evt_1",
			EventType: identity.SecurityEventLoginSuccess,
			CreatedAt: time.Now(),
		}

		err := store.Create(ctx, event)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !called {
			t.Fatal("expected Exec to be called")
		}
	})

	t.Run("List calls Select and returns Page", func(t *testing.T) {
		mock := &mockDB{
			selectFn: func(ctx context.Context, dest any, query string, args ...any) error {
				ptr, ok := dest.(*[]securityEventDB)
				if !ok {
					t.Fatalf("expected *[]securityEventDB, got %T", dest)
				}
				*ptr = []securityEventDB{
					{ID: "evt_1", Email: "user@example.com", EventType: "login_success"},
				}
				return nil
			},
		}

		store := NewSecurityEventStore(mock)
		page, err := store.List(ctx, identity.SecurityEventFilter{Limit: 10})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(page.Items) != 1 {
			t.Fatalf("expected 1 event, got %d", len(page.Items))
		}
		if page.Items[0].ID != "evt_1" {
			t.Errorf("expected event evt_1, got %s", page.Items[0].ID)
		}
	})
}
