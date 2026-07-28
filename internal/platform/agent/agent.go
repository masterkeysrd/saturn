package agent

import (
	"time"

	"github.com/lib/pq"
)

// CompatibilityMode represents the API standard compatibility protocol.
type CompatibilityMode string

const (
	ModeGeminiNative     CompatibilityMode = "GEMINI_NATIVE"
	ModeOpenAICompatible CompatibilityMode = "OPENAI_COMPATIBLE"
	ModeAnthropicCompat  CompatibilityMode = "ANTHROPIC_COMPATIBLE"
	ModeOllamaNative     CompatibilityMode = "OLLAMA_NATIVE"
)

// LLMProvider represents user-configured connection parameters/credentials for an LLM endpoint.
type LLMProvider struct {
	ID                string            `db:"id" json:"id"`
	SpaceID           string            `db:"space_id" json:"space_id"`
	Name              string            `db:"name" json:"name"`
	CompatibilityMode CompatibilityMode `db:"compatibility_mode" json:"compatibility_mode"`
	APIUrl            *string           `db:"api_url" json:"api_url"`
	APIKey            *string           `db:"api_key" json:"api_key"` // Stored encrypted
	CreateTime        time.Time         `db:"create_time" json:"create_time"`
	UpdateTime        time.Time         `db:"update_time" json:"update_time"`
}

// Agent represents an AI Agent instance configured by a user.
type Agent struct {
	ID                string         `db:"id" json:"id"`
	SpaceID           string         `db:"space_id" json:"space_id"`
	LLMProviderID     *string        `db:"llm_provider_id" json:"llm_provider_id"`
	Name              string         `db:"name" json:"name"`
	Description       *string        `db:"description" json:"description"`
	Purpose           string         `db:"purpose" json:"purpose"`
	Tags              pq.StringArray `db:"tags" json:"tags"`
	ModelName         string         `db:"model_name" json:"model_name"`
	SystemInstruction *string        `db:"system_instruction" json:"system_instruction"` // Nullable override
	Temperature       float64        `db:"temperature" json:"temperature"`
	IsEnabled         bool           `db:"is_enabled" json:"is_enabled"`
	CreateTime        time.Time      `db:"create_time" json:"create_time"`
	UpdateTime        time.Time      `db:"update_time" json:"update_time"`
}

// AgentRunStatus represents the status of an agent execution attempt.
type AgentRunStatus string

const (
	RunSuccess AgentRunStatus = "SUCCESS"
	RunFailed  AgentRunStatus = "FAILED"
)

// AgentRun represents an execution log and audit trail of an agent run.
type AgentRun struct {
	ID           string         `db:"id" json:"id"`
	AgentID      string         `db:"agent_id" json:"agent_id"`
	SpaceID      string         `db:"space_id" json:"space_id"`
	Status       AgentRunStatus `db:"status" json:"status"`
	InputRaw     string         `db:"input_raw" json:"input_raw"`
	OutputRaw    *string        `db:"output_raw" json:"output_raw"`
	ErrorMessage *string        `db:"error_message" json:"error_message"`
	TokensUsed   int            `db:"tokens_used" json:"tokens_used"`
	CreateTime   time.Time      `db:"create_time" json:"create_time"`
}

// Query parameters structs to prevent multiple positional arguments anti-pattern.

type GetLLMProvider struct {
	SpaceID string
	ID      string
}

type GetAgent struct {
	SpaceID string
	ID      string
	Purpose string // Optional lookup specifically by purpose (e.g. INBOX_PARSER)
}

type ListAgentRuns struct {
	SpaceID   string
	AgentID   string
	PageSize  int32
	PageToken string
}
