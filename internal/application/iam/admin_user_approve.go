package iam

import (
	"context"
	"fmt"

	"github.com/masterkeysrd/saturn/internal/domain/identity"
	"github.com/masterkeysrd/saturn/internal/domain/space"
)

// ApproveUserRequest represents the input for approving a user.
type ApproveUserRequest struct {
	UserID string
}

// ApproveUserResponse represents the output after approving a user.
type ApproveUserResponse struct {
	User *identity.User
}

// ApproveUser activates a pending user account.
func (c *Coordinator) ApproveUser(ctx context.Context, req *ApproveUserRequest) (*ApproveUserResponse, error) {
	userID := identity.UserID(req.UserID)

	// Delegate to service layer for validation and execution
	user, err := c.identityService.ApproveUser(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("approve user: %w", err)
	}

	// Create default workspace for approved user if space service is wired
	if c.spaceService != nil {
		defaultSpace := &space.Space{
			Name:        fmt.Sprintf("%s's Workspace", user.Username),
			Description: "My personal workspace",
			OwnerID:     space.SpaceID(userID),
		}
		if _, err := c.spaceService.CreateSpace(ctx, defaultSpace); err != nil {
			return nil, fmt.Errorf("create default workspace: %w", err)
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
func (c *Coordinator) RejectUser(ctx context.Context, req *RejectUserRequest) (*RejectUserResponse, error) {
	userID := identity.UserID(req.UserID)

	// Delegate to service layer for validation and execution
	user, err := c.identityService.RejectUser(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("reject user: %w", err)
	}

	return &RejectUserResponse{
		User: user,
	}, nil
}
