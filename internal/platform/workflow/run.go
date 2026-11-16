package workflow

import (
	"maps"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/id"
)

const (
	// FlowRunPrefix is the ID prefix for workflow execution runs.
	FlowRunPrefix = "wfr_"
	// StepRunPrefix is the ID prefix for individual step execution records.
	StepRunPrefix = "wsr_"
)

var (
	// FlowRunIDGenerator generates and validates FlowRun IDs.
	FlowRunIDGenerator = id.NewPrefixGenerator(FlowRunPrefix)
	// StepRunIDGenerator generates and validates StepRun IDs.
	StepRunIDGenerator = id.NewPrefixGenerator(StepRunPrefix)
)

// GenerateFlowRunID generates a new FlowRun ID with the wfr_ prefix.
func GenerateFlowRunID() (string, error) {
	return FlowRunIDGenerator.Generate()
}

// ValidateFlowRunID checks that idStr is a valid FlowRun ID.
func ValidateFlowRunID(idStr string) error {
	return FlowRunIDGenerator.Validate(idStr)
}

// GenerateStepRunID generates a new StepRun ID with the wsr_ prefix.
func GenerateStepRunID() (string, error) {
	return StepRunIDGenerator.Generate()
}

// ValidateStepRunID checks that idStr is a valid StepRun ID.
func ValidateStepRunID(idStr string) error {
	return StepRunIDGenerator.Validate(idStr)
}

// FlowRunStatus represents the execution lifecycle status of a FlowRun.
type FlowRunStatus string

const (
	RunPending   FlowRunStatus = "pending"
	RunRunning   FlowRunStatus = "running"
	RunWaiting   FlowRunStatus = "waiting"
	RunCompleted FlowRunStatus = "completed"
	RunFiltered  FlowRunStatus = "filtered"
	RunStopped   FlowRunStatus = "stopped"
	RunFailed    FlowRunStatus = "failed"
	RunCancelled FlowRunStatus = "cancelled"
)

// IsTerminal reports whether the FlowRunStatus represents a finished run that should not be re-executed.
func (s FlowRunStatus) IsTerminal() bool {
	return s == RunCompleted || s == RunFiltered || s == RunStopped || s == RunCancelled
}

// StepRunStatus represents the execution status of an individual StepRun.
type StepRunStatus string

const (
	StepRunning         StepRunStatus = "running"
	StepCompleted       StepRunStatus = "completed"
	StepFiltered        StepRunStatus = "filtered"
	StepStopped         StepRunStatus = "stopped"
	StepFailed          StepRunStatus = "failed"
	StepFailedContinued StepRunStatus = "failed_continued"
)

// FlowRun records a single execution of a Flow.
type FlowRun struct {
	ID             string         `db:"id" json:"id"`
	SpaceID        string         `db:"space_id" json:"space_id"`
	FlowID         string         `db:"flow_id" json:"flow_id"`
	FlowVersion    int64          `db:"flow_version" json:"flow_version"`
	TriggerID      *string        `db:"trigger_id" json:"trigger_id,omitempty"`
	IdempotencyKey *string        `db:"idempotency_key" json:"idempotency_key,omitempty"`
	Status         FlowRunStatus  `db:"status" json:"status"`
	Attempts       int            `db:"attempts" json:"attempts"`
	TriggerData    map[string]any `json:"trigger_data,omitempty"`
	Input          map[string]any `json:"input,omitempty"`
	Output         map[string]any `json:"output,omitempty"`
	Error          *FlowError     `json:"error,omitempty"`
	Metadata       map[string]any `json:"metadata,omitempty"`
	ResumeTime     *time.Time     `db:"resume_time" json:"resume_time,omitempty"`
	StartTime      *time.Time     `db:"start_time" json:"start_time,omitempty"`
	EndTime        *time.Time     `db:"end_time" json:"end_time,omitempty"`
	CreateTime     time.Time      `db:"create_time" json:"create_time"`
	UpdateTime     time.Time      `db:"update_time" json:"update_time"`
	StepRuns       []StepRun      `json:"step_runs,omitempty"`
}

// StepRun records the execution state and output of an individual step invocation.
type StepRun struct {
	ID           string         `db:"id" json:"id"`
	FlowRunID    string         `db:"flow_run_id" json:"flow_run_id"`
	SpaceID      string         `db:"space_id" json:"space_id"`
	StepID       string         `db:"step_id" json:"step_id"`
	StepType     string         `db:"step_type" json:"step_type"`
	ExecutionKey string         `db:"execution_key" json:"execution_key"`
	Status       StepRunStatus  `db:"status" json:"status"`
	Output       map[string]any `json:"output,omitempty"`
	Error        *FlowError     `json:"error,omitempty"`
	Metadata     map[string]any `json:"metadata,omitempty"`
	AIRunID      *string        `db:"ai_run_id" json:"ai_run_id,omitempty"`
	StartTime    time.Time      `db:"start_time" json:"start_time"`
	EndTime      *time.Time     `db:"end_time" json:"end_time,omitempty"`
	CreateTime   time.Time      `db:"create_time" json:"create_time"`
	UpdateTime   time.Time      `db:"update_time" json:"update_time"`
}

// ListFlowRunsFilter filters paginated FlowRun queries.
type ListFlowRunsFilter struct {
	SpaceID   string
	FlowID    *string
	Status    *FlowRunStatus
	PageSize  int
	PageToken string
}

// SpaceContext exposes workspace settings to CEL expressions and steps.
type SpaceContext struct {
	ID              string `json:"id"`
	Name            string `json:"name"`
	Timezone        string `json:"timezone"`
	DefaultCurrency string `json:"default_currency"`
}

// RunContext exposes execution metadata to CEL expressions and steps.
type RunContext struct {
	ID     string    `json:"id"`
	FlowID string    `json:"flow_id"`
	Mode   string    `json:"mode"` // "live", "test", "manual", "webhook", "event", "schedule"
	Now    time.Time `json:"now"`
}

// TriggerContext exposes the active trigger envelope to CEL expressions.
type TriggerContext struct {
	ID    string         `json:"id"`
	Type  string         `json:"type"`
	Topic string         `json:"topic"`
	Data  map[string]any `json:"data"`
}

// FlowState implements loom/graph.State[*FlowState] for dynamic workflow execution.
type FlowState struct {
	Space          SpaceContext
	Run            RunContext
	Trigger        TriggerContext
	Input          map[string]any
	Steps          map[string]any
	Loop           map[string]any
	Output         map[string]any
	TerminalStatus FlowRunStatus
	FilterReason   string
	StopReason     string
	TerminalError  *FlowError
	TotalTokens    int
	RouteChoice    string
}

// Copy implements loom/graph.State[*FlowState].
func (s *FlowState) Copy() *FlowState {
	if s == nil {
		return nil
	}
	cp := *s
	if s.Trigger.Data != nil {
		cp.Trigger.Data = maps.Clone(s.Trigger.Data)
	}
	if s.Input != nil {
		cp.Input = maps.Clone(s.Input)
	}
	if s.Steps != nil {
		cp.Steps = maps.Clone(s.Steps)
	}
	if s.Loop != nil {
		cp.Loop = maps.Clone(s.Loop)
	}
	if s.Output != nil {
		cp.Output = maps.Clone(s.Output)
	}
	if s.TerminalError != nil {
		errCopy := *s.TerminalError
		cp.TerminalError = &errCopy
	}
	return &cp
}

// ToActivation converts FlowState and optional step-local sources into a CEL variable map.
func (s *FlowState) ToActivation(sources map[string]any) map[string]any {
	spaceMap := map[string]any{
		"id":               s.Space.ID,
		"name":             s.Space.Name,
		"timezone":         s.Space.Timezone,
		"default_currency": s.Space.DefaultCurrency,
	}
	runMap := map[string]any{
		"id":      s.Run.ID,
		"flow_id": s.Run.FlowID,
		"mode":    s.Run.Mode,
		"now":     s.Run.Now,
	}
	trigMap := map[string]any{
		"id":    s.Trigger.ID,
		"type":  s.Trigger.Type,
		"topic": s.Trigger.Topic,
		"data":  nonNilMap(s.Trigger.Data),
	}
	return map[string]any{
		"space":         spaceMap,
		"run":           runMap,
		"trigger":       trigMap,
		"input":         nonNilMap(s.Input),
		"steps":         nonNilMap(s.Steps),
		loopInternalVar: nonNilMap(s.Loop),
		"sources":       nonNilMap(sources),
	}
}

func nonNilMap(m map[string]any) map[string]any {
	if m == nil {
		return map[string]any{}
	}
	return m
}
