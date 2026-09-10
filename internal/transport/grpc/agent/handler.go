package agent

import (
	"context"
	"fmt"

	agentv1 "github.com/masterkeysrd/saturn/apis/saturn/platform/agent/v1"
	agentapp "github.com/masterkeysrd/saturn/internal/application/agent"
	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	"github.com/masterkeysrd/saturn/internal/platform/agent"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"google.golang.org/protobuf/types/known/emptypb"
	"google.golang.org/protobuf/types/known/structpb"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// Handler implements the AgentService gRPC interface.
type Handler struct {
	agentv1.UnimplementedAgentServiceServer
	coordinator agentapp.Coordinator
}

// NewHandler creates a new Agent Service Handler.
func NewHandler(coordinator agentapp.Coordinator) *Handler {
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
	const op errors.Op = "grpc/agent.CreateProvider"

	spaceID, ok := auth.SpaceIDFromContext(ctx)
	if !ok {
		return nil, errors.E(op, errors.Unauthenticated, "missing space-id context")
	}

	var urlPtr, keyPtr *string
	if req.ApiUrl != "" {
		urlPtr = new(req.ApiUrl)
	}
	if req.ApiKey != "" {
		keyPtr = new(req.ApiKey)
	}

	p, err := h.coordinator.CreateProvider(ctx, &agentapp.CreateProviderRequest{
		SpaceID:           spaceID,
		Name:              req.GetName(),
		CompatibilityMode: agent.CompatibilityMode(req.GetCompatibilityMode()),
		APIUrl:            urlPtr,
		APIKey:            keyPtr,
	})
	if err != nil {
		return nil, err
	}
	return toProtoLLMProvider(p), nil
}

func (h *Handler) GetProvider(ctx context.Context, req *agentv1.GetProviderRequest) (*agentv1.LLMProvider, error) {
	const op errors.Op = "grpc/agent.GetProvider"

	spaceID, ok := auth.SpaceIDFromContext(ctx)
	if !ok {
		return nil, errors.E(op, errors.Unauthenticated, "missing space-id context")
	}

	p, err := h.coordinator.GetProvider(ctx, spaceID, req.GetId())
	if err != nil {
		return nil, err
	}
	return toProtoLLMProvider(p), nil
}

func (h *Handler) ListProviders(ctx context.Context, _ *emptypb.Empty) (*agentv1.ListProvidersResponse, error) {
	const op errors.Op = "grpc/agent.ListProviders"

	spaceID, ok := auth.SpaceIDFromContext(ctx)
	if !ok {
		return nil, errors.E(op, errors.Unauthenticated, "missing space-id context")
	}

	list, err := h.coordinator.ListProviders(ctx, spaceID)
	if err != nil {
		return nil, err
	}

	res := &agentv1.ListProvidersResponse{}
	for _, p := range list {
		res.Providers = append(res.Providers, toProtoLLMProvider(p))
	}
	return res, nil
}

func (h *Handler) UpdateProvider(ctx context.Context, req *agentv1.UpdateProviderRequest) (*agentv1.LLMProvider, error) {
	const op errors.Op = "grpc/agent.UpdateProvider"

	spaceID, ok := auth.SpaceIDFromContext(ctx)
	if !ok {
		return nil, errors.E(op, errors.Unauthenticated, "missing space-id context")
	}

	var urlPtr, keyPtr *string
	if req.ApiUrl != "" {
		urlPtr = new(req.ApiUrl)
	}
	if req.ApiKey != "" {
		keyPtr = new(req.ApiKey)
	}

	p, err := h.coordinator.UpdateProvider(ctx, &agentapp.UpdateProviderRequest{
		SpaceID: spaceID,
		ID:      req.GetId(),
		Name:    req.GetName(),
		APIUrl:  urlPtr,
		APIKey:  keyPtr,
	})
	if err != nil {
		return nil, err
	}
	return toProtoLLMProvider(p), nil
}

func (h *Handler) DeleteProvider(ctx context.Context, req *agentv1.DeleteProviderRequest) (*emptypb.Empty, error) {
	const op errors.Op = "grpc/agent.DeleteProvider"

	spaceID, ok := auth.SpaceIDFromContext(ctx)
	if !ok {
		return nil, errors.E(op, errors.Unauthenticated, "missing space-id context")
	}

	err := h.coordinator.DeleteProvider(ctx, spaceID, req.GetId())
	if err != nil {
		return nil, err
	}
	return &emptypb.Empty{}, nil
}

// Agent Instance Operations

func (h *Handler) CreateAgent(ctx context.Context, req *agentv1.CreateAgentRequest) (*agentv1.Agent, error) {
	const op errors.Op = "grpc/agent.CreateAgent"

	spaceID, ok := auth.SpaceIDFromContext(ctx)
	if !ok {
		return nil, errors.E(op, errors.Unauthenticated, "missing space-id context")
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

	a, err := h.coordinator.CreateAgent(ctx, &agentapp.CreateAgentRequest{
		SpaceID:           spaceID,
		LLMProviderID:     provPtr,
		Name:              req.GetName(),
		Description:       descPtr,
		Purpose:           req.GetPurpose(),
		Tags:              req.GetTags(),
		ModelName:         req.GetModelName(),
		SystemInstruction: sysPtr,
		Temperature:       req.GetTemperature(),
	})
	if err != nil {
		return nil, err
	}
	return toProtoAgent(a), nil
}

func (h *Handler) GetAgent(ctx context.Context, req *agentv1.GetAgentRequest) (*agentv1.Agent, error) {
	const op errors.Op = "grpc/agent.GetAgent"

	spaceID, ok := auth.SpaceIDFromContext(ctx)
	if !ok {
		return nil, errors.E(op, errors.Unauthenticated, "missing space-id context")
	}

	a, err := h.coordinator.GetAgent(ctx, spaceID, req.GetId())
	if err != nil {
		return nil, err
	}
	return toProtoAgent(a), nil
}

func (h *Handler) ListAgents(ctx context.Context, _ *emptypb.Empty) (*agentv1.ListAgentsResponse, error) {
	const op errors.Op = "grpc/agent.ListAgents"

	spaceID, ok := auth.SpaceIDFromContext(ctx)
	if !ok {
		return nil, errors.E(op, errors.Unauthenticated, "missing space-id context")
	}

	list, err := h.coordinator.ListAgents(ctx, spaceID)
	if err != nil {
		return nil, err
	}

	res := &agentv1.ListAgentsResponse{}
	for _, a := range list {
		res.Agents = append(res.Agents, toProtoAgent(a))
	}
	return res, nil
}

func (h *Handler) UpdateAgent(ctx context.Context, req *agentv1.UpdateAgentRequest) (*agentv1.Agent, error) {
	const op errors.Op = "grpc/agent.UpdateAgent"

	spaceID, ok := auth.SpaceIDFromContext(ctx)
	if !ok {
		return nil, errors.E(op, errors.Unauthenticated, "missing space-id context")
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

	a, err := h.coordinator.UpdateAgent(ctx, &agentapp.UpdateAgentRequest{
		SpaceID:           spaceID,
		ID:                req.GetId(),
		LLMProviderID:     provPtr,
		Name:              req.GetName(),
		Description:       descPtr,
		Tags:              req.GetTags(),
		ModelName:         req.GetModelName(),
		SystemInstruction: sysPtr,
		Temperature:       req.GetTemperature(),
		IsEnabled:         req.GetIsEnabled(),
	})
	if err != nil {
		return nil, err
	}
	return toProtoAgent(a), nil
}

func (h *Handler) DeleteAgent(ctx context.Context, req *agentv1.DeleteAgentRequest) (*emptypb.Empty, error) {
	const op errors.Op = "grpc/agent.DeleteAgent"

	spaceID, ok := auth.SpaceIDFromContext(ctx)
	if !ok {
		return nil, errors.E(op, errors.Unauthenticated, "missing space-id context")
	}

	err := h.coordinator.DeleteAgent(ctx, spaceID, req.GetId())
	if err != nil {
		return nil, err
	}
	return &emptypb.Empty{}, nil
}

// Catalog and Audit Logs Operations

func (h *Handler) ListAgentRuns(ctx context.Context, req *agentv1.ListAgentRunsRequest) (*agentv1.ListAgentRunsResponse, error) {
	const op errors.Op = "grpc/agent.ListAgentRuns"

	spaceID, ok := auth.SpaceIDFromContext(ctx)
	if !ok {
		return nil, errors.E(op, errors.Unauthenticated, "missing space-id context")
	}

	page, err := h.coordinator.ListRuns(ctx, agent.ListAgentRuns{
		SpaceID:   spaceID,
		AgentID:   req.GetAgentId(),
		PageSize:  req.GetPageSize(),
		PageToken: req.GetPageToken(),
	})
	if err != nil {
		return nil, err
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
	const op errors.Op = "grpc/agent.GetSuggestions"

	spaceID, ok := auth.SpaceIDFromContext(ctx)
	if !ok {
		return nil, errors.E(op, errors.Unauthenticated, "missing space-id context")
	}

	if req.GetPurpose() == "" {
		return nil, errors.E(op, errors.Invalid, "purpose is required")
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
		return nil, err
	}

	stStruct, err := structpb.NewStruct(resMap)
	if err != nil {
		return nil, errors.E(op, errors.Internal, fmt.Errorf("encode structured suggestion: %w", err))
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
