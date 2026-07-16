package iam

import (
	"context"
	"fmt"
	"time"

	"github.com/masterkeysrd/saturn/internal/domain/identity"
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
func (c *Coordinator) AdminCreateUser(ctx context.Context, req *AdminCreateUserRequest) (*AdminCreateUserResponse, error) {
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
