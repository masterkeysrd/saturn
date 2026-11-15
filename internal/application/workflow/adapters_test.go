package workflowapp

import (
	"context"
	"strings"
	"testing"

	"github.com/masterkeysrd/saturn/internal/domain/space"
	"github.com/masterkeysrd/saturn/internal/platform/agent"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/settings"
	"github.com/masterkeysrd/saturn/internal/platform/workflow"
)

type stubAgentRunner struct {
	fn func(ctx context.Context, req agent.ExecutePromptRequest) (*agent.ExecutePromptResult, error)
}

func (s *stubAgentRunner) ExecutePrompt(ctx context.Context, req agent.ExecutePromptRequest) (*agent.ExecutePromptResult, error) {
	return s.fn(ctx, req)
}

type stubSpaceReader struct {
	fn func(ctx context.Context, id space.SpaceID) (*space.Space, error)
}

func (s *stubSpaceReader) GetByID(ctx context.Context, id space.SpaceID) (*space.Space, error) {
	return s.fn(ctx, id)
}

type stubSettingsStore struct {
	records map[string]settings.RawRecord
}

func (s *stubSettingsStore) GetRaw(_ context.Context, _ settings.ScopeType, scopeID, namespace string) (*settings.RawRecord, error) {
	if r, ok := s.records[namespace+":"+scopeID]; ok {
		return &r, nil
	}
	return nil, errors.E(errors.NotExist, "not found")
}

func (s *stubSettingsStore) SaveRaw(_ context.Context, _ *settings.RawRecord) error {
	return nil
}

func (s *stubSettingsStore) SetRaw(_ context.Context, rec *settings.RawRecord) (*settings.RawRecord, error) {
	return rec, nil
}

func (s *stubSettingsStore) DeleteRaw(_ context.Context, _ settings.ScopeType, _, _ string) error {
	return nil
}

func TestWorkflowAdapters(t *testing.T) {
	t.Run("NewAgentExecutor", func(t *testing.T) {
		exec := NewAgentExecutor(&stubAgentRunner{
			fn: func(_ context.Context, req agent.ExecutePromptRequest) (*agent.ExecutePromptResult, error) {
				if !strings.Contains(req.Prompt, "receipt.txt") || !strings.Contains(req.Prompt, "Coffee $4.50") {
					t.Errorf("expected text attachment in prompt, got %q", req.Prompt)
				}
				if !strings.Contains(req.ResponseSchema, `"vendor"`) {
					t.Errorf("expected serialized output_schema, got %q", req.ResponseSchema)
				}
				return &agent.ExecutePromptResult{
					Text:       `{"vendor":"Coffee"}`,
					TokensUsed: 55,
					AgentRunID: "run_1",
					ModelName:  "gemini-2.5-flash",
				}, nil
			},
		})

		res, err := exec.Execute(t.Context(), workflow.LLMRequest{
			SpaceID:      "spc_1",
			Prompt:       "Extract",
			Model:        &workflow.ModelConfig{AgentID: new("agt_1")},
			OutputSchema: map[string]any{"type": "object", "properties": map[string]any{"vendor": map[string]any{"type": "string"}}},
			Documents: []workflow.ResolvedArtifact{
				{Ref: "mail://m1/a1", Filename: "receipt.txt", ContentType: "text/plain", Data: []byte("Coffee $4.50")},
			},
		})
		if err != nil {
			t.Fatalf("Execute() error = %v", err)
		}
		if res.AgentRunID != "run_1" || res.TokensUsed != 55 {
			t.Errorf("unexpected LLMResponse: %+v", res)
		}
	})

	t.Run("NewSpaceContextLoader", func(t *testing.T) {
		loader := NewSpaceContextLoader(
			&stubSpaceReader{
				fn: func(_ context.Context, id space.SpaceID) (*space.Space, error) {
					return &space.Space{ID: id, Name: "Family"}, nil
				},
			},
			&stubSettingsStore{
				records: map[string]settings.RawRecord{
					"settings:spc_1": {Payload: []byte(`{"timezone":"America/Santo_Domingo"}`)},
					"finance:spc_1":  {Payload: []byte(`{"base_currency":"DOP"}`)},
				},
			},
		)

		sc, err := loader.Load(t.Context(), "spc_1")
		if err != nil {
			t.Fatalf("Load() error = %v", err)
		}
		if sc.Name != "Family" || sc.Timezone != "America/Santo_Domingo" || sc.DefaultCurrency != "DOP" {
			t.Errorf("unexpected SpaceContext: %+v", sc)
		}
	})
}
