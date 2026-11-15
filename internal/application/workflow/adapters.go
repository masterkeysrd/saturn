package workflowapp

import (
	"context"
	"encoding/json/v2"
	"fmt"
	"strings"
	"unicode/utf8"

	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/domain/space"
	"github.com/masterkeysrd/saturn/internal/platform/agent"
	"github.com/masterkeysrd/saturn/internal/platform/pdf"
	"github.com/masterkeysrd/saturn/internal/platform/settings"
	"github.com/masterkeysrd/saturn/internal/platform/workflow"
)

type agentExecutorAdapter struct {
	runner AgentPromptRunner
}

// NewAgentExecutor adapts platform/agent.Service to workflow.AgentExecutor,
// formatting structured output schemas and extracting attachment text.
func NewAgentExecutor(runner AgentPromptRunner) workflow.AgentExecutor {
	return &agentExecutorAdapter{runner: runner}
}

func (a *agentExecutorAdapter) Execute(ctx context.Context, req workflow.LLMRequest) (*workflow.LLMResponse, error) {
	var responseSchema string
	if len(req.OutputSchema) > 0 {
		raw, err := json.Marshal(req.OutputSchema, json.Deterministic(true))
		if err != nil {
			return nil, fmt.Errorf("marshal output_schema: %w", err)
		}
		responseSchema = string(raw)
	}

	prompt := req.Prompt
	if len(req.Documents) > 0 {
		var docBuilder strings.Builder
		for _, doc := range req.Documents {
			docText := ""
			if strings.EqualFold(doc.ContentType, "application/pdf") || strings.HasSuffix(strings.ToLower(doc.Filename), ".pdf") {
				if extracted, err := pdf.ExtractText(doc.Data); err == nil {
					docText = extracted
				}
			} else if utf8.Valid(doc.Data) {
				docText = string(doc.Data)
			}
			if strings.TrimSpace(docText) != "" {
				fmt.Fprintf(&docBuilder, "\n\n--- Attachment: %s ---\n%s", doc.Filename, docText)
			}
		}
		if docBuilder.Len() > 0 {
			prompt += docBuilder.String()
		}
	}

	pReq := agent.ExecutePromptRequest{
		SpaceID:           req.SpaceID,
		SystemInstruction: req.SystemInstruction,
		Prompt:            prompt,
		ResponseSchema:    responseSchema,
	}
	if req.Model != nil {
		pReq.AgentID = req.Model.AgentID
		pReq.ProviderID = req.Model.ProviderID
		pReq.ModelName = req.Model.ModelName
		pReq.Temperature = req.Model.Temperature
	}

	res, err := a.runner.ExecutePrompt(ctx, pReq)
	if err != nil {
		return nil, err
	}

	return &workflow.LLMResponse{
		Text:       res.Text,
		TokensUsed: res.TokensUsed,
		AgentRunID: res.AgentRunID,
		ModelName:  res.ModelName,
	}, nil
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
