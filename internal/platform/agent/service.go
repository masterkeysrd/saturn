package agent

import (
	"context"
	"fmt"
	"strings"

	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/log"
)

const (
	// CodeAgentNotFound is returned when a referenced agent does not exist.
	CodeAgentNotFound errors.Code = "AGENT_NOT_FOUND"
	// CodeModelExecutionFailed is returned on general model execution errors.
	CodeModelExecutionFailed errors.Code = "MODEL_EXECUTION_FAILED"
	// CodeModelUnavailable is returned when the upstream LLM endpoint is temporarily unavailable.
	CodeModelUnavailable errors.Code = "MODEL_UNAVAILABLE"
)

// PromptStore abstracts agent/provider retrieval and agent_runs logging for platform/agent.Service.
type PromptStore interface {
	GetAgent(ctx context.Context, q GetAgent) (*Agent, error)
	GetProvider(ctx context.Context, q GetLLMProvider) (*LLMProvider, error)
	ListProviders(ctx context.Context, spaceID string) ([]*LLMProvider, error)
	LogRun(ctx context.Context, agentID *string, spaceID string, status AgentRunStatus, input string, output *string, errMsg *string, tokens int) (*AgentRun, error)
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

// Service executes structured or free-form LLM prompts with space provider resolution and audit logging.
type Service struct {
	store  PromptStore
	client *Client
}

// NewService constructs a platform agent Service.
func NewService(store PromptStore, client *Client) *Service {
	return &Service{
		store:  store,
		client: client,
	}
}

// ExecutePrompt resolves an agent, inline provider/model, or space default provider,
// invokes the LLM client, and logs an audit row in platform.agent_runs (with nullable agent_id).
func (s *Service) ExecutePrompt(ctx context.Context, req ExecutePromptRequest) (*ExecutePromptResult, error) {
	const op errors.Op = "platform/agent.ExecutePrompt"

	if req.SpaceID == "" {
		return nil, errors.E(op, errors.Invalid, "space_id is required")
	}
	if req.Prompt == "" {
		return nil, errors.E(op, errors.Invalid, "prompt is required")
	}

	var providerMode CompatibilityMode
	var apiURL, apiKey string
	var modelName string
	temperature := 0.0
	systemInstruction := req.SystemInstruction
	var agentIDPtr *string
	var providerID string

	if req.AgentID != nil && *req.AgentID != "" {
		a, err := s.store.GetAgent(ctx, GetAgent{SpaceID: req.SpaceID, ID: *req.AgentID})
		if err != nil {
			return nil, errors.E(op, fmt.Errorf("lookup agent: %w", err))
		}
		if a == nil {
			return nil, errors.E(op, errors.NotExist, CodeAgentNotFound, "agent not found")
		}
		agentIDPtr = new(a.ID)
		modelName = a.ModelName
		temperature = a.Temperature
		if systemInstruction == "" && a.SystemInstruction != nil {
			systemInstruction = *a.SystemInstruction
		}
		if a.LLMProviderID != nil {
			providerID = *a.LLMProviderID
		}
	}

	if req.ProviderID != nil && *req.ProviderID != "" {
		providerID = *req.ProviderID
	}
	if req.ModelName != nil && *req.ModelName != "" {
		modelName = *req.ModelName
	}
	if req.Temperature != nil {
		temperature = *req.Temperature
	}

	if strings.TrimSpace(modelName) == "" {
		return nil, errors.E(op, errors.Invalid, "model_name is required")
	}

	var prov *LLMProvider
	if providerID != "" {
		var err error
		prov, err = s.store.GetProvider(ctx, GetLLMProvider{SpaceID: req.SpaceID, ID: providerID})
		if err != nil {
			return nil, errors.E(op, fmt.Errorf("load llm provider: %w", err))
		}
		if prov == nil {
			return nil, errors.E(op, errors.NotExist, "llm provider not found")
		}
	} else {
		providers, err := s.store.ListProviders(ctx, req.SpaceID)
		if err != nil {
			return nil, errors.E(op, fmt.Errorf("list space providers: %w", err))
		}
		if len(providers) > 0 {
			prov = providers[0]
		}
	}

	if prov == nil {
		return nil, errors.E(op, errors.Precondition, CodeModelUnavailable, "no LLM provider configured for space")
	}

	providerMode = prov.CompatibilityMode
	if prov.APIUrl != nil {
		apiURL = *prov.APIUrl
	}
	if prov.APIKey != nil {
		apiKey = *prov.APIKey
	}

	resp, execErr := s.client.Execute(ctx, ExecutionRequest{
		CompatibilityMode: providerMode,
		APIUrl:            apiURL,
		APIKey:            apiKey,
		ModelName:         modelName,
		SystemInstruction: systemInstruction,
		Prompt:            req.Prompt,
		Temperature:       temperature,
		ResponseSchema:    req.ResponseSchema,
	})

	status := RunSuccess
	var errMsg *string
	var output *string
	if execErr != nil {
		status = RunFailed
		errMsg = new(execErr.Error())
	} else {
		output = new(resp.Text)
	}

	var agentRunID string
	if logged, logErr := s.store.LogRun(ctx, agentIDPtr, req.SpaceID, status, req.Prompt, output, errMsg, resp.TokensUsed); logErr != nil {
		log.Warn(ctx, "failed to log prompt run execution", log.Err(logErr))
	} else if logged != nil {
		agentRunID = logged.ID
	}

	if execErr != nil {
		return &ExecutePromptResult{
			TokensUsed: resp.TokensUsed,
			AgentRunID: agentRunID,
			ModelName:  modelName,
		}, MapExecutionError(op, execErr)
	}

	return &ExecutePromptResult{
		Text:       resp.Text,
		TokensUsed: resp.TokensUsed,
		AgentRunID: agentRunID,
		ModelName:  modelName,
	}, nil
}

// MapExecutionError translates low-level model or network failures into platform errors.
func MapExecutionError(op errors.Op, err error) error {
	if err == nil {
		return nil
	}

	if errors.Is(err, context.DeadlineExceeded) || errors.Is(err, context.Canceled) {
		return errors.E(op, errors.Unavailable, CodeModelUnavailable, err)
	}

	errStr := strings.ToLower(err.Error())
	if strings.Contains(errStr, "rate limit") ||
		strings.Contains(errStr, "429") ||
		strings.Contains(errStr, "503") ||
		strings.Contains(errStr, "unavailable") ||
		strings.Contains(errStr, "timeout") ||
		strings.Contains(errStr, "connection refused") ||
		strings.Contains(errStr, "connection reset") ||
		strings.Contains(errStr, "overloaded") {
		return errors.E(op, errors.Unavailable, CodeModelUnavailable, err)
	}

	return errors.E(op, errors.Internal, CodeModelExecutionFailed, err)
}
