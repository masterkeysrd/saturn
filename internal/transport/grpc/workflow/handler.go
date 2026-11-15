package workflow

import (
	"context"
	"strings"

	workflowv1 "github.com/masterkeysrd/saturn/apis/saturn/platform/workflow/v1"
	workflowaggregator "github.com/masterkeysrd/saturn/internal/aggregator/workflow"
	workflowapp "github.com/masterkeysrd/saturn/internal/application/workflow"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/workflow"
	"google.golang.org/protobuf/types/known/emptypb"
)

// Aggregator defines the read-only CQRS queries required by the workflow gRPC handler.
type Aggregator interface {
	ListFlows(ctx context.Context, filter workflow.ListFlowsFilter) ([]*workflow.Flow, error)
	GetFlow(ctx context.Context, idOrSystemKey string) (*workflow.Flow, error)
	ListFlowRuns(ctx context.Context, filter workflow.ListFlowRunsFilter) (*workflowaggregator.FlowRunListResult, error)
	GetFlowRun(ctx context.Context, id string) (*workflowaggregator.FlowRunView, error)
	GetCatalog() workflow.Catalog
}

// Handler adapts gRPC WorkflowService RPCs to workflowapp.Coordinator and workflowaggregator.Service.
type Handler struct {
	workflowv1.UnimplementedWorkflowServiceServer
	coordinator workflowapp.Coordinator
	aggregator  Aggregator
}

// NewHandler constructs a new WorkflowService gRPC Handler.
func NewHandler(coordinator workflowapp.Coordinator, aggregator Aggregator) *Handler {
	return &Handler{
		coordinator: coordinator,
		aggregator:  aggregator,
	}
}

// ListFlows lazily ensures system flows exist for the workspace and returns all flows hydrated with triggers & stats.
func (h *Handler) ListFlows(ctx context.Context, req *workflowv1.ListFlowsRequest) (*workflowv1.ListFlowsResponse, error) {
	if err := h.coordinator.EnsureSystemFlows(ctx); err != nil {
		return nil, err
	}

	filter := workflow.ListFlowsFilter{
		IsSystem:  req.IsSystem,
		IsEnabled: req.IsEnabled,
	}
	flows, err := h.aggregator.ListFlows(ctx, filter)
	if err != nil {
		return nil, err
	}

	pbFlows := make([]*workflowv1.Flow, 0, len(flows))
	for _, f := range flows {
		pb, pErr := toProtoFlow(f)
		if pErr != nil {
			return nil, pErr
		}
		pbFlows = append(pbFlows, pb)
	}
	return &workflowv1.ListFlowsResponse{Flows: pbFlows}, nil
}

// GetFlow retrieves a single flow by flw_... ID or system.* key, lazily seeding system flows if needed.
func (h *Handler) GetFlow(ctx context.Context, req *workflowv1.GetFlowRequest) (*workflowv1.Flow, error) {
	flow, err := h.aggregator.GetFlow(ctx, req.Id)
	if err != nil && strings.HasPrefix(req.Id, "system.") &&
		(errors.Is(err, workflow.ErrFlowNotFound) || errors.Is(err, errors.NotExist)) {
		if seedErr := h.coordinator.EnsureSystemFlows(ctx); seedErr != nil {
			return nil, seedErr
		}
		flow, err = h.aggregator.GetFlow(ctx, req.Id)
	}
	if err != nil {
		return nil, err
	}
	return toProtoFlow(flow)
}

// CreateFlow creates a new user-defined workflow with its trigger bindings and steps.
func (h *Handler) CreateFlow(ctx context.Context, req *workflowv1.CreateFlowRequest) (*workflowv1.Flow, error) {
	created, err := h.coordinator.CreateFlow(ctx, fromProtoFlow(req.Flow))
	if err != nil {
		return nil, err
	}
	return toProtoFlow(created)
}

// UpdateFlow updates an existing flow definition using an optional FieldMask.
func (h *Handler) UpdateFlow(ctx context.Context, req *workflowv1.UpdateFlowRequest) (*workflowv1.Flow, error) {
	var mask []string
	if req.UpdateMask != nil {
		mask = req.UpdateMask.Paths
	}
	updated, err := h.coordinator.UpdateFlow(ctx, &workflowapp.UpdateFlowRequest{
		ID:         req.Id,
		Flow:       fromProtoFlow(req.Flow),
		UpdateMask: mask,
	})
	if err != nil {
		return nil, err
	}
	return toProtoFlow(updated)
}

// DeleteFlow deletes a user-defined workflow.
func (h *Handler) DeleteFlow(ctx context.Context, req *workflowv1.DeleteFlowRequest) (*emptypb.Empty, error) {
	if err := h.coordinator.DeleteFlow(ctx, req.Id); err != nil {
		return nil, err
	}
	return &emptypb.Empty{}, nil
}

// EnableFlow activates a workflow.
func (h *Handler) EnableFlow(ctx context.Context, req *workflowv1.EnableFlowRequest) (*workflowv1.Flow, error) {
	flow, err := h.coordinator.EnableFlow(ctx, req.Id)
	if err != nil {
		return nil, err
	}
	return toProtoFlow(flow)
}

// DisableFlow deactivates a workflow.
func (h *Handler) DisableFlow(ctx context.Context, req *workflowv1.DisableFlowRequest) (*workflowv1.Flow, error) {
	flow, err := h.coordinator.DisableFlow(ctx, req.Id)
	if err != nil {
		return nil, err
	}
	return toProtoFlow(flow)
}

// ResetFlow restores a built-in system flow to factory blueprint defaults.
func (h *Handler) ResetFlow(ctx context.Context, req *workflowv1.ResetFlowRequest) (*workflowv1.Flow, error) {
	flow, err := h.coordinator.ResetFlow(ctx, req.Id)
	if err != nil {
		return nil, err
	}
	return toProtoFlow(flow)
}

// ExecuteFlow runs a flow synchronously or dispatches it asynchronously.
func (h *Handler) ExecuteFlow(ctx context.Context, req *workflowv1.ExecuteFlowRequest) (*workflowv1.FlowRun, error) {
	run, err := h.coordinator.ExecuteFlow(ctx, &workflowapp.ExecuteFlowRequest{
		ID:        req.Id,
		Input:     fromStructPB(req.Input),
		Artifacts: fromProtoInlineArtifacts(req.Artifacts),
		Async:     req.Async,
	})
	if err != nil {
		return nil, err
	}
	return toProtoFlowRun(run, nil)
}

// InvokeWebhookTrigger triggers an asynchronous FlowRun for a webhook trigger.
func (h *Handler) InvokeWebhookTrigger(ctx context.Context, req *workflowv1.InvokeWebhookTriggerRequest) (*workflowv1.FlowRun, error) {
	run, err := h.coordinator.InvokeWebhookTrigger(ctx, &workflowapp.InvokeWebhookTriggerRequest{
		TriggerID: req.TriggerId,
		Payload:   fromStructPB(req.Payload),
	})
	if err != nil {
		return nil, err
	}
	return toProtoFlowRun(run, nil)
}

// TestFlow runs a saved or unsaved Flow in-memory without persisting throwaway runs.
func (h *Handler) TestFlow(ctx context.Context, req *workflowv1.TestFlowRequest) (*workflowv1.FlowRun, error) {
	run, err := h.coordinator.TestFlow(ctx, &workflowapp.TestFlowRequest{
		Flow:        fromProtoFlow(req.Flow),
		TriggerData: fromStructPB(req.TriggerData),
		Input:       fromStructPB(req.Input),
		Artifacts:   fromProtoInlineArtifacts(req.Artifacts),
	})
	if err != nil {
		return nil, err
	}
	return toProtoFlowRun(run, nil)
}

// GenerateFlow generates a validated unsaved Flow draft from a natural-language prompt.
func (h *Handler) GenerateFlow(ctx context.Context, req *workflowv1.GenerateFlowRequest) (*workflowv1.Flow, error) {
	flow, err := h.coordinator.GenerateFlow(ctx, &workflowapp.GenerateFlowRequest{
		Prompt: req.Prompt,
		Model:  fromProtoModelConfig(req.Model),
	})
	if err != nil {
		return nil, err
	}
	return toProtoFlow(flow)
}

// ListFlowRuns returns paginated FlowRun summaries for the workspace.
func (h *Handler) ListFlowRuns(ctx context.Context, req *workflowv1.ListFlowRunsRequest) (*workflowv1.ListFlowRunsResponse, error) {
	var statusPtr *workflow.FlowRunStatus
	if req.Status != nil && strings.TrimSpace(*req.Status) != "" {
		statusVal := workflow.FlowRunStatus(strings.TrimSpace(*req.Status))
		statusPtr = &statusVal
	}

	res, err := h.aggregator.ListFlowRuns(ctx, workflow.ListFlowRunsFilter{
		FlowID:    req.FlowId,
		Status:    statusPtr,
		PageSize:  int(req.PageSize),
		PageToken: req.PageToken,
	})
	if err != nil {
		return nil, err
	}

	runsPB := make([]*workflowv1.FlowRun, 0, len(res.Runs))
	for _, r := range res.Runs {
		pb, pErr := toProtoFlowRunView(r)
		if pErr != nil {
			return nil, pErr
		}
		runsPB = append(runsPB, pb)
	}
	return &workflowv1.ListFlowRunsResponse{
		Runs:          runsPB,
		NextPageToken: res.NextPageToken,
	}, nil
}

// GetFlowRun retrieves a single FlowRun hydrated with StepRuns.
func (h *Handler) GetFlowRun(ctx context.Context, req *workflowv1.GetFlowRunRequest) (*workflowv1.FlowRun, error) {
	view, err := h.aggregator.GetFlowRun(ctx, req.Id)
	if err != nil {
		return nil, err
	}
	return toProtoFlowRunView(view)
}

// GetCatalog returns all registered trigger topics, steps, data loaders, and CEL helpers.
func (h *Handler) GetCatalog(_ context.Context, _ *workflowv1.GetCatalogRequest) (*workflowv1.Catalog, error) {
	return toProtoCatalog(h.aggregator.GetCatalog())
}
