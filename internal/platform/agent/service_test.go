package agent

import (
	"context"
	"testing"

	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

type stubPromptStore struct {
	getAgentFn      func(ctx context.Context, q GetAgent) (*Agent, error)
	getProviderFn   func(ctx context.Context, q GetLLMProvider) (*LLMProvider, error)
	listProvidersFn func(ctx context.Context, spaceID string) ([]*LLMProvider, error)
	logRunFn        func(ctx context.Context, agentID *string, spaceID string, status AgentRunStatus, input string, output *string, errMsg *string, tokens int) (*AgentRun, error)
}

func (s *stubPromptStore) GetAgent(ctx context.Context, q GetAgent) (*Agent, error) {
	return s.getAgentFn(ctx, q)
}

func (s *stubPromptStore) GetProvider(ctx context.Context, q GetLLMProvider) (*LLMProvider, error) {
	return s.getProviderFn(ctx, q)
}

func (s *stubPromptStore) ListProviders(ctx context.Context, spaceID string) ([]*LLMProvider, error) {
	return s.listProvidersFn(ctx, spaceID)
}

func (s *stubPromptStore) LogRun(ctx context.Context, agentID *string, spaceID string, status AgentRunStatus, input string, output *string, errMsg *string, tokens int) (*AgentRun, error) {
	return s.logRunFn(ctx, agentID, spaceID, status, input, output, errMsg, tokens)
}

func TestService_ExecutePrompt(t *testing.T) {
	mockKey := "mock-key"

	tests := []struct {
		name        string
		req         ExecutePromptRequest
		store       *stubPromptStore
		wantErr     bool
		wantErrKind errors.Kind
		wantModel   string
	}{
		{
			name:        "Missing model_name returns Invalid",
			req:         ExecutePromptRequest{SpaceID: "spc_1", Prompt: "hello"},
			store:       &stubPromptStore{},
			wantErr:     true,
			wantErrKind: errors.Invalid,
		},
		{
			name: "No provider configured returns FailedPrecondition",
			req:  ExecutePromptRequest{SpaceID: "spc_1", ModelName: new("gpt-4o"), Prompt: "hello"},
			store: &stubPromptStore{
				listProvidersFn: func(_ context.Context, _ string) ([]*LLMProvider, error) {
					return nil, nil
				},
			},
			wantErr:     true,
			wantErrKind: errors.Precondition,
		},
		{
			name: "Explicit model_name with default space provider succeeds",
			req:  ExecutePromptRequest{SpaceID: "spc_1", ModelName: new("gpt-4o"), Prompt: "hello"},
			store: &stubPromptStore{
				listProvidersFn: func(_ context.Context, _ string) ([]*LLMProvider, error) {
					return []*LLMProvider{{
						ID:                "prv_1",
						CompatibilityMode: ModeOpenAICompatible,
						APIKey:            &mockKey,
					}}, nil
				},
				logRunFn: func(_ context.Context, _ *string, _ string, _ AgentRunStatus, _ string, _ *string, _ *string, _ int) (*AgentRun, error) {
					return &AgentRun{ID: "run_1"}, nil
				},
			},
			wantModel: "gpt-4o",
		},
		{
			name: "Named agent supplies model_name and provider",
			req:  ExecutePromptRequest{SpaceID: "spc_1", AgentID: new("agt_1"), Prompt: "hello"},
			store: &stubPromptStore{
				getAgentFn: func(_ context.Context, _ GetAgent) (*Agent, error) {
					return &Agent{
						ID:            "agt_1",
						SpaceID:       "spc_1",
						LLMProviderID: new("prv_1"),
						ModelName:     "claude-sonnet-4",
					}, nil
				},
				getProviderFn: func(_ context.Context, _ GetLLMProvider) (*LLMProvider, error) {
					return &LLMProvider{
						ID:                "prv_1",
						CompatibilityMode: ModeAnthropicCompat,
						APIKey:            &mockKey,
					}, nil
				},
				logRunFn: func(_ context.Context, _ *string, _ string, _ AgentRunStatus, _ string, _ *string, _ *string, _ int) (*AgentRun, error) {
					return &AgentRun{ID: "run_2"}, nil
				},
			},
			wantModel: "claude-sonnet-4",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			svc := NewService(tc.store, NewClient())
			res, err := svc.ExecutePrompt(t.Context(), tc.req)
			if tc.wantErr {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				if tc.wantErrKind != 0 && errors.KindOf(err) != tc.wantErrKind {
					t.Fatalf("expected kind %v, got %v", tc.wantErrKind, errors.KindOf(err))
				}
				return
			}
			if err != nil {
				t.Fatalf("ExecutePrompt() unexpected error: %v", err)
			}
			if res.ModelName != tc.wantModel {
				t.Errorf("ModelName = %q, want %q", res.ModelName, tc.wantModel)
			}
		})
	}
}
