package aiapp

import (
	"context"
	"strings"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/ai"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

// UpdateSettings updates workspace AI model role defaults and governance configuration.
func (c *coordinator) UpdateSettings(ctx context.Context, req *UpdateSettingsRequest) (ai.Settings, error) {
	const op errors.Op = "application/ai.UpdateSettings"

	spaceID, err := requireSettingsAdmin(ctx, op)
	if err != nil {
		return ai.Settings{}, err
	}
	if req == nil || req.Settings == nil {
		return ai.Settings{}, errors.E(op, errors.Invalid, "settings payload is required")
	}

	entry, err := c.settings.GetOrDefault(ctx, spaceID, ai.DefaultSettings())
	if err != nil {
		return ai.Settings{}, errors.E(op, err)
	}

	current := entry.Value
	if err := current.ApplyPatch(req.Settings, req.UpdateMask); err != nil {
		return ai.Settings{}, errors.E(op, err)
	}

	if err := c.validateModelRoleRefs(ctx, spaceID, &current.Models); err != nil {
		return ai.Settings{}, errors.E(op, err)
	}

	entry.Value = current
	if err := c.settings.Save(ctx, entry); err != nil {
		return ai.Settings{}, errors.E(op, err)
	}
	return entry.Value, nil
}

func (c *coordinator) validateModelRoleRefs(ctx context.Context, spaceID string, roles *ai.ModelRoleSettings) error {
	check := func(ptr **string) error {
		if *ptr == nil {
			return nil
		}
		trimmed := strings.TrimSpace(**ptr)
		if trimmed == "" {
			*ptr = nil
			return nil
		}
		if _, err := c.store.Models().Get(ctx, spaceID, trimmed); err != nil {
			return err
		}
		*ptr = new(trimmed)
		return nil
	}
	if err := check(&roles.DefaultModelID); err != nil {
		return err
	}
	if err := check(&roles.FastModelID); err != nil {
		return err
	}
	return check(&roles.ReasoningModelID)
}

// CreateProvider persists a workspace LLM provider, auto-seeds curated models, and initializes AI settings.
func (c *coordinator) CreateProvider(ctx context.Context, req *CreateProviderRequest) (*ai.Provider, error) {
	const op errors.Op = "application/ai.CreateProvider"

	spaceID, err := requireSettingsAdmin(ctx, op)
	if err != nil {
		return nil, err
	}
	if req == nil {
		return nil, errors.E(op, errors.Invalid, "provider payload is required")
	}

	p := &ai.Provider{
		SpaceID:   spaceID,
		Name:      req.Name,
		Driver:    req.Driver,
		Config:    req.Config,
		Secret:    req.Secret.Clone(),
		IsEnabled: req.IsEnabled,
	}
	if err := p.Validate(c.allowPrivateNetworks); err != nil {
		return nil, errors.E(op, err)
	}

	if err := c.store.Providers().Create(ctx, p); err != nil {
		return nil, errors.E(op, err)
	}

	seeded, err := c.autoSeedProviderModels(ctx, spaceID, p)
	if err != nil {
		return nil, errors.E(op, err)
	}
	if len(seeded) > 0 {
		if err := c.initializeRoleDefaultsIfUnset(ctx, spaceID, p.Driver, seeded); err != nil {
			return nil, errors.E(op, err)
		}
	}

	return p, nil
}

// UpdateProvider applies masked updates or secret rotation to a workspace LLM provider.
func (c *coordinator) UpdateProvider(ctx context.Context, req *UpdateProviderRequest) (*ai.Provider, error) {
	const op errors.Op = "application/ai.UpdateProvider"

	spaceID, err := requireSettingsAdmin(ctx, op)
	if err != nil {
		return nil, err
	}
	if req == nil || strings.TrimSpace(req.ID) == "" || req.Provider == nil {
		return nil, errors.E(op, errors.Invalid, "provider id and payload are required")
	}

	existing, err := c.store.Providers().Get(ctx, spaceID, req.ID)
	if err != nil {
		return nil, errors.E(op, err)
	}

	if err := existing.ApplyPatch(req.Provider, req.UpdateMask, c.allowPrivateNetworks); err != nil {
		return nil, errors.E(op, err)
	}
	if err := c.store.Providers().Update(ctx, existing); err != nil {
		return nil, errors.E(op, err)
	}
	return existing, nil
}

// DeleteProvider removes a workspace LLM provider and clears any workspace role defaults pointing to its models.
func (c *coordinator) DeleteProvider(ctx context.Context, id string) error {
	const op errors.Op = "application/ai.DeleteProvider"

	spaceID, err := requireSettingsAdmin(ctx, op)
	if err != nil {
		return err
	}
	if strings.TrimSpace(id) == "" {
		return errors.E(op, errors.Invalid, "provider id is required")
	}

	models, err := c.store.Models().List(ctx, ai.ListModelsFilter{
		SpaceID:    spaceID,
		ProviderID: new(id),
	})
	if err != nil {
		return errors.E(op, err)
	}
	if len(models) > 0 {
		deletedIDs := make(map[string]struct{}, len(models))
		for _, m := range models {
			deletedIDs[m.ID] = struct{}{}
		}
		if err := c.clearRoleDefaultsForModels(ctx, spaceID, deletedIDs); err != nil {
			return errors.E(op, err)
		}
	}

	if err := c.store.Providers().Delete(ctx, spaceID, id); err != nil {
		return errors.E(op, err)
	}
	return nil
}

// TestProvider verifies connectivity and credentials for an LLM provider and persists its health status.
func (c *coordinator) TestProvider(ctx context.Context, id string) (*ai.Provider, error) {
	const op errors.Op = "application/ai.TestProvider"

	spaceID, err := requireSettingsAdmin(ctx, op)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(id) == "" {
		return nil, errors.E(op, errors.Invalid, "provider id is required")
	}

	p, err := c.store.Providers().Get(ctx, spaceID, id)
	if err != nil {
		return nil, errors.E(op, err)
	}

	now := c.nowFn()
	_, discErr := c.invoker.DiscoverModels(ctx, p)
	if discErr != nil {
		code := string(errors.CodeOf(discErr))
		if code == "" {
			code = string(ai.CodeProviderVerifyFailed)
		}
		p.Status = ai.ProviderStatus{
			State:          ai.ProviderStateUnhealthy,
			LastVerifiedAt: new(now),
			Error: &ai.ErrorDetail{
				Code:    new(code),
				Message: errors.UserMessage(discErr),
			},
		}
	} else {
		p.Status = ai.ProviderStatus{
			State:          ai.ProviderStateHealthy,
			LastVerifiedAt: new(now),
		}
	}

	if err := c.store.Providers().Update(ctx, p); err != nil {
		return nil, errors.E(op, err)
	}
	return p, nil
}

// DiscoverProviderModels queries upstream models for a provider and annotates registration status.
func (c *coordinator) DiscoverProviderModels(ctx context.Context, id string) ([]DiscoveredModelItem, error) {
	const op errors.Op = "application/ai.DiscoverProviderModels"

	spaceID, err := requireSettingsAdmin(ctx, op)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(id) == "" {
		return nil, errors.E(op, errors.Invalid, "provider id is required")
	}

	p, err := c.store.Providers().Get(ctx, spaceID, id)
	if err != nil {
		return nil, errors.E(op, err)
	}

	discovered, err := c.invoker.DiscoverModels(ctx, p)
	if err != nil {
		return nil, errors.E(op, err)
	}

	existing, err := c.store.Models().List(ctx, ai.ListModelsFilter{
		SpaceID:    spaceID,
		ProviderID: new(p.ID),
	})
	if err != nil {
		return nil, errors.E(op, err)
	}

	registered := make(map[string]struct{}, len(existing))
	for _, m := range existing {
		registered[m.ModelID] = struct{}{}
	}

	items := make([]DiscoveredModelItem, 0, len(discovered))
	for _, d := range discovered {
		_, already := registered[d.ModelID]
		items = append(items, DiscoveredModelItem{
			DiscoveredModel:   d,
			AlreadyRegistered: already,
		})
	}
	return items, nil
}

// SyncProviderModels imports upstream discovered or catalog models into the workspace model registry.
func (c *coordinator) SyncProviderModels(ctx context.Context, req *SyncProviderModelsRequest) (*SyncProviderModelsResult, error) {
	const op errors.Op = "application/ai.SyncProviderModels"

	spaceID, err := requireSettingsAdmin(ctx, op)
	if err != nil {
		return nil, err
	}
	if req == nil || strings.TrimSpace(req.ProviderID) == "" {
		return nil, errors.E(op, errors.Invalid, "provider_id is required")
	}

	p, err := c.store.Providers().Get(ctx, spaceID, req.ProviderID)
	if err != nil {
		return nil, errors.E(op, err)
	}

	existing, err := c.store.Models().List(ctx, ai.ListModelsFilter{
		SpaceID:    spaceID,
		ProviderID: new(p.ID),
	})
	if err != nil {
		return nil, errors.E(op, err)
	}
	registered := make(map[string]struct{}, len(existing))
	for _, m := range existing {
		registered[m.ModelID] = struct{}{}
	}

	discovered, discErr := c.invoker.DiscoverModels(ctx, p)
	discByID := make(map[string]ai.DiscoveredModel, len(discovered))
	for _, d := range discovered {
		discByID[d.ModelID] = d
	}

	var candidates []ai.DiscoveredModel
	var source ai.ModelSource
	if len(req.ModelIDs) > 0 {
		source = ai.ModelSourceDiscovered
		for _, mid := range req.ModelIDs {
			trimmed := strings.TrimSpace(mid)
			if trimmed == "" {
				continue
			}
			if d, ok := discByID[trimmed]; ok {
				candidates = append(candidates, d)
			} else if prof, name, found := ai.LookupLoomProfile(p.Driver, trimmed); found {
				candidates = append(candidates, ai.DiscoveredModel{
					ModelID:     trimmed,
					DisplayName: name,
					Profile:     prof,
				})
			} else {
				candidates = append(candidates, ai.DiscoveredModel{
					ModelID:     trimmed,
					DisplayName: trimmed,
				})
			}
		}
	} else if discErr == nil && len(discovered) > 0 {
		source = ai.ModelSourceDiscovered
		candidates = discovered
	} else {
		source = ai.ModelSourceCatalog
		for _, sp := range ai.DefaultSeedModelsForDriver(p.Driver) {
			candidates = append(candidates, ai.DiscoveredModel{
				ModelID:     sp.ModelID,
				DisplayName: sp.DisplayName,
				Profile:     sp.Profile,
			})
		}
		if len(candidates) == 0 && discErr != nil {
			return nil, errors.E(op, discErr)
		}
	}

	var (
		addedCount int32
		newlyAdded []*ai.Model
	)
	for _, cand := range candidates {
		if _, exists := registered[cand.ModelID]; exists {
			continue
		}
		m := &ai.Model{
			SpaceID:     spaceID,
			ProviderID:  p.ID,
			ModelID:     cand.ModelID,
			DisplayName: cand.DisplayName,
			Source:      source,
			Profile:     cand.Profile,
			Config: ai.GenerationConfig{
				Thinking: ai.ThinkingConfig{
					Enabled: cand.Profile.Capabilities.Reasoning || ai.InferReasoningCapability(cand.ModelID),
				},
			},
			IsEnabled: true,
		}
		if err := m.Validate(); err != nil {
			return nil, errors.E(op, err)
		}
		if err := c.store.Models().Create(ctx, m); err != nil {
			return nil, errors.E(op, err)
		}
		registered[cand.ModelID] = struct{}{}
		newlyAdded = append(newlyAdded, m)
		addedCount++
	}

	if len(newlyAdded) > 0 {
		if err := c.initializeRoleDefaultsIfUnset(ctx, spaceID, p.Driver, newlyAdded); err != nil {
			return nil, errors.E(op, err)
		}
	}

	allModels, err := c.store.Models().List(ctx, ai.ListModelsFilter{
		SpaceID:    spaceID,
		ProviderID: new(p.ID),
	})
	if err != nil {
		return nil, errors.E(op, err)
	}

	return &SyncProviderModelsResult{
		Models:     allModels,
		AddedCount: addedCount,
	}, nil
}

// PurgeExpiredRuns enforces each workspace's Governance.RunRetentionDays across all active spaces.
func (c *coordinator) PurgeExpiredRuns(ctx context.Context) error {
	const op errors.Op = "application/ai.PurgeExpiredRuns"

	spaceIDs, err := c.store.Runs().ListSpaceIDs(ctx)
	if err != nil {
		return errors.E(op, err)
	}

	now := c.nowFn().UTC()
	for _, spaceID := range spaceIDs {
		entry, sErr := c.settings.GetOrDefault(ctx, spaceID, ai.DefaultSettings())
		if sErr != nil {
			return errors.E(op, sErr)
		}
		retentionDays := entry.Value.Governance.RunRetentionDays
		if retentionDays <= 0 {
			continue
		}
		cutoff := now.Add(-time.Duration(retentionDays) * 24 * time.Hour)
		if _, pErr := c.store.Runs().PurgeExpired(ctx, spaceID, cutoff); pErr != nil {
			return errors.E(op, pErr)
		}
	}
	return nil
}

func (c *coordinator) autoSeedProviderModels(ctx context.Context, spaceID string, p *ai.Provider) ([]*ai.Model, error) {
	if p.Driver == ai.DriverOllama {
		if p.IsEnabled {
			if discovered, err := c.invoker.DiscoverModels(ctx, p); err == nil && len(discovered) > 0 {
				var seeded []*ai.Model
				for _, d := range discovered {
					m := &ai.Model{
						SpaceID:     spaceID,
						ProviderID:  p.ID,
						ModelID:     d.ModelID,
						DisplayName: d.DisplayName,
						Source:      ai.ModelSourceDiscovered,
						Profile:     d.Profile,
						Config: ai.GenerationConfig{
							Thinking: ai.ThinkingConfig{
								Enabled: d.Profile.Capabilities.Reasoning || ai.InferReasoningCapability(d.ModelID),
							},
						},
						IsEnabled: true,
					}
					if err := m.Validate(); err != nil {
						return nil, err
					}
					if err := c.store.Models().Create(ctx, m); err != nil {
						return nil, err
					}
					seeded = append(seeded, m)
				}
				return seeded, nil
			}
		}
		return nil, nil
	}

	specs := ai.DefaultSeedModelsForDriver(p.Driver)
	if len(specs) == 0 {
		return nil, nil
	}

	seeded := make([]*ai.Model, 0, len(specs))
	for _, sp := range specs {
		m := &ai.Model{
			SpaceID:     spaceID,
			ProviderID:  p.ID,
			ModelID:     sp.ModelID,
			DisplayName: sp.DisplayName,
			Source:      ai.ModelSourceCatalog,
			Profile:     sp.Profile,
			Config: ai.GenerationConfig{
				Thinking: ai.ThinkingConfig{
					Enabled: sp.Profile.Capabilities.Reasoning || ai.InferReasoningCapability(sp.ModelID),
				},
			},
			IsEnabled: true,
		}
		if err := m.Validate(); err != nil {
			return nil, err
		}
		if err := c.store.Models().Create(ctx, m); err != nil {
			return nil, err
		}
		seeded = append(seeded, m)
	}
	return seeded, nil
}

func (c *coordinator) initializeRoleDefaultsIfUnset(ctx context.Context, spaceID string, driver ai.Driver, seeded []*ai.Model) error {
	if len(seeded) == 0 {
		return nil
	}
	entry, err := c.settings.GetOrDefault(ctx, spaceID, ai.DefaultSettings())
	if err != nil {
		return err
	}

	defaults := ai.RoleDefaultsForSeededModels(driver, seeded)
	changed := false
	if entry.Value.Models.DefaultModelID == nil && defaults.DefaultModelID != nil {
		entry.Value.Models.DefaultModelID = defaults.DefaultModelID
		changed = true
	}
	if entry.Value.Models.FastModelID == nil && defaults.FastModelID != nil {
		entry.Value.Models.FastModelID = defaults.FastModelID
		changed = true
	}
	if entry.Value.Models.ReasoningModelID == nil && defaults.ReasoningModelID != nil {
		entry.Value.Models.ReasoningModelID = defaults.ReasoningModelID
		changed = true
	}
	if !changed {
		return nil
	}
	return c.settings.Save(ctx, entry)
}

func (c *coordinator) clearRoleDefaultsForModels(ctx context.Context, spaceID string, deletedIDs map[string]struct{}) error {
	if len(deletedIDs) == 0 {
		return nil
	}
	entry, err := c.settings.GetOrDefault(ctx, spaceID, ai.DefaultSettings())
	if err != nil {
		return err
	}
	changed := false
	clearIfMatched := func(ptr **string) {
		if *ptr != nil {
			if _, ok := deletedIDs[**ptr]; ok {
				*ptr = nil
				changed = true
			}
		}
	}
	clearIfMatched(&entry.Value.Models.DefaultModelID)
	clearIfMatched(&entry.Value.Models.FastModelID)
	clearIfMatched(&entry.Value.Models.ReasoningModelID)
	if !changed {
		return nil
	}
	return c.settings.Save(ctx, entry)
}
