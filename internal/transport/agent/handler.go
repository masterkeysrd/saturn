package agent

import (
	"context"
	"log/slog"

	agentv1 "github.com/masterkeysrd/saturn/apis/saturn/platform/agent/v1"
	agentapp "github.com/masterkeysrd/saturn/internal/application/agent"
	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	"github.com/masterkeysrd/saturn/internal/platform/agent"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/emptypb"
	"google.golang.org/protobuf/types/known/structpb"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// Handler implements the AgentService gRPC interface.
type Handler struct {
	agentv1.UnimplementedAgentServiceServer
	coordinator *agentapp.Coordinator
}

// NewHandler creates a new Agent Service Handler.
func NewHandler(coordinator *agentapp.Coordinator) *Handler {
	return &Handler{
		coordinator: coordinator,
	}
}

// Mappings helpers

func toProtoLLMProvider(p *agent.LLMProvider) *agentv1.LLMProvider {
	apiUrl := ""
	if p.APIUrl != nil {
		apiUrl = *p.APIUrl
	}
	apiKeyPlaceholder := ""
	if p.APIKey != nil && *p.APIKey != "" {
		apiKeyPlaceholder = "••••••••••••"
	}
	return &agentv1.LLMProvider{
		Id:                p.ID,
		SpaceId:           p.SpaceID,
		Name:              p.Name,
		CompatibilityMode: string(p.CompatibilityMode),
		ApiUrl:            apiUrl,
		ApiKey:            apiKeyPlaceholder,
		CreateTime:        timestamppb.New(p.CreateTime),
		UpdateTime:        timestamppb.New(p.UpdateTime),
	}
}

func toProtoAgent(a *agent.Agent) *agentv1.Agent {
	desc := ""
	if a.Description != nil {
		desc = *a.Description
	}
	llmProviderID := ""
	if a.LLMProviderID != nil {
		llmProviderID = *a.LLMProviderID
	}
	sysInstruction := ""
	if a.SystemInstruction != nil {
		sysInstruction = *a.SystemInstruction
	}
	return &agentv1.Agent{
		Id:                a.ID,
		SpaceId:           a.SpaceID,
		LlmProviderId:     llmProviderID,
		Name:              a.Name,
		Description:       desc,
		Purpose:           a.Purpose,
		Tags:              []string(a.Tags),
		ModelName:         a.ModelName,
		SystemInstruction: sysInstruction,
		Temperature:       a.Temperature,
		IsEnabled:         a.IsEnabled,
		CreateTime:        timestamppb.New(a.CreateTime),
		UpdateTime:        timestamppb.New(a.UpdateTime),
	}
}

func toProtoAgentRun(r *agent.AgentRun) *agentv1.AgentRun {
	outputRaw := ""
	if r.OutputRaw != nil {
		outputRaw = *r.OutputRaw
	}
	errMsg := ""
	if r.ErrorMessage != nil {
		errMsg = *r.ErrorMessage
	}
	return &agentv1.AgentRun{
		Id:           r.ID,
		AgentId:      r.AgentID,
		SpaceId:      r.SpaceID,
		Status:       string(r.Status),
		InputRaw:     r.InputRaw,
		OutputRaw:    outputRaw,
		ErrorMessage: errMsg,
		TokensUsed:   int32(r.TokensUsed),
		CreateTime:   timestamppb.New(r.CreateTime),
	}
}

// LLM Provider Operations

func (h *Handler) CreateProvider(ctx context.Context, req *agentv1.CreateProviderRequest) (*agentv1.LLMProvider, error) {
	spaceID, ok := auth.SpaceIDFromContext(ctx)
	if !ok {
		return nil, status.Error(codes.Unauthenticated, "missing space-id context")
	}

	var urlPtr, keyPtr *string
	if req.ApiUrl != "" {
		urlPtr = new(req.ApiUrl)
	}
	if req.ApiKey != "" {
		keyPtr = new(req.ApiKey)
	}

	p, err := h.coordinator.GetStore().CreateProvider(ctx, spaceID, req.GetName(), agent.CompatibilityMode(req.GetCompatibilityMode()), urlPtr, keyPtr)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "create provider: %v", err)
	}
	return toProtoLLMProvider(p), nil
}

func (h *Handler) GetProvider(ctx context.Context, req *agentv1.GetProviderRequest) (*agentv1.LLMProvider, error) {
	spaceID, ok := auth.SpaceIDFromContext(ctx)
	if !ok {
		return nil, status.Error(codes.Unauthenticated, "missing space-id context")
	}

	p, err := h.coordinator.GetStore().GetProvider(ctx, agent.GetLLMProvider{SpaceID: spaceID, ID: req.GetId()})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "get provider: %v", err)
	}
	if p == nil {
		return nil, status.Errorf(codes.NotFound, "llm provider %s not found", req.GetId())
	}
	return toProtoLLMProvider(p), nil
}

func (h *Handler) ListProviders(ctx context.Context, _ *emptypb.Empty) (*agentv1.ListProvidersResponse, error) {
	slog.Info("[Handler.ListProviders] Request received")
	spaceID, ok := auth.SpaceIDFromContext(ctx)
	if !ok {
		slog.Warn("[Handler.ListProviders] Missing space-id context")
		return nil, status.Error(codes.Unauthenticated, "missing space-id context")
	}
	slog.Info("[Handler.ListProviders] Resolved space-id", "spaceID", spaceID)

	list, err := h.coordinator.GetStore().ListProviders(ctx, spaceID)
	if err != nil {
		slog.Error("[Handler.ListProviders] Failed to query providers", "err", err)
		return nil, status.Errorf(codes.Internal, "list providers: %v", err)
	}
	slog.Info("[Handler.ListProviders] Successfully fetched providers", "count", len(list))

	res := &agentv1.ListProvidersResponse{}
	for _, p := range list {
		res.Providers = append(res.Providers, toProtoLLMProvider(p))
	}
	return res, nil
}

func (h *Handler) UpdateProvider(ctx context.Context, req *agentv1.UpdateProviderRequest) (*agentv1.LLMProvider, error) {
	spaceID, ok := auth.SpaceIDFromContext(ctx)
	if !ok {
		return nil, status.Error(codes.Unauthenticated, "missing space-id context")
	}

	var urlPtr, keyPtr *string
	if req.ApiUrl != "" {
		urlPtr = new(req.ApiUrl)
	}
	if req.ApiKey != "" {
		keyPtr = new(req.ApiKey)
	}

	p, err := h.coordinator.GetStore().UpdateProvider(ctx, spaceID, req.GetId(), req.GetName(), urlPtr, keyPtr)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "update provider: %v", err)
	}
	return toProtoLLMProvider(p), nil
}

func (h *Handler) DeleteProvider(ctx context.Context, req *agentv1.DeleteProviderRequest) (*emptypb.Empty, error) {
	spaceID, ok := auth.SpaceIDFromContext(ctx)
	if !ok {
		return nil, status.Error(codes.Unauthenticated, "missing space-id context")
	}

	err := h.coordinator.GetStore().DeleteProvider(ctx, spaceID, req.GetId())
	if err != nil {
		return nil, status.Errorf(codes.Internal, "delete provider: %v", err)
	}
	return &emptypb.Empty{}, nil
}

// Agent Instance Operations

func (h *Handler) CreateAgent(ctx context.Context, req *agentv1.CreateAgentRequest) (*agentv1.Agent, error) {
	spaceID, ok := auth.SpaceIDFromContext(ctx)
	if !ok {
		return nil, status.Error(codes.Unauthenticated, "missing space-id context")
	}

	// Detect if an agent configuration for this purpose already exists
	existing, err := h.coordinator.GetStore().GetAgent(ctx, agent.GetAgent{SpaceID: spaceID, Purpose: req.GetPurpose()})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "check existing agent: %v", err)
	}
	if existing != nil {
		return nil, status.Error(codes.AlreadyExists, "an agent configuration for this purpose already exists in this workspace")
	}

	var provPtr *string
	if req.GetLlmProviderId() != "" {
		val := req.GetLlmProviderId()
		provPtr = &val
	}
	var descPtr *string
	if req.GetDescription() != "" {
		val := req.GetDescription()
		descPtr = &val
	}
	var sysPtr *string
	if req.GetSystemInstruction() != "" {
		val := req.GetSystemInstruction()
		sysPtr = &val
	}

	a, err := h.coordinator.GetStore().CreateAgent(ctx, spaceID, provPtr, req.GetName(), descPtr, req.GetPurpose(), req.GetTags(), req.GetModelName(), sysPtr, req.GetTemperature())
	if err != nil {
		return nil, status.Errorf(codes.Internal, "create agent: %v", err)
	}
	return toProtoAgent(a), nil
}

func (h *Handler) GetAgent(ctx context.Context, req *agentv1.GetAgentRequest) (*agentv1.Agent, error) {
	spaceID, ok := auth.SpaceIDFromContext(ctx)
	if !ok {
		return nil, status.Error(codes.Unauthenticated, "missing space-id context")
	}

	a, err := h.coordinator.GetStore().GetAgent(ctx, agent.GetAgent{SpaceID: spaceID, ID: req.GetId()})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "get agent: %v", err)
	}
	if a == nil {
		return nil, status.Errorf(codes.NotFound, "agent %s not found", req.GetId())
	}
	return toProtoAgent(a), nil
}

func (h *Handler) ListAgents(ctx context.Context, _ *emptypb.Empty) (*agentv1.ListAgentsResponse, error) {
	spaceID, ok := auth.SpaceIDFromContext(ctx)
	if !ok {
		return nil, status.Error(codes.Unauthenticated, "missing space-id context")
	}

	list, err := h.coordinator.GetStore().ListAgents(ctx, spaceID)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "list agents: %v", err)
	}

	res := &agentv1.ListAgentsResponse{}
	for _, a := range list {
		res.Agents = append(res.Agents, toProtoAgent(a))
	}
	return res, nil
}

func (h *Handler) UpdateAgent(ctx context.Context, req *agentv1.UpdateAgentRequest) (*agentv1.Agent, error) {
	spaceID, ok := auth.SpaceIDFromContext(ctx)
	if !ok {
		return nil, status.Error(codes.Unauthenticated, "missing space-id context")
	}

	var provPtr *string
	if req.GetLlmProviderId() != "" {
		val := req.GetLlmProviderId()
		provPtr = &val
	}
	var descPtr *string
	if req.GetDescription() != "" {
		val := req.GetDescription()
		descPtr = &val
	}
	var sysPtr *string
	if req.GetSystemInstruction() != "" {
		val := req.GetSystemInstruction()
		sysPtr = &val
	}

	a, err := h.coordinator.GetStore().UpdateAgent(ctx, spaceID, req.GetId(), provPtr, req.GetName(), descPtr, req.GetTags(), req.GetModelName(), sysPtr, req.GetTemperature(), req.GetIsEnabled())
	if err != nil {
		return nil, status.Errorf(codes.Internal, "update agent: %v", err)
	}
	return toProtoAgent(a), nil
}

func (h *Handler) DeleteAgent(ctx context.Context, req *agentv1.DeleteAgentRequest) (*emptypb.Empty, error) {
	spaceID, ok := auth.SpaceIDFromContext(ctx)
	if !ok {
		return nil, status.Error(codes.Unauthenticated, "missing space-id context")
	}

	err := h.coordinator.GetStore().DeleteAgent(ctx, spaceID, req.GetId())
	if err != nil {
		return nil, status.Errorf(codes.Internal, "delete agent: %v", err)
	}
	return &emptypb.Empty{}, nil
}

// Catalog and Audit Logs Operations

func (h *Handler) ListAgentRuns(ctx context.Context, req *agentv1.ListAgentRunsRequest) (*agentv1.ListAgentRunsResponse, error) {
	spaceID, ok := auth.SpaceIDFromContext(ctx)
	if !ok {
		return nil, status.Error(codes.Unauthenticated, "missing space-id context")
	}

	page, err := h.coordinator.GetStore().ListRuns(ctx, agent.ListAgentRuns{
		SpaceID:   spaceID,
		AgentID:   req.GetAgentId(),
		PageSize:  req.GetPageSize(),
		PageToken: req.GetPageToken(),
	})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "list agent runs: %v", err)
	}

	res := &agentv1.ListAgentRunsResponse{
		NextPageToken: page.NextPageToken,
	}
	for _, r := range page.Items {
		res.Runs = append(res.Runs, toProtoAgentRun(r))
	}
	return res, nil
}

func (h *Handler) GetAgentCatalog(ctx context.Context, _ *emptypb.Empty) (*agentv1.GetAgentCatalogResponse, error) {
	catalog := agent.GetAgentCatalog()
	res := &agentv1.GetAgentCatalogResponse{}
	for _, desc := range catalog {
		res.Blueprints = append(res.Blueprints, &agentv1.AgentBlueprintDescriptor{
			Purpose:                  desc.Purpose,
			DisplayName:              desc.DisplayName,
			Description:              desc.Description,
			DefaultTags:              desc.DefaultTags,
			DefaultSystemInstruction: desc.DefaultSystemInstruction,
			RequiredResponseSchema:   desc.RequiredResponseSchema,
		})
	}
	return res, nil
}

func (h *Handler) GetProviderCatalog(ctx context.Context, _ *emptypb.Empty) (*agentv1.GetProviderCatalogResponse, error) {
	catalog := agent.GetProviderCatalog()
	res := &agentv1.GetProviderCatalogResponse{}
	for _, desc := range catalog {
		res.Blueprints = append(res.Blueprints, &agentv1.ProviderBlueprintDescriptor{
			Id:                desc.ID,
			DisplayName:       desc.DisplayName,
			Description:       desc.Description,
			CompatibilityMode: string(desc.CompatibilityMode),
			DefaultApiUrl:     desc.DefaultAPIUrl,
			IsApiKeyRequired:  desc.IsAPIKeyRequired,
			LogoIcon:          desc.LogoIcon,
		})
	}
	return res, nil
}

func (h *Handler) GetSuggestions(ctx context.Context, req *agentv1.GetSuggestionsRequest) (*agentv1.GetSuggestionsResponse, error) {
	spaceID, ok := auth.SpaceIDFromContext(ctx)
	if !ok {
		return nil, status.Error(codes.Unauthenticated, "unauthenticated")
	}

	if req.GetPurpose() == "" {
		return nil, status.Error(codes.InvalidArgument, "purpose is required")
	}

	docs := make([]agentapp.DocumentFile, len(req.GetDocuments()))
	for i, d := range req.GetDocuments() {
		docs[i] = agentapp.DocumentFile{
			Filename:    d.GetFilename(),
			ContentType: d.GetContentType(),
			Content:     d.GetContent(),
		}
	}

	appReq := &agentapp.SuggestionRequest{
		TextContent: req.GetTextContent(),
		Documents:   docs,
	}

	resMap, err := h.coordinator.GetSuggestions(ctx, string(spaceID), req.GetPurpose(), appReq)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "process suggestions: %v", err)
	}

	stStruct, err := structpb.NewStruct(resMap)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "encode structured suggestion: %v", err)
	}

	rawOutput := ""
	if vendor, ok := resMap["vendor"].(string); ok {
		rawOutput = vendor
	}

	return &agentv1.GetSuggestionsResponse{
		RawOutput:            rawOutput,
		StructuredSuggestion: stStruct,
	}, nil
}
