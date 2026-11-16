package aiapp

import (
	"context"
	"strings"

	"github.com/masterkeysrd/saturn/internal/platform/ai"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

// CreateMCPServer registers an external remote HTTP MCP server in the workspace.
func (c *coordinator) CreateMCPServer(ctx context.Context, req *CreateMCPServerRequest) (*ai.MCPServer, error) {
	const op errors.Op = "application/ai.CreateMCPServer"

	spaceID, err := requireSettingsAdmin(ctx, op)
	if err != nil {
		return nil, err
	}
	if req == nil {
		return nil, errors.E(op, errors.Invalid, "mcp_server payload is required")
	}

	srv := &ai.MCPServer{
		SpaceID:     spaceID,
		Slug:        req.Slug,
		Name:        req.Name,
		Description: req.Description,
		Transport:   ai.TransportHTTP,
		Config:      req.Config,
		AuthSecret:  req.AuthSecret.Clone(),
		IsEnabled:   req.IsEnabled,
	}
	if err := srv.Validate(c.allowPrivateNetworks); err != nil {
		return nil, errors.E(op, err)
	}

	if err := c.store.MCPServers().Create(ctx, srv); err != nil {
		return nil, errors.E(op, err)
	}
	return srv, nil
}

// UpdateMCPServer applies masked updates or secret rotation to an MCP server.
func (c *coordinator) UpdateMCPServer(ctx context.Context, req *UpdateMCPServerRequest) (*ai.MCPServer, error) {
	const op errors.Op = "application/ai.UpdateMCPServer"

	spaceID, err := requireSettingsAdmin(ctx, op)
	if err != nil {
		return nil, err
	}
	if req == nil || strings.TrimSpace(req.ID) == "" || req.MCPServer == nil {
		return nil, errors.E(op, errors.Invalid, "mcp_server id and payload are required")
	}

	existing, err := c.resolveMCPServerForAdmin(ctx, spaceID, req.ID)
	if err != nil {
		return nil, errors.E(op, err)
	}

	if err := existing.ApplyPatch(req.MCPServer, req.UpdateMask, c.allowPrivateNetworks); err != nil {
		return nil, errors.E(op, err)
	}
	if err := c.store.MCPServers().Update(ctx, existing); err != nil {
		return nil, errors.E(op, err)
	}
	return existing, nil
}

// DeleteMCPServer deletes a user-configured MCP server while protecting built-in system servers.
func (c *coordinator) DeleteMCPServer(ctx context.Context, id string) error {
	const op errors.Op = "application/ai.DeleteMCPServer"

	spaceID, err := requireSettingsAdmin(ctx, op)
	if err != nil {
		return err
	}
	if strings.TrimSpace(id) == "" {
		return errors.E(op, errors.Invalid, "mcp_server id is required")
	}

	existing, err := c.resolveMCPServerForAdmin(ctx, spaceID, id)
	if err != nil {
		return errors.E(op, err)
	}
	if err := existing.EnsureDeletable(); err != nil {
		return errors.E(op, err)
	}

	if err := c.store.MCPServers().Delete(ctx, spaceID, existing.ID); err != nil {
		return errors.E(op, err)
	}
	return nil
}

// TestMCPServer checks connectivity to an MCP server and updates its discovery health state.
func (c *coordinator) TestMCPServer(ctx context.Context, id string) (*ai.MCPServer, error) {
	const op errors.Op = "application/ai.TestMCPServer"

	spaceID, err := requireSettingsAdmin(ctx, op)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(id) == "" {
		return nil, errors.E(op, errors.Invalid, "mcp_server id is required")
	}

	srv, err := c.resolveMCPServerForAdmin(ctx, spaceID, id)
	if err != nil {
		return nil, errors.E(op, err)
	}

	state, discErr := c.mcp.Discover(ctx, srv)
	if state.HealthStatus != "" {
		srv.Discovery = state
	} else if discErr != nil {
		srv.Discovery = ai.MCPDiscoveryState{
			HealthStatus: ai.MCPHealthUnhealthy,
			Error:        &ai.ErrorDetail{Message: errors.UserMessage(discErr)},
		}
	}

	if err := c.store.MCPServers().Update(ctx, srv); err != nil {
		return nil, errors.E(op, err)
	}
	return srv, nil
}

// SyncMCPServer synchronizes tools and server metadata from an MCP server.
func (c *coordinator) SyncMCPServer(ctx context.Context, id string) (*ai.MCPServer, error) {
	const op errors.Op = "application/ai.SyncMCPServer"

	spaceID, err := requireSettingsAdmin(ctx, op)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(id) == "" {
		return nil, errors.E(op, errors.Invalid, "mcp_server id is required")
	}

	srv, err := c.resolveMCPServerForAdmin(ctx, spaceID, id)
	if err != nil {
		return nil, errors.E(op, err)
	}

	state, discErr := c.mcp.Discover(ctx, srv)
	if state.HealthStatus != "" {
		srv.Discovery = state
	} else if discErr != nil {
		srv.Discovery = ai.MCPDiscoveryState{
			HealthStatus: ai.MCPHealthUnhealthy,
			Error:        &ai.ErrorDetail{Message: errors.UserMessage(discErr)},
		}
	}

	if err := c.store.MCPServers().Update(ctx, srv); err != nil {
		return nil, errors.E(op, err)
	}
	return srv, nil
}

func (c *coordinator) resolveMCPServerForAdmin(ctx context.Context, spaceID, idOrKey string) (*ai.MCPServer, error) {
	srv, err := c.store.MCPServers().Get(ctx, spaceID, idOrKey)
	if err != nil && strings.HasPrefix(idOrKey, "system.") && (errors.Is(err, ai.ErrMCPServerNotFound) || errors.Is(err, errors.NotExist)) {
		if _, _, seedErr := c.ensureSystemRecords(ctx, spaceID); seedErr != nil {
			return nil, seedErr
		}
		return c.store.MCPServers().Get(ctx, spaceID, idOrKey)
	}
	return srv, err
}
