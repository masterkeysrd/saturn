package iam

import (
	"context"

	"github.com/masterkeysrd/saturn/internal/domain/identity"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

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
