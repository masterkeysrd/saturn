package iam

import (
	"context"
	"slices"
	"time"

	"github.com/masterkeysrd/saturn/internal/domain/identity"
	"github.com/masterkeysrd/saturn/internal/domain/space"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

// CreateAPIKeyRequest contains parameters for creating a personal API key.
type CreateAPIKeyRequest struct {
	UserID      identity.UserID
	Name        string
	Description string
	Scopes      []string
	SpaceIDs    []string
	ExpiresAt   *time.Time
	IPAddress   string
	UserAgent   string
}

// GetAPIKeyRequest contains parameters for retrieving a personal API key.
type GetAPIKeyRequest struct {
	UserID identity.UserID
	ID     identity.APIKeyID
}

// ListAPIKeysRequest contains parameters for listing a user's personal API keys.
type ListAPIKeysRequest struct {
	UserID identity.UserID
}

// UpdateAPIKeyRequest contains parameters for updating a personal API key.
type UpdateAPIKeyRequest struct {
	UserID      identity.UserID
	ID          identity.APIKeyID
	Name        string
	Description string
	Scopes      []string
	SpaceIDs    []string
	UpdateMask  []string
	IPAddress   string
	UserAgent   string
}

// DeleteAPIKeyRequest contains parameters for deleting a personal API key.
type DeleteAPIKeyRequest struct {
	UserID    identity.UserID
	ID        identity.APIKeyID
	IPAddress string
	UserAgent string
}

// CreateAPIKey orchestrates creation of a user API key and its space grants within a transaction.
func (c *coordinator) CreateAPIKey(ctx context.Context, req *CreateAPIKeyRequest) (*identity.APIKey, error) {
	const op errors.Op = "application/iam.CreateAPIKey"

	if req == nil {
		return nil, errors.E(op, errors.Invalid, "request is required")
	}
	if len(req.SpaceIDs) == 0 {
		return nil, errors.E(op, errors.Invalid, "at least one space_id is required")
	}

	spaceIDs, err := toSpaceIDs(req.SpaceIDs)
	if err != nil {
		return nil, errors.E(op, err)
	}

	key, err := c.identityService.CreateAPIKey(ctx, identity.CreateAPIKeyParams{
		UserID:      req.UserID,
		Name:        req.Name,
		Description: req.Description,
		Scopes:      req.Scopes,
		ExpiresAt:   req.ExpiresAt,
		IPAddress:   req.IPAddress,
		UserAgent:   req.UserAgent,
	})
	if err != nil {
		return nil, errors.E(op, err)
	}

	if err := c.spaceService.SyncAPIKeyGrants(ctx, string(key.ID), space.UserID(req.UserID), spaceIDs); err != nil {
		return nil, errors.E(op, err)
	}

	granted, err := c.spaceService.ListAPIKeyGrantedSpaces(ctx, string(key.ID))
	if err != nil {
		return nil, errors.E(op, err)
	}
	key.SpaceIDs = fromSpaceIDs(granted)

	return key, nil
}

// GetAPIKey retrieves an API key owned by the user and populates its active space grants.
func (c *coordinator) GetAPIKey(ctx context.Context, req *GetAPIKeyRequest) (*identity.APIKey, error) {
	const op errors.Op = "application/iam.GetAPIKey"

	if req == nil {
		return nil, errors.E(op, errors.Invalid, "request is required")
	}

	key, err := c.identityService.GetAPIKey(ctx, req.UserID, req.ID)
	if err != nil {
		return nil, errors.E(op, err)
	}

	granted, err := c.spaceService.ListAPIKeyGrantedSpaces(ctx, string(key.ID))
	if err != nil {
		return nil, errors.E(op, err)
	}
	key.SpaceIDs = fromSpaceIDs(granted)

	return key, nil
}

// ListAPIKeys retrieves all API keys owned by the user and hydrates each with active space grants.
func (c *coordinator) ListAPIKeys(ctx context.Context, req *ListAPIKeysRequest) ([]*identity.APIKey, error) {
	const op errors.Op = "application/iam.ListAPIKeys"

	if req == nil {
		return nil, errors.E(op, errors.Invalid, "request is required")
	}

	keys, err := c.identityService.ListAPIKeys(ctx, req.UserID)
	if err != nil {
		return nil, errors.E(op, err)
	}
	if len(keys) == 0 {
		return keys, nil
	}

	keyIDs := make([]string, len(keys))
	for i, k := range keys {
		keyIDs[i] = string(k.ID)
	}

	grantsMap, err := c.spaceService.ListAPIKeysGrantedSpaces(ctx, keyIDs)
	if err != nil {
		return nil, errors.E(op, err)
	}

	for _, k := range keys {
		k.SpaceIDs = fromSpaceIDs(grantsMap[string(k.ID)])
	}

	return keys, nil
}

// UpdateAPIKey patches an API key's metadata/scopes and optionally synchronizes its space grants.
func (c *coordinator) UpdateAPIKey(ctx context.Context, req *UpdateAPIKeyRequest) (*identity.APIKey, error) {
	const op errors.Op = "application/iam.UpdateAPIKey"

	if req == nil {
		return nil, errors.E(op, errors.Invalid, "request is required")
	}

	key, err := c.identityService.UpdateAPIKey(ctx, identity.UpdateAPIKeyParams{
		UserID: req.UserID,
		ID:     req.ID,
		Incoming: &identity.APIKey{
			Name:        req.Name,
			Description: req.Description,
			Scopes:      req.Scopes,
		},
		Mask:      req.UpdateMask,
		IPAddress: req.IPAddress,
		UserAgent: req.UserAgent,
	})
	if err != nil {
		return nil, errors.E(op, err)
	}

	if len(req.UpdateMask) == 0 || slices.Contains(req.UpdateMask, "space_ids") {
		spaceIDs, err := toSpaceIDs(req.SpaceIDs)
		if err != nil {
			return nil, errors.E(op, err)
		}
		if err := c.spaceService.SyncAPIKeyGrants(ctx, string(key.ID), space.UserID(req.UserID), spaceIDs); err != nil {
			return nil, errors.E(op, err)
		}
	}

	granted, err := c.spaceService.ListAPIKeyGrantedSpaces(ctx, string(key.ID))
	if err != nil {
		return nil, errors.E(op, err)
	}
	key.SpaceIDs = fromSpaceIDs(granted)

	return key, nil
}

// DeleteAPIKey permanently removes a user's API key (cascading space grants).
func (c *coordinator) DeleteAPIKey(ctx context.Context, req *DeleteAPIKeyRequest) error {
	const op errors.Op = "application/iam.DeleteAPIKey"

	if req == nil {
		return errors.E(op, errors.Invalid, "request is required")
	}

	if err := c.identityService.DeleteAPIKey(ctx, identity.DeleteAPIKeyParams{
		UserID:    req.UserID,
		ID:        req.ID,
		IPAddress: req.IPAddress,
		UserAgent: req.UserAgent,
	}); err != nil {
		return errors.E(op, err)
	}
	return nil
}

func toSpaceIDs(raw []string) ([]space.SpaceID, error) {
	out := make([]space.SpaceID, len(raw))
	for i, s := range raw {
		parsed, err := space.ParseSpaceID(s)
		if err != nil {
			return nil, errors.E(errors.Invalid, err)
		}
		out[i] = parsed
	}
	return out, nil
}

func fromSpaceIDs(ids []space.SpaceID) []string {
	out := make([]string, len(ids))
	for i, id := range ids {
		out[i] = string(id)
	}
	return out
}
