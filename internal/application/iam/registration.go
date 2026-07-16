package iam

import (
	"context"
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
	UserID     string
	Email      string
	Username   string
	Name       string
	AvatarURL  string
	Status     identity.UserStatus
	Version    int64
	CreateTime time.Time
	UpdateTime time.Time
}

// Register handles the registration flow: creates user, creates credential, returns response.
func (c *Coordinator) Register(ctx context.Context, req *RegisterUserRequest) (*RegisterUserResponse, error) {
	// 1. Generate user ID
	userID, err := identity.NewUserID()
	if err != nil {
		return nil, err
	}

	// 2. Create user
	user := &identity.User{
		ID:         userID,
		Email:      req.Email,
		Username:   req.Username,
		Name:       req.Name,
		AvatarURL:  req.AvatarURL,
		Status:     identity.UserStatusActive,
		CreateTime: time.Now(),
		UpdateTime: time.Now(),
	}

	if err := c.identityService.CreateUser(ctx, user); err != nil {
		return nil, err
	}

	// 3. Create credential (password)
	credential := &identity.Credential{
		UserID:     userID,
		AuthType:   "password",
		SecretData: req.Password,
	}

	if err := c.identityService.CreateCredential(ctx, credential); err != nil {
		return nil, err
	}

	// 4. Return the response
	return &RegisterUserResponse{
		UserID:     string(userID),
		Email:      user.Email,
		Username:   user.Username,
		Name:       user.Name,
		AvatarURL:  user.AvatarURL,
		Status:     user.Status,
		Version:    user.Version,
		CreateTime: user.CreateTime,
		UpdateTime: user.UpdateTime,
	}, nil
}
