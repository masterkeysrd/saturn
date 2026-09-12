package agentapp

import (
	"context"
	"fmt"
	"testing"

	"github.com/masterkeysrd/saturn/internal/platform/agent"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/log"
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
