package aiapp

import (
	"context"
	"strings"

	"github.com/masterkeysrd/saturn/internal/platform/ai"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

// CreateModel registers a custom or catalog AI model under an existing workspace provider.
func (c *coordinator) CreateModel(ctx context.Context, req *CreateModelRequest) (*ai.Model, error) {
	const op errors.Op = "application/ai.CreateModel"

	spaceID, err := requireSettingsAdmin(ctx, op)
	if err != nil {
		return nil, err
	}
	if req == nil {
		return nil, errors.E(op, errors.Invalid, "model payload is required")
	}

	prov, err := c.store.Providers().Get(ctx, spaceID, strings.TrimSpace(req.ProviderID))
	if err != nil {
		return nil, errors.E(op, err)
	}

	source := req.Source
	if source == "" {
		source = ai.ModelSourceCustom
	}

	profile := req.Profile
	displayName := strings.TrimSpace(req.DisplayName)
	if prof, catalogName, found := ai.LookupLoomProfile(prov.Driver, req.ModelID); found {
		if isEmptyProfile(profile) {
			profile = prof
		}
		if displayName == "" {
			displayName = catalogName
		}
	}

	m := &ai.Model{
		SpaceID:     spaceID,
		ProviderID:  prov.ID,
		ModelID:     req.ModelID,
		DisplayName: displayName,
		Source:      source,
		Profile:     profile,
		Config:      req.Config,
		IsEnabled:   req.IsEnabled,
	}
	if err := m.Validate(); err != nil {
		return nil, errors.E(op, err)
	}

	if err := c.store.Models().Create(ctx, m); err != nil {
		return nil, errors.E(op, err)
	}

	if err := c.initializeRoleDefaultsIfUnset(ctx, spaceID, prov.Driver, []*ai.Model{m}); err != nil {
		return nil, errors.E(op, err)
	}

	return m, nil
}

// UpdateModel applies masked updates to a registered workspace AI model.
func (c *coordinator) UpdateModel(ctx context.Context, req *UpdateModelRequest) (*ai.Model, error) {
	const op errors.Op = "application/ai.UpdateModel"

	spaceID, err := requireSettingsAdmin(ctx, op)
	if err != nil {
		return nil, err
	}
	if req == nil || strings.TrimSpace(req.ID) == "" || req.Model == nil {
		return nil, errors.E(op, errors.Invalid, "model id and payload are required")
	}

	existing, err := c.store.Models().Get(ctx, spaceID, req.ID)
	if err != nil {
		return nil, errors.E(op, err)
	}

	if err := existing.ApplyPatch(req.Model, req.UpdateMask); err != nil {
		return nil, errors.E(op, err)
	}
	if err := c.store.Models().Update(ctx, existing); err != nil {
		return nil, errors.E(op, err)
	}
	return existing, nil
}

// DeleteModel removes a registered AI model and clears any workspace role defaults referencing it.
func (c *coordinator) DeleteModel(ctx context.Context, id string) error {
	const op errors.Op = "application/ai.DeleteModel"

	spaceID, err := requireSettingsAdmin(ctx, op)
	if err != nil {
		return err
	}
	if strings.TrimSpace(id) == "" {
		return errors.E(op, errors.Invalid, "model id is required")
	}

	if err := c.clearRoleDefaultsForModels(ctx, spaceID, map[string]struct{}{id: {}}); err != nil {
		return errors.E(op, err)
	}

	if err := c.store.Models().Delete(ctx, spaceID, id); err != nil {
		return errors.E(op, err)
	}
	return nil
}

func isEmptyProfile(p ai.ModelProfile) bool {
	return !p.Capabilities.ToolCalling &&
		!p.Capabilities.Vision &&
		!p.Capabilities.Document &&
		!p.Capabilities.Audio &&
		!p.Capabilities.Reasoning &&
		!p.Capabilities.StructuredOutput &&
		!p.Capabilities.Streaming &&
		p.Limits.ContextWindow == 0 &&
		p.Limits.MaxOutputTokens == 0 &&
		p.Pricing.InputPerMillionUSD == 0 &&
		p.Pricing.OutputPerMillionUSD == 0 &&
		p.Pricing.CachedInputPerMillionUSD == 0
}
