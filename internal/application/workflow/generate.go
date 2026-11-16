package workflowapp

import (
	"context"
	"encoding/json/v2"
	"fmt"
	"strings"

	"github.com/masterkeysrd/saturn/internal/platform/ai"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/workflow"
)

type generatedFlowDraft struct {
	Name        string              `json:"name"`
	Description string              `json:"description"`
	InputSchema map[string]any      `json:"input_schema,omitempty"`
	Triggers    []workflow.Trigger  `json:"triggers,omitempty"`
	Steps       []workflow.StepNode `json:"steps"`
}

type generatedTriggerConfigSchema struct {
	Topic        *string        `json:"topic,omitempty"`
	Cron         *string        `json:"cron,omitempty"`
	Filter       *string        `json:"filter,omitempty"`
	InputMapping map[string]any `json:"input_mapping,omitempty"`
}

type generatedTriggerSchema struct {
	Name      string                        `json:"name"`
	Type      string                        `json:"type" jsonschema:"One of: event, webhook, schedule, manual"`
	IsEnabled bool                          `json:"is_enabled,omitempty"`
	Config    *generatedTriggerConfigSchema `json:"config,omitempty"`
}

type generatedNestedStepSchema struct {
	ID      string                            `json:"id"`
	Name    *string                           `json:"name,omitempty"`
	Type    string                            `json:"type"`
	OnError string                            `json:"on_error,omitempty" jsonschema:"One of: fail, continue"`
	Model   *workflow.ModelConfig             `json:"model,omitempty"`
	Sources map[string]workflow.SourceBinding `json:"sources,omitempty"`
	Inputs  map[string]any                    `json:"inputs,omitempty"`
}

type generatedSwitchCaseSchema struct {
	Name      string                      `json:"name"`
	Condition string                      `json:"condition"`
	Steps     []generatedNestedStepSchema `json:"steps,omitempty"`
}

type generatedStepSchema struct {
	ID      string                            `json:"id"`
	Name    *string                           `json:"name,omitempty"`
	Type    string                            `json:"type"`
	OnError string                            `json:"on_error,omitempty" jsonschema:"One of: fail, continue"`
	Model   *workflow.ModelConfig             `json:"model,omitempty"`
	Sources map[string]workflow.SourceBinding `json:"sources,omitempty"`
	Inputs  map[string]any                    `json:"inputs,omitempty"`
	Cases   []generatedSwitchCaseSchema       `json:"cases,omitempty"`
	Default []generatedNestedStepSchema       `json:"default,omitempty"`
	Steps   []generatedNestedStepSchema       `json:"steps,omitempty"`
}

type generatedFlowSchema struct {
	Name        string                   `json:"name"`
	Description string                   `json:"description,omitempty"`
	InputSchema map[string]any           `json:"input_schema,omitempty"`
	Triggers    []generatedTriggerSchema `json:"triggers,omitempty"`
	Steps       []generatedStepSchema    `json:"steps"`
}

var generatedFlowOutputSchema = workflow.SchemaFor[generatedFlowSchema]()

// GenerateFlow translates a natural-language prompt into a validated, unsaved Flow draft using the Catalog.
func (c *coordinator) GenerateFlow(ctx context.Context, req *GenerateFlowRequest) (*workflow.Flow, error) {
	const op errors.Op = "application/workflow.GenerateFlow"

	spaceID, err := requireWriteAccess(ctx, op)
	if err != nil {
		return nil, err
	}
	if req == nil || strings.TrimSpace(req.Prompt) == "" {
		return nil, errors.E(op, errors.Invalid, "prompt is required")
	}

	catalog := c.workflow.Catalog()
	catalogBytes, err := json.Marshal(catalog, json.Deterministic(true))
	if err != nil {
		return nil, errors.E(op, errors.Internal, fmt.Errorf("marshal workflow catalog: %w", err))
	}

	systemPrompt := buildGenerateSystemPrompt(string(catalogBytes))
	userPrompt := strings.TrimSpace(req.Prompt)
	modelID, role, genCfg := convertWorkflowModelConfig(req.Model)

	var lastValidationErr error
	for attempt := range 2 {
		prompt := userPrompt
		if attempt > 0 && lastValidationErr != nil {
			prompt = fmt.Sprintf("%s\n\nPrevious draft failed validation with error: %v\nFix the JSON definition so all CEL expressions, step IDs, sources, and schemas are valid.", userPrompt, lastValidationErr)
		}

		run, err := c.aiRunner.Generate(ctx, ai.GenerateRequest{
			SpaceID:           spaceID,
			Source:            ai.RunSourceWorkflow,
			SystemInstruction: new(systemPrompt),
			Prompt:            prompt,
			ModelID:           modelID,
			Role:              role,
			Generation:        genCfg,
			OutputSchema:      generatedFlowOutputSchema,
		})
		if err != nil {
			return nil, errors.E(op, err)
		}

		var rawText string
		if run != nil && run.Output != nil {
			if run.Output.Text != nil {
				rawText = *run.Output.Text
			} else if len(run.Output.Data) > 0 {
				if dataBytes, mErr := json.Marshal(run.Output.Data); mErr == nil {
					rawText = string(dataBytes)
				}
			}
		}

		draft, err := parseGeneratedFlowDraft(rawText)
		if err != nil {
			lastValidationErr = err
			continue
		}

		flow := &workflow.Flow{
			SpaceID:     spaceID,
			IsSystem:    false,
			IsEnabled:   true,
			Name:        strings.TrimSpace(draft.Name),
			Description: strings.TrimSpace(draft.Description),
			InputSchema: draft.InputSchema,
			Triggers:    draft.Triggers,
			Steps:       draft.Steps,
			Version:     1,
		}
		for i := range flow.Triggers {
			flow.Triggers[i].SpaceID = spaceID
		}
		if req.Model != nil {
			flow.Config.DefaultModel = req.Model
		}

		if valErr := c.workflow.ValidateFlow(flow); valErr != nil {
			lastValidationErr = valErr
			continue
		}
		return flow, nil
	}

	return nil, errors.E(op, errors.Invalid, errors.Code("WORKFLOW_VALIDATION_FAILED"), lastValidationErr)
}

func buildGenerateSystemPrompt(catalogJSON string) string {
	return fmt.Sprintf(`You are Saturn's Workflow Architect. Generate a valid, flat-first Saturn Workflow JSON object matching the output schema.

Rules:
1. Only use registered trigger topics, step types, data loaders, and CEL helpers from the catalog below.
2. Each StepNode id must match [a-zA-Z_][a-zA-Z0-9_]* and be unique across the flow.
3. Use "{{ ... }}" CEL templates for dynamic bindings. Only reference upstream steps.<id> and step-local sources.<alias> declared in that step's sources map.
4. For llm.generate and ai.agent_run steps returning structured data, always provide standard JSON Schema in inputs.output_schema (never use custom x-saturn-* extensions).
5. Trigger types are: "event" (requires config.topic), "schedule" (requires config.cron), "webhook", or "manual".

Catalog:
%s`, catalogJSON)
}

func parseGeneratedFlowDraft(raw string) (*generatedFlowDraft, error) {
	clean := workflow.StripMarkdownCodeFence(raw)
	var draft generatedFlowDraft
	if err := json.Unmarshal([]byte(clean), &draft); err != nil {
		return nil, fmt.Errorf("parse generated workflow JSON: %w", err)
	}
	return &draft, nil
}
