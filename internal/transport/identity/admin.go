package identity

import (
	"context"

	adminidentityv1 "github.com/masterkeysrd/saturn/apis/saturn/identity/admin/v1"
	"github.com/masterkeysrd/saturn/internal/application/iam"
	"github.com/masterkeysrd/saturn/internal/domain/identity"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// AdminHandler implements the adminidentityv1.AdminIdentityServer interface.
type AdminHandler struct {
	adminidentityv1.UnimplementedAdminIdentityServer
	Coordinator *iam.Coordinator
}

// NewAdminHandler creates a new AdminHandler.
func NewAdminHandler(coordinator *iam.Coordinator) *AdminHandler {
	return &AdminHandler{Coordinator: coordinator}
}

// toAdminUser converts a domain identity.User to an admin proto User.
func toAdminUser(u *identity.User) *adminidentityv1.User {
	return &adminidentityv1.User{
		Id:          string(u.ID),
		Email:       u.Email,
		Username:    u.Username,
		Name:        u.Name,
		AvatarUrl:   u.AvatarURL,
		Status:      string(u.Status),
		AccessLevel: adminAccessLevel(u.AccessLevel),
		Version:     u.Version,
		CreateTime:  timestamppb.New(u.CreateTime),
		UpdateTime:  timestamppb.New(u.UpdateTime),
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

	resp, err := h.Coordinator.ListUsers(ctx, filter)
	if err != nil {
		return nil, err
	}

	adminUsers := make([]*adminidentityv1.User, 0, len(resp.Users))
	for _, u := range resp.Users {
		adminUsers = append(adminUsers, toAdminUser(u))
	}

	return &adminidentityv1.ListUsersResponse{
		Users:         adminUsers,
		NextPageToken: resp.NextPageToken,
	}, nil
}

// ApproveUser activates a pending user account.
func (h *AdminHandler) ApproveUser(ctx context.Context, req *adminidentityv1.ApproveUserRequest) (*adminidentityv1.ApproveUserResponse, error) {
	resp, err := h.Coordinator.ApproveUser(ctx, &iam.ApproveUserRequest{
		UserID: req.GetUserId(),
	})
	if err != nil {
		return nil, err
	}

	return &adminidentityv1.ApproveUserResponse{
		User: toAdminUser(resp.User),
	}, nil
}

// RejectUser deactivates a pending user account.
func (h *AdminHandler) RejectUser(ctx context.Context, req *adminidentityv1.RejectUserRequest) (*adminidentityv1.ApproveUserResponse, error) {
	resp, err := h.Coordinator.RejectUser(ctx, &iam.RejectUserRequest{
		UserID: req.GetUserId(),
	})
	if err != nil {
		return nil, err
	}

	return &adminidentityv1.ApproveUserResponse{
		User: toAdminUser(resp.User),
	}, nil
}

// UpdateUserRole changes a user's access level.
func (h *AdminHandler) UpdateUserRole(ctx context.Context, req *adminidentityv1.UpdateUserRoleRequest) (*adminidentityv1.UpdateUserRoleResponse, error) {
	resp, err := h.Coordinator.UpdateUserRole(ctx, &iam.UpdateUserRoleRequest{
		UserID:      req.GetUserId(),
		AccessLevel: adminProtoToDomainAccessLevel(req.GetAccessLevel()),
	})
	if err != nil {
		return nil, err
	}

	return &adminidentityv1.UpdateUserRoleResponse{
		User: toAdminUser(resp.User),
	}, nil
}
