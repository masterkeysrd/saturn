package iam

import (
	"context"
	"fmt"
	"time"

	"github.com/masterkeysrd/saturn/internal/domain/identity"
	"github.com/masterkeysrd/saturn/internal/domain/space"
	"github.com/masterkeysrd/saturn/internal/platform/paging"
)

// AdminCreateUserRequest represents the input for admin user creation.
type AdminCreateUserRequest struct {
	Email       string
	Username    string
	Name        string
	Password    string
	AccessLevel identity.AccessLevel
}

// AdminCreateUserResponse represents the output after admin user creation.
type AdminCreateUserResponse struct {
	UserID      string               `json:"user_id"`
	Email       string               `json:"email"`
	Username    string               `json:"username"`
	Name        string               `json:"name"`
	Status      identity.UserStatus  `json:"status"`
	AccessLevel identity.AccessLevel `json:"access_level"`
	Version     int64                `json:"version"`
	CreateTime  time.Time            `json:"create_time"`
	UpdateTime  time.Time            `json:"update_time"`
}

// AdminCreateUser creates a user by an admin. Users with admin access level are activated immediately,
// while regular users start in pending_approval state.
func (c *coordinator) AdminCreateUser(ctx context.Context, req *AdminCreateUserRequest) (*AdminCreateUserResponse, error) {
	// 1. Generate user ID
	userID, err := identity.NewUserID()
	if err != nil {
		return nil, err
	}

	// 2. Hash password before creating user
	encodedHash, err := c.passwordHasher.Hash(req.Password)
	if err != nil {
		return nil, fmt.Errorf("hash password: %w", err)
	}

	// 3. Determine status based on access level
	status := identity.UserStatusPendingApproval
	if req.AccessLevel == identity.AccessLevelAdmin {
		status = identity.UserStatusActive
	}

	// 4. Create user
	user := &identity.User{
		ID:          userID,
		Email:       req.Email,
		Username:    req.Username,
		Name:        req.Name,
		Status:      status,
		AccessLevel: req.AccessLevel,
		CreateTime:  time.Now(),
		UpdateTime:  time.Now(),
	}

	if err := c.identityService.CreateUser(ctx, user); err != nil {
		return nil, err
	}

	// 5. Create credential with hashed password
	credential := &identity.Credential{
		UserID:     userID,
		AuthType:   "password",
		SecretData: encodedHash,
	}

	if err := c.identityService.CreateCredential(ctx, credential); err != nil {
		return nil, err
	}

	// 6. Return the response
	return &AdminCreateUserResponse{
		UserID:      string(userID),
		Email:       user.Email,
		Username:    user.Username,
		Name:        user.Name,
		Status:      user.Status,
		AccessLevel: user.AccessLevel,
		Version:     user.Version,
		CreateTime:  user.CreateTime,
		UpdateTime:  user.UpdateTime,
	}, nil
}

// ApproveUserRequest represents the input for approving a user.
type ApproveUserRequest struct {
	UserID string
}

// ApproveUserResponse represents the output after approving a user.
type ApproveUserResponse struct {
	User *identity.User
}

// ApproveUser activates a pending user account.
func (c *coordinator) ApproveUser(ctx context.Context, req *ApproveUserRequest) (*ApproveUserResponse, error) {
	userID := identity.UserID(req.UserID)

	// Delegate to service layer for validation and execution
	user, err := c.identityService.ApproveUser(ctx, userID)
	if err != nil {
		return nil, err
	}

	// Create default workspace for approved user if space service is wired
	if c.spaceService != nil {
		defaultSpace := &space.Space{
			Name:        fmt.Sprintf("%s's Workspace", user.Username),
			Description: "My personal workspace",
			OwnerID:     space.SpaceID(userID),
		}
		if _, err := c.spaceService.CreateSpace(ctx, defaultSpace); err != nil {
			return nil, err
		}
	}

	return &ApproveUserResponse{
		User: user,
	}, nil
}

// RejectUserRequest represents the input for rejecting a user.
type RejectUserRequest struct {
	UserID string
}

// RejectUserResponse represents the output after rejecting a user.
type RejectUserResponse struct {
	User *identity.User
}

// RejectUser deactivates a pending user account by setting status to inactive.
func (c *coordinator) RejectUser(ctx context.Context, req *RejectUserRequest) (*RejectUserResponse, error) {
	userID := identity.UserID(req.UserID)

	// Delegate to service layer for validation and execution
	user, err := c.identityService.RejectUser(ctx, userID)
	if err != nil {
		return nil, err
	}

	return &RejectUserResponse{
		User: user,
	}, nil
}

// UpdateUserRoleRequest represents the input for updating a user's role.
type UpdateUserRoleRequest struct {
	UserID      string
	AccessLevel identity.AccessLevel
}

// UpdateUserRoleResponse represents the output after updating a user's role.
type UpdateUserRoleResponse struct {
	User *identity.User
}

// UpdateUserRole changes a user's access level by delegating to the service layer for validation and execution.
func (c *coordinator) UpdateUserRole(ctx context.Context, req *UpdateUserRoleRequest) (*UpdateUserRoleResponse, error) {
	userID := identity.UserID(req.UserID)

	// Delegate to service layer for validation and execution
	user, err := c.identityService.UpdateUserRole(ctx, userID, req.AccessLevel)
	if err != nil {
		return nil, err
	}

	return &UpdateUserRoleResponse{
		User: user,
	}, nil
}

// UnlockUserRequest represents the input for unlocking a user account.
type UnlockUserRequest struct {
	UserID string
}

// UnlockUserResponse represents the output after unlocking a user account.
type UnlockUserResponse struct {
	User *identity.User
}

// UnlockUser unlocks a locked user account and clears failed login attempts.
func (c *coordinator) UnlockUser(ctx context.Context, req *UnlockUserRequest) (*UnlockUserResponse, error) {
	userID := identity.UserID(req.UserID)

	user, err := c.identityService.UnlockUser(ctx, userID)
	if err != nil {
		return nil, err
	}

	return &UnlockUserResponse{
		User: user,
	}, nil
}

// ListUsersFilter encapsulates the filtering and pagination parameters for listing users.
type ListUsersFilter struct {
	PageSize      int32
	NextPageToken string
	StatusFilter  identity.UserStatus
	SearchQuery   string
}

// ListUsers returns users with optional filtering by status and search query, delegating validation to the service layer.
func (c *coordinator) ListUsers(ctx context.Context, filter *ListUsersFilter) (*paging.Page[*identity.User], error) {
	return c.identityService.ListUsers(ctx, &identity.ListUsersFilter{
		PageSize:      filter.PageSize,
		NextPageToken: filter.NextPageToken,
		StatusFilter:  filter.StatusFilter,
		SearchQuery:   filter.SearchQuery,
	})
}
