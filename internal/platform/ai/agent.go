package ai

import (
	"slices"
	"strings"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/patch"
)

const SystemSaturnAssistantKey = "system.saturn.assistant"

// ApprovalPolicy governs tool confirmation behavior for an agent or thread.
type ApprovalPolicy string

const (
	ApprovalConfirmWrites ApprovalPolicy = "confirm_writes"
	ApprovalAuto          ApprovalPolicy = "auto"
	ApprovalDenyWrites    ApprovalPolicy = "deny_writes"
)

// IsValid reports whether p is a recognized tool approval policy.
func (p ApprovalPolicy) IsValid() bool {
	switch p {
	case ApprovalConfirmWrites, ApprovalAuto, ApprovalDenyWrites:
		return true
	default:
		return false
	}
}

const (
	// DefaultExecutionTimeoutSeconds is the default wall-clock budget for an agent run or chat turn.
	DefaultExecutionTimeoutSeconds int32 = 300
	// MaxExecutionTimeoutSeconds is the upper bound allowed for agent execution timeouts (30 minutes).
	MaxExecutionTimeoutSeconds int32 = 1800
)

// ExecutionConfig configures agent loop limits and tool approval behavior.
type ExecutionConfig struct {
	ApprovalPolicy ApprovalPolicy `json:"approval_policy"`
	MaxSteps       int32          `json:"max_steps"`
	TimeoutSeconds int32          `json:"timeout_seconds"`
}

// Validate checks ExecutionConfig bounds and defaults unset fields.
func (e *ExecutionConfig) Validate() error {
	if e.ApprovalPolicy == "" {
		e.ApprovalPolicy = ApprovalConfirmWrites
	}
	if !e.ApprovalPolicy.IsValid() {
		return errors.E(errors.Invalid, "unsupported approval_policy: "+string(e.ApprovalPolicy))
	}
	if e.MaxSteps <= 0 {
		e.MaxSteps = 10
	}
	if e.MaxSteps > 50 {
		return errors.E(errors.Invalid, "execution.max_steps must be <= 50")
	}
	if e.TimeoutSeconds <= 0 {
		e.TimeoutSeconds = DefaultExecutionTimeoutSeconds
	}
	if e.TimeoutSeconds > MaxExecutionTimeoutSeconds {
		return errors.E(errors.Invalid, "execution.timeout_seconds must be <= 1800")
	}
	return nil
}

// MCPBinding binds an MCP server and a tool allowlist to an Agent.
type MCPBinding struct {
	MCPServerID  string   `json:"mcp_server_id"`
	AllowedTools []string `json:"allowed_tools"`
}

// AllowsTool reports whether toolName is permitted by this binding.
func (b MCPBinding) AllowsTool(toolName string) bool {
	if len(b.AllowedTools) == 0 {
		return false
	}
	if slices.Contains(b.AllowedTools, "*") {
		return true
	}
	return slices.Contains(b.AllowedTools, toolName)
}

// AgentConfig groups prompt instructions, generation overrides, execution limits, MCP bindings, and output schema.
type AgentConfig struct {
	Icon              string           `json:"icon"`
	SystemInstruction *string          `json:"system_instruction,omitempty"`
	Generation        GenerationConfig `json:"generation,omitzero"`
	Execution         ExecutionConfig  `json:"execution"`
	MCPBindings       []MCPBinding     `json:"mcp_bindings,omitempty"`
	OutputSchema      map[string]any   `json:"output_schema,omitempty"`
}

// AgentStats summarizes 7-day execution metrics for an Agent.
type AgentStats struct {
	TotalRuns7d     int32
	CompletedRuns7d int32
	FailedRuns7d    int32
	LastRunAt       *time.Time
}

// Agent represents a workspace AI agent (`platform.ai_agents`).
type Agent struct {
	ID          string
	SpaceID     string
	SystemKey   *string
	IsSystem    bool
	Slug        string
	Name        string
	Description string
	Tags        []string
	ModelID     *string
	Config      AgentConfig
	IsEnabled   bool
	Version     int64
	CreateTime  time.Time
	UpdateTime  time.Time
}

// EnsureDeletable rejects deletion of protected built-in system agents.
func (a *Agent) EnsureDeletable() error {
	if a == nil {
		return errors.E(errors.Invalid, "agent is required")
	}
	if a.IsSystem {
		return ErrAgentProtected
	}
	return nil
}

// Validate checks Agent invariants and normalizes fields.
func (a *Agent) Validate() error {
	if a == nil {
		return errors.E(errors.Invalid, "agent payload is required")
	}
	a.Slug = strings.TrimSpace(strings.ToLower(a.Slug))
	a.Name = strings.TrimSpace(a.Name)
	a.Description = strings.TrimSpace(a.Description)

	if a.Name == "" {
		return errors.E(errors.Invalid, "agent name is required")
	}
	if len(a.Name) > 255 {
		return errors.E(errors.Invalid, "agent name must not exceed 255 characters")
	}
	if a.Slug == "" || len(a.Slug) > 100 || !slugRegex.MatchString(a.Slug) {
		return errors.E(errors.Invalid, "agent slug must match ^[a-z0-9][a-z0-9-]*$ and be <= 100 chars")
	}
	if a.Tags == nil {
		a.Tags = []string{}
	}
	if strings.TrimSpace(a.Config.Icon) == "" {
		a.Config.Icon = "bot"
	}
	if err := a.Config.Generation.Validate(); err != nil {
		return err
	}
	if err := a.Config.Execution.Validate(); err != nil {
		return err
	}
	for _, b := range a.Config.MCPBindings {
		if strings.TrimSpace(b.MCPServerID) == "" {
			return errors.E(errors.Invalid, "mcp_binding.mcp_server_id is required")
		}
	}
	return nil
}

// AgentPatchSchema defines patchable fields for Agent, including deep nested config paths.
var AgentPatchSchema = patch.NewSchema[Agent]().
	Field("slug", func(a *Agent) *string { return &a.Slug }).
	Field("name", func(a *Agent) *string { return &a.Name }).
	Field("description", func(a *Agent) *string { return &a.Description }).
	Field("tags", func(a *Agent) *[]string { return &a.Tags }).
	Field("model_id", func(a *Agent) **string { return &a.ModelID }).
	Field("is_enabled", func(a *Agent) *bool { return &a.IsEnabled }).
	Field("config", func(a *Agent) *AgentConfig { return &a.Config }).
	Field("config.icon", func(a *Agent) *string { return &a.Config.Icon }).
	Field("config.system_instruction", func(a *Agent) **string { return &a.Config.SystemInstruction }).
	Field("config.generation", func(a *Agent) *GenerationConfig { return &a.Config.Generation }).
	Field("config.generation.temperature", func(a *Agent) **float64 { return &a.Config.Generation.Temperature }).
	Field("config.generation.max_tokens", func(a *Agent) **int32 { return &a.Config.Generation.MaxTokens }).
	Field("config.generation.top_p", func(a *Agent) **float64 { return &a.Config.Generation.TopP }).
	Field("config.generation.thinking", func(a *Agent) *ThinkingConfig { return &a.Config.Generation.Thinking }).
	Field("config.generation.thinking.enabled", func(a *Agent) *bool { return &a.Config.Generation.Thinking.Enabled }).
	Field("config.generation.thinking.effort", func(a *Agent) **string { return &a.Config.Generation.Thinking.Effort }).
	Field("config.generation.thinking.budget_tokens", func(a *Agent) **int32 { return &a.Config.Generation.Thinking.BudgetTokens }).
	Field("config.execution", func(a *Agent) *ExecutionConfig { return &a.Config.Execution }).
	Field("config.execution.approval_policy", func(a *Agent) *ApprovalPolicy { return &a.Config.Execution.ApprovalPolicy }).
	Field("config.execution.max_steps", func(a *Agent) *int32 { return &a.Config.Execution.MaxSteps }).
	Field("config.execution.timeout_seconds", func(a *Agent) *int32 { return &a.Config.Execution.TimeoutSeconds }).
	Field("config.mcp_bindings", func(a *Agent) *[]MCPBinding { return &a.Config.MCPBindings }).
	Field("config.output_schema", func(a *Agent) *map[string]any { return &a.Config.OutputSchema })

// ApplyPatch applies partial updates from incoming according to mask.
func (a *Agent) ApplyPatch(incoming *Agent, mask []string) error {
	if incoming == nil {
		return errors.E(errors.Invalid, "agent payload is required")
	}
	if a.IsSystem && slices.Contains(mask, "slug") {
		return errors.E(errors.Permission, CodeAgentProtected, "cannot change slug of built-in system agent")
	}
	if err := AgentPatchSchema.Apply(a, incoming, mask); err != nil {
		return errors.E(errors.Invalid, err)
	}
	a.UpdateTime = time.Now().UTC()
	return a.Validate()
}
