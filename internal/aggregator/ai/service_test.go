package aiaggregator_test

import (
	"context"
	"testing"
	"time"

	aiaggregator "github.com/masterkeysrd/saturn/internal/aggregator/ai"
	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	"github.com/masterkeysrd/saturn/internal/platform/ai"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/paging"
	"github.com/masterkeysrd/saturn/internal/platform/settings"
)

func testCtx(spaceID, userID string) context.Context {
	ctx := auth.WithPrincipal(context.Background(), auth.Principal{Subject: userID})
	return auth.WithSpaceScope(ctx, spaceID, "member")
}

func TestService_GetSettings(t *testing.T) {
	now := time.Date(2026, 4, 15, 10, 0, 0, 0, time.UTC)

	tests := []struct {
		name      string
		ctx       context.Context
		spend     float64
		wantErr   bool
		wantKind  errors.Kind
		wantSpend float64
	}{
		{
			name:     "unauthenticated missing space",
			ctx:      context.Background(),
			wantErr:  true,
			wantKind: errors.Unauthenticated,
		},
		{
			name:      "hydrates monthly spend alongside settings",
			ctx:       testCtx("spc_1", "usr_1"),
			spend:     12.34,
			wantSpend: 12.34,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			svc := aiaggregator.NewService(aiaggregator.Dependencies{
				Settings: &aiaggregator.SettingsReaderMock{
					GetOrDefaultFunc: func(_ context.Context, scopeID string, fallback ai.Settings) (*settings.Entry[ai.Settings], error) {
						return &settings.Entry[ai.Settings]{
							Target: ai.SettingsKey.For(scopeID),
							Value:  fallback,
						}, nil
					},
				},
				Runs: &aiaggregator.RunReaderMock{
					GetMonthlySpendUSDFunc: func(_ context.Context, _ string, monthStart time.Time) (float64, error) {
						if monthStart.Day() != 1 {
							t.Fatalf("expected monthStart day 1, got %v", monthStart)
						}
						return tc.spend, nil
					},
				},
				NowFunc: func() time.Time { return now },
			})

			view, err := svc.GetSettings(tc.ctx)
			if tc.wantErr {
				if !errors.Is(err, tc.wantKind) {
					t.Fatalf("expected %v, got %v", tc.wantKind, err)
				}
				return
			}
			if err != nil {
				t.Fatalf("GetSettings() error = %v", err)
			}
			if view.CurrentMonthSpendUSD != tc.wantSpend || view.Governance.RunRetentionDays != ai.DefaultRunRetentionDays {
				t.Fatalf("unexpected settings view: %+v", view)
			}
		})
	}
}

func TestService_ProvidersAndModelsMaskSecrets(t *testing.T) {
	ctx := testCtx("spc_1", "usr_1")

	svc := aiaggregator.NewService(aiaggregator.Dependencies{
		Providers: &aiaggregator.ProviderReaderMock{
			ListFunc: func(_ context.Context, _ string) ([]*ai.Provider, error) {
				return []*ai.Provider{
					{
						ID:        "prv_1",
						SpaceID:   "spc_1",
						Name:      "Gemini",
						Driver:    ai.DriverGemini,
						Secret:    &ai.ProviderSecret{APIKey: new("super-secret")},
						HasSecret: true,
					},
				}, nil
			},
			GetFunc: func(_ context.Context, _, id string) (*ai.Provider, error) {
				return &ai.Provider{
					ID:        id,
					SpaceID:   "spc_1",
					Name:      "Gemini",
					Driver:    ai.DriverGemini,
					Secret:    &ai.ProviderSecret{APIKey: new("super-secret")},
					HasSecret: true,
				}, nil
			},
		},
		Models: &aiaggregator.ModelReaderMock{
			CountByProviderFunc: func(_ context.Context, _ string) (map[string]int32, error) {
				return map[string]int32{"prv_1": 3}, nil
			},
			ListFunc: func(_ context.Context, _ ai.ListModelsFilter) ([]*ai.Model, error) {
				return []*ai.Model{{ID: "mdl_1", SpaceID: "spc_1", ProviderID: "prv_1", ModelID: "gemini-2.5-flash", DisplayName: "Gemini 2.5 Flash"}}, nil
			},
			GetFunc: func(_ context.Context, _, id string) (*ai.Model, error) {
				return &ai.Model{ID: id, SpaceID: "spc_1", ProviderID: "prv_1", ModelID: "gemini-2.5-flash", DisplayName: "Gemini 2.5 Flash"}, nil
			},
		},
	})

	providers, err := svc.ListProviders(ctx)
	if err != nil {
		t.Fatalf("ListProviders() error = %v", err)
	}
	if len(providers) != 1 || providers[0].ModelCount != 3 || !providers[0].HasSecret || providers[0].Secret != nil {
		t.Fatalf("expected masked provider with ModelCount=3, got %+v", providers)
	}

	models, err := svc.ListModels(ctx, ai.ListModelsFilter{})
	if err != nil {
		t.Fatalf("ListModels() error = %v", err)
	}
	if len(models) != 1 || models[0].ProviderName != "Gemini" || models[0].ProviderDriver != ai.DriverGemini {
		t.Fatalf("expected hydrated model view, got %+v", models)
	}
}

func TestService_MCPServersLiveDiscoveryAndAgents(t *testing.T) {
	ctx := testCtx("spc_1", "usr_1")

	svc := aiaggregator.NewService(aiaggregator.Dependencies{
		MCPServers: &aiaggregator.MCPServerReaderMock{
			ListFunc: func(_ context.Context, _ string) ([]*ai.MCPServer, error) {
				return []*ai.MCPServer{
					ai.SystemSaturnMCPBlueprint("spc_1"),
					{
						ID:            "mcp_ext",
						SpaceID:       "spc_1",
						Slug:          "github",
						Name:          "GitHub",
						Transport:     ai.TransportHTTP,
						AuthSecret:    &ai.MCPAuthSecret{BearerToken: new("ghp_secret")},
						HasAuthSecret: true,
					},
				}, nil
			},
			GetFunc: func(_ context.Context, _, _ string) (*ai.MCPServer, error) {
				return ai.SystemSaturnMCPBlueprint("spc_1"), nil
			},
		},
		MCP: &aiaggregator.MCPDiscovererMock{
			DiscoverFunc: func(_ context.Context, srv *ai.MCPServer) (ai.MCPDiscoveryState, error) {
				return ai.MCPDiscoveryState{
					HealthStatus: ai.MCPHealthHealthy,
					Tools: []ai.MCPToolSummary{
						{Name: "finance_list_accounts", ReadOnlyHint: true},
					},
				}, nil
			},
		},
		Agents: &aiaggregator.AgentReaderMock{
			ListFunc: func(_ context.Context, _ string) ([]*ai.Agent, error) {
				return []*ai.Agent{{ID: "agt_1", SpaceID: "spc_1", Name: "Saturn Assistant", ModelID: new("mdl_1")}}, nil
			},
			GetFunc: func(_ context.Context, _, id string) (*ai.Agent, error) {
				return &ai.Agent{ID: id, SpaceID: "spc_1", Name: "Saturn Assistant", ModelID: new("mdl_1")}, nil
			},
		},
		Models: &aiaggregator.ModelReaderMock{
			ListFunc: func(_ context.Context, _ ai.ListModelsFilter) ([]*ai.Model, error) {
				return []*ai.Model{{ID: "mdl_1", DisplayName: "Gemini 2.5 Flash"}}, nil
			},
			GetFunc: func(_ context.Context, _, id string) (*ai.Model, error) {
				return &ai.Model{ID: id, DisplayName: "Gemini 2.5 Flash"}, nil
			},
		},
		Runs: &aiaggregator.RunReaderMock{
			GetAgentStats7dFunc: func(_ context.Context, _ string, _ []string, _ time.Time) (map[string]ai.AgentStats, error) {
				return map[string]ai.AgentStats{
					"agt_1": {TotalRuns7d: 5, CompletedRuns7d: 4, FailedRuns7d: 1},
				}, nil
			},
		},
	})

	servers, err := svc.ListMCPServers(ctx)
	if err != nil {
		t.Fatalf("ListMCPServers() error = %v", err)
	}
	if len(servers) != 2 {
		t.Fatalf("expected 2 MCP servers, got %d", len(servers))
	}
	if len(servers[0].Discovery.Tools) != 1 || servers[0].Discovery.Tools[0].Name != "finance_list_accounts" {
		t.Fatalf("expected live tools hydrated on system.saturn.mcp, got %+v", servers[0].Discovery)
	}
	if servers[1].AuthSecret != nil || !servers[1].HasAuthSecret {
		t.Fatalf("expected masked external MCP auth secret, got %+v", servers[1])
	}

	agents, err := svc.ListAgents(ctx)
	if err != nil {
		t.Fatalf("ListAgents() error = %v", err)
	}
	if len(agents) != 1 || agents[0].Stats.TotalRuns7d != 5 || *agents[0].ModelDisplayName != "Gemini 2.5 Flash" {
		t.Fatalf("expected hydrated agent view, got %+v", agents)
	}
}

func TestService_ThreadsAndRuns(t *testing.T) {
	ctx := testCtx("spc_1", "usr_1")

	svc := aiaggregator.NewService(aiaggregator.Dependencies{
		Threads: &aiaggregator.ThreadReaderMock{
			ListFunc: func(_ context.Context, filter ai.ListThreadsFilter) (*paging.Page[*ai.Thread], error) {
				if filter.UserID != "usr_1" || filter.SpaceID != "spc_1" {
					t.Fatalf("expected user-scoped filter, got %+v", filter)
				}
				return &paging.Page[*ai.Thread]{
					Items: []*ai.Thread{{ID: "thr_1", SpaceID: "spc_1", UserID: "usr_1", AgentID: new("agt_1"), ModelID: new("mdl_1"), Title: "Chat"}},
				}, nil
			},
			GetFunc: func(_ context.Context, _, _, id string) (*ai.Thread, error) {
				return &ai.Thread{ID: id, SpaceID: "spc_1", UserID: "usr_1", AgentID: new("agt_1")}, nil
			},
			ListMessagesFunc: func(_ context.Context, _ ai.ListMessagesFilter) (*paging.Page[*ai.ThreadMessage], error) {
				return &paging.Page[*ai.ThreadMessage]{
					Items: []*ai.ThreadMessage{{ID: "aim_1", ThreadID: "thr_1", Seq: 1, Role: ai.RoleUser}},
				}, nil
			},
		},
		Agents: &aiaggregator.AgentReaderMock{
			ListFunc: func(_ context.Context, _ string) ([]*ai.Agent, error) {
				return []*ai.Agent{{ID: "agt_1", Name: "Saturn Assistant"}}, nil
			},
			GetFunc: func(_ context.Context, _, id string) (*ai.Agent, error) {
				return &ai.Agent{ID: id, Name: "Saturn Assistant"}, nil
			},
		},
		Models: &aiaggregator.ModelReaderMock{
			ListFunc: func(_ context.Context, _ ai.ListModelsFilter) ([]*ai.Model, error) {
				return []*ai.Model{{ID: "mdl_1", DisplayName: "Gemini 2.5 Flash"}}, nil
			},
		},
		Runs: &aiaggregator.RunReaderMock{
			ListFunc: func(_ context.Context, _ ai.ListRunsFilter) (*paging.Page[*ai.Run], error) {
				return &paging.Page[*ai.Run]{
					Items: []*ai.Run{{ID: "air_1", SpaceID: "spc_1", AgentID: new("agt_1"), Status: ai.RunCompleted}},
				}, nil
			},
			GetFunc: func(_ context.Context, _, id string) (*ai.Run, error) {
				return &ai.Run{ID: id, SpaceID: "spc_1", AgentID: new("agt_1"), Status: ai.RunCompleted}, nil
			},
			ListStepsFunc: func(_ context.Context, _, _ string) ([]*ai.RunStep, error) {
				return []*ai.RunStep{{ID: "ais_1", Seq: 1, Kind: ai.StepKindLLM, Name: "gemini-2.5-flash"}}, nil
			},
		},
	})

	threads, err := svc.ListThreads(ctx, ai.ListThreadsFilter{})
	if err != nil {
		t.Fatalf("ListThreads() error = %v", err)
	}
	if len(threads.Threads) != 1 || *threads.Threads[0].AgentName != "Saturn Assistant" || *threads.Threads[0].ModelDisplayName != "Gemini 2.5 Flash" {
		t.Fatalf("unexpected thread view: %+v", threads)
	}

	msgs, err := svc.ListThreadMessages(ctx, ai.ListMessagesFilter{ThreadID: "thr_1"})
	if err != nil || len(msgs.Items) != 1 {
		t.Fatalf("ListThreadMessages() failed: err=%v", err)
	}

	runs, err := svc.ListRuns(ctx, ai.ListRunsFilter{})
	if err != nil || len(runs.Runs) != 1 || *runs.Runs[0].AgentName != "Saturn Assistant" {
		t.Fatalf("ListRuns() failed: err=%v runs=%+v", err, runs)
	}

	runView, err := svc.GetRun(ctx, "air_1")
	if err != nil || len(runView.Steps) != 1 || *runView.AgentName != "Saturn Assistant" {
		t.Fatalf("GetRun() failed: err=%v view=%+v", err, runView)
	}
}
