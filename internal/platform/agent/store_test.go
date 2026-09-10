package agent

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

func TestStore_ProviderOperations(t *testing.T) {
	ctx := context.Background()

	t.Run("CreateProvider returns created provider", func(t *testing.T) {
		mock := &mockDB{
			getFn: func(ctx context.Context, dest any, query string, args ...any) error {
				p := dest.(*LLMProvider)
				p.ID = "prv_123"
				p.SpaceID = "spc_1"
				p.Name = "OpenAI"
				p.CompatibilityMode = ModeOpenAICompatible
				return nil
			},
		}
		store := NewStore(mock)
		p, err := store.CreateProvider(ctx, "spc_1", "OpenAI", ModeOpenAICompatible, nil, nil)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if p.ID != "prv_123" {
			t.Errorf("expected ID prv_123, got %s", p.ID)
		}
	})

	t.Run("GetProvider returns nil when not found", func(t *testing.T) {
		mock := &mockDB{
			getFn: func(ctx context.Context, dest any, query string, args ...any) error {
				return errors.E("db.Get", errors.NotExist, "not found")
			},
		}
		store := NewStore(mock)
		p, err := store.GetProvider(ctx, GetLLMProvider{SpaceID: "spc_1", ID: "prv_missing"})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if p != nil {
			t.Errorf("expected nil provider, got %+v", p)
		}
	})

	t.Run("DeleteProvider translates NotExist", func(t *testing.T) {
		mock := &mockDB{
			execOneFn: func(ctx context.Context, query string, args ...any) error {
				return errors.E("db.ExecOne", errors.NotExist, "no rows")
			},
		}
		store := NewStore(mock)
		err := store.DeleteProvider(ctx, "spc_1", "prv_missing")
		if err == nil {
			t.Fatal("expected error, got nil")
		}
		if !errors.Is(err, errors.NotExist) {
			t.Errorf("expected NotExist error, got %v", err)
		}
		var platErr *errors.Error
		if errors.As(err, &platErr) {
			if platErr.Op != "platform/agent/storage.DeleteProvider" {
				t.Errorf("expected canonical op, got %v", platErr.Op)
			}
		} else {
			t.Errorf("expected *errors.Error, got %T", err)
		}
	})
}

func TestStore_AgentOperations(t *testing.T) {
	ctx := context.Background()

	t.Run("GetAgent returns nil when not found", func(t *testing.T) {
		mock := &mockDB{
			getFn: func(ctx context.Context, dest any, query string, args ...any) error {
				return errors.E("db.Get", errors.NotExist, "not found")
			},
		}
		store := NewStore(mock)
		a, err := store.GetAgent(ctx, GetAgent{SpaceID: "spc_1", Purpose: "INBOX_PARSER"})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if a != nil {
			t.Errorf("expected nil agent, got %+v", a)
		}
	})

	t.Run("DeleteAgent translates NotExist with canonical Op", func(t *testing.T) {
		mock := &mockDB{
			execOneFn: func(ctx context.Context, query string, args ...any) error {
				return errors.E("db.ExecOne", errors.NotExist, "no rows")
			},
		}
		store := NewStore(mock)
		err := store.DeleteAgent(ctx, "spc_1", "agt_missing")
		if err == nil {
			t.Fatal("expected error, got nil")
		}
		if !errors.Is(err, errors.NotExist) {
			t.Errorf("expected NotExist error, got %v", err)
		}
		var platErr *errors.Error
		if errors.As(err, &platErr) {
			if platErr.Op != "platform/agent/storage.DeleteAgent" {
				t.Errorf("expected canonical op platform/agent/storage.DeleteAgent, got %v", platErr.Op)
			}
		} else {
			t.Errorf("expected *errors.Error, got %T", err)
		}
	})

	t.Run("LogRun succeeds", func(t *testing.T) {
		mock := &mockDB{
			getFn: func(ctx context.Context, dest any, query string, args ...any) error {
				r := dest.(*AgentRun)
				r.ID = "run_123"
				r.AgentID = "agt_1"
				r.SpaceID = "spc_1"
				r.Status = RunSuccess
				r.TokensUsed = 42
				r.CreateTime = time.Now().UTC()
				return nil
			},
		}
		store := NewStore(mock)
		out := "hello"
		run, err := store.LogRun(ctx, "agt_1", "spc_1", RunSuccess, "input", &out, nil, 42)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if run.ID != "run_123" {
			t.Errorf("expected ID run_123, got %s", run.ID)
		}
	})
}
