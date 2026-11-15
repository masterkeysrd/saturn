package workflow

import (
	"context"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/paging"
)

//go:generate go run github.com/masterkeysrd/saturn/tools/mockgen .

// FlowStore defines persistence operations for workflow definitions.
// @Mock
type FlowStore interface {
	Create(ctx context.Context, flow *Flow) error
	Get(ctx context.Context, spaceID string, idOrSystemKey string) (*Flow, error)
	List(ctx context.Context, filter ListFlowsFilter) ([]*Flow, error)
	Update(ctx context.Context, flow *Flow) error
	Delete(ctx context.Context, spaceID string, id string) error
	EnsureSystemFlow(ctx context.Context, flow *Flow, triggers []Trigger, triggerStore TriggerStore) (*Flow, error)
}

// TriggerStore defines persistence operations for workflow trigger bindings.
// @Mock
type TriggerStore interface {
	ReplaceForFlow(ctx context.Context, spaceID string, flowID string, triggers []Trigger) ([]Trigger, error)
	ListByFlow(ctx context.Context, spaceID string, flowID string) ([]Trigger, error)
	ListByFlowIDs(ctx context.Context, spaceID string, flowIDs []string) (map[string][]Trigger, error)
	Get(ctx context.Context, spaceID string, triggerID string) (*Trigger, error)
	GetByID(ctx context.Context, triggerID string) (*Trigger, error)
	FindEnabledEventTriggers(ctx context.Context, spaceID string, topic string) ([]Trigger, error)
	ListEnabledScheduleTriggers(ctx context.Context) ([]Trigger, error)
}

// FlowRunStore defines persistence operations for workflow execution runs.
// @Mock
type FlowRunStore interface {
	CreateOrResume(ctx context.Context, run *FlowRun) (*FlowRun, bool, error)
	Update(ctx context.Context, run *FlowRun) error
	Get(ctx context.Context, spaceID string, id string) (*FlowRun, error)
	List(ctx context.Context, filter ListFlowRunsFilter) (*paging.Page[*FlowRun], error)
	GetStats7d(ctx context.Context, spaceID string, flowIDs []string, now time.Time) (map[string]FlowStats, error)
}

// StepRunStore defines persistence operations for per-step execution checkpoints.
// @Mock
type StepRunStore interface {
	Upsert(ctx context.Context, sr *StepRun) error
	ListByFlowRun(ctx context.Context, spaceID string, flowRunID string) ([]StepRun, error)
}

// Store aggregates all workflow persistence stores.
type Store interface {
	Flows() FlowStore
	Triggers() TriggerStore
	FlowRuns() FlowRunStore
	StepRuns() StepRunStore
}

// LLMRequest captures parameters passed from an `llm.generate` step to the LLM execution port.
type LLMRequest struct {
	SpaceID           string
	FlowRunID         string
	StepRunID         string
	Model             *ModelConfig
	SystemInstruction string
	Prompt            string
	OutputSchema      map[string]any
	Documents         []ResolvedArtifact
}

// LLMResponse captures the output and telemetry returned by the LLM execution port.
type LLMResponse struct {
	Text       string
	ParsedJSON map[string]any
	TokensUsed int
	AgentRunID string
	ModelName  string
}

// AgentExecutor abstracts LLM prompt execution and `platform.agent_runs` auditing.
// @Mock
type AgentExecutor interface {
	Execute(ctx context.Context, req LLMRequest) (*LLMResponse, error)
}
