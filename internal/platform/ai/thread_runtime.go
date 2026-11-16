package ai

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/masterkeysrd/loom/llm"
	"github.com/masterkeysrd/loom/memory"
	"github.com/masterkeysrd/loom/message"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/paging"
)

// StreamEventEmitter receives streaming thread events in real time.
type StreamEventEmitter func(event ThreadStreamEvent)

// StreamTurnRequest configures an interactive user turn on a private Thread.
type StreamTurnRequest struct {
	SpaceID     string
	UserID      string
	ThreadID    string
	Content     string
	Attachments []TurnAttachment
	AgentID     *string
	ModelID     *string
	ContextHint *string
}

// ResolveApprovalsRequest resumes a paused thread turn with user tool confirmation decisions.
type ResolveApprovalsRequest struct {
	SpaceID   string
	UserID    string
	ThreadID  string
	Decisions []ToolApprovalDecision
}

// ThreadRuntime manages private multi-turn streaming chat, write-tool approvals,
// active-turn cancellation, attachment processing, and rolling memory compaction.
type ThreadRuntime struct {
	rt            *Runtime
	activeMu      sync.Mutex
	activeCancels map[string]context.CancelFunc
}

// NewThreadRuntime constructs a new ThreadRuntime sharing Runtime's store, invoker, MCP, and settings ports.
func NewThreadRuntime(rt *Runtime) *ThreadRuntime {
	return &ThreadRuntime{
		rt:            rt,
		activeCancels: make(map[string]context.CancelFunc),
	}
}

// CancelTurn aborts an active in-flight stream for threadID and resets thread status to idle.
func (tr *ThreadRuntime) CancelTurn(ctx context.Context, spaceID, userID, threadID string) (*Thread, error) {
	const op errors.Op = "platform/ai.ThreadRuntime.CancelTurn"

	th, err := tr.rt.store.Threads().Get(ctx, spaceID, userID, threadID)
	if err != nil {
		return nil, errors.E(op, err)
	}

	tr.activeMu.Lock()
	cancelFn, hasActive := tr.activeCancels[th.ID]
	tr.activeMu.Unlock()

	if hasActive && cancelFn != nil {
		cancelFn()
	}

	if th.Status == ThreadStreaming && !hasActive {
		if th.State.ActiveRunID != nil {
			if run, rErr := tr.rt.store.Runs().Get(ctx, spaceID, *th.State.ActiveRunID); rErr == nil && run != nil {
				now := tr.rt.nowFn()
				run.Status = RunCancelled
				run.EndTime = &now
				_ = tr.rt.store.Runs().Update(ctx, run)
			}
		}
		th.Status = ThreadIdle
		th.State.ActiveRunID = nil
		if err := tr.rt.store.Threads().Update(ctx, th); err != nil {
			return nil, errors.E(op, err)
		}
	}

	return th, nil
}

// StreamTurn persists the user turn, compacts memory if needed, streams LLM + MCP tool execution,
// pauses on mutating tools under confirm_writes, and emits real-time ThreadStreamEvents.
func (tr *ThreadRuntime) StreamTurn(ctx context.Context, req StreamTurnRequest, emit StreamEventEmitter) error {
	const op errors.Op = "platform/ai.ThreadRuntime.StreamTurn"

	if emit == nil {
		emit = func(ThreadStreamEvent) {}
	}
	if strings.TrimSpace(req.Content) == "" && len(req.Attachments) == 0 {
		return errors.E(op, errors.Invalid, "message content or attachments required")
	}

	th, err := tr.rt.store.Threads().Get(ctx, req.SpaceID, req.UserID, req.ThreadID)
	if err != nil {
		return errors.E(op, err)
	}

	agentID := SystemSaturnAssistantKey
	if req.AgentID != nil && strings.TrimSpace(*req.AgentID) != "" {
		agentID = strings.TrimSpace(*req.AgentID)
	} else if th.AgentID != nil && strings.TrimSpace(*th.AgentID) != "" {
		agentID = *th.AgentID
	}

	agent, err := tr.rt.store.Agents().Get(ctx, req.SpaceID, agentID)
	if err != nil {
		return errors.E(op, err)
	}
	if !agent.IsEnabled {
		return errors.E(op, errors.Precondition, CodeAgentDisabled, "agent is disabled")
	}

	if err := tr.recoverOrRejectBusyThread(ctx, th, agent); err != nil {
		return errors.E(op, err)
	}

	modelIDPtr := agent.ModelID
	if th.ModelID != nil && strings.TrimSpace(*th.ModelID) != "" {
		modelIDPtr = th.ModelID
	}
	if req.ModelID != nil && strings.TrimSpace(*req.ModelID) != "" {
		modelIDPtr = req.ModelID
	}

	rm, err := tr.rt.resolveModelAndCheckBudget(ctx, req.SpaceID, modelIDPtr, nil)
	if err != nil {
		return errors.E(op, err)
	}

	attSummaries, userLLMBlocks, err := prepareTurnAttachments(req.Content, req.Attachments, rm.model.Profile.Capabilities)
	if err != nil {
		return errors.E(op, err)
	}

	// Stale approval cleanup: pair any pending tool calls before appending a new user turn.
	if err := tr.cleanupStaleApprovals(ctx, th); err != nil {
		return errors.E(op, err)
	}

	isFirstTurn := th.MessageCount == 0

	startTime := tr.rt.nowFn()
	run := &Run{
		SpaceID:    req.SpaceID,
		Kind:       RunKindChatTurn,
		Source:     RunSourceChat,
		ThreadID:   new(th.ID),
		AgentID:    new(agent.ID),
		ProviderID: new(rm.provider.ID),
		ModelID:    new(rm.model.ID),
		Status:     RunRunning,
		Input: RunInput{
			Prompt:            req.Content,
			SystemInstruction: agent.Config.SystemInstruction,
			ModelSnapshot: &ModelSnapshot{
				Driver:    string(rm.provider.Driver),
				ModelName: rm.model.ModelID,
			},
		},
		StartTime: startTime,
	}
	if err := tr.rt.store.Runs().Create(ctx, run); err != nil {
		return errors.E(op, err)
	}

	// Persist user message (metadata + extracted attachment text only; zero raw binary bytes).
	userBlocks := make([]ContentBlock, 0, len(attSummaries)+1)
	for i := range attSummaries {
		att := attSummaries[i]
		userBlocks = append(userBlocks, ContentBlock{
			Type:       BlockAttachment,
			Attachment: &att,
		})
	}
	if strings.TrimSpace(req.Content) != "" {
		userBlocks = append(userBlocks, ContentBlock{
			Type: BlockText,
			Text: new(req.Content),
		})
	}

	userMsg := &ThreadMessage{
		ThreadID: th.ID,
		SpaceID:  req.SpaceID,
		RunID:    new(run.ID),
		Role:     RoleUser,
		Blocks:   userBlocks,
	}
	if err := tr.rt.store.Threads().AppendMessage(ctx, req.SpaceID, req.UserID, userMsg); err != nil {
		return errors.E(op, err)
	}
	th.MessageCount++

	emit(ThreadStreamEvent{
		Type:     EventMessageCompleted,
		ThreadID: new(th.ID),
		RunID:    new(run.ID),
		Message:  userMsg,
	})

	th.Status = ThreadStreaming
	th.State.ActiveRunID = new(run.ID)
	if err := tr.rt.store.Threads().Update(ctx, th); err != nil {
		return errors.E(op, err)
	}

	emit(ThreadStreamEvent{
		Type:     EventRunStarted,
		ThreadID: new(th.ID),
		RunID:    new(run.ID),
	})

	// Compact prior history if needed via loom/memory.Summarizer, then build LLM messages.
	historyMsgs, err := tr.buildAndCompactHistory(ctx, th, rm, agent, req.ContextHint, userMsg.Seq, userLLMBlocks)
	if err != nil {
		return tr.failStreamRun(ctx, op, th, run, startTime, emit, err)
	}

	err = tr.runStreamingLoop(ctx, th, run, agent, rm, historyMsgs, isFirstTurn, req.Content, emit)
	if err != nil {
		return errors.E(op, err)
	}
	return nil
}

// ResolveApprovals executes approved mutating tool calls, records rejections, and resumes streaming.
func (tr *ThreadRuntime) ResolveApprovals(ctx context.Context, req ResolveApprovalsRequest, emit StreamEventEmitter) error {
	const op errors.Op = "platform/ai.ThreadRuntime.ResolveApprovals"

	if emit == nil {
		emit = func(ThreadStreamEvent) {}
	}

	th, err := tr.rt.store.Threads().Get(ctx, req.SpaceID, req.UserID, req.ThreadID)
	if err != nil {
		return errors.E(op, err)
	}
	if th.Status != ThreadAwaitingApproval || len(th.State.PendingApprovals) == 0 {
		return errors.E(op, errors.Precondition, "thread is not awaiting tool approvals")
	}

	agentID := SystemSaturnAssistantKey
	if th.AgentID != nil && strings.TrimSpace(*th.AgentID) != "" {
		agentID = *th.AgentID
	}
	agent, err := tr.rt.store.Agents().Get(ctx, req.SpaceID, agentID)
	if err != nil {
		return errors.E(op, err)
	}

	modelIDPtr := agent.ModelID
	if th.ModelID != nil && strings.TrimSpace(*th.ModelID) != "" {
		modelIDPtr = th.ModelID
	}
	rm, err := tr.rt.resolveModelAndCheckBudget(ctx, req.SpaceID, modelIDPtr, nil)
	if err != nil {
		return errors.E(op, err)
	}

	var run *Run
	if th.State.ActiveRunID != nil {
		run, err = tr.rt.store.Runs().Get(ctx, req.SpaceID, *th.State.ActiveRunID)
		if err != nil {
			return errors.E(op, err)
		}
	} else {
		run = &Run{
			SpaceID:    req.SpaceID,
			Kind:       RunKindChatTurn,
			Source:     RunSourceChat,
			ThreadID:   new(th.ID),
			AgentID:    new(agent.ID),
			ProviderID: new(rm.provider.ID),
			ModelID:    new(rm.model.ID),
			Status:     RunRunning,
			StartTime:  tr.rt.nowFn(),
		}
		if cErr := tr.rt.store.Runs().Create(ctx, run); cErr != nil {
			return errors.E(op, cErr)
		}
	}

	decisionMap := make(map[string]bool, len(req.Decisions))
	for _, d := range req.Decisions {
		decisionMap[d.ToolCallID] = d.Approved
	}

	mcpCtx := ensureSpaceContext(ctx, req.SpaceID)
	boundSet, err := tr.rt.connectAgentTools(mcpCtx, req.SpaceID, agent.Config.MCPBindings)
	if err != nil {
		return tr.failStreamRun(ctx, op, th, run, run.StartTime, emit, err)
	}
	defer boundSet.closeAll()

	run.Status = RunRunning
	th.Status = ThreadStreaming
	th.State.ActiveRunID = new(run.ID)
	pending := th.State.PendingApprovals
	th.State.PendingApprovals = nil
	if err := tr.rt.store.Threads().Update(ctx, th); err != nil {
		return errors.E(op, err)
	}
	_ = tr.rt.store.Runs().Update(ctx, run)

	emit(ThreadStreamEvent{
		Type:     EventRunStarted,
		ThreadID: new(th.ID),
		RunID:    new(run.ID),
	})

	resultBlocks := make([]ContentBlock, 0, len(pending))
	stepSeq := run.Metrics.StepCount

	for _, pa := range pending {
		approved := decisionMap[pa.ToolCallID]
		if !approved {
			stepSeq++
			declineText := fmt.Sprintf("User declined execution of tool %s.", pa.ToolName)
			_ = tr.rt.store.Runs().AppendStep(ctx, &RunStep{
				RunID:       run.ID,
				SpaceID:     req.SpaceID,
				Seq:         stepSeq,
				Kind:        StepKindTool,
				MCPServerID: new(pa.MCPServerID),
				Name:        pa.ToolName,
				Status:      StepStatusRejected,
				Input:       pa.Arguments,
				Error:       &ErrorDetail{Message: declineText},
			})
			resMap := map[string]any{"declined": true, "message": declineText}
			emit(ThreadStreamEvent{
				Type:        EventToolCallCompleted,
				ThreadID:    new(th.ID),
				RunID:       new(run.ID),
				ToolCallID:  new(pa.ToolCallID),
				ToolName:    new(pa.ToolName),
				MCPServerID: new(pa.MCPServerID),
				Result:      resMap,
				IsError:     new(true),
			})
			resultBlocks = append(resultBlocks, ContentBlock{
				Type:        BlockToolResult,
				ToolCallID:  new(pa.ToolCallID),
				MCPServerID: new(pa.MCPServerID),
				ToolName:    new(pa.ToolName),
				Result:      resMap,
				IsError:     new(true),
			})
			continue
		}

		bt := findPendingBoundTool(boundSet, pa)
		if bt == nil {
			stepSeq++
			missingErr := fmt.Sprintf("tool %q from server %s is no longer available", pa.ToolName, pa.MCPServerID)
			_ = tr.rt.store.Runs().AppendStep(ctx, &RunStep{
				RunID:       run.ID,
				SpaceID:     req.SpaceID,
				Seq:         stepSeq,
				Kind:        StepKindTool,
				MCPServerID: new(pa.MCPServerID),
				Name:        pa.ToolName,
				Status:      StepStatusFailed,
				Input:       pa.Arguments,
				Error:       &ErrorDetail{Message: missingErr},
			})
			resMap := map[string]any{"error": missingErr}
			emit(ThreadStreamEvent{
				Type:        EventToolCallCompleted,
				ThreadID:    new(th.ID),
				RunID:       new(run.ID),
				ToolCallID:  new(pa.ToolCallID),
				ToolName:    new(pa.ToolName),
				MCPServerID: new(pa.MCPServerID),
				Result:      resMap,
				IsError:     new(true),
			})
			resultBlocks = append(resultBlocks, ContentBlock{
				Type:        BlockToolResult,
				ToolCallID:  new(pa.ToolCallID),
				MCPServerID: new(pa.MCPServerID),
				ToolName:    new(pa.ToolName),
				Result:      resMap,
				IsError:     new(true),
			})
			continue
		}

		emit(ThreadStreamEvent{
			Type:        EventToolCallStarted,
			ThreadID:    new(th.ID),
			RunID:       new(run.ID),
			ToolCallID:  new(pa.ToolCallID),
			ToolName:    new(pa.ToolName),
			MCPServerID: new(pa.MCPServerID),
			Arguments:   pa.Arguments,
		})

		toolStart := tr.rt.nowFn()
		resMap, _, isErr := executeBoundTool(mcpCtx, bt, pa.Arguments)
		toolDur := tr.rt.nowFn().Sub(toolStart).Milliseconds()
		stepSeq++

		stepStatus := StepStatusCompleted
		var stepErr *ErrorDetail
		if isErr {
			stepStatus = StepStatusFailed
			if msgStr, ok := resMap["error"].(string); ok {
				stepErr = &ErrorDetail{Message: msgStr}
			}
		}
		_ = tr.rt.store.Runs().AppendStep(ctx, &RunStep{
			RunID:       run.ID,
			SpaceID:     req.SpaceID,
			Seq:         stepSeq,
			Kind:        StepKindTool,
			MCPServerID: new(pa.MCPServerID),
			Name:        pa.ToolName,
			Status:      stepStatus,
			Input:       pa.Arguments,
			Output:      resMap,
			Error:       stepErr,
			Metrics:     StepMetrics{DurationMS: toolDur},
		})

		emit(ThreadStreamEvent{
			Type:        EventToolCallCompleted,
			ThreadID:    new(th.ID),
			RunID:       new(run.ID),
			ToolCallID:  new(pa.ToolCallID),
			ToolName:    new(pa.ToolName),
			MCPServerID: new(pa.MCPServerID),
			Result:      resMap,
			IsError:     new(isErr),
		})

		resultBlocks = append(resultBlocks, ContentBlock{
			Type:        BlockToolResult,
			ToolCallID:  new(pa.ToolCallID),
			MCPServerID: new(pa.MCPServerID),
			ToolName:    new(pa.ToolName),
			Result:      resMap,
			IsError:     new(isErr),
		})
	}

	run.Metrics.StepCount = stepSeq

	toolMsg := &ThreadMessage{
		ThreadID: th.ID,
		SpaceID:  req.SpaceID,
		RunID:    new(run.ID),
		Role:     RoleTool,
		Blocks:   resultBlocks,
	}
	if err := tr.rt.store.Threads().AppendMessage(ctx, req.SpaceID, req.UserID, toolMsg); err != nil {
		return tr.failStreamRun(ctx, op, th, run, run.StartTime, emit, err)
	}
	th.MessageCount++
	emit(ThreadStreamEvent{
		Type:     EventMessageCompleted,
		ThreadID: new(th.ID),
		RunID:    new(run.ID),
		Message:  toolMsg,
	})

	historyMsgs, err := tr.buildHistoryFromStore(ctx, th, agent, nil, 0, nil)
	if err != nil {
		return tr.failStreamRun(ctx, op, th, run, run.StartTime, emit, err)
	}

	if err := tr.runStreamingLoop(ctx, th, run, agent, rm, historyMsgs, false, "", emit); err != nil {
		return errors.E(op, err)
	}
	return nil
}

func (tr *ThreadRuntime) runStreamingLoop(
	ctx context.Context,
	th *Thread,
	run *Run,
	agent *Agent,
	rm *resolvedModel,
	history []message.Message,
	isFirstTurn bool,
	firstTurnPrompt string,
	emit StreamEventEmitter,
) error {
	timeoutSec := agent.Config.Execution.TimeoutSeconds
	if timeoutSec <= 0 {
		timeoutSec = DefaultExecutionTimeoutSeconds
	}

	turnCtx, cancel := context.WithTimeout(ensureSpaceContext(ctx, th.SpaceID), time.Duration(timeoutSec)*time.Second)
	tr.registerCancel(th.ID, cancel)
	defer func() {
		tr.unregisterCancel(th.ID)
		cancel()
	}()

	boundSet, err := tr.rt.connectAgentTools(turnCtx, th.SpaceID, agent.Config.MCPBindings)
	if err != nil {
		return tr.failStreamRun(ctx, "platform/ai.ThreadRuntime.connectTools", th, run, run.StartTime, emit, err)
	}
	defer boundSet.closeAll()

	genCfg := mergeGenerationConfig(rm.model.Config, &agent.Config.Generation)
	genCfg = mergeGenerationConfig(genCfg, &th.Config.Generation)

	policy := agent.Config.Execution.ApprovalPolicy
	if th.Config.ApprovalPolicy != nil && *th.Config.ApprovalPolicy != "" {
		policy = *th.Config.ApprovalPolicy
	}
	if policy == "" {
		policy = ApprovalConfirmWrites
	}

	maxSteps := int(agent.Config.Execution.MaxSteps)
	if maxSteps <= 0 {
		maxSteps = 10
	}

	stepSeq := run.Metrics.StepCount
	totalUsage := run.Metrics.Tokens
	var finalText string

	for range maxSteps {
		stepStart := tr.rt.nowFn()
		var streamedText strings.Builder

		assistantMsg, streamErr := tr.rt.invoker.Stream(turnCtx, InvokeRequest{
			Provider:   rm.provider,
			ModelName:  rm.model.ModelID,
			Messages:   history,
			Tools:      boundSet.loomTools,
			Generation: genCfg,
		}, StreamCallbacks{
			OnThinkingDelta: func(delta string) {
				emit(ThreadStreamEvent{
					Type:     EventThinkingDelta,
					ThreadID: new(th.ID),
					RunID:    new(run.ID),
					Delta:    new(delta),
				})
			},
			OnTextDelta: func(delta string) {
				streamedText.WriteString(delta)
				emit(ThreadStreamEvent{
					Type:     EventMessageDelta,
					ThreadID: new(th.ID),
					RunID:    new(run.ID),
					Delta:    new(delta),
				})
			},
		})
		stepDur := tr.rt.nowFn().Sub(stepStart).Milliseconds()

		if streamErr != nil {
			if errors.Is(turnCtx.Err(), context.Canceled) {
				if partial := strings.TrimSpace(streamedText.String()); partial != "" {
					partialMsg := &ThreadMessage{
						ThreadID: th.ID,
						SpaceID:  th.SpaceID,
						RunID:    new(run.ID),
						Role:     RoleAssistant,
						Blocks:   []ContentBlock{{Type: BlockText, Text: new(partial)}},
						Metadata: MessageMetadata{ModelName: new(rm.model.ModelID)},
					}
					if aErr := tr.rt.store.Threads().AppendMessage(context.Background(), th.SpaceID, th.UserID, partialMsg); aErr == nil {
						th.MessageCount++
						emit(ThreadStreamEvent{
							Type:     EventMessageCompleted,
							ThreadID: new(th.ID),
							RunID:    new(run.ID),
							Message:  partialMsg,
						})
					}
				}
				now := tr.rt.nowFn()
				run.Status = RunCancelled
				run.EndTime = &now
				run.Metrics.LatencyMS = now.Sub(run.StartTime).Milliseconds()
				run.Metrics.StepCount = stepSeq
				run.Metrics.Tokens = totalUsage
				run.Metrics.EstimatedCostUSD = EstimateCostUSD(totalUsage, rm.model.Profile.Pricing)
				_ = tr.rt.store.Runs().Update(context.Background(), run)

				th.Status = ThreadIdle
				th.State.ActiveRunID = nil
				_ = tr.rt.store.Threads().Update(context.Background(), th)
				emit(ThreadStreamEvent{
					Type:     EventThreadUpdated,
					ThreadID: new(th.ID),
					Thread:   th,
				})
				return nil
			}

			if errors.Is(turnCtx.Err(), context.DeadlineExceeded) || errors.Is(streamErr, context.DeadlineExceeded) {
				if partial := strings.TrimSpace(streamedText.String()); partial != "" {
					partialMsg := &ThreadMessage{
						ThreadID: th.ID,
						SpaceID:  th.SpaceID,
						RunID:    new(run.ID),
						Role:     RoleAssistant,
						Blocks:   []ContentBlock{{Type: BlockText, Text: new(partial)}},
						Metadata: MessageMetadata{ModelName: new(rm.model.ModelID)},
					}
					if aErr := tr.rt.store.Threads().AppendMessage(context.Background(), th.SpaceID, th.UserID, partialMsg); aErr == nil {
						th.MessageCount++
						emit(ThreadStreamEvent{
							Type:     EventMessageCompleted,
							ThreadID: new(th.ID),
							RunID:    new(run.ID),
							Message:  partialMsg,
						})
					}
				}
				timeoutMsg := fmt.Sprintf("turn timed out after %ds — increase Timeout Seconds on the agent for longer runs", timeoutSec)
				stepSeq++
				_ = tr.rt.store.Runs().AppendStep(context.Background(), &RunStep{
					RunID:   run.ID,
					SpaceID: th.SpaceID,
					Seq:     stepSeq,
					Kind:    StepKindLLM,
					Name:    rm.model.ModelID,
					Status:  StepStatusFailed,
					Error:   &ErrorDetail{Code: new(string(CodeExecutionTimedOut)), Message: timeoutMsg},
					Metrics: StepMetrics{DurationMS: stepDur},
				})
				errDetail := &ErrorDetail{Code: new(string(CodeExecutionTimedOut)), Message: timeoutMsg}
				now := tr.rt.nowFn()
				run.Status = RunTimedOut
				run.Error = errDetail
				run.EndTime = &now
				run.Metrics.LatencyMS = now.Sub(run.StartTime).Milliseconds()
				run.Metrics.StepCount = stepSeq
				run.Metrics.Tokens = totalUsage
				run.Metrics.EstimatedCostUSD = EstimateCostUSD(totalUsage, rm.model.Profile.Pricing)
				_ = tr.rt.store.Runs().Update(context.Background(), run)

				th.Status = ThreadIdle
				th.State.ActiveRunID = nil
				_ = tr.rt.store.Threads().Update(context.Background(), th)

				emit(ThreadStreamEvent{
					Type:     EventRunError,
					ThreadID: new(th.ID),
					RunID:    new(run.ID),
					Error:    errDetail,
				})
				emit(ThreadStreamEvent{
					Type:     EventThreadUpdated,
					ThreadID: new(th.ID),
					Thread:   th,
				})
				return errors.E("platform/ai.ThreadRuntime.Stream", errors.Unavailable, CodeExecutionTimedOut, timeoutMsg)
			}

			return tr.failStreamRun(ctx, "platform/ai.ThreadRuntime.Stream", th, run, run.StartTime, emit, streamErr)
		}

		stepUsage := tokenUsageFromAssistant(assistantMsg)
		totalUsage.Add(stepUsage)
		stepSeq++
		finalText = extractAssistantText(assistantMsg)

		assistantBlocks := assistantMessageToBlocks(assistantMsg, boundSet.byName)
		persistedAssistant := &ThreadMessage{
			ThreadID: th.ID,
			SpaceID:  th.SpaceID,
			RunID:    new(run.ID),
			Role:     RoleAssistant,
			Blocks:   assistantBlocks,
			Metadata: MessageMetadata{
				ModelName: new(rm.model.ModelID),
				Tokens:    &stepUsage,
			},
		}
		if err := tr.rt.store.Threads().AppendMessage(ctx, th.SpaceID, th.UserID, persistedAssistant); err != nil {
			return tr.failStreamRun(ctx, "platform/ai.ThreadRuntime.AppendAssistant", th, run, run.StartTime, emit, err)
		}
		th.MessageCount++

		_ = tr.rt.store.Runs().AppendStep(ctx, &RunStep{
			RunID:   run.ID,
			SpaceID: th.SpaceID,
			Seq:     stepSeq,
			Kind:    StepKindLLM,
			Name:    rm.model.ModelID,
			Status:  StepStatusCompleted,
			Output:  map[string]any{"text": finalText, "tool_calls": len(assistantMsg.ToolCalls())},
			Metrics: StepMetrics{Tokens: &stepUsage, DurationMS: stepDur},
		})

		emit(ThreadStreamEvent{
			Type:      EventMessageCompleted,
			ThreadID:  new(th.ID),
			RunID:     new(run.ID),
			MessageID: new(persistedAssistant.ID),
			Message:   persistedAssistant,
		})

		history = append(history, assistantMsg)

		toolCalls := assistantMsg.ToolCalls()
		if len(toolCalls) == 0 {
			endTime := tr.rt.nowFn()
			run.Status = RunCompleted
			run.Output = &RunOutput{Text: new(finalText)}
			run.EndTime = &endTime
			run.Metrics = RunMetrics{
				Tokens:           totalUsage,
				EstimatedCostUSD: EstimateCostUSD(totalUsage, rm.model.Profile.Pricing),
				LatencyMS:        endTime.Sub(run.StartTime).Milliseconds(),
				StepCount:        stepSeq,
			}
			_ = tr.rt.store.Runs().Update(ctx, run)

			th.Status = ThreadIdle
			th.State.ActiveRunID = nil
			_ = tr.rt.store.Threads().Update(ctx, th)

			emit(ThreadStreamEvent{
				Type:     EventRunCompleted,
				ThreadID: new(th.ID),
				RunID:    new(run.ID),
				Run:      run,
			})
			emit(ThreadStreamEvent{
				Type:     EventThreadUpdated,
				ThreadID: new(th.ID),
				Thread:   th,
			})

			if isFirstTurn && th.Title == "New Chat" && strings.TrimSpace(firstTurnPrompt) != "" {
				tr.autoTitleThread(ctx, th, rm, firstTurnPrompt, emit)
			}
			return nil
		}

		var (
			autoResults      []ContentBlock
			autoToolMessages []message.Message
			pendingApprovals []PendingToolApproval
		)

		for _, tc := range toolCalls {
			bt, ok := boundSet.byName[tc.Name]
			if !ok {
				stepSeq++
				errMsg := fmt.Sprintf("unknown tool %q", tc.Name)
				_ = tr.rt.store.Runs().AppendStep(ctx, &RunStep{
					RunID:   run.ID,
					SpaceID: th.SpaceID,
					Seq:     stepSeq,
					Kind:    StepKindTool,
					Name:    tc.Name,
					Status:  StepStatusFailed,
					Input:   tc.Args,
					Error:   &ErrorDetail{Message: errMsg},
				})
				resMap := map[string]any{"error": errMsg}
				autoResults = append(autoResults, ContentBlock{
					Type:       BlockToolResult,
					ToolCallID: new(tc.ID),
					ToolName:   new(tc.Name),
					Result:     resMap,
					IsError:    new(true),
				})
				autoToolMessages = append(autoToolMessages, &message.Tool{
					ToolCallID: tc.ID,
					Name:       tc.Name,
					Content:    message.Content{&message.TextBlock{Text: errMsg}},
					IsError:    true,
				})
				continue
			}

			trustRead := boundSet.serverTrust[bt.MCPServerID]
			isAutoRead := trustRead && bt.ReadOnlyHint
			canAutoRun := policy == ApprovalAuto || isAutoRead

			if !canAutoRun && policy == ApprovalDenyWrites {
				stepSeq++
				denyText := fmt.Sprintf("Tool %q is blocked by approval_policy=deny_writes.", bt.OriginalToolName)
				_ = tr.rt.store.Runs().AppendStep(ctx, &RunStep{
					RunID:       run.ID,
					SpaceID:     th.SpaceID,
					Seq:         stepSeq,
					Kind:        StepKindTool,
					MCPServerID: new(bt.MCPServerID),
					Name:        bt.OriginalToolName,
					Status:      StepStatusRejected,
					Input:       tc.Args,
					Error:       &ErrorDetail{Message: denyText},
				})
				resMap := map[string]any{"declined": true, "message": denyText}
				autoResults = append(autoResults, ContentBlock{
					Type:        BlockToolResult,
					ToolCallID:  new(tc.ID),
					MCPServerID: new(bt.MCPServerID),
					ToolName:    new(bt.OriginalToolName),
					Result:      resMap,
					IsError:     new(true),
				})
				autoToolMessages = append(autoToolMessages, &message.Tool{
					ToolCallID:        tc.ID,
					Name:              tc.Name,
					Content:           message.Content{&message.TextBlock{Text: denyText}},
					StructuredContent: resMap,
					IsError:           true,
				})
				continue
			}

			if !canAutoRun {
				stepSeq++
				_ = tr.rt.store.Runs().AppendStep(ctx, &RunStep{
					RunID:       run.ID,
					SpaceID:     th.SpaceID,
					Seq:         stepSeq,
					Kind:        StepKindTool,
					MCPServerID: new(bt.MCPServerID),
					Name:        bt.OriginalToolName,
					Status:      StepStatusAwaitingApproval,
					Input:       tc.Args,
				})
				pendingApprovals = append(pendingApprovals, PendingToolApproval{
					ToolCallID:      tc.ID,
					MCPServerID:     bt.MCPServerID,
					MCPServerName:   bt.MCPServerName,
					ToolName:        bt.OriginalToolName,
					Arguments:       tc.Args,
					DestructiveHint: bt.DestructiveHint,
				})
				continue
			}

			emit(ThreadStreamEvent{
				Type:        EventToolCallStarted,
				ThreadID:    new(th.ID),
				RunID:       new(run.ID),
				ToolCallID:  new(tc.ID),
				ToolName:    new(bt.OriginalToolName),
				MCPServerID: new(bt.MCPServerID),
				Arguments:   tc.Args,
			})

			toolStart := tr.rt.nowFn()
			resMap, toolContent, isErr := executeBoundTool(turnCtx, bt, tc.Args)
			toolDur := tr.rt.nowFn().Sub(toolStart).Milliseconds()
			stepSeq++

			stepStatus := StepStatusCompleted
			var stepErr *ErrorDetail
			if isErr {
				stepStatus = StepStatusFailed
				if msgStr, ok := resMap["error"].(string); ok {
					stepErr = &ErrorDetail{Message: msgStr}
				}
			}

			_ = tr.rt.store.Runs().AppendStep(ctx, &RunStep{
				RunID:       run.ID,
				SpaceID:     th.SpaceID,
				Seq:         stepSeq,
				Kind:        StepKindTool,
				MCPServerID: new(bt.MCPServerID),
				Name:        bt.OriginalToolName,
				Status:      stepStatus,
				Input:       tc.Args,
				Output:      resMap,
				Error:       stepErr,
				Metrics:     StepMetrics{DurationMS: toolDur},
			})

			emit(ThreadStreamEvent{
				Type:        EventToolCallCompleted,
				ThreadID:    new(th.ID),
				RunID:       new(run.ID),
				ToolCallID:  new(tc.ID),
				ToolName:    new(bt.OriginalToolName),
				MCPServerID: new(bt.MCPServerID),
				Result:      resMap,
				IsError:     new(isErr),
			})

			autoResults = append(autoResults, ContentBlock{
				Type:        BlockToolResult,
				ToolCallID:  new(tc.ID),
				MCPServerID: new(bt.MCPServerID),
				ToolName:    new(bt.OriginalToolName),
				Result:      resMap,
				IsError:     new(isErr),
			})
			autoToolMessages = append(autoToolMessages, &message.Tool{
				ToolCallID:        tc.ID,
				Name:              tc.Name,
				Content:           toolContent,
				StructuredContent: resMap,
				IsError:           isErr,
			})
		}

		if len(autoResults) > 0 {
			toolMsg := &ThreadMessage{
				ThreadID: th.ID,
				SpaceID:  th.SpaceID,
				RunID:    new(run.ID),
				Role:     RoleTool,
				Blocks:   autoResults,
			}
			if err := tr.rt.store.Threads().AppendMessage(ctx, th.SpaceID, th.UserID, toolMsg); err != nil {
				return tr.failStreamRun(ctx, "platform/ai.ThreadRuntime.AppendTool", th, run, run.StartTime, emit, err)
			}
			th.MessageCount++
			emit(ThreadStreamEvent{
				Type:     EventMessageCompleted,
				ThreadID: new(th.ID),
				RunID:    new(run.ID),
				Message:  toolMsg,
			})
			history = append(history, autoToolMessages...)
		}

		if len(pendingApprovals) > 0 {
			run.Status = RunAwaitingApproval
			run.Metrics.StepCount = stepSeq
			run.Metrics.Tokens = totalUsage
			run.Metrics.EstimatedCostUSD = EstimateCostUSD(totalUsage, rm.model.Profile.Pricing)
			_ = tr.rt.store.Runs().Update(ctx, run)

			th.Status = ThreadAwaitingApproval
			th.State.PendingApprovals = pendingApprovals
			th.State.ActiveRunID = new(run.ID)
			if err := tr.rt.store.Threads().Update(ctx, th); err != nil {
				return tr.failStreamRun(ctx, "platform/ai.ThreadRuntime.AwaitApproval", th, run, run.StartTime, emit, err)
			}

			emit(ThreadStreamEvent{
				Type:      EventToolApprovalRequired,
				ThreadID:  new(th.ID),
				RunID:     new(run.ID),
				Approvals: pendingApprovals,
			})
			emit(ThreadStreamEvent{
				Type:     EventThreadUpdated,
				ThreadID: new(th.ID),
				Thread:   th,
			})
			return nil
		}
	}

	return tr.failStreamRun(
		ctx,
		"platform/ai.ThreadRuntime.MaxSteps",
		th,
		run,
		run.StartTime,
		emit,
		errors.E(errors.ResourceExhausted, CodeMaxStepsExceeded, fmt.Sprintf("thread turn reached maximum step limit (%d)", maxSteps)),
	)
}

func (tr *ThreadRuntime) recoverOrRejectBusyThread(ctx context.Context, th *Thread, agent *Agent) error {
	if th.Status != ThreadStreaming {
		return nil
	}
	tr.activeMu.Lock()
	_, active := tr.activeCancels[th.ID]
	tr.activeMu.Unlock()

	if active {
		return errors.E(errors.Conflict, CodeThreadBusy, "thread already has an active streaming turn")
	}

	timeoutSec := agent.Config.Execution.TimeoutSeconds
	if timeoutSec <= 0 {
		timeoutSec = DefaultExecutionTimeoutSeconds
	}
	staleThreshold := time.Duration(timeoutSec+30) * time.Second
	if tr.rt.nowFn().Sub(th.UpdateTime) <= staleThreshold {
		return errors.E(errors.Conflict, CodeThreadBusy, "thread is currently streaming")
	}

	if th.State.ActiveRunID != nil {
		if orphan, err := tr.rt.store.Runs().Get(ctx, th.SpaceID, *th.State.ActiveRunID); err == nil && orphan != nil {
			now := tr.rt.nowFn()
			orphan.Status = RunFailed
			orphan.Error = &ErrorDetail{Code: new(string(CodeRunInterrupted)), Message: "streaming turn interrupted before completion"}
			orphan.EndTime = &now
			_ = tr.rt.store.Runs().Update(ctx, orphan)
		}
	}
	th.Status = ThreadIdle
	th.State.ActiveRunID = nil
	return tr.rt.store.Threads().Update(ctx, th)
}

func (tr *ThreadRuntime) cleanupStaleApprovals(ctx context.Context, th *Thread) error {
	if th.Status != ThreadAwaitingApproval || len(th.State.PendingApprovals) == 0 {
		return nil
	}

	blocks := make([]ContentBlock, 0, len(th.State.PendingApprovals))
	for _, pa := range th.State.PendingApprovals {
		blocks = append(blocks, ContentBlock{
			Type:        BlockToolResult,
			ToolCallID:  new(pa.ToolCallID),
			MCPServerID: new(pa.MCPServerID),
			ToolName:    new(pa.ToolName),
			Result:      map[string]any{"cancelled": true, "message": "Cancelled: user sent a new message"},
			IsError:     new(true),
		})
	}

	cancelMsg := &ThreadMessage{
		ThreadID: th.ID,
		SpaceID:  th.SpaceID,
		RunID:    th.State.ActiveRunID,
		Role:     RoleTool,
		Blocks:   blocks,
	}
	if err := tr.rt.store.Threads().AppendMessage(ctx, th.SpaceID, th.UserID, cancelMsg); err != nil {
		return err
	}
	th.MessageCount++

	if th.State.ActiveRunID != nil {
		if prevRun, err := tr.rt.store.Runs().Get(ctx, th.SpaceID, *th.State.ActiveRunID); err == nil && prevRun != nil {
			now := tr.rt.nowFn()
			prevRun.Status = RunCancelled
			prevRun.EndTime = &now
			_ = tr.rt.store.Runs().Update(ctx, prevRun)
		}
	}

	th.Status = ThreadIdle
	th.State.PendingApprovals = nil
	th.State.ActiveRunID = nil
	return tr.rt.store.Threads().Update(ctx, th)
}

func (tr *ThreadRuntime) buildAndCompactHistory(
	ctx context.Context,
	th *Thread,
	rm *resolvedModel,
	agent *Agent,
	contextHint *string,
	currentUserSeq int32,
	currentUserBlocks []message.Block,
) ([]message.Message, error) {
	allMsgs, err := tr.loadUncompactedThreadMessages(ctx, th)
	if err != nil {
		return nil, err
	}

	var priorMsgs []*ThreadMessage
	for _, m := range allMsgs {
		if m.Seq > th.State.Memory.UpToSeq && m.Seq < currentUserSeq {
			priorMsgs = append(priorMsgs, m)
		}
	}

	if len(priorMsgs) > 0 {
		llmPrior := convertThreadMessagesToLoom(priorMsgs, rm, agent)
		ctxWindow := int(rm.model.Profile.Limits.ContextWindow)
		if ctxWindow <= 0 {
			ctxWindow = 128000
		}

		summarizer, sErr := memory.NewSummarizer(
			loomInvokerFunc(func(sCtx context.Context, sMsgs []message.Message) (*message.Assistant, error) {
				sumRM := tr.resolveSummarizerModel(sCtx, th.SpaceID, rm)
				return tr.rt.invoker.Invoke(sCtx, InvokeRequest{
					Provider:  sumRM.provider,
					ModelName: sumRM.model.ModelID,
					Messages:  sMsgs,
				})
			}),
			memory.SummarizerConfig{
				TokenCounter: llm.ApproximateTokenCounter{},
				ContextLimit: ctxWindow,
				Triggers: []memory.SummarizerTrigger{
					memory.TriggerSummaryOnFraction(0.70),
					memory.TriggerSummaryOnMessageCount(30),
				},
				Keep: memory.KeepMessageCount(10),
			},
		)
		if sErr == nil {
			out, sumErr := summarizer.Summarize(ctx, memory.SummarizeInput{
				CurrentSummary: th.State.Memory.Summary,
				Messages:       llmPrior,
			})
			if sumErr == nil && out.Summary != th.State.Memory.Summary && out.Summary != "" {
				// Determine highest seq compacted out of priorMsgs.
				keptCount := 0
				for _, m := range out.Messages {
					if m.GetMetadata()["loom_src"] == "summarizer" {
						continue
					}
					keptCount++
				}
				compactedCount := max(len(priorMsgs)-keptCount, 0)
				if compactedCount > 0 {
					th.State.Memory.Summary = out.Summary
					th.State.Memory.UpToSeq = priorMsgs[compactedCount-1].Seq
					_ = tr.rt.store.Threads().Update(ctx, th)
				}
			}
		}
	}

	return tr.buildHistoryFromStore(ctx, th, agent, contextHint, currentUserSeq, currentUserBlocks)
}

func (tr *ThreadRuntime) buildHistoryFromStore(
	ctx context.Context,
	th *Thread,
	agent *Agent,
	contextHint *string,
	overrideUserSeq int32,
	overrideUserBlocks []message.Block,
) ([]message.Message, error) {
	allMsgs, err := tr.loadUncompactedThreadMessages(ctx, th)
	if err != nil {
		return nil, err
	}

	var out []message.Message
	var sysParts []string
	if agent.Config.SystemInstruction != nil && strings.TrimSpace(*agent.Config.SystemInstruction) != "" {
		sysParts = append(sysParts, strings.TrimSpace(*agent.Config.SystemInstruction))
	}
	if contextHint != nil && strings.TrimSpace(*contextHint) != "" {
		sysParts = append(sysParts, "Active UI Context: "+strings.TrimSpace(*contextHint))
	}
	if th.State.Memory.Summary != "" {
		sysParts = append(sysParts, "Conversation Summary (earlier turns):\n"+th.State.Memory.Summary)
	}
	if len(sysParts) > 0 {
		out = append(out, message.NewSystemText(strings.Join(sysParts, "\n\n")))
	}

	// Build tool name mapping from agent's MCP servers for history reconstruction.
	serverSlugByID := make(map[string]MCPServer)
	for _, b := range agent.Config.MCPBindings {
		if srv, gErr := tr.rt.store.MCPServers().Get(ctx, th.SpaceID, b.MCPServerID); gErr == nil && srv != nil {
			serverSlugByID[srv.ID] = *srv
		}
	}

	for _, m := range allMsgs {
		if m.Seq <= th.State.Memory.UpToSeq {
			continue
		}
		if overrideUserSeq > 0 && m.Seq == overrideUserSeq && len(overrideUserBlocks) > 0 {
			out = append(out, message.NewUser(overrideUserBlocks...))
			continue
		}
		out = append(out, threadMessageToLoom(m, serverSlugByID)...)
	}
	return out, nil
}

func (tr *ThreadRuntime) loadUncompactedThreadMessages(ctx context.Context, th *Thread) ([]*ThreadMessage, error) {
	var all []*ThreadMessage
	token := ""
	for {
		page, err := tr.rt.store.Threads().ListMessages(ctx, ListMessagesFilter{
			SpaceID:   th.SpaceID,
			UserID:    th.UserID,
			ThreadID:  th.ID,
			PageSize:  200,
			PageToken: token,
		})
		if err != nil {
			return nil, err
		}
		all = append(all, page.Items...)
		if !page.HasMore || page.NextPageToken == "" {
			break
		}
		token = page.NextPageToken
	}
	return all, nil
}

func (tr *ThreadRuntime) resolveSummarizerModel(ctx context.Context, spaceID string, fallback *resolvedModel) *resolvedModel {
	if fallback.settings.Models.FastModelID != nil && *fallback.settings.Models.FastModelID != "" {
		fastRole := ModelRoleFast
		if fastRM, err := tr.rt.resolveModelAndCheckBudget(ctx, spaceID, nil, &fastRole); err == nil {
			return fastRM
		}
	}
	return fallback
}

func (tr *ThreadRuntime) autoTitleThread(ctx context.Context, th *Thread, rm *resolvedModel, prompt string, emit StreamEventEmitter) {
	titleCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()

	titleRM := tr.resolveSummarizerModel(titleCtx, th.SpaceID, rm)
	titlePrompt := "Generate a concise 3 to 6 word title for a chat that starts with the following user message. Return only the title with no quotes or punctuation:\n\n" + truncateRunes(prompt, 400)

	type result struct {
		title string
	}
	ch := make(chan result, 1)
	go func() {
		msg, err := tr.rt.invoker.Invoke(titleCtx, InvokeRequest{
			Provider:  titleRM.provider,
			ModelName: titleRM.model.ModelID,
			Messages:  []message.Message{message.NewUserText(titlePrompt)},
		})
		if err != nil {
			ch <- result{title: fallbackTitle(prompt)}
			return
		}
		title := strings.TrimSpace(strings.Trim(extractAssistantText(msg), `"'`))
		if title == "" {
			title = fallbackTitle(prompt)
		}
		if len(title) > 100 {
			title = title[:100]
		}
		ch <- result{title: title}
	}()

	select {
	case res := <-ch:
		if res.title != "" && res.title != th.Title {
			th.Title = res.title
			if err := tr.rt.store.Threads().Update(ctx, th); err == nil {
				emit(ThreadStreamEvent{
					Type:     EventThreadUpdated,
					ThreadID: new(th.ID),
					Thread:   th,
				})
			}
		}
	case <-titleCtx.Done():
		if title := fallbackTitle(prompt); title != "" && title != th.Title {
			th.Title = title
			if err := tr.rt.store.Threads().Update(ctx, th); err == nil {
				emit(ThreadStreamEvent{
					Type:     EventThreadUpdated,
					ThreadID: new(th.ID),
					Thread:   th,
				})
			}
		}
	}
}

func (tr *ThreadRuntime) failStreamRun(
	ctx context.Context,
	op errors.Op,
	th *Thread,
	run *Run,
	startTime time.Time,
	emit StreamEventEmitter,
	err error,
) error {
	var codePtr *string
	if code := errors.CodeOf(err); code != "" {
		codePtr = new(string(code))
	}
	errDetail := &ErrorDetail{Code: codePtr, Message: err.Error()}
	endTime := tr.rt.nowFn()
	run.Status = RunFailed
	run.Error = errDetail
	run.EndTime = &endTime
	run.Metrics.LatencyMS = endTime.Sub(startTime).Milliseconds()
	_ = tr.rt.store.Runs().Update(ctx, run)

	th.Status = ThreadIdle
	th.State.ActiveRunID = nil
	_ = tr.rt.store.Threads().Update(ctx, th)

	emit(ThreadStreamEvent{
		Type:     EventRunError,
		ThreadID: new(th.ID),
		RunID:    new(run.ID),
		Error:    errDetail,
	})
	emit(ThreadStreamEvent{
		Type:     EventThreadUpdated,
		ThreadID: new(th.ID),
		Thread:   th,
	})
	return errors.E(op, err)
}

func (tr *ThreadRuntime) registerCancel(threadID string, cancel context.CancelFunc) {
	tr.activeMu.Lock()
	defer tr.activeMu.Unlock()
	tr.activeCancels[threadID] = cancel
}

func (tr *ThreadRuntime) unregisterCancel(threadID string) {
	tr.activeMu.Lock()
	defer tr.activeMu.Unlock()
	delete(tr.activeCancels, threadID)
}

func assistantMessageToBlocks(msg *message.Assistant, boundTools map[string]*BoundMCPTool) []ContentBlock {
	if msg == nil {
		return []ContentBlock{}
	}
	blocks := make([]ContentBlock, 0, len(msg.Content))
	for _, b := range msg.Content {
		switch v := b.(type) {
		case *message.ThinkingBlock:
			if strings.TrimSpace(v.Thinking) != "" {
				blocks = append(blocks, ContentBlock{Type: BlockThinking, Text: new(strings.TrimSpace(v.Thinking))})
			}
		case *message.TextBlock:
			if strings.TrimSpace(v.Text) != "" {
				blocks = append(blocks, ContentBlock{Type: BlockText, Text: new(strings.TrimSpace(v.Text))})
			}
		case *message.ToolCall:
			cb := ContentBlock{
				Type:       BlockToolCall,
				ToolCallID: new(v.ID),
				ToolName:   new(v.Name),
				Arguments:  v.Args,
			}
			if bt, ok := boundTools[v.Name]; ok {
				cb.MCPServerID = new(bt.MCPServerID)
				cb.ToolName = new(bt.OriginalToolName)
			}
			blocks = append(blocks, cb)
		}
	}
	return blocks
}

func convertThreadMessagesToLoom(msgs []*ThreadMessage, _ *resolvedModel, _ *Agent) message.MessageList {
	var out message.MessageList
	for _, m := range msgs {
		out = append(out, threadMessageToLoom(m, nil)...)
	}
	return out
}

func threadMessageToLoom(m *ThreadMessage, serverByID map[string]MCPServer) []message.Message {
	switch m.Role {
	case RoleUser:
		var blocks []message.Block
		for _, b := range m.Blocks {
			switch b.Type {
			case BlockText:
				if b.Text != nil {
					blocks = append(blocks, &message.TextBlock{Text: *b.Text})
				}
			case BlockAttachment:
				if b.Attachment != nil {
					txt := fmt.Sprintf("[Attachment: %s (%s, %d bytes)]", b.Attachment.Filename, b.Attachment.ContentType, b.Attachment.SizeBytes)
					if b.Attachment.ExtractedText != nil && *b.Attachment.ExtractedText != "" {
						txt += "\n" + *b.Attachment.ExtractedText
					}
					blocks = append(blocks, &message.TextBlock{Text: txt})
				}
			}
		}
		if len(blocks) == 0 {
			return nil
		}
		return []message.Message{message.NewUser(blocks...)}

	case RoleAssistant:
		var blocks message.Content
		for _, b := range m.Blocks {
			switch b.Type {
			case BlockThinking:
				if b.Text != nil {
					blocks = append(blocks, &message.ThinkingBlock{Thinking: *b.Text})
				}
			case BlockText:
				if b.Text != nil {
					blocks = append(blocks, &message.TextBlock{Text: *b.Text})
				}
			case BlockToolCall:
				if b.ToolCallID != nil && b.ToolName != nil {
					wireName := resolveWireToolName(b.MCPServerID, *b.ToolName, serverByID)
					blocks = append(blocks, &message.ToolCall{
						ID:   *b.ToolCallID,
						Name: wireName,
						Args: b.Arguments,
					})
				}
			}
		}
		if len(blocks) == 0 {
			return nil
		}
		return []message.Message{&message.Assistant{Content: blocks}}

	case RoleTool:
		var msgs []message.Message
		for _, b := range m.Blocks {
			if b.Type != BlockToolResult || b.ToolCallID == nil || b.ToolName == nil {
				continue
			}
			wireName := resolveWireToolName(b.MCPServerID, *b.ToolName, serverByID)
			isErr := b.IsError != nil && *b.IsError
			text := ""
			if len(b.Result) > 0 {
				if msg, ok := b.Result["message"].(string); ok && msg != "" {
					text = msg
				}
			}
			var content message.Content
			if text != "" {
				content = message.Content{&message.TextBlock{Text: text}}
			}
			msgs = append(msgs, &message.Tool{
				ToolCallID:        *b.ToolCallID,
				Name:              wireName,
				Content:           content,
				StructuredContent: b.Result,
				IsError:           isErr,
			})
		}
		return msgs

	default:
		return nil
	}
}

func resolveWireToolName(mcpServerID *string, toolName string, serverByID map[string]MCPServer) string {
	if mcpServerID != nil && len(serverByID) > 0 {
		if srv, ok := serverByID[*mcpServerID]; ok && srv.Transport == TransportHTTP {
			return NamespaceMCPToolName(srv.Slug, toolName)
		}
	}
	return toolName
}

func findPendingBoundTool(boundSet *connectedToolSet, pa PendingToolApproval) *BoundMCPTool {
	for _, bt := range boundSet.byName {
		if bt.MCPServerID == pa.MCPServerID && bt.OriginalToolName == pa.ToolName {
			return bt
		}
	}
	return nil
}

func fallbackTitle(prompt string) string {
	words := strings.Fields(strings.TrimSpace(prompt))
	if len(words) == 0 {
		return "New Chat"
	}
	if len(words) > 6 {
		words = words[:6]
	}
	title := strings.Join(words, " ")
	if len(title) > 80 {
		title = title[:80]
	}
	return title
}

type loomInvokerFunc func(ctx context.Context, messages []message.Message) (*message.Assistant, error)

func (f loomInvokerFunc) Invoke(ctx context.Context, messages []message.Message) (*message.Assistant, error) {
	return f(ctx, messages)
}

var _ llm.Invoker = (loomInvokerFunc)(nil)
var _ = paging.Cursor{}
