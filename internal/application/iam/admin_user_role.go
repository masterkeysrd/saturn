package iam

import (
	"context"
	"fmt"

	"github.com/masterkeysrd/saturn/internal/domain/identity"
)

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
func (c *Coordinator) UpdateUserRole(ctx context.Context, req *UpdateUserRoleRequest) (*UpdateUserRoleResponse, error) {
	userID := identity.UserID(req.UserID)

	// Delegate to service layer for validation and execution
	user, err := c.identityService.UpdateUserRole(ctx, userID, req.AccessLevel)
	if err != nil {
		return nil, fmt.Errorf("update user role: %w", err)
	}

	return &UpdateUserRoleResponse{
		User: user,
	}, nil
}
