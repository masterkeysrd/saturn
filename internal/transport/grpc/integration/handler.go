package integration

import (
	"context"
	"encoding/json"

	integrationv1 "github.com/masterkeysrd/saturn/apis/saturn/platform/integration/v1"
	integrationapp "github.com/masterkeysrd/saturn/internal/application/integration"
	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	"github.com/masterkeysrd/saturn/internal/platform/integration"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/emptypb"
	"google.golang.org/protobuf/types/known/structpb"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// Handler implements the IntegrationService gRPC API by delegating workflows
// to the integrations application Coordinator.
type Handler struct {
	integrationv1.UnimplementedIntegrationServiceServer
	coordinator *integrationapp.Coordinator
}

// NewHandler creates a new Integration service handler.
func NewHandler(coordinator *integrationapp.Coordinator) *Handler {
	return &Handler{
		coordinator: coordinator,
	}
}

func toProtoIntegration(i *integration.Integration, rawToken string) *integrationv1.Integration {
	return &integrationv1.Integration{
		Id:         i.ID,
		SpaceId:    i.SpaceID,
		Kind:       i.Kind,
		Provider:   i.Provider,
		Token:      rawToken,
		ConfigJson: i.Config,
		IsEnabled:  i.IsEnabled,
		CreateTime: timestamppb.New(i.CreateTime),
		UpdateTime: timestamppb.New(i.UpdateTime),
	}
}

func (h *Handler) GetIntegration(ctx context.Context, req *integrationv1.GetIntegrationRequest) (*integrationv1.Integration, error) {
	if req.GetProvider() == "" {
		return nil, status.Error(codes.InvalidArgument, "provider is required")
	}

	spaceID, ok := auth.SpaceIDFromContext(ctx)
	if !ok {
		return nil, status.Error(codes.Unauthenticated, "missing space-id context")
	}

	i, err := h.coordinator.Get(ctx, integration.GetIntegration{
		SpaceID:  spaceID,
		Provider: req.GetProvider(),
		Kind:     req.GetKind(),
	})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "get integration: %v", err)
	}
	if i == nil {
		return nil, status.Errorf(codes.NotFound, "integration not found for provider %s", req.GetProvider())
	}

	return toProtoIntegration(i, ""), nil
}

func (h *Handler) ConfigureIntegration(ctx context.Context, req *integrationv1.ConfigureIntegrationRequest) (*integrationv1.Integration, error) {
	if req.GetProvider() == "" {
		return nil, status.Error(codes.InvalidArgument, "provider is required")
	}
	if req.GetKind() == "" {
		return nil, status.Error(codes.InvalidArgument, "kind is required")
	}
	if req.GetConfigJson() == "" {
		return nil, status.Error(codes.InvalidArgument, "config_json is required")
	}

	spaceID, ok := auth.SpaceIDFromContext(ctx)
	if !ok {
		return nil, status.Error(codes.Unauthenticated, "missing space-id context")
	}

	i, rawToken, err := h.coordinator.Configure(ctx, integration.ConfigureIntegration{
		SpaceID:    spaceID,
		Kind:       req.GetKind(),
		Provider:   req.GetProvider(),
		ConfigJSON: req.GetConfigJson(),
		IsEnabled:  req.GetIsEnabled(),
	})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "configure integration: %v", err)
	}

	return toProtoIntegration(i, rawToken), nil
}

func (h *Handler) SimulateWebhook(ctx context.Context, req *integrationv1.SimulateWebhookRequest) (*integrationv1.SimulateWebhookResponse, error) {
	if req.GetProvider() == "" {
		return nil, status.Error(codes.InvalidArgument, "provider is required")
	}
	if req.GetPayload() == "" {
		return nil, status.Error(codes.InvalidArgument, "payload is required")
	}

	spaceID, ok := auth.SpaceIDFromContext(ctx)
	if !ok {
		return nil, status.Error(codes.Unauthenticated, "missing space-id context")
	}

	processHeaders := make(map[string][]string)
	for k, v := range req.GetHeaders() {
		processHeaders[k] = []string{v}
	}

	ibx, err := h.coordinator.SimulateWebhook(ctx, spaceID, req.GetProvider(), req.GetKind(), processHeaders, []byte(req.GetPayload()))
	if err != nil {
		return nil, status.Errorf(codes.Internal, "simulation failed: %v", err)
	}

	var resultStruct *structpb.Struct
	if ibx != nil {
		jsonBytes, err := json.Marshal(ibx)
		if err == nil {
			var m map[string]any
			if json.Unmarshal(jsonBytes, &m) == nil {
				resultStruct, _ = structpb.NewStruct(m)
			}
		}
	}

	return &integrationv1.SimulateWebhookResponse{
		Success: true,
		Message: "Simulation successfully processed",
		Result:  resultStruct,
	}, nil
}

func (h *Handler) ListCatalog(ctx context.Context, _ *emptypb.Empty) (*integrationv1.ListCatalogResponse, error) {
	_, ok := auth.SpaceIDFromContext(ctx)
	if !ok {
		return nil, status.Error(codes.Unauthenticated, "missing space-id context")
	}

	catalog := h.coordinator.ListCatalog()
	descriptors := make([]*integrationv1.CatalogDescriptor, 0, len(catalog))
	for _, desc := range catalog {
		descriptors = append(descriptors, &integrationv1.CatalogDescriptor{
			Provider:       desc.Provider,
			Kind:           desc.Kind,
			Name:           desc.Name,
			Description:    desc.Description,
			Icon:           desc.Icon,
			ConfigSchema:   desc.ConfigSchema,
			RequestSchema:  desc.RequestSchema,
			ResponseSchema: desc.ResponseSchema,
			SamplePayload:  desc.SamplePayload,
		})
	}

	return &integrationv1.ListCatalogResponse{Catalog: descriptors}, nil
}

func (h *Handler) ListIntegrations(ctx context.Context, _ *emptypb.Empty) (*integrationv1.ListIntegrationsResponse, error) {
	spaceID, ok := auth.SpaceIDFromContext(ctx)
	if !ok {
		return nil, status.Error(codes.Unauthenticated, "missing space-id context")
	}

	list, err := h.coordinator.List(ctx, spaceID)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "list integrations: %v", err)
	}

	protoList := make([]*integrationv1.Integration, 0, len(list))
	for _, item := range list {
		protoList = append(protoList, toProtoIntegration(item, ""))
	}

	return &integrationv1.ListIntegrationsResponse{Integrations: protoList}, nil
}

func toProtoIntegrationToken(t *integration.IntegrationToken) *integrationv1.IntegrationToken {
	var lastUsed *timestamppb.Timestamp
	if t.LastUsedTime != nil {
		lastUsed = timestamppb.New(*t.LastUsedTime)
	}
	return &integrationv1.IntegrationToken{
		Id:            t.ID,
		IntegrationId: t.IntegrationID,
		Name:          t.Name,
		TokenHash:     t.TokenHash,
		CreateTime:    timestamppb.New(t.CreateTime),
		LastUsedTime:  lastUsed,
	}
}

func (h *Handler) CreateIntegrationToken(ctx context.Context, req *integrationv1.CreateIntegrationTokenRequest) (*integrationv1.CreateIntegrationTokenResponse, error) {
	if req.GetProvider() == "" {
		return nil, status.Error(codes.InvalidArgument, "provider is required")
	}
	if req.GetName() == "" {
		return nil, status.Error(codes.InvalidArgument, "name is required")
	}

	spaceID, ok := auth.SpaceIDFromContext(ctx)
	if !ok {
		return nil, status.Error(codes.Unauthenticated, "missing space-id context")
	}

	token, rawToken, err := h.coordinator.CreateToken(ctx, integration.GetIntegration{
		SpaceID:  spaceID,
		Provider: req.GetProvider(),
		Kind:     req.GetKind(),
	}, req.GetName())
	if err != nil {
		return nil, status.Errorf(codes.Internal, "create token: %v", err)
	}

	return &integrationv1.CreateIntegrationTokenResponse{
		Token:    toProtoIntegrationToken(token),
		RawToken: rawToken,
	}, nil
}

func (h *Handler) ListIntegrationTokens(ctx context.Context, req *integrationv1.ListIntegrationTokensRequest) (*integrationv1.ListIntegrationTokensResponse, error) {
	if req.GetProvider() == "" {
		return nil, status.Error(codes.InvalidArgument, "provider is required")
	}

	spaceID, ok := auth.SpaceIDFromContext(ctx)
	if !ok {
		return nil, status.Error(codes.Unauthenticated, "missing space-id context")
	}

	tokens, err := h.coordinator.ListTokens(ctx, integration.GetIntegration{
		SpaceID:  spaceID,
		Provider: req.GetProvider(),
		Kind:     req.GetKind(),
	})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "list tokens: %v", err)
	}

	protoTokens := make([]*integrationv1.IntegrationToken, 0, len(tokens))
	for _, t := range tokens {
		protoTokens = append(protoTokens, toProtoIntegrationToken(t))
	}

	return &integrationv1.ListIntegrationTokensResponse{Tokens: protoTokens}, nil
}

func (h *Handler) DeleteIntegrationToken(ctx context.Context, req *integrationv1.DeleteIntegrationTokenRequest) (*emptypb.Empty, error) {
	if req.GetProvider() == "" {
		return nil, status.Error(codes.InvalidArgument, "provider is required")
	}
	if req.GetId() == "" {
		return nil, status.Error(codes.InvalidArgument, "id is required")
	}

	spaceID, ok := auth.SpaceIDFromContext(ctx)
	if !ok {
		return nil, status.Error(codes.Unauthenticated, "missing space-id context")
	}

	err := h.coordinator.DeleteToken(ctx, integration.GetIntegration{
		SpaceID:  spaceID,
		Provider: req.GetProvider(),
		Kind:     req.GetKind(),
	}, req.GetId())
	if err != nil {
		return nil, status.Errorf(codes.Internal, "delete token: %v", err)
	}

	return &emptypb.Empty{}, nil
}
