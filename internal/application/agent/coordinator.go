package agentapp

import (
	"bytes"
	"context"
	"fmt"
	"sync"
	"text/template"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/agent"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/log"
	"github.com/masterkeysrd/saturn/internal/platform/paging"
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

	ListRuns(ctx context.Context, q agent.ListAgentRuns) (*paging.Page[*agent.AgentRun], error)
}

// DocumentFile represents an attached file payload for signal analysis.
type DocumentFile struct {
	Filename    string `json:"filename"`
	ContentType string `json:"contentType"`
	Content     []byte `json:"content"`
}

// SuggestionRequest holds generic incoming signal data for suggestion processing.
type SuggestionRequest struct {
	TextContent string         `json:"textContent"`
	Documents   []DocumentFile `json:"documents"`
	Metadata    map[string]any `json:"metadata"`
}

// SuggestionProcessor interface abstracts purpose-based suggestion engines.
type SuggestionProcessor interface {
	ProcessSuggestions(ctx context.Context, spaceID string, req *SuggestionRequest) (map[string]any, error)
}

// ExecutionRequest defines options for running an agent with parameters.
type ExecutionRequest struct {
	SpaceID string
	Purpose string
	Params  map[string]any
}

// Coordinator orchestrates AI agent blueprints, LLM providers, audit runs, and suggestions.
type Coordinator interface {
	GetSuggestions(ctx context.Context, spaceID string, purpose string, req *SuggestionRequest) (map[string]any, error)
	ExecuteAgent(ctx context.Context, req ExecutionRequest) (string, error)
	RegisterSuggestionProcessor(purpose string, processor SuggestionProcessor)

	CreateProvider(ctx context.Context, spaceID string, name string, mode agent.CompatibilityMode, url *string, key *string) (*agent.LLMProvider, error)
	GetProvider(ctx context.Context, spaceID string, id string) (*agent.LLMProvider, error)
	ListProviders(ctx context.Context, spaceID string) ([]*agent.LLMProvider, error)
	UpdateProvider(ctx context.Context, spaceID string, id string, name string, url *string, key *string) (*agent.LLMProvider, error)
	DeleteProvider(ctx context.Context, spaceID string, id string) error

	CreateAgent(ctx context.Context, spaceID string, providerID *string, name string, desc *string, purpose string, tags []string, model string, prompt *string, temp float64) (*agent.Agent, error)
	GetAgent(ctx context.Context, spaceID string, id string) (*agent.Agent, error)
	ListAgents(ctx context.Context, spaceID string) ([]*agent.Agent, error)
	UpdateAgent(ctx context.Context, spaceID string, id string, providerID *string, name string, desc *string, tags []string, model string, prompt *string, temp float64, isEnabled bool) (*agent.Agent, error)
	DeleteAgent(ctx context.Context, spaceID string, id string) error

	ListRuns(ctx context.Context, q agent.ListAgentRuns) (*paging.Page[*agent.AgentRun], error)
}

type coordinator struct {
	store      AgentStore
	client     *agent.Client
	processors map[string]SuggestionProcessor
	mu         sync.RWMutex
}

// NewCoordinator creates a new Agent Coordinator instance.
func NewCoordinator(store AgentStore, client *agent.Client) Coordinator {
	return &coordinator{
		store:      store,
		client:     client,
		processors: make(map[string]SuggestionProcessor),
	}
}

// RegisterSuggestionProcessor registers a suggestion engine for a specific purpose key (e.g. "transaction_extractor").
func (c *coordinator) RegisterSuggestionProcessor(purpose string, processor SuggestionProcessor) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.processors[purpose] = processor
}

// GetSuggestions dispatches a suggestion request to the registered processor for the target purpose.
func (c *coordinator) GetSuggestions(ctx context.Context, spaceID string, purpose string, req *SuggestionRequest) (map[string]any, error) {
	const op errors.Op = "application/agent.GetSuggestions"

	if purpose == "" {
		return nil, errors.E(op, errors.Invalid, "purpose is required")
	}

	c.mu.RLock()
	processor, ok := c.processors[purpose]
	c.mu.RUnlock()

	if !ok {
		return nil, errors.E(op, errors.NotExist, SuggestionProcessorNotFound, fmt.Sprintf("no suggestion processor registered for purpose %q", purpose))
	}

	res, err := processor.ProcessSuggestions(ctx, spaceID, req)
	if err != nil {
		return nil, errors.E(op, err)
	}
	return res, nil
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

	var providerMode = agent.ModeGeminiNative
	var apiURL string
	var apiKey string
	var modelName = "gemini-2.5-flash"
	var temperature = 0.0
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
				return "", errors.E(op, fmt.Errorf("load agent provider: %w", err))
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
		_, logErr := c.store.LogRun(ctx, agentID, req.SpaceID, status, prompt, output, errMsg, resp.TokensUsed)
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
func (c *coordinator) CreateProvider(ctx context.Context, spaceID string, name string, mode agent.CompatibilityMode, url *string, key *string) (*agent.LLMProvider, error) {
	const op errors.Op = "application/agent.CreateProvider"

	if name == "" {
		return nil, errors.E(op, errors.Invalid, "provider name is required")
	}

	p, err := c.store.CreateProvider(ctx, spaceID, name, mode, url, key)
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
func (c *coordinator) UpdateProvider(ctx context.Context, spaceID string, id string, name string, url *string, key *string) (*agent.LLMProvider, error) {
	const op errors.Op = "application/agent.UpdateProvider"

	p, err := c.store.UpdateProvider(ctx, spaceID, id, name, url, key)
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
func (c *coordinator) CreateAgent(ctx context.Context, spaceID string, providerID *string, name string, desc *string, purpose string, tags []string, model string, prompt *string, temp float64) (*agent.Agent, error) {
	const op errors.Op = "application/agent.CreateAgent"

	if name == "" {
		return nil, errors.E(op, errors.Invalid, "agent name is required")
	}
	if purpose == "" {
		return nil, errors.E(op, errors.Invalid, "agent purpose is required")
	}

	// Detect if an agent configuration for this purpose already exists in this workspace
	existing, err := c.store.GetAgent(ctx, agent.GetAgent{SpaceID: spaceID, Purpose: purpose})
	if err != nil && !errors.Is(err, errors.NotExist) {
		return nil, errors.E(op, err)
	}
	if existing != nil {
		return nil, errors.E(op, errors.Exist, AgentExists, "an agent configuration for this purpose already exists in this workspace")
	}

	a, err := c.store.CreateAgent(ctx, spaceID, providerID, name, desc, purpose, tags, model, prompt, temp)
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
func (c *coordinator) UpdateAgent(ctx context.Context, spaceID string, id string, providerID *string, name string, desc *string, tags []string, model string, prompt *string, temp float64, isEnabled bool) (*agent.Agent, error) {
	const op errors.Op = "application/agent.UpdateAgent"

	a, err := c.store.UpdateAgent(ctx, spaceID, id, providerID, name, desc, tags, model, prompt, temp, isEnabled)
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
