package aiaggregator

//go:generate go run github.com/masterkeysrd/saturn/tools/mockgen .

import (
	"context"
	"strings"
	"time"

	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	"github.com/masterkeysrd/saturn/internal/platform/ai"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/paging"
	"github.com/masterkeysrd/saturn/internal/platform/settings"
	"golang.org/x/sync/errgroup"
)

// ProviderReader reads workspace LLM providers.
// @Mock
type ProviderReader interface {
	Get(ctx context.Context, spaceID, id string) (*ai.Provider, error)
	List(ctx context.Context, spaceID string) ([]*ai.Provider, error)
}

// ModelReader reads registered workspace AI models.
// @Mock
type ModelReader interface {
	Get(ctx context.Context, spaceID, id string) (*ai.Model, error)
	List(ctx context.Context, filter ai.ListModelsFilter) ([]*ai.Model, error)
	CountByProvider(ctx context.Context, spaceID string) (map[string]int32, error)
}

// MCPServerReader reads workspace MCP servers.
// @Mock
type MCPServerReader interface {
	Get(ctx context.Context, spaceID, id string) (*ai.MCPServer, error)
	List(ctx context.Context, spaceID string) ([]*ai.MCPServer, error)
}

// AgentReader reads workspace AI agents.
// @Mock
type AgentReader interface {
	Get(ctx context.Context, spaceID, id string) (*ai.Agent, error)
	List(ctx context.Context, spaceID string) ([]*ai.Agent, error)
}

// ThreadReader reads user-private chat threads and messages.
// @Mock
type ThreadReader interface {
	Get(ctx context.Context, spaceID, userID, id string) (*ai.Thread, error)
	List(ctx context.Context, filter ai.ListThreadsFilter) (*paging.Page[*ai.Thread], error)
	ListMessages(ctx context.Context, filter ai.ListMessagesFilter) (*paging.Page[*ai.ThreadMessage], error)
}

// RunReader reads AI execution runs, step traces, and spend/stats aggregates.
// @Mock
type RunReader interface {
	Get(ctx context.Context, spaceID, id string) (*ai.Run, error)
	List(ctx context.Context, filter ai.ListRunsFilter) (*paging.Page[*ai.Run], error)
	ListSteps(ctx context.Context, spaceID, runID string) ([]*ai.RunStep, error)
	GetAgentStats7d(ctx context.Context, spaceID string, agentIDs []string, since time.Time) (map[string]ai.AgentStats, error)
	GetMonthlySpendUSD(ctx context.Context, spaceID string, monthStart time.Time) (float64, error)
}

// SettingsReader reads workspace AI settings (`platform.ai`).
// @Mock
type SettingsReader interface {
	GetOrDefault(ctx context.Context, scopeID string, fallback ai.Settings) (*settings.Entry[ai.Settings], error)
}

// MCPDiscoverer discovers live tools and metadata for MCP servers (especially `in_memory`).
// @Mock
type MCPDiscoverer interface {
	Discover(ctx context.Context, server *ai.MCPServer) (ai.MCPDiscoveryState, error)
}

// SettingsView hydrates workspace AI settings with current calendar-month spend telemetry.
type SettingsView struct {
	ai.Settings
	CurrentMonthSpendUSD float64
}

// ProviderView hydrates an AI Provider with its registered model count (secrets masked).
type ProviderView struct {
	*ai.Provider
	ModelCount int32
}

// ModelView hydrates an AI Model with its parent provider name and driver.
type ModelView struct {
	*ai.Model
	ProviderName   string
	ProviderDriver ai.Driver
}

// AgentView hydrates an AI Agent with its model display name and 7-day execution metrics.
type AgentView struct {
	*ai.Agent
	ModelDisplayName *string
	Stats            *ai.AgentStats
}

// ThreadView hydrates a private Thread with its agent name and model display name.
type ThreadView struct {
	*ai.Thread
	AgentName        *string
	ModelDisplayName *string
}

// ThreadListResult is a paginated list of hydrated ThreadView items.
type ThreadListResult struct {
	Threads       []*ThreadView
	NextPageToken string
}

// RunView hydrates an AI Run with its agent display name and ordered step traces.
type RunView struct {
	*ai.Run
	AgentName *string
	Steps     []*ai.RunStep
}

// RunListResult is a paginated list of hydrated RunView items.
type RunListResult struct {
	Runs          []*RunView
	NextPageToken string
}

// Dependencies groups read-only collaborators required by the AI aggregator Service.
type Dependencies struct {
	Providers  ProviderReader
	Models     ModelReader
	MCPServers MCPServerReader
	Agents     AgentReader
	Threads    ThreadReader
	Runs       RunReader
	Settings   SettingsReader
	MCP        MCPDiscoverer
	NowFunc    func() time.Time
}

// Service provides read-only CQRS queries and view hydration for platform/ai.
type Service struct {
	providers  ProviderReader
	models     ModelReader
	mcpServers MCPServerReader
	agents     AgentReader
	threads    ThreadReader
	runs       RunReader
	settings   SettingsReader
	mcp        MCPDiscoverer
	nowFn      func() time.Time
}

// NewService constructs a new AI aggregator Service.
func NewService(deps Dependencies) *Service {
	nowFn := deps.NowFunc
	if nowFn == nil {
		nowFn = func() time.Time { return time.Now().UTC() }
	}
	return &Service{
		providers:  deps.Providers,
		models:     deps.Models,
		mcpServers: deps.MCPServers,
		agents:     deps.Agents,
		threads:    deps.Threads,
		runs:       deps.Runs,
		settings:   deps.Settings,
		mcp:        deps.MCP,
		nowFn:      nowFn,
	}
}

func getSpaceID(ctx context.Context, op errors.Op) (string, error) {
	spaceID, ok := auth.SpaceIDFromContext(ctx)
	if !ok || strings.TrimSpace(spaceID) == "" {
		return "", errors.E(op, errors.Unauthenticated, "missing active space context")
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

// GetProviderDescriptors returns all supported workspace LLM provider blueprints.
func (s *Service) GetProviderDescriptors() []ai.ProviderDescriptor {
	return ai.GetProviderCatalog()
}

// GetSettings retrieves workspace AI settings hydrated with current calendar-month spend.
func (s *Service) GetSettings(ctx context.Context) (*SettingsView, error) {
	const op errors.Op = "aggregator/ai.GetSettings"

	spaceID, err := getSpaceID(ctx, op)
	if err != nil {
		return nil, err
	}

	now := s.nowFn().UTC()
	monthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)

	var (
		cfg   ai.Settings
		spend float64
	)
	g, gCtx := errgroup.WithContext(ctx)
	g.Go(func() error {
		entry, sErr := s.settings.GetOrDefault(gCtx, spaceID, ai.DefaultSettings())
		if sErr != nil {
			return sErr
		}
		cfg = entry.Value
		return nil
	})
	g.Go(func() error {
		var rErr error
		spend, rErr = s.runs.GetMonthlySpendUSD(gCtx, spaceID, monthStart)
		return rErr
	})
	if err := g.Wait(); err != nil {
		return nil, errors.E(op, err)
	}

	return &SettingsView{
		Settings:             cfg,
		CurrentMonthSpendUSD: spend,
	}, nil
}

// ListProviders returns all workspace LLM providers hydrated with registered model counts.
func (s *Service) ListProviders(ctx context.Context) ([]*ProviderView, error) {
	const op errors.Op = "aggregator/ai.ListProviders"

	spaceID, err := getSpaceID(ctx, op)
	if err != nil {
		return nil, err
	}

	var (
		providers []*ai.Provider
		counts    map[string]int32
	)
	g, gCtx := errgroup.WithContext(ctx)
	g.Go(func() error {
		var pErr error
		providers, pErr = s.providers.List(gCtx, spaceID)
		return pErr
	})
	g.Go(func() error {
		var cErr error
		counts, cErr = s.models.CountByProvider(gCtx, spaceID)
		return cErr
	})
	if err := g.Wait(); err != nil {
		return nil, errors.E(op, err)
	}

	views := make([]*ProviderView, 0, len(providers))
	for _, p := range providers {
		views = append(views, &ProviderView{
			Provider:   maskProviderSecrets(p),
			ModelCount: counts[p.ID],
		})
	}
	return views, nil
}

// GetProvider returns a single workspace LLM provider hydrated with its model count.
func (s *Service) GetProvider(ctx context.Context, id string) (*ProviderView, error) {
	const op errors.Op = "aggregator/ai.GetProvider"

	spaceID, err := getSpaceID(ctx, op)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(id) == "" {
		return nil, errors.E(op, errors.Invalid, "provider id is required")
	}

	var (
		p      *ai.Provider
		counts map[string]int32
	)
	g, gCtx := errgroup.WithContext(ctx)
	g.Go(func() error {
		var pErr error
		p, pErr = s.providers.Get(gCtx, spaceID, id)
		return pErr
	})
	g.Go(func() error {
		var cErr error
		counts, cErr = s.models.CountByProvider(gCtx, spaceID)
		return cErr
	})
	if err := g.Wait(); err != nil {
		return nil, errors.E(op, err)
	}

	return &ProviderView{
		Provider:   maskProviderSecrets(p),
		ModelCount: counts[p.ID],
	}, nil
}

// ListModels returns registered workspace AI models hydrated with parent provider metadata.
func (s *Service) ListModels(ctx context.Context, filter ai.ListModelsFilter) ([]*ModelView, error) {
	const op errors.Op = "aggregator/ai.ListModels"

	spaceID, err := getSpaceID(ctx, op)
	if err != nil {
		return nil, err
	}
	filter.SpaceID = spaceID

	var (
		models    []*ai.Model
		providers []*ai.Provider
	)
	g, gCtx := errgroup.WithContext(ctx)
	g.Go(func() error {
		var mErr error
		models, mErr = s.models.List(gCtx, filter)
		return mErr
	})
	g.Go(func() error {
		var pErr error
		providers, pErr = s.providers.List(gCtx, spaceID)
		return pErr
	})
	if err := g.Wait(); err != nil {
		return nil, errors.E(op, err)
	}

	provByID := make(map[string]*ai.Provider, len(providers))
	for _, p := range providers {
		provByID[p.ID] = p
	}

	views := make([]*ModelView, 0, len(models))
	for _, m := range models {
		v := &ModelView{Model: m}
		if p, ok := provByID[m.ProviderID]; ok {
			v.ProviderName = p.Name
			v.ProviderDriver = p.Driver
		}
		views = append(views, v)
	}
	return views, nil
}

// GetModel retrieves a single registered AI model hydrated with parent provider metadata.
func (s *Service) GetModel(ctx context.Context, id string) (*ModelView, error) {
	const op errors.Op = "aggregator/ai.GetModel"

	spaceID, err := getSpaceID(ctx, op)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(id) == "" {
		return nil, errors.E(op, errors.Invalid, "model id is required")
	}

	m, err := s.models.Get(ctx, spaceID, id)
	if err != nil {
		return nil, errors.E(op, err)
	}

	v := &ModelView{Model: m}
	p, pErr := s.providers.Get(ctx, spaceID, m.ProviderID)
	if pErr == nil && p != nil {
		v.ProviderName = p.Name
		v.ProviderDriver = p.Driver
	} else if pErr != nil && !errors.Is(pErr, ai.ErrProviderNotFound) && !errors.Is(pErr, errors.NotExist) {
		return nil, errors.E(op, pErr)
	}
	return v, nil
}

// ListMCPServers returns workspace MCP servers, populating live `discovery.tools` for `system.saturn.mcp`.
func (s *Service) ListMCPServers(ctx context.Context) ([]*ai.MCPServer, error) {
	const op errors.Op = "aggregator/ai.ListMCPServers"

	spaceID, err := getSpaceID(ctx, op)
	if err != nil {
		return nil, err
	}

	servers, err := s.mcpServers.List(ctx, spaceID)
	if err != nil {
		return nil, errors.E(op, err)
	}

	for _, srv := range servers {
		s.hydrateLiveSystemDiscovery(ctx, srv)
		maskMCPServerSecrets(srv)
	}
	return servers, nil
}

// GetMCPServer retrieves a single MCP server by ID or system key, populating live tools for `system.saturn.mcp`.
func (s *Service) GetMCPServer(ctx context.Context, idOrKey string) (*ai.MCPServer, error) {
	const op errors.Op = "aggregator/ai.GetMCPServer"

	spaceID, err := getSpaceID(ctx, op)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(idOrKey) == "" {
		return nil, errors.E(op, errors.Invalid, "mcp_server id is required")
	}

	srv, err := s.mcpServers.Get(ctx, spaceID, idOrKey)
	if err != nil {
		return nil, errors.E(op, err)
	}

	s.hydrateLiveSystemDiscovery(ctx, srv)
	maskMCPServerSecrets(srv)
	return srv, nil
}

// ListAgents returns workspace AI agents hydrated with model display names and 7-day execution metrics.
func (s *Service) ListAgents(ctx context.Context) ([]*AgentView, error) {
	const op errors.Op = "aggregator/ai.ListAgents"

	spaceID, err := getSpaceID(ctx, op)
	if err != nil {
		return nil, err
	}

	var (
		agents []*ai.Agent
		models []*ai.Model
	)
	g, gCtx := errgroup.WithContext(ctx)
	g.Go(func() error {
		var aErr error
		agents, aErr = s.agents.List(gCtx, spaceID)
		return aErr
	})
	g.Go(func() error {
		var mErr error
		models, mErr = s.models.List(gCtx, ai.ListModelsFilter{SpaceID: spaceID})
		return mErr
	})
	if err := g.Wait(); err != nil {
		return nil, errors.E(op, err)
	}

	modelNames := make(map[string]string, len(models))
	for _, m := range models {
		modelNames[m.ID] = m.DisplayName
	}

	agentIDs := make([]string, 0, len(agents))
	for _, a := range agents {
		agentIDs = append(agentIDs, a.ID)
	}

	since := s.nowFn().UTC().Add(-7 * 24 * time.Hour)
	statsByAgent, err := s.runs.GetAgentStats7d(ctx, spaceID, agentIDs, since)
	if err != nil {
		return nil, errors.E(op, err)
	}

	views := make([]*AgentView, 0, len(agents))
	for _, a := range agents {
		v := &AgentView{Agent: a}
		if a.ModelID != nil {
			if name, ok := modelNames[*a.ModelID]; ok {
				v.ModelDisplayName = new(name)
			}
		}
		if st, ok := statsByAgent[a.ID]; ok {
			v.Stats = new(st)
		} else {
			v.Stats = &ai.AgentStats{}
		}
		views = append(views, v)
	}
	return views, nil
}

// GetAgent retrieves a single AI agent by ID or system key hydrated with model name and 7-day metrics.
func (s *Service) GetAgent(ctx context.Context, idOrKey string) (*AgentView, error) {
	const op errors.Op = "aggregator/ai.GetAgent"

	spaceID, err := getSpaceID(ctx, op)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(idOrKey) == "" {
		return nil, errors.E(op, errors.Invalid, "agent id is required")
	}

	agent, err := s.agents.Get(ctx, spaceID, idOrKey)
	if err != nil {
		return nil, errors.E(op, err)
	}

	v := &AgentView{
		Agent: agent,
		Stats: &ai.AgentStats{},
	}

	since := s.nowFn().UTC().Add(-7 * 24 * time.Hour)
	g, gCtx := errgroup.WithContext(ctx)
	g.Go(func() error {
		statsMap, stErr := s.runs.GetAgentStats7d(gCtx, spaceID, []string{agent.ID}, since)
		if stErr != nil {
			return stErr
		}
		if st, ok := statsMap[agent.ID]; ok {
			v.Stats = new(st)
		}
		return nil
	})
	if agent.ModelID != nil && *agent.ModelID != "" {
		g.Go(func() error {
			m, mErr := s.models.Get(gCtx, spaceID, *agent.ModelID)
			if mErr == nil && m != nil {
				v.ModelDisplayName = new(m.DisplayName)
			} else if mErr != nil && !errors.Is(mErr, ai.ErrModelNotFound) && !errors.Is(mErr, errors.NotExist) {
				return mErr
			}
			return nil
		})
	}
	if err := g.Wait(); err != nil {
		return nil, errors.E(op, err)
	}
	return v, nil
}

// ListThreads returns paginated private chat threads owned by the caller hydrated with agent & model names.
func (s *Service) ListThreads(ctx context.Context, filter ai.ListThreadsFilter) (*ThreadListResult, error) {
	const op errors.Op = "aggregator/ai.ListThreads"

	spaceID, userID, err := requireUserAndSpace(ctx, op)
	if err != nil {
		return nil, err
	}
	filter.SpaceID = spaceID
	filter.UserID = userID

	var (
		page   *paging.Page[*ai.Thread]
		agents []*ai.Agent
		models []*ai.Model
	)
	g, gCtx := errgroup.WithContext(ctx)
	g.Go(func() error {
		var tErr error
		page, tErr = s.threads.List(gCtx, filter)
		return tErr
	})
	g.Go(func() error {
		var aErr error
		agents, aErr = s.agents.List(gCtx, spaceID)
		return aErr
	})
	g.Go(func() error {
		var mErr error
		models, mErr = s.models.List(gCtx, ai.ListModelsFilter{SpaceID: spaceID})
		return mErr
	})
	if err := g.Wait(); err != nil {
		return nil, errors.E(op, err)
	}

	agentNames := make(map[string]string, len(agents))
	for _, a := range agents {
		agentNames[a.ID] = a.Name
	}
	modelNames := make(map[string]string, len(models))
	for _, m := range models {
		modelNames[m.ID] = m.DisplayName
	}

	items := make([]*ThreadView, 0, len(page.Items))
	for _, th := range page.Items {
		v := &ThreadView{Thread: th}
		if th.AgentID != nil {
			if name, ok := agentNames[*th.AgentID]; ok {
				v.AgentName = new(name)
			}
		}
		if th.ModelID != nil {
			if name, ok := modelNames[*th.ModelID]; ok {
				v.ModelDisplayName = new(name)
			}
		}
		items = append(items, v)
	}
	return &ThreadListResult{
		Threads:       items,
		NextPageToken: page.NextPageToken,
	}, nil
}

// GetThread retrieves a private chat thread owned by the caller hydrated with agent & model names.
func (s *Service) GetThread(ctx context.Context, id string) (*ThreadView, error) {
	const op errors.Op = "aggregator/ai.GetThread"

	spaceID, userID, err := requireUserAndSpace(ctx, op)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(id) == "" {
		return nil, errors.E(op, errors.Invalid, "thread id is required")
	}

	th, err := s.threads.Get(ctx, spaceID, userID, id)
	if err != nil {
		return nil, errors.E(op, err)
	}

	v := &ThreadView{Thread: th}
	g, gCtx := errgroup.WithContext(ctx)
	if th.AgentID != nil && *th.AgentID != "" {
		g.Go(func() error {
			a, aErr := s.agents.Get(gCtx, spaceID, *th.AgentID)
			if aErr == nil && a != nil {
				v.AgentName = new(a.Name)
			} else if aErr != nil && !errors.Is(aErr, ai.ErrAgentNotFound) && !errors.Is(aErr, errors.NotExist) {
				return aErr
			}
			return nil
		})
	}
	if th.ModelID != nil && *th.ModelID != "" {
		g.Go(func() error {
			m, mErr := s.models.Get(gCtx, spaceID, *th.ModelID)
			if mErr == nil && m != nil {
				v.ModelDisplayName = new(m.DisplayName)
			} else if mErr != nil && !errors.Is(mErr, ai.ErrModelNotFound) && !errors.Is(mErr, errors.NotExist) {
				return mErr
			}
			return nil
		})
	}
	if err := g.Wait(); err != nil {
		return nil, errors.E(op, err)
	}
	return v, nil
}

// ListThreadMessages lists ordered messages in a private thread owned by the caller.
func (s *Service) ListThreadMessages(ctx context.Context, filter ai.ListMessagesFilter) (*paging.Page[*ai.ThreadMessage], error) {
	const op errors.Op = "aggregator/ai.ListThreadMessages"

	spaceID, userID, err := requireUserAndSpace(ctx, op)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(filter.ThreadID) == "" {
		return nil, errors.E(op, errors.Invalid, "thread_id is required")
	}
	filter.SpaceID = spaceID
	filter.UserID = userID

	if _, err := s.threads.Get(ctx, spaceID, userID, filter.ThreadID); err != nil {
		return nil, errors.E(op, err)
	}

	page, err := s.threads.ListMessages(ctx, filter)
	if err != nil {
		return nil, errors.E(op, err)
	}
	return page, nil
}

// ListRuns returns paginated AI runs hydrated with agent display names.
func (s *Service) ListRuns(ctx context.Context, filter ai.ListRunsFilter) (*RunListResult, error) {
	const op errors.Op = "aggregator/ai.ListRuns"

	spaceID, err := getSpaceID(ctx, op)
	if err != nil {
		return nil, err
	}
	filter.SpaceID = spaceID

	var (
		page   *paging.Page[*ai.Run]
		agents []*ai.Agent
	)
	g, gCtx := errgroup.WithContext(ctx)
	g.Go(func() error {
		var rErr error
		page, rErr = s.runs.List(gCtx, filter)
		return rErr
	})
	g.Go(func() error {
		var aErr error
		agents, aErr = s.agents.List(gCtx, spaceID)
		return aErr
	})
	if err := g.Wait(); err != nil {
		return nil, errors.E(op, err)
	}

	agentNames := make(map[string]string, len(agents))
	for _, a := range agents {
		agentNames[a.ID] = a.Name
	}

	views := make([]*RunView, 0, len(page.Items))
	for _, r := range page.Items {
		v := &RunView{Run: r}
		if r.AgentID != nil {
			if name, ok := agentNames[*r.AgentID]; ok {
				v.AgentName = new(name)
			}
		}
		views = append(views, v)
	}
	return &RunListResult{
		Runs:          views,
		NextPageToken: page.NextPageToken,
	}, nil
}

// GetRun retrieves a single AI run hydrated with its agent display name and ordered step execution traces.
func (s *Service) GetRun(ctx context.Context, id string) (*RunView, error) {
	const op errors.Op = "aggregator/ai.GetRun"

	spaceID, err := getSpaceID(ctx, op)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(id) == "" {
		return nil, errors.E(op, errors.Invalid, "run id is required")
	}

	var (
		run   *ai.Run
		steps []*ai.RunStep
	)
	g, gCtx := errgroup.WithContext(ctx)
	g.Go(func() error {
		var rErr error
		run, rErr = s.runs.Get(gCtx, spaceID, id)
		return rErr
	})
	g.Go(func() error {
		var sErr error
		steps, sErr = s.runs.ListSteps(gCtx, spaceID, id)
		return sErr
	})
	if err := g.Wait(); err != nil {
		return nil, errors.E(op, err)
	}

	v := &RunView{
		Run:   run,
		Steps: steps,
	}
	if run.AgentID != nil && *run.AgentID != "" {
		a, aErr := s.agents.Get(ctx, spaceID, *run.AgentID)
		if aErr == nil && a != nil {
			v.AgentName = new(a.Name)
		} else if aErr != nil && !errors.Is(aErr, ai.ErrAgentNotFound) && !errors.Is(aErr, errors.NotExist) {
			return nil, errors.E(op, aErr)
		}
	}
	return v, nil
}

func (s *Service) hydrateLiveSystemDiscovery(ctx context.Context, srv *ai.MCPServer) {
	if srv == nil || !srv.IsSystem || srv.Transport != ai.TransportInMemory {
		return
	}
	state, _ := s.mcp.Discover(ctx, srv)
	if state.HealthStatus != "" {
		srv.Discovery = state
	}
}

func maskProviderSecrets(p *ai.Provider) *ai.Provider {
	if p == nil {
		return nil
	}
	cp := *p
	cp.HasSecret = p.HasSecret || p.Secret.HasCredentials() || (p.SecretCiphertext != nil && *p.SecretCiphertext != "")
	cp.Secret = nil
	cp.SecretCiphertext = nil
	return &cp
}

func maskMCPServerSecrets(m *ai.MCPServer) {
	if m == nil {
		return
	}
	m.HasAuthSecret = m.HasAuthSecret || m.AuthSecret.HasCredentials() || (m.AuthSecretCiphertext != nil && *m.AuthSecretCiphertext != "")
	m.AuthSecret = nil
	m.AuthSecretCiphertext = nil
}
