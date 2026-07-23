package agentapp

import (
	"bytes"
	"context"
	"fmt"
	"log/slog"
	"text/template"

	"github.com/masterkeysrd/saturn/internal/platform/agent"
)

// AgentStore abstracts database operations for retrieving configurations and logging runs.
type AgentStore interface {
	GetAgent(ctx context.Context, q agent.GetAgent) (*agent.Agent, error)
	GetProvider(ctx context.Context, q agent.GetLLMProvider) (*agent.LLMProvider, error)
	LogRun(ctx context.Context, agentID string, spaceID string, status agent.AgentRunStatus, input string, output *string, errMsg *string, tokens int) (*agent.AgentRun, error)

	CreateProvider(ctx context.Context, spaceID string, name string, mode agent.CompatibilityMode, url *string, key *string) (*agent.LLMProvider, error)
	ListProviders(ctx context.Context, spaceID string) ([]*agent.LLMProvider, error)
	UpdateProvider(ctx context.Context, spaceID string, id string, name string, url *string, key *string) (*agent.LLMProvider, error)
	DeleteProvider(ctx context.Context, spaceID string, id string) error

	CreateAgent(ctx context.Context, spaceID string, providerID *string, name string, desc *string, purpose string, tags []string, model string, prompt *string, temp float64) (*agent.Agent, error)
	ListAgents(ctx context.Context, spaceID string) ([]*agent.Agent, error)
	UpdateAgent(ctx context.Context, spaceID string, id string, providerID *string, name string, desc *string, tags []string, model string, prompt *string, temp float64, isEnabled bool) (*agent.Agent, error)
	DeleteAgent(ctx context.Context, spaceID string, id string) error

	ListRuns(ctx context.Context, q agent.ListAgentRuns) ([]*agent.AgentRun, error)
}

// Coordinator orchestrates AI agent blueprints, LLM providers, and audit runs.
type Coordinator struct {
	store  AgentStore
	client *agent.Client
}

// NewCoordinator creates a new Agent Coordinator instance.
func NewCoordinator(store AgentStore, client *agent.Client) *Coordinator {
	return &Coordinator{
		store:  store,
		client: client,
	}
}

// ExecutionRequest defines options for running an agent with parameters.
type ExecutionRequest struct {
	SpaceID string
	Purpose string
	Params  map[string]any
}

// ExecuteAgent resolves and runs the active agent configured for a specific workspace and purpose.
// If no database agent is configured, it falls back to the native Gemini system default from the catalog.
func (c *Coordinator) ExecuteAgent(ctx context.Context, req ExecutionRequest) (string, error) {
	// Find the system blueprint from the catalog first to verify the purpose
	var descriptor *agent.AgentDescriptor
	for _, desc := range agent.GetAgentCatalog() {
		if desc.Purpose == req.Purpose {
			descriptor = &desc
			break
		}
	}
	if descriptor == nil {
		return "", fmt.Errorf("unsupported agent purpose: %q", req.Purpose)
	}

	// 1. Compile Prompt Template
	promptTemplate := descriptor.DefaultPromptTemplate
	if promptTemplate == "" {
		promptTemplate = "{{.email_body}}"
	}
	tmplPrompt, err := template.New("prompt").Parse(promptTemplate)
	if err != nil {
		return "", fmt.Errorf("parse prompt template: %w", err)
	}
	var bufPrompt bytes.Buffer
	if err := tmplPrompt.Execute(&bufPrompt, req.Params); err != nil {
		return "", fmt.Errorf("execute prompt template: %w", err)
	}
	prompt := bufPrompt.String()

	// Read workspace active agent from storage
	a, err := c.store.GetAgent(ctx, agent.GetAgent{SpaceID: req.SpaceID, Purpose: req.Purpose})
	if err != nil {
		return "", fmt.Errorf("lookup workspace agent: %w", err)
	}

	var providerMode agent.CompatibilityMode = agent.ModeGeminiNative
	var apiURL string
	var apiKey string
	var modelName string = "gemini-2.5-flash"
	var temperature float64 = 0.0
	var agentID string

	// Resolve the raw system instruction to compile
	rawSystemInstruction := descriptor.DefaultSystemInstruction
	if a != nil {
		agentID = a.ID
		modelName = a.ModelName
		temperature = a.Temperature

		if a.SystemInstruction != nil && *a.SystemInstruction != "" {
			rawSystemInstruction = *a.SystemInstruction
		}

		// Resolve referenced LLM provider connection
		if a.LLMProviderID != nil {
			prov, err := c.store.GetProvider(ctx, agent.GetLLMProvider{SpaceID: req.SpaceID, ID: *a.LLMProviderID})
			if err != nil {
				return "", fmt.Errorf("load agent provider: %w", err)
			}
			if prov != nil {
				providerMode = prov.CompatibilityMode
				if prov.APIUrl != nil {
					apiURL = *prov.APIUrl
				}
				if prov.APIKey != nil {
					apiKey = *prov.APIKey
				}
			}
		}
	}

	// 2. Compile System Instruction Template
	var systemInstruction string
	if rawSystemInstruction != "" {
		tmplSys, err := template.New("system").Parse(rawSystemInstruction)
		if err != nil {
			return "", fmt.Errorf("parse system template: %w", err)
		}
		var bufSys bytes.Buffer
		if err := tmplSys.Execute(&bufSys, req.Params); err != nil {
			return "", fmt.Errorf("execute system template: %w", err)
		}
		systemInstruction = bufSys.String()
	}

	// 3. Compile Response Schema Template
	var responseSchema string
	if descriptor.RequiredResponseSchema != "" {
		tmplSchema, err := template.New("schema").Parse(descriptor.RequiredResponseSchema)
		if err != nil {
			return "", fmt.Errorf("parse schema template: %w", err)
		}
		var bufSchema bytes.Buffer
		if err := tmplSchema.Execute(&bufSchema, req.Params); err != nil {
			return "", fmt.Errorf("execute schema template: %w", err)
		}
		responseSchema = bufSchema.String()
	}

	// Dispatch request to platform client
	slog.Info("[Agent Coordinator.ExecuteAgent] Executing agent request",
		"space_id", req.SpaceID,
		"purpose", req.Purpose,
		"model_name", modelName,
		"provider_mode", providerMode,
		"prompt_len", len(prompt),
	)

	resp, err := c.client.Execute(ctx, agent.ExecutionRequest{
		CompatibilityMode: providerMode,
		APIUrl:            apiURL,
		APIKey:            apiKey,
		ModelName:         modelName,
		SystemInstruction: systemInstruction,
		Prompt:            prompt,
		Temperature:       temperature,
		ResponseSchema:    responseSchema,
	})

	// Log execution run to audit table if an active database agent is registered
	if agentID != "" {
		status := agent.RunSuccess
		var errMsg *string
		var output *string
		if err != nil {
			status = agent.RunFailed
			msg := err.Error()
			errMsg = &msg
		} else {
			output = &resp.Text
		}
		_, logErr := c.store.LogRun(ctx, agentID, req.SpaceID, status, prompt, output, errMsg, resp.TokensUsed)
		if logErr != nil {
			fmt.Printf("[Agent Coordinator] Warning: failed to log run execution: %v\n", logErr)
		}
	}

	if err != nil {
		slog.Error("[Agent Coordinator.ExecuteAgent] Agent execution failed",
			"space_id", req.SpaceID,
			"purpose", req.Purpose,
			"error", err,
		)
		return "", fmt.Errorf("execute agent: %w", err)
	}

	slog.Info("[Agent Coordinator.ExecuteAgent] Agent execution succeeded",
		"space_id", req.SpaceID,
		"purpose", req.Purpose,
		"tokens_used", resp.TokensUsed,
		"response", resp.Text,
	)

	return resp.Text, nil
}

// GetStore exposes the database store abstraction.
func (c *Coordinator) GetStore() AgentStore {
	return c.store
}
