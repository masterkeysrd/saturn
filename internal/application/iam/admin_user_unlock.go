package iam

import (
	"context"

	"github.com/masterkeysrd/saturn/internal/domain/identity"
)

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
