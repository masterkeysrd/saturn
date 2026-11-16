package mcpworkflow

//go:generate go run github.com/masterkeysrd/saturn/tools/mockgen .

import (
	"context"
	"strings"
	"time"

	workflowaggregator "github.com/masterkeysrd/saturn/internal/aggregator/workflow"
	spaceapp "github.com/masterkeysrd/saturn/internal/application/space"
	workflowapp "github.com/masterkeysrd/saturn/internal/application/workflow"
	"github.com/masterkeysrd/saturn/internal/domain/identity"
	"github.com/masterkeysrd/saturn/internal/domain/space"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/settings"
	"github.com/masterkeysrd/saturn/internal/platform/workflow"
	mcptransport "github.com/masterkeysrd/saturn/internal/transport/mcp"
)

const (
	defaultFlowsLimit = 20
	maxFlowsLimit     = 100
)

// WorkflowAggregator defines read-only workflow and run queries.
// @Mock
type WorkflowAggregator interface {
	ListFlows(ctx context.Context, filter workflow.ListFlowsFilter) ([]*workflow.Flow, error)
	GetFlowRun(ctx context.Context, id string) (*workflowaggregator.FlowRunView, error)
}

// WorkflowCoordinator defines workflow execution commands.
// @Mock
type WorkflowCoordinator interface {
	ExecuteFlow(ctx context.Context, req *workflowapp.ExecuteFlowRequest) (*workflow.FlowRun, error)
}

// SpaceSettingsReader retrieves the workspace IANA timezone.
// @Mock
type SpaceSettingsReader interface {
	GetSettings(ctx context.Context, req *spaceapp.GetSettingsRequest) (*settings.Entry[space.Settings], error)
}

// Dependencies holds the collaborators required by the workflow MCP handler.
type Dependencies struct {
	Aggregator    WorkflowAggregator
	Coordinator   WorkflowCoordinator
	SpaceSettings SpaceSettingsReader
}

// Handler adapts workflow queries and execution into curated MCP tools.
type Handler struct {
	agg           WorkflowAggregator
	coord         WorkflowCoordinator
	spaceSettings SpaceSettingsReader
}

// NewHandler constructs a new workflow MCP Handler.
func NewHandler(deps Dependencies) *Handler {
	return &Handler{
		agg:           deps.Aggregator,
		coord:         deps.Coordinator,
		spaceSettings: deps.SpaceSettings,
	}
}

// Register registers workflow MCP tools onto the registry.
func (h *Handler) Register(reg *mcptransport.Registry) {
	reg.RegisterTool(mcptransport.ToolSpec{
		Name:          "workflows_list_flows",
		Domain:        "workflows",
		Title:         "List Workflows",
		Description:   "Lists workflow definitions in the workspace with enabled/system filters and 7-day execution stats.",
		RequiredScope: identity.ScopeWorkflowsRead,
		ReadOnly:      true,
	}, h.listFlows)

	reg.RegisterTool(mcptransport.ToolSpec{
		Name:          "workflows_get_flow_run",
		Domain:        "workflows",
		Title:         "Get Workflow Run",
		Description:   "Retrieves a workflow execution run hydrated with step execution traces and terminal output.",
		RequiredScope: identity.ScopeWorkflowsRead,
		ReadOnly:      true,
	}, h.getFlowRun)

	reg.RegisterTool(mcptransport.ToolSpec{
		Name:          "workflows_execute_flow",
		Domain:        "workflows",
		Title:         "Execute Workflow",
		Description:   "Executes a saved workflow by ID or system key, synchronously by default or asynchronously.",
		RequiredScope: identity.ScopeWorkflowsExecute,
		ReadOnly:      false,
		Destructive:   false,
	}, h.executeFlow)
}

// ListFlowsInput defines parameters for workflows_list_flows.
type ListFlowsInput struct {
	IsSystem  *bool `json:"is_system,omitempty" jsonschema:"Filter by built-in system flow status"`
	IsEnabled *bool `json:"is_enabled,omitempty" jsonschema:"Filter by enabled status"`
	Limit     int   `json:"limit,omitempty" jsonschema:"Maximum flows to return (1-100, default 20)"`
}

// FlowSummary summarizes a workspace workflow definition.
type FlowSummary struct {
	ID           string `json:"id"`
	SystemKey    string `json:"system_key,omitempty"`
	IsSystem     bool   `json:"is_system"`
	IsEnabled    bool   `json:"is_enabled"`
	Name         string `json:"name"`
	Description  string `json:"description"`
	StepCount    int    `json:"step_count"`
	TriggerCount int    `json:"trigger_count"`
	TotalRuns7d  int32  `json:"total_runs_7d"`
}

// ListFlowsOutput is returned by workflows_list_flows.
type ListFlowsOutput struct {
	Flows     []FlowSummary `json:"flows"`
	Truncated bool          `json:"truncated"`
}

func (h *Handler) listFlows(ctx context.Context, in ListFlowsInput) (ListFlowsOutput, error) {
	if _, err := mcptransport.RequireSpaceID(ctx); err != nil {
		return ListFlowsOutput{}, err
	}

	flows, err := h.agg.ListFlows(ctx, workflow.ListFlowsFilter{
		IsSystem:  in.IsSystem,
		IsEnabled: in.IsEnabled,
	})
	if err != nil {
		return ListFlowsOutput{}, err
	}

	limit := mcptransport.ClampLimit(in.Limit, defaultFlowsLimit, maxFlowsLimit)

	truncated := len(flows) > limit
	if truncated {
		flows = flows[:limit]
	}

	items := make([]FlowSummary, 0, len(flows))
	for _, f := range flows {
		item := FlowSummary{
			ID:           f.ID,
			IsSystem:     f.IsSystem,
			IsEnabled:    f.IsEnabled,
			Name:         f.Name,
			Description:  f.Description,
			StepCount:    len(f.Steps),
			TriggerCount: len(f.Triggers),
		}
		if f.SystemKey != nil {
			item.SystemKey = *f.SystemKey
		}
		if f.Stats != nil {
			item.TotalRuns7d = f.Stats.TotalRuns7d
		}
		items = append(items, item)
	}

	return ListFlowsOutput{
		Flows:     items,
		Truncated: truncated,
	}, nil
}

// GetFlowRunInput defines parameters for workflows_get_flow_run.
type GetFlowRunInput struct {
	ID string `json:"id" jsonschema:"Workflow run ID (wfr_...)"`
}

// StepRunSummary summarizes a single step run inside a workflow run.
type StepRunSummary struct {
	StepID   string         `json:"step_id"`
	StepType string         `json:"step_type"`
	Status   string         `json:"status"`
	Output   map[string]any `json:"output,omitempty"`
	Error    string         `json:"error,omitempty"`
}

// FlowRunOutput represents a workflow run and its step timeline.
type FlowRunOutput struct {
	ID         string           `json:"id"`
	FlowID     string           `json:"flow_id"`
	FlowName   string           `json:"flow_name,omitempty"`
	Status     string           `json:"status"`
	Output     map[string]any   `json:"output,omitempty"`
	Error      string           `json:"error,omitempty"`
	CreateTime string           `json:"create_time"`
	StepRuns   []StepRunSummary `json:"step_runs"`
}

func (h *Handler) getFlowRun(ctx context.Context, in GetFlowRunInput) (FlowRunOutput, error) {
	spaceID, err := mcptransport.RequireSpaceID(ctx)
	if err != nil {
		return FlowRunOutput{}, err
	}
	id := strings.TrimSpace(in.ID)
	if id == "" {
		return FlowRunOutput{}, errors.E(errors.Invalid, "flow run id is required")
	}

	view, err := h.agg.GetFlowRun(ctx, id)
	if err != nil {
		return FlowRunOutput{}, err
	}

	loc := mcptransport.ResolveLocation(ctx, h.spaceSettings.GetSettings, spaceID)
	out := FlowRunOutput{
		ID:         view.ID,
		FlowID:     view.FlowID,
		Status:     string(view.Status),
		Output:     view.Output,
		CreateTime: view.CreateTime.In(loc).Format(time.RFC3339),
	}
	if view.FlowName != nil {
		out.FlowName = *view.FlowName
	}
	if view.Error != nil {
		out.Error = view.Error.Message
	}

	steps := make([]StepRunSummary, 0, len(view.StepRuns))
	for _, sr := range view.StepRuns {
		s := StepRunSummary{
			StepID:   sr.StepID,
			StepType: sr.StepType,
			Status:   string(sr.Status),
			Output:   sr.Output,
		}
		if sr.Error != nil {
			s.Error = sr.Error.Message
		}
		steps = append(steps, s)
	}
	out.StepRuns = steps

	return out, nil
}

// ExecuteFlowInput defines parameters for workflows_execute_flow.
type ExecuteFlowInput struct {
	ID    string         `json:"id" jsonschema:"Flow ID (flw_...) or system key (system.*)"`
	Input map[string]any `json:"input,omitempty" jsonschema:"Optional JSON input matching the flow input schema"`
	Async bool           `json:"async,omitempty" jsonschema:"If true, dispatches asynchronously and returns pending status"`
}

// ExecuteFlowOutput summarizes the initiated or completed workflow run.
type ExecuteFlowOutput struct {
	ID     string         `json:"id"`
	FlowID string         `json:"flow_id"`
	Status string         `json:"status"`
	Output map[string]any `json:"output,omitempty"`
	Error  string         `json:"error,omitempty"`
}

func (h *Handler) executeFlow(ctx context.Context, in ExecuteFlowInput) (ExecuteFlowOutput, error) {
	if _, err := mcptransport.RequireSpaceID(ctx); err != nil {
		return ExecuteFlowOutput{}, err
	}
	id := strings.TrimSpace(in.ID)
	if id == "" {
		return ExecuteFlowOutput{}, errors.E(errors.Invalid, "flow id is required")
	}

	run, err := h.coord.ExecuteFlow(ctx, &workflowapp.ExecuteFlowRequest{
		ID:    id,
		Input: in.Input,
		Async: in.Async,
	})
	if err != nil {
		return ExecuteFlowOutput{}, err
	}

	out := ExecuteFlowOutput{
		ID:     run.ID,
		FlowID: run.FlowID,
		Status: string(run.Status),
		Output: run.Output,
	}
	if run.Error != nil {
		out.Error = run.Error.Message
	}
	return out, nil
}
