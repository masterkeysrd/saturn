package ai

//go:generate go run github.com/masterkeysrd/saturn/tools/mockgen .

import (
	"context"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/paging"
)

// ProviderStore defines persistence operations for workspace LLM providers.
// @Mock
type ProviderStore interface {
	Create(ctx context.Context, p *Provider) error
	Get(ctx context.Context, spaceID, id string) (*Provider, error)
	List(ctx context.Context, spaceID string) ([]*Provider, error)
	Update(ctx context.Context, p *Provider) error
	Delete(ctx context.Context, spaceID, id string) error
}

// ModelStore defines persistence operations for registered workspace AI models.
// @Mock
type ModelStore interface {
	Create(ctx context.Context, m *Model) error
	Get(ctx context.Context, spaceID, id string) (*Model, error)
	GetByProviderModel(ctx context.Context, spaceID, providerID, modelID string) (*Model, error)
	List(ctx context.Context, filter ListModelsFilter) ([]*Model, error)
	CountByProvider(ctx context.Context, spaceID string) (map[string]int32, error)
	Update(ctx context.Context, m *Model) error
	Delete(ctx context.Context, spaceID, id string) error
}

// MCPServerStore defines persistence operations for built-in and remote HTTP MCP servers.
// @Mock
type MCPServerStore interface {
	Create(ctx context.Context, s *MCPServer) error
	Get(ctx context.Context, spaceID, id string) (*MCPServer, error)
	GetBySystemKey(ctx context.Context, spaceID, systemKey string) (*MCPServer, error)
	GetBySlug(ctx context.Context, spaceID, slug string) (*MCPServer, error)
	List(ctx context.Context, spaceID string) ([]*MCPServer, error)
	Update(ctx context.Context, s *MCPServer) error
	Delete(ctx context.Context, spaceID, id string) error
}

// AgentStore defines persistence operations for workspace AI agents.
// @Mock
type AgentStore interface {
	Create(ctx context.Context, a *Agent) error
	Get(ctx context.Context, spaceID, id string) (*Agent, error)
	GetBySystemKey(ctx context.Context, spaceID, systemKey string) (*Agent, error)
	GetBySlug(ctx context.Context, spaceID, slug string) (*Agent, error)
	List(ctx context.Context, spaceID string) ([]*Agent, error)
	Update(ctx context.Context, a *Agent) error
	Delete(ctx context.Context, spaceID, id string) error
}

// ThreadStore defines user-private persistence operations for chat threads and messages.
// Every query strictly scopes to (space_id, user_id).
// @Mock
type ThreadStore interface {
	Create(ctx context.Context, t *Thread) error
	Get(ctx context.Context, spaceID, userID, id string) (*Thread, error)
	List(ctx context.Context, filter ListThreadsFilter) (*paging.Page[*Thread], error)
	Update(ctx context.Context, t *Thread) error
	Delete(ctx context.Context, spaceID, userID, id string) error
	AppendMessage(ctx context.Context, spaceID, userID string, msg *ThreadMessage) error
	UpdateMessage(ctx context.Context, spaceID, userID string, msg *ThreadMessage) error
	ListMessages(ctx context.Context, filter ListMessagesFilter) (*paging.Page[*ThreadMessage], error)
}

// RunStore defines persistence operations for AI execution runs and step traces.
// @Mock
type RunStore interface {
	Create(ctx context.Context, r *Run) error
	Get(ctx context.Context, spaceID, id string) (*Run, error)
	GetByIDs(ctx context.Context, spaceID string, ids []string) ([]*Run, error)
	Update(ctx context.Context, r *Run) error
	List(ctx context.Context, filter ListRunsFilter) (*paging.Page[*Run], error)
	ListSpaceIDs(ctx context.Context) ([]string, error)
	AppendStep(ctx context.Context, step *RunStep) error
	ListSteps(ctx context.Context, spaceID, runID string) ([]*RunStep, error)
	GetAgentStats7d(ctx context.Context, spaceID string, agentIDs []string, since time.Time) (map[string]AgentStats, error)
	GetMonthlySpendUSD(ctx context.Context, spaceID string, monthStart time.Time) (float64, error)
	PurgeExpired(ctx context.Context, spaceID string, cutoff time.Time) (int64, error)
}

// Store aggregates all AI persistence sub-stores.
// @Mock
type Store interface {
	Providers() ProviderStore
	Models() ModelStore
	MCPServers() MCPServerStore
	Agents() AgentStore
	Threads() ThreadStore
	Runs() RunStore
}
