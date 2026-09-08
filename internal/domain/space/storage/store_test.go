package storage

import (
	"context"
	"database/sql"
	"testing"

	"github.com/masterkeysrd/saturn/internal/domain/space"
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

func TestSpaceStore(t *testing.T) {
	ctx := context.Background()

	t.Run("GetByID returns translated NotExist error", func(t *testing.T) {
		mock := &mockDB{
			getFn: func(ctx context.Context, dest any, query string, args ...any) error {
				return errors.E(errors.NotExist, "record not found")
			},
		}

		store := NewSpaceStore(mock)
		sp, err := store.GetByID(ctx, "sp_nonexistent")
		if sp != nil {
			t.Errorf("expected nil space, got %v", sp)
		}
		if !errors.Is(err, errors.NotExist) {
			t.Errorf("expected KindNotExist error, got %v", err)
		}
		if e, ok := err.(*errors.Error); !ok || e.Op != "domain/space/storage.GetByID" {
			t.Errorf("expected op domain/space/storage.GetByID, got %v", err)
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

		store := NewSpaceStore(mock)
		sp := &space.Space{
			ID:      "sp_1",
			Name:    "Updated",
			Version: 2,
		}

		err := store.Update(ctx, sp)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !called {
			t.Fatal("expected ExecOne to be called")
		}
		if sp.Version != 3 {
			t.Errorf("expected version to be incremented to 3, got %d", sp.Version)
		}
	})

	t.Run("Delete returns NotExist when ExecOne fails with NotExist", func(t *testing.T) {
		mock := &mockDB{
			execOneFn: func(ctx context.Context, query string, args ...any) error {
				return errors.E(errors.NotExist, "record not found")
			},
		}

		store := NewSpaceStore(mock)
		err := store.Delete(ctx, "sp_nonexistent")
		if !errors.Is(err, errors.NotExist) {
			t.Errorf("expected KindNotExist, got %v", err)
		}
		if e, ok := err.(*errors.Error); !ok || e.Op != "domain/space/storage.Delete" {
			t.Errorf("expected op domain/space/storage.Delete, got %v", err)
		}
	})
}

func TestMemberStore(t *testing.T) {
	ctx := context.Background()

	t.Run("Exists returns false without error when KindNotExist", func(t *testing.T) {
		mock := &mockDB{
			getFn: func(ctx context.Context, dest any, query string, args ...any) error {
				return errors.E(errors.NotExist, "record not found")
			},
		}

		store := NewMemberStore(mock)
		exists, err := store.Exists(ctx, "sp_1", "usr_1")
		if err != nil {
			t.Fatalf("expected nil error, got %v", err)
		}
		if exists {
			t.Errorf("expected exists=false, got true")
		}
	})

	t.Run("Exists returns true when record found", func(t *testing.T) {
		mock := &mockDB{
			getFn: func(ctx context.Context, dest any, query string, args ...any) error {
				if ptr, ok := dest.(*int); ok {
					*ptr = 1
				}
				return nil
			},
		}

		store := NewMemberStore(mock)
		exists, err := store.Exists(ctx, "sp_1", "usr_1")
		if err != nil {
			t.Fatalf("expected nil error, got %v", err)
		}
		if !exists {
			t.Errorf("expected exists=true, got false")
		}
	})

	t.Run("Exists returns error when database error occurs", func(t *testing.T) {
		mock := &mockDB{
			getFn: func(ctx context.Context, dest any, query string, args ...any) error {
				return errors.E(errors.Unavailable, "connection lost")
			},
		}

		store := NewMemberStore(mock)
		exists, err := store.Exists(ctx, "sp_1", "usr_1")
		if err == nil {
			t.Fatal("expected error, got nil")
		}
		if exists {
			t.Errorf("expected exists=false on error, got true")
		}
		if !errors.Is(err, errors.Unavailable) {
			t.Errorf("expected KindUnavailable, got %v", err)
		}
		if e, ok := err.(*errors.Error); !ok || e.Op != "domain/space/storage.MemberExists" {
			t.Errorf("expected op domain/space/storage.MemberExists, got %v", err)
		}
	})
}
