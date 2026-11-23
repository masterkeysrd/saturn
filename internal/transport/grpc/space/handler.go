package space

import (
	"context"
	"slices"
	"strings"

	spacev1 "github.com/masterkeysrd/saturn/apis/saturn/space/v1"
	spaceaggregator "github.com/masterkeysrd/saturn/internal/aggregator/space"
	spaceapp "github.com/masterkeysrd/saturn/internal/application/space"
	"github.com/masterkeysrd/saturn/internal/domain/identity"
	"github.com/masterkeysrd/saturn/internal/domain/space"
	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/settings"
	"google.golang.org/protobuf/types/known/emptypb"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// Handler implements the spacev1.SpacesServer interface.
type Handler struct {
	spacev1.UnimplementedSpacesServer
	Coordinator spaceapp.Coordinator
	Aggregator  *spaceaggregator.Service
}

// NewHandler creates a new Handler.
func NewHandler(coordinator spaceapp.Coordinator, aggregator *spaceaggregator.Service) *Handler {
	return &Handler{
		Coordinator: coordinator,
		Aggregator:  aggregator,
	}
}

// toProtoSpace converts a domain Space to a proto Space.
func toProtoSpace(sp *space.Space) *spacev1.Space {
	if sp == nil {
		return nil
	}
	return &spacev1.Space{
		Id:          string(sp.ID),
		Name:        sp.Name,
		Description: sp.Description,
		OwnerId:     string(sp.OwnerID),
		Version:     sp.Version,
		CreateTime:  timestamppb.New(sp.CreateTime),
		UpdateTime:  timestamppb.New(sp.UpdateTime),
	}
}

// toDomainSpace converts a proto Space to a domain Space.
func toDomainSpace(pb *spacev1.Space) *space.Space {
	if pb == nil {
		return nil
	}
	return &space.Space{
		ID:          space.SpaceID(pb.GetId()),
		Name:        pb.GetName(),
		Description: pb.GetDescription(),
		OwnerID:     space.UserID(pb.GetOwnerId()),
		Version:     pb.GetVersion(),
	}
}

// toDomainSpaceMember converts a proto SpaceMember to a domain Member.
func toDomainSpaceMember(pb *spacev1.SpaceMember) *space.Member {
	if pb == nil {
		return nil
	}
	return &space.Member{
		SpaceID: space.SpaceID(pb.GetSpaceId()),
		UserID:  space.UserID(pb.GetUserId()),
		Role:    toDomainSpaceRole(pb.GetRole()),
	}
}

// toProtoSpaceRole maps domain SpaceRole to proto SpaceMember_Role.
func toProtoSpaceRole(role space.SpaceRole) spacev1.SpaceMember_Role {
	switch role {
	case space.RoleOwner:
		return spacev1.SpaceMember_OWNER
	case space.RoleAdmin:
		return spacev1.SpaceMember_ADMIN
	case space.RoleMember:
		return spacev1.SpaceMember_MEMBER
	case space.RoleViewer:
		return spacev1.SpaceMember_VIEWER
	default:
		return spacev1.SpaceMember_ROLE_UNSPECIFIED
	}
}

// toDomainSpaceRole maps proto SpaceMember_Role to domain SpaceRole.
func toDomainSpaceRole(role spacev1.SpaceMember_Role) space.SpaceRole {
	switch role {
	case spacev1.SpaceMember_OWNER:
		return space.RoleOwner
	case spacev1.SpaceMember_ADMIN:
		return space.RoleAdmin
	case spacev1.SpaceMember_MEMBER:
		return space.RoleMember
	case spacev1.SpaceMember_VIEWER:
		return space.RoleViewer
	default:
		return ""
	}
}

// toProtoSpaceMember converts a domain Member to a proto SpaceMember.
func toProtoSpaceMember(m *space.Member) *spacev1.SpaceMember {
	if m == nil {
		return nil
	}
	return &spacev1.SpaceMember{
		SpaceId:    string(m.SpaceID),
		UserId:     string(m.UserID),
		Role:       toProtoSpaceRole(m.Role),
		CreateTime: timestamppb.New(m.CreateTime),
		UpdateTime: timestamppb.New(m.UpdateTime),
	}
}

// toProtoAggregatedSpaceMember converts a spaceaggregator.SpaceMember to a proto SpaceMember.
func toProtoAggregatedSpaceMember(m *spaceaggregator.SpaceMember) *spacev1.SpaceMember {
	var profile *spacev1.SpaceMember_Profile
	if m.Profile != nil {
		profile = &spacev1.SpaceMember_Profile{
			Name:      m.Profile.Name,
			Username:  m.Profile.Username,
			AvatarUrl: m.Profile.AvatarURL,
		}
	}
	return &spacev1.SpaceMember{
		SpaceId:    string(m.SpaceID),
		UserId:     string(m.UserID),
		Role:       toProtoSpaceRole(m.Role),
		CreateTime: timestamppb.New(m.CreateTime),
		UpdateTime: timestamppb.New(m.UpdateTime),
		Profile:    profile,
	}
}

// getPrincipal extracts the authenticated principal from context.
func (h *Handler) getPrincipal(ctx context.Context) (auth.Principal, error) {
	const op errors.Op = "transport/grpc/space.getPrincipal"
	principal, ok := auth.PrincipalFromContext(ctx)
	if !ok {
		return auth.Principal{}, errors.E(op, errors.Unauthenticated, "missing principal")
	}
	return principal, nil
}

// getSpaceUserID extracts the space-scoped user ID from context.
func (h *Handler) getSpaceUserID(ctx context.Context) (string, error) {
	const op errors.Op = "transport/grpc/space.getSpaceUserID"
	principal, err := h.getPrincipal(ctx)
	if err != nil {
		return "", errors.E(op, err)
	}
	return principal.Subject, nil
}

// CreateSpace creates a new workspace.
func (h *Handler) CreateSpace(ctx context.Context, req *spacev1.CreateSpaceRequest) (*spacev1.Space, error) {
	const op errors.Op = "transport/grpc/space.CreateSpace"
	userID, err := h.getSpaceUserID(ctx)
	if err != nil {
		return nil, errors.E(op, err)
	}

	sp, err := h.Coordinator.CreateSpace(ctx, &spaceapp.CreateSpaceRequest{
		OwnerID:     userID,
		Name:        req.GetName(),
		Description: req.GetDescription(),
	})
	if err != nil {
		return nil, errors.E(op, err)
	}

	return toProtoSpace(sp), nil
}

// GetSpace retrieves a workspace by ID.
func (h *Handler) GetSpace(ctx context.Context, req *spacev1.GetSpaceRequest) (*spacev1.Space, error) {
	const op errors.Op = "transport/grpc/space.GetSpace"
	userID, err := h.getSpaceUserID(ctx)
	if err != nil {
		return nil, errors.E(op, err)
	}

	spaceID := space.SpaceID(req.GetSpaceId())

	sp, err := h.Aggregator.GetSpace(ctx, spaceID, space.UserID(userID))
	if err != nil {
		return nil, errors.E(op, err)
	}

	return toProtoSpace(sp), nil
}

// UpdateSpace updates a workspace.
func (h *Handler) UpdateSpace(ctx context.Context, req *spacev1.UpdateSpaceRequest) (*spacev1.Space, error) {
	const op errors.Op = "transport/grpc/space.UpdateSpace"
	userID, err := h.getSpaceUserID(ctx)
	if err != nil {
		return nil, errors.E(op, err)
	}

	spInput := toDomainSpace(req.GetSpace())
	if spInput != nil {
		if req.GetSpaceId() != "" {
			spInput.ID = space.SpaceID(req.GetSpaceId())
		}
		if req.Version != nil {
			spInput.Version = req.GetVersion()
		}
	}

	appReq := &spaceapp.UpdateSpaceRequest{
		SpaceID:    req.GetSpaceId(),
		UserID:     userID,
		Space:      spInput,
		UpdateMask: req.GetUpdateMask().GetPaths(),
	}

	sp, err := h.Coordinator.UpdateSpace(ctx, appReq)
	if err != nil {
		return nil, errors.E(op, err)
	}

	return toProtoSpace(sp), nil
}

// DeleteSpace deletes a workspace.
func (h *Handler) DeleteSpace(ctx context.Context, req *spacev1.DeleteSpaceRequest) (*emptypb.Empty, error) {
	const op errors.Op = "transport/grpc/space.DeleteSpace"
	userID, err := h.getSpaceUserID(ctx)
	if err != nil {
		return nil, errors.E(op, err)
	}

	spaceID := space.SpaceID(req.GetSpaceId())

	if err := h.Coordinator.DeleteSpace(ctx, &spaceapp.DeleteSpaceRequest{
		SpaceID: string(spaceID),
		UserID:  userID,
	}); err != nil {
		return nil, errors.E(op, err)
	}

	return &emptypb.Empty{}, nil
}

// ListSpaces lists all spaces the authenticated user has access to.
func (h *Handler) ListSpaces(ctx context.Context, req *spacev1.ListSpacesRequest) (*spacev1.ListSpacesResponse, error) {
	const op errors.Op = "transport/grpc/space.ListSpaces"
	userID, err := h.getSpaceUserID(ctx)
	if err != nil {
		return nil, errors.E(op, err)
	}

	filter := &space.ListSpacesFilter{
		PageSize:      req.GetPageSize(),
		NextPageToken: req.GetPageToken(),
	}

	page, err := h.Aggregator.ListSpaces(ctx, space.UserID(userID), filter)
	if err != nil {
		return nil, errors.E(op, err)
	}

	protoSpaces := make([]*spacev1.Space, 0, len(page.Items))
	for _, sp := range page.Items {
		protoSpaces = append(protoSpaces, toProtoSpace(sp))
	}

	return &spacev1.ListSpacesResponse{
		Spaces:        protoSpaces,
		NextPageToken: page.NextPageToken,
	}, nil
}

// CreateSpaceMember adds a member to a workspace.
func (h *Handler) CreateSpaceMember(ctx context.Context, req *spacev1.CreateSpaceMemberRequest) (*spacev1.SpaceMember, error) {
	const op errors.Op = "transport/grpc/space.CreateSpaceMember"
	userID, err := h.getSpaceUserID(ctx)
	if err != nil {
		return nil, errors.E(op, err)
	}

	mInput := toDomainSpaceMember(req.GetMember())
	if mInput != nil && req.GetSpaceId() != "" {
		mInput.SpaceID = space.SpaceID(req.GetSpaceId())
	}

	m, err := h.Coordinator.AddSpaceMember(ctx, &spaceapp.AddSpaceMemberRequest{
		SpaceID: req.GetSpaceId(),
		UserID:  userID,
		Member:  mInput,
	})
	if err != nil {
		return nil, errors.E(op, err)
	}

	return toProtoSpaceMember(m), nil
}

// DeleteSpaceMember removes a member from a workspace.
func (h *Handler) DeleteSpaceMember(ctx context.Context, req *spacev1.DeleteSpaceMemberRequest) (*emptypb.Empty, error) {
	const op errors.Op = "transport/grpc/space.DeleteSpaceMember"
	userID, err := h.getSpaceUserID(ctx)
	if err != nil {
		return nil, errors.E(op, err)
	}

	spaceID := space.SpaceID(req.GetSpaceId())
	memberID := space.UserID(req.GetUserId())

	if err := h.Coordinator.RemoveSpaceMember(ctx, &spaceapp.RemoveSpaceMemberRequest{
		SpaceID:      string(spaceID),
		UserID:       userID,
		TargetUserID: string(memberID),
	}); err != nil {
		return nil, errors.E(op, err)
	}

	return &emptypb.Empty{}, nil
}

// UpdateSpaceMember updates an existing member within a workspace.
func (h *Handler) UpdateSpaceMember(ctx context.Context, req *spacev1.UpdateSpaceMemberRequest) (*spacev1.SpaceMember, error) {
	const op errors.Op = "transport/grpc/space.UpdateSpaceMember"
	userID, err := h.getSpaceUserID(ctx)
	if err != nil {
		return nil, errors.E(op, err)
	}

	mInput := toDomainSpaceMember(req.GetMember())
	if mInput != nil && req.GetSpaceId() != "" {
		mInput.SpaceID = space.SpaceID(req.GetSpaceId())
	}

	var mask []string
	for _, p := range req.GetUpdateMask().GetPaths() {
		if p == "user_id" || p == "member.user_id" || p == "space_id" {
			continue
		}
		mask = append(mask, p)
	}

	m, err := h.Coordinator.UpdateSpaceMember(ctx, &spaceapp.UpdateSpaceMemberRequest{
		SpaceID:    req.GetSpaceId(),
		UserID:     userID,
		Member:     mInput,
		UpdateMask: mask,
	})
	if err != nil {
		return nil, errors.E(op, err)
	}

	return toProtoSpaceMember(m), nil
}

// ListSpaceMembers lists all members of a workspace.
func (h *Handler) ListSpaceMembers(ctx context.Context, req *spacev1.ListSpaceMembersRequest) (*spacev1.ListSpaceMembersResponse, error) {
	const op errors.Op = "transport/grpc/space.ListSpaceMembers"
	userID, err := h.getSpaceUserID(ctx)
	if err != nil {
		return nil, errors.E(op, err)
	}

	spaceID := space.SpaceID(req.GetSpaceId())

	filter := &space.ListMembersFilter{
		PageSize:      req.GetPageSize(),
		NextPageToken: req.GetPageToken(),
	}

	page, err := h.Aggregator.ListSpaceMembers(ctx, spaceID, space.UserID(userID), filter)
	if err != nil {
		return nil, errors.E(op, err)
	}

	protoMembers := make([]*spacev1.SpaceMember, 0, len(page.Items))
	for _, m := range page.Items {
		protoMembers = append(protoMembers, toProtoAggregatedSpaceMember(m))
	}

	return &spacev1.ListSpaceMembersResponse{
		Members:       protoMembers,
		NextPageToken: page.NextPageToken,
	}, nil
}

// toProtoSettings converts a settings Entry to a proto Settings.
func toProtoSettings(entry *settings.Entry[space.Settings]) *spacev1.Settings {
	if entry == nil {
		return nil
	}
	return &spacev1.Settings{
		SpaceId:    entry.Target.ScopeID(),
		Timezone:   entry.Value.Timezone,
		Version:    entry.Version,
		CreateTime: timestamppb.New(entry.CreateTime),
		UpdateTime: timestamppb.New(entry.UpdateTime),
	}
}

// GetSettings retrieves workspace configuration settings.
func (h *Handler) GetSettings(ctx context.Context, req *spacev1.GetSettingsRequest) (*spacev1.Settings, error) {
	const op errors.Op = "transport/grpc/space.GetSettings"
	userID, err := h.getSpaceUserID(ctx)
	if err != nil {
		return nil, errors.E(op, err)
	}

	entry, err := h.Coordinator.GetSettings(ctx, &spaceapp.GetSettingsRequest{
		SpaceID: req.GetSpaceId(),
		UserID:  userID,
	})
	if err != nil {
		return nil, errors.E(op, err)
	}

	return toProtoSettings(entry), nil
}

// UpdateSettings updates workspace configuration settings.
func (h *Handler) UpdateSettings(ctx context.Context, req *spacev1.UpdateSettingsRequest) (*spacev1.Settings, error) {
	const op errors.Op = "transport/grpc/space.UpdateSettings"
	userID, err := h.getSpaceUserID(ctx)
	if err != nil {
		return nil, errors.E(op, err)
	}

	var expectedVersion *int64
	if req.Version != nil {
		v := req.GetVersion()
		expectedVersion = &v
	}

	entry, err := h.Coordinator.UpdateSettings(ctx, &spaceapp.UpdateSettingsRequest{
		SpaceID: req.GetSpaceId(),
		UserID:  userID,
		Settings: &space.Settings{
			Timezone: req.GetSettings().GetTimezone(),
		},
		UpdateMask:      req.GetUpdateMask().GetPaths(),
		ExpectedVersion: expectedVersion,
	})
	if err != nil {
		return nil, errors.E(op, err)
	}

	return toProtoSettings(entry), nil
}

// toProtoDashboardPreferences converts a settings Entry to a proto DashboardPreferences.
func toProtoDashboardPreferences(spaceID, userID string, entry *settings.Entry[space.DashboardPreferences]) *spacev1.DashboardPreferences {
	if entry == nil {
		return nil
	}
	if scopeUser, scopeSpace, ok := strings.Cut(entry.Target.ScopeID(), ":"); ok {
		if userID == "" {
			userID = scopeUser
		}
		if spaceID == "" {
			spaceID = scopeSpace
		}
	}
	return &spacev1.DashboardPreferences{
		SpaceId:    spaceID,
		UserId:     userID,
		Widgets:    slices.Clone(entry.Value.Widgets),
		Version:    entry.Version,
		CreateTime: timestamppb.New(entry.CreateTime),
		UpdateTime: timestamppb.New(entry.UpdateTime),
	}
}

// GetDashboardPreferences retrieves the caller's dashboard widget layout for a workspace.
func (h *Handler) GetDashboardPreferences(ctx context.Context, req *spacev1.GetDashboardPreferencesRequest) (*spacev1.DashboardPreferences, error) {
	const op errors.Op = "transport/grpc/space.GetDashboardPreferences"
	userID, err := h.getSpaceUserID(ctx)
	if err != nil {
		return nil, errors.E(op, err)
	}

	entry, err := h.Coordinator.GetDashboardPreferences(ctx, &spaceapp.GetDashboardPreferencesRequest{
		SpaceID: req.GetSpaceId(),
		UserID:  userID,
	})
	if err != nil {
		return nil, errors.E(op, err)
	}

	return toProtoDashboardPreferences(req.GetSpaceId(), userID, entry), nil
}

// UpdateDashboardPreferences updates the caller's dashboard widget layout for a workspace.
func (h *Handler) UpdateDashboardPreferences(ctx context.Context, req *spacev1.UpdateDashboardPreferencesRequest) (*spacev1.DashboardPreferences, error) {
	const op errors.Op = "transport/grpc/space.UpdateDashboardPreferences"
	userID, err := h.getSpaceUserID(ctx)
	if err != nil {
		return nil, errors.E(op, err)
	}

	var expectedVersion *int64
	if req.Version != nil {
		expectedVersion = new(req.GetVersion())
	}

	var incoming *space.DashboardPreferences
	if req.GetDashboardPreferences() != nil {
		incoming = &space.DashboardPreferences{
			Widgets: slices.Clone(req.GetDashboardPreferences().GetWidgets()),
		}
	}

	entry, err := h.Coordinator.UpdateDashboardPreferences(ctx, &spaceapp.UpdateDashboardPreferencesRequest{
		SpaceID:              req.GetSpaceId(),
		UserID:               userID,
		DashboardPreferences: incoming,
		UpdateMask:           req.GetUpdateMask().GetPaths(),
		ExpectedVersion:      expectedVersion,
	})
	if err != nil {
		return nil, errors.E(op, err)
	}

	return toProtoDashboardPreferences(req.GetSpaceId(), userID, entry), nil
}

// ListSpaceAPIKeyGrants lists all active API key grants targeting a workspace.
func (h *Handler) ListSpaceAPIKeyGrants(ctx context.Context, req *spacev1.ListSpaceAPIKeyGrantsRequest) (*spacev1.ListSpaceAPIKeyGrantsResponse, error) {
	const op errors.Op = "transport/grpc/space.ListSpaceAPIKeyGrants"
	userID, err := h.getSpaceUserID(ctx)
	if err != nil {
		return nil, errors.E(op, err)
	}

	grants, err := h.Aggregator.ListSpaceAPIKeyGrants(ctx, space.SpaceID(req.GetSpaceId()), space.UserID(userID))
	if err != nil {
		return nil, errors.E(op, err)
	}

	pbGrants := make([]*spacev1.APIKeyGrant, 0, len(grants))
	for _, g := range grants {
		pbGrants = append(pbGrants, toProtoAPIKeyGrant(g))
	}

	return &spacev1.ListSpaceAPIKeyGrantsResponse{
		Grants: pbGrants,
	}, nil
}

// RevokeSpaceAPIKeyGrant revokes an API key's grant to access the workspace.
func (h *Handler) RevokeSpaceAPIKeyGrant(ctx context.Context, req *spacev1.RevokeSpaceAPIKeyGrantRequest) (*emptypb.Empty, error) {
	const op errors.Op = "transport/grpc/space.RevokeSpaceAPIKeyGrant"
	userID, err := h.getSpaceUserID(ctx)
	if err != nil {
		return nil, errors.E(op, err)
	}

	if err := h.Coordinator.RevokeSpaceAPIKeyGrant(ctx, &spaceapp.RevokeSpaceAPIKeyGrantRequest{
		SpaceID:  req.GetSpaceId(),
		UserID:   userID,
		APIKeyID: req.GetApiKeyId(),
	}); err != nil {
		return nil, errors.E(op, err)
	}

	return &emptypb.Empty{}, nil
}

func toProtoAPIKeyGrant(g *spaceaggregator.APIKeyGrant) *spacev1.APIKeyGrant {
	if g == nil {
		return nil
	}
	pb := &spacev1.APIKeyGrant{
		ApiKeyId:        g.APIKeyID,
		SpaceId:         string(g.SpaceID),
		UserId:          string(g.UserID),
		UserName:        g.UserName,
		UserEmail:       g.UserEmail,
		KeyName:         g.KeyName,
		KeyPrefix:       g.KeyPrefix,
		Scopes:          g.Scopes,
		GrantCreateTime: timestamppb.New(g.GrantCreateTime),
	}
	if g.ExpiresAt != nil {
		pb.ExpiresAt = timestamppb.New(*g.ExpiresAt)
	}
	if g.LastUsedAt != nil {
		pb.LastUsedAt = timestamppb.New(*g.LastUsedAt)
	}
	return pb
}

// CreateSpaceOAuthClient creates a workspace-scoped OAuth 2.1 client.
func (h *Handler) CreateSpaceOAuthClient(ctx context.Context, req *spacev1.CreateSpaceOAuthClientRequest) (*spacev1.SpaceOAuthClient, error) {
	const op errors.Op = "transport/grpc/space.CreateSpaceOAuthClient"
	userID, err := h.getSpaceUserID(ctx)
	if err != nil {
		return nil, errors.E(op, err)
	}
	pb := req.GetOauthClient()
	client, err := h.Coordinator.CreateSpaceOAuthClient(ctx, &spaceapp.CreateSpaceOAuthClientRequest{
		SpaceID:                 req.GetSpaceId(),
		UserID:                  userID,
		Name:                    pb.GetName(),
		Description:             pb.GetDescription(),
		RedirectURIs:            pb.GetRedirectUris(),
		AllowedScopes:           pb.GetAllowedScopes(),
		TokenEndpointAuthMethod: identity.TokenEndpointAuthMethod(pb.GetTokenEndpointAuthMethod()),
		RefreshTokenPolicy:      identity.RefreshTokenPolicy(pb.GetRefreshTokenPolicy()),
	})
	if err != nil {
		return nil, errors.E(op, err)
	}
	return toProtoSpaceOAuthClient(client, true), nil
}

// GetSpaceOAuthClient retrieves a workspace-scoped OAuth 2.1 client.
func (h *Handler) GetSpaceOAuthClient(ctx context.Context, req *spacev1.GetSpaceOAuthClientRequest) (*spacev1.SpaceOAuthClient, error) {
	const op errors.Op = "transport/grpc/space.GetSpaceOAuthClient"
	userID, err := h.getSpaceUserID(ctx)
	if err != nil {
		return nil, errors.E(op, err)
	}
	clientID, err := identity.ParseOAuthClientID(req.GetClientId())
	if err != nil {
		return nil, errors.E(op, err)
	}
	client, err := h.Aggregator.GetSpaceOAuthClient(ctx, space.SpaceID(req.GetSpaceId()), space.UserID(userID), clientID)
	if err != nil {
		return nil, errors.E(op, err)
	}
	return toProtoSpaceOAuthClient(client, false), nil
}

// ListSpaceOAuthClients lists workspace-scoped OAuth 2.1 clients.
func (h *Handler) ListSpaceOAuthClients(ctx context.Context, req *spacev1.ListSpaceOAuthClientsRequest) (*spacev1.ListSpaceOAuthClientsResponse, error) {
	const op errors.Op = "transport/grpc/space.ListSpaceOAuthClients"
	userID, err := h.getSpaceUserID(ctx)
	if err != nil {
		return nil, errors.E(op, err)
	}
	clients, err := h.Aggregator.ListSpaceOAuthClients(ctx, space.SpaceID(req.GetSpaceId()), space.UserID(userID))
	if err != nil {
		return nil, errors.E(op, err)
	}
	pbClients := make([]*spacev1.SpaceOAuthClient, len(clients))
	for i, cl := range clients {
		pbClients[i] = toProtoSpaceOAuthClient(cl, false)
	}
	return &spacev1.ListSpaceOAuthClientsResponse{
		OauthClients: pbClients,
	}, nil
}

// UpdateSpaceOAuthClient updates a workspace-scoped OAuth 2.1 client.
func (h *Handler) UpdateSpaceOAuthClient(ctx context.Context, req *spacev1.UpdateSpaceOAuthClientRequest) (*spacev1.SpaceOAuthClient, error) {
	const op errors.Op = "transport/grpc/space.UpdateSpaceOAuthClient"
	userID, err := h.getSpaceUserID(ctx)
	if err != nil {
		return nil, errors.E(op, err)
	}
	clientID, err := identity.ParseOAuthClientID(req.GetClientId())
	if err != nil {
		return nil, errors.E(op, err)
	}
	pb := req.GetOauthClient()
	client, err := h.Coordinator.UpdateSpaceOAuthClient(ctx, &spaceapp.UpdateSpaceOAuthClientRequest{
		SpaceID:                 req.GetSpaceId(),
		UserID:                  userID,
		ClientID:                clientID,
		Name:                    pb.GetName(),
		Description:             pb.GetDescription(),
		RedirectURIs:            pb.GetRedirectUris(),
		AllowedScopes:           pb.GetAllowedScopes(),
		TokenEndpointAuthMethod: identity.TokenEndpointAuthMethod(pb.GetTokenEndpointAuthMethod()),
		RefreshTokenPolicy:      identity.RefreshTokenPolicy(pb.GetRefreshTokenPolicy()),
		UpdateMask:              req.GetUpdateMask().GetPaths(),
	})
	if err != nil {
		return nil, errors.E(op, err)
	}
	return toProtoSpaceOAuthClient(client, client.RawSecret != ""), nil
}

// RotateSpaceOAuthClientSecret rotates the secret of a workspace-scoped OAuth 2.1 client.
func (h *Handler) RotateSpaceOAuthClientSecret(ctx context.Context, req *spacev1.RotateSpaceOAuthClientSecretRequest) (*spacev1.SpaceOAuthClient, error) {
	const op errors.Op = "transport/grpc/space.RotateSpaceOAuthClientSecret"
	userID, err := h.getSpaceUserID(ctx)
	if err != nil {
		return nil, errors.E(op, err)
	}
	clientID, err := identity.ParseOAuthClientID(req.GetClientId())
	if err != nil {
		return nil, errors.E(op, err)
	}
	client, err := h.Coordinator.RotateSpaceOAuthClientSecret(ctx, &spaceapp.RotateSpaceOAuthClientSecretRequest{
		SpaceID:  req.GetSpaceId(),
		UserID:   userID,
		ClientID: clientID,
	})
	if err != nil {
		return nil, errors.E(op, err)
	}
	return toProtoSpaceOAuthClient(client, true), nil
}

// DeleteSpaceOAuthClient deletes a workspace-scoped OAuth 2.1 client.
func (h *Handler) DeleteSpaceOAuthClient(ctx context.Context, req *spacev1.DeleteSpaceOAuthClientRequest) (*emptypb.Empty, error) {
	const op errors.Op = "transport/grpc/space.DeleteSpaceOAuthClient"
	userID, err := h.getSpaceUserID(ctx)
	if err != nil {
		return nil, errors.E(op, err)
	}
	clientID, err := identity.ParseOAuthClientID(req.GetClientId())
	if err != nil {
		return nil, errors.E(op, err)
	}
	if err := h.Coordinator.DeleteSpaceOAuthClient(ctx, &spaceapp.DeleteSpaceOAuthClientRequest{
		SpaceID:  req.GetSpaceId(),
		UserID:   userID,
		ClientID: clientID,
	}); err != nil {
		return nil, errors.E(op, err)
	}
	return &emptypb.Empty{}, nil
}

// ListSpaceOAuthGrants lists all active OAuth 2.1 grants targeting a workspace.
func (h *Handler) ListSpaceOAuthGrants(ctx context.Context, req *spacev1.ListSpaceOAuthGrantsRequest) (*spacev1.ListSpaceOAuthGrantsResponse, error) {
	const op errors.Op = "transport/grpc/space.ListSpaceOAuthGrants"
	userID, err := h.getSpaceUserID(ctx)
	if err != nil {
		return nil, errors.E(op, err)
	}
	grants, err := h.Aggregator.ListSpaceOAuthGrants(ctx, space.SpaceID(req.GetSpaceId()), space.UserID(userID))
	if err != nil {
		return nil, errors.E(op, err)
	}
	pbGrants := make([]*spacev1.SpaceOAuthGrant, len(grants))
	for i, g := range grants {
		pb := &spacev1.SpaceOAuthGrant{
			GrantId:    g.GrantID,
			ClientId:   g.ClientID,
			ClientName: g.ClientName,
			SpaceId:    string(g.SpaceID),
			UserId:     string(g.UserID),
			UserName:   g.UserName,
			UserEmail:  g.UserEmail,
			Scopes:     g.Scopes,
			CreateTime: timestamppb.New(g.CreateTime),
		}
		if g.LastUsedAt != nil {
			pb.LastUsedAt = timestamppb.New(*g.LastUsedAt)
		}
		pbGrants[i] = pb
	}
	return &spacev1.ListSpaceOAuthGrantsResponse{
		Grants: pbGrants,
	}, nil
}

// RevokeSpaceOAuthGrant revokes a user's OAuth 2.1 grant targeting a workspace.
func (h *Handler) RevokeSpaceOAuthGrant(ctx context.Context, req *spacev1.RevokeSpaceOAuthGrantRequest) (*emptypb.Empty, error) {
	const op errors.Op = "transport/grpc/space.RevokeSpaceOAuthGrant"
	userID, err := h.getSpaceUserID(ctx)
	if err != nil {
		return nil, errors.E(op, err)
	}
	grantID, err := identity.ParseOAuthGrantID(req.GetGrantId())
	if err != nil {
		return nil, errors.E(op, err)
	}
	if err := h.Coordinator.RevokeSpaceOAuthGrant(ctx, &spaceapp.RevokeSpaceOAuthGrantRequest{
		SpaceID: req.GetSpaceId(),
		UserID:  userID,
		GrantID: grantID,
	}); err != nil {
		return nil, errors.E(op, err)
	}
	return &emptypb.Empty{}, nil
}

func toProtoSpaceOAuthClient(c *identity.OAuthClient, includeRawSecret bool) *spacev1.SpaceOAuthClient {
	if c == nil {
		return nil
	}
	var spaceID string
	if c.SpaceID != nil {
		spaceID = *c.SpaceID
	}
	pb := &spacev1.SpaceOAuthClient{
		Id:                      string(c.ID),
		SpaceId:                 spaceID,
		Name:                    c.Name,
		Description:             c.Description,
		SecretPrefix:            c.SecretPrefix,
		RedirectUris:            c.RedirectURIs,
		AllowedScopes:           c.AllowedScopes,
		TokenEndpointAuthMethod: string(c.TokenEndpointAuthMethod),
		RefreshTokenPolicy:      string(c.RefreshTokenPolicy),
		RegistrationSource:      string(c.RegistrationSource),
		CreateTime:              timestamppb.New(c.CreateTime),
		UpdateTime:              timestamppb.New(c.UpdateTime),
	}
	if includeRawSecret {
		pb.RawSecret = c.RawSecret
	}
	return pb
}
