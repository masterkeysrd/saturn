package workflowapp

import (
	"context"
	"strings"

	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/domain/space"
	"github.com/masterkeysrd/saturn/internal/platform/ai"
	"github.com/masterkeysrd/saturn/internal/platform/settings"
	"github.com/masterkeysrd/saturn/internal/platform/workflow"
)

type agentExecutorAdapter struct {
	runner AIRunner
}

// NewAgentExecutor adapts platform/ai.Runtime to workflow.AgentExecutor,
// supporting both `llm.generate` (with inline attachments) and `ai.agent_run`.
func NewAgentExecutor(runner AIRunner) workflow.AgentExecutor {
	return &agentExecutorAdapter{runner: runner}
}

func (a *agentExecutorAdapter) Execute(ctx context.Context, req workflow.LLMRequest) (*workflow.LLMResponse, error) {
	atts := make([]ai.TurnAttachment, 0, len(req.Documents))
	for _, doc := range req.Documents {
		ct := strings.TrimSpace(doc.ContentType)
		if ct == "" {
			ct = "text/plain"
		}
		atts = append(atts, ai.TurnAttachment{
			Filename:    doc.Filename,
			ContentType: ct,
			Data:        doc.Data,
		})
	}

	var sysPtr *string
	if strings.TrimSpace(req.SystemInstruction) != "" {
		sysPtr = new(req.SystemInstruction)
	}
	var flowRunIDPtr *string
	if strings.TrimSpace(req.FlowRunID) != "" {
		flowRunIDPtr = new(req.FlowRunID)
	}

	modelID, role, genCfg := convertWorkflowModelConfig(req.Model)
	run, err := a.runner.Generate(ctx, ai.GenerateRequest{
		SpaceID:           req.SpaceID,
		Source:            ai.RunSourceWorkflow,
		Prompt:            req.Prompt,
		SystemInstruction: sysPtr,
		ModelID:           modelID,
		Role:              role,
		Generation:        genCfg,
		OutputSchema:      req.OutputSchema,
		Attachments:       atts,
		FlowRunID:         flowRunIDPtr,
	})
	resp := runToWorkflowLLMResponse(run)
	if err != nil {
		return resp, err
	}
	return resp, nil
}

func (a *agentExecutorAdapter) ExecuteAgent(ctx context.Context, req workflow.AgentRunRequest) (*workflow.LLMResponse, error) {
	var flowRunIDPtr *string
	if strings.TrimSpace(req.FlowRunID) != "" {
		flowRunIDPtr = new(req.FlowRunID)
	}
	modelID, _, genCfg := convertWorkflowModelConfig(req.Model)
	run, err := a.runner.RunAgent(ctx, ai.RunAgentRequest{
		SpaceID:      req.SpaceID,
		AgentID:      req.AgentID,
		Source:       ai.RunSourceWorkflow,
		Prompt:       req.Prompt,
		Input:        req.Input,
		ModelID:      modelID,
		Generation:   genCfg,
		OutputSchema: req.OutputSchema,
		FlowRunID:    flowRunIDPtr,
	})
	resp := runToWorkflowLLMResponse(run)
	if err != nil {
		return resp, err
	}
	return resp, nil
}

func convertWorkflowModelConfig(mc *workflow.ModelConfig) (modelID *string, role *ai.ModelRole, gen *ai.GenerationConfig) {
	if mc == nil {
		return nil, nil, nil
	}
	if mc.ModelID != nil && strings.TrimSpace(*mc.ModelID) != "" {
		modelID = new(strings.TrimSpace(*mc.ModelID))
	}
	if mc.Role != nil && strings.TrimSpace(*mc.Role) != "" {
		role = new(ai.ModelRole(strings.TrimSpace(*mc.Role)))
	}
	if mc.Generation != nil {
		cfg := ai.GenerationConfig{
			Temperature: mc.Generation.Temperature,
			MaxTokens:   mc.Generation.MaxTokens,
			TopP:        mc.Generation.TopP,
		}
		if mc.Generation.Thinking != nil {
			cfg.Thinking = ai.ThinkingConfig{
				Enabled:      mc.Generation.Thinking.Enabled,
				Effort:       mc.Generation.Thinking.Effort,
				BudgetTokens: mc.Generation.Thinking.BudgetTokens,
			}
		}
		gen = &cfg
	}
	return modelID, role, gen
}

func runToWorkflowLLMResponse(run *ai.Run) *workflow.LLMResponse {
	if run == nil {
		return nil
	}
	resp := &workflow.LLMResponse{
		TokensUsed: int(run.Metrics.Tokens.Total),
		AIRunID:    run.ID,
	}
	if run.Input.ModelSnapshot != nil {
		resp.ModelName = run.Input.ModelSnapshot.ModelName
	}
	if run.Output != nil {
		if run.Output.Text != nil {
			resp.Text = *run.Output.Text
		}
		resp.ParsedJSON = run.Output.Data
	}
	return resp
}

// SpaceReader retrieves workspace metadata for SpaceContextLoader.
type SpaceReader interface {
	GetByID(ctx context.Context, id space.SpaceID) (*space.Space, error)
}

type spaceContextLoader struct {
	spaces          SpaceReader
	spaceSettings   *settings.Client[space.Settings]
	financeSettings *settings.Client[finance.Settings]
}

// NewSpaceContextLoader constructs a SpaceContextLoader reading workspace metadata, timezone, and base currency.
func NewSpaceContextLoader(spaces SpaceReader, settingsStore settings.Store) SpaceContextLoader {
	return &spaceContextLoader{
		spaces:          spaces,
		spaceSettings:   settings.Bind(settingsStore, space.SettingsKey),
		financeSettings: settings.Bind(settingsStore, finance.SettingsKey),
	}
}

func (l *spaceContextLoader) Load(ctx context.Context, spaceID string) (workflow.SpaceContext, error) {
	out := workflow.SpaceContext{
		ID:              spaceID,
		Timezone:        "UTC",
		DefaultCurrency: "USD",
	}

	if sp, err := l.spaces.GetByID(ctx, space.SpaceID(spaceID)); err == nil && sp != nil {
		out.Name = sp.Name
	}
	if sEntry, err := l.spaceSettings.Get(ctx, spaceID); err == nil && sEntry != nil && sEntry.Value.Timezone != "" {
		out.Timezone = sEntry.Value.Timezone
	}
	if fEntry, err := l.financeSettings.Get(ctx, spaceID); err == nil && fEntry != nil && fEntry.Value.BaseCurrency != "" {
		out.DefaultCurrency = string(fEntry.Value.BaseCurrency)
	}
	return out, nil
}
