package workflow

import (
	"context"
	"fmt"
	"slices"
	"strings"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/paging"
)

// ServiceDependencies groups the engine and persistence stores owned by platform/workflow.
type ServiceDependencies struct {
	Flows    FlowStore
	Triggers TriggerStore
	FlowRuns FlowRunStore
	StepRuns StepRunStore
	Engine   *Engine
}

// Service encapsulates workflow platform persistence, lifecycle invariants, and execution.
type Service struct {
	flows    FlowStore
	triggers TriggerStore
	flowRuns FlowRunStore
	stepRuns StepRunStore
	engine   *Engine
}

// NewService constructs a platform workflow Service.
func NewService(deps ServiceDependencies) *Service {
	return &Service{
		flows:    deps.Flows,
		triggers: deps.Triggers,
		flowRuns: deps.FlowRuns,
		stepRuns: deps.StepRuns,
		engine:   deps.Engine,
	}
}

// Registry returns the underlying workflow capability Registry.
func (s *Service) Registry() *Registry {
	return s.engine.Registry()
}

// Catalog returns all registered trigger topics, steps, loaders, and CEL helpers.
func (s *Service) Catalog() Catalog {
	return s.engine.Registry().Catalog()
}

// ValidateFlow validates flow structure, registered steps/loaders, CEL expressions, and schemas.
func (s *Service) ValidateFlow(flow *Flow) error {
	return s.engine.ValidateFlow(flow)
}

// EvaluateTriggerFilter evaluates a trigger CEL pre-guard against raw trigger.data.
func (s *Service) EvaluateTriggerFilter(trigger *Trigger, space SpaceContext, triggerData map[string]any) (bool, error) {
	return s.engine.EvaluateTriggerFilter(trigger, space, triggerData)
}

// MapTriggerInput normalizes trigger.data into flow input.* using trigger.config.input_mapping.
func (s *Service) MapTriggerInput(trigger *Trigger, space SpaceContext, triggerData map[string]any) (map[string]any, error) {
	return s.engine.MapTriggerInput(trigger, space, triggerData)
}

// Execute runs a flow end-to-end via the workflow Engine.
func (s *Service) Execute(ctx context.Context, opts ExecuteOptions) (*FlowRun, error) {
	return s.engine.Execute(ctx, opts)
}

// EnsureSystemFlows lazily materializes all registered system flow blueprints for spaceID.
func (s *Service) EnsureSystemFlows(ctx context.Context, spaceID string) ([]*Flow, error) {
	const op errors.Op = "platform/workflow.Service.EnsureSystemFlows"

	blueprints := s.engine.Registry().ListSystemFlows()
	ensured := make([]*Flow, 0, len(blueprints))
	for _, bp := range blueprints {
		item, err := s.ensureBlueprint(ctx, spaceID, bp)
		if err != nil {
			return nil, errors.E(op, err)
		}
		ensured = append(ensured, item)
	}
	return ensured, nil
}

// ResolveFlowOrSeedSystem fetches a flow by ID or system_key, lazily seeding a registered system blueprint if missing.
func (s *Service) ResolveFlowOrSeedSystem(ctx context.Context, spaceID, idOrSystemKey string) (*Flow, error) {
	flow, err := s.flows.Get(ctx, spaceID, idOrSystemKey)
	if err == nil {
		return flow, nil
	}
	if !errors.Is(err, ErrFlowNotFound) && !errors.Is(err, errors.NotExist) {
		return nil, err
	}
	if bp, ok := s.engine.Registry().GetSystemFlow(idOrSystemKey); ok {
		return s.ensureBlueprint(ctx, spaceID, bp)
	}
	return nil, err
}

func (s *Service) ensureBlueprint(ctx context.Context, spaceID string, bp SystemFlowBlueprint) (*Flow, error) {
	flow, triggers := bp.Build(spaceID)
	if err := prepareScheduleTriggerIDs(triggers); err != nil {
		return nil, err
	}
	return s.flows.EnsureSystemFlow(ctx, flow, triggers, s.triggers)
}

// CreateFlow validates and persists a new user-defined workflow and its triggers.
func (s *Service) CreateFlow(ctx context.Context, flow *Flow) (*Flow, error) {
	const op errors.Op = "platform/workflow.Service.CreateFlow"

	if flow == nil {
		return nil, errors.E(op, errors.Invalid, "flow is required")
	}

	flow.IsSystem = false
	flow.SystemKey = nil
	if flow.Version <= 0 {
		flow.Version = 1
	}
	for i := range flow.Triggers {
		flow.Triggers[i].SpaceID = flow.SpaceID
	}
	if err := prepareScheduleTriggerIDs(flow.Triggers); err != nil {
		return nil, errors.E(op, err)
	}

	if err := s.engine.ValidateFlow(flow); err != nil {
		return nil, errors.E(op, errors.Invalid, errors.Code("WORKFLOW_VALIDATION_FAILED"), err)
	}

	if err := s.flows.Create(ctx, flow); err != nil {
		return nil, errors.E(op, err)
	}

	if len(flow.Triggers) > 0 {
		replaced, err := s.triggers.ReplaceForFlow(ctx, flow.SpaceID, flow.ID, flow.Triggers)
		if err != nil {
			return nil, errors.E(op, err)
		}
		flow.Triggers = replaced
	}
	return flow, nil
}

// UpdateFlow applies masked or full updates to an existing flow and returns the updated flow and previous triggers.
func (s *Service) UpdateFlow(ctx context.Context, spaceID, id string, incoming *Flow, mask []string) (*Flow, []Trigger, error) {
	const op errors.Op = "platform/workflow.Service.UpdateFlow"

	if strings.TrimSpace(id) == "" || incoming == nil {
		return nil, nil, errors.E(op, errors.Invalid, "flow id and payload are required")
	}

	existing, err := s.flows.Get(ctx, spaceID, id)
	if err != nil {
		return nil, nil, errors.E(op, err)
	}
	oldTriggers := slices.Clone(existing.Triggers)

	updateTriggers := false
	if len(mask) == 0 {
		existing.Name = strings.TrimSpace(incoming.Name)
		existing.Description = incoming.Description
		existing.Config = incoming.Config
		existing.InputSchema = incoming.InputSchema
		existing.Steps = incoming.Steps
		existing.IsEnabled = incoming.IsEnabled
		existing.Triggers = incoming.Triggers
		updateTriggers = true
	} else {
		for _, path := range mask {
			switch strings.ToLower(strings.TrimSpace(path)) {
			case "name":
				existing.Name = strings.TrimSpace(incoming.Name)
			case "description":
				existing.Description = incoming.Description
			case "config":
				existing.Config = incoming.Config
			case "input_schema":
				existing.InputSchema = incoming.InputSchema
			case "steps":
				existing.Steps = incoming.Steps
			case "is_enabled":
				existing.IsEnabled = incoming.IsEnabled
			case "triggers":
				existing.Triggers = incoming.Triggers
				updateTriggers = true
			}
		}
	}

	if updateTriggers {
		for i := range existing.Triggers {
			existing.Triggers[i].SpaceID = spaceID
			existing.Triggers[i].FlowID = existing.ID
		}
		if err := prepareScheduleTriggerIDs(existing.Triggers); err != nil {
			return nil, nil, errors.E(op, err)
		}
	}

	if err := s.engine.ValidateFlow(existing); err != nil {
		return nil, nil, errors.E(op, errors.Invalid, errors.Code("WORKFLOW_VALIDATION_FAILED"), err)
	}

	if err := s.flows.Update(ctx, existing); err != nil {
		return nil, nil, errors.E(op, err)
	}

	if updateTriggers {
		replaced, err := s.triggers.ReplaceForFlow(ctx, spaceID, existing.ID, existing.Triggers)
		if err != nil {
			return nil, nil, errors.E(op, err)
		}
		existing.Triggers = replaced
	}
	return existing, oldTriggers, nil
}

// DeleteFlow enforces deletability invariants, deletes a user-defined flow, and returns its prior triggers.
func (s *Service) DeleteFlow(ctx context.Context, spaceID, id string) ([]Trigger, error) {
	const op errors.Op = "platform/workflow.Service.DeleteFlow"

	if strings.TrimSpace(id) == "" {
		return nil, errors.E(op, errors.Invalid, "flow id is required")
	}

	existing, err := s.flows.Get(ctx, spaceID, id)
	if err != nil {
		return nil, errors.E(op, err)
	}
	if err := existing.EnsureDeletable(); err != nil {
		return nil, errors.E(op, err)
	}
	if err := s.flows.Delete(ctx, spaceID, existing.ID); err != nil {
		return nil, errors.E(op, err)
	}
	return existing.Triggers, nil
}

// SetFlowEnabled updates the enabled flag on an existing flow.
func (s *Service) SetFlowEnabled(ctx context.Context, spaceID, idOrSystemKey string, enabled bool) (*Flow, error) {
	const op errors.Op = "platform/workflow.Service.SetFlowEnabled"

	if strings.TrimSpace(idOrSystemKey) == "" {
		return nil, errors.E(op, errors.Invalid, "flow id is required")
	}

	flow, err := s.flows.Get(ctx, spaceID, idOrSystemKey)
	if err != nil {
		return nil, errors.E(op, err)
	}
	flow.IsEnabled = enabled
	if err := s.flows.Update(ctx, flow); err != nil {
		return nil, errors.E(op, err)
	}
	return flow, nil
}

// ResetFlow restores a built-in system flow to its registered factory blueprint defaults and returns previous triggers.
func (s *Service) ResetFlow(ctx context.Context, spaceID, idOrSystemKey string) (*Flow, []Trigger, error) {
	const op errors.Op = "platform/workflow.Service.ResetFlow"

	if strings.TrimSpace(idOrSystemKey) == "" {
		return nil, nil, errors.E(op, errors.Invalid, "flow id is required")
	}

	existing, err := s.flows.Get(ctx, spaceID, idOrSystemKey)
	if err != nil {
		return nil, nil, errors.E(op, err)
	}
	if !existing.IsSystem || existing.SystemKey == nil || *existing.SystemKey == "" {
		return nil, nil, errors.E(op, ErrNotSystemFlow)
	}

	bp, ok := s.engine.Registry().GetSystemFlow(*existing.SystemKey)
	if !ok {
		return nil, nil, errors.E(op, ErrNotSystemFlow, fmt.Sprintf("unknown system blueprint %q", *existing.SystemKey))
	}

	oldTriggers := slices.Clone(existing.Triggers)
	factoryFlow, factoryTriggers := bp.Build(spaceID)
	for i := range factoryTriggers {
		factoryTriggers[i].SpaceID = spaceID
		factoryTriggers[i].FlowID = existing.ID
	}
	if err := prepareScheduleTriggerIDs(factoryTriggers); err != nil {
		return nil, nil, errors.E(op, err)
	}

	existing.Name = factoryFlow.Name
	existing.Description = factoryFlow.Description
	existing.Config = factoryFlow.Config
	existing.InputSchema = factoryFlow.InputSchema
	existing.Steps = factoryFlow.Steps
	existing.IsEnabled = factoryFlow.IsEnabled
	existing.Triggers = factoryTriggers

	if err := s.engine.ValidateFlow(existing); err != nil {
		return nil, nil, errors.E(op, errors.Invalid, errors.Code("WORKFLOW_VALIDATION_FAILED"), err)
	}
	if err := s.flows.Update(ctx, existing); err != nil {
		return nil, nil, errors.E(op, err)
	}

	replaced, err := s.triggers.ReplaceForFlow(ctx, spaceID, existing.ID, factoryTriggers)
	if err != nil {
		return nil, nil, errors.E(op, err)
	}
	existing.Triggers = replaced
	return existing, oldTriggers, nil
}

// GetFlow retrieves a flow by ID or system_key within a space.
func (s *Service) GetFlow(ctx context.Context, spaceID, idOrSystemKey string) (*Flow, error) {
	return s.flows.Get(ctx, spaceID, idOrSystemKey)
}

// ListFlows returns flows matching filter.
func (s *Service) ListFlows(ctx context.Context, filter ListFlowsFilter) ([]*Flow, error) {
	return s.flows.List(ctx, filter)
}

// ListTriggersByFlowIDs returns triggers keyed by flow ID.
func (s *Service) ListTriggersByFlowIDs(ctx context.Context, spaceID string, flowIDs []string) (map[string][]Trigger, error) {
	return s.triggers.ListByFlowIDs(ctx, spaceID, flowIDs)
}

// GetTrigger retrieves a trigger within a space.
func (s *Service) GetTrigger(ctx context.Context, spaceID, triggerID string) (*Trigger, error) {
	return s.triggers.Get(ctx, spaceID, triggerID)
}

// GetTriggerByID retrieves a trigger by ID across spaces.
func (s *Service) GetTriggerByID(ctx context.Context, triggerID string) (*Trigger, error) {
	return s.triggers.GetByID(ctx, triggerID)
}

// FindEnabledEventTriggers lists enabled event triggers matching topic in a space.
func (s *Service) FindEnabledEventTriggers(ctx context.Context, spaceID, topic string) ([]Trigger, error) {
	return s.triggers.FindEnabledEventTriggers(ctx, spaceID, topic)
}

// CreateOrResumeRun creates or resumes an idempotent FlowRun.
func (s *Service) CreateOrResumeRun(ctx context.Context, run *FlowRun) (*FlowRun, bool, error) {
	return s.flowRuns.CreateOrResume(ctx, run)
}

// GetFlowRun retrieves a single FlowRun by ID.
func (s *Service) GetFlowRun(ctx context.Context, spaceID, id string) (*FlowRun, error) {
	return s.flowRuns.Get(ctx, spaceID, id)
}

// ListFlowRuns returns paginated FlowRuns matching filter.
func (s *Service) ListFlowRuns(ctx context.Context, filter ListFlowRunsFilter) (*paging.Page[*FlowRun], error) {
	return s.flowRuns.List(ctx, filter)
}

// ListStepRuns returns step execution records for a FlowRun.
func (s *Service) ListStepRuns(ctx context.Context, spaceID, flowRunID string) ([]StepRun, error) {
	return s.stepRuns.ListByFlowRun(ctx, spaceID, flowRunID)
}

// GetStats7d returns 7-day execution metrics keyed by flow ID.
func (s *Service) GetStats7d(ctx context.Context, spaceID string, flowIDs []string, now time.Time) (map[string]FlowStats, error) {
	return s.flowRuns.GetStats7d(ctx, spaceID, flowIDs, now)
}

func prepareScheduleTriggerIDs(triggers []Trigger) error {
	for i := range triggers {
		t := &triggers[i]
		if t.Type != TriggerSchedule {
			continue
		}
		if t.ID == "" {
			idStr, err := GenerateTriggerID()
			if err != nil {
				return err
			}
			t.ID = idStr
		}
		schedID := "wfs_" + t.ID
		t.Config.ScheduleID = &schedID
	}
	return nil
}
