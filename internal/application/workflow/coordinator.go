package workflowapp

//go:generate go run github.com/masterkeysrd/saturn/tools/mockgen .
//go:generate go run github.com/masterkeysrd/saturn/tools/txgen -target=Coordinator
//go:generate go run github.com/masterkeysrd/saturn/tools/loggen -target=Coordinator -component=workflow

import (
	"context"
	"fmt"
	"maps"
	"strings"
	"time"

	"github.com/masterkeysrd/saturn/internal/domain/space"
	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	"github.com/masterkeysrd/saturn/internal/platform/ai"
	"github.com/masterkeysrd/saturn/internal/platform/db"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/scheduler"
	"github.com/masterkeysrd/saturn/internal/platform/workflow"
)

const (
	// JobTypeExecuteTrigger is the scheduler job type used by cron-scheduled workflow triggers.
	JobTypeExecuteTrigger = "workflow.execute_trigger"
)

// ScheduleTriggerPayload is the JSON payload stored on platform.schedule rows for cron triggers.
type ScheduleTriggerPayload struct {
	SpaceID   string `json:"space_id"`
	FlowID    string `json:"flow_id"`
	TriggerID string `json:"trigger_id"`
}

// WorkflowService defines the platform/workflow service contract orchestrated by Coordinator.
// @Mock
type WorkflowService interface {
	Catalog() workflow.Catalog
	ValidateFlow(flow *workflow.Flow) error
	EvaluateTriggerFilter(trigger *workflow.Trigger, space workflow.SpaceContext, triggerData map[string]any) (bool, error)
	MapTriggerInput(trigger *workflow.Trigger, space workflow.SpaceContext, triggerData map[string]any) (map[string]any, error)
	Execute(ctx context.Context, opts workflow.ExecuteOptions) (*workflow.FlowRun, error)
	EnsureSystemFlows(ctx context.Context, spaceID string) ([]*workflow.Flow, error)
	ResolveFlowOrSeedSystem(ctx context.Context, spaceID, idOrSystemKey string) (*workflow.Flow, error)
	CreateFlow(ctx context.Context, flow *workflow.Flow) (*workflow.Flow, error)
	UpdateFlow(ctx context.Context, spaceID, id string, incoming *workflow.Flow, mask []string) (*workflow.Flow, []workflow.Trigger, error)
	DeleteFlow(ctx context.Context, spaceID, id string) ([]workflow.Trigger, error)
	SetFlowEnabled(ctx context.Context, spaceID, idOrSystemKey string, enabled bool) (*workflow.Flow, error)
	ResetFlow(ctx context.Context, spaceID, idOrSystemKey string) (*workflow.Flow, []workflow.Trigger, error)
	GetFlow(ctx context.Context, spaceID, idOrSystemKey string) (*workflow.Flow, error)
	GetTrigger(ctx context.Context, spaceID, triggerID string) (*workflow.Trigger, error)
	CreateOrResumeRun(ctx context.Context, run *workflow.FlowRun) (*workflow.FlowRun, bool, error)
	GetFlowRun(ctx context.Context, spaceID, id string) (*workflow.FlowRun, error)
}

// SpaceContextLoader resolves workspace metadata, timezone, and default currency for workflow execution.
// @Mock
type SpaceContextLoader interface {
	Load(ctx context.Context, spaceID string) (workflow.SpaceContext, error)
}

// RunDispatcher enqueues asynchronous execution of a persisted pending FlowRun.
// @Mock
type RunDispatcher interface {
	Dispatch(ctx context.Context, spaceID string, flowRunID string) error
}

// ScheduleSyncer synchronizes cron schedule triggers with platform.schedule.
// @Mock
type ScheduleSyncer interface {
	RegisterSchedule(ctx context.Context, s scheduler.Schedule) error
	PauseSchedule(ctx context.Context, scheduleID string) error
}

// AIRunner abstracts platform/ai.Runtime for workflow LLM generation, agent steps, and Prompt-to-Flow generation.
// @Mock
type AIRunner interface {
	Generate(ctx context.Context, req ai.GenerateRequest) (*ai.Run, error)
	RunAgent(ctx context.Context, req ai.RunAgentRequest) (*ai.Run, error)
}

// UpdateFlowRequest encapsulates partial or full updates to a workflow definition.
type UpdateFlowRequest struct {
	ID         string
	Flow       *workflow.Flow
	UpdateMask []string
}

// InlineArtifact carries a binary file uploaded inline for ExecuteFlow or TestFlow.
type InlineArtifact struct {
	Filename    string
	ContentType string
	Data        []byte
	FieldName   string
}

// ExecuteFlowRequest encapsulates inputs for executing a saved flow by ID or system_key.
type ExecuteFlowRequest struct {
	ID        string
	Input     map[string]any
	Artifacts []InlineArtifact
	Async     bool
}

// InvokeWebhookTriggerRequest encapsulates an external webhook trigger invocation.
type InvokeWebhookTriggerRequest struct {
	TriggerID string
	Payload   map[string]any
}

// TestFlowRequest encapsulates inputs for running a flow in-memory without persisting throwaway runs.
type TestFlowRequest struct {
	Flow        *workflow.Flow
	TriggerData map[string]any
	Input       map[string]any
	Artifacts   []InlineArtifact
}

// GenerateFlowRequest encapsulates inputs for Prompt-to-Flow AI generation.
type GenerateFlowRequest struct {
	Prompt string
	Model  *workflow.ModelConfig
}

// DispatchEventTriggerRequest encapsulates inputs for evaluating and enqueueing an eventbus trigger.
type DispatchEventTriggerRequest struct {
	SpaceID        string
	Trigger        *workflow.Trigger
	TriggerData    map[string]any
	IdempotencyKey string
	Metadata       map[string]any
}

// Coordinator orchestrates workflow lifecycle across platform/workflow, platform/scheduler,
// platform/eventbus, application/agent, and domain/space.
// @Mock
// @logged
type Coordinator interface {
	// @transactional
	EnsureSystemFlows(ctx context.Context) error

	// @transactional
	CreateFlow(ctx context.Context, flow *workflow.Flow) (*workflow.Flow, error)

	// @transactional
	UpdateFlow(ctx context.Context, req *UpdateFlowRequest) (*workflow.Flow, error)

	// @transactional
	DeleteFlow(ctx context.Context, id string) error

	// @transactional
	EnableFlow(ctx context.Context, idOrSystemKey string) (*workflow.Flow, error)

	// @transactional
	DisableFlow(ctx context.Context, idOrSystemKey string) (*workflow.Flow, error)

	// @transactional
	ResetFlow(ctx context.Context, idOrSystemKey string) (*workflow.Flow, error)

	ExecuteFlow(ctx context.Context, req *ExecuteFlowRequest) (*workflow.FlowRun, error)

	// @transactional
	InvokeWebhookTrigger(ctx context.Context, req *InvokeWebhookTriggerRequest) (*workflow.FlowRun, error)

	TestFlow(ctx context.Context, req *TestFlowRequest) (*workflow.FlowRun, error)

	GenerateFlow(ctx context.Context, req *GenerateFlowRequest) (*workflow.Flow, error)

	// @transactional
	DispatchEventTrigger(ctx context.Context, req *DispatchEventTriggerRequest) (*workflow.FlowRun, bool, error)

	ExecuteFlowRun(ctx context.Context, spaceID string, flowRunID string) (*workflow.FlowRun, error)

	InvokeScheduleTrigger(ctx context.Context, spaceID string, flowID string, triggerID string) (*workflow.FlowRun, error)
}

// Dependencies groups cross-platform collaborators required to construct a workflow Coordinator.
type Dependencies struct {
	Workflow    WorkflowService
	SpaceLoader SpaceContextLoader
	Dispatcher  RunDispatcher
	Schedules   ScheduleSyncer
	AIRunner    AIRunner
	Transactor  db.Transactor
}

type coordinator struct {
	workflow    WorkflowService
	spaceLoader SpaceContextLoader
	dispatcher  RunDispatcher
	schedules   ScheduleSyncer
	aiRunner    AIRunner
	txr         db.Transactor
}

// NewCoordinator constructs a new workflow application Coordinator.
func NewCoordinator(deps Dependencies) Coordinator {
	return &coordinator{
		workflow:    deps.Workflow,
		spaceLoader: deps.SpaceLoader,
		dispatcher:  deps.Dispatcher,
		schedules:   deps.Schedules,
		aiRunner:    deps.AIRunner,
		txr:         deps.Transactor,
	}
}

func getSpaceID(ctx context.Context, op errors.Op) (string, error) {
	spaceID, ok := auth.SpaceIDFromContext(ctx)
	if !ok || strings.TrimSpace(spaceID) == "" {
		return "", errors.E(op, errors.Unauthenticated, "missing active space context")
	}
	return spaceID, nil
}

func requireWriteAccess(ctx context.Context, op errors.Op) (string, error) {
	spaceID, err := getSpaceID(ctx, op)
	if err != nil {
		return "", err
	}
	role, ok := auth.SpaceRoleFromContext(ctx)
	if !ok || role == string(space.RoleViewer) || role == "viewer" {
		return "", errors.E(op, errors.Permission, "viewer role cannot modify or execute workflows")
	}
	return spaceID, nil
}

// EnsureSystemFlows lazily materializes all registered built-in system flow blueprints and syncs their schedules.
func (c *coordinator) EnsureSystemFlows(ctx context.Context) error {
	const op errors.Op = "application/workflow.EnsureSystemFlows"

	spaceID, err := getSpaceID(ctx, op)
	if err != nil {
		return err
	}

	ensured, err := c.workflow.EnsureSystemFlows(ctx, spaceID)
	if err != nil {
		return errors.E(op, err)
	}
	for _, flow := range ensured {
		if err := c.syncSchedules(ctx, spaceID, flow, nil); err != nil {
			return errors.E(op, err)
		}
	}
	return nil
}

// CreateFlow validates and persists a new user-defined workflow and registers any cron schedules.
func (c *coordinator) CreateFlow(ctx context.Context, incoming *workflow.Flow) (*workflow.Flow, error) {
	const op errors.Op = "application/workflow.CreateFlow"

	spaceID, err := requireWriteAccess(ctx, op)
	if err != nil {
		return nil, err
	}
	if incoming == nil {
		return nil, errors.E(op, errors.Invalid, "flow payload is required")
	}

	flow := &workflow.Flow{
		SpaceID:     spaceID,
		IsEnabled:   incoming.IsEnabled,
		Name:        strings.TrimSpace(incoming.Name),
		Description: incoming.Description,
		Config:      incoming.Config,
		InputSchema: incoming.InputSchema,
		Steps:       incoming.Steps,
		Triggers:    incoming.Triggers,
		Version:     1,
	}

	created, err := c.workflow.CreateFlow(ctx, flow)
	if err != nil {
		return nil, errors.E(op, err)
	}
	if err := c.syncSchedules(ctx, spaceID, created, nil); err != nil {
		return nil, errors.E(op, err)
	}
	return created, nil
}

// UpdateFlow validates and applies masked or full updates to an existing workflow and syncs schedules.
func (c *coordinator) UpdateFlow(ctx context.Context, req *UpdateFlowRequest) (*workflow.Flow, error) {
	const op errors.Op = "application/workflow.UpdateFlow"

	spaceID, err := requireWriteAccess(ctx, op)
	if err != nil {
		return nil, err
	}
	if req == nil || strings.TrimSpace(req.ID) == "" || req.Flow == nil {
		return nil, errors.E(op, errors.Invalid, "flow id and flow payload are required")
	}

	updated, oldTriggers, err := c.workflow.UpdateFlow(ctx, spaceID, req.ID, req.Flow, req.UpdateMask)
	if err != nil {
		return nil, errors.E(op, err)
	}
	if err := c.syncSchedules(ctx, spaceID, updated, oldTriggers); err != nil {
		return nil, errors.E(op, err)
	}
	return updated, nil
}

// DeleteFlow deletes a user-defined workflow and pauses any linked cron schedules.
func (c *coordinator) DeleteFlow(ctx context.Context, id string) error {
	const op errors.Op = "application/workflow.DeleteFlow"

	spaceID, err := requireWriteAccess(ctx, op)
	if err != nil {
		return err
	}

	triggers, err := c.workflow.DeleteFlow(ctx, spaceID, id)
	if err != nil {
		return errors.E(op, err)
	}
	for i := range triggers {
		if triggers[i].Type == workflow.TriggerSchedule && triggers[i].Config.ScheduleID != nil {
			if err := c.pauseScheduleIfExists(ctx, *triggers[i].Config.ScheduleID); err != nil {
				return errors.E(op, err)
			}
		}
	}
	return nil
}

// EnableFlow activates a workflow and resumes/registers its schedule triggers.
func (c *coordinator) EnableFlow(ctx context.Context, idOrSystemKey string) (*workflow.Flow, error) {
	return c.setFlowEnabled(ctx, idOrSystemKey, true)
}

// DisableFlow deactivates a workflow and pauses its schedule triggers.
func (c *coordinator) DisableFlow(ctx context.Context, idOrSystemKey string) (*workflow.Flow, error) {
	return c.setFlowEnabled(ctx, idOrSystemKey, false)
}

func (c *coordinator) setFlowEnabled(ctx context.Context, idOrSystemKey string, enabled bool) (*workflow.Flow, error) {
	const op errors.Op = "application/workflow.setFlowEnabled"

	spaceID, err := requireWriteAccess(ctx, op)
	if err != nil {
		return nil, err
	}

	flow, err := c.workflow.SetFlowEnabled(ctx, spaceID, idOrSystemKey, enabled)
	if err != nil {
		return nil, errors.E(op, err)
	}
	if err := c.syncSchedules(ctx, spaceID, flow, nil); err != nil {
		return nil, errors.E(op, err)
	}
	return flow, nil
}

// ResetFlow restores a built-in system workflow to its factory defaults and syncs its schedules.
func (c *coordinator) ResetFlow(ctx context.Context, idOrSystemKey string) (*workflow.Flow, error) {
	const op errors.Op = "application/workflow.ResetFlow"

	spaceID, err := requireWriteAccess(ctx, op)
	if err != nil {
		return nil, err
	}

	reset, oldTriggers, err := c.workflow.ResetFlow(ctx, spaceID, idOrSystemKey)
	if err != nil {
		return nil, errors.E(op, err)
	}
	if err := c.syncSchedules(ctx, spaceID, reset, oldTriggers); err != nil {
		return nil, errors.E(op, err)
	}
	return reset, nil
}

// ExecuteFlow executes a saved flow (by flw_... ID or system.* key) synchronously by default or asynchronously.
func (c *coordinator) ExecuteFlow(ctx context.Context, req *ExecuteFlowRequest) (*workflow.FlowRun, error) {
	const op errors.Op = "application/workflow.ExecuteFlow"

	spaceID, err := requireWriteAccess(ctx, op)
	if err != nil {
		return nil, err
	}
	if req == nil || strings.TrimSpace(req.ID) == "" {
		return nil, errors.E(op, errors.Invalid, "flow id is required")
	}

	flow, err := c.workflow.ResolveFlowOrSeedSystem(ctx, spaceID, req.ID)
	if err != nil {
		return nil, errors.E(op, err)
	}
	if !flow.IsEnabled {
		return nil, errors.E(op, workflow.ErrFlowDisabled)
	}

	input, ephemeral := buildInputAndEphemeralArtifacts(req.Input, req.Artifacts)

	if req.Async {
		var createdRun *workflow.FlowRun
		err := c.txr.WithTx(ctx, func(txCtx context.Context) error {
			run := &workflow.FlowRun{
				SpaceID:     spaceID,
				FlowID:      flow.ID,
				FlowVersion: flow.Version,
				Status:      workflow.RunPending,
				Input:       input,
				Metadata:    map[string]any{"trigger_type": string(workflow.TriggerManual)},
			}
			persisted, _, err := c.workflow.CreateOrResumeRun(txCtx, run)
			if err != nil {
				return err
			}
			createdRun = persisted
			return c.dispatcher.Dispatch(txCtx, spaceID, persisted.ID)
		})
		if err != nil {
			return nil, errors.E(op, err)
		}
		return createdRun, nil
	}

	spaceCtx, err := c.spaceLoader.Load(ctx, spaceID)
	if err != nil {
		return nil, errors.E(op, err)
	}

	run, err := c.workflow.Execute(ctx, workflow.ExecuteOptions{
		Flow:               flow,
		Space:              spaceCtx,
		Input:              input,
		Mode:               string(workflow.TriggerManual),
		Persist:            true,
		EphemeralArtifacts: ephemeral,
	})
	if err != nil {
		return nil, errors.E(op, err)
	}
	return run, nil
}

// InvokeWebhookTrigger validates a webhook trigger, applies CEL filter/input_mapping,
// creates a pending FlowRun, and enqueues async execution via RunDispatcher.
func (c *coordinator) InvokeWebhookTrigger(ctx context.Context, req *InvokeWebhookTriggerRequest) (*workflow.FlowRun, error) {
	const op errors.Op = "application/workflow.InvokeWebhookTrigger"

	spaceID, err := requireWriteAccess(ctx, op)
	if err != nil {
		return nil, err
	}
	if req == nil || strings.TrimSpace(req.TriggerID) == "" {
		return nil, errors.E(op, errors.Invalid, "trigger_id is required")
	}

	trig, err := c.workflow.GetTrigger(ctx, spaceID, req.TriggerID)
	if err != nil {
		return nil, errors.E(op, err)
	}
	if trig.Type != workflow.TriggerWebhook {
		return nil, errors.E(op, errors.Invalid, fmt.Sprintf("trigger %q is %s, expected webhook", trig.ID, trig.Type))
	}
	if !trig.IsEnabled {
		return nil, errors.E(op, workflow.ErrTriggerDisabled)
	}

	flow, err := c.workflow.GetFlow(ctx, spaceID, trig.FlowID)
	if err != nil {
		return nil, errors.E(op, err)
	}
	if !flow.IsEnabled {
		return nil, errors.E(op, workflow.ErrFlowDisabled)
	}

	spaceCtx, err := c.spaceLoader.Load(ctx, spaceID)
	if err != nil {
		return nil, errors.E(op, err)
	}

	passed, err := c.workflow.EvaluateTriggerFilter(trig, spaceCtx, req.Payload)
	if err != nil {
		return nil, errors.E(op, errors.Invalid, err)
	}
	if !passed {
		now := time.Now().UTC()
		filteredRun := &workflow.FlowRun{
			SpaceID:     spaceID,
			FlowID:      flow.ID,
			FlowVersion: flow.Version,
			TriggerID:   new(trig.ID),
			Status:      workflow.RunFiltered,
			TriggerData: req.Payload,
			Metadata:    map[string]any{"trigger_type": string(workflow.TriggerWebhook), "filtered_at_trigger": true},
			StartTime:   new(now),
			EndTime:     new(now),
		}
		persisted, _, err := c.workflow.CreateOrResumeRun(ctx, filteredRun)
		if err != nil {
			return nil, errors.E(op, err)
		}
		return persisted, nil
	}

	mappedInput, err := c.workflow.MapTriggerInput(trig, spaceCtx, req.Payload)
	if err != nil {
		return nil, errors.E(op, errors.Invalid, err)
	}

	run := &workflow.FlowRun{
		SpaceID:     spaceID,
		FlowID:      flow.ID,
		FlowVersion: flow.Version,
		TriggerID:   new(trig.ID),
		Status:      workflow.RunPending,
		TriggerData: req.Payload,
		Input:       mappedInput,
		Metadata:    map[string]any{"trigger_type": string(workflow.TriggerWebhook)},
	}
	persisted, _, err := c.workflow.CreateOrResumeRun(ctx, run)
	if err != nil {
		return nil, errors.E(op, err)
	}
	if err := c.dispatcher.Dispatch(ctx, spaceID, persisted.ID); err != nil {
		return nil, errors.E(op, err)
	}
	return persisted, nil
}

// TestFlow runs a saved or unsaved Flow definition in-memory with zero database persistence.
func (c *coordinator) TestFlow(ctx context.Context, req *TestFlowRequest) (*workflow.FlowRun, error) {
	const op errors.Op = "application/workflow.TestFlow"

	spaceID, err := requireWriteAccess(ctx, op)
	if err != nil {
		return nil, err
	}
	if req == nil || req.Flow == nil {
		return nil, errors.E(op, errors.Invalid, "flow is required")
	}

	flow := *req.Flow
	flow.SpaceID = spaceID
	if err := c.workflow.ValidateFlow(&flow); err != nil {
		return nil, errors.E(op, errors.Invalid, errors.Code("WORKFLOW_VALIDATION_FAILED"), err)
	}

	spaceCtx, err := c.spaceLoader.Load(ctx, spaceID)
	if err != nil {
		return nil, errors.E(op, err)
	}

	input, ephemeral := buildInputAndEphemeralArtifacts(req.Input, req.Artifacts)
	var activeTrig *workflow.Trigger
	if len(flow.Triggers) > 0 {
		activeTrig = &flow.Triggers[0]
		if len(input) == 0 && len(req.TriggerData) > 0 {
			passed, fErr := c.workflow.EvaluateTriggerFilter(activeTrig, spaceCtx, req.TriggerData)
			if fErr != nil {
				return nil, errors.E(op, errors.Invalid, fErr)
			}
			if !passed {
				now := time.Now().UTC()
				return &workflow.FlowRun{
					SpaceID:     spaceID,
					FlowID:      flow.ID,
					FlowVersion: flow.Version,
					Status:      workflow.RunFiltered,
					TriggerData: req.TriggerData,
					Metadata:    map[string]any{"mode": "test", "filtered_at_trigger": true},
					StartTime:   new(now),
					EndTime:     new(now),
				}, nil
			}
			mapped, mErr := c.workflow.MapTriggerInput(activeTrig, spaceCtx, req.TriggerData)
			if mErr != nil {
				return nil, errors.E(op, errors.Invalid, mErr)
			}
			input = mapped
		}
	}

	run, err := c.workflow.Execute(ctx, workflow.ExecuteOptions{
		Flow:               &flow,
		Space:              spaceCtx,
		Trigger:            activeTrig,
		TriggerData:        req.TriggerData,
		Input:              input,
		Mode:               "test",
		Persist:            false,
		EphemeralArtifacts: ephemeral,
	})
	if err != nil {
		return nil, errors.E(op, err)
	}
	return run, nil
}

// DispatchEventTrigger evaluates an event trigger pre-guard + input_mapping and enqueues an idempotent FlowRun.
func (c *coordinator) DispatchEventTrigger(ctx context.Context, req *DispatchEventTriggerRequest) (*workflow.FlowRun, bool, error) {
	const op errors.Op = "application/workflow.DispatchEventTrigger"

	if req == nil || req.Trigger == nil || strings.TrimSpace(req.SpaceID) == "" {
		return nil, false, errors.E(op, errors.Invalid, "space_id and trigger are required")
	}

	flow, err := c.workflow.GetFlow(ctx, req.SpaceID, req.Trigger.FlowID)
	if err != nil {
		return nil, false, errors.E(op, err)
	}
	if !flow.IsEnabled || !req.Trigger.IsEnabled {
		return nil, false, nil
	}

	spaceCtx, err := c.spaceLoader.Load(ctx, req.SpaceID)
	if err != nil {
		return nil, false, errors.E(op, err)
	}

	passed, err := c.workflow.EvaluateTriggerFilter(req.Trigger, spaceCtx, req.TriggerData)
	if err != nil {
		return nil, false, errors.E(op, err)
	}
	if !passed {
		return nil, false, nil
	}

	mappedInput, err := c.workflow.MapTriggerInput(req.Trigger, spaceCtx, req.TriggerData)
	if err != nil {
		return nil, false, errors.E(op, err)
	}

	var idemKey *string
	if strings.TrimSpace(req.IdempotencyKey) != "" {
		idemKey = new(strings.TrimSpace(req.IdempotencyKey))
	}

	meta := map[string]any{"trigger_type": string(req.Trigger.Type)}
	maps.Copy(meta, req.Metadata)

	run := &workflow.FlowRun{
		SpaceID:        req.SpaceID,
		FlowID:         flow.ID,
		FlowVersion:    flow.Version,
		TriggerID:      new(req.Trigger.ID),
		IdempotencyKey: idemKey,
		Status:         workflow.RunPending,
		TriggerData:    req.TriggerData,
		Input:          mappedInput,
		Metadata:       meta,
	}
	persisted, created, err := c.workflow.CreateOrResumeRun(ctx, run)
	if err != nil {
		return nil, false, errors.E(op, err)
	}
	if !created && persisted.Status == workflow.RunCompleted {
		return persisted, false, nil
	}
	if err := c.dispatcher.Dispatch(ctx, req.SpaceID, persisted.ID); err != nil {
		return nil, false, errors.E(op, err)
	}
	return persisted, true, nil
}

// ExecuteFlowRun loads a persisted FlowRun and drives it to completion with StepRun checkpoint replay.
func (c *coordinator) ExecuteFlowRun(ctx context.Context, spaceID string, flowRunID string) (*workflow.FlowRun, error) {
	const op errors.Op = "application/workflow.ExecuteFlowRun"

	if strings.TrimSpace(spaceID) == "" || strings.TrimSpace(flowRunID) == "" {
		return nil, errors.E(op, errors.Invalid, "space_id and flow_run_id are required")
	}

	run, err := c.workflow.GetFlowRun(ctx, spaceID, flowRunID)
	if err != nil {
		return nil, errors.E(op, err)
	}
	if run.Status.IsTerminal() {
		return run, nil
	}

	flow, err := c.workflow.GetFlow(ctx, spaceID, run.FlowID)
	if err != nil {
		return nil, errors.E(op, err)
	}

	var trig *workflow.Trigger
	if run.TriggerID != nil && *run.TriggerID != "" {
		trig = findTriggerByID(flow, *run.TriggerID)
	}

	spaceCtx, err := c.spaceLoader.Load(ctx, spaceID)
	if err != nil {
		return nil, errors.E(op, err)
	}

	mode := "live"
	if trig != nil {
		mode = string(trig.Type)
	}

	executed, err := c.workflow.Execute(ctx, workflow.ExecuteOptions{
		FlowRunID:      run.ID,
		Flow:           flow,
		Space:          spaceCtx,
		Trigger:        trig,
		TriggerData:    run.TriggerData,
		Input:          run.Input,
		Mode:           mode,
		IdempotencyKey: run.IdempotencyKey,
		Persist:        true,
	})
	if err != nil {
		return executed, errors.E(op, err)
	}
	return executed, nil
}

// InvokeScheduleTrigger executes a cron-scheduled workflow trigger for a Space.
func (c *coordinator) InvokeScheduleTrigger(ctx context.Context, spaceID string, flowID string, triggerID string) (*workflow.FlowRun, error) {
	const op errors.Op = "application/workflow.InvokeScheduleTrigger"

	flow, err := c.workflow.GetFlow(ctx, spaceID, flowID)
	if err != nil {
		return nil, errors.E(op, err)
	}
	if !flow.IsEnabled {
		return nil, nil
	}

	trig := findTriggerByID(flow, triggerID)
	if trig == nil || !trig.IsEnabled {
		return nil, nil
	}

	spaceCtx, err := c.spaceLoader.Load(ctx, spaceID)
	if err != nil {
		return nil, errors.E(op, err)
	}

	triggerData := map[string]any{
		"scheduled_at": time.Now().UTC().Format(time.RFC3339),
	}
	mappedInput, err := c.workflow.MapTriggerInput(trig, spaceCtx, triggerData)
	if err != nil {
		return nil, errors.E(op, err)
	}

	run, err := c.workflow.Execute(ctx, workflow.ExecuteOptions{
		Flow:        flow,
		Space:       spaceCtx,
		Trigger:     trig,
		TriggerData: triggerData,
		Input:       mappedInput,
		Mode:        string(workflow.TriggerSchedule),
		Persist:     true,
	})
	if err != nil {
		return run, errors.E(op, err)
	}
	return run, nil
}

func findTriggerByID(flow *workflow.Flow, triggerID string) *workflow.Trigger {
	if flow == nil || triggerID == "" {
		return nil
	}
	for i := range flow.Triggers {
		if flow.Triggers[i].ID == triggerID {
			return &flow.Triggers[i]
		}
	}
	return nil
}

func (c *coordinator) syncSchedules(ctx context.Context, spaceID string, flow *workflow.Flow, previous []workflow.Trigger) error {
	currentSchedIDs := make(map[string]struct{})
	for i := range flow.Triggers {
		t := flow.Triggers[i]
		if t.Type != workflow.TriggerSchedule || t.Config.ScheduleID == nil {
			continue
		}
		schedID := *t.Config.ScheduleID
		currentSchedIDs[schedID] = struct{}{}

		if flow.IsEnabled && t.IsEnabled && t.Config.Cron != nil && strings.TrimSpace(*t.Config.Cron) != "" {
			err := c.schedules.RegisterSchedule(ctx, scheduler.Schedule{
				ID:             schedID,
				JobType:        JobTypeExecuteTrigger,
				CronExpression: strings.TrimSpace(*t.Config.Cron),
				Payload: ScheduleTriggerPayload{
					SpaceID:   spaceID,
					FlowID:    flow.ID,
					TriggerID: t.ID,
				},
			})
			if err != nil {
				return err
			}
		} else {
			if err := c.pauseScheduleIfExists(ctx, schedID); err != nil {
				return err
			}
		}
	}

	for i := range previous {
		prev := previous[i]
		if prev.Type != workflow.TriggerSchedule || prev.Config.ScheduleID == nil {
			continue
		}
		schedID := *prev.Config.ScheduleID
		if _, stillPresent := currentSchedIDs[schedID]; !stillPresent {
			if err := c.pauseScheduleIfExists(ctx, schedID); err != nil {
				return err
			}
		}
	}
	return nil
}

func (c *coordinator) pauseScheduleIfExists(ctx context.Context, scheduleID string) error {
	err := c.schedules.PauseSchedule(ctx, scheduleID)
	if err != nil && !errors.Is(err, errors.NotExist) {
		return err
	}
	return nil
}

func buildInputAndEphemeralArtifacts(
	rawInput map[string]any,
	inline []InlineArtifact,
) (map[string]any, map[string]workflow.ResolvedArtifact) {
	input := make(map[string]any, len(rawInput))
	maps.Copy(input, rawInput)

	if len(inline) == 0 {
		return input, nil
	}

	ephemeral := make(map[string]workflow.ResolvedArtifact, len(inline))
	var docRefs []any
	for i, art := range inline {
		ref := fmt.Sprintf("ephemeral://upload_%d/%s", i, art.Filename)
		ephemeral[ref] = workflow.ResolvedArtifact{
			Ref:         ref,
			Filename:    art.Filename,
			ContentType: art.ContentType,
			Data:        art.Data,
		}
		if field := strings.TrimSpace(art.FieldName); field != "" {
			if existing, ok := input[field]; ok {
				if arr, isArr := existing.([]any); isArr {
					input[field] = append(arr, map[string]any{
						"ref":          ref,
						"filename":     art.Filename,
						"content_type": art.ContentType,
						"size":         len(art.Data),
					})
					continue
				}
			}
			input[field] = ref
			continue
		}
		docRefs = append(docRefs, map[string]any{
			"ref":          ref,
			"filename":     art.Filename,
			"content_type": art.ContentType,
			"size":         len(art.Data),
		})
	}
	if len(docRefs) > 0 {
		if _, exists := input["documents"]; !exists {
			input["documents"] = docRefs
		}
		if len(inline) == 1 {
			if _, exists := input["document"]; !exists {
				input["document"] = fmt.Sprintf("ephemeral://upload_0/%s", inline[0].Filename)
			}
		}
	}
	return input, ephemeral
}
