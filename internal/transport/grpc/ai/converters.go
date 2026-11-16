package aigrpc

import (
	"encoding/json/v2"
	"fmt"

	aiv1 "github.com/masterkeysrd/saturn/apis/saturn/platform/ai/v1"
	aiaggregator "github.com/masterkeysrd/saturn/internal/aggregator/ai"
	aiapp "github.com/masterkeysrd/saturn/internal/application/ai"
	"github.com/masterkeysrd/saturn/internal/platform/ai"
	"google.golang.org/protobuf/types/known/structpb"
	"google.golang.org/protobuf/types/known/timestamppb"
)

func toStructPB(m map[string]any) (*structpb.Struct, error) {
	if m == nil {
		return nil, nil
	}
	raw, err := json.Marshal(m)
	if err != nil {
		return nil, fmt.Errorf("marshal struct map: %w", err)
	}
	var st structpb.Struct
	if err := st.UnmarshalJSON(raw); err != nil {
		return nil, fmt.Errorf("unmarshal structpb: %w", err)
	}
	return &st, nil
}

func fromStructPB(st *structpb.Struct) map[string]any {
	if st == nil {
		return nil
	}
	return st.AsMap()
}

func toProtoErrorDetail(e *ai.ErrorDetail) *aiv1.ErrorDetail {
	if e == nil {
		return nil
	}
	return &aiv1.ErrorDetail{
		Code:    e.Code,
		Message: e.Message,
	}
}

func toProtoTokenUsage(u *ai.TokenUsage) *aiv1.TokenUsage {
	if u == nil {
		return nil
	}
	return &aiv1.TokenUsage{
		Input:     u.Input,
		Output:    u.Output,
		Reasoning: u.Reasoning,
		Cached:    u.Cached,
		Total:     u.Total,
	}
}

func toProtoGenerationConfig(g ai.GenerationConfig) *aiv1.GenerationConfig {
	out := &aiv1.GenerationConfig{
		Temperature: g.Temperature,
		MaxTokens:   g.MaxTokens,
		TopP:        g.TopP,
	}
	if g.Thinking.Enabled || g.Thinking.Effort != nil || g.Thinking.BudgetTokens != nil {
		out.Thinking = &aiv1.ThinkingConfig{
			Enabled:      g.Thinking.Enabled,
			Effort:       g.Thinking.Effort,
			BudgetTokens: g.Thinking.BudgetTokens,
		}
	}
	return out
}

func fromProtoGenerationConfig(g *aiv1.GenerationConfig) ai.GenerationConfig {
	if g == nil {
		return ai.GenerationConfig{}
	}
	out := ai.GenerationConfig{
		Temperature: g.Temperature,
		MaxTokens:   g.MaxTokens,
		TopP:        g.TopP,
	}
	if g.Thinking != nil {
		out.Thinking = ai.ThinkingConfig{
			Enabled:      g.Thinking.Enabled,
			Effort:       g.Thinking.Effort,
			BudgetTokens: g.Thinking.BudgetTokens,
		}
	}
	return out
}

func toProtoSettings(s ai.Settings, spend float64) *aiv1.Settings {
	return &aiv1.Settings{
		Models: &aiv1.ModelRoleSettings{
			DefaultModelId:   s.Models.DefaultModelID,
			FastModelId:      s.Models.FastModelID,
			ReasoningModelId: s.Models.ReasoningModelID,
		},
		Governance: &aiv1.GovernanceConfig{
			MonthlyBudgetUsd: s.Governance.MonthlyBudgetUSD,
			RunRetentionDays: s.Governance.RunRetentionDays,
		},
		CurrentMonthSpendUsd: spend,
	}
}

func fromProtoSettings(s *aiv1.Settings) *ai.Settings {
	if s == nil {
		return nil
	}
	out := &ai.Settings{}
	if s.Models != nil {
		out.Models = ai.ModelRoleSettings{
			DefaultModelID:   s.Models.DefaultModelId,
			FastModelID:      s.Models.FastModelId,
			ReasoningModelID: s.Models.ReasoningModelId,
		}
	}
	if s.Governance != nil {
		out.Governance = ai.GovernanceConfig{
			MonthlyBudgetUSD: s.Governance.MonthlyBudgetUsd,
			RunRetentionDays: s.Governance.RunRetentionDays,
		}
	}
	return out
}

func toProtoProviderDescriptor(d ai.ProviderDescriptor) *aiv1.ProviderDescriptor {
	return &aiv1.ProviderDescriptor{
		Driver:            string(d.Driver),
		DisplayName:       d.DisplayName,
		Description:       d.Description,
		DefaultBaseUrl:    d.DefaultBaseURL,
		ApiKeyRequired:    d.APIKeyRequired,
		SupportsDiscovery: d.SupportsDiscovery,
		LogoIcon:          d.LogoIcon,
	}
}

func toProtoProvider(p *ai.Provider, modelCount int32) *aiv1.Provider {
	if p == nil {
		return nil
	}
	var lastVerified *timestamppb.Timestamp
	if p.Status.LastVerifiedAt != nil {
		lastVerified = timestamppb.New(*p.Status.LastVerifiedAt)
	}
	return &aiv1.Provider{
		Id:      p.ID,
		SpaceId: p.SpaceID,
		Name:    p.Name,
		Driver:  string(p.Driver),
		Config: &aiv1.ProviderConfig{
			BaseUrl: p.Config.BaseURL,
		},
		HasSecret: p.HasSecret || p.Secret.HasCredentials(),
		Status: &aiv1.ProviderStatus{
			State:          string(p.Status.State),
			LastVerifiedAt: lastVerified,
			Error:          toProtoErrorDetail(p.Status.Error),
		},
		IsEnabled:  p.IsEnabled,
		ModelCount: modelCount,
		CreateTime: timestamppb.New(p.CreateTime),
		UpdateTime: timestamppb.New(p.UpdateTime),
	}
}

func fromProtoProvider(p *aiv1.Provider) *ai.Provider {
	if p == nil {
		return nil
	}
	out := &ai.Provider{
		Name:      p.Name,
		Driver:    ai.Driver(p.Driver),
		IsEnabled: p.IsEnabled,
	}
	if p.Config != nil {
		out.Config = ai.ProviderConfig{
			BaseURL: p.Config.BaseUrl,
		}
	}
	if p.Secret != nil {
		out.Secret = &ai.ProviderSecret{
			APIKey:  p.Secret.ApiKey,
			Headers: p.Secret.Headers,
		}
	}
	return out
}

func toProtoModelProfile(prof ai.ModelProfile) *aiv1.ModelProfile {
	return &aiv1.ModelProfile{
		Capabilities: &aiv1.ModelCapabilities{
			ToolCalling:      prof.Capabilities.ToolCalling,
			Vision:           prof.Capabilities.Vision,
			Document:         prof.Capabilities.Document,
			Audio:            prof.Capabilities.Audio,
			Reasoning:        prof.Capabilities.Reasoning,
			StructuredOutput: prof.Capabilities.StructuredOutput,
			Streaming:        prof.Capabilities.Streaming,
		},
		Limits: &aiv1.ModelLimits{
			ContextWindow:   prof.Limits.ContextWindow,
			MaxOutputTokens: prof.Limits.MaxOutputTokens,
		},
		Pricing: &aiv1.ModelPricing{
			InputPerMillionUsd:       prof.Pricing.InputPerMillionUSD,
			OutputPerMillionUsd:      prof.Pricing.OutputPerMillionUSD,
			CachedInputPerMillionUsd: prof.Pricing.CachedInputPerMillionUSD,
		},
	}
}

func fromProtoModelProfile(prof *aiv1.ModelProfile) ai.ModelProfile {
	if prof == nil {
		return ai.ModelProfile{}
	}
	var out ai.ModelProfile
	if prof.Capabilities != nil {
		out.Capabilities = ai.ModelCapabilities{
			ToolCalling:      prof.Capabilities.ToolCalling,
			Vision:           prof.Capabilities.Vision,
			Document:         prof.Capabilities.Document,
			Audio:            prof.Capabilities.Audio,
			Reasoning:        prof.Capabilities.Reasoning,
			StructuredOutput: prof.Capabilities.StructuredOutput,
			Streaming:        prof.Capabilities.Streaming,
		}
	}
	if prof.Limits != nil {
		out.Limits = ai.ModelLimits{
			ContextWindow:   prof.Limits.ContextWindow,
			MaxOutputTokens: prof.Limits.MaxOutputTokens,
		}
	}
	if prof.Pricing != nil {
		out.Pricing = ai.ModelPricing{
			InputPerMillionUSD:       prof.Pricing.InputPerMillionUsd,
			OutputPerMillionUSD:      prof.Pricing.OutputPerMillionUsd,
			CachedInputPerMillionUSD: prof.Pricing.CachedInputPerMillionUsd,
		}
	}
	return out
}

func toProtoModel(m *ai.Model, provName string, provDriver ai.Driver) *aiv1.Model {
	if m == nil {
		return nil
	}
	return &aiv1.Model{
		Id:             m.ID,
		SpaceId:        m.SpaceID,
		ProviderId:     m.ProviderID,
		ProviderName:   provName,
		ProviderDriver: string(provDriver),
		ModelId:        m.ModelID,
		DisplayName:    m.DisplayName,
		Source:         string(m.Source),
		Profile:        toProtoModelProfile(m.Profile),
		Config:         toProtoGenerationConfig(m.Config),
		IsEnabled:      m.IsEnabled,
		CreateTime:     timestamppb.New(m.CreateTime),
		UpdateTime:     timestamppb.New(m.UpdateTime),
	}
}

func fromProtoModel(m *aiv1.Model) *ai.Model {
	if m == nil {
		return nil
	}
	return &ai.Model{
		ProviderID:  m.ProviderId,
		ModelID:     m.ModelId,
		DisplayName: m.DisplayName,
		Source:      ai.ModelSource(m.Source),
		Profile:     fromProtoModelProfile(m.Profile),
		Config:      fromProtoGenerationConfig(m.Config),
		IsEnabled:   m.IsEnabled,
	}
}

func toProtoMCPServer(s *ai.MCPServer) (*aiv1.MCPServer, error) {
	if s == nil {
		return nil, nil
	}
	tools := make([]*aiv1.MCPToolSummary, 0, len(s.Discovery.Tools))
	for _, t := range s.Discovery.Tools {
		inSchema, err := toStructPB(t.InputSchema)
		if err != nil {
			return nil, err
		}
		tools = append(tools, &aiv1.MCPToolSummary{
			Name:            t.Name,
			Title:           t.Title,
			Description:     t.Description,
			InputSchema:     inSchema,
			ReadOnlyHint:    t.ReadOnlyHint,
			DestructiveHint: t.DestructiveHint,
		})
	}
	var srvInfo *aiv1.MCPServerInfo
	if s.Discovery.ServerInfo != nil {
		srvInfo = &aiv1.MCPServerInfo{
			Name:    s.Discovery.ServerInfo.Name,
			Version: s.Discovery.ServerInfo.Version,
		}
	}
	var lastSynced *timestamppb.Timestamp
	if s.Discovery.LastSyncedAt != nil {
		lastSynced = timestamppb.New(*s.Discovery.LastSyncedAt)
	}
	return &aiv1.MCPServer{
		Id:          s.ID,
		SpaceId:     s.SpaceID,
		SystemKey:   s.SystemKey,
		IsSystem:    s.IsSystem,
		Slug:        s.Slug,
		Name:        s.Name,
		Description: s.Description,
		Transport:   string(s.Transport),
		Config: &aiv1.MCPServerConfig{
			Url:            s.Config.URL,
			AuthType:       string(s.Config.AuthType),
			TrustReadHints: s.Config.TrustReadHints,
			TimeoutSeconds: s.Config.TimeoutSeconds,
		},
		HasAuthSecret: s.HasAuthSecret || s.AuthSecret.HasCredentials(),
		Discovery: &aiv1.MCPDiscoveryState{
			HealthStatus: string(s.Discovery.HealthStatus),
			ServerInfo:   srvInfo,
			Tools:        tools,
			LastSyncedAt: lastSynced,
			Error:        toProtoErrorDetail(s.Discovery.Error),
		},
		IsEnabled:  s.IsEnabled,
		CreateTime: timestamppb.New(s.CreateTime),
		UpdateTime: timestamppb.New(s.UpdateTime),
	}, nil
}

func fromProtoMCPServer(s *aiv1.MCPServer) *ai.MCPServer {
	if s == nil {
		return nil
	}
	out := &ai.MCPServer{
		Slug:        s.Slug,
		Name:        s.Name,
		Description: s.Description,
		IsEnabled:   s.IsEnabled,
	}
	if s.Config != nil {
		out.Config = ai.MCPServerConfig{
			URL:            s.Config.Url,
			AuthType:       ai.MCPAuthType(s.Config.AuthType),
			TrustReadHints: s.Config.TrustReadHints,
			TimeoutSeconds: s.Config.TimeoutSeconds,
		}
	}
	if s.AuthSecret != nil {
		out.AuthSecret = &ai.MCPAuthSecret{
			BearerToken: s.AuthSecret.BearerToken,
			Headers:     s.AuthSecret.Headers,
		}
	}
	return out
}

func toProtoAgent(a *ai.Agent, modelDisplayName *string, stats *ai.AgentStats) (*aiv1.Agent, error) {
	if a == nil {
		return nil, nil
	}
	outSchema, err := toStructPB(a.Config.OutputSchema)
	if err != nil {
		return nil, err
	}
	bindings := make([]*aiv1.MCPBinding, 0, len(a.Config.MCPBindings))
	for _, b := range a.Config.MCPBindings {
		bindings = append(bindings, &aiv1.MCPBinding{
			McpServerId:  b.MCPServerID,
			AllowedTools: b.AllowedTools,
		})
	}

	var pbStats *aiv1.AgentStats
	if stats != nil {
		pbStats = &aiv1.AgentStats{
			TotalRuns_7D:     stats.TotalRuns7d,
			CompletedRuns_7D: stats.CompletedRuns7d,
			FailedRuns_7D:    stats.FailedRuns7d,
		}
		if stats.LastRunAt != nil {
			pbStats.LastRunAt = timestamppb.New(*stats.LastRunAt)
		}
	}

	return &aiv1.Agent{
		Id:               a.ID,
		SpaceId:          a.SpaceID,
		SystemKey:        a.SystemKey,
		IsSystem:         a.IsSystem,
		Slug:             a.Slug,
		Name:             a.Name,
		Description:      a.Description,
		Tags:             a.Tags,
		ModelId:          a.ModelID,
		ModelDisplayName: modelDisplayName,
		Config: &aiv1.AgentConfig{
			Icon:              a.Config.Icon,
			SystemInstruction: a.Config.SystemInstruction,
			Generation:        toProtoGenerationConfig(a.Config.Generation),
			Execution: &aiv1.ExecutionConfig{
				ApprovalPolicy: string(a.Config.Execution.ApprovalPolicy),
				MaxSteps:       a.Config.Execution.MaxSteps,
				TimeoutSeconds: a.Config.Execution.TimeoutSeconds,
			},
			McpBindings:  bindings,
			OutputSchema: outSchema,
		},
		IsEnabled:  a.IsEnabled,
		Version:    a.Version,
		Stats:      pbStats,
		CreateTime: timestamppb.New(a.CreateTime),
		UpdateTime: timestamppb.New(a.UpdateTime),
	}, nil
}

func fromProtoAgent(a *aiv1.Agent) *ai.Agent {
	if a == nil {
		return nil
	}
	out := &ai.Agent{
		Slug:        a.Slug,
		Name:        a.Name,
		Description: a.Description,
		Tags:        a.Tags,
		ModelID:     a.ModelId,
		IsEnabled:   a.IsEnabled,
	}
	if a.Config != nil {
		bindings := make([]ai.MCPBinding, 0, len(a.Config.McpBindings))
		for _, b := range a.Config.McpBindings {
			bindings = append(bindings, ai.MCPBinding{
				MCPServerID:  b.McpServerId,
				AllowedTools: b.AllowedTools,
			})
		}
		out.Config = ai.AgentConfig{
			Icon:              a.Config.Icon,
			SystemInstruction: a.Config.SystemInstruction,
			Generation:        fromProtoGenerationConfig(a.Config.Generation),
			MCPBindings:       bindings,
			OutputSchema:      fromStructPB(a.Config.OutputSchema),
		}
		if a.Config.Execution != nil {
			out.Config.Execution = ai.ExecutionConfig{
				ApprovalPolicy: ai.ApprovalPolicy(a.Config.Execution.ApprovalPolicy),
				MaxSteps:       a.Config.Execution.MaxSteps,
				TimeoutSeconds: a.Config.Execution.TimeoutSeconds,
			}
		}
	}
	return out
}

func toProtoPendingApprovals(approvals []ai.PendingToolApproval) ([]*aiv1.PendingToolApproval, error) {
	out := make([]*aiv1.PendingToolApproval, 0, len(approvals))
	for _, pa := range approvals {
		argsPB, err := toStructPB(pa.Arguments)
		if err != nil {
			return nil, err
		}
		out = append(out, &aiv1.PendingToolApproval{
			ToolCallId:      pa.ToolCallID,
			McpServerId:     pa.MCPServerID,
			McpServerName:   pa.MCPServerName,
			ToolName:        pa.ToolName,
			Arguments:       argsPB,
			DestructiveHint: pa.DestructiveHint,
		})
	}
	return out, nil
}

func toProtoThread(th *ai.Thread, agentName, modelDisplayName *string) (*aiv1.Thread, error) {
	if th == nil {
		return nil, nil
	}
	pendingPB, err := toProtoPendingApprovals(th.State.PendingApprovals)
	if err != nil {
		return nil, err
	}
	var approvalPolicy *string
	if th.Config.ApprovalPolicy != nil {
		approvalPolicy = new(string(*th.Config.ApprovalPolicy))
	}
	var memPB *aiv1.ThreadMemory
	if th.State.Memory.Summary != "" || th.State.Memory.UpToSeq > 0 {
		memPB = &aiv1.ThreadMemory{
			Summary: th.State.Memory.Summary,
			UpToSeq: th.State.Memory.UpToSeq,
		}
	}
	return &aiv1.Thread{
		Id:               th.ID,
		SpaceId:          th.SpaceID,
		UserId:           th.UserID,
		AgentId:          th.AgentID,
		AgentName:        agentName,
		ModelId:          th.ModelID,
		ModelDisplayName: modelDisplayName,
		Title:            th.Title,
		Status:           string(th.Status),
		Config: &aiv1.ThreadConfig{
			ApprovalPolicy: approvalPolicy,
			Generation:     toProtoGenerationConfig(th.Config.Generation),
		},
		State: &aiv1.ThreadState{
			ActiveRunId:      th.State.ActiveRunID,
			PendingApprovals: pendingPB,
			Memory:           memPB,
		},
		MessageCount:  th.MessageCount,
		IsPinned:      th.IsPinned,
		IsArchived:    th.IsArchived,
		LastMessageAt: timestamppb.New(th.LastMessageAt),
		CreateTime:    timestamppb.New(th.CreateTime),
		UpdateTime:    timestamppb.New(th.UpdateTime),
	}, nil
}

func fromProtoThread(th *aiv1.Thread) *ai.Thread {
	if th == nil {
		return nil
	}
	out := &ai.Thread{
		AgentID:    th.AgentId,
		ModelID:    th.ModelId,
		Title:      th.Title,
		IsPinned:   th.IsPinned,
		IsArchived: th.IsArchived,
	}
	if th.Config != nil {
		var ap *ai.ApprovalPolicy
		if th.Config.ApprovalPolicy != nil {
			ap = new(ai.ApprovalPolicy(*th.Config.ApprovalPolicy))
		}
		out.Config = ai.ThreadConfig{
			ApprovalPolicy: ap,
			Generation:     fromProtoGenerationConfig(th.Config.Generation),
		}
	}
	return out
}

func toProtoThreadMessage(msg *ai.ThreadMessage) (*aiv1.ThreadMessage, error) {
	if msg == nil {
		return nil, nil
	}
	blocks := make([]*aiv1.ContentBlock, 0, len(msg.Blocks))
	for _, b := range msg.Blocks {
		argsPB, err := toStructPB(b.Arguments)
		if err != nil {
			return nil, err
		}
		resPB, err := toStructPB(b.Result)
		if err != nil {
			return nil, err
		}
		var attPB *aiv1.AttachmentSummary
		if b.Attachment != nil {
			attPB = &aiv1.AttachmentSummary{
				Filename:      b.Attachment.Filename,
				ContentType:   b.Attachment.ContentType,
				SizeBytes:     b.Attachment.SizeBytes,
				ExtractedText: b.Attachment.ExtractedText,
			}
		}
		blocks = append(blocks, &aiv1.ContentBlock{
			Type:        string(b.Type),
			Text:        b.Text,
			ToolCallId:  b.ToolCallID,
			McpServerId: b.MCPServerID,
			ToolName:    b.ToolName,
			Arguments:   argsPB,
			Result:      resPB,
			IsError:     b.IsError,
			Attachment:  attPB,
		})
	}
	return &aiv1.ThreadMessage{
		Id:       msg.ID,
		ThreadId: msg.ThreadID,
		SpaceId:  msg.SpaceID,
		RunId:    msg.RunID,
		Seq:      msg.Seq,
		Role:     string(msg.Role),
		Blocks:   blocks,
		Metadata: &aiv1.MessageMetadata{
			ModelName: msg.Metadata.ModelName,
			Tokens:    toProtoTokenUsage(msg.Metadata.Tokens),
		},
		CreateTime: timestamppb.New(msg.CreateTime),
	}, nil
}

func toProtoRunStep(s *ai.RunStep) (*aiv1.RunStep, error) {
	if s == nil {
		return nil, nil
	}
	inPB, err := toStructPB(s.Input)
	if err != nil {
		return nil, err
	}
	outPB, err := toStructPB(s.Output)
	if err != nil {
		return nil, err
	}
	return &aiv1.RunStep{
		Id:          s.ID,
		RunId:       s.RunID,
		SpaceId:     s.SpaceID,
		Seq:         s.Seq,
		Kind:        string(s.Kind),
		McpServerId: s.MCPServerID,
		Name:        s.Name,
		Status:      string(s.Status),
		Input:       inPB,
		Output:      outPB,
		Error:       toProtoErrorDetail(s.Error),
		Metrics: &aiv1.StepMetrics{
			Tokens:     toProtoTokenUsage(s.Metrics.Tokens),
			DurationMs: s.Metrics.DurationMS,
		},
		CreateTime: timestamppb.New(s.CreateTime),
	}, nil
}

func toProtoRun(r *ai.Run, agentName *string, steps []*ai.RunStep) (*aiv1.Run, error) {
	if r == nil {
		return nil, nil
	}
	var snapPB *aiv1.ModelSnapshot
	if r.Input.ModelSnapshot != nil {
		snapPB = &aiv1.ModelSnapshot{
			Driver:    r.Input.ModelSnapshot.Driver,
			ModelName: r.Input.ModelSnapshot.ModelName,
		}
	}
	var outPB *aiv1.RunOutput
	if r.Output != nil {
		dataPB, err := toStructPB(r.Output.Data)
		if err != nil {
			return nil, err
		}
		outPB = &aiv1.RunOutput{
			Text: r.Output.Text,
			Data: dataPB,
		}
	}
	var endTS *timestamppb.Timestamp
	if r.EndTime != nil {
		endTS = timestamppb.New(*r.EndTime)
	}
	stepsPB := make([]*aiv1.RunStep, 0, len(steps))
	for _, st := range steps {
		spb, err := toProtoRunStep(st)
		if err != nil {
			return nil, err
		}
		stepsPB = append(stepsPB, spb)
	}
	return &aiv1.Run{
		Id:         r.ID,
		SpaceId:    r.SpaceID,
		Kind:       string(r.Kind),
		Source:     string(r.Source),
		ThreadId:   r.ThreadID,
		AgentId:    r.AgentID,
		AgentName:  agentName,
		ProviderId: r.ProviderID,
		ModelId:    r.ModelID,
		FlowRunId:  r.FlowRunID,
		Status:     string(r.Status),
		Input: &aiv1.RunInput{
			Prompt:            r.Input.Prompt,
			SystemInstruction: r.Input.SystemInstruction,
			ModelSnapshot:     snapPB,
		},
		Output: outPB,
		Error:  toProtoErrorDetail(r.Error),
		Metrics: &aiv1.RunMetrics{
			Tokens:           toProtoTokenUsage(&r.Metrics.Tokens),
			EstimatedCostUsd: r.Metrics.EstimatedCostUSD,
			LatencyMs:        r.Metrics.LatencyMS,
			StepCount:        r.Metrics.StepCount,
		},
		Steps:      stepsPB,
		StartTime:  timestamppb.New(r.StartTime),
		EndTime:    endTS,
		CreateTime: timestamppb.New(r.CreateTime),
	}, nil
}

func toProtoStreamEvent(ev ai.ThreadStreamEvent) (*aiv1.ThreadStreamEvent, error) {
	return ToProtoStreamEvent(ev)
}

// ToProtoStreamEvent converts a domain ThreadStreamEvent to its Protobuf representation.
func ToProtoStreamEvent(ev ai.ThreadStreamEvent) (*aiv1.ThreadStreamEvent, error) {
	argsPB, err := toStructPB(ev.Arguments)
	if err != nil {
		return nil, err
	}
	resPB, err := toStructPB(ev.Result)
	if err != nil {
		return nil, err
	}
	approvalsPB, err := toProtoPendingApprovals(ev.Approvals)
	if err != nil {
		return nil, err
	}
	msgPB, err := toProtoThreadMessage(ev.Message)
	if err != nil {
		return nil, err
	}
	thPB, err := toProtoThread(ev.Thread, nil, nil)
	if err != nil {
		return nil, err
	}
	runPB, err := toProtoRun(ev.Run, nil, nil)
	if err != nil {
		return nil, err
	}
	return &aiv1.ThreadStreamEvent{
		Type:        string(ev.Type),
		ThreadId:    ev.ThreadID,
		RunId:       ev.RunID,
		MessageId:   ev.MessageID,
		Delta:       ev.Delta,
		ToolCallId:  ev.ToolCallID,
		ToolName:    ev.ToolName,
		McpServerId: ev.MCPServerID,
		Arguments:   argsPB,
		Result:      resPB,
		IsError:     ev.IsError,
		Approvals:   approvalsPB,
		Message:     msgPB,
		Thread:      thPB,
		Run:         runPB,
		Error:       toProtoErrorDetail(ev.Error),
	}, nil
}

func fromProtoAttachments(atts []*aiv1.TurnAttachment) []ai.TurnAttachment {
	if len(atts) == 0 {
		return nil
	}
	out := make([]ai.TurnAttachment, 0, len(atts))
	for _, a := range atts {
		if a == nil {
			continue
		}
		out = append(out, ai.TurnAttachment{
			Filename:    a.Filename,
			ContentType: a.ContentType,
			Data:        a.Data,
		})
	}
	return out
}

func fromProtoApprovalDecisions(decisions []*aiv1.ToolApprovalDecision) []ai.ToolApprovalDecision {
	out := make([]ai.ToolApprovalDecision, 0, len(decisions))
	for _, d := range decisions {
		if d == nil {
			continue
		}
		out = append(out, ai.ToolApprovalDecision{
			ToolCallID: d.ToolCallId,
			Approved:   d.Approved,
		})
	}
	return out
}

var _ = (*aiaggregator.ProviderView)(nil)
var _ = (*aiapp.UpdateProviderRequest)(nil)
