package iam

import (
	"context"
	"fmt"
	"time"

	"github.com/masterkeysrd/saturn/internal/domain/identity"
)

// RegisterUserRequest represents the input for user registration.
type RegisterUserRequest struct {
	Email     string
	Username  string
	Name      string
	AvatarURL string
	Password  string
}

// RegisterUserResponse represents the output after user registration.
type RegisterUserResponse struct {
	UserID      string               `json:"user_id"`
	Email       string               `json:"email"`
	Username    string               `json:"username"`
	Name        string               `json:"name"`
	AvatarURL   string               `json:"avatar_url,omitempty"`
	Status      identity.UserStatus  `json:"status"`
	AccessLevel identity.AccessLevel `json:"access_level"`
	Version     int64                `json:"version"`
	CreateTime  time.Time            `json:"create_time"`
	UpdateTime  time.Time            `json:"update_time"`
}

// Register handles the registration flow: creates user, creates credential, returns response.
func (c *Coordinator) Register(ctx context.Context, req *RegisterUserRequest) (*RegisterUserResponse, error) {
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

	// 3. Create user
	user := &identity.User{
		ID:          userID,
		Email:       req.Email,
		Username:    req.Username,
		Name:        req.Name,
		AvatarURL:   req.AvatarURL,
		Status:      identity.UserStatusPendingApproval,
		AccessLevel: identity.AccessLevelUser,
		CreateTime:  time.Now(),
		UpdateTime:  time.Now(),
	}

	if err := c.identityService.CreateUser(ctx, user); err != nil {
		return nil, err
	}

	// 4. Create credential with hashed password
	credential := &identity.Credential{
		UserID:     userID,
		AuthType:   "password",
		SecretData: encodedHash,
	}

	if err := c.identityService.CreateCredential(ctx, credential); err != nil {
		return nil, err
	}

	// 5. Return the response
	return &RegisterUserResponse{
		UserID:      string(userID),
		Email:       user.Email,
		Username:    user.Username,
		Name:        user.Name,
		AvatarURL:   user.AvatarURL,
		Status:      user.Status,
		AccessLevel: user.AccessLevel,
		Version:     user.Version,
		CreateTime:  user.CreateTime,
		UpdateTime:  user.UpdateTime,
	}, nil
}
