package aiapp_test

import (
	"context"
	"fmt"
	"slices"
	"sync"
	"testing"
	"time"

	aiapp "github.com/masterkeysrd/saturn/internal/application/ai"
	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	"github.com/masterkeysrd/saturn/internal/platform/ai"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/paging"
	"github.com/masterkeysrd/saturn/internal/platform/settings"
)

func spaceCtx(spaceID, userID, role string) context.Context {
	ctx := auth.WithPrincipal(context.Background(), auth.Principal{Subject: userID})
	return auth.WithSpaceScope(ctx, spaceID, role)
}

type memStore struct {
	mu         sync.Mutex
	seq        int
	providers  map[string]*ai.Provider
	models     map[string]*ai.Model
	mcpServers map[string]*ai.MCPServer
	agents     map[string]*ai.Agent
	threads    map[string]*ai.Thread
	messages   map[string][]*ai.ThreadMessage
	runs       map[string]*ai.Run
	purged     []string
}

func newMemStore() *memStore {
	return &memStore{
		providers:  make(map[string]*ai.Provider),
		models:     make(map[string]*ai.Model),
		mcpServers: make(map[string]*ai.MCPServer),
		agents:     make(map[string]*ai.Agent),
		threads:    make(map[string]*ai.Thread),
		messages:   make(map[string][]*ai.ThreadMessage),
		runs:       make(map[string]*ai.Run),
	}
}

func (s *memStore) nextID(prefix string) string {
	s.seq++
	return fmt.Sprintf("%s%d", prefix, s.seq)
}

func (s *memStore) Providers() ai.ProviderStore   { return &memProviderStore{s: s} }
func (s *memStore) Models() ai.ModelStore         { return &memModelStore{s: s} }
func (s *memStore) MCPServers() ai.MCPServerStore { return &memMCPStore{s: s} }
func (s *memStore) Agents() ai.AgentStore         { return &memAgentStore{s: s} }
func (s *memStore) Threads() ai.ThreadStore       { return &memThreadStore{s: s} }
func (s *memStore) Runs() ai.RunStore             { return &memRunStore{s: s} }

type memProviderStore struct{ s *memStore }

func (m *memProviderStore) Create(_ context.Context, p *ai.Provider) error {
	m.s.mu.Lock()
	defer m.s.mu.Unlock()
	if p.ID == "" {
		p.ID = m.s.nextID("prv_")
	}
	cp := *p
	m.s.providers[p.ID] = &cp
	return nil
}

func (m *memProviderStore) Get(_ context.Context, spaceID, id string) (*ai.Provider, error) {
	m.s.mu.Lock()
	defer m.s.mu.Unlock()
	p, ok := m.s.providers[id]
	if !ok || p.SpaceID != spaceID {
		return nil, ai.ErrProviderNotFound
	}
	cp := *p
	return &cp, nil
}

func (m *memProviderStore) List(_ context.Context, spaceID string) ([]*ai.Provider, error) {
	m.s.mu.Lock()
	defer m.s.mu.Unlock()
	var out []*ai.Provider
	for _, p := range m.s.providers {
		if p.SpaceID == spaceID {
			cp := *p
			out = append(out, &cp)
		}
	}
	return out, nil
}

func (m *memProviderStore) Update(_ context.Context, p *ai.Provider) error {
	m.s.mu.Lock()
	defer m.s.mu.Unlock()
	if _, ok := m.s.providers[p.ID]; !ok {
		return ai.ErrProviderNotFound
	}
	cp := *p
	m.s.providers[p.ID] = &cp
	return nil
}

func (m *memProviderStore) Delete(_ context.Context, spaceID, id string) error {
	m.s.mu.Lock()
	defer m.s.mu.Unlock()
	p, ok := m.s.providers[id]
	if !ok || p.SpaceID != spaceID {
		return ai.ErrProviderNotFound
	}
	delete(m.s.providers, id)
	for mid, mod := range m.s.models {
		if mod.SpaceID == spaceID && mod.ProviderID == id {
			delete(m.s.models, mid)
		}
	}
	return nil
}

type memModelStore struct{ s *memStore }

func (m *memModelStore) Create(_ context.Context, mod *ai.Model) error {
	m.s.mu.Lock()
	defer m.s.mu.Unlock()
	if mod.ID == "" {
		mod.ID = m.s.nextID("mdl_")
	}
	cp := *mod
	m.s.models[mod.ID] = &cp
	return nil
}

func (m *memModelStore) Get(_ context.Context, spaceID, id string) (*ai.Model, error) {
	m.s.mu.Lock()
	defer m.s.mu.Unlock()
	mod, ok := m.s.models[id]
	if !ok || mod.SpaceID != spaceID {
		return nil, ai.ErrModelNotFound
	}
	cp := *mod
	return &cp, nil
}

func (m *memModelStore) GetByProviderModel(_ context.Context, spaceID, providerID, modelID string) (*ai.Model, error) {
	m.s.mu.Lock()
	defer m.s.mu.Unlock()
	for _, mod := range m.s.models {
		if mod.SpaceID == spaceID && mod.ProviderID == providerID && mod.ModelID == modelID {
			cp := *mod
			return &cp, nil
		}
	}
	return nil, ai.ErrModelNotFound
}

func (m *memModelStore) List(_ context.Context, filter ai.ListModelsFilter) ([]*ai.Model, error) {
	m.s.mu.Lock()
	defer m.s.mu.Unlock()
	var out []*ai.Model
	for _, mod := range m.s.models {
		if mod.SpaceID != filter.SpaceID {
			continue
		}
		if filter.ProviderID != nil && mod.ProviderID != *filter.ProviderID {
			continue
		}
		if filter.IsEnabled != nil && mod.IsEnabled != *filter.IsEnabled {
			continue
		}
		cp := *mod
		out = append(out, &cp)
	}
	return out, nil
}

func (m *memModelStore) CountByProvider(_ context.Context, spaceID string) (map[string]int32, error) {
	m.s.mu.Lock()
	defer m.s.mu.Unlock()
	counts := make(map[string]int32)
	for _, mod := range m.s.models {
		if mod.SpaceID == spaceID {
			counts[mod.ProviderID]++
		}
	}
	return counts, nil
}

func (m *memModelStore) Update(_ context.Context, mod *ai.Model) error {
	m.s.mu.Lock()
	defer m.s.mu.Unlock()
	if _, ok := m.s.models[mod.ID]; !ok {
		return ai.ErrModelNotFound
	}
	cp := *mod
	m.s.models[mod.ID] = &cp
	return nil
}

func (m *memModelStore) Delete(_ context.Context, spaceID, id string) error {
	m.s.mu.Lock()
	defer m.s.mu.Unlock()
	mod, ok := m.s.models[id]
	if !ok || mod.SpaceID != spaceID {
		return ai.ErrModelNotFound
	}
	delete(m.s.models, id)
	return nil
}

type memMCPStore struct{ s *memStore }

func (m *memMCPStore) Create(_ context.Context, srv *ai.MCPServer) error {
	m.s.mu.Lock()
	defer m.s.mu.Unlock()
	if srv.ID == "" {
		srv.ID = m.s.nextID("mcp_")
	}
	cp := *srv
	m.s.mcpServers[srv.ID] = &cp
	return nil
}

func (m *memMCPStore) Get(_ context.Context, spaceID, idOrKey string) (*ai.MCPServer, error) {
	m.s.mu.Lock()
	defer m.s.mu.Unlock()
	for _, srv := range m.s.mcpServers {
		if srv.SpaceID != spaceID {
			continue
		}
		if srv.ID == idOrKey || (srv.SystemKey != nil && *srv.SystemKey == idOrKey) {
			cp := *srv
			return &cp, nil
		}
	}
	return nil, ai.ErrMCPServerNotFound
}

func (m *memMCPStore) GetBySystemKey(ctx context.Context, spaceID, systemKey string) (*ai.MCPServer, error) {
	return m.Get(ctx, spaceID, systemKey)
}

func (m *memMCPStore) GetBySlug(_ context.Context, spaceID, slug string) (*ai.MCPServer, error) {
	m.s.mu.Lock()
	defer m.s.mu.Unlock()
	for _, srv := range m.s.mcpServers {
		if srv.SpaceID == spaceID && srv.Slug == slug {
			cp := *srv
			return &cp, nil
		}
	}
	return nil, ai.ErrMCPServerNotFound
}

func (m *memMCPStore) List(_ context.Context, spaceID string) ([]*ai.MCPServer, error) {
	m.s.mu.Lock()
	defer m.s.mu.Unlock()
	var out []*ai.MCPServer
	for _, srv := range m.s.mcpServers {
		if srv.SpaceID == spaceID {
			cp := *srv
			out = append(out, &cp)
		}
	}
	return out, nil
}

func (m *memMCPStore) Update(_ context.Context, srv *ai.MCPServer) error {
	m.s.mu.Lock()
	defer m.s.mu.Unlock()
	if _, ok := m.s.mcpServers[srv.ID]; !ok {
		return ai.ErrMCPServerNotFound
	}
	cp := *srv
	m.s.mcpServers[srv.ID] = &cp
	return nil
}

func (m *memMCPStore) Delete(_ context.Context, spaceID, id string) error {
	m.s.mu.Lock()
	defer m.s.mu.Unlock()
	srv, ok := m.s.mcpServers[id]
	if !ok || srv.SpaceID != spaceID {
		return ai.ErrMCPServerNotFound
	}
	delete(m.s.mcpServers, id)
	return nil
}

type memAgentStore struct{ s *memStore }

func (m *memAgentStore) Create(_ context.Context, a *ai.Agent) error {
	m.s.mu.Lock()
	defer m.s.mu.Unlock()
	if a.ID == "" {
		a.ID = m.s.nextID("agt_")
	}
	cp := *a
	cp.Tags = slices.Clone(a.Tags)
	cp.Config.MCPBindings = slices.Clone(a.Config.MCPBindings)
	m.s.agents[a.ID] = &cp
	return nil
}

func (m *memAgentStore) Get(_ context.Context, spaceID, idOrKey string) (*ai.Agent, error) {
	m.s.mu.Lock()
	defer m.s.mu.Unlock()
	for _, a := range m.s.agents {
		if a.SpaceID != spaceID {
			continue
		}
		if a.ID == idOrKey || (a.SystemKey != nil && *a.SystemKey == idOrKey) {
			cp := *a
			cp.Tags = slices.Clone(a.Tags)
			cp.Config.MCPBindings = slices.Clone(a.Config.MCPBindings)
			return &cp, nil
		}
	}
	return nil, ai.ErrAgentNotFound
}

func (m *memAgentStore) GetBySystemKey(ctx context.Context, spaceID, systemKey string) (*ai.Agent, error) {
	return m.Get(ctx, spaceID, systemKey)
}

func (m *memAgentStore) GetBySlug(_ context.Context, spaceID, slug string) (*ai.Agent, error) {
	m.s.mu.Lock()
	defer m.s.mu.Unlock()
	for _, a := range m.s.agents {
		if a.SpaceID == spaceID && a.Slug == slug {
			cp := *a
			return &cp, nil
		}
	}
	return nil, ai.ErrAgentNotFound
}

func (m *memAgentStore) List(_ context.Context, spaceID string) ([]*ai.Agent, error) {
	m.s.mu.Lock()
	defer m.s.mu.Unlock()
	var out []*ai.Agent
	for _, a := range m.s.agents {
		if a.SpaceID == spaceID {
			cp := *a
			out = append(out, &cp)
		}
	}
	return out, nil
}

func (m *memAgentStore) Update(_ context.Context, a *ai.Agent) error {
	m.s.mu.Lock()
	defer m.s.mu.Unlock()
	if _, ok := m.s.agents[a.ID]; !ok {
		return ai.ErrAgentNotFound
	}
	cp := *a
	m.s.agents[a.ID] = &cp
	return nil
}

func (m *memAgentStore) Delete(_ context.Context, spaceID, id string) error {
	m.s.mu.Lock()
	defer m.s.mu.Unlock()
	a, ok := m.s.agents[id]
	if !ok || a.SpaceID != spaceID {
		return ai.ErrAgentNotFound
	}
	delete(m.s.agents, id)
	return nil
}

type memThreadStore struct{ s *memStore }

func (m *memThreadStore) Create(_ context.Context, th *ai.Thread) error {
	m.s.mu.Lock()
	defer m.s.mu.Unlock()
	if th.ID == "" {
		th.ID = m.s.nextID("thr_")
	}
	cp := *th
	m.s.threads[th.ID] = &cp
	return nil
}

func (m *memThreadStore) Get(_ context.Context, spaceID, userID, id string) (*ai.Thread, error) {
	m.s.mu.Lock()
	defer m.s.mu.Unlock()
	th, ok := m.s.threads[id]
	if !ok || th.SpaceID != spaceID || th.UserID != userID {
		return nil, ai.ErrThreadNotFound
	}
	cp := *th
	return &cp, nil
}

func (m *memThreadStore) List(_ context.Context, filter ai.ListThreadsFilter) (*paging.Page[*ai.Thread], error) {
	return &paging.Page[*ai.Thread]{}, nil
}

func (m *memThreadStore) Update(_ context.Context, th *ai.Thread) error {
	m.s.mu.Lock()
	defer m.s.mu.Unlock()
	existing, ok := m.s.threads[th.ID]
	if !ok || existing.SpaceID != th.SpaceID || existing.UserID != th.UserID {
		return ai.ErrThreadNotFound
	}
	cp := *th
	m.s.threads[th.ID] = &cp
	return nil
}

func (m *memThreadStore) Delete(_ context.Context, spaceID, userID, id string) error {
	m.s.mu.Lock()
	defer m.s.mu.Unlock()
	th, ok := m.s.threads[id]
	if !ok || th.SpaceID != spaceID || th.UserID != userID {
		return ai.ErrThreadNotFound
	}
	delete(m.s.threads, id)
	return nil
}

func (m *memThreadStore) AppendMessage(_ context.Context, _, _ string, msg *ai.ThreadMessage) error {
	return nil
}
func (m *memThreadStore) UpdateMessage(_ context.Context, _, _ string, msg *ai.ThreadMessage) error {
	return nil
}
func (m *memThreadStore) ListMessages(_ context.Context, _ ai.ListMessagesFilter) (*paging.Page[*ai.ThreadMessage], error) {
	return &paging.Page[*ai.ThreadMessage]{}, nil
}

type memRunStore struct{ s *memStore }

func (m *memRunStore) Create(_ context.Context, r *ai.Run) error {
	m.s.mu.Lock()
	defer m.s.mu.Unlock()
	if r.ID == "" {
		r.ID = m.s.nextID("air_")
	}
	cp := *r
	m.s.runs[r.ID] = &cp
	return nil
}

func (m *memRunStore) Get(_ context.Context, spaceID, id, _ string) (*ai.Run, error) {
	m.s.mu.Lock()
	defer m.s.mu.Unlock()
	r, ok := m.s.runs[id]
	if !ok || r.SpaceID != spaceID {
		return nil, ai.ErrRunNotFound
	}
	cp := *r
	return &cp, nil
}

func (m *memRunStore) GetByIDs(_ context.Context, spaceID string, ids []string) ([]*ai.Run, error) {
	return nil, nil
}

func (m *memRunStore) Update(_ context.Context, r *ai.Run) error { return nil }
func (m *memRunStore) List(_ context.Context, _ ai.ListRunsFilter) (*paging.Page[*ai.Run], error) {
	return &paging.Page[*ai.Run]{}, nil
}

func (m *memRunStore) ListSpaceIDs(_ context.Context) ([]string, error) {
	m.s.mu.Lock()
	defer m.s.mu.Unlock()
	seen := make(map[string]struct{})
	var out []string
	for _, r := range m.s.runs {
		if _, ok := seen[r.SpaceID]; !ok {
			seen[r.SpaceID] = struct{}{}
			out = append(out, r.SpaceID)
		}
	}
	slices.Sort(out)
	return out, nil
}

func (m *memRunStore) AppendStep(_ context.Context, _ *ai.RunStep) error { return nil }
func (m *memRunStore) ListSteps(_ context.Context, _, _ string) ([]*ai.RunStep, error) {
	return nil, nil
}
func (m *memRunStore) GetAgentStats7d(_ context.Context, _ string, _ []string, _ time.Time) (map[string]ai.AgentStats, error) {
	return map[string]ai.AgentStats{}, nil
}
func (m *memRunStore) GetMonthlySpendUSD(_ context.Context, _ string, _ time.Time) (float64, error) {
	return 0, nil
}

func (m *memRunStore) PurgeExpired(_ context.Context, spaceID string, cutoff time.Time) (int64, error) {
	m.s.mu.Lock()
	defer m.s.mu.Unlock()
	var count int64
	for id, r := range m.s.runs {
		if r.SpaceID == spaceID && r.CreateTime.Before(cutoff) {
			delete(m.s.runs, id)
			count++
		}
	}
	m.s.purged = append(m.s.purged, spaceID)
	return count, nil
}

type memSettings struct {
	mu      sync.Mutex
	entries map[string]ai.Settings
}

func newMemSettings() *memSettings {
	return &memSettings{entries: make(map[string]ai.Settings)}
}

func (m *memSettings) GetOrDefault(_ context.Context, scopeID string, fallback ai.Settings) (*settings.Entry[ai.Settings], error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	val, ok := m.entries[scopeID]
	if !ok {
		val = fallback
	}
	return &settings.Entry[ai.Settings]{
		Target: ai.SettingsKey.For(scopeID),
		Value:  val,
	}, nil
}

func (m *memSettings) Save(_ context.Context, entry *settings.Entry[ai.Settings]) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.entries[entry.Target.ScopeID()] = entry.Value
	return nil
}

func newCoordinatorFixture(t *testing.T) (aiapp.Coordinator, *memStore, *memSettings, *aiapp.AIRuntimeMock, *aiapp.AIThreadRuntimeMock) {
	t.Helper()
	st := newMemStore()
	sett := newMemSettings()
	rt := &aiapp.AIRuntimeMock{
		GenerateFunc: func(_ context.Context, req ai.GenerateRequest) (*ai.Run, error) {
			return &ai.Run{ID: "air_gen", SpaceID: req.SpaceID, Kind: ai.RunKindGenerate, Source: req.Source, Status: ai.RunCompleted}, nil
		},
		RunAgentFunc: func(_ context.Context, req ai.RunAgentRequest) (*ai.Run, error) {
			return &ai.Run{ID: "air_agt", SpaceID: req.SpaceID, Kind: ai.RunKindAgentRun, Source: req.Source, AgentID: new(req.AgentID), Status: ai.RunCompleted}, nil
		},
	}
	trt := &aiapp.AIThreadRuntimeMock{
		StreamTurnFunc: func(_ context.Context, req ai.StreamTurnRequest, emit ai.StreamEventEmitter) error {
			if emit != nil {
				emit(ai.ThreadStreamEvent{Type: ai.EventRunCompleted, ThreadID: new(req.ThreadID)})
			}
			return nil
		},
		ResolveApprovalsFunc: func(_ context.Context, req ai.ResolveApprovalsRequest, emit ai.StreamEventEmitter) error {
			if emit != nil {
				emit(ai.ThreadStreamEvent{Type: ai.EventRunCompleted, ThreadID: new(req.ThreadID)})
			}
			return nil
		},
		CancelTurnFunc: func(_ context.Context, spaceID, userID, threadID string) (*ai.Thread, error) {
			return &ai.Thread{ID: threadID, SpaceID: spaceID, UserID: userID, Status: ai.ThreadIdle}, nil
		},
	}

	coord := aiapp.NewCoordinator(aiapp.Dependencies{
		Store:         st,
		Settings:      sett,
		Invoker:       ai.NewLoomClient(nil),
		MCP:           ai.NewUnifiedMCPConnector(nil, false),
		Runtime:       rt,
		ThreadRuntime: trt,
		NowFunc:       func() time.Time { return time.Date(2026, 4, 15, 3, 0, 0, 0, time.UTC) },
	})
	return coord, st, sett, rt, trt
}

func TestCoordinator_RBAC(t *testing.T) {
	tests := []struct {
		name     string
		ctx      context.Context
		call     func(aiapp.Coordinator, context.Context) error
		wantKind errors.Kind
	}{
		{
			name: "unauthenticated missing space",
			ctx:  context.Background(),
			call: func(c aiapp.Coordinator, ctx context.Context) error {
				_, err := c.CreateProvider(ctx, &aiapp.CreateProviderRequest{Name: "Gemini", Driver: ai.DriverGemini})
				return err
			},
			wantKind: errors.Unauthenticated,
		},
		{
			name: "member cannot create provider",
			ctx:  spaceCtx("spc_1", "usr_1", "member"),
			call: func(c aiapp.Coordinator, ctx context.Context) error {
				_, err := c.CreateProvider(ctx, &aiapp.CreateProviderRequest{Name: "Gemini", Driver: ai.DriverGemini})
				return err
			},
			wantKind: errors.Permission,
		},
		{
			name: "viewer cannot update settings",
			ctx:  spaceCtx("spc_1", "usr_1", "viewer"),
			call: func(c aiapp.Coordinator, ctx context.Context) error {
				_, err := c.UpdateSettings(ctx, &aiapp.UpdateSettingsRequest{Settings: &ai.Settings{}})
				return err
			},
			wantKind: errors.Permission,
		},
		{
			name: "member cannot create MCP server",
			ctx:  spaceCtx("spc_1", "usr_1", "member"),
			call: func(c aiapp.Coordinator, ctx context.Context) error {
				_, err := c.CreateMCPServer(ctx, &aiapp.CreateMCPServerRequest{Slug: "gh", Name: "GitHub"})
				return err
			},
			wantKind: errors.Permission,
		},
		{
			name: "member cannot create agent",
			ctx:  spaceCtx("spc_1", "usr_1", "member"),
			call: func(c aiapp.Coordinator, ctx context.Context) error {
				_, err := c.CreateAgent(ctx, &aiapp.CreateAgentRequest{Slug: "bot", Name: "Bot"})
				return err
			},
			wantKind: errors.Permission,
		},
		{
			name: "viewer cannot call Generate",
			ctx:  spaceCtx("spc_1", "usr_1", "viewer"),
			call: func(c aiapp.Coordinator, ctx context.Context) error {
				_, err := c.Generate(ctx, &aiapp.GenerateRequest{Prompt: "hello"})
				return err
			},
			wantKind: errors.Permission,
		},
		{
			name: "viewer cannot call ExecuteAgent",
			ctx:  spaceCtx("spc_1", "usr_1", "viewer"),
			call: func(c aiapp.Coordinator, ctx context.Context) error {
				_, err := c.ExecuteAgent(ctx, &aiapp.ExecuteAgentRequest{ID: "agt_1", Prompt: "hello"})
				return err
			},
			wantKind: errors.Permission,
		},
		{
			name: "missing principal cannot create thread",
			ctx:  auth.WithSpaceScope(context.Background(), "spc_1", "member"),
			call: func(c aiapp.Coordinator, ctx context.Context) error {
				_, err := c.CreateThread(ctx, &aiapp.CreateThreadRequest{})
				return err
			},
			wantKind: errors.Unauthenticated,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			coord, _, _, _, _ := newCoordinatorFixture(t)
			err := tc.call(coord, tc.ctx)
			if err == nil {
				t.Fatalf("expected error of kind %v, got nil", tc.wantKind)
			}
			if !errors.Is(err, tc.wantKind) {
				t.Fatalf("expected error kind %v, got %v (err=%v)", tc.wantKind, errors.KindOf(err), err)
			}
		})
	}
}

func TestCoordinator_ProviderAutoSeedAndSettings(t *testing.T) {
	coord, st, sett, _, _ := newCoordinatorFixture(t)
	adminCtx := spaceCtx("spc_1", "usr_admin", "admin")

	prov, err := coord.CreateProvider(adminCtx, &aiapp.CreateProviderRequest{
		Name:      "Google Gemini",
		Driver:    ai.DriverGemini,
		Secret:    &ai.ProviderSecret{APIKey: new("mock-key")},
		IsEnabled: true,
	})
	if err != nil {
		t.Fatalf("CreateProvider() error = %v", err)
	}
	if !prov.HasSecret {
		t.Fatalf("expected HasSecret = true")
	}

	models, err := st.Models().List(adminCtx, ai.ListModelsFilter{SpaceID: "spc_1", ProviderID: new(prov.ID)})
	if err != nil {
		t.Fatalf("List models error = %v", err)
	}
	if len(models) != 3 {
		t.Fatalf("expected 3 auto-seeded gemini models, got %d", len(models))
	}

	entry, _ := sett.GetOrDefault(adminCtx, "spc_1", ai.DefaultSettings())
	if entry.Value.Models.DefaultModelID == nil || entry.Value.Models.FastModelID == nil || entry.Value.Models.ReasoningModelID == nil {
		t.Fatalf("expected all 3 role defaults initialized, got %+v", entry.Value.Models)
	}

	// TestProvider succeeds with mock-key
	tested, err := coord.TestProvider(adminCtx, prov.ID)
	if err != nil {
		t.Fatalf("TestProvider() error = %v", err)
	}
	if tested.Status.State != ai.ProviderStateHealthy {
		t.Fatalf("expected healthy provider status, got %s", tested.Status.State)
	}

	// DiscoverProviderModels reports AlreadyRegistered=true for seeded models
	disc, err := coord.DiscoverProviderModels(adminCtx, prov.ID)
	if err != nil {
		t.Fatalf("DiscoverProviderModels() error = %v", err)
	}
	if len(disc) != 3 || !disc[0].AlreadyRegistered {
		t.Fatalf("expected 3 discovered models with AlreadyRegistered=true, got %+v", disc)
	}

	// SyncProviderModels with a custom model ID adds 1 new model
	syncRes, err := coord.SyncProviderModels(adminCtx, &aiapp.SyncProviderModelsRequest{
		ProviderID: prov.ID,
		ModelIDs:   []string{"gemini-2.5-flash", "gemini-custom-exp"},
	})
	if err != nil {
		t.Fatalf("SyncProviderModels() error = %v", err)
	}
	if syncRes.AddedCount != 1 || len(syncRes.Models) != 4 {
		t.Fatalf("expected AddedCount=1 and total=4, got added=%d total=%d", syncRes.AddedCount, len(syncRes.Models))
	}

	// UpdateSettings validates model IDs and persists governance
	updatedSettings, err := coord.UpdateSettings(adminCtx, &aiapp.UpdateSettingsRequest{
		Settings: &ai.Settings{
			Governance: ai.GovernanceConfig{
				MonthlyBudgetUSD: new(25.5),
				RunRetentionDays: 30,
			},
		},
		UpdateMask: []string{"governance.monthly_budget_usd", "governance.run_retention_days"},
	})
	if err != nil {
		t.Fatalf("UpdateSettings() error = %v", err)
	}
	if updatedSettings.Governance.RunRetentionDays != 30 || *updatedSettings.Governance.MonthlyBudgetUSD != 25.5 {
		t.Fatalf("unexpected updated settings: %+v", updatedSettings)
	}

	// DeleteProvider clears role defaults pointing to its models
	if err := coord.DeleteProvider(adminCtx, prov.ID); err != nil {
		t.Fatalf("DeleteProvider() error = %v", err)
	}
	entryAfter, _ := sett.GetOrDefault(adminCtx, "spc_1", ai.DefaultSettings())
	if entryAfter.Value.Models.DefaultModelID != nil || entryAfter.Value.Models.FastModelID != nil {
		t.Fatalf("expected role defaults cleared after DeleteProvider, got %+v", entryAfter.Value.Models)
	}
}

func TestCoordinator_PairedSystemSeedingAndReset(t *testing.T) {
	coord, st, _, _, _ := newCoordinatorFixture(t)
	memberCtx := spaceCtx("spc_1", "usr_member", "member")
	adminCtx := spaceCtx("spc_1", "usr_admin", "admin")

	// CreateThread lazily seeds system.saturn.mcp and system.saturn.assistant
	th, err := coord.CreateThread(memberCtx, &aiapp.CreateThreadRequest{
		Title: "Budget check",
	})
	if err != nil {
		t.Fatalf("CreateThread() error = %v", err)
	}
	if th.AgentID == nil || th.UserID != "usr_member" {
		t.Fatalf("expected thread bound to assistant and usr_member, got %+v", th)
	}

	mcpSrv, err := st.MCPServers().GetBySystemKey(memberCtx, "spc_1", ai.SystemSaturnMCPKey)
	if err != nil || mcpSrv == nil || !mcpSrv.IsSystem {
		t.Fatalf("expected system.saturn.mcp seeded, got err=%v", err)
	}
	assistant, err := st.Agents().GetBySystemKey(memberCtx, "spc_1", ai.SystemSaturnAssistantKey)
	if err != nil || assistant == nil || !assistant.IsSystem {
		t.Fatalf("expected system.saturn.assistant seeded, got err=%v", err)
	}

	// Protected system records cannot be deleted
	if err := coord.DeleteMCPServer(adminCtx, mcpSrv.ID); !errors.Is(err, ai.ErrMCPServerProtected) {
		t.Fatalf("expected ErrMCPServerProtected, got %v", err)
	}
	if err := coord.DeleteAgent(adminCtx, assistant.ID); !errors.Is(err, ai.ErrAgentProtected) {
		t.Fatalf("expected ErrAgentProtected, got %v", err)
	}

	// Customize Saturn Assistant and ResetAgent back to defaults
	_, err = coord.UpdateAgent(adminCtx, &aiapp.UpdateAgentRequest{
		ID:         assistant.ID,
		Agent:      &ai.Agent{Name: "Custom Assistant", IsEnabled: false},
		UpdateMask: []string{"name", "is_enabled"},
	})
	if err != nil {
		t.Fatalf("UpdateAgent() error = %v", err)
	}

	reset, err := coord.ResetAgent(adminCtx, assistant.ID)
	if err != nil {
		t.Fatalf("ResetAgent() error = %v", err)
	}
	if reset.Name != "Saturn Assistant" || !reset.IsEnabled || reset.Version < 3 {
		t.Fatalf("unexpected ResetAgent result: %+v", reset)
	}
}

func TestCoordinator_MCPValidationAndExecution(t *testing.T) {
	coord, _, _, rt, trt := newCoordinatorFixture(t)
	adminCtx := spaceCtx("spc_1", "usr_admin", "admin")
	memberCtx := spaceCtx("spc_1", "usr_member", "member")
	otherMemberCtx := spaceCtx("spc_1", "usr_other", "member")

	// SSRF private network blocked by default
	_, err := coord.CreateMCPServer(adminCtx, &aiapp.CreateMCPServerRequest{
		Slug: "local",
		Name: "Local",
		Config: ai.MCPServerConfig{
			URL: "http://127.0.0.1:9000/mcp",
		},
		IsEnabled: true,
	})
	if !errors.Is(err, ai.ErrSSRFBlocked) {
		t.Fatalf("expected ErrSSRFBlocked, got %v", err)
	}

	// Valid public HTTP MCP succeeds
	srv, err := coord.CreateMCPServer(adminCtx, &aiapp.CreateMCPServerRequest{
		Slug: "github",
		Name: "GitHub",
		Config: ai.MCPServerConfig{
			URL:      "https://api.githubcopilot.com/mcp",
			AuthType: ai.MCPAuthBearer,
		},
		AuthSecret: &ai.MCPAuthSecret{BearerToken: new("tok_123")},
		IsEnabled:  true,
	})
	if err != nil {
		t.Fatalf("CreateMCPServer() error = %v", err)
	}
	if !srv.HasAuthSecret {
		t.Fatalf("expected HasAuthSecret = true")
	}

	// Thread isolation: user A's thread cannot be updated/deleted by user B
	th, err := coord.CreateThread(memberCtx, &aiapp.CreateThreadRequest{Title: "Private"})
	if err != nil {
		t.Fatalf("CreateThread() error = %v", err)
	}
	if _, err := coord.UpdateThread(otherMemberCtx, &aiapp.UpdateThreadRequest{
		ID:         th.ID,
		Thread:     &ai.Thread{Title: "Hijack"},
		UpdateMask: []string{"title"},
	}); !errors.Is(err, ai.ErrThreadNotFound) {
		t.Fatalf("expected ErrThreadNotFound for other user, got %v", err)
	}

	// StreamThreadTurn & ResolveToolApprovals & ExecuteAgent & Generate delegate cleanly
	var events []ai.ThreadStreamEvent
	err = coord.StreamThreadTurn(memberCtx, &aiapp.StreamThreadTurnRequest{
		ThreadID: th.ID,
		Content:  "Hi",
	}, func(e ai.ThreadStreamEvent) { events = append(events, e) })
	if err != nil || len(events) != 1 || len(trt.StreamTurnCalls()) != 1 {
		t.Fatalf("StreamThreadTurn failed: err=%v events=%d", err, len(events))
	}

	err = coord.ResolveToolApprovals(memberCtx, &aiapp.ResolveToolApprovalsRequest{
		ThreadID:  th.ID,
		Decisions: []ai.ToolApprovalDecision{{ToolCallID: "tc_1", Approved: true}},
	}, nil)
	if err != nil || len(trt.ResolveApprovalsCalls()) != 1 {
		t.Fatalf("ResolveToolApprovals failed: err=%v", err)
	}

	run, err := coord.ExecuteAgent(memberCtx, &aiapp.ExecuteAgentRequest{
		ID:     ai.SystemSaturnAssistantKey,
		Prompt: "Summarize",
	})
	if err != nil || run.ID != "air_agt" || len(rt.RunAgentCalls()) != 1 {
		t.Fatalf("ExecuteAgent failed: err=%v run=%+v", err, run)
	}

	genRun, err := coord.Generate(memberCtx, &aiapp.GenerateRequest{Prompt: "Hi"})
	if err != nil || genRun.ID != "air_gen" || len(rt.GenerateCalls()) != 1 {
		t.Fatalf("Generate failed: err=%v run=%+v", err, genRun)
	}
}

func TestCoordinator_PurgeExpiredRuns(t *testing.T) {
	coord, st, sett, _, _ := newCoordinatorFixture(t)
	now := time.Date(2026, 4, 15, 3, 0, 0, 0, time.UTC)

	// spc_default uses default 90d retention: 100d old purged, 10d old kept
	_ = st.Runs().Create(context.Background(), &ai.Run{ID: "air_old", SpaceID: "spc_default", CreateTime: now.Add(-100 * 24 * time.Hour)})
	_ = st.Runs().Create(context.Background(), &ai.Run{ID: "air_fresh", SpaceID: "spc_default", CreateTime: now.Add(-10 * 24 * time.Hour)})

	// spc_disabled sets retention = 0 (never prune)
	_ = sett.Save(context.Background(), &settings.Entry[ai.Settings]{
		Target: ai.SettingsKey.For("spc_disabled"),
		Value:  ai.Settings{Governance: ai.GovernanceConfig{RunRetentionDays: 0}},
	})
	_ = st.Runs().Create(context.Background(), &ai.Run{ID: "air_keep", SpaceID: "spc_disabled", CreateTime: now.Add(-365 * 24 * time.Hour)})

	if err := coord.PurgeExpiredRuns(context.Background()); err != nil {
		t.Fatalf("PurgeExpiredRuns() error = %v", err)
	}

	if _, err := st.Runs().Get(context.Background(), "spc_default", "air_old", ""); !errors.Is(err, ai.ErrRunNotFound) {
		t.Fatalf("expected air_old to be purged, err=%v", err)
	}
	if _, err := st.Runs().Get(context.Background(), "spc_default", "air_fresh", ""); err != nil {
		t.Fatalf("expected air_fresh to remain, err=%v", err)
	}
	if _, err := st.Runs().Get(context.Background(), "spc_disabled", "air_keep", ""); err != nil {
		t.Fatalf("expected air_keep to remain when retention=0, err=%v", err)
	}
}
