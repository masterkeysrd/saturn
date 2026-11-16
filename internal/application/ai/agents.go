package aiapp

import (
	"context"
	"strings"

	"github.com/masterkeysrd/saturn/internal/platform/ai"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

// CreateAgent creates a custom workspace AI agent with optional MCP server bindings.
func (c *coordinator) CreateAgent(ctx context.Context, req *CreateAgentRequest) (*ai.Agent, error) {
	const op errors.Op = "application/ai.CreateAgent"

	spaceID, err := requireSettingsAdmin(ctx, op)
	if err != nil {
		return nil, err
	}
	if req == nil {
		return nil, errors.E(op, errors.Invalid, "agent payload is required")
	}

	if err := c.validateAgentReferences(ctx, spaceID, req.ModelID, req.Config.MCPBindings); err != nil {
		return nil, errors.E(op, err)
	}

	a := &ai.Agent{
		SpaceID:     spaceID,
		Slug:        req.Slug,
		Name:        req.Name,
		Description: req.Description,
		Tags:        req.Tags,
		ModelID:     req.ModelID,
		Config:      req.Config,
		IsEnabled:   req.IsEnabled,
		Version:     1,
	}
	if err := a.Validate(); err != nil {
		return nil, errors.E(op, err)
	}

	if err := c.store.Agents().Create(ctx, a); err != nil {
		return nil, errors.E(op, err)
	}
	return a, nil
}

// UpdateAgent applies masked updates to an existing workspace AI agent.
func (c *coordinator) UpdateAgent(ctx context.Context, req *UpdateAgentRequest) (*ai.Agent, error) {
	const op errors.Op = "application/ai.UpdateAgent"

	spaceID, err := requireSettingsAdmin(ctx, op)
	if err != nil {
		return nil, err
	}
	if req == nil || strings.TrimSpace(req.ID) == "" || req.Agent == nil {
		return nil, errors.E(op, errors.Invalid, "agent id and payload are required")
	}

	existing, err := c.resolveAgentForSpace(ctx, spaceID, req.ID)
	if err != nil {
		return nil, errors.E(op, err)
	}

	if err := existing.ApplyPatch(req.Agent, req.UpdateMask); err != nil {
		return nil, errors.E(op, err)
	}

	if err := c.validateAgentReferences(ctx, spaceID, existing.ModelID, existing.Config.MCPBindings); err != nil {
		return nil, errors.E(op, err)
	}

	existing.Version++
	if err := c.store.Agents().Update(ctx, existing); err != nil {
		return nil, errors.E(op, err)
	}
	return existing, nil
}

// DeleteAgent deletes a custom agent while protecting built-in system agents.
func (c *coordinator) DeleteAgent(ctx context.Context, id string) error {
	const op errors.Op = "application/ai.DeleteAgent"

	spaceID, err := requireSettingsAdmin(ctx, op)
	if err != nil {
		return err
	}
	if strings.TrimSpace(id) == "" {
		return errors.E(op, errors.Invalid, "agent id is required")
	}

	existing, err := c.resolveAgentForSpace(ctx, spaceID, id)
	if err != nil {
		return errors.E(op, err)
	}
	if err := existing.EnsureDeletable(); err != nil {
		return errors.E(op, err)
	}

	if err := c.store.Agents().Delete(ctx, spaceID, existing.ID); err != nil {
		return errors.E(op, err)
	}
	return nil
}

// ResetAgent restores a built-in system agent back to its factory blueprint defaults.
func (c *coordinator) ResetAgent(ctx context.Context, id string) (*ai.Agent, error) {
	const op errors.Op = "application/ai.ResetAgent"

	spaceID, err := requireSettingsAdmin(ctx, op)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(id) == "" {
		return nil, errors.E(op, errors.Invalid, "agent id is required")
	}

	mcpSrv, _, err := c.ensureSystemRecords(ctx, spaceID)
	if err != nil {
		return nil, errors.E(op, err)
	}

	existing, err := c.store.Agents().Get(ctx, spaceID, id)
	if err != nil {
		return nil, errors.E(op, err)
	}
	if !existing.IsSystem || existing.SystemKey == nil || *existing.SystemKey != ai.SystemSaturnAssistantKey {
		return nil, errors.E(op, errors.Invalid, "only built-in system agents can be reset")
	}

	bp := ai.SystemAssistantBlueprint(spaceID, mcpSrv.ID)
	existing.Name = bp.Name
	existing.Description = bp.Description
	existing.Tags = bp.Tags
	existing.ModelID = bp.ModelID
	existing.Config = bp.Config
	existing.IsEnabled = true
	existing.Version++
	existing.UpdateTime = c.nowFn()

	if err := c.store.Agents().Update(ctx, existing); err != nil {
		return nil, errors.E(op, err)
	}
	return existing, nil
}

func (c *coordinator) resolveAgentForSpace(ctx context.Context, spaceID, idOrKey string) (*ai.Agent, error) {
	agent, err := c.store.Agents().Get(ctx, spaceID, idOrKey)
	if err != nil && strings.HasPrefix(idOrKey, "system.") && (errors.Is(err, ai.ErrAgentNotFound) || errors.Is(err, errors.NotExist)) {
		if _, _, seedErr := c.ensureSystemRecords(ctx, spaceID); seedErr != nil {
			return nil, seedErr
		}
		return c.store.Agents().Get(ctx, spaceID, idOrKey)
	}
	return agent, err
}

func (c *coordinator) validateAgentReferences(ctx context.Context, spaceID string, modelID *string, bindings []ai.MCPBinding) error {
	if modelID != nil && strings.TrimSpace(*modelID) != "" {
		if _, err := c.store.Models().Get(ctx, spaceID, strings.TrimSpace(*modelID)); err != nil {
			return err
		}
	}
	for _, b := range bindings {
		if strings.TrimSpace(b.MCPServerID) == "" {
			return errors.E(errors.Invalid, "mcp_binding.mcp_server_id is required")
		}
		if _, err := c.store.MCPServers().Get(ctx, spaceID, b.MCPServerID); err != nil {
			return err
		}
	}
	return nil
}
