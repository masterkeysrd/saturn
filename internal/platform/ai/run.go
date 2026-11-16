package ai

import "time"

// ErrorDetail captures a structured error code and message across providers, MCP servers, and runs.
type ErrorDetail struct {
	Code    *string `json:"code,omitempty"`
	Message string  `json:"message"`
}

// TokenUsage breaks down LLM token accounting across a step, message, or run.
type TokenUsage struct {
	Input     int32 `json:"input"`
	Output    int32 `json:"output"`
	Reasoning int32 `json:"reasoning"`
	Cached    int32 `json:"cached"`
	Total     int32 `json:"total"`
}

// Add accumulates other into t.
func (t *TokenUsage) Add(other TokenUsage) {
	t.Input += other.Input
	t.Output += other.Output
	t.Reasoning += other.Reasoning
	t.Cached += other.Cached
	t.Total += other.Total
}

// RunKind identifies the execution mode of an AI Run.
type RunKind string

const (
	RunKindGenerate RunKind = "generate"
	RunKindAgentRun RunKind = "agent_run"
	RunKindChatTurn RunKind = "chat_turn"
)

// RunSource identifies the origin caller of an AI Run.
type RunSource string

const (
	RunSourceAPI        RunSource = "api"
	RunSourceChat       RunSource = "chat"
	RunSourcePlayground RunSource = "playground"
	RunSourceWorkflow   RunSource = "workflow"
	RunSourceMCP        RunSource = "mcp"
)

// RunStatus identifies the lifecycle state of an AI Run.
type RunStatus string

const (
	RunRunning          RunStatus = "running"
	RunAwaitingApproval RunStatus = "awaiting_approval"
	RunCompleted        RunStatus = "completed"
	RunFailed           RunStatus = "failed"
	RunCancelled        RunStatus = "cancelled"
	RunTimedOut         RunStatus = "timed_out"
	RunMaxStepsExceeded RunStatus = "max_steps_exceeded"
)

// RunStepKind identifies whether a RunStep is an LLM call or an MCP tool invocation.
type RunStepKind string

const (
	StepKindLLM  RunStepKind = "llm"
	StepKindTool RunStepKind = "tool"
)

// RunStepStatus identifies the terminal or paused status of a RunStep.
type RunStepStatus string

const (
	StepStatusCompleted        RunStepStatus = "completed"
	StepStatusFailed           RunStepStatus = "failed"
	StepStatusAwaitingApproval RunStepStatus = "awaiting_approval"
	StepStatusRejected         RunStepStatus = "rejected"
)

// ModelSnapshot records the driver and model ID used during a run.
type ModelSnapshot struct {
	Driver    string `json:"driver"`
	ModelName string `json:"model_name"`
}

// RunInput records the prompt, system instructions, and model snapshot for a Run.
type RunInput struct {
	Prompt            string         `json:"prompt"`
	SystemInstruction *string        `json:"system_instruction,omitempty"`
	ModelSnapshot     *ModelSnapshot `json:"model_snapshot,omitempty"`
}

// RunOutput records the terminal output of a Run.
type RunOutput struct {
	Text *string        `json:"text,omitempty"`
	Data map[string]any `json:"data,omitempty"`
}

// RunMetrics aggregates tokens, cost, latency, and step count for a Run.
type RunMetrics struct {
	Tokens           TokenUsage `json:"tokens"`
	EstimatedCostUSD float64    `json:"estimated_cost_usd"`
	LatencyMS        int64      `json:"latency_ms"`
	StepCount        int32      `json:"step_count"`
}

// StepMetrics records token usage and duration for an individual RunStep.
type StepMetrics struct {
	Tokens     *TokenUsage `json:"tokens,omitempty"`
	DurationMS int64       `json:"duration_ms"`
}

// Run represents an AI execution audit record (`platform.ai_runs`).
type Run struct {
	ID         string
	SpaceID    string
	Kind       RunKind
	Source     RunSource
	ThreadID   *string
	AgentID    *string
	ProviderID *string
	ModelID    *string
	FlowRunID  *string
	Status     RunStatus
	Input      RunInput
	Output     *RunOutput
	Error      *ErrorDetail
	Metrics    RunMetrics
	StartTime  time.Time
	EndTime    *time.Time
	CreateTime time.Time
}

// RunStep represents a single LLM or MCP tool step within a Run (`platform.ai_run_steps`).
type RunStep struct {
	ID          string
	RunID       string
	SpaceID     string
	Seq         int32
	Kind        RunStepKind
	MCPServerID *string
	Name        string
	Status      RunStepStatus
	Input       map[string]any
	Output      map[string]any
	Error       *ErrorDetail
	Metrics     StepMetrics
	CreateTime  time.Time
}

// ListRunsFilter filters workspace AI execution runs.
type ListRunsFilter struct {
	SpaceID   string
	Kind      *RunKind
	Source    *RunSource
	AgentID   *string
	ThreadID  *string
	Status    *RunStatus
	PageSize  int32
	PageToken string
}

// EstimateCostUSD calculates estimated run cost in USD from TokenUsage and ModelPricing.
func EstimateCostUSD(usage TokenUsage, pricing ModelPricing) float64 {
	const million = 1_000_000.0
	uncachedInput := max(usage.Input-usage.Cached, 0)
	inputCost := (float64(uncachedInput) / million) * pricing.InputPerMillionUSD
	cachedCost := (float64(usage.Cached) / million) * pricing.CachedInputPerMillionUSD
	outputCost := (float64(usage.Output+usage.Reasoning) / million) * pricing.OutputPerMillionUSD
	return inputCost + cachedCost + outputCost
}
