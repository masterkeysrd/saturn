package connector

import (
	"context"

	connectorv1 "github.com/masterkeysrd/saturn/apis/saturn/platform/connector/v1"
	connectorapp "github.com/masterkeysrd/saturn/internal/application/connector"
	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	"github.com/masterkeysrd/saturn/internal/platform/connector"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"google.golang.org/protobuf/types/known/emptypb"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// Handler implements the ConnectorService gRPC API by delegating workflows
// to the connector application Coordinator.
type Handler struct {
	connectorv1.UnimplementedConnectorServiceServer
	coordinator connectorapp.Coordinator
}

// NewHandler creates a new ConnectorService gRPC handler.
func NewHandler(coordinator connectorapp.Coordinator) *Handler {
	return &Handler{
		coordinator: coordinator,
	}
}

var _ connectorv1.ConnectorServiceServer = (*Handler)(nil)

func (h *Handler) ListProviders(ctx context.Context, _ *connectorv1.ListProvidersRequest) (*connectorv1.ListProvidersResponse, error) {
	descriptors, err := h.coordinator.ListProviders(ctx)
	if err != nil {
		return nil, err
	}

	res := make([]*connectorv1.ProviderDescriptor, len(descriptors))
	for i, d := range descriptors {
		res[i] = &connectorv1.ProviderDescriptor{
			Id:                    d.ID,
			DisplayName:           d.DisplayName,
			SupportedCapabilities: d.SupportedCapabilities,
			IconUrl:               d.IconURL,
		}
	}

	return &connectorv1.ListProvidersResponse{
		Providers: res,
	}, nil
}

func (h *Handler) InitiateOAuth(ctx context.Context, req *connectorv1.InitiateOAuthRequest) (*connectorv1.InitiateOAuthResponse, error) {
	const op errors.Op = "grpc/connector.InitiateOAuth"

	spaceID, ok := auth.SpaceIDFromContext(ctx)
	if !ok {
		return nil, errors.E(op, errors.Unauthenticated, "missing space-id context")
	}

	var userID string
	if principal, ok := auth.PrincipalFromContext(ctx); ok {
		userID = principal.Subject
	}

	res, err := h.coordinator.InitiateOAuth(ctx, &connectorapp.InitiateOAuthRequest{
		SpaceID:            spaceID,
		UserID:             userID,
		Provider:           req.GetProvider(),
		ReturnURL:          req.GetReturnUrl(),
		Capabilities:       req.GetCapabilities(),
		ConnectedAccountID: req.ConnectedAccountId,
	})
	if err != nil {
		return nil, err
	}

	return &connectorv1.InitiateOAuthResponse{
		AuthUrl: res.AuthURL,
		State:   res.State,
	}, nil
}

func (h *Handler) ListConnectedAccounts(ctx context.Context, req *connectorv1.ListConnectedAccountsRequest) (*connectorv1.ListConnectedAccountsResponse, error) {
	const op errors.Op = "grpc/connector.ListConnectedAccounts"

	spaceID, ok := auth.SpaceIDFromContext(ctx)
	if !ok {
		return nil, errors.E(op, errors.Unauthenticated, "missing space-id context")
	}

	var provider string
	if req.Provider != nil {
		provider = req.GetProvider()
	}

	accounts, err := h.coordinator.ListConnectedAccounts(ctx, &connectorapp.ListConnectedAccountsRequest{
		SpaceID:  spaceID,
		Provider: provider,
	})
	if err != nil {
		return nil, err
	}

	protoAccounts := make([]*connectorv1.ConnectedAccount, len(accounts))
	for i, a := range accounts {
		protoAccounts[i] = toProtoConnectedAccount(a)
	}

	return &connectorv1.ListConnectedAccountsResponse{
		Accounts: protoAccounts,
	}, nil
}

func (h *Handler) GetConnectedAccount(ctx context.Context, req *connectorv1.GetConnectedAccountRequest) (*connectorv1.ConnectedAccount, error) {
	const op errors.Op = "grpc/connector.GetConnectedAccount"

	spaceID, ok := auth.SpaceIDFromContext(ctx)
	if !ok {
		return nil, errors.E(op, errors.Unauthenticated, "missing space-id context")
	}

	account, err := h.coordinator.GetConnectedAccount(ctx, &connectorapp.GetConnectedAccountRequest{
		SpaceID:   spaceID,
		AccountID: req.GetId(),
	})
	if err != nil {
		return nil, err
	}

	return toProtoConnectedAccount(account), nil
}

func (h *Handler) UpdateConnectedAccount(ctx context.Context, req *connectorv1.UpdateConnectedAccountRequest) (*connectorv1.ConnectedAccount, error) {
	const op errors.Op = "grpc/connector.UpdateConnectedAccount"

	spaceID, ok := auth.SpaceIDFromContext(ctx)
	if !ok {
		return nil, errors.E(op, errors.Unauthenticated, "missing space-id context")
	}

	accountID := req.GetId()
	if accountID == "" && req.GetAccount() != nil {
		accountID = req.GetAccount().GetId()
	}

	var appAccount *connector.ConnectedAccount
	if protoAcc := req.GetAccount(); protoAcc != nil {
		appAccount = &connector.ConnectedAccount{
			ID:                  accountID,
			SpaceID:             spaceID,
			DisplayName:         protoAcc.DisplayName,
			Color:               protoAcc.Color,
			EnabledCapabilities: protoAcc.GetEnabledCapabilities(),
		}
	}

	var updateMask []string
	if req.GetUpdateMask() != nil {
		updateMask = req.GetUpdateMask().GetPaths()
	}

	updated, err := h.coordinator.UpdateConnectedAccount(ctx, &connectorapp.UpdateConnectedAccountRequest{
		SpaceID:    spaceID,
		AccountID:  accountID,
		Account:    appAccount,
		UpdateMask: updateMask,
	})
	if err != nil {
		return nil, err
	}

	return toProtoConnectedAccount(updated), nil
}

func (h *Handler) DeleteConnectedAccount(ctx context.Context, req *connectorv1.DeleteConnectedAccountRequest) (*emptypb.Empty, error) {
	const op errors.Op = "grpc/connector.DeleteConnectedAccount"

	spaceID, ok := auth.SpaceIDFromContext(ctx)
	if !ok {
		return nil, errors.E(op, errors.Unauthenticated, "missing space-id context")
	}

	if err := h.coordinator.DeleteConnectedAccount(ctx, &connectorapp.DeleteConnectedAccountRequest{
		SpaceID:   spaceID,
		AccountID: req.GetId(),
	}); err != nil {
		return nil, err
	}

	return &emptypb.Empty{}, nil
}

func (h *Handler) SyncConnectedAccount(ctx context.Context, req *connectorv1.SyncConnectedAccountRequest) (*connectorv1.SyncConnectedAccountResponse, error) {
	const op errors.Op = "grpc/connector.SyncConnectedAccount"

	spaceID, ok := auth.SpaceIDFromContext(ctx)
	if !ok {
		return nil, errors.E(op, errors.Unauthenticated, "missing space-id context")
	}

	account, err := h.coordinator.SyncConnectedAccount(ctx, &connectorapp.SyncConnectedAccountRequest{
		SpaceID:   spaceID,
		AccountID: req.GetId(),
	})
	if err != nil {
		return nil, err
	}

	return &connectorv1.SyncConnectedAccountResponse{
		Account: toProtoConnectedAccount(account),
	}, nil
}

func (h *Handler) SuggestContacts(ctx context.Context, req *connectorv1.SuggestContactsRequest) (*connectorv1.SuggestContactsResponse, error) {
	const op errors.Op = "grpc/connector.SuggestContacts"

	spaceID, ok := auth.SpaceIDFromContext(ctx)
	if !ok {
		return nil, errors.E(op, errors.Unauthenticated, "missing space-id context")
	}

	contacts, err := h.coordinator.SuggestContacts(ctx, &connectorapp.SuggestContactsRequest{
		SpaceID: spaceID,
		Query:   req.GetQuery(),
		Limit:   int(req.GetLimit()),
	})
	if err != nil {
		return nil, err
	}

	protoContacts := make([]*connectorv1.AccountContact, len(contacts))
	for i, c := range contacts {
		protoContacts[i] = toProtoAccountContact(c)
	}

	return &connectorv1.SuggestContactsResponse{
		Contacts: protoContacts,
	}, nil
}

func toProtoConnectedAccount(a *connector.ConnectedAccount) *connectorv1.ConnectedAccount {
	if a == nil {
		return nil
	}
	res := &connectorv1.ConnectedAccount{
		Id:                  a.ID,
		SpaceId:             a.SpaceID,
		CreatedByUserId:     a.CreatedByUserID,
		Provider:            a.Provider,
		ProviderAccountId:   a.ProviderAccountID,
		Email:               a.Email,
		DisplayName:         a.DisplayName,
		AvatarUrl:           a.AvatarURL,
		Color:               a.Color,
		GrantedScopes:       a.GrantedScopes,
		EnabledCapabilities: a.EnabledCapabilities,
		Status:              string(a.Status),
		StatusReason:        a.StatusReason,
		Version:             a.Version,
		CreateTime:          timestamppb.New(a.CreateTime),
		UpdateTime:          timestamppb.New(a.UpdateTime),
	}
	if !a.TokenExpiry.IsZero() {
		res.TokenExpiry = timestamppb.New(a.TokenExpiry)
	}
	if a.BackoffUntil != nil && !a.BackoffUntil.IsZero() {
		res.BackoffUntil = timestamppb.New(*a.BackoffUntil)
	}
	if a.LastSyncTime != nil && !a.LastSyncTime.IsZero() {
		res.LastSyncTime = timestamppb.New(*a.LastSyncTime)
	}
	return res
}

func toProtoAccountContact(c *connector.AccountContact) *connectorv1.AccountContact {
	if c == nil {
		return nil
	}
	return &connectorv1.AccountContact{
		Id:                 c.ID,
		SpaceId:            c.SpaceID,
		ConnectedAccountId: c.ConnectedAccountID,
		ProviderContactId:  c.ProviderContactID,
		Email:              c.Email,
		DisplayName:        c.DisplayName,
		AvatarUrl:          c.AvatarURL,
		UpdateTime:         timestamppb.New(c.UpdateTime),
	}
}
