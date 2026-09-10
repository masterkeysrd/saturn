package integration

import (
	"context"
	"database/sql"
	"testing"
	"time"

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

func TestRegistry_Storage(t *testing.T) {
	ctx := context.Background()

	t.Run("Get returns nil when NotExist", func(t *testing.T) {
		mock := &mockDB{
			getFn: func(ctx context.Context, dest any, query string, args ...any) error {
				return errors.E("db.Get", errors.NotExist, "not found")
			},
		}
		reg := NewRegistry(mock)
		i, err := reg.Get(ctx, GetIntegration{SpaceID: "spc_1", Provider: "email", Kind: "transaction_ingestion"})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if i != nil {
			t.Errorf("expected nil integration, got %+v", i)
		}
	})

	t.Run("ResolveByToken returns Unauthenticated when NotExist", func(t *testing.T) {
		mock := &mockDB{
			getFn: func(ctx context.Context, dest any, query string, args ...any) error {
				return errors.E("db.Get", errors.NotExist, "not found")
			},
		}
		reg := NewRegistry(mock)
		i, err := reg.ResolveByToken(ctx, "invalid-token")
		if err == nil {
			t.Fatal("expected error, got nil")
		}
		if errors.KindOf(err) != errors.Unauthenticated {
			t.Errorf("expected Unauthenticated kind, got %v", errors.KindOf(err))
		}
		if i != nil {
			t.Errorf("expected nil integration, got %+v", i)
		}
	})

	t.Run("DeleteToken translates NotExist error with canonical Op", func(t *testing.T) {
		mock := &mockDB{
			execOneFn: func(ctx context.Context, query string, args ...any) error {
				return errors.E("db.ExecOne", errors.NotExist, "no rows affected")
			},
		}
		reg := NewRegistry(mock)
		err := reg.DeleteToken(ctx, "int_1", "tok_missing")
		if err == nil {
			t.Fatal("expected error, got nil")
		}
		if !errors.Is(err, errors.NotExist) {
			t.Errorf("expected NotExist error, got %v", err)
		}
		var platErr *errors.Error
		if errors.As(err, &platErr) {
			if platErr.Op != "platform/integration/storage.DeleteToken" {
				t.Errorf("expected canonical op platform/integration/storage.DeleteToken, got %v", platErr.Op)
			}
		} else {
			t.Errorf("expected *errors.Error, got %T", err)
		}
	})

	t.Run("CreateToken succeeds and returns token", func(t *testing.T) {
		mock := &mockDB{
			getFn: func(ctx context.Context, dest any, query string, args ...any) error {
				tok := dest.(*IntegrationToken)
				tok.ID = "tok_123"
				tok.IntegrationID = "int_1"
				tok.Name = "Test Key"
				tok.CreateTime = time.Now().UTC()
				return nil
			},
		}
		reg := NewRegistry(mock)
		tok, rawTok, err := reg.CreateToken(ctx, "int_1", "Test Key")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if tok.ID != "tok_123" {
			t.Errorf("expected ID tok_123, got %s", tok.ID)
		}
		if rawTok == "" {
			t.Error("expected non-empty raw token")
		}
	})
}
