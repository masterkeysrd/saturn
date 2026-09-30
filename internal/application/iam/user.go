package iam

import (
	"context"
	"fmt"
	"time"

	"github.com/masterkeysrd/saturn/internal/domain/identity"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
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

// UpdateProfileRequest represents parameters for modifying a user profile.
type UpdateProfileRequest struct {
	UserID    string
	Name      *string
	AvatarURL *string
}

// ChangeEmailRequest represents parameters for updating the user's primary email.
type ChangeEmailRequest struct {
	UserID          string
	NewEmail        string
	CurrentPassword string
	TOTPCode        string
	IPAddress       string
	UserAgent       string
}

// DeleteAccountRequest represents parameters for permanently deleting and anonymizing an account.
type DeleteAccountRequest struct {
	UserID          string
	CurrentPassword string
	TOTPCode        string
	IPAddress       string
	UserAgent       string
}

// Register handles the registration flow: creates user, creates credential, returns response.
func (c *coordinator) Register(ctx context.Context, req *RegisterUserRequest) (*RegisterUserResponse, error) {
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

// UpdateProfile updates the profile information (display name, avatar URL) for the given user.
func (c *coordinator) UpdateProfile(ctx context.Context, req *UpdateProfileRequest) (*identity.User, error) {
	const op errors.Op = "application/iam.UpdateProfile"

	if req == nil {
		return nil, errors.E(op, errors.Invalid, "request is required")
	}
	if req.UserID == "" {
		return nil, errors.E(op, errors.Invalid, identity.InvalidUserID, "user id is required")
	}

	return c.identityService.UpdateProfile(ctx, identity.UpdateProfileParams{
		UserID:    identity.UserID(req.UserID),
		Name:      req.Name,
		AvatarURL: req.AvatarURL,
	})
}

// ChangeEmail updates the primary email for the given user, verifying password and step-up MFA.
func (c *coordinator) ChangeEmail(ctx context.Context, req *ChangeEmailRequest) (*identity.User, error) {
	const op errors.Op = "application/iam.ChangeEmail"

	if req == nil {
		return nil, errors.E(op, errors.Invalid, "request is required")
	}
	if req.UserID == "" {
		return nil, errors.E(op, errors.Invalid, identity.InvalidUserID, "user id is required")
	}
	if req.NewEmail == "" {
		return nil, errors.E(op, errors.Invalid, "new email is required")
	}
	if req.CurrentPassword == "" {
		return nil, errors.E(op, errors.Invalid, "current password is required")
	}

	return c.identityService.ChangeEmail(ctx, identity.ChangeEmailParams{
		UserID:          identity.UserID(req.UserID),
		NewEmail:        req.NewEmail,
		CurrentPassword: req.CurrentPassword,
		TOTPCode:        req.TOTPCode,
		IPAddress:       req.IPAddress,
		UserAgent:       req.UserAgent,
	})
}

// DeleteAccount permanently revokes credentials, sessions, factors and anonymizes the user account.
func (c *coordinator) DeleteAccount(ctx context.Context, req *DeleteAccountRequest) error {
	const op errors.Op = "application/iam.DeleteAccount"

	if req == nil {
		return errors.E(op, errors.Invalid, "request is required")
	}
	if req.UserID == "" {
		return errors.E(op, errors.Invalid, identity.InvalidUserID, "user id is required")
	}
	if req.CurrentPassword == "" {
		return errors.E(op, errors.Invalid, "current password is required")
	}

	return c.identityService.DeleteAccount(ctx, identity.DeleteAccountParams{
		UserID:          identity.UserID(req.UserID),
		CurrentPassword: req.CurrentPassword,
		TOTPCode:        req.TOTPCode,
		IPAddress:       req.IPAddress,
		UserAgent:       req.UserAgent,
	})
}
