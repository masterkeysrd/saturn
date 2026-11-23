package space

import (
	"context"

	"github.com/masterkeysrd/saturn/internal/domain/identity"
	"github.com/masterkeysrd/saturn/internal/domain/space"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

// CreateSpaceOAuthClientRequest contains parameters for creating a Workspace-scoped OAuth client.
type CreateSpaceOAuthClientRequest struct {
	SpaceID                 string
	UserID                  string
	Name                    string
	Description             string
	RedirectURIs            []string
	AllowedScopes           []string
	TokenEndpointAuthMethod identity.TokenEndpointAuthMethod
	RefreshTokenPolicy      identity.RefreshTokenPolicy
	IPAddress               string
	UserAgent               string
}

// UpdateSpaceOAuthClientRequest contains parameters for updating a Workspace-scoped OAuth client.
type UpdateSpaceOAuthClientRequest struct {
	SpaceID                 string
	UserID                  string
	ClientID                identity.OAuthClientID
	Name                    string
	Description             string
	RedirectURIs            []string
	AllowedScopes           []string
	TokenEndpointAuthMethod identity.TokenEndpointAuthMethod
	RefreshTokenPolicy      identity.RefreshTokenPolicy
	UpdateMask              []string
}

// RotateSpaceOAuthClientSecretRequest contains parameters for rotating a Workspace OAuth client's secret.
type RotateSpaceOAuthClientSecretRequest struct {
	SpaceID  string
	UserID   string
	ClientID identity.OAuthClientID
}

// DeleteSpaceOAuthClientRequest contains parameters for deleting a Workspace OAuth client.
type DeleteSpaceOAuthClientRequest struct {
	SpaceID   string
	UserID    string
	ClientID  identity.OAuthClientID
	IPAddress string
	UserAgent string
}

// RevokeSpaceOAuthGrantRequest contains parameters for revoking a user's OAuth grant in a Workspace.
type RevokeSpaceOAuthGrantRequest struct {
	SpaceID string
	UserID  string
	GrantID identity.OAuthGrantID
}

// CreateSpaceOAuthClient registers a new Workspace-scoped OAuth client (Space admin/owner only).
func (c *coordinator) CreateSpaceOAuthClient(ctx context.Context, req *CreateSpaceOAuthClientRequest) (*identity.OAuthClient, error) {
	const op errors.Op = "application/space.CreateSpaceOAuthClient"

	if req == nil {
		return nil, errors.E(op, errors.Invalid, "request is required")
	}

	session := space.Session{
		SpaceID: space.SpaceID(req.SpaceID),
		UserID:  space.UserID(req.UserID),
	}
	if _, err := c.spaceService.AuthorizeSpaceAdmin(ctx, session); err != nil {
		return nil, errors.E(op, err)
	}

	actorID := identity.UserID(req.UserID)
	client, err := c.identityService.CreateOAuthClient(ctx, identity.CreateOAuthClientParams{
		SpaceID:                 new(req.SpaceID),
		Name:                    req.Name,
		Description:             req.Description,
		RedirectURIs:            req.RedirectURIs,
		AllowedScopes:           req.AllowedScopes,
		TokenEndpointAuthMethod: req.TokenEndpointAuthMethod,
		RefreshTokenPolicy:      req.RefreshTokenPolicy,
		RegistrationSource:      identity.RegistrationSourceSpace,
		ActorUserID:             &actorID,
		IPAddress:               req.IPAddress,
		UserAgent:               req.UserAgent,
	})
	if err != nil {
		return nil, errors.E(op, err)
	}
	return client, nil
}

// UpdateSpaceOAuthClient updates a Workspace-scoped OAuth client (Space admin/owner only).
func (c *coordinator) UpdateSpaceOAuthClient(ctx context.Context, req *UpdateSpaceOAuthClientRequest) (*identity.OAuthClient, error) {
	const op errors.Op = "application/space.UpdateSpaceOAuthClient"

	if req == nil {
		return nil, errors.E(op, errors.Invalid, "request is required")
	}

	session := space.Session{
		SpaceID: space.SpaceID(req.SpaceID),
		UserID:  space.UserID(req.UserID),
	}
	if _, err := c.spaceService.AuthorizeSpaceAdmin(ctx, session); err != nil {
		return nil, errors.E(op, err)
	}

	client, err := c.identityService.UpdateOAuthClient(ctx, identity.UpdateOAuthClientParams{
		ID:      req.ClientID,
		SpaceID: new(req.SpaceID),
		Incoming: &identity.OAuthClient{
			Name:                    req.Name,
			Description:             req.Description,
			RedirectURIs:            req.RedirectURIs,
			AllowedScopes:           req.AllowedScopes,
			TokenEndpointAuthMethod: req.TokenEndpointAuthMethod,
			RefreshTokenPolicy:      req.RefreshTokenPolicy,
		},
		Mask: req.UpdateMask,
	})
	if err != nil {
		return nil, errors.E(op, err)
	}
	return client, nil
}

// RotateSpaceOAuthClientSecret rotates the secret of a Workspace-scoped OAuth client (Space admin/owner only).
func (c *coordinator) RotateSpaceOAuthClientSecret(ctx context.Context, req *RotateSpaceOAuthClientSecretRequest) (*identity.OAuthClient, error) {
	const op errors.Op = "application/space.RotateSpaceOAuthClientSecret"

	if req == nil {
		return nil, errors.E(op, errors.Invalid, "request is required")
	}

	session := space.Session{
		SpaceID: space.SpaceID(req.SpaceID),
		UserID:  space.UserID(req.UserID),
	}
	if _, err := c.spaceService.AuthorizeSpaceAdmin(ctx, session); err != nil {
		return nil, errors.E(op, err)
	}

	client, err := c.identityService.RotateOAuthClientSecret(ctx, req.ClientID, new(req.SpaceID), false)
	if err != nil {
		return nil, errors.E(op, err)
	}
	return client, nil
}

// DeleteSpaceOAuthClient deletes a Workspace-scoped OAuth client (Space admin/owner only).
func (c *coordinator) DeleteSpaceOAuthClient(ctx context.Context, req *DeleteSpaceOAuthClientRequest) error {
	const op errors.Op = "application/space.DeleteSpaceOAuthClient"

	if req == nil {
		return errors.E(op, errors.Invalid, "request is required")
	}

	session := space.Session{
		SpaceID: space.SpaceID(req.SpaceID),
		UserID:  space.UserID(req.UserID),
	}
	if _, err := c.spaceService.AuthorizeSpaceAdmin(ctx, session); err != nil {
		return errors.E(op, err)
	}

	actorID := identity.UserID(req.UserID)
	if err := c.identityService.DeleteOAuthClient(ctx, req.ClientID, new(req.SpaceID), false, &actorID, req.IPAddress, req.UserAgent); err != nil {
		return errors.E(op, err)
	}
	return nil
}

// RevokeSpaceOAuthGrant revokes an active OAuth grant targeting the workspace (Space admin/owner only).
func (c *coordinator) RevokeSpaceOAuthGrant(ctx context.Context, req *RevokeSpaceOAuthGrantRequest) error {
	const op errors.Op = "application/space.RevokeSpaceOAuthGrant"

	if req == nil {
		return errors.E(op, errors.Invalid, "request is required")
	}

	session := space.Session{
		SpaceID: space.SpaceID(req.SpaceID),
		UserID:  space.UserID(req.UserID),
	}
	if _, err := c.spaceService.AuthorizeSpaceAdmin(ctx, session); err != nil {
		return errors.E(op, err)
	}

	if err := c.identityService.RevokeSpaceOAuthGrant(ctx, req.SpaceID, req.GrantID); err != nil {
		return errors.E(op, err)
	}
	return nil
}
