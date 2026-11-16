package mcpai

import (
	"context"
	"encoding/json/v2"
	"net/http"
	"net/http/httptest"
	"testing"

	aiaggregator "github.com/masterkeysrd/saturn/internal/aggregator/ai"
	aiapp "github.com/masterkeysrd/saturn/internal/application/ai"
	"github.com/masterkeysrd/saturn/internal/domain/identity"
	"github.com/masterkeysrd/saturn/internal/domain/space"
	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	"github.com/masterkeysrd/saturn/internal/platform/ai"
	mcptransport "github.com/masterkeysrd/saturn/internal/transport/mcp"
	sdkmcp "github.com/modelcontextprotocol/go-sdk/mcp"
)

func TestMCPAIHandler_ExternalOnlyAndScopeEnforcement(t *testing.T) {
	agg := &AgentAggregatorMock{
		ListAgentsFunc: func(_ context.Context) ([]*aiaggregator.AgentView, error) {
			return []*aiaggregator.AgentView{
				{Agent: &ai.Agent{ID: "agt_sys", Slug: "saturn-assistant", Name: "Saturn Assistant", IsEnabled: true}},
				{Agent: &ai.Agent{ID: "agt_fin", Slug: "finance-analyst", Name: "Finance Analyst", Description: "Analyzes budgets", IsEnabled: true}},
				{Agent: &ai.Agent{ID: "agt_off", Slug: "disabled-bot", Name: "Disabled Bot", IsEnabled: false}},
			}, nil
		},
	}

	var capturedReq *aiapp.ExecuteAgentRequest
	coord := &AgentCoordinatorMock{
		EnsureSystemMCPAndAssistantFunc: func(_ context.Context) error { return nil },
		ExecuteAgentFunc: func(_ context.Context, req *aiapp.ExecuteAgentRequest) (*ai.Run, error) {
			capturedReq = req
			return &ai.Run{
				ID:     "air_mcp_1",
				Status: ai.RunCompleted,
				Output: &ai.RunOutput{
					Text: new("Budget is healthy."),
					Data: map[string]any{"healthy": true},
				},
			}, nil
		},
	}

	reg := mcptransport.NewRegistry()
	NewHandler(Dependencies{Aggregator: agg, Coordinator: coord}).Register(reg)

	t.Run("ConnectInMemory excludes external-only agent tools", func(t *testing.T) {
		srv := mcptransport.NewServer(mcptransport.ServerConfig{Registry: reg})
		ctx := auth.WithSpaceScope(
			auth.WithPrincipal(context.Background(), auth.Principal{Subject: "usr_1"}),
			"spc_1",
			string(space.RoleAdmin),
		)
		session, err := srv.ConnectInMemory(ctx)
		if err != nil {
			t.Fatalf("ConnectInMemory() error = %v", err)
		}
		defer func() { _ = session.Close() }()

		listRes, err := session.ListTools(ctx, &sdkmcp.ListToolsParams{})
		if err != nil {
			t.Fatalf("ListTools() error = %v", err)
		}
		if len(listRes.Tools) != 0 {
			t.Fatalf("expected 0 external agent tools in ConnectInMemory, got %d", len(listRes.Tools))
		}
	})

	t.Run("HTTP /mcp hides agent tools without ai:execute scope", func(t *testing.T) {
		srv := mcptransport.NewServer(mcptransport.ServerConfig{
			Registry: reg,
			AuthMiddleware: func(next http.Handler) http.Handler {
				return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					ctx := auth.WithSpaceScope(
						auth.WithPrincipal(r.Context(), auth.Principal{
							Subject:  "usr_1",
							APIKeyID: "apk_1",
							Scopes:   []string{string(identity.ScopeAIRead)},
						}),
						"spc_1",
						string(space.RoleMember),
					)
					next.ServeHTTP(w, r.WithContext(ctx))
				})
			},
		})
		ts := httptest.NewServer(srv.HTTPHandler())
		defer ts.Close()

		client := sdkmcp.NewClient(&sdkmcp.Implementation{Name: "test", Version: "1.0.0"}, nil)
		session, err := client.Connect(context.Background(), &sdkmcp.StreamableClientTransport{Endpoint: ts.URL}, nil)
		if err != nil {
			t.Fatalf("client.Connect() error = %v", err)
		}
		defer func() { _ = session.Close() }()

		listRes, err := session.ListTools(context.Background(), &sdkmcp.ListToolsParams{})
		if err != nil {
			t.Fatalf("ListTools() error = %v", err)
		}
		if len(listRes.Tools) != 0 {
			t.Fatalf("expected 0 agent tools for ai:read key, got %d", len(listRes.Tools))
		}
	})

	t.Run("HTTP /mcp lists and executes enabled agent__<slug> tools with ai:execute scope", func(t *testing.T) {
		srv := mcptransport.NewServer(mcptransport.ServerConfig{
			Registry: reg,
			AuthMiddleware: func(next http.Handler) http.Handler {
				return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					ctx := auth.WithSpaceScope(
						auth.WithPrincipal(r.Context(), auth.Principal{
							Subject:  "usr_1",
							APIKeyID: "apk_1",
							Scopes:   []string{string(identity.ScopeAIExecute)},
						}),
						"spc_1",
						string(space.RoleMember),
					)
					next.ServeHTTP(w, r.WithContext(ctx))
				})
			},
		})
		ts := httptest.NewServer(srv.HTTPHandler())
		defer ts.Close()

		client := sdkmcp.NewClient(&sdkmcp.Implementation{Name: "test", Version: "1.0.0"}, nil)
		session, err := client.Connect(context.Background(), &sdkmcp.StreamableClientTransport{Endpoint: ts.URL}, nil)
		if err != nil {
			t.Fatalf("client.Connect() error = %v", err)
		}
		defer func() { _ = session.Close() }()

		listRes, err := session.ListTools(context.Background(), &sdkmcp.ListToolsParams{})
		if err != nil {
			t.Fatalf("ListTools() error = %v", err)
		}
		if len(listRes.Tools) != 2 {
			t.Fatalf("expected 2 enabled agent tools, got %d", len(listRes.Tools))
		}
		if listRes.Tools[0].Name != "agent__finance-analyst" || listRes.Tools[1].Name != "agent__saturn-assistant" {
			t.Fatalf("unexpected tool names: %q, %q", listRes.Tools[0].Name, listRes.Tools[1].Name)
		}

		callRes, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
			Name:      "agent__finance-analyst",
			Arguments: map[string]any{"prompt": "Check April burn"},
		})
		if err != nil {
			t.Fatalf("CallTool() error = %v", err)
		}
		if callRes.IsError {
			t.Fatalf("unexpected tool error result: %+v", callRes.Content)
		}
		if capturedReq == nil || capturedReq.ID != "agt_fin" || capturedReq.Source != ai.RunSourceMCP {
			t.Fatalf("expected RunSourceMCP execution on agt_fin, got %+v", capturedReq)
		}

		var out ExecuteAgentOutput
		txt := callRes.Content[0].(*sdkmcp.TextContent).Text
		if err := json.Unmarshal([]byte(txt), &out); err != nil {
			t.Fatalf("unmarshal output: %v", err)
		}
		if out.RunID != "air_mcp_1" || out.Text != "Budget is healthy." {
			t.Fatalf("unexpected output: %+v", out)
		}
	})
}
