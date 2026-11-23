package identity

import (
	"context"

	adminidentityv1 "github.com/masterkeysrd/saturn/apis/saturn/identity/admin/v1"
	"github.com/masterkeysrd/saturn/internal/application/iam"
	"github.com/masterkeysrd/saturn/internal/domain/identity"
	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"google.golang.org/protobuf/types/known/emptypb"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// AdminHandler implements the adminidentityv1.AdminIdentityServer interface.
type AdminHandler struct {
	adminidentityv1.UnimplementedAdminIdentityServer
	Coordinator iam.Coordinator
}

// NewAdminHandler creates a new AdminHandler.
func NewAdminHandler(coordinator iam.Coordinator) *AdminHandler {
	return &AdminHandler{Coordinator: coordinator}
}

// toAdminUser converts a domain identity.User to an admin proto User.
func toAdminUser(u *identity.User) *adminidentityv1.User {
	var lockedUntil *timestamppb.Timestamp
	if u.LockedUntil != nil {
		lockedUntil = timestamppb.New(*u.LockedUntil)
	}

	return &adminidentityv1.User{
		Id:                  string(u.ID),
		Email:               u.Email,
		Username:            u.Username,
		Name:                u.Name,
		AvatarUrl:           u.AvatarURL,
		Status:              string(u.Status),
		AccessLevel:         adminAccessLevel(u.AccessLevel),
		Version:             u.Version,
		CreateTime:          timestamppb.New(u.CreateTime),
		UpdateTime:          timestamppb.New(u.UpdateTime),
		LockedUntil:         lockedUntil,
		FailedLoginAttempts: int32(u.FailedLoginAttempts),
	}
}

// adminAccessLevel maps a domain AccessLevel to an admin proto AccessLevel.
func adminAccessLevel(level identity.AccessLevel) adminidentityv1.AccessLevel {
	switch level {
	case identity.AccessLevelAdmin:
		return adminidentityv1.AccessLevel_ACCESS_LEVEL_ADMIN
	default:
		return adminidentityv1.AccessLevel_ACCESS_LEVEL_USER
	}
}

// adminStatusToDomainStatus converts a proto status filter to a domain UserStatus.
func adminStatusToDomainStatus(status adminidentityv1.ListUsersRequest_StatusFilter) identity.UserStatus {
	switch status {
	case adminidentityv1.ListUsersRequest_ACTIVE:
		return identity.UserStatusActive
	case adminidentityv1.ListUsersRequest_PENDING_APPROVAL:
		return identity.UserStatusPendingApproval
	case adminidentityv1.ListUsersRequest_INACTIVE:
		return identity.UserStatusInactive
	case adminidentityv1.ListUsersRequest_SUSPENDED:
		return identity.UserStatusSuspended
	default:
		return ""
	}
}

// adminProtoToDomainAccessLevel converts an admin proto AccessLevel to a domain AccessLevel.
func adminProtoToDomainAccessLevel(level adminidentityv1.AccessLevel) identity.AccessLevel {
	switch level {
	case adminidentityv1.AccessLevel_ACCESS_LEVEL_ADMIN:
		return identity.AccessLevelAdmin
	default:
		return identity.AccessLevelUser
	}
}

// ListUsers returns users with optional filtering by status or search query.
func (h *AdminHandler) ListUsers(ctx context.Context, req *adminidentityv1.ListUsersRequest) (*adminidentityv1.ListUsersResponse, error) {
	filter := &iam.ListUsersFilter{
		PageSize:      req.GetPageSize(),
		NextPageToken: req.GetNextPageToken(),
		SearchQuery:   req.GetSearchQuery(),
	}

	if req.GetStatusFilter() != adminidentityv1.ListUsersRequest_STATUS_FILTER_UNSPECIFIED {
		filter.StatusFilter = adminStatusToDomainStatus(req.GetStatusFilter())
	}

	page, err := h.Coordinator.ListUsers(ctx, filter)
	if err != nil {
		return nil, err
	}

	adminUsers := make([]*adminidentityv1.User, 0, len(page.Items))
	for _, u := range page.Items {
		adminUsers = append(adminUsers, toAdminUser(u))
	}

	return &adminidentityv1.ListUsersResponse{
		Users:         adminUsers,
		NextPageToken: page.NextPageToken,
	}, nil
}

// ApproveUser activates a pending user account.
func (h *AdminHandler) ApproveUser(ctx context.Context, req *adminidentityv1.ApproveUserRequest) (*adminidentityv1.User, error) {
	resp, err := h.Coordinator.ApproveUser(ctx, &iam.ApproveUserRequest{
		UserID: req.GetUserId(),
	})
	if err != nil {
		return nil, err
	}

	return toAdminUser(resp.User), nil
}

// RejectUser deactivates a pending user account.
func (h *AdminHandler) RejectUser(ctx context.Context, req *adminidentityv1.RejectUserRequest) (*adminidentityv1.User, error) {
	resp, err := h.Coordinator.RejectUser(ctx, &iam.RejectUserRequest{
		UserID: req.GetUserId(),
	})
	if err != nil {
		return nil, err
	}

	return toAdminUser(resp.User), nil
}

// UpdateUserRole changes a user's access level.
func (h *AdminHandler) UpdateUserRole(ctx context.Context, req *adminidentityv1.UpdateUserRoleRequest) (*adminidentityv1.User, error) {
	resp, err := h.Coordinator.UpdateUserRole(ctx, &iam.UpdateUserRoleRequest{
		UserID:      req.GetUserId(),
		AccessLevel: adminProtoToDomainAccessLevel(req.GetAccessLevel()),
	})
	if err != nil {
		return nil, err
	}

	return toAdminUser(resp.User), nil
}

// RevokeAllSessions revokes all sessions for a user globally.
func (h *AdminHandler) RevokeAllSessions(ctx context.Context, req *adminidentityv1.RevokeAllSessionsRequest) (*adminidentityv1.RevokeAllSessionsResponse, error) {
	_, err := h.Coordinator.RevokeAllSessions(ctx, &iam.RevokeAllSessionsRequest{
		UserID: req.GetUserId(),
	})
	if err != nil {
		return nil, err
	}

	return &adminidentityv1.RevokeAllSessionsResponse{}, nil
}

// ListSecurityEvents lists security audit logs.
func (h *AdminHandler) ListSecurityEvents(ctx context.Context, req *adminidentityv1.ListSecurityEventsRequest) (*adminidentityv1.ListSecurityEventsResponse, error) {
	page, err := h.Coordinator.ListSecurityEvents(ctx, identity.SecurityEventFilter{
		Email:         req.GetEmail(),
		EventType:     req.GetEventType(),
		Limit:         int(req.GetLimit()),
		NextPageToken: req.GetNextPageToken(),
	})
	if err != nil {
		return nil, err
	}

	pbEvents := make([]*adminidentityv1.SecurityEvent, 0, len(page.Items))
	for _, ev := range page.Items {
		var uID string
		if ev.UserID != nil {
			uID = string(*ev.UserID)
		}
		pbEvents = append(pbEvents, &adminidentityv1.SecurityEvent{
			Id:        ev.ID,
			UserId:    uID,
			Email:     ev.Email,
			EventType: string(ev.EventType),
			IpAddress: ev.IPAddress,
			UserAgent: ev.UserAgent,
			CreatedAt: timestamppb.New(ev.CreatedAt),
		})
	}

	return &adminidentityv1.ListSecurityEventsResponse{
		Events:        pbEvents,
		NextPageToken: page.NextPageToken,
	}, nil
}

// ResetPassword initiates a single-use password reset link for the target user.
func (h *AdminHandler) ResetPassword(ctx context.Context, req *adminidentityv1.ResetPasswordRequest) (*adminidentityv1.ResetPasswordResponse, error) {
	principal, ok := auth.PrincipalFromContext(ctx)
	if !ok {
		return nil, errors.E(errors.Unauthenticated, "unauthenticated")
	}

	resp, err := h.Coordinator.ResetPassword(ctx, &iam.ResetPasswordRequest{
		AdminUserID:  principal.Subject,
		TargetUserID: req.GetUserId(),
		TTLMinutes:   req.GetTtlMinutes(),
	})
	if err != nil {
		return nil, err
	}

	return &adminidentityv1.ResetPasswordResponse{
		ResetUrl:  resp.ResetURL,
		Token:     resp.Token,
		ExpiresAt: timestamppb.New(resp.ExpiresAt),
	}, nil
}

// UnlockUser unlocks a locked user account and clears failed login attempts.
func (h *AdminHandler) UnlockUser(ctx context.Context, req *adminidentityv1.UnlockUserRequest) (*adminidentityv1.User, error) {
	resp, err := h.Coordinator.UnlockUser(ctx, &iam.UnlockUserRequest{
		UserID: req.GetUserId(),
	})
	if err != nil {
		return nil, err
	}

	return toAdminUser(resp.User), nil
}

// CreateOAuthClient registers a new instance-wide OAuth 2.1 client.
func (h *AdminHandler) CreateOAuthClient(ctx context.Context, req *adminidentityv1.CreateOAuthClientRequest) (*adminidentityv1.OAuthClient, error) {
	principal, ok := auth.PrincipalFromContext(ctx)
	if !ok {
		return nil, errors.E(errors.Unauthenticated, "unauthenticated")
	}
	ua, ip := extractClientInfo(ctx)
	pb := req.GetOauthClient()

	client, err := h.Coordinator.AdminCreateOAuthClient(ctx, &iam.AdminCreateOAuthClientRequest{
		ActorUserID:             identity.UserID(principal.Subject),
		Name:                    pb.GetName(),
		Description:             pb.GetDescription(),
		RedirectURIs:            pb.GetRedirectUris(),
		AllowedScopes:           pb.GetAllowedScopes(),
		TokenEndpointAuthMethod: identity.TokenEndpointAuthMethod(pb.GetTokenEndpointAuthMethod()),
		RefreshTokenPolicy:      identity.RefreshTokenPolicy(pb.GetRefreshTokenPolicy()),
		IPAddress:               ip,
		UserAgent:               ua,
	})
	if err != nil {
		return nil, err
	}
	return toAdminProtoOAuthClient(client, true), nil
}

// GetOAuthClient retrieves an instance-wide, DCR, or CIMD OAuth 2.1 client.
func (h *AdminHandler) GetOAuthClient(ctx context.Context, req *adminidentityv1.GetOAuthClientRequest) (*adminidentityv1.OAuthClient, error) {
	clientID, err := identity.ParseOAuthClientID(req.GetId())
	if err != nil {
		return nil, err
	}
	client, err := h.Coordinator.AdminGetOAuthClient(ctx, &iam.AdminGetOAuthClientRequest{
		ID: clientID,
	})
	if err != nil {
		return nil, err
	}
	return toAdminProtoOAuthClient(client, false), nil
}

// ListOAuthClients lists instance-wide, DCR, and CIMD OAuth 2.1 clients.
func (h *AdminHandler) ListOAuthClients(ctx context.Context, _ *adminidentityv1.ListOAuthClientsRequest) (*adminidentityv1.ListOAuthClientsResponse, error) {
	clients, err := h.Coordinator.AdminListOAuthClients(ctx)
	if err != nil {
		return nil, err
	}
	pbClients := make([]*adminidentityv1.OAuthClient, len(clients))
	for i, cl := range clients {
		pbClients[i] = toAdminProtoOAuthClient(cl, false)
	}
	return &adminidentityv1.ListOAuthClientsResponse{
		OauthClients: pbClients,
	}, nil
}

// UpdateOAuthClient updates an instance-wide OAuth 2.1 client.
func (h *AdminHandler) UpdateOAuthClient(ctx context.Context, req *adminidentityv1.UpdateOAuthClientRequest) (*adminidentityv1.OAuthClient, error) {
	clientID, err := identity.ParseOAuthClientID(req.GetId())
	if err != nil {
		return nil, err
	}
	pb := req.GetOauthClient()
	client, err := h.Coordinator.AdminUpdateOAuthClient(ctx, &iam.AdminUpdateOAuthClientRequest{
		ID:                      clientID,
		Name:                    pb.GetName(),
		Description:             pb.GetDescription(),
		RedirectURIs:            pb.GetRedirectUris(),
		AllowedScopes:           pb.GetAllowedScopes(),
		TokenEndpointAuthMethod: identity.TokenEndpointAuthMethod(pb.GetTokenEndpointAuthMethod()),
		RefreshTokenPolicy:      identity.RefreshTokenPolicy(pb.GetRefreshTokenPolicy()),
		UpdateMask:              req.GetUpdateMask().GetPaths(),
	})
	if err != nil {
		return nil, err
	}
	return toAdminProtoOAuthClient(client, client.RawSecret != ""), nil
}

// RotateOAuthClientSecret rotates an instance OAuth client's secret and returns the new secret once.
func (h *AdminHandler) RotateOAuthClientSecret(ctx context.Context, req *adminidentityv1.RotateOAuthClientSecretRequest) (*adminidentityv1.OAuthClient, error) {
	clientID, err := identity.ParseOAuthClientID(req.GetId())
	if err != nil {
		return nil, err
	}
	client, err := h.Coordinator.AdminRotateOAuthClientSecret(ctx, &iam.AdminRotateOAuthClientSecretRequest{
		ID: clientID,
	})
	if err != nil {
		return nil, err
	}
	return toAdminProtoOAuthClient(client, true), nil
}

// DeleteOAuthClient deletes an instance-wide, DCR, or CIMD OAuth 2.1 client.
func (h *AdminHandler) DeleteOAuthClient(ctx context.Context, req *adminidentityv1.DeleteOAuthClientRequest) (*emptypb.Empty, error) {
	principal, ok := auth.PrincipalFromContext(ctx)
	if !ok {
		return nil, errors.E(errors.Unauthenticated, "unauthenticated")
	}
	clientID, err := identity.ParseOAuthClientID(req.GetId())
	if err != nil {
		return nil, err
	}
	ua, ip := extractClientInfo(ctx)
	if err := h.Coordinator.AdminDeleteOAuthClient(ctx, &iam.AdminDeleteOAuthClientRequest{
		ActorUserID: identity.UserID(principal.Subject),
		ID:          clientID,
		IPAddress:   ip,
		UserAgent:   ua,
	}); err != nil {
		return nil, err
	}
	return &emptypb.Empty{}, nil
}

func toAdminProtoOAuthClient(c *identity.OAuthClient, includeRawSecret bool) *adminidentityv1.OAuthClient {
	if c == nil {
		return nil
	}
	var spaceID string
	if c.SpaceID != nil {
		spaceID = *c.SpaceID
	}
	pb := &adminidentityv1.OAuthClient{
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
