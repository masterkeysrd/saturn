package workflow

import (
	"context"
	"encoding/json/v2"
	"fmt"
	"maps"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/masterkeysrd/loom/graph"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/pdf"
)

// ExecuteOptions configures a single workflow execution (live, async, or in-memory dry-run).
type ExecuteOptions struct {
	FlowRunID          string
	Flow               *Flow
	Space              SpaceContext
	Trigger            *Trigger
	TriggerData        map[string]any
	Input              map[string]any
	Mode               string
	IdempotencyKey     *string
	Persist            bool
	EphemeralArtifacts map[string]ResolvedArtifact
	Now                time.Time
}

// Dependencies groups collaborators required by Engine.
type Dependencies struct {
	FlowRuns      FlowRunStore
	StepRuns      StepRunStore
	Registry      *Registry
	CEL           *CELEvaluator
	AgentExecutor AgentExecutor
}

// Engine compiles and executes workflows on top of loom/graph, CEL, LoaderCache, and StepRun checkpoints.
type Engine struct {
	flowRuns  FlowRunStore
	stepRuns  StepRunStore
	registry  *Registry
	cel       *CELEvaluator
	agentExec AgentExecutor
}

// NewEngine constructs a workflow execution Engine.
func NewEngine(deps Dependencies) (*Engine, error) {
	registry := deps.Registry
	if registry == nil {
		registry = NewRegistry()
	}
	celEval := deps.CEL
	if celEval == nil {
		var err error
		celEval, err = NewCELEvaluator()
		if err != nil {
			return nil, err
		}
	}
	return &Engine{
		flowRuns:  deps.FlowRuns,
		stepRuns:  deps.StepRuns,
		registry:  registry,
		cel:       celEval,
		agentExec: deps.AgentExecutor,
	}, nil
}

// Registry returns the underlying workflow Registry.
func (e *Engine) Registry() *Registry {
	return e.registry
}

// CEL returns the underlying CELEvaluator.
func (e *Engine) CEL() *CELEvaluator {
	return e.cel
}

// ValidateFlow validates flow structure, registered steps/loaders, CEL expressions, and lexical scopes.
func (e *Engine) ValidateFlow(flow *Flow) error {
	return e.cel.ValidateFlow(flow, e.registry)
}

// EvaluateTriggerFilter evaluates an optional trigger CEL pre-guard against raw trigger.data.
func (e *Engine) EvaluateTriggerFilter(trigger *Trigger, space SpaceContext, triggerData map[string]any) (bool, error) {
	if err := trigger.Validate(); err != nil {
		return false, err
	}
	if !trigger.HasFilter() {
		return true, nil
	}
	state := &FlowState{
		Space:   space,
		Trigger: newTriggerContext(trigger, triggerData),
	}
	return e.cel.EvalCondition(*trigger.Config.Filter, state, nil)
}

// MapTriggerInput normalizes trigger.data into flow input.* using trigger.config.input_mapping or defaults to trigger.data.
func (e *Engine) MapTriggerInput(trigger *Trigger, space SpaceContext, triggerData map[string]any) (map[string]any, error) {
	if trigger.HasInputMapping() {
		state := &FlowState{
			Space:   space,
			Trigger: newTriggerContext(trigger, triggerData),
		}
		return e.cel.ResolveMap(trigger.Config.InputMapping, state, nil)
	}
	if triggerData == nil {
		return map[string]any{}, nil
	}
	return maps.Clone(triggerData), nil
}

// Execute runs a flow end-to-end with optional persistence, StepRun checkpoint replay, and on_error policies.
func (e *Engine) Execute(ctx context.Context, opts ExecuteOptions) (*FlowRun, error) {
	const op errors.Op = "platform/workflow.Engine.Execute"

	if opts.Flow == nil {
		return nil, errors.E(op, errors.Invalid, "flow is required")
	}
	if err := e.ValidateFlow(opts.Flow); err != nil {
		return nil, errors.E(op, err)
	}

	now := opts.Now
	if now.IsZero() {
		now = time.Now().UTC()
	}

	mode := opts.Mode
	if mode == "" {
		mode = "manual"
	}

	trigData := nonNilMap(opts.TriggerData)
	flowInput := opts.Input
	if flowInput == nil {
		var err error
		flowInput, err = e.MapTriggerInput(opts.Trigger, opts.Space, trigData)
		if err != nil {
			return nil, errors.E(op, errors.Invalid, fmt.Errorf("map trigger input: %w", err))
		}
	}

	var triggerID *string
	var trigCtx TriggerContext
	if opts.Trigger != nil {
		triggerID = new(opts.Trigger.ID)
		trigCtx = newTriggerContext(opts.Trigger, trigData)
	}

	run := &FlowRun{
		SpaceID:        opts.Space.ID,
		FlowID:         opts.Flow.ID,
		FlowVersion:    opts.Flow.Version,
		TriggerID:      triggerID,
		IdempotencyKey: opts.IdempotencyKey,
		Status:         RunRunning,
		Attempts:       1,
		TriggerData:    trigData,
		Input:          nonNilMap(flowInput),
		Metadata: map[string]any{
			"mode": mode,
		},
		StartTime:  new(now),
		CreateTime: now,
		UpdateTime: now,
	}
	if opts.Trigger != nil {
		run.Metadata["trigger_type"] = string(opts.Trigger.Type)
	}

	checkpoints := make(map[string]StepRun)
	if opts.Persist && e.flowRuns != nil {
		if opts.FlowRunID != "" {
			saved, err := e.flowRuns.Get(ctx, opts.Space.ID, opts.FlowRunID)
			if err != nil {
				return nil, errors.E(op, err)
			}
			if saved.Status.IsTerminal() {
				return saved, nil
			}
			loadCheckpoints(checkpoints, saved.StepRuns)
			run = saved
			if run.Status == RunFailed || run.StartTime != nil {
				run.Attempts++
			}
		} else {
			saved, resumed, err := e.flowRuns.CreateOrResume(ctx, run)
			if err != nil {
				return nil, errors.E(op, err)
			}
			run = saved
			if resumed {
				if run.Status.IsTerminal() {
					return run, nil
				}
				loadCheckpoints(checkpoints, run.StepRuns)
			}
		}
		run.Status = RunRunning
		run.Error = nil
		if run.StartTime == nil {
			run.StartTime = new(now)
		}
		if err := e.flowRuns.Update(ctx, run); err != nil {
			return nil, errors.E(op, err)
		}
	} else {
		idStr, err := GenerateFlowRunID()
		if err != nil {
			return nil, errors.E(op, err)
		}
		run.ID = idStr
	}

	runCtx := ctx
	var cancel context.CancelFunc
	if opts.Flow.Config.TimeoutSeconds != nil && *opts.Flow.Config.TimeoutSeconds > 0 {
		runCtx, cancel = context.WithTimeout(ctx, time.Duration(*opts.Flow.Config.TimeoutSeconds)*time.Second)
		defer cancel()
	}

	collector := newStepRunCollector(e.stepRuns, opts.Persist, run, checkpoints)
	artifacts := &compositeArtifactResolver{
		ephemeral: opts.EphemeralArtifacts,
		registry:  e.registry,
	}
	loaderCache := NewLoaderCache(e.registry, e.cel)

	initState := &FlowState{
		Space: opts.Space,
		Run: RunContext{
			ID:     run.ID,
			FlowID: opts.Flow.ID,
			Mode:   mode,
			Now:    now,
		},
		Trigger: trigCtx,
		Input:   nonNilMap(flowInput),
		Steps:   make(map[string]any),
		Loop:    make(map[string]any),
	}

	g, err := e.compileGraph(opts.Flow, "", opts.Flow.Steps, collector, loaderCache, artifacts)
	if err != nil {
		return nil, errors.E(op, errors.Internal, err)
	}

	snapshot, execErr := g.Execute(runCtx, graph.Update[*FlowState](func(_ *FlowState) *FlowState {
		return initState
	}), nil)

	endTime := time.Now().UTC()
	run.EndTime = new(endTime)
	if run.Metadata == nil {
		run.Metadata = make(map[string]any)
	}
	run.Metadata["duration_ms"] = endTime.Sub(now).Milliseconds()
	run.StepRuns = collector.Records()

	finalState := snapshot.State
	if finalState != nil {
		run.Metadata["tokens_used"] = finalState.TotalTokens
		if finalState.Output != nil {
			run.Output = finalState.Output
		}
	} else {
		run.Metadata["tokens_used"] = collector.TotalTokens()
	}

	if execErr != nil {
		run.Status = RunFailed
		if finalState != nil && finalState.TerminalError != nil {
			run.Error = finalState.TerminalError
		} else if termErr := collector.LastError(); termErr != nil {
			run.Error = termErr
		} else {
			run.Error = newStepFlowError("", "EXECUTION_ERROR", execErr.Error())
		}
		if opts.Persist && e.flowRuns != nil {
			_ = e.flowRuns.Update(ctx, run)
		}
		return run, errors.E(op, execErr)
	}

	if finalState != nil && finalState.TerminalStatus != "" {
		run.Status = finalState.TerminalStatus
		if finalState.FilterReason != "" {
			run.Metadata["filter_reason"] = finalState.FilterReason
		}
		if finalState.StopReason != "" {
			run.Metadata["stop_reason"] = finalState.StopReason
		}
		if finalState.TerminalStatus == RunFailed && finalState.TerminalError != nil {
			run.Error = finalState.TerminalError
		}
	} else {
		run.Status = RunCompleted
	}

	if opts.Persist && e.flowRuns != nil {
		if err := e.flowRuns.Update(ctx, run); err != nil {
			return run, errors.E(op, err)
		}
	}

	return run, nil
}

type stepRunCollector struct {
	mu          sync.Mutex
	stepRuns    StepRunStore
	persist     bool
	run         *FlowRun
	checkpoints map[string]StepRun
	order       []string
	byKey       map[string]StepRun
	lastErr     *FlowError
	totalTokens int
}

func newStepRunCollector(stepRuns StepRunStore, persist bool, run *FlowRun, checkpoints map[string]StepRun) *stepRunCollector {
	byKey := make(map[string]StepRun, len(checkpoints))
	order := make([]string, 0, len(checkpoints))
	for _, sr := range checkpoints {
		byKey[sr.ExecutionKey] = sr
		order = append(order, sr.ExecutionKey)
	}
	return &stepRunCollector{
		stepRuns:    stepRuns,
		persist:     persist,
		run:         run,
		checkpoints: checkpoints,
		order:       order,
		byKey:       byKey,
	}
}

func (c *stepRunCollector) GetCheckpoint(execKey string) (StepRun, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	sr, ok := c.checkpoints[execKey]
	if !ok {
		return StepRun{}, false
	}
	if sr.Status == StepCompleted || sr.Status == StepFailedContinued {
		return sr, true
	}
	return StepRun{}, false
}

func (c *stepRunCollector) Record(ctx context.Context, sr StepRun) (StepRun, error) {
	if sr.ID == "" {
		idStr, err := GenerateStepRunID()
		if err != nil {
			return sr, err
		}
		sr.ID = idStr
	}
	sr.FlowRunID = c.run.ID
	sr.SpaceID = c.run.SpaceID

	if c.persist && c.stepRuns != nil {
		if err := c.stepRuns.Upsert(ctx, &sr); err != nil {
			return sr, err
		}
	}

	c.mu.Lock()
	if _, exists := c.byKey[sr.ExecutionKey]; !exists {
		c.order = append(c.order, sr.ExecutionKey)
	}
	c.byKey[sr.ExecutionKey] = sr
	if sr.Status == StepFailed && sr.Error != nil {
		errCopy := *sr.Error
		c.lastErr = &errCopy
	}
	if sr.Metadata != nil {
		if t, ok := sr.Metadata["tokens_used"].(int); ok {
			c.totalTokens += t
		}
	}
	c.mu.Unlock()
	return sr, nil
}

func (c *stepRunCollector) LastError() *FlowError {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.lastErr
}

func (c *stepRunCollector) TotalTokens() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.totalTokens
}

func (c *stepRunCollector) Records() []StepRun {
	c.mu.Lock()
	defer c.mu.Unlock()
	out := make([]StepRun, 0, len(c.order))
	for _, k := range c.order {
		out = append(out, c.byKey[k])
	}
	return out
}

func (e *Engine) compileGraph(
	flow *Flow,
	scopePrefix string,
	steps []StepNode,
	collector *stepRunCollector,
	loaderCache *LoaderCache,
	artifacts ArtifactResolver,
) (*graph.Graph[*FlowState], error) {
	b := graph.New[*FlowState]().WithName(flow.Name)
	nodeSeq := 0
	nextID := func(prefix string) string {
		nodeSeq++
		return fmt.Sprintf("%s#%d", prefix, nodeSeq)
	}

	e.compileSequence(b, flow, scopePrefix, steps, graph.START, graph.END, collector, loaderCache, artifacts, nextID)
	return b.Build()
}

// compileSequence wires a flat-first sequence of steps from entryNode to exitNode,
// returning true if any path in this sequence reaches exitNode.
func (e *Engine) compileSequence(
	b *graph.Builder[*FlowState],
	flow *Flow,
	scopePrefix string,
	steps []StepNode,
	entryNode string,
	exitNode string,
	collector *stepRunCollector,
	loaderCache *LoaderCache,
	artifacts ArtifactResolver,
	nextID func(string) string,
) bool {
	if len(steps) == 0 {
		if entryNode != exitNode {
			b.AddEdge(entryNode, exitNode)
		}
		return true
	}

	prevNode := entryNode
	for i := range steps {
		step := steps[i]
		isLast := i == len(steps)-1
		nodeName := nextID(scopePrefix + step.ID)

		var targetExit string
		if isLast {
			targetExit = exitNode
		} else {
			targetExit = nextID("join_" + scopePrefix + step.ID)
		}

		b.AddEdge(prevNode, nodeName)

		var reachesTarget bool
		switch step.Type {
		case StepFilter:
			b.AddNode(nodeName, e.makeFilterNode(scopePrefix, step, collector, loaderCache))
			b.AddConditionalEdge(nodeName, targetExit, func(s *FlowState) bool {
				return s.TerminalStatus == ""
			})
			b.AddConditionalEdge(nodeName, graph.END, func(s *FlowState) bool {
				return s.TerminalStatus != ""
			})
			reachesTarget = true

		case StepOutput, StepStop:
			b.AddNode(nodeName, e.makeTerminalNode(scopePrefix, step, collector, loaderCache))
			b.AddEdge(nodeName, graph.END)
			reachesTarget = false

		case StepSwitch:
			b.AddNode(nodeName, e.makeSwitchNode(scopePrefix, step, collector, loaderCache))
			routes := make(map[string]string, len(step.Cases)+1)
			reachesTarget = false

			for ci := range step.Cases {
				sc := step.Cases[ci]
				if len(sc.Steps) == 0 {
					routes[sc.Name] = targetExit
					reachesTarget = true
					continue
				}
				caseEntry := nextID(scopePrefix + step.ID + "_case_" + sc.Name)
				b.AddNode(caseEntry, graph.NodeFunc(func(_ context.Context, s *FlowState) (graph.Command[*FlowState], error) {
					return graph.Update[*FlowState](func(st *FlowState) *FlowState { return st }), nil
				}))
				routes[sc.Name] = caseEntry
				if e.compileSequence(b, flow, scopePrefix, sc.Steps, caseEntry, targetExit, collector, loaderCache, artifacts, nextID) {
					reachesTarget = true
				}
			}

			if len(step.Default) == 0 {
				routes["__default__"] = targetExit
				reachesTarget = true
			} else {
				defEntry := nextID(scopePrefix + step.ID + "_default")
				b.AddNode(defEntry, graph.NodeFunc(func(_ context.Context, s *FlowState) (graph.Command[*FlowState], error) {
					return graph.Update[*FlowState](func(st *FlowState) *FlowState { return st }), nil
				}))
				routes["__default__"] = defEntry
				if e.compileSequence(b, flow, scopePrefix, step.Default, defEntry, targetExit, collector, loaderCache, artifacts, nextID) {
					reachesTarget = true
				}
			}

			b.AddRouteEdge(nodeName, func(s *FlowState) (string, error) {
				if s.RouteChoice == "" {
					return "__default__", nil
				}
				return s.RouteChoice, nil
			}, routes)

		case StepForEach:
			b.AddNode(nodeName, e.makeForEachNode(flow, scopePrefix, step, collector, loaderCache, artifacts))
			b.AddEdge(nodeName, targetExit)
			reachesTarget = true

		default:
			b.AddNode(nodeName, e.makeActionOrBuiltinNode(flow, scopePrefix, step, collector, loaderCache, artifacts))
			b.AddEdge(nodeName, targetExit)
			reachesTarget = true
		}

		if !reachesTarget {
			return false
		}

		if !isLast {
			b.AddNode(targetExit, graph.NodeFunc(func(_ context.Context, s *FlowState) (graph.Command[*FlowState], error) {
				return graph.Update[*FlowState](func(st *FlowState) *FlowState { return st }), nil
			}))
			prevNode = targetExit
		}
	}

	return true
}

func (e *Engine) makeFilterNode(
	scopePrefix string,
	step StepNode,
	collector *stepRunCollector,
	loaderCache *LoaderCache,
) graph.Node[*FlowState] {
	return graph.NodeFunc(func(ctx context.Context, state *FlowState) (graph.Command[*FlowState], error) {
		execKey := scopePrefix + step.ID
		if cp, ok := collector.GetCheckpoint(execKey); ok {
			return e.replayCheckpoint(step, cp), nil
		}

		start := time.Now().UTC()
		sources, srcMeta, srcErr := loaderCache.ResolveStepSources(ctx, state.Space.ID, step.Sources, state)
		if srcErr != nil {
			return e.handleStepFailure(ctx, state, step, execKey, start, srcMeta, "", 0, srcErr, collector)
		}

		condExpr, _ := step.Inputs["condition"].(string)
		passed, err := e.cel.EvalCondition(condExpr, state, sources)
		if err != nil {
			return e.handleStepFailure(ctx, state, step, execKey, start, srcMeta, "", 0, err, collector)
		}

		var reason string
		if rawReason, ok := step.Inputs["reason"]; ok {
			if resolvedReason, err := e.cel.ResolveValue(rawReason, state, sources); err == nil {
				reason = stringifyValue(resolvedReason)
			}
		}

		out := map[string]any{"passed": passed}
		status := StepCompleted
		if !passed {
			status = StepFiltered
		}
		if err := recordStepRun(ctx, collector, step, execKey, status, out, start, srcMeta, 0, "", ""); err != nil {
			return nil, err
		}

		return graph.Update[*FlowState](func(s *FlowState) *FlowState {
			s.Steps[step.ID] = out
			if !passed {
				s.TerminalStatus = RunFiltered
				s.FilterReason = reason
			}
			return s
		}), nil
	})
}

func (e *Engine) makeTerminalNode(
	scopePrefix string,
	step StepNode,
	collector *stepRunCollector,
	loaderCache *LoaderCache,
) graph.Node[*FlowState] {
	return graph.NodeFunc(func(ctx context.Context, state *FlowState) (graph.Command[*FlowState], error) {
		execKey := scopePrefix + step.ID
		if cp, ok := collector.GetCheckpoint(execKey); ok {
			return graph.Update[*FlowState](func(s *FlowState) *FlowState {
				s.Steps[step.ID] = cp.Output
				if step.Type == StepOutput {
					s.Output = cp.Output
					s.TerminalStatus = RunCompleted
				} else {
					s.TerminalStatus = RunStopped
				}
				return s
			}), nil
		}

		start := time.Now().UTC()
		sources, srcMeta, srcErr := loaderCache.ResolveStepSources(ctx, state.Space.ID, step.Sources, state)
		if srcErr != nil {
			return e.handleStepFailure(ctx, state, step, execKey, start, srcMeta, "", 0, srcErr, collector)
		}

		resolvedInputs, err := e.cel.ResolveMap(step.Inputs, state, sources)
		if err != nil {
			return e.handleStepFailure(ctx, state, step, execKey, start, srcMeta, "", 0, err, collector)
		}

		if step.Type == StepOutput {
			var outputMap map[string]any
			if val, exists := resolvedInputs["value"]; exists {
				if m, ok := val.(map[string]any); ok {
					outputMap = m
				} else {
					outputMap = map[string]any{"value": val}
				}
			} else {
				outputMap = resolvedInputs
			}
			if err := recordStepRun(ctx, collector, step, execKey, StepCompleted, outputMap, start, srcMeta, 0, "", ""); err != nil {
				return nil, err
			}
			return graph.Update[*FlowState](func(s *FlowState) *FlowState {
				s.Steps[step.ID] = outputMap
				s.Output = outputMap
				s.TerminalStatus = RunCompleted
				return s
			}), nil
		}

		reason := stringifyValue(resolvedInputs["reason"])
		out := map[string]any{"stopped": true}
		if reason != "" {
			out["reason"] = reason
		}
		if err := recordStepRun(ctx, collector, step, execKey, StepStopped, out, start, srcMeta, 0, "", ""); err != nil {
			return nil, err
		}
		return graph.Update[*FlowState](func(s *FlowState) *FlowState {
			s.Steps[step.ID] = out
			s.TerminalStatus = RunStopped
			s.StopReason = reason
			return s
		}), nil
	})
}

func (e *Engine) makeSwitchNode(
	scopePrefix string,
	step StepNode,
	collector *stepRunCollector,
	loaderCache *LoaderCache,
) graph.Node[*FlowState] {
	return graph.NodeFunc(func(ctx context.Context, state *FlowState) (graph.Command[*FlowState], error) {
		execKey := scopePrefix + step.ID
		if cp, ok := collector.GetCheckpoint(execKey); ok {
			return graph.Update[*FlowState](func(s *FlowState) *FlowState {
				s.Steps[step.ID] = cp.Output
				if matched, ok := cp.Output["matched_case"].(string); ok && matched != "" {
					s.RouteChoice = matched
				} else {
					s.RouteChoice = "__default__"
				}
				return s
			}), nil
		}

		start := time.Now().UTC()
		sources, srcMeta, srcErr := loaderCache.ResolveStepSources(ctx, state.Space.ID, step.Sources, state)
		if srcErr != nil {
			return e.handleStepFailure(ctx, state, step, execKey, start, srcMeta, "", 0, srcErr, collector)
		}

		var matchedCase any
		routeChoice := "__default__"
		for _, sc := range step.Cases {
			ok, err := e.cel.EvalCondition(sc.Condition, state, sources)
			if err != nil {
				return e.handleStepFailure(ctx, state, step, execKey, start, srcMeta, "", 0, err, collector)
			}
			if ok {
				matchedCase = sc.Name
				routeChoice = sc.Name
				break
			}
		}

		out := map[string]any{"matched_case": matchedCase}
		if err := recordStepRun(ctx, collector, step, execKey, StepCompleted, out, start, srcMeta, 0, "", ""); err != nil {
			return nil, err
		}

		return graph.Update[*FlowState](func(s *FlowState) *FlowState {
			s.Steps[step.ID] = out
			s.RouteChoice = routeChoice
			return s
		}), nil
	})
}

func (e *Engine) makeForEachNode(
	flow *Flow,
	scopePrefix string,
	step StepNode,
	collector *stepRunCollector,
	loaderCache *LoaderCache,
	artifacts ArtifactResolver,
) graph.Node[*FlowState] {
	return graph.NodeFunc(func(ctx context.Context, state *FlowState) (graph.Command[*FlowState], error) {
		execKey := scopePrefix + step.ID
		if cp, ok := collector.GetCheckpoint(execKey); ok {
			return e.replayCheckpoint(step, cp), nil
		}

		start := time.Now().UTC()
		sources, srcMeta, srcErr := loaderCache.ResolveStepSources(ctx, state.Space.ID, step.Sources, state)
		if srcErr != nil {
			return e.handleStepFailure(ctx, state, step, execKey, start, srcMeta, "", 0, srcErr, collector)
		}

		items, err := e.cel.EvalList(step.Inputs["items"], state, sources)
		if err != nil {
			return e.handleStepFailure(ctx, state, step, execKey, start, srcMeta, "", 0, err, collector)
		}
		alias, _ := step.Inputs["item_alias"].(string)

		results := make([]any, 0, len(items))
		addedTokens := 0

		for idx, item := range items {
			iterPrefix := fmt.Sprintf("%s%s[%d].", scopePrefix, step.ID, idx)
			iterGraph, err := e.compileGraph(flow, iterPrefix, step.Steps, collector, loaderCache, artifacts)
			if err != nil {
				return e.handleStepFailure(ctx, state, step, execKey, start, srcMeta, "", addedTokens, err, collector)
			}

			iterState := state.Copy()
			iterState.Loop = maps.Clone(state.Loop)
			if iterState.Loop == nil {
				iterState.Loop = make(map[string]any)
			}
			iterState.Loop[alias] = map[string]any{
				"item":  item,
				"index": int64(idx),
			}
			iterState.Output = nil
			iterState.TerminalStatus = ""
			iterState.TotalTokens = 0

			snap, iterErr := iterGraph.Execute(ctx, graph.Update[*FlowState](func(_ *FlowState) *FlowState {
				return iterState
			}), nil)
			if snap.State != nil {
				addedTokens += snap.State.TotalTokens
			}
			if iterErr != nil {
				return e.handleStepFailure(ctx, state, step, execKey, start, srcMeta, "", addedTokens, iterErr, collector)
			}

			var iterResult any
			if snap.State != nil {
				if snap.State.Output != nil {
					iterResult = snap.State.Output
				} else if len(step.Steps) > 0 {
					lastID := step.Steps[len(step.Steps)-1].ID
					iterResult = snap.State.Steps[lastID]
				}
			}
			results = append(results, iterResult)
		}

		out := map[string]any{
			"count":   int64(len(items)),
			"results": results,
		}
		if err := recordStepRun(ctx, collector, step, execKey, StepCompleted, out, start, srcMeta, addedTokens, "", ""); err != nil {
			return nil, err
		}

		return graph.Update[*FlowState](func(s *FlowState) *FlowState {
			s.Steps[step.ID] = out
			s.TotalTokens += addedTokens
			return s
		}), nil
	})
}

func (e *Engine) makeActionOrBuiltinNode(
	flow *Flow,
	scopePrefix string,
	step StepNode,
	collector *stepRunCollector,
	loaderCache *LoaderCache,
	artifacts ArtifactResolver,
) graph.Node[*FlowState] {
	return graph.NodeFunc(func(ctx context.Context, state *FlowState) (graph.Command[*FlowState], error) {
		execKey := scopePrefix + step.ID
		if cp, ok := collector.GetCheckpoint(execKey); ok {
			return e.replayCheckpoint(step, cp), nil
		}

		start := time.Now().UTC()
		sources, srcMeta, srcErr := loaderCache.ResolveStepSources(ctx, state.Space.ID, step.Sources, state)
		if srcErr != nil {
			return e.handleStepFailure(ctx, state, step, execKey, start, srcMeta, "", 0, srcErr, collector)
		}

		resolvedInputs, err := e.cel.ResolveMap(step.Inputs, state, sources)
		if err != nil {
			return e.handleStepFailure(ctx, state, step, execKey, start, srcMeta, "", 0, err, collector)
		}

		stepRunID, err := GenerateStepRunID()
		if err != nil {
			return nil, err
		}

		var out map[string]any
		var agentRunID string
		var tokensUsed int
		var modelName string

		switch step.Type {
		case StepTransform:
			out = resolvedInputs

		case StepDocumentExtractText:
			out, err = executeDocumentExtractText(ctx, state.Space.ID, resolvedInputs, artifacts)

		case StepLLMGenerate:
			out, agentRunID, tokensUsed, modelName, err = e.executeLLMGenerate(ctx, flow, step, state, stepRunID, resolvedInputs, artifacts)

		default:
			desc, handler, ok := e.registry.GetStep(step.Type)
			if !ok || handler == nil {
				err = fmt.Errorf("no handler registered for step type %q", step.Type)
			} else {
				execCtx := &StepExecutionContext{
					SpaceID:   state.Space.ID,
					FlowRunID: state.Run.ID,
					StepRunID: stepRunID,
					Step:      step,
					Inputs:    resolvedInputs,
					Sources:   sources,
					State:     state.Copy(),
					Artifacts: artifacts,
				}
				out, err = handler.Execute(ctx, execCtx)
				if err == nil {
					for _, prefix := range desc.InvalidatesPrefixes {
						loaderCache.InvalidatePrefix(prefix)
					}
					if len(desc.InvalidatesPrefixes) == 0 && desc.Category == "action" {
						if domainPrefix, _, hasDot := strings.Cut(step.Type, "."); hasDot {
							loaderCache.InvalidatePrefix(domainPrefix + ".")
						}
					}
				}
			}
		}

		if err != nil {
			return e.handleStepFailure(ctx, state, step, execKey, start, srcMeta, agentRunID, tokensUsed, err, collector)
		}

		if out == nil {
			out = map[string]any{}
		}
		if err := recordStepRunWithID(ctx, collector, stepRunID, step, execKey, StepCompleted, out, start, srcMeta, tokensUsed, modelName, agentRunID); err != nil {
			return nil, err
		}

		return graph.Update[*FlowState](func(s *FlowState) *FlowState {
			s.Steps[step.ID] = out
			s.TotalTokens += tokensUsed
			return s
		}), nil
	})
}

func (e *Engine) replayCheckpoint(step StepNode, cp StepRun) graph.Command[*FlowState] {
	return graph.Update[*FlowState](func(s *FlowState) *FlowState {
		if cp.Status == StepFailedContinued {
			s.Steps[step.ID] = nil
		} else {
			s.Steps[step.ID] = cp.Output
		}
		if cp.Status == StepFiltered {
			s.TerminalStatus = RunFiltered
		}
		return s
	})
}

func (e *Engine) handleStepFailure(
	ctx context.Context,
	state *FlowState,
	step StepNode,
	execKey string,
	start time.Time,
	srcMeta map[string]any,
	agentRunID string,
	tokensUsed int,
	stepErr error,
	collector *stepRunCollector,
) (graph.Command[*FlowState], error) {
	end := time.Now().UTC()
	code := extractErrorCode(stepErr)
	flowErr := newStepFlowError(step.ID, code, stepErr.Error())
	meta := buildStepMeta(start, end, srcMeta, tokensUsed, "")

	sr := StepRun{
		StepID:       step.ID,
		StepType:     step.Type,
		ExecutionKey: execKey,
		Error:        flowErr,
		Metadata:     meta,
		StartTime:    start,
		EndTime:      new(end),
	}
	if agentRunID != "" {
		sr.AgentRunID = new(agentRunID)
	}

	if step.EffectiveOnError() == OnErrorContinue {
		sr.Status = StepFailedContinued
		if _, recErr := collector.Record(ctx, sr); recErr != nil {
			return nil, recErr
		}
		return graph.Update[*FlowState](func(s *FlowState) *FlowState {
			s.Steps[step.ID] = nil
			s.TotalTokens += tokensUsed
			return s
		}), nil
	}

	sr.Status = StepFailed
	if _, recErr := collector.Record(ctx, sr); recErr != nil {
		return nil, recErr
	}
	state.TerminalStatus = RunFailed
	state.TerminalError = flowErr
	state.TotalTokens += tokensUsed
	return nil, stepErr
}

func (e *Engine) executeLLMGenerate(
	ctx context.Context,
	flow *Flow,
	step StepNode,
	state *FlowState,
	stepRunID string,
	inputs map[string]any,
	artifacts ArtifactResolver,
) (map[string]any, string, int, string, error) {
	if e.agentExec == nil {
		return nil, "", 0, "", fmt.Errorf("agent executor is not configured for llm.generate")
	}

	prompt := stringifyValue(inputs["prompt"])
	if strings.TrimSpace(prompt) == "" {
		return nil, "", 0, "", fmt.Errorf("llm.generate step %q requires non-empty prompt", step.ID)
	}
	systemInstruction := stringifyValue(inputs["system"])

	var outputSchema map[string]any
	if rawSchema, ok := inputs["output_schema"].(map[string]any); ok {
		outputSchema = rawSchema
	}

	docs, err := resolveDocumentsInput(ctx, state.Space.ID, inputs["documents"], artifacts)
	if err != nil {
		return nil, "", 0, "", fmt.Errorf("resolve documents: %w", err)
	}

	modelCfg := resolveEffectiveModel(step.Model, flow.Config.DefaultModel)
	resp, err := e.agentExec.Execute(ctx, LLMRequest{
		SpaceID:           state.Space.ID,
		FlowRunID:         state.Run.ID,
		StepRunID:         stepRunID,
		Model:             modelCfg,
		SystemInstruction: systemInstruction,
		Prompt:            prompt,
		OutputSchema:      outputSchema,
		Documents:         docs,
	})
	if err != nil {
		var agentRunID string
		var tokens int
		var modelName string
		if resp != nil {
			agentRunID = resp.AgentRunID
			tokens = resp.TokensUsed
			modelName = resp.ModelName
		}
		return nil, agentRunID, tokens, modelName, err
	}

	if outputSchema != nil {
		if resp.ParsedJSON != nil {
			return resp.ParsedJSON, resp.AgentRunID, resp.TokensUsed, resp.ModelName, nil
		}
		var parsed map[string]any
		cleanText := StripMarkdownCodeFence(resp.Text)
		if err := json.Unmarshal([]byte(cleanText), &parsed); err != nil {
			return nil, resp.AgentRunID, resp.TokensUsed, resp.ModelName, fmt.Errorf("parse llm structured output: %w", err)
		}
		return parsed, resp.AgentRunID, resp.TokensUsed, resp.ModelName, nil
	}

	return map[string]any{"text": resp.Text}, resp.AgentRunID, resp.TokensUsed, resp.ModelName, nil
}

func resolveEffectiveModel(stepModel, flowDefault *ModelConfig) *ModelConfig {
	if stepModel == nil && flowDefault == nil {
		return nil
	}
	if stepModel != nil {
		return stepModel
	}
	return flowDefault
}

func resolveDocumentsInput(
	ctx context.Context,
	spaceID string,
	rawDocs any,
	artifacts ArtifactResolver,
) ([]ResolvedArtifact, error) {
	if rawDocs == nil {
		return nil, nil
	}
	items, err := toAnySlice(rawDocs)
	if err != nil {
		return nil, err
	}
	out := make([]ResolvedArtifact, 0, len(items))
	for _, item := range items {
		if item == nil {
			continue
		}
		refStr, filename, contentType := parseArtifactRefItem(item)
		if strings.TrimSpace(refStr) == "" {
			continue
		}
		resolved, err := artifacts.Resolve(ctx, spaceID, refStr)
		if err != nil {
			return nil, err
		}
		if resolved.Filename == "" {
			resolved.Filename = filename
		}
		if resolved.ContentType == "" {
			resolved.ContentType = contentType
		}
		out = append(out, resolved)
	}
	return out, nil
}

func executeDocumentExtractText(
	ctx context.Context,
	spaceID string,
	inputs map[string]any,
	artifacts ArtifactResolver,
) (map[string]any, error) {
	refStr, _, _ := parseArtifactRefItem(inputs["artifact_ref"])
	if strings.TrimSpace(refStr) == "" {
		return nil, fmt.Errorf("document.extract_text requires artifact_ref")
	}

	resolved, err := artifacts.Resolve(ctx, spaceID, refStr)
	if err != nil {
		return nil, fmt.Errorf("resolve artifact %q: %w", refStr, err)
	}

	filename := stringifyValue(inputs["filename"])
	if filename == "" {
		filename = resolved.Filename
	}
	contentType := stringifyValue(inputs["content_type"])
	if contentType == "" {
		contentType = resolved.ContentType
	}

	isPDF := strings.EqualFold(contentType, "application/pdf") ||
		strings.HasSuffix(strings.ToLower(filename), ".pdf") ||
		(len(resolved.Data) >= 5 && string(resolved.Data[:5]) == "%PDF-")

	if !isPDF {
		if !utf8.Valid(resolved.Data) {
			return map[string]any{
				"text":           "",
				"is_encrypted":   false,
				"decrypted":      false,
				"needs_password": false,
				"error":          "binary document is not a supported text or PDF format",
			}, nil
		}
		return map[string]any{
			"text":           string(resolved.Data),
			"is_encrypted":   false,
			"decrypted":      false,
			"needs_password": false,
		}, nil
	}

	isEncrypted, err := pdf.IsEncrypted(ctx, resolved.Data)
	if err != nil {
		return map[string]any{
			"text":           "",
			"is_encrypted":   false,
			"decrypted":      false,
			"needs_password": false,
			"error":          err.Error(),
		}, nil
	}

	pdfBytes := resolved.Data
	decrypted := false
	if isEncrypted {
		var passwords []string
		if rawPWs, ok := inputs["passwords"]; ok && rawPWs != nil {
			if slicePWs, err := toAnySlice(rawPWs); err == nil {
				for _, pw := range slicePWs {
					if s := stringifyValue(pw); strings.TrimSpace(s) != "" {
						passwords = append(passwords, s)
					}
				}
			}
		}

		for _, pw := range passwords {
			dec, decErr := pdf.Decrypt(ctx, resolved.Data, pw)
			if decErr == nil {
				pdfBytes = dec
				decrypted = true
				break
			}
		}

		if !decrypted {
			return map[string]any{
				"text":           "",
				"is_encrypted":   true,
				"decrypted":      false,
				"needs_password": true,
				"error":          "PDF is password-protected; provide a valid password",
			}, nil
		}
	}

	text, err := pdf.ExtractText(pdfBytes)
	if err != nil {
		return map[string]any{
			"text":           "",
			"is_encrypted":   isEncrypted,
			"decrypted":      decrypted,
			"needs_password": false,
			"error":          err.Error(),
		}, nil
	}

	return map[string]any{
		"text":           text,
		"is_encrypted":   isEncrypted,
		"decrypted":      decrypted,
		"needs_password": false,
	}, nil
}

type compositeArtifactResolver struct {
	ephemeral map[string]ResolvedArtifact
	registry  *Registry
}

func (r *compositeArtifactResolver) Resolve(ctx context.Context, spaceID string, ref string) (ResolvedArtifact, error) {
	if strings.HasPrefix(ref, "ephemeral://") {
		if art, ok := r.ephemeral[ref]; ok {
			return art, nil
		}
		return ResolvedArtifact{}, fmt.Errorf("ephemeral artifact %q not found", ref)
	}
	scheme, _, hasScheme := strings.Cut(ref, "://")
	if !hasScheme {
		return ResolvedArtifact{}, fmt.Errorf("artifact ref %q missing URI scheme", ref)
	}
	reader, ok := r.registry.GetArtifactReader(scheme)
	if !ok || reader == nil {
		return ResolvedArtifact{}, fmt.Errorf("no artifact reader registered for scheme %q", scheme)
	}
	return reader.Read(ctx, spaceID, ref)
}

func recordStepRun(
	ctx context.Context,
	collector *stepRunCollector,
	step StepNode,
	execKey string,
	status StepRunStatus,
	out map[string]any,
	start time.Time,
	srcMeta map[string]any,
	tokensUsed int,
	modelName string,
	agentRunID string,
) error {
	return recordStepRunWithID(ctx, collector, "", step, execKey, status, out, start, srcMeta, tokensUsed, modelName, agentRunID)
}

func recordStepRunWithID(
	ctx context.Context,
	collector *stepRunCollector,
	stepRunID string,
	step StepNode,
	execKey string,
	status StepRunStatus,
	out map[string]any,
	start time.Time,
	srcMeta map[string]any,
	tokensUsed int,
	modelName string,
	agentRunID string,
) error {
	end := time.Now().UTC()
	sr := StepRun{
		ID:           stepRunID,
		StepID:       step.ID,
		StepType:     step.Type,
		ExecutionKey: execKey,
		Status:       status,
		Output:       out,
		Metadata:     buildStepMeta(start, end, srcMeta, tokensUsed, modelName),
		StartTime:    start,
		EndTime:      new(end),
	}
	if agentRunID != "" {
		sr.AgentRunID = new(agentRunID)
	}
	_, err := collector.Record(ctx, sr)
	return err
}

func buildStepMeta(start, end time.Time, srcMeta map[string]any, tokens int, modelName string) map[string]any {
	meta := map[string]any{
		"duration_ms": end.Sub(start).Milliseconds(),
	}
	if len(srcMeta) > 0 {
		meta["sources"] = srcMeta
	}
	if tokens > 0 {
		meta["tokens_used"] = tokens
	}
	if modelName != "" {
		meta["model_name"] = modelName
	}
	return meta
}

func extractErrorCode(err error) string {
	if domErr, ok := errors.AsType[*errors.Error](err); ok {
		if domErr.Code != "" {
			return string(domErr.Code)
		}
		if domErr.Kind != 0 {
			return strings.ToUpper(domErr.Kind.String())
		}
	}
	return "STEP_FAILED"
}

func derefString(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func newTriggerContext(trigger *Trigger, data map[string]any) TriggerContext {
	if trigger == nil {
		return TriggerContext{Data: nonNilMap(data)}
	}
	return TriggerContext{
		ID:    trigger.ID,
		Type:  string(trigger.Type),
		Topic: derefString(trigger.Config.Topic),
		Data:  nonNilMap(data),
	}
}

func loadCheckpoints(dst map[string]StepRun, stepRuns []StepRun) {
	for _, sr := range stepRuns {
		dst[sr.ExecutionKey] = sr
	}
}

func parseArtifactRefItem(item any) (refStr, filename, contentType string) {
	switch x := item.(type) {
	case string:
		return x, "", ""
	case map[string]any:
		return stringifyValue(x["ref"]), stringifyValue(x["filename"]), stringifyValue(x["content_type"])
	case ArtifactRef:
		return x.Ref, x.Filename, x.ContentType
	default:
		return "", "", ""
	}
}

// StripMarkdownCodeFence trims optional markdown ``` fences around structured model responses.
func StripMarkdownCodeFence(s string) string {
	trimmed := strings.TrimSpace(s)
	if strings.HasPrefix(trimmed, "```") {
		if _, after, ok := strings.Cut(trimmed, "\n"); ok {
			trimmed = after
		}
		trimmed = strings.TrimSuffix(trimmed, "```")
		trimmed = strings.TrimSpace(trimmed)
	}
	return trimmed
}
