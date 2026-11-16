package aiapp

//go:generate go run github.com/masterkeysrd/saturn/tools/mockgen .
//go:generate go run github.com/masterkeysrd/saturn/tools/txgen -target=Coordinator
//go:generate go run github.com/masterkeysrd/saturn/tools/loggen -target=Coordinator -component=ai

import (
	"context"
	"strings"
	"time"

	"github.com/masterkeysrd/saturn/internal/domain/space"
	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	"github.com/masterkeysrd/saturn/internal/platform/ai"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/settings"
)

// SettingsClient reads and persists workspace AI settings (`platform.ai`).
// @Mock
type SettingsClient interface {
	GetOrDefault(ctx context.Context, scopeID string, fallback ai.Settings) (*settings.Entry[ai.Settings], error)
	Save(ctx context.Context, entry *settings.Entry[ai.Settings]) error
}

// AIRuntime executes headless single-turn generations and multi-step agent runs.
// @Mock
type AIRuntime interface {
	Generate(ctx context.Context, req ai.GenerateRequest) (*ai.Run, error)
	RunAgent(ctx context.Context, req ai.RunAgentRequest) (*ai.Run, error)
}

// AIThreadRuntime manages streaming chat turns, tool approvals, and turn cancellation.
// @Mock
type AIThreadRuntime interface {
	StreamTurn(ctx context.Context, req ai.StreamTurnRequest, emit ai.StreamEventEmitter) error
	ResolveApprovals(ctx context.Context, req ai.ResolveApprovalsRequest, emit ai.StreamEventEmitter) error
	CancelTurn(ctx context.Context, spaceID, userID, threadID string) (*ai.Thread, error)
}

// UpdateSettingsRequest encapsulates partial updates to workspace AI settings.
type UpdateSettingsRequest struct {
	Settings   *ai.Settings
	UpdateMask []string
}

// CreateProviderRequest encapsulates inputs to register a workspace LLM provider.
type CreateProviderRequest struct {
	Name      string
	Driver    ai.Driver
	Config    ai.ProviderConfig
	Secret    *ai.ProviderSecret
	IsEnabled bool
}

// UpdateProviderRequest encapsulates partial updates to a workspace LLM provider.
type UpdateProviderRequest struct {
	ID         string
	Provider   *ai.Provider
	UpdateMask []string
}

// DiscoveredModelItem represents an upstream model with workspace registration status.
type DiscoveredModelItem struct {
	ai.DiscoveredModel
	AlreadyRegistered bool
}

// SyncProviderModelsRequest configures upstream model synchronization for a provider.
type SyncProviderModelsRequest struct {
	ProviderID string
	ModelIDs   []string
}

// SyncProviderModelsResult summarizes models synchronized for a provider.
type SyncProviderModelsResult struct {
	Models     []*ai.Model
	AddedCount int32
}

// CreateModelRequest encapsulates inputs to register a custom or catalog model.
type CreateModelRequest struct {
	ProviderID  string
	ModelID     string
	DisplayName string
	Source      ai.ModelSource
	Profile     ai.ModelProfile
	Config      ai.GenerationConfig
	IsEnabled   bool
}

// UpdateModelRequest encapsulates partial updates to a registered model.
type UpdateModelRequest struct {
	ID         string
	Model      *ai.Model
	UpdateMask []string
}

// CreateMCPServerRequest encapsulates inputs to register an external HTTP MCP server.
type CreateMCPServerRequest struct {
	Slug        string
	Name        string
	Description string
	Config      ai.MCPServerConfig
	AuthSecret  *ai.MCPAuthSecret
	IsEnabled   bool
}

// UpdateMCPServerRequest encapsulates partial updates to an MCP server.
type UpdateMCPServerRequest struct {
	ID         string
	MCPServer  *ai.MCPServer
	UpdateMask []string
}

// CreateAgentRequest encapsulates inputs to create a custom AI agent.
type CreateAgentRequest struct {
	Slug        string
	Name        string
	Description string
	Tags        []string
	ModelID     *string
	Config      ai.AgentConfig
	IsEnabled   bool
}

// UpdateAgentRequest encapsulates partial updates to an AI agent.
type UpdateAgentRequest struct {
	ID         string
	Agent      *ai.Agent
	UpdateMask []string
}

// ExecuteAgentRequest encapsulates inputs for headless agent execution.
type ExecuteAgentRequest struct {
	ID           string
	Source       ai.RunSource
	Prompt       string
	ModelID      *string
	Input        map[string]any
	OutputSchema map[string]any
}

// CreateThreadRequest encapsulates inputs to create a private chat thread.
type CreateThreadRequest struct {
	AgentID *string
	ModelID *string
	Title   string
	Config  ai.ThreadConfig
}

// UpdateThreadRequest encapsulates partial updates to a private chat thread.
type UpdateThreadRequest struct {
	ID         string
	Thread     *ai.Thread
	UpdateMask []string
}

// StreamThreadTurnRequest encapsulates inputs for a streaming chat turn.
type StreamThreadTurnRequest struct {
	ThreadID    string
	Content     string
	Attachments []ai.TurnAttachment
	AgentID     *string
	ModelID     *string
	ContextHint *string
}

// ResolveToolApprovalsRequest encapsulates user approval decisions for paused tool calls.
type ResolveToolApprovalsRequest struct {
	ThreadID  string
	Decisions []ai.ToolApprovalDecision
}

// GenerateRequest encapsulates inputs for headless single-turn LLM generation.
type GenerateRequest struct {
	Source            ai.RunSource
	Prompt            string
	SystemInstruction *string
	ModelID           *string
	Role              *ai.ModelRole
	Generation        *ai.GenerationConfig
	OutputSchema      map[string]any
	Attachments       []ai.TurnAttachment
}

// Coordinator orchestrates AI configuration, paired system seeding, private chat threads,
// and headless agent/LLM runs.
// @Mock
// @logged
type Coordinator interface {
	// @transactional
	UpdateSettings(ctx context.Context, req *UpdateSettingsRequest) (ai.Settings, error)

	// @transactional
	CreateProvider(ctx context.Context, req *CreateProviderRequest) (*ai.Provider, error)

	// @transactional
	UpdateProvider(ctx context.Context, req *UpdateProviderRequest) (*ai.Provider, error)

	// @transactional
	DeleteProvider(ctx context.Context, id string) error

	TestProvider(ctx context.Context, id string) (*ai.Provider, error)

	DiscoverProviderModels(ctx context.Context, id string) ([]DiscoveredModelItem, error)

	SyncProviderModels(ctx context.Context, req *SyncProviderModelsRequest) (*SyncProviderModelsResult, error)

	// @transactional
	CreateModel(ctx context.Context, req *CreateModelRequest) (*ai.Model, error)

	// @transactional
	UpdateModel(ctx context.Context, req *UpdateModelRequest) (*ai.Model, error)

	// @transactional
	DeleteModel(ctx context.Context, id string) error

	// @transactional
	EnsureSystemMCPAndAssistant(ctx context.Context) error

	// @transactional
	CreateMCPServer(ctx context.Context, req *CreateMCPServerRequest) (*ai.MCPServer, error)

	// @transactional
	UpdateMCPServer(ctx context.Context, req *UpdateMCPServerRequest) (*ai.MCPServer, error)

	// @transactional
	DeleteMCPServer(ctx context.Context, id string) error

	TestMCPServer(ctx context.Context, id string) (*ai.MCPServer, error)

	SyncMCPServer(ctx context.Context, id string) (*ai.MCPServer, error)

	// @transactional
	CreateAgent(ctx context.Context, req *CreateAgentRequest) (*ai.Agent, error)

	// @transactional
	UpdateAgent(ctx context.Context, req *UpdateAgentRequest) (*ai.Agent, error)

	// @transactional
	DeleteAgent(ctx context.Context, id string) error

	// @transactional
	ResetAgent(ctx context.Context, id string) (*ai.Agent, error)

	ExecuteAgent(ctx context.Context, req *ExecuteAgentRequest) (*ai.Run, error)

	// @transactional
	CreateThread(ctx context.Context, req *CreateThreadRequest) (*ai.Thread, error)

	// @transactional
	UpdateThread(ctx context.Context, req *UpdateThreadRequest) (*ai.Thread, error)

	// @transactional
	DeleteThread(ctx context.Context, id string) error

	CancelThreadTurn(ctx context.Context, id string) (*ai.Thread, error)

	StreamThreadTurn(ctx context.Context, req *StreamThreadTurnRequest, emit ai.StreamEventEmitter) error

	ResolveToolApprovals(ctx context.Context, req *ResolveToolApprovalsRequest, emit ai.StreamEventEmitter) error

	Generate(ctx context.Context, req *GenerateRequest) (*ai.Run, error)

	PurgeExpiredRuns(ctx context.Context) error
}

// Dependencies groups collaborators required to construct an AI Coordinator.
type Dependencies struct {
	Store                ai.Store
	Settings             SettingsClient
	Invoker              ai.ModelInvoker
	MCP                  ai.MCPConnector
	Runtime              AIRuntime
	ThreadRuntime        AIThreadRuntime
	AllowPrivateNetworks bool
	NowFunc              func() time.Time
}

type coordinator struct {
	store                ai.Store
	settings             SettingsClient
	invoker              ai.ModelInvoker
	mcp                  ai.MCPConnector
	runtime              AIRuntime
	threadRuntime        AIThreadRuntime
	allowPrivateNetworks bool
	nowFn                func() time.Time
}

// NewCoordinator constructs a new AI application Coordinator.
func NewCoordinator(deps Dependencies) Coordinator {
	nowFn := deps.NowFunc
	if nowFn == nil {
		nowFn = func() time.Time { return time.Now().UTC() }
	}
	return &coordinator{
		store:                deps.Store,
		settings:             deps.Settings,
		invoker:              deps.Invoker,
		mcp:                  deps.MCP,
		runtime:              deps.Runtime,
		threadRuntime:        deps.ThreadRuntime,
		allowPrivateNetworks: deps.AllowPrivateNetworks,
		nowFn:                nowFn,
	}
}

func getSpaceID(ctx context.Context, op errors.Op) (string, error) {
	spaceID, ok := auth.SpaceIDFromContext(ctx)
	if !ok || strings.TrimSpace(spaceID) == "" {
		return "", errors.E(op, errors.Unauthenticated, "missing active space context")
	}
	return spaceID, nil
}

func requireSettingsAdmin(ctx context.Context, op errors.Op) (string, error) {
	spaceID, err := getSpaceID(ctx, op)
	if err != nil {
		return "", err
	}
	role, ok := auth.SpaceRoleFromContext(ctx)
	if !ok {
		return "", errors.E(op, errors.Permission, "admin or owner role is required to manage AI configuration")
	}
	member := space.Member{Role: space.SpaceRole(role)}
	if !member.CanManageSettings() {
		return "", errors.E(op, errors.Permission, "admin or owner role is required to manage AI configuration")
	}
	return spaceID, nil
}

func requireMemberWrite(ctx context.Context, op errors.Op) (string, error) {
	spaceID, err := getSpaceID(ctx, op)
	if err != nil {
		return "", err
	}
	role, ok := auth.SpaceRoleFromContext(ctx)
	if !ok || role == string(space.RoleViewer) || role == "viewer" {
		return "", errors.E(op, errors.Permission, "viewer role cannot execute headless AI runs")
	}
	return spaceID, nil
}

func requireUserAndSpace(ctx context.Context, op errors.Op) (string, string, error) {
	spaceID, err := getSpaceID(ctx, op)
	if err != nil {
		return "", "", err
	}
	principal, ok := auth.PrincipalFromContext(ctx)
	if !ok || strings.TrimSpace(principal.Subject) == "" {
		return "", "", errors.E(op, errors.Unauthenticated, "missing authenticated user principal")
	}
	return spaceID, principal.Subject, nil
}

// ensureSystemRecords lazily seeds both `system.saturn.mcp` and `system.saturn.assistant` in lockstep.
func (c *coordinator) ensureSystemRecords(ctx context.Context, spaceID string) (*ai.MCPServer, *ai.Agent, error) {
	mcpSrv, err := c.store.MCPServers().GetBySystemKey(ctx, spaceID, ai.SystemSaturnMCPKey)
	if err != nil {
		if !errors.Is(err, ai.ErrMCPServerNotFound) && !errors.Is(err, errors.NotExist) {
			return nil, nil, err
		}
		mcpSrv = ai.SystemSaturnMCPBlueprint(spaceID)
		if err := c.store.MCPServers().Create(ctx, mcpSrv); err != nil {
			// Handle concurrent seeding race cleanly by re-reading.
			if existing, gErr := c.store.MCPServers().GetBySystemKey(ctx, spaceID, ai.SystemSaturnMCPKey); gErr == nil {
				mcpSrv = existing
			} else {
				return nil, nil, err
			}
		}
	}

	assistant, err := c.store.Agents().GetBySystemKey(ctx, spaceID, ai.SystemSaturnAssistantKey)
	if err != nil {
		if !errors.Is(err, ai.ErrAgentNotFound) && !errors.Is(err, errors.NotExist) {
			return nil, nil, err
		}
		assistant = ai.SystemAssistantBlueprint(spaceID, mcpSrv.ID)
		if err := c.store.Agents().Create(ctx, assistant); err != nil {
			if existing, gErr := c.store.Agents().GetBySystemKey(ctx, spaceID, ai.SystemSaturnAssistantKey); gErr == nil {
				assistant = existing
			} else {
				return nil, nil, err
			}
		}
	}

	return mcpSrv, assistant, nil
}

// EnsureSystemMCPAndAssistant lazily seeds the built-in Saturn MCP server and Saturn Assistant agent.
func (c *coordinator) EnsureSystemMCPAndAssistant(ctx context.Context) error {
	const op errors.Op = "application/ai.EnsureSystemMCPAndAssistant"

	spaceID, err := getSpaceID(ctx, op)
	if err != nil {
		return err
	}
	_, _, err = c.ensureSystemRecords(ctx, spaceID)
	if err != nil {
		return errors.E(op, err)
	}
	return nil
}
