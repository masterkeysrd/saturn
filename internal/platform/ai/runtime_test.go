package ai

import (
	"context"
	"testing"
	"time"

	"github.com/masterkeysrd/loom/message"
	"github.com/masterkeysrd/loom/tool"
	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/settings"
)

func newTestRuntimeHarness(
	t *testing.T,
	monthlySpend float64,
	budgetUSD *float64,
	invoker *ModelInvokerMock,
	mcpConn *MCPConnectorMock,
) (*Runtime, *[]*Run, *[]*RunStep) {
	t.Helper()

	var createdRuns []*Run
	var appendedSteps []*RunStep
	now := time.Date(2026, 4, 15, 12, 0, 0, 0, time.UTC)

	provStore := &ProviderStoreMock{
		GetFunc: func(_ context.Context, _, id string) (*Provider, error) {
			return &Provider{
				ID:        id,
				SpaceID:   "spc_1",
				Name:      "OpenAI",
				Driver:    DriverOpenAI,
				IsEnabled: true,
			}, nil
		},
	}
	modelStore := &ModelStoreMock{
		GetFunc: func(_ context.Context, _, id string) (*Model, error) {
			return &Model{
				ID:         id,
				SpaceID:    "spc_1",
				ProviderID: "prv_1",
				ModelID:    "gpt-4.1",
				IsEnabled:  true,
				Profile: ModelProfile{
					Capabilities: ModelCapabilities{ToolCalling: true, Vision: true, StructuredOutput: true},
					Limits:       ModelLimits{ContextWindow: 128000, MaxOutputTokens: 8192},
					Pricing:      ModelPricing{InputPerMillionUSD: 2.0, OutputPerMillionUSD: 8.0},
				},
			}, nil
		},
	}
	mcpStore := &MCPServerStoreMock{
		GetFunc: func(_ context.Context, _, id string) (*MCPServer, error) {
			return &MCPServer{
				ID:        id,
				SpaceID:   "spc_1",
				Slug:      "saturn",
				Name:      "Saturn Workspace",
				Transport: TransportInMemory,
				Config:    MCPServerConfig{TrustReadHints: true},
				IsEnabled: true,
			}, nil
		},
	}
	agentStore := &AgentStoreMock{
		GetFunc: func(_ context.Context, _, id string) (*Agent, error) {
			return &Agent{
				ID:        id,
				SpaceID:   "spc_1",
				Slug:      "analyst",
				Name:      "Analyst",
				IsEnabled: true,
				Config: AgentConfig{
					SystemInstruction: new("Be concise."),
					Execution:         ExecutionConfig{ApprovalPolicy: ApprovalConfirmWrites, MaxSteps: 3, TimeoutSeconds: 30},
					MCPBindings:       []MCPBinding{{MCPServerID: "mcp_saturn", AllowedTools: []string{"*"}}},
				},
			}, nil
		},
	}
	runStore := &RunStoreMock{
		GetMonthlySpendUSDFunc: func(_ context.Context, _ string, _ time.Time) (float64, error) {
			return monthlySpend, nil
		},
		CreateFunc: func(_ context.Context, r *Run) error {
			if r.ID == "" {
				r.ID = "air_1"
			}
			createdRuns = append(createdRuns, r)
			return nil
		},
		UpdateFunc: func(_ context.Context, _ *Run) error { return nil },
		AppendStepFunc: func(_ context.Context, step *RunStep) error {
			appendedSteps = append(appendedSteps, step)
			return nil
		},
	}

	store := &StoreMock{
		ProvidersFunc:  func() ProviderStore { return provStore },
		ModelsFunc:     func() ModelStore { return modelStore },
		MCPServersFunc: func() MCPServerStore { return mcpStore },
		AgentsFunc:     func() AgentStore { return agentStore },
		RunsFunc:       func() RunStore { return runStore },
	}
	settingsReader := &SettingsReaderMock{
		GetOrDefaultFunc: func(_ context.Context, _ string, _ Settings) (*settings.Entry[Settings], error) {
			return &settings.Entry[Settings]{
				Value: Settings{
					Models:     ModelRoleSettings{DefaultModelID: new("mdl_default")},
					Governance: GovernanceConfig{MonthlyBudgetUSD: budgetUSD, RunRetentionDays: 90},
				},
			}, nil
		},
	}

	rt := NewRuntime(RuntimeDependencies{
		Store:    store,
		Invoker:  invoker,
		MCP:      mcpConn,
		Settings: settingsReader,
		NowFunc:  func() time.Time { return now },
	})
	return rt, &createdRuns, &appendedSteps
}

func TestRuntime_Generate_BudgetAndStructuredOutput(t *testing.T) {
	tests := []struct {
		name         string
		monthlySpend float64
		budgetUSD    *float64
		req          GenerateRequest
		invokeFn     func(ctx context.Context, req InvokeRequest) (*message.Assistant, error)
		wantErr      bool
		wantCode     errors.Code
		wantStatus   RunStatus
	}{
		{
			name:         "succeeds with structured JSON output",
			monthlySpend: 5.0,
			budgetUSD:    new(50.0),
			req: GenerateRequest{
				SpaceID:      "spc_1",
				Prompt:       "Summarize",
				OutputSchema: map[string]any{"type": "object", "properties": map[string]any{"ok": map[string]any{"type": "boolean"}}},
			},
			invokeFn: func(_ context.Context, _ InvokeRequest) (*message.Assistant, error) {
				return &message.Assistant{
					Content: message.Content{&message.TextBlock{Text: `{"ok":true}`}},
					Metrics: &message.TokenMetrics{TotalTokens: 100, Tokens: message.TokenDetails{Input: 80, Output: 20}},
				}, nil
			},
			wantStatus: RunCompleted,
		},
		{
			name:         "rejects when monthly budget exceeded",
			monthlySpend: 25.0,
			budgetUSD:    new(25.0),
			req: GenerateRequest{
				SpaceID: "spc_1",
				Prompt:  "Hello",
			},
			wantErr:  true,
			wantCode: CodeMonthlyBudgetExceeded,
		},
		{
			name: "rejects empty prompt",
			req: GenerateRequest{
				SpaceID: "spc_1",
			},
			wantErr: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			inv := &ModelInvokerMock{InvokeFunc: tc.invokeFn}
			rt, runs, steps := newTestRuntimeHarness(t, tc.monthlySpend, tc.budgetUSD, inv, &MCPConnectorMock{})

			run, err := rt.Generate(context.Background(), tc.req)
			if tc.wantErr {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				if tc.wantCode != "" && errors.CodeOf(err) != tc.wantCode {
					t.Errorf("code = %q, want %q", errors.CodeOf(err), tc.wantCode)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if run.Status != tc.wantStatus || run.Output == nil || run.Output.Data["ok"] != true {
				t.Errorf("unexpected run: %+v", run)
			}
			if len(*runs) != 1 || len(*steps) != 1 {
				t.Errorf("expected 1 run and 1 step, got %d runs / %d steps", len(*runs), len(*steps))
			}
		})
	}
}

func TestRuntime_RunAgent_ReActAndMaxSteps(t *testing.T) {
	t.Run("executes MCP tool in background SpaceContext and completes", func(t *testing.T) {
		var sawSpaceID string
		var turn int
		inv := &ModelInvokerMock{
			InvokeFunc: func(_ context.Context, req InvokeRequest) (*message.Assistant, error) {
				turn++
				if turn == 1 {
					return &message.Assistant{
						Content: message.Content{
							&message.ToolCall{ID: "tc_1", Name: "finance_list_accounts", Args: map[string]any{}},
						},
					}, nil
				}
				return &message.Assistant{
					Content: message.Content{&message.TextBlock{Text: `{"total":2}`}},
				}, nil
			},
		}

		lt, _ := tool.New("finance_list_accounts", "List Accounts", "Lists accounts", func(ctx context.Context, _ struct{}) (map[string]any, error) {
			sawSpaceID, _ = auth.SpaceIDFromContext(ctx)
			return map[string]any{"count": 2}, nil
		})
		mcpConn := &MCPConnectorMock{
			ConnectToolsFunc: func(ctx context.Context, _ *MCPServer, _ []string) (*ConnectedMCPTools, error) {
				if sid, ok := auth.SpaceIDFromContext(ctx); !ok || sid != "spc_1" {
					t.Errorf("expected background SpaceContext spc_1 injected for MCP dialer, got %q (ok=%v)", sid, ok)
				}
				return &ConnectedMCPTools{
					Tools: []*BoundMCPTool{{
						MCPServerID:      "mcp_saturn",
						MCPServerName:    "Saturn Workspace",
						OriginalToolName: "finance_list_accounts",
						Tool:             lt,
						ReadOnlyHint:     true,
					}},
					Close: func() {},
				}, nil
			},
		}

		rt, _, steps := newTestRuntimeHarness(t, 0, nil, inv, mcpConn)
		run, err := rt.RunAgent(context.Background(), RunAgentRequest{
			SpaceID:      "spc_1",
			AgentID:      "agt_1",
			Prompt:       "How many accounts?",
			OutputSchema: map[string]any{"type": "object"},
		})
		if err != nil {
			t.Fatalf("RunAgent failed: %v", err)
		}
		if run.Status != RunCompleted || sawSpaceID != "spc_1" || run.Output.Data["total"] != float64(2) {
			t.Errorf("unexpected run result: status=%s sawSpaceID=%q out=%+v", run.Status, sawSpaceID, run.Output)
		}
		if len(*steps) != 3 || (*steps)[1].Kind != StepKindTool || *(*steps)[1].MCPServerID != "mcp_saturn" {
			t.Errorf("expected LLM -> Tool -> LLM steps with mcp_server_id, got %+v", *steps)
		}
	})

	t.Run("stops at max_steps_exceeded", func(t *testing.T) {
		inv := &ModelInvokerMock{
			InvokeFunc: func(_ context.Context, _ InvokeRequest) (*message.Assistant, error) {
				return &message.Assistant{
					Content: message.Content{
						&message.ToolCall{ID: "tc_loop", Name: "finance_list_accounts", Args: map[string]any{}},
					},
				}, nil
			},
		}
		lt, _ := tool.New("finance_list_accounts", "List Accounts", "Lists accounts", func(_ context.Context, _ struct{}) (map[string]any, error) {
			return map[string]any{"ok": true}, nil
		})
		mcpConn := &MCPConnectorMock{
			ConnectToolsFunc: func(_ context.Context, _ *MCPServer, _ []string) (*ConnectedMCPTools, error) {
				return &ConnectedMCPTools{
					Tools: []*BoundMCPTool{{
						MCPServerID:      "mcp_saturn",
						OriginalToolName: "finance_list_accounts",
						Tool:             lt,
						ReadOnlyHint:     true,
					}},
					Close: func() {},
				}, nil
			},
		}

		rt, _, _ := newTestRuntimeHarness(t, 0, nil, inv, mcpConn)
		run, err := rt.RunAgent(context.Background(), RunAgentRequest{
			SpaceID: "spc_1",
			AgentID: "agt_1",
			Prompt:  "Loop forever",
		})
		if err == nil || errors.CodeOf(err) != CodeMaxStepsExceeded {
			t.Fatalf("expected CodeMaxStepsExceeded, got %v", err)
		}
		if run.Status != RunMaxStepsExceeded {
			t.Errorf("run status = %q, want max_steps_exceeded", run.Status)
		}
	})
}
