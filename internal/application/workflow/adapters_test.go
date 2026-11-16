package workflowapp

import (
	"context"
	"testing"

	"github.com/masterkeysrd/saturn/internal/domain/space"
	"github.com/masterkeysrd/saturn/internal/platform/ai"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/settings"
	"github.com/masterkeysrd/saturn/internal/platform/workflow"
)

type stubAIRunner struct {
	genFn   func(ctx context.Context, req ai.GenerateRequest) (*ai.Run, error)
	agentFn func(ctx context.Context, req ai.RunAgentRequest) (*ai.Run, error)
}

func (s *stubAIRunner) Generate(ctx context.Context, req ai.GenerateRequest) (*ai.Run, error) {
	return s.genFn(ctx, req)
}

func (s *stubAIRunner) RunAgent(ctx context.Context, req ai.RunAgentRequest) (*ai.Run, error) {
	return s.agentFn(ctx, req)
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
	t.Run("NewAgentExecutor_LLMGenerate", func(t *testing.T) {
		exec := NewAgentExecutor(&stubAIRunner{
			genFn: func(_ context.Context, req ai.GenerateRequest) (*ai.Run, error) {
				if req.Source != ai.RunSourceWorkflow || req.FlowRunID == nil || *req.FlowRunID != "wfr_1" {
					t.Errorf("expected workflow source & flow_run_id, got %+v", req)
				}
				if len(req.Attachments) != 1 || req.Attachments[0].Filename != "receipt.txt" {
					t.Errorf("expected 1 attachment forwarded, got %+v", req.Attachments)
				}
				if req.Role == nil || *req.Role != ai.ModelRoleFast {
					t.Errorf("expected fast role, got %v", req.Role)
				}
				return &ai.Run{
					ID:     "air_1",
					Status: ai.RunCompleted,
					Input: ai.RunInput{
						ModelSnapshot: &ai.ModelSnapshot{ModelName: "gemini-2.5-flash"},
					},
					Output: &ai.RunOutput{
						Text: new(`{"vendor":"Coffee"}`),
						Data: map[string]any{"vendor": "Coffee"},
					},
					Metrics: ai.RunMetrics{
						Tokens: ai.TokenUsage{Total: 55},
					},
				}, nil
			},
		})

		res, err := exec.Execute(t.Context(), workflow.LLMRequest{
			SpaceID:      "spc_1",
			FlowRunID:    "wfr_1",
			Prompt:       "Extract",
			Model:        &workflow.ModelConfig{Role: new("fast")},
			OutputSchema: map[string]any{"type": "object", "properties": map[string]any{"vendor": map[string]any{"type": "string"}}},
			Documents: []workflow.ResolvedArtifact{
				{Ref: "mail://m1/a1", Filename: "receipt.txt", ContentType: "text/plain", Data: []byte("Coffee $4.50")},
			},
		})
		if err != nil {
			t.Fatalf("Execute() error = %v", err)
		}
		if res.AIRunID != "air_1" || res.TokensUsed != 55 || res.ParsedJSON["vendor"] != "Coffee" {
			t.Errorf("unexpected LLMResponse: %+v", res)
		}
	})

	t.Run("NewAgentExecutor_AIAgentRun", func(t *testing.T) {
		exec := NewAgentExecutor(&stubAIRunner{
			agentFn: func(_ context.Context, req ai.RunAgentRequest) (*ai.Run, error) {
				if req.AgentID != "system.saturn.assistant" || req.Source != ai.RunSourceWorkflow {
					t.Errorf("unexpected RunAgentRequest: %+v", req)
				}
				return &ai.Run{
					ID:      "air_agt_1",
					Status:  ai.RunCompleted,
					Output:  &ai.RunOutput{Text: new("Done")},
					Metrics: ai.RunMetrics{Tokens: ai.TokenUsage{Total: 90}},
				}, nil
			},
		})

		res, err := exec.ExecuteAgent(t.Context(), workflow.AgentRunRequest{
			SpaceID:   "spc_1",
			FlowRunID: "wfr_1",
			AgentID:   "system.saturn.assistant",
			Prompt:    "Check budget",
		})
		if err != nil {
			t.Fatalf("ExecuteAgent() error = %v", err)
		}
		if res.AIRunID != "air_agt_1" || res.TokensUsed != 90 || res.Text != "Done" {
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
