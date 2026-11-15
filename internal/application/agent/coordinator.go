package agentapp

import (
	"bytes"
	"context"
	"fmt"
	"strings"
	"text/template"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/agent"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/log"
	"github.com/masterkeysrd/saturn/internal/platform/paging"
)

//go:generate go run github.com/masterkeysrd/saturn/tools/mockgen .

// AgentStore abstracts database operations for retrieving configurations and logging runs.
// @Mock
type AgentStore interface {
	GetAgent(ctx context.Context, q agent.GetAgent) (*agent.Agent, error)
	GetProvider(ctx context.Context, q agent.GetLLMProvider) (*agent.LLMProvider, error)
	LogRun(ctx context.Context, agentID *string, spaceID string, status agent.AgentRunStatus, input string, output *string, errMsg *string, tokens int) (*agent.AgentRun, error)

	CreateProvider(ctx context.Context, spaceID string, name string, mode agent.CompatibilityMode, url *string, key *string) (*agent.LLMProvider, error)
	ListProviders(ctx context.Context, spaceID string) ([]*agent.LLMProvider, error)
	UpdateProvider(ctx context.Context, spaceID string, id string, name string, url *string, key *string) (*agent.LLMProvider, error)
	DeleteProvider(ctx context.Context, spaceID string, id string) error

	CreateAgent(ctx context.Context, spaceID string, providerID *string, name string, desc *string, purpose string, tags []string, model string, prompt *string, temp float64) (*agent.Agent, error)
	ListAgents(ctx context.Context, spaceID string) ([]*agent.Agent, error)
	UpdateAgent(ctx context.Context, spaceID string, id string, providerID *string, name string, desc *string, tags []string, model string, prompt *string, temp float64, isEnabled bool) (*agent.Agent, error)
	DeleteAgent(ctx context.Context, spaceID string, id string) error

	ListRuns(ctx context.Context, q agent.ListAgentRuns) (*paging.Page[*agent.AgentRun], error)
}

// ExecutePromptRequest defines inputs for executing an ad-hoc or agent-backed LLM prompt.
type ExecutePromptRequest struct {
	SpaceID           string
	AgentID           *string
	ProviderID        *string
	ModelName         *string
	Temperature       *float64
	SystemInstruction string
	Prompt            string
	ResponseSchema    string
}

// ExecutePromptResult holds the generated output and audit metadata from ExecutePrompt.
type ExecutePromptResult struct {
	Text       string
	TokensUsed int
	AgentRunID string
	ModelName  string
}

// ExecutionRequest defines options for running an agent with parameters.
type ExecutionRequest struct {
	SpaceID string
	Purpose string
	Params  map[string]any
}

// CreateProviderRequest contains parameters for configuring a new LLM provider.
type CreateProviderRequest struct {
	SpaceID           string
	Name              string
	CompatibilityMode agent.CompatibilityMode
	APIUrl            *string
	APIKey            *string
}

// UpdateProviderRequest contains parameters for modifying an existing LLM provider.
type UpdateProviderRequest struct {
	SpaceID string
	ID      string
	Name    string
	APIUrl  *string
	APIKey  *string
}

// CreateAgentRequest contains parameters for registering a new AI agent blueprint.
type CreateAgentRequest struct {
	SpaceID           string
	LLMProviderID     *string
	Name              string
	Description       *string
	Purpose           string
	Tags              []string
	ModelName         string
	SystemInstruction *string
	Temperature       float64
}

// UpdateAgentRequest contains parameters for updating an existing AI agent configuration.
type UpdateAgentRequest struct {
	SpaceID           string
	ID                string
	LLMProviderID     *string
	Name              string
	Description       *string
	Tags              []string
	ModelName         string
	SystemInstruction *string
	Temperature       float64
	IsEnabled         bool
}

//go:generate go run github.com/masterkeysrd/saturn/tools/loggen -target=Coordinator -component=agent

// Coordinator orchestrates AI agent blueprints, LLM providers, and audit runs.
// @Mock
type Coordinator interface {
	ExecutePrompt(ctx context.Context, req ExecutePromptRequest) (*ExecutePromptResult, error)
	ExecuteAgent(ctx context.Context, req ExecutionRequest) (string, error)

	CreateProvider(ctx context.Context, req *CreateProviderRequest) (*agent.LLMProvider, error)
	GetProvider(ctx context.Context, spaceID string, id string) (*agent.LLMProvider, error)
	ListProviders(ctx context.Context, spaceID string) ([]*agent.LLMProvider, error)
	UpdateProvider(ctx context.Context, req *UpdateProviderRequest) (*agent.LLMProvider, error)
	DeleteProvider(ctx context.Context, spaceID string, id string) error

	CreateAgent(ctx context.Context, req *CreateAgentRequest) (*agent.Agent, error)
	GetAgent(ctx context.Context, spaceID string, id string) (*agent.Agent, error)
	ListAgents(ctx context.Context, spaceID string) ([]*agent.Agent, error)
	UpdateAgent(ctx context.Context, req *UpdateAgentRequest) (*agent.Agent, error)
	DeleteAgent(ctx context.Context, spaceID string, id string) error

	ListRuns(ctx context.Context, q agent.ListAgentRuns) (*paging.Page[*agent.AgentRun], error)
}

// Compile-time interface assertion.
var _ Coordinator = (*coordinator)(nil)

type coordinator struct {
	store   AgentStore
	client  *agent.Client
	service *agent.Service
}

// NewCoordinator creates a new Agent Coordinator instance.
func NewCoordinator(store AgentStore, client *agent.Client) Coordinator {
	return &coordinator{
		store:   store,
		client:  client,
		service: agent.NewService(store, client),
	}
}

// ExecutePrompt resolves an agent, inline provider/model, or space default provider,
// runs the prompt via the LLM client, and logs an audit row in platform.agent_runs (with nullable agent_id).
func (c *coordinator) ExecutePrompt(ctx context.Context, req ExecutePromptRequest) (*ExecutePromptResult, error) {
	res, err := c.service.ExecutePrompt(ctx, agent.ExecutePromptRequest{
		SpaceID:           req.SpaceID,
		AgentID:           req.AgentID,
		ProviderID:        req.ProviderID,
		ModelName:         req.ModelName,
		Temperature:       req.Temperature,
		SystemInstruction: req.SystemInstruction,
		Prompt:            req.Prompt,
		ResponseSchema:    req.ResponseSchema,
	})
	if res == nil {
		return nil, err
	}
	return &ExecutePromptResult{
		Text:       res.Text,
		TokensUsed: res.TokensUsed,
		AgentRunID: res.AgentRunID,
		ModelName:  res.ModelName,
	}, err
}

// ExecuteAgent resolves and runs the active agent configured for a specific workspace and purpose.
// If no database agent is configured, it falls back to the native Gemini system default from the catalog.
func (c *coordinator) ExecuteAgent(ctx context.Context, req ExecutionRequest) (string, error) {
	const op errors.Op = "application/agent.ExecuteAgent"

	// Find the system blueprint from the catalog first to verify the purpose
	var descriptor *agent.AgentDescriptor
	for _, desc := range agent.GetAgentCatalog() {
		if desc.Purpose == req.Purpose {
			descriptor = &desc
			break
		}
	}
	if descriptor == nil {
		return "", errors.E(op, errors.Invalid, InvalidAgentPurpose, fmt.Sprintf("unsupported agent purpose: %q", req.Purpose))
	}

	// 1. Compile Prompt Template
	promptTemplate := descriptor.DefaultPromptTemplate
	if promptTemplate == "" {
		promptTemplate = "{{.email_body}}"
	}
	tmplPrompt, err := template.New("prompt").Parse(promptTemplate)
	if err != nil {
		return "", errors.E(op, errors.Invalid, InvalidTemplate, fmt.Errorf("parse prompt template: %w", err))
	}
	var bufPrompt bytes.Buffer
	if err := tmplPrompt.Execute(&bufPrompt, req.Params); err != nil {
		return "", errors.E(op, errors.Invalid, InvalidTemplate, fmt.Errorf("execute prompt template: %w", err))
	}
	prompt := bufPrompt.String()

	// Read workspace active agent from storage
	a, err := c.store.GetAgent(ctx, agent.GetAgent{SpaceID: req.SpaceID, Purpose: req.Purpose})
	if err != nil {
		return "", errors.E(op, fmt.Errorf("lookup workspace agent: %w", err))
	}
	if a == nil {
		return "", errors.E(op, errors.NotExist, AgentNotFound, "agent not found for purpose")
	}

	var providerMode agent.CompatibilityMode
	var apiURL string
	var apiKey string
	modelName := a.ModelName
	if strings.TrimSpace(modelName) == "" {
		return "", errors.E(op, errors.Invalid, "model_name is required")
	}
	temperature := a.Temperature
	agentID := a.ID

	// Resolve the raw system instruction to compile
	rawSystemInstruction := descriptor.DefaultSystemInstruction
	if a.SystemInstruction != nil && *a.SystemInstruction != "" {
		rawSystemInstruction = *a.SystemInstruction
	}

	// Resolve referenced LLM provider connection
	if a.LLMProviderID == nil || *a.LLMProviderID == "" {
		return "", errors.E(op, errors.Invalid, "llm_provider_id is required")
	}
	prov, err := c.store.GetProvider(ctx, agent.GetLLMProvider{SpaceID: req.SpaceID, ID: *a.LLMProviderID})
	if err != nil {
		return "", errors.E(op, fmt.Errorf("load agent provider: %w", err))
	}
	if prov == nil {
		return "", errors.E(op, errors.NotExist, ProviderNotFound, "llm provider not found")
	}
	providerMode = prov.CompatibilityMode
	if prov.APIUrl != nil {
		apiURL = *prov.APIUrl
	}
	if prov.APIKey != nil {
		apiKey = *prov.APIKey
	}

	// 2. Compile System Instruction Template
	var systemInstruction string
	if rawSystemInstruction != "" {
		tmplSys, err := template.New("system").Parse(rawSystemInstruction)
		if err != nil {
			return "", errors.E(op, errors.Invalid, InvalidTemplate, fmt.Errorf("parse system template: %w", err))
		}
		var bufSys bytes.Buffer
		if err := tmplSys.Execute(&bufSys, req.Params); err != nil {
			return "", errors.E(op, errors.Invalid, InvalidTemplate, fmt.Errorf("execute system template: %w", err))
		}
		systemInstruction = bufSys.String()
	}

	// 3. Compile Response Schema Template
	var responseSchema string
	if descriptor.RequiredResponseSchema != "" {
		tmplSchema, err := template.New("schema").Parse(descriptor.RequiredResponseSchema)
		if err != nil {
			return "", errors.E(op, errors.Invalid, InvalidTemplate, fmt.Errorf("parse schema template: %w", err))
		}
		var bufSchema bytes.Buffer
		if err := tmplSchema.Execute(&bufSchema, req.Params); err != nil {
			return "", errors.E(op, errors.Invalid, InvalidTemplate, fmt.Errorf("execute schema template: %w", err))
		}
		responseSchema = bufSchema.String()
	}

	// Dispatch request to platform client with latency tracking
	log.Info(ctx, "executing agent request",
		log.String("space_id", req.SpaceID),
		log.String("purpose", req.Purpose),
		log.String("model_name", modelName),
		log.String("provider_mode", string(providerMode)),
		log.Int("prompt_len", len(prompt)),
	)

	startTime := time.Now()
	resp, execErr := c.client.Execute(ctx, agent.ExecutionRequest{
		CompatibilityMode: providerMode,
		APIUrl:            apiURL,
		APIKey:            apiKey,
		ModelName:         modelName,
		SystemInstruction: systemInstruction,
		Prompt:            prompt,
		Temperature:       temperature,
		ResponseSchema:    responseSchema,
	})
	duration := time.Since(startTime)

	// Log execution run to audit table if an active database agent is registered
	if agentID != "" {
		status := agent.RunSuccess
		var errMsg *string
		var output *string
		if execErr != nil {
			status = agent.RunFailed
			msg := execErr.Error()
			errMsg = &msg
		} else {
			output = &resp.Text
		}
		_, logErr := c.store.LogRun(ctx, new(agentID), req.SpaceID, status, prompt, output, errMsg, resp.TokensUsed)
		if logErr != nil {
			log.Warn(ctx, "failed to log run execution", log.Err(logErr))
		}
	}

	if execErr != nil {
		log.Error(ctx, "agent execution failed",
			log.String("space_id", req.SpaceID),
			log.String("purpose", req.Purpose),
			log.String("model_name", modelName),
			log.String("provider_mode", string(providerMode)),
			log.Duration("duration", duration),
			log.Int64("latency_ms", duration.Milliseconds()),
			log.Err(execErr),
		)
		return "", MapExecutionError(op, execErr)
	}

	log.Info(ctx, "agent execution succeeded",
		log.String("space_id", req.SpaceID),
		log.String("purpose", req.Purpose),
		log.String("model_name", modelName),
		log.String("provider_mode", string(providerMode)),
		log.Int("tokens_used", resp.TokensUsed),
		log.Duration("duration", duration),
		log.Int64("latency_ms", duration.Milliseconds()),
	)

	return resp.Text, nil
}

// CreateProvider registers a new LLM provider.
func (c *coordinator) CreateProvider(ctx context.Context, req *CreateProviderRequest) (*agent.LLMProvider, error) {
	const op errors.Op = "application/agent.CreateProvider"

	if req == nil {
		return nil, errors.E(op, errors.Invalid, "request is required")
	}
	if req.Name == "" {
		return nil, errors.E(op, errors.Invalid, "provider name is required")
	}

	p, err := c.store.CreateProvider(ctx, req.SpaceID, req.Name, req.CompatibilityMode, req.APIUrl, req.APIKey)
	if err != nil {
		return nil, errors.E(op, err)
	}
	return p, nil
}

// GetProvider retrieves a single LLM provider by ID.
func (c *coordinator) GetProvider(ctx context.Context, spaceID string, id string) (*agent.LLMProvider, error) {
	const op errors.Op = "application/agent.GetProvider"

	p, err := c.store.GetProvider(ctx, agent.GetLLMProvider{SpaceID: spaceID, ID: id})
	if err != nil {
		return nil, errors.E(op, err)
	}
	if p == nil {
		return nil, errors.E(op, errors.NotExist, ProviderNotFound, "llm provider not found")
	}
	return p, nil
}

// ListProviders lists all LLM providers in a space.
func (c *coordinator) ListProviders(ctx context.Context, spaceID string) ([]*agent.LLMProvider, error) {
	const op errors.Op = "application/agent.ListProviders"

	list, err := c.store.ListProviders(ctx, spaceID)
	if err != nil {
		return nil, errors.E(op, err)
	}
	return list, nil
}

// UpdateProvider modifies an existing LLM provider.
func (c *coordinator) UpdateProvider(ctx context.Context, req *UpdateProviderRequest) (*agent.LLMProvider, error) {
	const op errors.Op = "application/agent.UpdateProvider"

	if req == nil {
		return nil, errors.E(op, errors.Invalid, "request is required")
	}

	p, err := c.store.UpdateProvider(ctx, req.SpaceID, req.ID, req.Name, req.APIUrl, req.APIKey)
	if err != nil {
		if errors.Is(err, errors.NotExist) {
			return nil, errors.E(op, errors.NotExist, ProviderNotFound, "llm provider not found")
		}
		return nil, errors.E(op, err)
	}
	return p, nil
}

// DeleteProvider removes an LLM provider.
func (c *coordinator) DeleteProvider(ctx context.Context, spaceID string, id string) error {
	const op errors.Op = "application/agent.DeleteProvider"

	err := c.store.DeleteProvider(ctx, spaceID, id)
	if err != nil {
		if errors.Is(err, errors.NotExist) {
			return errors.E(op, errors.NotExist, ProviderNotFound, "llm provider not found")
		}
		return errors.E(op, err)
	}
	return nil
}

// CreateAgent registers a new agent instance.
func (c *coordinator) CreateAgent(ctx context.Context, req *CreateAgentRequest) (*agent.Agent, error) {
	const op errors.Op = "application/agent.CreateAgent"

	if req == nil {
		return nil, errors.E(op, errors.Invalid, "request is required")
	}
	if req.Name == "" {
		return nil, errors.E(op, errors.Invalid, "agent name is required")
	}
	if req.Purpose == "" {
		return nil, errors.E(op, errors.Invalid, "agent purpose is required")
	}
	if strings.TrimSpace(req.ModelName) == "" {
		return nil, errors.E(op, errors.Invalid, "model_name is required")
	}

	a, err := c.store.CreateAgent(ctx, req.SpaceID, req.LLMProviderID, req.Name, req.Description, req.Purpose, req.Tags, req.ModelName, req.SystemInstruction, req.Temperature)
	if err != nil {
		return nil, errors.E(op, err)
	}
	return a, nil
}

// GetAgent retrieves a single agent by ID.
func (c *coordinator) GetAgent(ctx context.Context, spaceID string, id string) (*agent.Agent, error) {
	const op errors.Op = "application/agent.GetAgent"

	a, err := c.store.GetAgent(ctx, agent.GetAgent{SpaceID: spaceID, ID: id})
	if err != nil {
		return nil, errors.E(op, err)
	}
	if a == nil {
		return nil, errors.E(op, errors.NotExist, AgentNotFound, "agent not found")
	}
	return a, nil
}

// ListAgents lists all agents configured in a workspace.
func (c *coordinator) ListAgents(ctx context.Context, spaceID string) ([]*agent.Agent, error) {
	const op errors.Op = "application/agent.ListAgents"

	list, err := c.store.ListAgents(ctx, spaceID)
	if err != nil {
		return nil, errors.E(op, err)
	}
	return list, nil
}

// UpdateAgent modifies agent configuration.
func (c *coordinator) UpdateAgent(ctx context.Context, req *UpdateAgentRequest) (*agent.Agent, error) {
	const op errors.Op = "application/agent.UpdateAgent"

	if req == nil {
		return nil, errors.E(op, errors.Invalid, "request is required")
	}
	if strings.TrimSpace(req.ModelName) == "" {
		return nil, errors.E(op, errors.Invalid, "model_name is required")
	}

	a, err := c.store.UpdateAgent(ctx, req.SpaceID, req.ID, req.LLMProviderID, req.Name, req.Description, req.Tags, req.ModelName, req.SystemInstruction, req.Temperature, req.IsEnabled)
	if err != nil {
		if errors.Is(err, errors.NotExist) {
			return nil, errors.E(op, errors.NotExist, AgentNotFound, "agent not found")
		}
		return nil, errors.E(op, err)
	}
	return a, nil
}

// DeleteAgent removes an agent instance.
func (c *coordinator) DeleteAgent(ctx context.Context, spaceID string, id string) error {
	const op errors.Op = "application/agent.DeleteAgent"

	err := c.store.DeleteAgent(ctx, spaceID, id)
	if err != nil {
		if errors.Is(err, errors.NotExist) {
			return errors.E(op, errors.NotExist, AgentNotFound, "agent not found")
		}
		return errors.E(op, err)
	}
	return nil
}

// ListRuns lists execution logs for an agent with cursor-based pagination.
func (c *coordinator) ListRuns(ctx context.Context, q agent.ListAgentRuns) (*paging.Page[*agent.AgentRun], error) {
	const op errors.Op = "application/agent.ListRuns"

	page, err := c.store.ListRuns(ctx, q)
	if err != nil {
		return nil, errors.E(op, err)
	}
	return page, nil
}
