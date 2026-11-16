package mcpspace

//go:generate go run github.com/masterkeysrd/saturn/tools/mockgen .

import (
	"context"

	spaceapp "github.com/masterkeysrd/saturn/internal/application/space"
	"github.com/masterkeysrd/saturn/internal/domain/identity"
	"github.com/masterkeysrd/saturn/internal/domain/space"
	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/settings"
	mcptransport "github.com/masterkeysrd/saturn/internal/transport/mcp"
	sdkmcp "github.com/modelcontextprotocol/go-sdk/mcp"
)

// SpaceAggregator defines read-only workspace metadata queries.
// @Mock
type SpaceAggregator interface {
	GetSpace(ctx context.Context, spaceID space.SpaceID, userID space.UserID) (*space.Space, error)
}

// SpaceSettingsCoordinator defines read-only workspace settings retrieval.
// @Mock
type SpaceSettingsCoordinator interface {
	GetSettings(ctx context.Context, req *spaceapp.GetSettingsRequest) (*settings.Entry[space.Settings], error)
}

// Dependencies holds the collaborators required by the space MCP handler.
type Dependencies struct {
	Aggregator  SpaceAggregator
	Coordinator SpaceSettingsCoordinator
}

// Handler adapts space domain context queries to MCP tools and resources.
type Handler struct {
	agg   SpaceAggregator
	coord SpaceSettingsCoordinator
}

// NewHandler constructs a new space MCP Handler.
func NewHandler(deps Dependencies) *Handler {
	return &Handler{
		agg:   deps.Aggregator,
		coord: deps.Coordinator,
	}
}

// Register registers space MCP tools and resources onto the MCP registry.
func (h *Handler) Register(reg *mcptransport.Registry) {
	reg.RegisterTool(mcptransport.ToolSpec{
		Name:          "space_get_context",
		Domain:        "space",
		Title:         "Get Workspace Context",
		Description:   "Returns the active workspace ID, name, description, configured IANA timezone, and caller role.",
		RequiredScope: identity.ScopeSpacesRead,
		ReadOnly:      true,
	}, h.getContext)

	reg.RegisterResource(mcptransport.ResourceSpec{
		URI:           "saturn://space/context",
		Name:          "space_context",
		Title:         "Workspace Context",
		Description:   "Active workspace identity, timezone, and caller role metadata.",
		MIMEType:      "application/json",
		RequiredScope: identity.ScopeSpacesRead,
	}, h.readContextResource)
}

// GetContextInput is an empty input object for space_get_context.
type GetContextInput struct{}

// SpaceContextOutput represents workspace metadata returned to MCP clients.
type SpaceContextOutput struct {
	SpaceID     string `json:"space_id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Timezone    string `json:"timezone"`
	Role        string `json:"role"`
	UserID      string `json:"user_id"`
}

func (h *Handler) getContext(ctx context.Context, _ GetContextInput) (SpaceContextOutput, error) {
	spaceID, _ := auth.SpaceIDFromContext(ctx)
	role, _ := auth.SpaceRoleFromContext(ctx)
	principal, _ := auth.PrincipalFromContext(ctx)
	if spaceID == "" || principal.Subject == "" {
		return SpaceContextOutput{}, errors.E(errors.Unauthenticated, "missing authenticated space context")
	}

	sp, err := h.agg.GetSpace(ctx, space.SpaceID(spaceID), space.UserID(principal.Subject))
	if err != nil {
		return SpaceContextOutput{}, err
	}

	tz := "UTC"
	entry, err := h.coord.GetSettings(ctx, &spaceapp.GetSettingsRequest{
		SpaceID: spaceID,
		UserID:  principal.Subject,
	})
	if err == nil && entry != nil && entry.Value.Timezone != "" {
		tz = entry.Value.Timezone
	}

	return SpaceContextOutput{
		SpaceID:     string(sp.ID),
		Name:        sp.Name,
		Description: sp.Description,
		Timezone:    tz,
		Role:        role,
		UserID:      principal.Subject,
	}, nil
}

func (h *Handler) readContextResource(ctx context.Context, uri string) ([]*sdkmcp.ResourceContents, error) {
	out, err := h.getContext(ctx, GetContextInput{})
	if err != nil {
		return nil, err
	}
	return mcptransport.JSONResource(uri, out)
}
