package agentapp

import (
	"context"
	"fmt"
	"testing"

	"github.com/masterkeysrd/saturn/internal/platform/agent"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/log"
	"github.com/masterkeysrd/saturn/internal/platform/paging"
)

func TestCoordinator_ExecuteAgent(t *testing.T) {
	ctx := context.Background()

	t.Run("Unsupported purpose returns Invalid", func(t *testing.T) {
		coord := NewCoordinator(&AgentStoreMock{}, agent.NewClient())
		_, err := coord.ExecuteAgent(ctx, ExecutionRequest{
			SpaceID: "spc_1",
			Purpose: "NON_EXISTENT_PURPOSE",
		})
		if err == nil {
			t.Fatal("expected error for unsupported purpose, got nil")
		}
		if errors.KindOf(err) != errors.Invalid {
			t.Errorf("expected Invalid kind, got %v", errors.KindOf(err))
		}
		if errors.CodeOf(err) != InvalidAgentPurpose {
			t.Errorf("expected InvalidAgentPurpose code, got %v", errors.CodeOf(err))
		}
		var platErr *errors.Error
		if errors.As(err, &platErr) && platErr.Op != "application/agent.ExecuteAgent" {
			t.Errorf("expected canonical op application/agent.ExecuteAgent, got %v", platErr.Op)
		}
	})

	t.Run("Mock execution succeeds with catalog purpose", func(t *testing.T) {
		mockStore := &AgentStoreMock{
			GetAgentFunc: func(ctx context.Context, q agent.GetAgent) (*agent.Agent, error) {
				provID := "prv_1"
				return &agent.Agent{
					ID:            "agt_1",
					SpaceID:       "spc_1",
					LLMProviderID: &provID,
					Purpose:       "TEST_AGENT",
					ModelName:     "gemini-2.5-flash",
				}, nil
			},
			GetProviderFunc: func(ctx context.Context, q agent.GetLLMProvider) (*agent.LLMProvider, error) {
				apiKey := "mock-key"
				return &agent.LLMProvider{
					ID:                "prv_1",
					SpaceID:           "spc_1",
					CompatibilityMode: agent.ModeGeminiNative,
					APIKey:            &apiKey,
				}, nil
			},
			LogRunFunc: func(ctx context.Context, agentID string, spaceID string, status agent.AgentRunStatus, input string, output *string, errMsg *string, tokens int) (*agent.AgentRun, error) {
				return &agent.AgentRun{ID: "run_test"}, nil
			},
		}

		agent.RegisterAgent(agent.AgentDescriptor{
			Purpose:               "TEST_AGENT",
			DefaultPromptTemplate: "{{.email_body}}",
		})

		coord := NewCoordinator(mockStore, agent.NewClient())
		res, err := coord.ExecuteAgent(ctx, ExecutionRequest{
			SpaceID: "spc_1",
			Purpose: "TEST_AGENT",
			Params: map[string]any{
				"email_body": "Receipt from Acme",
			},
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if res == "" {
			t.Error("expected non-empty response from mock fallback")
		}
	})
}

func TestCoordinator_ErrorMapping(t *testing.T) {
	op := errors.Op("application/agent.ExecuteAgent")

	t.Run("Rate limit maps to Unavailable", func(t *testing.T) {
		rawErr := fmt.Errorf("HTTP 429: rate limit exceeded")
		mapped := MapExecutionError(op, rawErr)
		if errors.KindOf(mapped) != errors.Unavailable {
			t.Errorf("expected Unavailable, got %v", errors.KindOf(mapped))
		}
		if errors.CodeOf(mapped) != ModelUnavailable {
			t.Errorf("expected ModelUnavailable, got %v", errors.CodeOf(mapped))
		}
	})

	t.Run("Connection refused maps to Unavailable", func(t *testing.T) {
		rawErr := fmt.Errorf("dial tcp 127.0.0.1:11434: connection refused")
		mapped := MapExecutionError(op, rawErr)
		if errors.KindOf(mapped) != errors.Unavailable {
			t.Errorf("expected Unavailable, got %v", errors.KindOf(mapped))
		}
		if errors.CodeOf(mapped) != ModelUnavailable {
			t.Errorf("expected ModelUnavailable, got %v", errors.CodeOf(mapped))
		}
	})

	t.Run("Deadline exceeded maps to Unavailable", func(t *testing.T) {
		mapped := MapExecutionError(op, context.DeadlineExceeded)
		if errors.KindOf(mapped) != errors.Unavailable {
			t.Errorf("expected Unavailable, got %v", errors.KindOf(mapped))
		}
		if errors.CodeOf(mapped) != ModelUnavailable {
			t.Errorf("expected ModelUnavailable, got %v", errors.CodeOf(mapped))
		}
	})

	t.Run("General model error maps to Internal", func(t *testing.T) {
		rawErr := fmt.Errorf("unsupported model gpt-99")
		mapped := MapExecutionError(op, rawErr)
		if errors.KindOf(mapped) != errors.Internal {
			t.Errorf("expected Internal, got %v", errors.KindOf(mapped))
		}
		if errors.CodeOf(mapped) != ModelExecutionFailed {
			t.Errorf("expected ModelExecutionFailed, got %v", errors.CodeOf(mapped))
		}
	})
}

func TestCoordinator_CRUDAndSuggestions(t *testing.T) {
	ctx := context.Background()

	t.Run("CreateAgent detects existing agent for same purpose", func(t *testing.T) {
		mockStore := &AgentStoreMock{
			GetAgentFunc: func(ctx context.Context, q agent.GetAgent) (*agent.Agent, error) {
				return &agent.Agent{ID: "agt_existing", Purpose: "INBOX_PARSER"}, nil
			},
		}
		coord := NewCoordinator(mockStore, agent.NewClient())
		_, err := coord.CreateAgent(ctx, &CreateAgentRequest{
			SpaceID:   "spc_1",
			Name:      "Hyperion",
			Purpose:   "INBOX_PARSER",
			ModelName: "model",
		})
		if err == nil {
			t.Fatal("expected error, got nil")
		}
		if errors.KindOf(err) != errors.Exist {
			t.Errorf("expected Exist kind, got %v", errors.KindOf(err))
		}
		if errors.CodeOf(err) != AgentExists {
			t.Errorf("expected AgentExists code, got %v", errors.CodeOf(err))
		}
	})

	t.Run("CreateProvider validates request", func(t *testing.T) {
		coord := NewCoordinator(&AgentStoreMock{}, agent.NewClient())
		_, err := coord.CreateProvider(ctx, nil)
		if err == nil || errors.KindOf(err) != errors.Invalid {
			t.Fatalf("expected Invalid kind for nil req, got %v", err)
		}

		_, err = coord.CreateProvider(ctx, &CreateProviderRequest{SpaceID: "spc_1", Name: ""})
		if err == nil || errors.KindOf(err) != errors.Invalid {
			t.Fatalf("expected Invalid kind for empty name, got %v", err)
		}
	})

	t.Run("GetProvider returns NotExist when nil", func(t *testing.T) {
		mockStore := &AgentStoreMock{
			GetProviderFunc: func(ctx context.Context, q agent.GetLLMProvider) (*agent.LLMProvider, error) {
				return nil, nil
			},
		}
		coord := NewCoordinator(mockStore, agent.NewClient())
		_, err := coord.GetProvider(ctx, "spc_1", "prv_nonexistent")
		if err == nil {
			t.Fatal("expected error, got nil")
		}
		if errors.KindOf(err) != errors.NotExist {
			t.Errorf("expected NotExist kind, got %v", errors.KindOf(err))
		}
		if errors.CodeOf(err) != ProviderNotFound {
			t.Errorf("expected ProviderNotFound code, got %v", errors.CodeOf(err))
		}
	})

	t.Run("GetSuggestions fails for unregistered purpose", func(t *testing.T) {
		coord := NewCoordinator(&AgentStoreMock{}, agent.NewClient())
		_, err := coord.GetSuggestions(ctx, "spc_1", "unknown_purpose", &SuggestionRequest{})
		if err == nil {
			t.Fatal("expected error, got nil")
		}
		if errors.KindOf(err) != errors.NotExist {
			t.Errorf("expected NotExist kind, got %v", errors.KindOf(err))
		}
		if errors.CodeOf(err) != SuggestionProcessorNotFound {
			t.Errorf("expected SuggestionProcessorNotFound code, got %v", errors.CodeOf(err))
		}
	})

	t.Run("LoggingCoordinator wraps Coordinator transparently", func(t *testing.T) {
		mockStore := &AgentStoreMock{
			ListProvidersFunc: func(ctx context.Context, spaceID string) ([]*agent.LLMProvider, error) {
				return []*agent.LLMProvider{{ID: "prv_1"}}, nil
			},
		}
		inner := NewCoordinator(mockStore, agent.NewClient())
		logger := log.New()
		logged := NewLoggingCoordinator(inner, logger)

		list, err := logged.ListProviders(ctx, "spc_1")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(list) != 1 {
			t.Errorf("expected 1 provider, got %d", len(list))
		}
	})
}

func TestCoordinator_Suggestions(t *testing.T) {
	ctx := context.Background()

	t.Run("Empty purpose returns Invalid", func(t *testing.T) {
		coord := NewCoordinator(&AgentStoreMock{}, agent.NewClient())
		_, err := coord.GetSuggestions(ctx, "spc_1", "", &SuggestionRequest{})
		if err == nil || errors.KindOf(err) != errors.Invalid {
			t.Fatalf("expected Invalid kind for empty purpose, got %v", err)
		}
	})

	t.Run("Registered processor success", func(t *testing.T) {
		coord := NewCoordinator(&AgentStoreMock{}, agent.NewClient())
		procMock := &SuggestionProcessorMock{
			ProcessSuggestionsFunc: func(ctx context.Context, spaceID string, req *SuggestionRequest) (map[string]any, error) {
				return map[string]any{"confidence": 0.95}, nil
			},
		}

		coord.RegisterSuggestionProcessor("invoice_parser", procMock)
		res, err := coord.GetSuggestions(ctx, "spc_1", "invoice_parser", &SuggestionRequest{TextContent: "invoice #123"})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if res["confidence"] != 0.95 {
			t.Errorf("expected confidence 0.95, got %v", res["confidence"])
		}
	})

	t.Run("Registered processor returns error", func(t *testing.T) {
		coord := NewCoordinator(&AgentStoreMock{}, agent.NewClient())
		procMock := &SuggestionProcessorMock{
			ProcessSuggestionsFunc: func(ctx context.Context, spaceID string, req *SuggestionRequest) (map[string]any, error) {
				return nil, errors.New("processing timeout")
			},
		}

		coord.RegisterSuggestionProcessor("invoice_parser", procMock)
		_, err := coord.GetSuggestions(ctx, "spc_1", "invoice_parser", &SuggestionRequest{})
		if err == nil {
			t.Fatal("expected error, got nil")
		}
	})
}

func TestCoordinator_Providers(t *testing.T) {
	ctx := context.Background()
	spaceID := "spc_1"
	provID := "prv_1"
	key := "key-123"

	t.Run("CreateProvider success and store error", func(t *testing.T) {
		mockStore := &AgentStoreMock{
			CreateProviderFunc: func(ctx context.Context, sid string, name string, mode agent.CompatibilityMode, url *string, key *string) (*agent.LLMProvider, error) {
				return &agent.LLMProvider{ID: provID, SpaceID: sid, Name: name}, nil
			},
		}
		coord := NewCoordinator(mockStore, agent.NewClient())
		p, err := coord.CreateProvider(ctx, &CreateProviderRequest{
			SpaceID: spaceID,
			Name:    "Anthropic",
		})
		if err != nil || p.ID != provID {
			t.Fatalf("unexpected create provider: %v, %v", p, err)
		}

		// Store error
		mockStore.CreateProviderFunc = func(ctx context.Context, sid string, name string, mode agent.CompatibilityMode, url *string, key *string) (*agent.LLMProvider, error) {
			return nil, errors.New("db error")
		}
		_, err = coord.CreateProvider(ctx, &CreateProviderRequest{SpaceID: spaceID, Name: "Anthropic"})
		if err == nil {
			t.Fatal("expected error, got nil")
		}
	})

	t.Run("GetProvider success and store error", func(t *testing.T) {
		mockStore := &AgentStoreMock{
			GetProviderFunc: func(ctx context.Context, q agent.GetLLMProvider) (*agent.LLMProvider, error) {
				return &agent.LLMProvider{ID: q.ID, SpaceID: q.SpaceID, Name: "OpenAI"}, nil
			},
		}
		coord := NewCoordinator(mockStore, agent.NewClient())
		p, err := coord.GetProvider(ctx, spaceID, provID)
		if err != nil || p.ID != provID {
			t.Fatalf("unexpected get provider: %v, %v", p, err)
		}

		mockStore.GetProviderFunc = func(ctx context.Context, q agent.GetLLMProvider) (*agent.LLMProvider, error) {
			return nil, errors.New("query failed")
		}
		_, err = coord.GetProvider(ctx, spaceID, provID)
		if err == nil {
			t.Fatal("expected error, got nil")
		}
	})

	t.Run("ListProviders error", func(t *testing.T) {
		mockStore := &AgentStoreMock{
			ListProvidersFunc: func(ctx context.Context, sid string) ([]*agent.LLMProvider, error) {
				return nil, errors.New("list error")
			},
		}
		coord := NewCoordinator(mockStore, agent.NewClient())
		_, err := coord.ListProviders(ctx, spaceID)
		if err == nil {
			t.Fatal("expected error, got nil")
		}
	})

	t.Run("UpdateProvider validation, not found, store error, and success", func(t *testing.T) {
		coord := NewCoordinator(&AgentStoreMock{}, agent.NewClient())
		_, err := coord.UpdateProvider(ctx, nil)
		if err == nil || errors.KindOf(err) != errors.Invalid {
			t.Fatalf("expected Invalid for nil req, got %v", err)
		}

		mockStore := &AgentStoreMock{
			UpdateProviderFunc: func(ctx context.Context, sid string, id string, name string, url *string, key *string) (*agent.LLMProvider, error) {
				return nil, errors.E("store.UpdateProvider", errors.NotExist, "not found")
			},
		}
		coord = NewCoordinator(mockStore, agent.NewClient())
		_, err = coord.UpdateProvider(ctx, &UpdateProviderRequest{SpaceID: spaceID, ID: provID, Name: "New Name"})
		if err == nil || errors.KindOf(err) != errors.NotExist {
			t.Fatalf("expected NotExist for missing provider, got %v", err)
		}

		mockStore.UpdateProviderFunc = func(ctx context.Context, sid string, id string, name string, url *string, key *string) (*agent.LLMProvider, error) {
			return nil, errors.New("db failure")
		}
		_, err = coord.UpdateProvider(ctx, &UpdateProviderRequest{SpaceID: spaceID, ID: provID, Name: "New Name"})
		if err == nil {
			t.Fatal("expected error, got nil")
		}

		mockStore.UpdateProviderFunc = func(ctx context.Context, sid string, id string, name string, url *string, key *string) (*agent.LLMProvider, error) {
			return &agent.LLMProvider{ID: id, SpaceID: sid, Name: name}, nil
		}
		p, err := coord.UpdateProvider(ctx, &UpdateProviderRequest{SpaceID: spaceID, ID: provID, Name: "Updated Name", APIKey: &key})
		if err != nil || p.Name != "Updated Name" {
			t.Fatalf("unexpected result: %v, %v", p, err)
		}
	})

	t.Run("DeleteProvider not found, store error, and success", func(t *testing.T) {
		mockStore := &AgentStoreMock{
			DeleteProviderFunc: func(ctx context.Context, sid string, id string) error {
				return errors.E("store.DeleteProvider", errors.NotExist, "not found")
			},
		}
		coord := NewCoordinator(mockStore, agent.NewClient())
		err := coord.DeleteProvider(ctx, spaceID, provID)
		if err == nil || errors.KindOf(err) != errors.NotExist {
			t.Fatalf("expected NotExist for missing provider, got %v", err)
		}

		mockStore.DeleteProviderFunc = func(ctx context.Context, sid string, id string) error {
			return errors.New("db delete error")
		}
		err = coord.DeleteProvider(ctx, spaceID, provID)
		if err == nil {
			t.Fatal("expected error, got nil")
		}

		mockStore.DeleteProviderFunc = func(ctx context.Context, sid string, id string) error {
			return nil
		}
		err = coord.DeleteProvider(ctx, spaceID, provID)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})
}

func TestCoordinator_Agents(t *testing.T) {
	ctx := context.Background()
	spaceID := "spc_1"
	agentID := "agt_1"

	t.Run("CreateAgent validation and errors", func(t *testing.T) {
		coord := NewCoordinator(&AgentStoreMock{}, agent.NewClient())
		_, err := coord.CreateAgent(ctx, nil)
		if err == nil || errors.KindOf(err) != errors.Invalid {
			t.Fatalf("expected Invalid for nil req, got %v", err)
		}

		_, err = coord.CreateAgent(ctx, &CreateAgentRequest{SpaceID: spaceID, Name: ""})
		if err == nil || errors.KindOf(err) != errors.Invalid {
			t.Fatalf("expected Invalid for empty name, got %v", err)
		}

		_, err = coord.CreateAgent(ctx, &CreateAgentRequest{SpaceID: spaceID, Name: "Agent", Purpose: ""})
		if err == nil || errors.KindOf(err) != errors.Invalid {
			t.Fatalf("expected Invalid for empty purpose, got %v", err)
		}

		mockStore := &AgentStoreMock{
			GetAgentFunc: func(ctx context.Context, q agent.GetAgent) (*agent.Agent, error) {
				return nil, errors.New("store query error")
			},
		}
		coord = NewCoordinator(mockStore, agent.NewClient())
		_, err = coord.CreateAgent(ctx, &CreateAgentRequest{SpaceID: spaceID, Name: "Agent", Purpose: "PURPOSE_1"})
		if err == nil {
			t.Fatal("expected error from store lookup, got nil")
		}

		mockStore.GetAgentFunc = func(ctx context.Context, q agent.GetAgent) (*agent.Agent, error) {
			return nil, errors.E("store.GetAgent", errors.NotExist, "not found")
		}
		mockStore.CreateAgentFunc = func(ctx context.Context, sid string, provID *string, name string, desc *string, purpose string, tags []string, model string, prompt *string, temp float64) (*agent.Agent, error) {
			return nil, errors.New("store create error")
		}
		_, err = coord.CreateAgent(ctx, &CreateAgentRequest{SpaceID: spaceID, Name: "Agent", Purpose: "PURPOSE_1"})
		if err == nil {
			t.Fatal("expected error from store create, got nil")
		}

		mockStore.CreateAgentFunc = func(ctx context.Context, sid string, provID *string, name string, desc *string, purpose string, tags []string, model string, prompt *string, temp float64) (*agent.Agent, error) {
			return &agent.Agent{ID: agentID, SpaceID: sid, Name: name, Purpose: purpose}, nil
		}
		a, err := coord.CreateAgent(ctx, &CreateAgentRequest{SpaceID: spaceID, Name: "Agent", Purpose: "PURPOSE_1"})
		if err != nil || a.ID != agentID {
			t.Fatalf("unexpected result: %v, %v", a, err)
		}
	})

	t.Run("GetAgent success, not found, store error", func(t *testing.T) {
		mockStore := &AgentStoreMock{
			GetAgentFunc: func(ctx context.Context, q agent.GetAgent) (*agent.Agent, error) {
				return nil, nil
			},
		}
		coord := NewCoordinator(mockStore, agent.NewClient())
		_, err := coord.GetAgent(ctx, spaceID, agentID)
		if err == nil || errors.KindOf(err) != errors.NotExist {
			t.Fatalf("expected NotExist for missing agent, got %v", err)
		}

		mockStore.GetAgentFunc = func(ctx context.Context, q agent.GetAgent) (*agent.Agent, error) {
			return nil, errors.New("db error")
		}
		_, err = coord.GetAgent(ctx, spaceID, agentID)
		if err == nil {
			t.Fatal("expected error, got nil")
		}

		mockStore.GetAgentFunc = func(ctx context.Context, q agent.GetAgent) (*agent.Agent, error) {
			return &agent.Agent{ID: q.ID, SpaceID: q.SpaceID, Name: "Agent 1"}, nil
		}
		a, err := coord.GetAgent(ctx, spaceID, agentID)
		if err != nil || a.ID != agentID {
			t.Fatalf("unexpected agent: %v, %v", a, err)
		}
	})

	t.Run("ListAgents success and error", func(t *testing.T) {
		mockStore := &AgentStoreMock{
			ListAgentsFunc: func(ctx context.Context, sid string) ([]*agent.Agent, error) {
				return []*agent.Agent{{ID: agentID, SpaceID: sid}}, nil
			},
		}
		coord := NewCoordinator(mockStore, agent.NewClient())
		list, err := coord.ListAgents(ctx, spaceID)
		if err != nil || len(list) != 1 {
			t.Fatalf("unexpected list: %v, %v", list, err)
		}

		mockStore.ListAgentsFunc = func(ctx context.Context, sid string) ([]*agent.Agent, error) {
			return nil, errors.New("list error")
		}
		_, err = coord.ListAgents(ctx, spaceID)
		if err == nil {
			t.Fatal("expected error, got nil")
		}
	})

	t.Run("UpdateAgent validation, not found, store error, and success", func(t *testing.T) {
		coord := NewCoordinator(&AgentStoreMock{}, agent.NewClient())
		_, err := coord.UpdateAgent(ctx, nil)
		if err == nil || errors.KindOf(err) != errors.Invalid {
			t.Fatalf("expected Invalid for nil req, got %v", err)
		}

		mockStore := &AgentStoreMock{
			UpdateAgentFunc: func(ctx context.Context, sid string, id string, provID *string, name string, desc *string, tags []string, model string, prompt *string, temp float64, isEnabled bool) (*agent.Agent, error) {
				return nil, errors.E("store.UpdateAgent", errors.NotExist, "not found")
			},
		}
		coord = NewCoordinator(mockStore, agent.NewClient())
		_, err = coord.UpdateAgent(ctx, &UpdateAgentRequest{SpaceID: spaceID, ID: agentID})
		if err == nil || errors.KindOf(err) != errors.NotExist {
			t.Fatalf("expected NotExist for missing agent, got %v", err)
		}

		mockStore.UpdateAgentFunc = func(ctx context.Context, sid string, id string, provID *string, name string, desc *string, tags []string, model string, prompt *string, temp float64, isEnabled bool) (*agent.Agent, error) {
			return nil, errors.New("update error")
		}
		_, err = coord.UpdateAgent(ctx, &UpdateAgentRequest{SpaceID: spaceID, ID: agentID})
		if err == nil {
			t.Fatal("expected error, got nil")
		}

		mockStore.UpdateAgentFunc = func(ctx context.Context, sid string, id string, provID *string, name string, desc *string, tags []string, model string, prompt *string, temp float64, isEnabled bool) (*agent.Agent, error) {
			return &agent.Agent{ID: id, SpaceID: sid, Name: name, IsEnabled: isEnabled}, nil
		}
		a, err := coord.UpdateAgent(ctx, &UpdateAgentRequest{SpaceID: spaceID, ID: agentID, Name: "Updated Agent", IsEnabled: true})
		if err != nil || a.Name != "Updated Agent" {
			t.Fatalf("unexpected updated agent: %v, %v", a, err)
		}
	})

	t.Run("DeleteAgent not found, store error, and success", func(t *testing.T) {
		mockStore := &AgentStoreMock{
			DeleteAgentFunc: func(ctx context.Context, sid string, id string) error {
				return errors.E("store.DeleteAgent", errors.NotExist, "not found")
			},
		}
		coord := NewCoordinator(mockStore, agent.NewClient())
		err := coord.DeleteAgent(ctx, spaceID, agentID)
		if err == nil || errors.KindOf(err) != errors.NotExist {
			t.Fatalf("expected NotExist for missing agent, got %v", err)
		}

		mockStore.DeleteAgentFunc = func(ctx context.Context, sid string, id string) error {
			return errors.New("delete error")
		}
		err = coord.DeleteAgent(ctx, spaceID, agentID)
		if err == nil {
			t.Fatal("expected error, got nil")
		}

		mockStore.DeleteAgentFunc = func(ctx context.Context, sid string, id string) error {
			return nil
		}
		err = coord.DeleteAgent(ctx, spaceID, agentID)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})
}

func TestCoordinator_ListRuns(t *testing.T) {
	ctx := context.Background()

	t.Run("Success", func(t *testing.T) {
		mockStore := &AgentStoreMock{
			ListRunsFunc: func(ctx context.Context, q agent.ListAgentRuns) (*paging.Page[*agent.AgentRun], error) {
				return &paging.Page[*agent.AgentRun]{
					Items: []*agent.AgentRun{{ID: "run_1"}},
				}, nil
			},
		}
		coord := NewCoordinator(mockStore, agent.NewClient())
		page, err := coord.ListRuns(ctx, agent.ListAgentRuns{SpaceID: "spc_1"})
		if err != nil || len(page.Items) != 1 {
			t.Fatalf("unexpected page: %v, %v", page, err)
		}
	})

	t.Run("Store error", func(t *testing.T) {
		mockStore := &AgentStoreMock{
			ListRunsFunc: func(ctx context.Context, q agent.ListAgentRuns) (*paging.Page[*agent.AgentRun], error) {
				return nil, errors.New("query failed")
			},
		}
		coord := NewCoordinator(mockStore, agent.NewClient())
		_, err := coord.ListRuns(ctx, agent.ListAgentRuns{SpaceID: "spc_1"})
		if err == nil {
			t.Fatal("expected error, got nil")
		}
	})
}

func TestCoordinator_ExecuteAgent_EdgeCases(t *testing.T) {
	ctx := context.Background()

	t.Run("Store GetAgent error", func(t *testing.T) {
		agent.RegisterAgent(agent.AgentDescriptor{
			Purpose: "TEST_LOOKUP_ERR",
		})
		mockStore := &AgentStoreMock{
			GetAgentFunc: func(ctx context.Context, q agent.GetAgent) (*agent.Agent, error) {
				return nil, errors.New("db lookup error")
			},
		}
		coord := NewCoordinator(mockStore, agent.NewClient())
		_, err := coord.ExecuteAgent(ctx, ExecutionRequest{
			SpaceID: "spc_1",
			Purpose: "TEST_LOOKUP_ERR",
		})
		if err == nil {
			t.Fatal("expected error from GetAgent, got nil")
		}
	})

	t.Run("Store GetProvider error", func(t *testing.T) {
		agent.RegisterAgent(agent.AgentDescriptor{
			Purpose: "TEST_PROV_ERR",
		})
		provID := "prv_err"
		mockStore := &AgentStoreMock{
			GetAgentFunc: func(ctx context.Context, q agent.GetAgent) (*agent.Agent, error) {
				return &agent.Agent{
					ID:            "agt_1",
					SpaceID:       "spc_1",
					LLMProviderID: &provID,
					Purpose:       "TEST_PROV_ERR",
				}, nil
			},
			GetProviderFunc: func(ctx context.Context, q agent.GetLLMProvider) (*agent.LLMProvider, error) {
				return nil, errors.New("load provider error")
			},
		}
		coord := NewCoordinator(mockStore, agent.NewClient())
		_, err := coord.ExecuteAgent(ctx, ExecutionRequest{
			SpaceID: "spc_1",
			Purpose: "TEST_PROV_ERR",
		})
		if err == nil {
			t.Fatal("expected error from GetProvider, got nil")
		}
	})

	t.Run("Prompt template parse error", func(t *testing.T) {
		agent.RegisterAgent(agent.AgentDescriptor{
			Purpose:               "BAD_PROMPT_PARSE",
			DefaultPromptTemplate: "{{.unclosed",
		})
		coord := NewCoordinator(&AgentStoreMock{}, agent.NewClient())
		_, err := coord.ExecuteAgent(ctx, ExecutionRequest{
			SpaceID: "spc_1",
			Purpose: "BAD_PROMPT_PARSE",
		})
		if err == nil || errors.CodeOf(err) != InvalidTemplate {
			t.Fatalf("expected InvalidTemplate error, got %v", err)
		}
	})

	t.Run("Prompt template execute error", func(t *testing.T) {
		agent.RegisterAgent(agent.AgentDescriptor{
			Purpose:               "BAD_PROMPT_EXEC",
			DefaultPromptTemplate: "{{call .bad}}",
		})
		coord := NewCoordinator(&AgentStoreMock{}, agent.NewClient())
		_, err := coord.ExecuteAgent(ctx, ExecutionRequest{
			SpaceID: "spc_1",
			Purpose: "BAD_PROMPT_EXEC",
			Params:  map[string]any{"bad": "not_callable"},
		})
		if err == nil || errors.CodeOf(err) != InvalidTemplate {
			t.Fatalf("expected InvalidTemplate error, got %v", err)
		}
	})

	t.Run("System instruction parse error", func(t *testing.T) {
		agent.RegisterAgent(agent.AgentDescriptor{
			Purpose:                  "BAD_SYS_PARSE",
			DefaultPromptTemplate:    "prompt",
			DefaultSystemInstruction: "{{.unclosed",
		})
		mockStore := &AgentStoreMock{
			GetAgentFunc: func(ctx context.Context, q agent.GetAgent) (*agent.Agent, error) {
				return nil, nil
			},
		}
		coord := NewCoordinator(mockStore, agent.NewClient())
		_, err := coord.ExecuteAgent(ctx, ExecutionRequest{
			SpaceID: "spc_1",
			Purpose: "BAD_SYS_PARSE",
		})
		if err == nil || errors.CodeOf(err) != InvalidTemplate {
			t.Fatalf("expected InvalidTemplate error, got %v", err)
		}
	})

	t.Run("System instruction execute error", func(t *testing.T) {
		agent.RegisterAgent(agent.AgentDescriptor{
			Purpose:                  "BAD_SYS_EXEC",
			DefaultPromptTemplate:    "prompt",
			DefaultSystemInstruction: "{{call .bad}}",
		})
		mockStore := &AgentStoreMock{
			GetAgentFunc: func(ctx context.Context, q agent.GetAgent) (*agent.Agent, error) {
				return nil, nil
			},
		}
		coord := NewCoordinator(mockStore, agent.NewClient())
		_, err := coord.ExecuteAgent(ctx, ExecutionRequest{
			SpaceID: "spc_1",
			Purpose: "BAD_SYS_EXEC",
			Params:  map[string]any{"bad": "not_callable"},
		})
		if err == nil || errors.CodeOf(err) != InvalidTemplate {
			t.Fatalf("expected InvalidTemplate error, got %v", err)
		}
	})

	t.Run("Schema template parse error", func(t *testing.T) {
		agent.RegisterAgent(agent.AgentDescriptor{
			Purpose:                "BAD_SCHEMA_PARSE",
			DefaultPromptTemplate:  "prompt",
			RequiredResponseSchema: "{{.unclosed",
		})
		mockStore := &AgentStoreMock{
			GetAgentFunc: func(ctx context.Context, q agent.GetAgent) (*agent.Agent, error) {
				return nil, nil
			},
		}
		coord := NewCoordinator(mockStore, agent.NewClient())
		_, err := coord.ExecuteAgent(ctx, ExecutionRequest{
			SpaceID: "spc_1",
			Purpose: "BAD_SCHEMA_PARSE",
		})
		if err == nil || errors.CodeOf(err) != InvalidTemplate {
			t.Fatalf("expected InvalidTemplate error, got %v", err)
		}
	})

	t.Run("Schema template execute error", func(t *testing.T) {
		agent.RegisterAgent(agent.AgentDescriptor{
			Purpose:                "BAD_SCHEMA_EXEC",
			DefaultPromptTemplate:  "prompt",
			RequiredResponseSchema: "{{call .bad}}",
		})
		mockStore := &AgentStoreMock{
			GetAgentFunc: func(ctx context.Context, q agent.GetAgent) (*agent.Agent, error) {
				return nil, nil
			},
		}
		coord := NewCoordinator(mockStore, agent.NewClient())
		_, err := coord.ExecuteAgent(ctx, ExecutionRequest{
			SpaceID: "spc_1",
			Purpose: "BAD_SCHEMA_EXEC",
			Params:  map[string]any{"bad": "not_callable"},
		})
		if err == nil || errors.CodeOf(err) != InvalidTemplate {
			t.Fatalf("expected InvalidTemplate error, got %v", err)
		}
	})

	t.Run("LogRun failure logs warning without aborting execution", func(t *testing.T) {
		agent.RegisterAgent(agent.AgentDescriptor{
			Purpose:               "LOG_RUN_FAILURE",
			DefaultPromptTemplate: "ok",
		})
		mockStore := &AgentStoreMock{
			GetAgentFunc: func(ctx context.Context, q agent.GetAgent) (*agent.Agent, error) {
				return &agent.Agent{
					ID:        "agt_log_fail",
					SpaceID:   "spc_1",
					Purpose:   "LOG_RUN_FAILURE",
					ModelName: "mock-model",
				}, nil
			},
			LogRunFunc: func(ctx context.Context, agentID string, spaceID string, status agent.AgentRunStatus, input string, output *string, errMsg *string, tokens int) (*agent.AgentRun, error) {
				return nil, errors.New("db disk full")
			},
		}
		coord := NewCoordinator(mockStore, agent.NewClient())
		// Model execution will fail because there is no live mock server, but it confirms LogRunFunc was reached
		_, err := coord.ExecuteAgent(ctx, ExecutionRequest{
			SpaceID: "spc_1",
			Purpose: "LOG_RUN_FAILURE",
		})
		if err == nil {
			t.Fatal("expected model execution error")
		}
		if len(mockStore.LogRunCalls()) != 1 {
			t.Errorf("expected LogRun to be called once, got %d", len(mockStore.LogRunCalls()))
		}
	})
}

func TestMapExecutionError(t *testing.T) {
	const op errors.Op = "test.MapExecutionError"

	if err := MapExecutionError(op, nil); err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}

	tests := []struct {
		name         string
		input        error
		expectedKind errors.Kind
		expectedCode errors.Code
	}{
		{"deadline exceeded", context.DeadlineExceeded, errors.Unavailable, ModelUnavailable},
		{"context canceled", context.Canceled, errors.Unavailable, ModelUnavailable},
		{"rate limit", errors.New("rate limit reached"), errors.Unavailable, ModelUnavailable},
		{"429 error", errors.New("http 429 too many requests"), errors.Unavailable, ModelUnavailable},
		{"503 error", errors.New("http 503 service unavailable"), errors.Unavailable, ModelUnavailable},
		{"unavailable message", errors.New("backend unavailable"), errors.Unavailable, ModelUnavailable},
		{"timeout error", errors.New("connection timeout"), errors.Unavailable, ModelUnavailable},
		{"connection refused", errors.New("dial tcp: connection refused"), errors.Unavailable, ModelUnavailable},
		{"connection reset", errors.New("read: connection reset by peer"), errors.Unavailable, ModelUnavailable},
		{"overloaded", errors.New("model is overloaded"), errors.Unavailable, ModelUnavailable},
		{"generic execution error", errors.New("internal model syntax failure"), errors.Internal, ModelExecutionFailed},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			mapped := MapExecutionError(op, tc.input)
			if mapped == nil {
				t.Fatal("expected non-nil error")
			}
			if errors.KindOf(mapped) != tc.expectedKind {
				t.Errorf("expected kind %v, got %v", tc.expectedKind, errors.KindOf(mapped))
			}
			if errors.CodeOf(mapped) != tc.expectedCode {
				t.Errorf("expected code %v, got %v", tc.expectedCode, errors.CodeOf(mapped))
			}
		})
	}
}

func TestLoggingCoordinator_Delegation(t *testing.T) {
	ctx := context.Background()
	logger := log.New()

	var getSuggestionsCalled, executeAgentCalled, registerProcessorCalled bool
	var createProviderCalled, getProviderCalled, listProvidersCalled bool
	var updateProviderCalled, deleteProviderCalled bool
	var createAgentCalled, getAgentCalled, listAgentsCalled bool
	var updateAgentCalled, deleteAgentCalled, listRunsCalled bool

	coordMock := &CoordinatorMock{
		GetSuggestionsFunc: func(ctx context.Context, spaceID string, purpose string, req *SuggestionRequest) (map[string]any, error) {
			getSuggestionsCalled = true
			return map[string]any{"ok": true}, nil
		},
		ExecuteAgentFunc: func(ctx context.Context, req ExecutionRequest) (string, error) {
			executeAgentCalled = true
			return "result", nil
		},
		RegisterSuggestionProcessorFunc: func(purpose string, processor SuggestionProcessor) {
			registerProcessorCalled = true
		},
		CreateProviderFunc: func(ctx context.Context, req *CreateProviderRequest) (*agent.LLMProvider, error) {
			createProviderCalled = true
			return &agent.LLMProvider{ID: "prv_1"}, nil
		},
		GetProviderFunc: func(ctx context.Context, spaceID string, id string) (*agent.LLMProvider, error) {
			getProviderCalled = true
			return &agent.LLMProvider{ID: id}, nil
		},
		ListProvidersFunc: func(ctx context.Context, spaceID string) ([]*agent.LLMProvider, error) {
			listProvidersCalled = true
			return []*agent.LLMProvider{{ID: "prv_1"}}, nil
		},
		UpdateProviderFunc: func(ctx context.Context, req *UpdateProviderRequest) (*agent.LLMProvider, error) {
			updateProviderCalled = true
			return &agent.LLMProvider{ID: req.ID}, nil
		},
		DeleteProviderFunc: func(ctx context.Context, spaceID string, id string) error {
			deleteProviderCalled = true
			return nil
		},
		CreateAgentFunc: func(ctx context.Context, req *CreateAgentRequest) (*agent.Agent, error) {
			createAgentCalled = true
			return &agent.Agent{ID: "agt_1"}, nil
		},
		GetAgentFunc: func(ctx context.Context, spaceID string, id string) (*agent.Agent, error) {
			getAgentCalled = true
			return &agent.Agent{ID: id}, nil
		},
		ListAgentsFunc: func(ctx context.Context, spaceID string) ([]*agent.Agent, error) {
			listAgentsCalled = true
			return []*agent.Agent{{ID: "agt_1"}}, nil
		},
		UpdateAgentFunc: func(ctx context.Context, req *UpdateAgentRequest) (*agent.Agent, error) {
			updateAgentCalled = true
			return &agent.Agent{ID: req.ID}, nil
		},
		DeleteAgentFunc: func(ctx context.Context, spaceID string, id string) error {
			deleteAgentCalled = true
			return nil
		},
		ListRunsFunc: func(ctx context.Context, q agent.ListAgentRuns) (*paging.Page[*agent.AgentRun], error) {
			listRunsCalled = true
			return &paging.Page[*agent.AgentRun]{Items: []*agent.AgentRun{{ID: "run_1"}}}, nil
		},
	}

	logged := NewLoggingCoordinator(coordMock, logger)

	proc := &SuggestionProcessorMock{}
	logged.RegisterSuggestionProcessor("logged_purpose", proc)
	if !registerProcessorCalled {
		t.Error("expected RegisterSuggestionProcessor to be delegated")
	}

	res, err := logged.GetSuggestions(ctx, "spc_1", "logged_purpose", &SuggestionRequest{})
	if err != nil || res["ok"] != true || !getSuggestionsCalled {
		t.Fatalf("unexpected GetSuggestions: %v, %v", res, err)
	}

	execRes, err := logged.ExecuteAgent(ctx, ExecutionRequest{
		SpaceID: "spc_1",
		Purpose: "LOGGED_EXEC_AGENT",
	})
	if err != nil || execRes != "result" || !executeAgentCalled {
		t.Fatalf("unexpected ExecuteAgent: %v, %v", execRes, err)
	}

	p, err := logged.CreateProvider(ctx, &CreateProviderRequest{SpaceID: "spc_1", Name: "P1"})
	if err != nil || p.ID != "prv_1" || !createProviderCalled {
		t.Fatalf("unexpected CreateProvider: %v, %v", p, err)
	}

	p, err = logged.GetProvider(ctx, "spc_1", "prv_1")
	if err != nil || p.ID != "prv_1" || !getProviderCalled {
		t.Fatalf("unexpected GetProvider: %v, %v", p, err)
	}

	providers, err := logged.ListProviders(ctx, "spc_1")
	if err != nil || len(providers) != 1 || !listProvidersCalled {
		t.Fatalf("unexpected ListProviders: %v, %v", providers, err)
	}

	p, err = logged.UpdateProvider(ctx, &UpdateProviderRequest{SpaceID: "spc_1", ID: "prv_1", Name: "P1"})
	if err != nil || p.ID != "prv_1" || !updateProviderCalled {
		t.Fatalf("unexpected UpdateProvider: %v, %v", p, err)
	}

	err = logged.DeleteProvider(ctx, "spc_1", "prv_1")
	if err != nil || !deleteProviderCalled {
		t.Fatalf("unexpected DeleteProvider: %v", err)
	}

	a, err := logged.CreateAgent(ctx, &CreateAgentRequest{SpaceID: "spc_1", Name: "A1", Purpose: "NEW_PURPOSE"})
	if err != nil || a.ID != "agt_1" || !createAgentCalled {
		t.Fatalf("unexpected CreateAgent: %v, %v", a, err)
	}

	a, err = logged.GetAgent(ctx, "spc_1", "agt_1")
	if err != nil || a.ID != "agt_1" || !getAgentCalled {
		t.Fatalf("unexpected GetAgent: %v, %v", a, err)
	}

	agents, err := logged.ListAgents(ctx, "spc_1")
	if err != nil || len(agents) != 1 || !listAgentsCalled {
		t.Fatalf("unexpected ListAgents: %v, %v", agents, err)
	}

	a, err = logged.UpdateAgent(ctx, &UpdateAgentRequest{SpaceID: "spc_1", ID: "agt_1", Name: "A1"})
	if err != nil || a.ID != "agt_1" || !updateAgentCalled {
		t.Fatalf("unexpected UpdateAgent: %v, %v", a, err)
	}

	err = logged.DeleteAgent(ctx, "spc_1", "agt_1")
	if err != nil || !deleteAgentCalled {
		t.Fatalf("unexpected DeleteAgent: %v", err)
	}

	runs, err := logged.ListRuns(ctx, agent.ListAgentRuns{SpaceID: "spc_1"})
	if err != nil || len(runs.Items) != 1 || !listRunsCalled {
		t.Fatalf("unexpected ListRuns: %v, %v", runs, err)
	}
}

func TestLoggingCoordinator_ErrorDelegation(t *testing.T) {
	ctx := context.Background()
	logger := log.New()

	expectedErr := errors.New("delegated error")
	coordMock := &CoordinatorMock{
		GetSuggestionsFunc: func(ctx context.Context, spaceID string, purpose string, req *SuggestionRequest) (map[string]any, error) {
			return nil, expectedErr
		},
		ExecuteAgentFunc: func(ctx context.Context, req ExecutionRequest) (string, error) {
			return "", expectedErr
		},
		CreateProviderFunc: func(ctx context.Context, req *CreateProviderRequest) (*agent.LLMProvider, error) {
			return nil, expectedErr
		},
		GetProviderFunc: func(ctx context.Context, spaceID string, id string) (*agent.LLMProvider, error) {
			return nil, expectedErr
		},
		ListProvidersFunc: func(ctx context.Context, spaceID string) ([]*agent.LLMProvider, error) {
			return nil, expectedErr
		},
		UpdateProviderFunc: func(ctx context.Context, req *UpdateProviderRequest) (*agent.LLMProvider, error) {
			return nil, expectedErr
		},
		DeleteProviderFunc: func(ctx context.Context, spaceID string, id string) error {
			return expectedErr
		},
		CreateAgentFunc: func(ctx context.Context, req *CreateAgentRequest) (*agent.Agent, error) {
			return nil, expectedErr
		},
		GetAgentFunc: func(ctx context.Context, spaceID string, id string) (*agent.Agent, error) {
			return nil, expectedErr
		},
		ListAgentsFunc: func(ctx context.Context, spaceID string) ([]*agent.Agent, error) {
			return nil, expectedErr
		},
		UpdateAgentFunc: func(ctx context.Context, req *UpdateAgentRequest) (*agent.Agent, error) {
			return nil, expectedErr
		},
		DeleteAgentFunc: func(ctx context.Context, spaceID string, id string) error {
			return expectedErr
		},
		ListRunsFunc: func(ctx context.Context, q agent.ListAgentRuns) (*paging.Page[*agent.AgentRun], error) {
			return nil, expectedErr
		},
	}

	logged := NewLoggingCoordinator(coordMock, logger)

	if _, err := logged.GetSuggestions(ctx, "spc_1", "p", &SuggestionRequest{}); err != expectedErr {
		t.Errorf("expected %v, got %v", expectedErr, err)
	}
	if _, err := logged.ExecuteAgent(ctx, ExecutionRequest{SpaceID: "spc_1", Purpose: "p"}); err != expectedErr {
		t.Errorf("expected %v, got %v", expectedErr, err)
	}
	if _, err := logged.CreateProvider(ctx, &CreateProviderRequest{SpaceID: "spc_1", Name: "P1"}); err != expectedErr {
		t.Errorf("expected %v, got %v", expectedErr, err)
	}
	if _, err := logged.GetProvider(ctx, "spc_1", "prv_1"); err != expectedErr {
		t.Errorf("expected %v, got %v", expectedErr, err)
	}
	if _, err := logged.ListProviders(ctx, "spc_1"); err != expectedErr {
		t.Errorf("expected %v, got %v", expectedErr, err)
	}
	if _, err := logged.UpdateProvider(ctx, &UpdateProviderRequest{SpaceID: "spc_1", ID: "prv_1", Name: "P1"}); err != expectedErr {
		t.Errorf("expected %v, got %v", expectedErr, err)
	}
	if err := logged.DeleteProvider(ctx, "spc_1", "prv_1"); err != expectedErr {
		t.Errorf("expected %v, got %v", expectedErr, err)
	}
	if _, err := logged.CreateAgent(ctx, &CreateAgentRequest{SpaceID: "spc_1", Name: "A1", Purpose: "p"}); err != expectedErr {
		t.Errorf("expected %v, got %v", expectedErr, err)
	}
	if _, err := logged.GetAgent(ctx, "spc_1", "agt_1"); err != expectedErr {
		t.Errorf("expected %v, got %v", expectedErr, err)
	}
	if _, err := logged.ListAgents(ctx, "spc_1"); err != expectedErr {
		t.Errorf("expected %v, got %v", expectedErr, err)
	}
	if _, err := logged.UpdateAgent(ctx, &UpdateAgentRequest{SpaceID: "spc_1", ID: "agt_1", Name: "A1"}); err != expectedErr {
		t.Errorf("expected %v, got %v", expectedErr, err)
	}
	if err := logged.DeleteAgent(ctx, "spc_1", "agt_1"); err != expectedErr {
		t.Errorf("expected %v, got %v", expectedErr, err)
	}
	if _, err := logged.ListRuns(ctx, agent.ListAgentRuns{SpaceID: "spc_1"}); err != expectedErr {
		t.Errorf("expected %v, got %v", expectedErr, err)
	}
}
