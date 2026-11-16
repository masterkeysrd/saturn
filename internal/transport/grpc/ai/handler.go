package aigrpc

import (
	"context"
	"strings"

	aiv1 "github.com/masterkeysrd/saturn/apis/saturn/platform/ai/v1"
	aiaggregator "github.com/masterkeysrd/saturn/internal/aggregator/ai"
	aiapp "github.com/masterkeysrd/saturn/internal/application/ai"
	"github.com/masterkeysrd/saturn/internal/platform/ai"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/paging"
	"google.golang.org/grpc"
	"google.golang.org/protobuf/types/known/emptypb"
)

// Aggregator defines the read-only CQRS queries required by the AI gRPC handler.
type Aggregator interface {
	GetProviderDescriptors() []ai.ProviderDescriptor
	GetSettings(ctx context.Context) (*aiaggregator.SettingsView, error)
	ListProviders(ctx context.Context) ([]*aiaggregator.ProviderView, error)
	GetProvider(ctx context.Context, id string) (*aiaggregator.ProviderView, error)
	ListModels(ctx context.Context, filter ai.ListModelsFilter) ([]*aiaggregator.ModelView, error)
	GetModel(ctx context.Context, id string) (*aiaggregator.ModelView, error)
	ListMCPServers(ctx context.Context) ([]*ai.MCPServer, error)
	GetMCPServer(ctx context.Context, idOrKey string) (*ai.MCPServer, error)
	ListAgents(ctx context.Context) ([]*aiaggregator.AgentView, error)
	GetAgent(ctx context.Context, idOrKey string) (*aiaggregator.AgentView, error)
	ListThreads(ctx context.Context, filter ai.ListThreadsFilter) (*aiaggregator.ThreadListResult, error)
	GetThread(ctx context.Context, id string) (*aiaggregator.ThreadView, error)
	ListThreadMessages(ctx context.Context, filter ai.ListMessagesFilter) (*paging.Page[*ai.ThreadMessage], error)
	ListRuns(ctx context.Context, filter ai.ListRunsFilter) (*aiaggregator.RunListResult, error)
	GetRun(ctx context.Context, id string) (*aiaggregator.RunView, error)
}

// Handler adapts gRPC AIService RPCs to aiapp.Coordinator and aiaggregator.Service.
type Handler struct {
	aiv1.UnimplementedAIServiceServer
	coordinator aiapp.Coordinator
	aggregator  Aggregator
}

// NewHandler constructs a new AIService gRPC Handler.
func NewHandler(coordinator aiapp.Coordinator, aggregator Aggregator) *Handler {
	return &Handler{
		coordinator: coordinator,
		aggregator:  aggregator,
	}
}

func (h *Handler) GetSettings(ctx context.Context, _ *aiv1.GetSettingsRequest) (*aiv1.Settings, error) {
	view, err := h.aggregator.GetSettings(ctx)
	if err != nil {
		return nil, err
	}
	return toProtoSettings(view.Settings, view.CurrentMonthSpendUSD), nil
}

func (h *Handler) UpdateSettings(ctx context.Context, req *aiv1.UpdateSettingsRequest) (*aiv1.Settings, error) {
	var mask []string
	if req.UpdateMask != nil {
		mask = req.UpdateMask.Paths
	}
	if _, err := h.coordinator.UpdateSettings(ctx, &aiapp.UpdateSettingsRequest{
		Settings:   fromProtoSettings(req.Settings),
		UpdateMask: mask,
	}); err != nil {
		return nil, err
	}
	view, err := h.aggregator.GetSettings(ctx)
	if err != nil {
		return nil, err
	}
	return toProtoSettings(view.Settings, view.CurrentMonthSpendUSD), nil
}

func (h *Handler) ListProviderDescriptors(_ context.Context, _ *aiv1.ListProviderDescriptorsRequest) (*aiv1.ListProviderDescriptorsResponse, error) {
	descs := h.aggregator.GetProviderDescriptors()
	pb := make([]*aiv1.ProviderDescriptor, 0, len(descs))
	for _, d := range descs {
		pb = append(pb, toProtoProviderDescriptor(d))
	}
	return &aiv1.ListProviderDescriptorsResponse{Providers: pb}, nil
}

func (h *Handler) ListProviders(ctx context.Context, _ *aiv1.ListProvidersRequest) (*aiv1.ListProvidersResponse, error) {
	views, err := h.aggregator.ListProviders(ctx)
	if err != nil {
		return nil, err
	}
	pb := make([]*aiv1.Provider, 0, len(views))
	for _, v := range views {
		pb = append(pb, toProtoProvider(v.Provider, v.ModelCount))
	}
	return &aiv1.ListProvidersResponse{Providers: pb}, nil
}

func (h *Handler) GetProvider(ctx context.Context, req *aiv1.GetProviderRequest) (*aiv1.Provider, error) {
	v, err := h.aggregator.GetProvider(ctx, req.Id)
	if err != nil {
		return nil, err
	}
	return toProtoProvider(v.Provider, v.ModelCount), nil
}

func (h *Handler) CreateProvider(ctx context.Context, req *aiv1.CreateProviderRequest) (*aiv1.Provider, error) {
	p := fromProtoProvider(req.Provider)
	if p == nil {
		return nil, errors.E(errors.Invalid, "provider payload is required")
	}
	created, err := h.coordinator.CreateProvider(ctx, &aiapp.CreateProviderRequest{
		Name:      p.Name,
		Driver:    p.Driver,
		Config:    p.Config,
		Secret:    p.Secret,
		IsEnabled: p.IsEnabled,
	})
	if err != nil {
		return nil, err
	}
	v, err := h.aggregator.GetProvider(ctx, created.ID)
	if err == nil && v != nil {
		return toProtoProvider(v.Provider, v.ModelCount), nil
	}
	return toProtoProvider(created, 0), nil
}

func (h *Handler) UpdateProvider(ctx context.Context, req *aiv1.UpdateProviderRequest) (*aiv1.Provider, error) {
	var mask []string
	if req.UpdateMask != nil {
		mask = req.UpdateMask.Paths
	}
	updated, err := h.coordinator.UpdateProvider(ctx, &aiapp.UpdateProviderRequest{
		ID:         req.Id,
		Provider:   fromProtoProvider(req.Provider),
		UpdateMask: mask,
	})
	if err != nil {
		return nil, err
	}
	v, err := h.aggregator.GetProvider(ctx, updated.ID)
	if err == nil && v != nil {
		return toProtoProvider(v.Provider, v.ModelCount), nil
	}
	return toProtoProvider(updated, 0), nil
}

func (h *Handler) DeleteProvider(ctx context.Context, req *aiv1.DeleteProviderRequest) (*emptypb.Empty, error) {
	if err := h.coordinator.DeleteProvider(ctx, req.Id); err != nil {
		return nil, err
	}
	return &emptypb.Empty{}, nil
}

func (h *Handler) TestProvider(ctx context.Context, req *aiv1.TestProviderRequest) (*aiv1.Provider, error) {
	tested, err := h.coordinator.TestProvider(ctx, req.Id)
	if err != nil {
		return nil, err
	}
	v, err := h.aggregator.GetProvider(ctx, tested.ID)
	if err == nil && v != nil {
		return toProtoProvider(v.Provider, v.ModelCount), nil
	}
	return toProtoProvider(tested, 0), nil
}

func (h *Handler) DiscoverProviderModels(ctx context.Context, req *aiv1.DiscoverProviderModelsRequest) (*aiv1.DiscoverProviderModelsResponse, error) {
	items, err := h.coordinator.DiscoverProviderModels(ctx, req.Id)
	if err != nil {
		return nil, err
	}
	pb := make([]*aiv1.DiscoveredModel, 0, len(items))
	for _, it := range items {
		pb = append(pb, &aiv1.DiscoveredModel{
			ModelId:           it.ModelID,
			DisplayName:       it.DisplayName,
			Profile:           toProtoModelProfile(it.Profile),
			AlreadyRegistered: it.AlreadyRegistered,
		})
	}
	return &aiv1.DiscoverProviderModelsResponse{Models: pb}, nil
}

func (h *Handler) SyncProviderModels(ctx context.Context, req *aiv1.SyncProviderModelsRequest) (*aiv1.SyncProviderModelsResponse, error) {
	res, err := h.coordinator.SyncProviderModels(ctx, &aiapp.SyncProviderModelsRequest{
		ProviderID: req.Id,
		ModelIDs:   req.ModelIds,
	})
	if err != nil {
		return nil, err
	}
	pb := make([]*aiv1.Model, 0, len(res.Models))
	for _, m := range res.Models {
		pb = append(pb, toProtoModel(m, "", ""))
	}
	return &aiv1.SyncProviderModelsResponse{
		Models:     pb,
		AddedCount: res.AddedCount,
	}, nil
}

func (h *Handler) ListModels(ctx context.Context, req *aiv1.ListModelsRequest) (*aiv1.ListModelsResponse, error) {
	views, err := h.aggregator.ListModels(ctx, ai.ListModelsFilter{
		ProviderID: req.ProviderId,
		IsEnabled:  req.IsEnabled,
	})
	if err != nil {
		return nil, err
	}
	pb := make([]*aiv1.Model, 0, len(views))
	for _, v := range views {
		pb = append(pb, toProtoModel(v.Model, v.ProviderName, v.ProviderDriver))
	}
	return &aiv1.ListModelsResponse{Models: pb}, nil
}

func (h *Handler) GetModel(ctx context.Context, req *aiv1.GetModelRequest) (*aiv1.Model, error) {
	v, err := h.aggregator.GetModel(ctx, req.Id)
	if err != nil {
		return nil, err
	}
	return toProtoModel(v.Model, v.ProviderName, v.ProviderDriver), nil
}

func (h *Handler) CreateModel(ctx context.Context, req *aiv1.CreateModelRequest) (*aiv1.Model, error) {
	m := fromProtoModel(req.Model)
	if m == nil {
		return nil, errors.E(errors.Invalid, "model payload is required")
	}
	created, err := h.coordinator.CreateModel(ctx, &aiapp.CreateModelRequest{
		ProviderID:  m.ProviderID,
		ModelID:     m.ModelID,
		DisplayName: m.DisplayName,
		Source:      m.Source,
		Profile:     m.Profile,
		Config:      m.Config,
		IsEnabled:   m.IsEnabled,
	})
	if err != nil {
		return nil, err
	}
	v, err := h.aggregator.GetModel(ctx, created.ID)
	if err == nil && v != nil {
		return toProtoModel(v.Model, v.ProviderName, v.ProviderDriver), nil
	}
	return toProtoModel(created, "", ""), nil
}

func (h *Handler) UpdateModel(ctx context.Context, req *aiv1.UpdateModelRequest) (*aiv1.Model, error) {
	var mask []string
	if req.UpdateMask != nil {
		mask = req.UpdateMask.Paths
	}
	updated, err := h.coordinator.UpdateModel(ctx, &aiapp.UpdateModelRequest{
		ID:         req.Id,
		Model:      fromProtoModel(req.Model),
		UpdateMask: mask,
	})
	if err != nil {
		return nil, err
	}
	v, err := h.aggregator.GetModel(ctx, updated.ID)
	if err == nil && v != nil {
		return toProtoModel(v.Model, v.ProviderName, v.ProviderDriver), nil
	}
	return toProtoModel(updated, "", ""), nil
}

func (h *Handler) DeleteModel(ctx context.Context, req *aiv1.DeleteModelRequest) (*emptypb.Empty, error) {
	if err := h.coordinator.DeleteModel(ctx, req.Id); err != nil {
		return nil, err
	}
	return &emptypb.Empty{}, nil
}

func (h *Handler) ListMCPServers(ctx context.Context, _ *aiv1.ListMCPServersRequest) (*aiv1.ListMCPServersResponse, error) {
	if err := h.coordinator.EnsureSystemMCPAndAssistant(ctx); err != nil {
		return nil, err
	}
	servers, err := h.aggregator.ListMCPServers(ctx)
	if err != nil {
		return nil, err
	}
	pb := make([]*aiv1.MCPServer, 0, len(servers))
	for _, s := range servers {
		item, cErr := toProtoMCPServer(s)
		if cErr != nil {
			return nil, cErr
		}
		pb = append(pb, item)
	}
	return &aiv1.ListMCPServersResponse{McpServers: pb}, nil
}

func (h *Handler) GetMCPServer(ctx context.Context, req *aiv1.GetMCPServerRequest) (*aiv1.MCPServer, error) {
	srv, err := h.aggregator.GetMCPServer(ctx, req.Id)
	if err != nil && strings.HasPrefix(req.Id, "system.") && (errors.Is(err, ai.ErrMCPServerNotFound) || errors.Is(err, errors.NotExist)) {
		if sErr := h.coordinator.EnsureSystemMCPAndAssistant(ctx); sErr != nil {
			return nil, sErr
		}
		srv, err = h.aggregator.GetMCPServer(ctx, req.Id)
	}
	if err != nil {
		return nil, err
	}
	return toProtoMCPServer(srv)
}

func (h *Handler) CreateMCPServer(ctx context.Context, req *aiv1.CreateMCPServerRequest) (*aiv1.MCPServer, error) {
	s := fromProtoMCPServer(req.McpServer)
	if s == nil {
		return nil, errors.E(errors.Invalid, "mcp_server payload is required")
	}
	created, err := h.coordinator.CreateMCPServer(ctx, &aiapp.CreateMCPServerRequest{
		Slug:        s.Slug,
		Name:        s.Name,
		Description: s.Description,
		Config:      s.Config,
		AuthSecret:  s.AuthSecret,
		IsEnabled:   s.IsEnabled,
	})
	if err != nil {
		return nil, err
	}
	return toProtoMCPServer(created)
}

func (h *Handler) UpdateMCPServer(ctx context.Context, req *aiv1.UpdateMCPServerRequest) (*aiv1.MCPServer, error) {
	var mask []string
	if req.UpdateMask != nil {
		mask = req.UpdateMask.Paths
	}
	updated, err := h.coordinator.UpdateMCPServer(ctx, &aiapp.UpdateMCPServerRequest{
		ID:         req.Id,
		MCPServer:  fromProtoMCPServer(req.McpServer),
		UpdateMask: mask,
	})
	if err != nil {
		return nil, err
	}
	return toProtoMCPServer(updated)
}

func (h *Handler) DeleteMCPServer(ctx context.Context, req *aiv1.DeleteMCPServerRequest) (*emptypb.Empty, error) {
	if err := h.coordinator.DeleteMCPServer(ctx, req.Id); err != nil {
		return nil, err
	}
	return &emptypb.Empty{}, nil
}

func (h *Handler) TestMCPServer(ctx context.Context, req *aiv1.TestMCPServerRequest) (*aiv1.MCPServer, error) {
	tested, err := h.coordinator.TestMCPServer(ctx, req.Id)
	if err != nil {
		return nil, err
	}
	return toProtoMCPServer(tested)
}

func (h *Handler) SyncMCPServer(ctx context.Context, req *aiv1.SyncMCPServerRequest) (*aiv1.MCPServer, error) {
	synced, err := h.coordinator.SyncMCPServer(ctx, req.Id)
	if err != nil {
		return nil, err
	}
	return toProtoMCPServer(synced)
}

func (h *Handler) ListAgents(ctx context.Context, _ *aiv1.ListAgentsRequest) (*aiv1.ListAgentsResponse, error) {
	if err := h.coordinator.EnsureSystemMCPAndAssistant(ctx); err != nil {
		return nil, err
	}
	views, err := h.aggregator.ListAgents(ctx)
	if err != nil {
		return nil, err
	}
	pb := make([]*aiv1.Agent, 0, len(views))
	for _, v := range views {
		item, cErr := toProtoAgent(v.Agent, v.ModelDisplayName, v.Stats)
		if cErr != nil {
			return nil, cErr
		}
		pb = append(pb, item)
	}
	return &aiv1.ListAgentsResponse{Agents: pb}, nil
}

func (h *Handler) GetAgent(ctx context.Context, req *aiv1.GetAgentRequest) (*aiv1.Agent, error) {
	v, err := h.aggregator.GetAgent(ctx, req.Id)
	if err != nil && strings.HasPrefix(req.Id, "system.") && (errors.Is(err, ai.ErrAgentNotFound) || errors.Is(err, errors.NotExist)) {
		if sErr := h.coordinator.EnsureSystemMCPAndAssistant(ctx); sErr != nil {
			return nil, sErr
		}
		v, err = h.aggregator.GetAgent(ctx, req.Id)
	}
	if err != nil {
		return nil, err
	}
	return toProtoAgent(v.Agent, v.ModelDisplayName, v.Stats)
}

func (h *Handler) CreateAgent(ctx context.Context, req *aiv1.CreateAgentRequest) (*aiv1.Agent, error) {
	a := fromProtoAgent(req.Agent)
	if a == nil {
		return nil, errors.E(errors.Invalid, "agent payload is required")
	}
	created, err := h.coordinator.CreateAgent(ctx, &aiapp.CreateAgentRequest{
		Slug:        a.Slug,
		Name:        a.Name,
		Description: a.Description,
		Tags:        a.Tags,
		ModelID:     a.ModelID,
		Config:      a.Config,
		IsEnabled:   a.IsEnabled,
	})
	if err != nil {
		return nil, err
	}
	v, err := h.aggregator.GetAgent(ctx, created.ID)
	if err == nil && v != nil {
		return toProtoAgent(v.Agent, v.ModelDisplayName, v.Stats)
	}
	return toProtoAgent(created, nil, nil)
}

func (h *Handler) UpdateAgent(ctx context.Context, req *aiv1.UpdateAgentRequest) (*aiv1.Agent, error) {
	var mask []string
	if req.UpdateMask != nil {
		mask = req.UpdateMask.Paths
	}
	updated, err := h.coordinator.UpdateAgent(ctx, &aiapp.UpdateAgentRequest{
		ID:         req.Id,
		Agent:      fromProtoAgent(req.Agent),
		UpdateMask: mask,
	})
	if err != nil {
		return nil, err
	}
	v, err := h.aggregator.GetAgent(ctx, updated.ID)
	if err == nil && v != nil {
		return toProtoAgent(v.Agent, v.ModelDisplayName, v.Stats)
	}
	return toProtoAgent(updated, nil, nil)
}

func (h *Handler) DeleteAgent(ctx context.Context, req *aiv1.DeleteAgentRequest) (*emptypb.Empty, error) {
	if err := h.coordinator.DeleteAgent(ctx, req.Id); err != nil {
		return nil, err
	}
	return &emptypb.Empty{}, nil
}

func (h *Handler) ResetAgent(ctx context.Context, req *aiv1.ResetAgentRequest) (*aiv1.Agent, error) {
	reset, err := h.coordinator.ResetAgent(ctx, req.Id)
	if err != nil {
		return nil, err
	}
	v, err := h.aggregator.GetAgent(ctx, reset.ID)
	if err == nil && v != nil {
		return toProtoAgent(v.Agent, v.ModelDisplayName, v.Stats)
	}
	return toProtoAgent(reset, nil, nil)
}

func (h *Handler) ExecuteAgent(ctx context.Context, req *aiv1.ExecuteAgentRequest) (*aiv1.Run, error) {
	run, err := h.coordinator.ExecuteAgent(ctx, &aiapp.ExecuteAgentRequest{
		ID:           req.Id,
		Source:       ai.RunSourceAPI,
		Prompt:       req.Prompt,
		ModelID:      req.ModelId,
		Input:        fromStructPB(req.Input),
		OutputSchema: fromStructPB(req.OutputSchema),
	})
	if err != nil {
		return nil, err
	}
	return toProtoRun(run, nil, nil)
}

func (h *Handler) ListThreads(ctx context.Context, req *aiv1.ListThreadsRequest) (*aiv1.ListThreadsResponse, error) {
	res, err := h.aggregator.ListThreads(ctx, ai.ListThreadsFilter{
		IsArchived: req.IsArchived,
		PageSize:   req.PageSize,
		PageToken:  req.PageToken,
	})
	if err != nil {
		return nil, err
	}
	pb := make([]*aiv1.Thread, 0, len(res.Threads))
	for _, v := range res.Threads {
		item, cErr := toProtoThread(v.Thread, v.AgentName, v.ModelDisplayName)
		if cErr != nil {
			return nil, cErr
		}
		pb = append(pb, item)
	}
	return &aiv1.ListThreadsResponse{
		Threads:       pb,
		NextPageToken: res.NextPageToken,
	}, nil
}

func (h *Handler) GetThread(ctx context.Context, req *aiv1.GetThreadRequest) (*aiv1.Thread, error) {
	v, err := h.aggregator.GetThread(ctx, req.Id)
	if err != nil {
		return nil, err
	}
	return toProtoThread(v.Thread, v.AgentName, v.ModelDisplayName)
}

func (h *Handler) CreateThread(ctx context.Context, req *aiv1.CreateThreadRequest) (*aiv1.Thread, error) {
	var in aiapp.CreateThreadRequest
	if req.Thread != nil {
		th := fromProtoThread(req.Thread)
		in = aiapp.CreateThreadRequest{
			AgentID: th.AgentID,
			ModelID: th.ModelID,
			Title:   th.Title,
			Config:  th.Config,
		}
	}
	created, err := h.coordinator.CreateThread(ctx, &in)
	if err != nil {
		return nil, err
	}
	v, err := h.aggregator.GetThread(ctx, created.ID)
	if err == nil && v != nil {
		return toProtoThread(v.Thread, v.AgentName, v.ModelDisplayName)
	}
	return toProtoThread(created, nil, nil)
}

func (h *Handler) UpdateThread(ctx context.Context, req *aiv1.UpdateThreadRequest) (*aiv1.Thread, error) {
	var mask []string
	if req.UpdateMask != nil {
		mask = req.UpdateMask.Paths
	}
	updated, err := h.coordinator.UpdateThread(ctx, &aiapp.UpdateThreadRequest{
		ID:         req.Id,
		Thread:     fromProtoThread(req.Thread),
		UpdateMask: mask,
	})
	if err != nil {
		return nil, err
	}
	v, err := h.aggregator.GetThread(ctx, updated.ID)
	if err == nil && v != nil {
		return toProtoThread(v.Thread, v.AgentName, v.ModelDisplayName)
	}
	return toProtoThread(updated, nil, nil)
}

func (h *Handler) DeleteThread(ctx context.Context, req *aiv1.DeleteThreadRequest) (*emptypb.Empty, error) {
	if err := h.coordinator.DeleteThread(ctx, req.Id); err != nil {
		return nil, err
	}
	return &emptypb.Empty{}, nil
}

func (h *Handler) ListThreadMessages(ctx context.Context, req *aiv1.ListThreadMessagesRequest) (*aiv1.ListThreadMessagesResponse, error) {
	page, err := h.aggregator.ListThreadMessages(ctx, ai.ListMessagesFilter{
		ThreadID:  req.ThreadId,
		PageSize:  req.PageSize,
		PageToken: req.PageToken,
	})
	if err != nil {
		return nil, err
	}
	pb := make([]*aiv1.ThreadMessage, 0, len(page.Items))
	for _, msg := range page.Items {
		item, cErr := toProtoThreadMessage(msg)
		if cErr != nil {
			return nil, cErr
		}
		pb = append(pb, item)
	}
	return &aiv1.ListThreadMessagesResponse{
		Messages:      pb,
		NextPageToken: page.NextPageToken,
	}, nil
}

func (h *Handler) CancelThreadTurn(ctx context.Context, req *aiv1.CancelThreadTurnRequest) (*aiv1.Thread, error) {
	th, err := h.coordinator.CancelThreadTurn(ctx, req.Id)
	if err != nil {
		return nil, err
	}
	return toProtoThread(th, nil, nil)
}

func (h *Handler) StreamThreadTurn(req *aiv1.StreamThreadTurnRequest, stream grpc.ServerStreamingServer[aiv1.ThreadStreamEvent]) error {
	var sendErr error
	err := h.coordinator.StreamThreadTurn(stream.Context(), &aiapp.StreamThreadTurnRequest{
		ThreadID:    req.Id,
		Content:     req.Content,
		Attachments: fromProtoAttachments(req.Attachments),
		AgentID:     req.AgentId,
		ModelID:     req.ModelId,
		ContextHint: req.ContextHint,
	}, func(ev ai.ThreadStreamEvent) {
		if sendErr != nil {
			return
		}
		pb, cErr := toProtoStreamEvent(ev)
		if cErr != nil {
			sendErr = cErr
			return
		}
		if sErr := stream.Send(pb); sErr != nil {
			sendErr = sErr
		}
	})
	if sendErr != nil {
		return sendErr
	}
	return err
}

func (h *Handler) StreamResolveToolApprovals(req *aiv1.StreamResolveToolApprovalsRequest, stream grpc.ServerStreamingServer[aiv1.ThreadStreamEvent]) error {
	var sendErr error
	err := h.coordinator.ResolveToolApprovals(stream.Context(), &aiapp.ResolveToolApprovalsRequest{
		ThreadID:  req.Id,
		Decisions: fromProtoApprovalDecisions(req.Decisions),
	}, func(ev ai.ThreadStreamEvent) {
		if sendErr != nil {
			return
		}
		pb, cErr := toProtoStreamEvent(ev)
		if cErr != nil {
			sendErr = cErr
			return
		}
		if sErr := stream.Send(pb); sErr != nil {
			sendErr = sErr
		}
	})
	if sendErr != nil {
		return sendErr
	}
	return err
}

func (h *Handler) Generate(ctx context.Context, req *aiv1.GenerateRequest) (*aiv1.Run, error) {
	var rolePtr *ai.ModelRole
	if req.Role != nil && strings.TrimSpace(*req.Role) != "" {
		rolePtr = new(ai.ModelRole(*req.Role))
	}
	var genPtr *ai.GenerationConfig
	if req.Generation != nil {
		genPtr = new(fromProtoGenerationConfig(req.Generation))
	}
	run, err := h.coordinator.Generate(ctx, &aiapp.GenerateRequest{
		Source:            ai.RunSourceAPI,
		Prompt:            req.Prompt,
		SystemInstruction: req.SystemInstruction,
		ModelID:           req.ModelId,
		Role:              rolePtr,
		Generation:        genPtr,
		OutputSchema:      fromStructPB(req.OutputSchema),
		Attachments:       fromProtoAttachments(req.Attachments),
	})
	if err != nil {
		return nil, err
	}
	return toProtoRun(run, nil, nil)
}

func (h *Handler) ListRuns(ctx context.Context, req *aiv1.ListRunsRequest) (*aiv1.ListRunsResponse, error) {
	var kindPtr *ai.RunKind
	if req.Kind != nil && *req.Kind != "" {
		kindPtr = new(ai.RunKind(*req.Kind))
	}
	var srcPtr *ai.RunSource
	if req.Source != nil && *req.Source != "" {
		srcPtr = new(ai.RunSource(*req.Source))
	}
	var statusPtr *ai.RunStatus
	if req.Status != nil && *req.Status != "" {
		statusPtr = new(ai.RunStatus(*req.Status))
	}

	res, err := h.aggregator.ListRuns(ctx, ai.ListRunsFilter{
		Kind:      kindPtr,
		Source:    srcPtr,
		AgentID:   req.AgentId,
		ThreadID:  req.ThreadId,
		Status:    statusPtr,
		PageSize:  req.PageSize,
		PageToken: req.PageToken,
	})
	if err != nil {
		return nil, err
	}
	pb := make([]*aiv1.Run, 0, len(res.Runs))
	for _, v := range res.Runs {
		item, cErr := toProtoRun(v.Run, v.AgentName, nil)
		if cErr != nil {
			return nil, cErr
		}
		pb = append(pb, item)
	}
	return &aiv1.ListRunsResponse{
		Runs:          pb,
		NextPageToken: res.NextPageToken,
	}, nil
}

func (h *Handler) GetRun(ctx context.Context, req *aiv1.GetRunRequest) (*aiv1.Run, error) {
	v, err := h.aggregator.GetRun(ctx, req.Id)
	if err != nil {
		return nil, err
	}
	return toProtoRun(v.Run, v.AgentName, v.Steps)
}
