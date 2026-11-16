package ai

import (
	"context"
	"encoding/json/v2"
	"fmt"
	"strings"
	"time"

	"github.com/google/jsonschema-go/jsonschema"
	"github.com/masterkeysrd/loom/message"
	"github.com/masterkeysrd/loom/tool"
	"github.com/masterkeysrd/saturn/internal/domain/space"
	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/pdf"
	"github.com/masterkeysrd/saturn/internal/platform/settings"
)

const (
	maxAttachmentsPerTurn = 5
	maxAttachmentBytes    = 10 * 1024 * 1024 // 10 MB
	maxExtractedTextRunes = 32000
)

// SettingsReader reads workspace AI settings (`platform.ai`).
// @Mock
type SettingsReader interface {
	GetOrDefault(ctx context.Context, scopeID string, fallback Settings) (*settings.Entry[Settings], error)
}

// RuntimeDependencies groups collaborators needed by the AI Runtime and ThreadRuntime.
type RuntimeDependencies struct {
	Store    Store
	Invoker  ModelInvoker
	MCP      MCPConnector
	Settings SettingsReader
	NowFunc  func() time.Time
}

// Runtime executes headless single-turn generations and multi-step MCP-backed agent runs.
type Runtime struct {
	store    Store
	invoker  ModelInvoker
	mcp      MCPConnector
	settings SettingsReader
	nowFn    func() time.Time
}

// NewRuntime constructs a new headless AI Runtime.
func NewRuntime(deps RuntimeDependencies) *Runtime {
	nowFn := deps.NowFunc
	if nowFn == nil {
		nowFn = func() time.Time { return time.Now().UTC() }
	}
	return &Runtime{
		store:    deps.Store,
		invoker:  deps.Invoker,
		mcp:      deps.MCP,
		settings: deps.Settings,
		nowFn:    nowFn,
	}
}

// GenerateRequest configures a single-turn headless generation call.
type GenerateRequest struct {
	SpaceID           string
	Source            RunSource
	Prompt            string
	SystemInstruction *string
	ModelID           *string
	Role              *ModelRole
	Generation        *GenerationConfig
	OutputSchema      map[string]any
	Attachments       []TurnAttachment
	FlowRunID         *string
}

// RunAgentRequest configures a headless multi-step MCP-enabled agent execution.
type RunAgentRequest struct {
	SpaceID      string
	AgentID      string
	Source       RunSource
	Prompt       string
	Input        map[string]any
	ModelID      *string
	Generation   *GenerationConfig
	OutputSchema map[string]any
	FlowRunID    *string
}

type resolvedModel struct {
	provider *Provider
	model    *Model
	settings Settings
}

// Generate executes a blocking single-turn prompt with optional attachments and structured output schema.
func (r *Runtime) Generate(ctx context.Context, req GenerateRequest) (*Run, error) {
	const op errors.Op = "platform/ai.Runtime.Generate"

	if strings.TrimSpace(req.SpaceID) == "" {
		return nil, errors.E(op, errors.Invalid, "space_id is required")
	}
	if strings.TrimSpace(req.Prompt) == "" && len(req.Attachments) == 0 {
		return nil, errors.E(op, errors.Invalid, "prompt or attachments required")
	}

	source := req.Source
	if source == "" {
		source = RunSourceAPI
	}

	rm, err := r.resolveModelAndCheckBudget(ctx, req.SpaceID, req.ModelID, req.Role)
	if err != nil {
		return nil, errors.E(op, err)
	}

	var schema *jsonschema.Schema
	if len(req.OutputSchema) > 0 {
		schema, err = parseJSONSchemaMap(req.OutputSchema)
		if err != nil {
			return nil, errors.E(op, errors.Invalid, fmt.Errorf("invalid output_schema: %w", err))
		}
	}

	_, userBlocks, err := prepareTurnAttachments(req.Prompt, req.Attachments, rm.model.Profile.Capabilities)
	if err != nil {
		return nil, errors.E(op, err)
	}

	var msgs []message.Message
	if req.SystemInstruction != nil && strings.TrimSpace(*req.SystemInstruction) != "" {
		msgs = append(msgs, message.NewSystemText(strings.TrimSpace(*req.SystemInstruction)))
	}
	msgs = append(msgs, message.NewUser(userBlocks...))

	genCfg := mergeGenerationConfig(rm.model.Config, req.Generation)

	startTime := r.nowFn()
	run := &Run{
		SpaceID:    req.SpaceID,
		Kind:       RunKindGenerate,
		Source:     source,
		ProviderID: new(rm.provider.ID),
		ModelID:    new(rm.model.ID),
		FlowRunID:  req.FlowRunID,
		Status:     RunRunning,
		Input: RunInput{
			Prompt:            req.Prompt,
			SystemInstruction: req.SystemInstruction,
			ModelSnapshot: &ModelSnapshot{
				Driver:    string(rm.provider.Driver),
				ModelName: rm.model.ModelID,
			},
		},
		StartTime: startTime,
	}
	if err := r.store.Runs().Create(ctx, run); err != nil {
		return nil, errors.E(op, err)
	}

	stepStart := r.nowFn()
	assistantMsg, invErr := r.invoker.Invoke(ctx, InvokeRequest{
		Provider:       rm.provider,
		ModelName:      rm.model.ModelID,
		Messages:       msgs,
		Generation:     genCfg,
		ResponseSchema: schema,
	})
	stepDur := r.nowFn().Sub(stepStart).Milliseconds()

	if invErr != nil {
		errDetail := &ErrorDetail{Message: invErr.Error()}
		_ = r.store.Runs().AppendStep(ctx, &RunStep{
			RunID:   run.ID,
			SpaceID: req.SpaceID,
			Seq:     1,
			Kind:    StepKindLLM,
			Name:    rm.model.ModelID,
			Status:  StepStatusFailed,
			Input:   map[string]any{"prompt": req.Prompt},
			Error:   errDetail,
			Metrics: StepMetrics{DurationMS: stepDur},
		})
		endTime := r.nowFn()
		run.Status = RunFailed
		run.Error = errDetail
		run.EndTime = &endTime
		run.Metrics.LatencyMS = endTime.Sub(startTime).Milliseconds()
		run.Metrics.StepCount = 1
		_ = r.store.Runs().Update(ctx, run)
		return run, errors.E(op, invErr)
	}

	usage := tokenUsageFromAssistant(assistantMsg)
	text := extractAssistantText(assistantMsg)
	stepOutput := map[string]any{"text": text}
	runOut := &RunOutput{Text: new(text)}

	if schema != nil {
		var parsed map[string]any
		if uErr := json.Unmarshal([]byte(extractJSONText(text)), &parsed); uErr != nil {
			errDetail := &ErrorDetail{Message: fmt.Sprintf("structured output parse failed: %v", uErr)}
			endTime := r.nowFn()
			run.Status = RunFailed
			run.Error = errDetail
			run.EndTime = &endTime
			run.Metrics = RunMetrics{
				Tokens:           usage,
				EstimatedCostUSD: EstimateCostUSD(usage, rm.model.Profile.Pricing),
				LatencyMS:        endTime.Sub(startTime).Milliseconds(),
				StepCount:        1,
			}
			_ = r.store.Runs().Update(ctx, run)
			return run, errors.E(op, errors.Internal, errDetail.Message)
		}
		runOut.Data = parsed
		stepOutput["data"] = parsed
	}

	_ = r.store.Runs().AppendStep(ctx, &RunStep{
		RunID:   run.ID,
		SpaceID: req.SpaceID,
		Seq:     1,
		Kind:    StepKindLLM,
		Name:    rm.model.ModelID,
		Status:  StepStatusCompleted,
		Input:   map[string]any{"prompt": req.Prompt},
		Output:  stepOutput,
		Metrics: StepMetrics{Tokens: &usage, DurationMS: stepDur},
	})

	endTime := r.nowFn()
	run.Status = RunCompleted
	run.Output = runOut
	run.EndTime = &endTime
	run.Metrics = RunMetrics{
		Tokens:           usage,
		EstimatedCostUSD: EstimateCostUSD(usage, rm.model.Profile.Pricing),
		LatencyMS:        endTime.Sub(startTime).Milliseconds(),
		StepCount:        1,
	}
	if err := r.store.Runs().Update(ctx, run); err != nil {
		return nil, errors.E(op, err)
	}
	return run, nil
}

// RunAgent executes an agent headlessly in a bounded ReAct loop across bound MCP servers.
func (r *Runtime) RunAgent(ctx context.Context, req RunAgentRequest) (*Run, error) {
	const op errors.Op = "platform/ai.Runtime.RunAgent"

	if strings.TrimSpace(req.SpaceID) == "" || strings.TrimSpace(req.AgentID) == "" {
		return nil, errors.E(op, errors.Invalid, "space_id and agent_id are required")
	}

	agent, err := r.store.Agents().Get(ctx, req.SpaceID, req.AgentID)
	if err != nil {
		return nil, errors.E(op, err)
	}
	if !agent.IsEnabled {
		return nil, errors.E(op, errors.Precondition, CodeAgentDisabled, "agent is disabled")
	}

	modelIDPtr := agent.ModelID
	if req.ModelID != nil && strings.TrimSpace(*req.ModelID) != "" {
		modelIDPtr = req.ModelID
	}

	rm, err := r.resolveModelAndCheckBudget(ctx, req.SpaceID, modelIDPtr, nil)
	if err != nil {
		return nil, errors.E(op, err)
	}

	effectiveSchemaMap := agent.Config.OutputSchema
	if len(req.OutputSchema) > 0 {
		effectiveSchemaMap = req.OutputSchema
	}
	var outputSchema *jsonschema.Schema
	if len(effectiveSchemaMap) > 0 {
		outputSchema, err = parseJSONSchemaMap(effectiveSchemaMap)
		if err != nil {
			return nil, errors.E(op, errors.Invalid, fmt.Errorf("invalid output_schema: %w", err))
		}
	}

	source := req.Source
	if source == "" {
		source = RunSourceAPI
	}

	promptText := buildAgentPrompt(req.Prompt, req.Input)
	startTime := r.nowFn()
	run := &Run{
		SpaceID:    req.SpaceID,
		Kind:       RunKindAgentRun,
		Source:     source,
		AgentID:    new(agent.ID),
		ProviderID: new(rm.provider.ID),
		ModelID:    new(rm.model.ID),
		FlowRunID:  req.FlowRunID,
		Status:     RunRunning,
		Input: RunInput{
			Prompt:            promptText,
			SystemInstruction: agent.Config.SystemInstruction,
			ModelSnapshot: &ModelSnapshot{
				Driver:    string(rm.provider.Driver),
				ModelName: rm.model.ModelID,
			},
		},
		StartTime: startTime,
	}
	if err := r.store.Runs().Create(ctx, run); err != nil {
		return nil, errors.E(op, err)
	}

	timeoutSec := agent.Config.Execution.TimeoutSeconds
	if timeoutSec <= 0 {
		timeoutSec = DefaultExecutionTimeoutSeconds
	}
	execCtx, cancel := context.WithTimeout(ensureSpaceContext(ctx, req.SpaceID), time.Duration(timeoutSec)*time.Second)
	defer cancel()

	boundSet, err := r.connectAgentTools(execCtx, req.SpaceID, agent.Config.MCPBindings)
	if err != nil {
		return r.failRun(ctx, op, run, startTime, err)
	}
	defer boundSet.closeAll()

	var messages []message.Message
	if agent.Config.SystemInstruction != nil && strings.TrimSpace(*agent.Config.SystemInstruction) != "" {
		messages = append(messages, message.NewSystemText(strings.TrimSpace(*agent.Config.SystemInstruction)))
	}
	messages = append(messages, message.NewUserText(promptText))

	genCfg := mergeGenerationConfig(rm.model.Config, &agent.Config.Generation)
	genCfg = mergeGenerationConfig(genCfg, req.Generation)

	maxSteps := int(agent.Config.Execution.MaxSteps)
	if maxSteps <= 0 {
		maxSteps = 10
	}

	var (
		totalUsage TokenUsage
		stepSeq    int32
		finalText  string
	)

	for range maxSteps {
		stepStart := r.nowFn()
		var reqSchema *jsonschema.Schema
		if len(boundSet.loomTools) == 0 && outputSchema != nil {
			reqSchema = outputSchema
		}

		assistantMsg, invErr := r.invoker.Invoke(execCtx, InvokeRequest{
			Provider:       rm.provider,
			ModelName:      rm.model.ModelID,
			Messages:       messages,
			Tools:          boundSet.loomTools,
			Generation:     genCfg,
			ResponseSchema: reqSchema,
		})
		stepDur := r.nowFn().Sub(stepStart).Milliseconds()

		if invErr != nil {
			stepSeq++
			_ = r.store.Runs().AppendStep(ctx, &RunStep{
				RunID:   run.ID,
				SpaceID: req.SpaceID,
				Seq:     stepSeq,
				Kind:    StepKindLLM,
				Name:    rm.model.ModelID,
				Status:  StepStatusFailed,
				Error:   &ErrorDetail{Message: invErr.Error()},
				Metrics: StepMetrics{DurationMS: stepDur},
			})
			run.Metrics.StepCount = stepSeq
			run.Metrics.Tokens = totalUsage
			run.Metrics.EstimatedCostUSD = EstimateCostUSD(totalUsage, rm.model.Profile.Pricing)
			if errors.Is(execCtx.Err(), context.DeadlineExceeded) {
				return r.terminateRun(ctx, op, run, startTime, RunTimedOut, nil, "agent execution timed out", execCtx.Err())
			}
			return r.failRun(ctx, op, run, startTime, invErr)
		}

		stepUsage := tokenUsageFromAssistant(assistantMsg)
		totalUsage.Add(stepUsage)
		stepSeq++
		finalText = extractAssistantText(assistantMsg)

		_ = r.store.Runs().AppendStep(ctx, &RunStep{
			RunID:   run.ID,
			SpaceID: req.SpaceID,
			Seq:     stepSeq,
			Kind:    StepKindLLM,
			Name:    rm.model.ModelID,
			Status:  StepStatusCompleted,
			Output:  map[string]any{"text": finalText, "tool_calls": len(assistantMsg.ToolCalls())},
			Metrics: StepMetrics{Tokens: &stepUsage, DurationMS: stepDur},
		})
		messages = append(messages, assistantMsg)

		toolCalls := assistantMsg.ToolCalls()
		if len(toolCalls) == 0 {
			runOut := &RunOutput{Text: new(finalText)}
			if outputSchema != nil {
				var parsed map[string]any
				uErr := json.Unmarshal([]byte(extractJSONText(finalText)), &parsed)
				if uErr != nil && len(boundSet.loomTools) > 0 {
					// Perform a dedicated schema-enforced finalization turn without tools.
					finalStart := r.nowFn()
					messages = append(messages, message.NewUserText("Return the final response strictly conforming to the required JSON schema."))
					finalMsg, fErr := r.invoker.Invoke(execCtx, InvokeRequest{
						Provider:       rm.provider,
						ModelName:      rm.model.ModelID,
						Messages:       messages,
						Generation:     genCfg,
						ResponseSchema: outputSchema,
					})
					if fErr != nil {
						return r.failRun(ctx, op, run, startTime, fErr)
					}
					fUsage := tokenUsageFromAssistant(finalMsg)
					totalUsage.Add(fUsage)
					stepSeq++
					finalText = extractAssistantText(finalMsg)
					_ = r.store.Runs().AppendStep(ctx, &RunStep{
						RunID:   run.ID,
						SpaceID: req.SpaceID,
						Seq:     stepSeq,
						Kind:    StepKindLLM,
						Name:    rm.model.ModelID,
						Status:  StepStatusCompleted,
						Output:  map[string]any{"text": finalText},
						Metrics: StepMetrics{Tokens: &fUsage, DurationMS: r.nowFn().Sub(finalStart).Milliseconds()},
					})
					runOut.Text = new(finalText)
					uErr = json.Unmarshal([]byte(extractJSONText(finalText)), &parsed)
				}
				if uErr != nil {
					return r.failRun(ctx, op, run, startTime, fmt.Errorf("agent structured output parse failed: %w", uErr))
				}
				runOut.Data = parsed
			}

			endTime := r.nowFn()
			run.Status = RunCompleted
			run.Output = runOut
			run.EndTime = &endTime
			run.Metrics = RunMetrics{
				Tokens:           totalUsage,
				EstimatedCostUSD: EstimateCostUSD(totalUsage, rm.model.Profile.Pricing),
				LatencyMS:        endTime.Sub(startTime).Milliseconds(),
				StepCount:        stepSeq,
			}
			if err := r.store.Runs().Update(ctx, run); err != nil {
				return nil, errors.E(op, err)
			}
			return run, nil
		}

		for _, tc := range toolCalls {
			bt, ok := boundSet.byName[tc.Name]
			if !ok {
				stepSeq++
				errMsg := fmt.Sprintf("unknown tool %q", tc.Name)
				_ = r.store.Runs().AppendStep(ctx, &RunStep{
					RunID:   run.ID,
					SpaceID: req.SpaceID,
					Seq:     stepSeq,
					Kind:    StepKindTool,
					Name:    tc.Name,
					Status:  StepStatusFailed,
					Input:   tc.Args,
					Error:   &ErrorDetail{Message: errMsg},
				})
				messages = append(messages, &message.Tool{
					ToolCallID: tc.ID,
					Name:       tc.Name,
					Content:    message.Content{&message.TextBlock{Text: errMsg}},
					IsError:    true,
				})
				continue
			}

			if agent.Config.Execution.ApprovalPolicy == ApprovalDenyWrites && !bt.ReadOnlyHint {
				stepSeq++
				denyMsg := fmt.Sprintf("Tool %q is blocked by agent approval_policy=deny_writes.", bt.OriginalToolName)
				_ = r.store.Runs().AppendStep(ctx, &RunStep{
					RunID:       run.ID,
					SpaceID:     req.SpaceID,
					Seq:         stepSeq,
					Kind:        StepKindTool,
					MCPServerID: new(bt.MCPServerID),
					Name:        bt.OriginalToolName,
					Status:      StepStatusRejected,
					Input:       tc.Args,
					Error:       &ErrorDetail{Message: denyMsg},
				})
				messages = append(messages, &message.Tool{
					ToolCallID: tc.ID,
					Name:       tc.Name,
					Content:    message.Content{&message.TextBlock{Text: denyMsg}},
					IsError:    true,
				})
				continue
			}

			toolStart := r.nowFn()
			resMap, toolContent, isToolErr := executeBoundTool(execCtx, bt, tc.Args)
			toolDur := r.nowFn().Sub(toolStart).Milliseconds()
			stepSeq++

			stepStatus := StepStatusCompleted
			var stepErr *ErrorDetail
			if isToolErr {
				stepStatus = StepStatusFailed
				if msgStr, ok := resMap["error"].(string); ok {
					stepErr = &ErrorDetail{Message: msgStr}
				}
			}

			_ = r.store.Runs().AppendStep(ctx, &RunStep{
				RunID:       run.ID,
				SpaceID:     req.SpaceID,
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

			messages = append(messages, &message.Tool{
				ToolCallID:        tc.ID,
				Name:              tc.Name,
				Content:           toolContent,
				StructuredContent: resMap,
				IsError:           isToolErr,
			})
		}
	}

	run.Metrics.StepCount = stepSeq
	run.Metrics.Tokens = totalUsage
	run.Metrics.EstimatedCostUSD = EstimateCostUSD(totalUsage, rm.model.Profile.Pricing)
	return r.terminateRun(
		ctx,
		op,
		run,
		startTime,
		RunMaxStepsExceeded,
		new(string(CodeMaxStepsExceeded)),
		fmt.Sprintf("agent reached maximum step limit (%d)", maxSteps),
		errors.E(op, errors.ResourceExhausted, CodeMaxStepsExceeded, fmt.Sprintf("agent reached maximum step limit (%d)", maxSteps)),
	)
}

func (r *Runtime) resolveModelAndCheckBudget(
	ctx context.Context,
	spaceID string,
	modelID *string,
	role *ModelRole,
) (*resolvedModel, error) {
	aiSettings := DefaultSettings()
	if r.settings != nil {
		entry, err := r.settings.GetOrDefault(ctx, spaceID, aiSettings)
		if err != nil {
			return nil, err
		}
		if entry != nil {
			aiSettings = entry.Value
		}
	}

	if aiSettings.Governance.MonthlyBudgetUSD != nil && *aiSettings.Governance.MonthlyBudgetUSD > 0 {
		now := r.nowFn().UTC()
		monthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
		spend, err := r.store.Runs().GetMonthlySpendUSD(ctx, spaceID, monthStart)
		if err != nil {
			return nil, err
		}
		if spend >= *aiSettings.Governance.MonthlyBudgetUSD {
			return nil, ErrMonthlyBudgetExceeded
		}
	}

	targetModelID := ""
	if modelID != nil {
		targetModelID = strings.TrimSpace(*modelID)
	}
	if targetModelID == "" && role != nil {
		switch *role {
		case ModelRoleFast:
			if aiSettings.Models.FastModelID != nil {
				targetModelID = *aiSettings.Models.FastModelID
			}
		case ModelRoleReasoning:
			if aiSettings.Models.ReasoningModelID != nil {
				targetModelID = *aiSettings.Models.ReasoningModelID
			}
		}
	}
	if targetModelID == "" && aiSettings.Models.DefaultModelID != nil {
		targetModelID = strings.TrimSpace(*aiSettings.Models.DefaultModelID)
	}
	if targetModelID == "" {
		return nil, ErrModelNotConfigured
	}

	model, err := r.store.Models().Get(ctx, spaceID, targetModelID)
	if err != nil {
		return nil, err
	}
	if !model.IsEnabled {
		return nil, errors.E(errors.Precondition, CodeModelDisabled, "selected AI model is disabled")
	}

	prov, err := r.store.Providers().Get(ctx, spaceID, model.ProviderID)
	if err != nil {
		return nil, err
	}
	if !prov.IsEnabled {
		return nil, errors.E(errors.Precondition, CodeProviderDisabled, "AI provider is disabled")
	}

	return &resolvedModel{
		provider: prov,
		model:    model,
		settings: aiSettings,
	}, nil
}

type connectedToolSet struct {
	loomTools   []*tool.Tool
	byName      map[string]*BoundMCPTool
	serverTrust map[string]bool
	closers     []func()
}

func (s *connectedToolSet) closeAll() {
	for _, fn := range s.closers {
		if fn != nil {
			fn()
		}
	}
}

func (r *Runtime) connectAgentTools(ctx context.Context, spaceID string, bindings []MCPBinding) (*connectedToolSet, error) {
	set := &connectedToolSet{
		byName:      make(map[string]*BoundMCPTool),
		serverTrust: make(map[string]bool),
	}

	for _, b := range bindings {
		if len(b.AllowedTools) == 0 {
			continue
		}
		srv, err := r.store.MCPServers().Get(ctx, spaceID, b.MCPServerID)
		if err != nil {
			set.closeAll()
			return nil, err
		}
		if !srv.IsEnabled {
			continue
		}
		set.serverTrust[srv.ID] = srv.Config.TrustReadHints

		conn, err := r.mcp.ConnectTools(ctx, srv, b.AllowedTools)
		if err != nil {
			set.closeAll()
			return nil, err
		}
		if conn.Close != nil {
			set.closers = append(set.closers, conn.Close)
		}
		for _, bt := range conn.Tools {
			name := bt.Tool.Definition.Name
			if _, dup := set.byName[name]; dup {
				continue
			}
			set.byName[name] = bt
			set.loomTools = append(set.loomTools, bt.Tool)
		}
	}

	return set, nil
}

func executeBoundTool(ctx context.Context, bt *BoundMCPTool, args map[string]any) (map[string]any, message.Content, bool) {
	if args == nil {
		args = map[string]any{}
	}
	stream, err := bt.Tool.Handler(ctx, &message.ToolCall{
		Name: bt.Tool.Definition.Name,
		Args: args,
	})
	if err != nil {
		msg := err.Error()
		return map[string]any{"error": msg}, message.Content{&message.TextBlock{Text: msg}}, true
	}

	var (
		finalChunk message.ToolChunk
		streamErr  error
	)
	for chunk, cErr := range stream {
		if cErr != nil {
			streamErr = cErr
			break
		}
		finalChunk = chunk
	}
	if streamErr != nil {
		msg := streamErr.Error()
		return map[string]any{"error": msg}, message.Content{&message.TextBlock{Text: msg}}, true
	}

	resMap := normalizeStructuredResult(finalChunk.StructuredContent, finalChunk.Content)
	content := finalChunk.Content
	if len(content) == 0 && len(resMap) > 0 {
		if raw, mErr := json.Marshal(resMap); mErr == nil {
			content = message.Content{&message.TextBlock{Text: string(raw)}}
		}
	}
	if finalChunk.IsError && len(content) == 0 {
		content = message.Content{&message.TextBlock{Text: "tool execution failed"}}
	}
	return resMap, content, finalChunk.IsError
}

func normalizeStructuredResult(structured any, content message.Content) map[string]any {
	if m, ok := structured.(map[string]any); ok && m != nil {
		return m
	}
	if structured != nil {
		if raw, err := json.Marshal(structured); err == nil {
			var m map[string]any
			if uErr := json.Unmarshal(raw, &m); uErr == nil && m != nil {
				return m
			}
			return map[string]any{"value": structured}
		}
	}
	var texts []string
	for _, b := range content {
		if tb, ok := b.(*message.TextBlock); ok && tb.Text != "" {
			texts = append(texts, tb.Text)
		}
	}
	if len(texts) > 0 {
		joined := strings.Join(texts, "\n")
		var parsed map[string]any
		if json.Unmarshal([]byte(joined), &parsed) == nil && parsed != nil {
			return parsed
		}
		return map[string]any{"text": joined}
	}
	return map[string]any{}
}

func (r *Runtime) failRun(ctx context.Context, op errors.Op, run *Run, startTime time.Time, err error) (*Run, error) {
	var codePtr *string
	if code := errors.CodeOf(err); code != "" {
		codePtr = new(string(code))
	}
	return r.terminateRun(ctx, op, run, startTime, RunFailed, codePtr, err.Error(), err)
}

func (r *Runtime) terminateRun(
	ctx context.Context,
	op errors.Op,
	run *Run,
	startTime time.Time,
	status RunStatus,
	code *string,
	msg string,
	retErr error,
) (*Run, error) {
	endTime := r.nowFn()
	run.Status = status
	run.Error = &ErrorDetail{Code: code, Message: msg}
	run.EndTime = &endTime
	run.Metrics.LatencyMS = endTime.Sub(startTime).Milliseconds()
	_ = r.store.Runs().Update(ctx, run)
	return run, errors.E(op, retErr)
}

func prepareTurnAttachments(prompt string, attachments []TurnAttachment, caps ModelCapabilities) ([]AttachmentSummary, []message.Block, error) {
	if len(attachments) > maxAttachmentsPerTurn {
		return nil, nil, errors.E(errors.Invalid, CodeInvalidAttachment, fmt.Sprintf("at most %d attachments allowed per turn", maxAttachmentsPerTurn))
	}

	var blocks []message.Block
	if strings.TrimSpace(prompt) != "" {
		blocks = append(blocks, &message.TextBlock{Text: prompt})
	}

	summaries := make([]AttachmentSummary, 0, len(attachments))
	for _, att := range attachments {
		if len(att.Data) > maxAttachmentBytes {
			return nil, nil, errors.E(errors.Invalid, CodeInvalidAttachment, fmt.Sprintf("attachment %q exceeds 10 MB limit", att.Filename))
		}
		mime := strings.ToLower(strings.TrimSpace(att.ContentType))
		summary := AttachmentSummary{
			Filename:    att.Filename,
			ContentType: mime,
			SizeBytes:   int64(len(att.Data)),
		}

		switch mime {
		case "image/png", "image/jpeg", "image/webp":
			if caps.Vision {
				blocks = append(blocks, message.NewUserImage(att.Data, mime).Content...)
			} else {
				blocks = append(blocks, &message.TextBlock{Text: fmt.Sprintf("[Image attachment: %s (%s, %d bytes)]", att.Filename, mime, len(att.Data))})
			}
		case "application/pdf":
			extracted, err := pdf.ExtractText(att.Data)
			if err == nil {
				extracted = truncateRunes(extracted, maxExtractedTextRunes)
				summary.ExtractedText = new(extracted)
			}
			if caps.Document {
				blocks = append(blocks, &message.DocumentBlock{
					Data:     att.Data,
					MIMEType: mime,
					Extras:   map[string]any{"filename": att.Filename},
				})
			} else {
				textPayload := extracted
				if textPayload == "" && err != nil {
					textPayload = fmt.Sprintf("(PDF text extraction failed: %v)", err)
				}
				blocks = append(blocks, &message.TextBlock{Text: fmt.Sprintf("[PDF attachment: %s]\n%s", att.Filename, textPayload)})
			}
		case "text/csv", "text/plain":
			txt := truncateRunes(string(att.Data), maxExtractedTextRunes)
			summary.ExtractedText = new(txt)
			blocks = append(blocks, &message.TextBlock{Text: fmt.Sprintf("[File attachment: %s (%s)]\n%s", att.Filename, mime, txt)})
		default:
			return nil, nil, errors.E(errors.Invalid, CodeInvalidAttachment, fmt.Sprintf("unsupported attachment content_type %q", att.ContentType))
		}

		summaries = append(summaries, summary)
	}

	if len(blocks) == 0 {
		blocks = append(blocks, &message.TextBlock{Text: ""})
	}
	return summaries, blocks, nil
}

func truncateRunes(s string, maxLen int) string {
	if maxLen <= 0 {
		return ""
	}
	runes := []rune(s)
	if len(runes) <= maxLen {
		return s
	}
	return string(runes[:maxLen]) + "\n...[truncated]"
}

func mergeGenerationConfig(base GenerationConfig, override *GenerationConfig) GenerationConfig {
	out := base
	if override == nil {
		return out
	}
	if override.Temperature != nil {
		out.Temperature = new(*override.Temperature)
	}
	if override.MaxTokens != nil {
		out.MaxTokens = new(*override.MaxTokens)
	}
	if override.TopP != nil {
		out.TopP = new(*override.TopP)
	}
	if override.Thinking.Enabled {
		out.Thinking.Enabled = true
	}
	if override.Thinking.Effort != nil {
		out.Thinking.Effort = new(*override.Thinking.Effort)
	}
	if override.Thinking.BudgetTokens != nil {
		out.Thinking.BudgetTokens = new(*override.Thinking.BudgetTokens)
	}
	return out
}

func ensureSpaceContext(ctx context.Context, spaceID string) context.Context {
	if existingID, ok := auth.SpaceIDFromContext(ctx); ok && existingID == spaceID {
		if _, hasRole := auth.SpaceRoleFromContext(ctx); hasRole {
			return ctx
		}
		return auth.WithSpaceScope(ctx, spaceID, string(space.RoleMember))
	}
	if _, ok := auth.PrincipalFromContext(ctx); !ok {
		ctx = auth.WithPrincipal(ctx, auth.Principal{Subject: "system"})
	}
	return auth.WithSpaceScope(ctx, spaceID, string(space.RoleMember))
}

func buildAgentPrompt(prompt string, input map[string]any) string {
	trimmed := strings.TrimSpace(prompt)
	if len(input) == 0 {
		return trimmed
	}
	raw, err := json.Marshal(input, json.Deterministic(true))
	if err != nil {
		return trimmed
	}
	if trimmed == "" {
		return "Input:\n" + string(raw)
	}
	return trimmed + "\n\nInput Context:\n" + string(raw)
}

func parseJSONSchemaMap(m map[string]any) (*jsonschema.Schema, error) {
	raw, err := json.Marshal(m)
	if err != nil {
		return nil, err
	}
	var s jsonschema.Schema
	if err := json.Unmarshal(raw, &s); err != nil {
		return nil, err
	}
	return &s, nil
}

func tokenUsageFromAssistant(msg *message.Assistant) TokenUsage {
	if msg == nil || msg.Metrics == nil {
		return TokenUsage{}
	}
	td := msg.Metrics.Tokens
	total := int32(msg.Metrics.TotalTokens)
	if total == 0 {
		total = int32(td.Input + td.Output + td.Reasoning)
	}
	return TokenUsage{
		Input:     int32(td.Input),
		Output:    int32(td.Output),
		Reasoning: int32(td.Reasoning),
		Cached:    int32(td.CacheRead),
		Total:     total,
	}
}

func extractAssistantText(msg *message.Assistant) string {
	if msg == nil {
		return ""
	}
	var b strings.Builder
	for _, block := range msg.Content {
		if tb, ok := block.(*message.TextBlock); ok {
			b.WriteString(tb.Text)
		}
	}
	return b.String()
}

func extractJSONText(raw string) string {
	trimmed := strings.TrimSpace(raw)
	if after, ok := strings.CutPrefix(trimmed, "```json"); ok {
		trimmed = strings.TrimSpace(strings.TrimSuffix(after, "```"))
	} else if after, ok := strings.CutPrefix(trimmed, "```"); ok {
		trimmed = strings.TrimSpace(strings.TrimSuffix(after, "```"))
	}
	return trimmed
}
