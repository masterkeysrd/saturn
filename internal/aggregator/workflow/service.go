package workflowaggregator

//go:generate go run github.com/masterkeysrd/saturn/tools/mockgen .

import (
	"context"
	"maps"
	"strings"
	"time"

	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	"github.com/masterkeysrd/saturn/internal/platform/ai"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/paging"
	"github.com/masterkeysrd/saturn/internal/platform/workflow"
	"golang.org/x/sync/errgroup"
)

// WorkflowReader defines read-only query operations exposed by platform/workflow.Service.
// @Mock
type WorkflowReader interface {
	Catalog() workflow.Catalog
	GetFlow(ctx context.Context, spaceID string, idOrSystemKey string) (*workflow.Flow, error)
	ListFlows(ctx context.Context, filter workflow.ListFlowsFilter) ([]*workflow.Flow, error)
	ListTriggersByFlowIDs(ctx context.Context, spaceID string, flowIDs []string) (map[string][]workflow.Trigger, error)
	GetFlowRun(ctx context.Context, spaceID string, id string) (*workflow.FlowRun, error)
	ListFlowRuns(ctx context.Context, filter workflow.ListFlowRunsFilter) (*paging.Page[*workflow.FlowRun], error)
	ListStepRuns(ctx context.Context, spaceID string, flowRunID string) ([]workflow.StepRun, error)
	GetStats7d(ctx context.Context, spaceID string, flowIDs []string, now time.Time) (map[string]workflow.FlowStats, error)
}

// AIRunReader defines read-only batch retrieval of AI audit rows for token metrics hydration.
// @Mock
type AIRunReader interface {
	GetByIDs(ctx context.Context, spaceID string, ids []string) ([]*ai.Run, error)
}

// FlowRunView wraps a workflow.FlowRun with hydrated FlowName and AIRun token telemetry.
type FlowRunView struct {
	*workflow.FlowRun
	FlowName *string
	AIRuns   map[string]*ai.Run
}

// FlowRunListResult is a paginated list of hydrated FlowRunView items.
type FlowRunListResult struct {
	Runs          []*FlowRunView
	NextPageToken string
}

// Dependencies groups read-only services required by the workflow aggregator Service.
type Dependencies struct {
	Workflow WorkflowReader
	AIRuns   AIRunReader
	NowFunc  func() time.Time
}

// Service provides read-only CQRS hydration for workflows, triggers, stats, runs, and step traces.
type Service struct {
	workflow WorkflowReader
	aiRuns   AIRunReader
	nowFn    func() time.Time
}

// NewService constructs a new workflow aggregator Service.
func NewService(deps Dependencies) *Service {
	nowFn := deps.NowFunc
	if nowFn == nil {
		nowFn = func() time.Time { return time.Now().UTC() }
	}
	return &Service{
		workflow: deps.Workflow,
		aiRuns:   deps.AIRuns,
		nowFn:    nowFn,
	}
}

func getSpaceID(ctx context.Context, op errors.Op) (string, error) {
	spaceID, ok := auth.SpaceIDFromContext(ctx)
	if !ok || strings.TrimSpace(spaceID) == "" {
		return "", errors.E(op, errors.Unauthenticated, "missing active space context")
	}
	return spaceID, nil
}

// ListFlows returns workspace flows hydrated in parallel with their triggers[] and 7-day run stats.
func (s *Service) ListFlows(ctx context.Context, filter workflow.ListFlowsFilter) ([]*workflow.Flow, error) {
	const op errors.Op = "aggregator/workflow.ListFlows"

	spaceID, err := getSpaceID(ctx, op)
	if err != nil {
		return nil, err
	}
	filter.SpaceID = spaceID

	flows, err := s.workflow.ListFlows(ctx, filter)
	if err != nil {
		return nil, errors.E(op, err)
	}
	if len(flows) == 0 {
		return []*workflow.Flow{}, nil
	}

	flowIDs := make([]string, 0, len(flows))
	for _, f := range flows {
		flowIDs = append(flowIDs, f.ID)
	}

	var (
		triggersByFlow map[string][]workflow.Trigger
		statsByFlow    map[string]workflow.FlowStats
	)

	g, gCtx := errgroup.WithContext(ctx)
	g.Go(func() error {
		res, tErr := s.workflow.ListTriggersByFlowIDs(gCtx, spaceID, flowIDs)
		if tErr != nil {
			return tErr
		}
		triggersByFlow = res
		return nil
	})
	g.Go(func() error {
		res, sErr := s.workflow.GetStats7d(gCtx, spaceID, flowIDs, s.nowFn())
		if sErr != nil {
			return sErr
		}
		statsByFlow = res
		return nil
	})
	if err := g.Wait(); err != nil {
		return nil, errors.E(op, err)
	}

	for _, f := range flows {
		if trigs, ok := triggersByFlow[f.ID]; ok {
			f.Triggers = trigs
		} else {
			f.Triggers = []workflow.Trigger{}
		}
		if st, ok := statsByFlow[f.ID]; ok {
			f.Stats = new(st)
		}
	}
	return flows, nil
}

// GetFlow retrieves a single flow by ID or system_key hydrated with triggers and 7-day run stats.
func (s *Service) GetFlow(ctx context.Context, idOrSystemKey string) (*workflow.Flow, error) {
	const op errors.Op = "aggregator/workflow.GetFlow"

	spaceID, err := getSpaceID(ctx, op)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(idOrSystemKey) == "" {
		return nil, errors.E(op, errors.Invalid, "flow id is required")
	}

	flow, err := s.workflow.GetFlow(ctx, spaceID, idOrSystemKey)
	if err != nil {
		return nil, errors.E(op, err)
	}

	statsMap, err := s.workflow.GetStats7d(ctx, spaceID, []string{flow.ID}, s.nowFn())
	if err != nil {
		return nil, errors.E(op, err)
	}
	if st, ok := statsMap[flow.ID]; ok {
		flow.Stats = new(st)
	}
	return flow, nil
}

// ListFlowRuns returns paginated FlowRun views hydrated with FlowName.
func (s *Service) ListFlowRuns(ctx context.Context, filter workflow.ListFlowRunsFilter) (*FlowRunListResult, error) {
	const op errors.Op = "aggregator/workflow.ListFlowRuns"

	spaceID, err := getSpaceID(ctx, op)
	if err != nil {
		return nil, err
	}
	filter.SpaceID = spaceID

	var (
		page  *paging.Page[*workflow.FlowRun]
		flows []*workflow.Flow
	)

	g, gCtx := errgroup.WithContext(ctx)
	g.Go(func() error {
		var pErr error
		page, pErr = s.workflow.ListFlowRuns(gCtx, filter)
		return pErr
	})
	g.Go(func() error {
		var fErr error
		flows, fErr = s.workflow.ListFlows(gCtx, workflow.ListFlowsFilter{SpaceID: spaceID})
		return fErr
	})
	if err := g.Wait(); err != nil {
		return nil, errors.E(op, err)
	}

	flowNames := make(map[string]string, len(flows))
	for _, f := range flows {
		flowNames[f.ID] = f.Name
	}

	items := make([]*FlowRunView, 0, len(page.Items))
	for _, r := range page.Items {
		view := &FlowRunView{FlowRun: r}
		if name, ok := flowNames[r.FlowID]; ok {
			view.FlowName = new(name)
		}
		items = append(items, view)
	}
	return &FlowRunListResult{
		Runs:          items,
		NextPageToken: page.NextPageToken,
	}, nil
}

// GetFlowRun retrieves a single FlowRun hydrated with FlowName, StepRun timeline, and AgentRun token metrics.
func (s *Service) GetFlowRun(ctx context.Context, id string) (*FlowRunView, error) {
	const op errors.Op = "aggregator/workflow.GetFlowRun"

	spaceID, err := getSpaceID(ctx, op)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(id) == "" {
		return nil, errors.E(op, errors.Invalid, "flow run id is required")
	}

	var (
		run      *workflow.FlowRun
		stepRuns []workflow.StepRun
	)

	g, gCtx := errgroup.WithContext(ctx)
	g.Go(func() error {
		var rErr error
		run, rErr = s.workflow.GetFlowRun(gCtx, spaceID, id)
		return rErr
	})
	g.Go(func() error {
		var sErr error
		stepRuns, sErr = s.workflow.ListStepRuns(gCtx, spaceID, id)
		return sErr
	})
	if err := g.Wait(); err != nil {
		return nil, errors.E(op, err)
	}

	run.StepRuns = stepRuns
	view := &FlowRunView{FlowRun: run}

	var aiRunIDs []string
	seenAIIDs := make(map[string]struct{})
	for i := range stepRuns {
		if stepRuns[i].AIRunID != nil && *stepRuns[i].AIRunID != "" {
			aid := *stepRuns[i].AIRunID
			if _, seen := seenAIIDs[aid]; !seen {
				seenAIIDs[aid] = struct{}{}
				aiRunIDs = append(aiRunIDs, aid)
			}
		}
	}

	g2, g2Ctx := errgroup.WithContext(ctx)
	g2.Go(func() error {
		f, fErr := s.workflow.GetFlow(g2Ctx, spaceID, run.FlowID)
		if fErr == nil && f != nil {
			view.FlowName = new(f.Name)
		} else if fErr != nil && !errors.Is(fErr, workflow.ErrFlowNotFound) && !errors.Is(fErr, errors.NotExist) {
			return fErr
		}
		return nil
	})
	if len(aiRunIDs) > 0 {
		g2.Go(func() error {
			runs, aErr := s.aiRuns.GetByIDs(g2Ctx, spaceID, aiRunIDs)
			if aErr != nil {
				return aErr
			}
			byID := make(map[string]*ai.Run, len(runs))
			for _, ar := range runs {
				byID[ar.ID] = ar
			}
			view.AIRuns = byID
			for i := range run.StepRuns {
				sr := &run.StepRuns[i]
				if sr.AIRunID == nil {
					continue
				}
				if ar, ok := byID[*sr.AIRunID]; ok {
					meta := maps.Clone(sr.Metadata)
					if meta == nil {
						meta = make(map[string]any)
					}
					meta["ai_run_tokens_used"] = int(ar.Metrics.Tokens.Total)
					meta["ai_run_status"] = string(ar.Status)
					sr.Metadata = meta
				}
			}
			return nil
		})
	}
	if err := g2.Wait(); err != nil {
		return nil, errors.E(op, err)
	}

	return view, nil
}

// GetCatalog returns all registered trigger topics, steps, loaders, and CEL helpers.
func (s *Service) GetCatalog() workflow.Catalog {
	return s.workflow.Catalog()
}
