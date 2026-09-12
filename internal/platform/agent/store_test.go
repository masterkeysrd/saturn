package agent_test

import (
	"context"
	"database/sql"
	"testing"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/agent"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/paging"
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
				p := dest.(*agent.LLMProvider)
				p.ID = "prv_123"
				p.SpaceID = "spc_1"
				p.Name = "OpenAI"
				p.CompatibilityMode = agent.ModeOpenAICompatible
				return nil
			},
		}
		store := agent.NewStore(mock)
		p, err := store.CreateProvider(ctx, "spc_1", "OpenAI", agent.ModeOpenAICompatible, nil, nil)
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
		store := agent.NewStore(mock)
		p, err := store.GetProvider(ctx, agent.GetLLMProvider{SpaceID: "spc_1", ID: "prv_missing"})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if p != nil {
			t.Errorf("expected nil provider, got %+v", p)
		}
	})

	t.Run("ListProviders returns slice of providers", func(t *testing.T) {
		mock := &mockDB{
			selectFn: func(ctx context.Context, dest any, query string, args ...any) error {
				list := dest.(*[]*agent.LLMProvider)
				*list = append(*list, &agent.LLMProvider{ID: "prv_1", Name: "OpenAI"})
				*list = append(*list, &agent.LLMProvider{ID: "prv_2", Name: "Anthropic"})
				return nil
			},
		}
		store := agent.NewStore(mock)
		providers, err := store.ListProviders(ctx, "spc_1")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(providers) != 2 {
			t.Fatalf("expected 2 providers, got %d", len(providers))
		}
	})

	t.Run("UpdateProvider returns updated provider", func(t *testing.T) {
		mock := &mockDB{
			getFn: func(ctx context.Context, dest any, query string, args ...any) error {
				p := dest.(*agent.LLMProvider)
				p.ID = "prv_1"
				p.Name = "Updated OpenAI"
				return nil
			},
		}
		store := agent.NewStore(mock)
		newName := "Updated OpenAI"
		p, err := store.UpdateProvider(ctx, "spc_1", "prv_1", newName, nil, nil)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if p.Name != newName {
			t.Errorf("expected updated name %s, got %s", newName, p.Name)
		}
	})

	t.Run("DeleteProvider succeeds", func(t *testing.T) {
		mock := &mockDB{
			execOneFn: func(ctx context.Context, query string, args ...any) error {
				return nil
			},
		}
		store := agent.NewStore(mock)
		if err := store.DeleteProvider(ctx, "spc_1", "prv_1"); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("DeleteProvider translates NotExist", func(t *testing.T) {
		mock := &mockDB{
			execOneFn: func(ctx context.Context, query string, args ...any) error {
				return errors.E("db.ExecOne", errors.NotExist, "no rows")
			},
		}
		store := agent.NewStore(mock)
		err := store.DeleteProvider(ctx, "spc_1", "prv_missing")
		if err == nil {
			t.Fatal("expected error, got nil")
		}
		if !errors.Is(err, errors.NotExist) {
			t.Errorf("expected NotExist error, got %v", err)
		}
	})
}

func TestStore_AgentOperations(t *testing.T) {
	ctx := context.Background()

	t.Run("CreateAgent creates agent with tags", func(t *testing.T) {
		mock := &mockDB{
			getFn: func(ctx context.Context, dest any, query string, args ...any) error {
				a := dest.(*agent.Agent)
				a.ID = "agt_new"
				a.Name = "Inbox Agent"
				a.Purpose = "INBOX"
				a.Tags = []string{"finance", "inbox"}
				return nil
			},
		}
		store := agent.NewStore(mock)
		a, err := store.CreateAgent(ctx, "spc_1", nil, "Inbox Agent", nil, "INBOX", []string{"finance", "inbox"}, "gpt-4o", nil, 0.2)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if a.ID != "agt_new" || len(a.Tags) != 2 {
			t.Errorf("unexpected agent: %+v", a)
		}
	})

	t.Run("GetAgent by purpose returns nil when not found", func(t *testing.T) {
		mock := &mockDB{
			getFn: func(ctx context.Context, dest any, query string, args ...any) error {
				return errors.E("db.Get", errors.NotExist, "not found")
			},
		}
		store := agent.NewStore(mock)
		a, err := store.GetAgent(ctx, agent.GetAgent{SpaceID: "spc_1", Purpose: "INBOX_PARSER"})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if a != nil {
			t.Errorf("expected nil agent, got %+v", a)
		}
	})

	t.Run("GetAgent by ID returns agent", func(t *testing.T) {
		mock := &mockDB{
			getFn: func(ctx context.Context, dest any, query string, args ...any) error {
				a := dest.(*agent.Agent)
				a.ID = "agt_1"
				a.Name = "Agent One"
				return nil
			},
		}
		store := agent.NewStore(mock)
		a, err := store.GetAgent(ctx, agent.GetAgent{SpaceID: "spc_1", ID: "agt_1"})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if a == nil || a.ID != "agt_1" {
			t.Errorf("expected agent agt_1, got %+v", a)
		}
	})

	t.Run("ListAgents returns all agents", func(t *testing.T) {
		mock := &mockDB{
			selectFn: func(ctx context.Context, dest any, query string, args ...any) error {
				list := dest.(*[]*agent.Agent)
				*list = append(*list, &agent.Agent{ID: "agt_1", Name: "Agent 1"})
				*list = append(*list, &agent.Agent{ID: "agt_2", Name: "Agent 2"})
				return nil
			},
		}
		store := agent.NewStore(mock)
		agents, err := store.ListAgents(ctx, "spc_1")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(agents) != 2 {
			t.Fatalf("expected 2 agents, got %d", len(agents))
		}
	})

	t.Run("UpdateAgent updates agent details", func(t *testing.T) {
		mock := &mockDB{
			getFn: func(ctx context.Context, dest any, query string, args ...any) error {
				a := dest.(*agent.Agent)
				a.ID = "agt_1"
				a.Name = "Updated Agent"
				a.IsEnabled = true
				return nil
			},
		}
		store := agent.NewStore(mock)
		a, err := store.UpdateAgent(ctx, "spc_1", "agt_1", nil, "Updated Agent", nil, nil, "gpt-4o", nil, 0.7, true)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if a.Name != "Updated Agent" {
			t.Errorf("expected name 'Updated Agent', got %s", a.Name)
		}
	})

	t.Run("DeleteAgent translates NotExist with canonical Op", func(t *testing.T) {
		mock := &mockDB{
			execOneFn: func(ctx context.Context, query string, args ...any) error {
				return errors.E("db.ExecOne", errors.NotExist, "no rows")
			},
		}
		store := agent.NewStore(mock)
		err := store.DeleteAgent(ctx, "spc_1", "agt_missing")
		if err == nil {
			t.Fatal("expected error, got nil")
		}
		if !errors.Is(err, errors.NotExist) {
			t.Errorf("expected NotExist error, got %v", err)
		}
	})

	t.Run("LogRun and ListRuns with pagination", func(t *testing.T) {
		now := time.Now().UTC()
		mock := &mockDB{
			getFn: func(ctx context.Context, dest any, query string, args ...any) error {
				r := dest.(*agent.AgentRun)
				r.ID = "run_123"
				r.AgentID = "agt_1"
				r.SpaceID = "spc_1"
				r.Status = agent.RunSuccess
				r.TokensUsed = 42
				r.CreateTime = now
				return nil
			},
			selectFn: func(ctx context.Context, dest any, query string, args ...any) error {
				list := dest.(*[]*agent.AgentRun)
				*list = append(*list, &agent.AgentRun{
					ID:         "run_1",
					AgentID:    "agt_1",
					SpaceID:    "spc_1",
					Status:     agent.RunSuccess,
					CreateTime: now,
				})
				return nil
			},
		}
		store := agent.NewStore(mock)

		// LogRun
		out := "hello"
		run, err := store.LogRun(ctx, "agt_1", "spc_1", agent.RunSuccess, "input", &out, nil, 42)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if run.ID != "run_123" {
			t.Errorf("expected ID run_123, got %s", run.ID)
		}

		// ListRuns without cursor
		page, err := store.ListRuns(ctx, agent.ListAgentRuns{
			SpaceID:  "spc_1",
			AgentID:  "agt_1",
			PageSize: 10,
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(page.Items) != 1 {
			t.Errorf("expected 1 run, got %d", len(page.Items))
		}

		// ListRuns with valid cursor
		cursorStr := paging.Cursor{SortValue: now.Format(time.RFC3339Nano), ID: "run_1"}.Encode()
		pageWithCursor, err := store.ListRuns(ctx, agent.ListAgentRuns{
			SpaceID:   "spc_1",
			AgentID:   "agt_1",
			PageSize:  0, // tests default to 20
			PageToken: cursorStr,
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(pageWithCursor.Items) != 1 {
			t.Errorf("expected 1 run, got %d", len(pageWithCursor.Items))
		}

		// ListRuns with invalid page token
		_, err = store.ListRuns(ctx, agent.ListAgentRuns{
			SpaceID:   "spc_1",
			AgentID:   "agt_1",
			PageToken: "invalid-token-format",
		})
		if err == nil {
			t.Error("expected error for invalid page token, got nil")
		}
	})
}
