package mcpworkflow

import (
	"context"
	"testing"
	"time"

	workflowaggregator "github.com/masterkeysrd/saturn/internal/aggregator/workflow"
	spaceapp "github.com/masterkeysrd/saturn/internal/application/space"
	workflowapp "github.com/masterkeysrd/saturn/internal/application/workflow"
	"github.com/masterkeysrd/saturn/internal/domain/identity"
	"github.com/masterkeysrd/saturn/internal/domain/space"
	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/settings"
	"github.com/masterkeysrd/saturn/internal/platform/workflow"
	mcptransport "github.com/masterkeysrd/saturn/internal/transport/mcp"
	sdkmcp "github.com/modelcontextprotocol/go-sdk/mcp"
)

func TestWorkflowHandler(t *testing.T) {
	tests := []struct {
		name       string
		ctx        context.Context
		toolName   string
		args       map[string]any
		setupMocks func(agg *WorkflowAggregatorMock, coord *WorkflowCoordinatorMock, ss *SpaceSettingsReaderMock)
		wantErr    bool
		assertOut  func(t *testing.T, out map[string]any)
	}{
		{
			name: "list flows succeeds",
			ctx: auth.WithSpaceScope(
				auth.WithPrincipal(context.Background(), auth.Principal{
					Subject:  "usr_1",
					APIKeyID: "apk_1",
					Scopes:   []string{string(identity.ScopeWorkflowsRead)},
				}),
				"spc_1",
				string(space.RoleViewer),
			),
			toolName: "workflows_list_flows",
			args:     map[string]any{},
			setupMocks: func(agg *WorkflowAggregatorMock, _ *WorkflowCoordinatorMock, _ *SpaceSettingsReaderMock) {
				agg.ListFlowsFunc = func(_ context.Context, _ workflow.ListFlowsFilter) ([]*workflow.Flow, error) {
					return []*workflow.Flow{
						{
							ID:        "flw_1",
							SystemKey: new("system.finance.inbox_ingestion"),
							IsSystem:  true,
							IsEnabled: true,
							Name:      "Inbox Ingestion",
							Stats:     &workflow.FlowStats{TotalRuns7d: 12},
						},
					}, nil
				}
			},
			assertOut: func(t *testing.T, out map[string]any) {
				flows := out["flows"].([]any)
				if len(flows) != 1 || flows[0].(map[string]any)["name"] != "Inbox Ingestion" {
					t.Errorf("unexpected flows: %+v", flows)
				}
			},
		},
		{
			name: "get flow run returns localized timestamp and steps",
			ctx: auth.WithSpaceScope(
				auth.WithPrincipal(context.Background(), auth.Principal{Subject: "usr_1"}),
				"spc_1",
				string(space.RoleMember),
			),
			toolName: "workflows_get_flow_run",
			args:     map[string]any{"id": "wfr_1"},
			setupMocks: func(agg *WorkflowAggregatorMock, _ *WorkflowCoordinatorMock, ss *SpaceSettingsReaderMock) {
				ss.GetSettingsFunc = func(_ context.Context, _ *spaceapp.GetSettingsRequest) (*settings.Entry[space.Settings], error) {
					return &settings.Entry[space.Settings]{Value: space.Settings{Timezone: "UTC"}}, nil
				}
				agg.GetFlowRunFunc = func(_ context.Context, id string) (*workflowaggregator.FlowRunView, error) {
					return &workflowaggregator.FlowRunView{
						FlowRun: &workflow.FlowRun{
							ID:         id,
							FlowID:     "flw_1",
							Status:     workflow.RunCompleted,
							CreateTime: time.Date(2026, 4, 15, 12, 0, 0, 0, time.UTC),
							StepRuns: []workflow.StepRun{
								{StepID: "step_1", StepType: "filter", Status: workflow.StepCompleted},
							},
						},
						FlowName: new("Inbox Ingestion"),
					}, nil
				}
			},
			assertOut: func(t *testing.T, out map[string]any) {
				if out["flow_name"] != "Inbox Ingestion" || len(out["step_runs"].([]any)) != 1 {
					t.Errorf("unexpected flow run output: %+v", out)
				}
			},
		},
		{
			name: "execute flow succeeds",
			ctx: auth.WithSpaceScope(
				auth.WithPrincipal(context.Background(), auth.Principal{
					Subject:  "usr_1",
					APIKeyID: "apk_1",
					Scopes:   []string{string(identity.ScopeWorkflowsExecute)},
				}),
				"spc_1",
				string(space.RoleMember),
			),
			toolName: "workflows_execute_flow",
			args: map[string]any{
				"id":    "flw_1",
				"input": map[string]any{"amount": 500},
				"async": true,
			},
			setupMocks: func(_ *WorkflowAggregatorMock, coord *WorkflowCoordinatorMock, _ *SpaceSettingsReaderMock) {
				coord.ExecuteFlowFunc = func(_ context.Context, req *workflowapp.ExecuteFlowRequest) (*workflow.FlowRun, error) {
					if req.ID != "flw_1" || !req.Async {
						t.Errorf("unexpected execute request: %+v", req)
					}
					return &workflow.FlowRun{
						ID:     "wfr_new",
						FlowID: "flw_1",
						Status: workflow.RunPending,
					}, nil
				}
			},
			assertOut: func(t *testing.T, out map[string]any) {
				if out["id"] != "wfr_new" || out["status"] != "pending" {
					t.Errorf("unexpected execute output: %+v", out)
				}
			},
		},
		{
			name: "execute flow empty id fails",
			ctx: auth.WithSpaceScope(
				auth.WithPrincipal(context.Background(), auth.Principal{Subject: "usr_1"}),
				"spc_1",
				string(space.RoleMember),
			),
			toolName: "workflows_execute_flow",
			args:     map[string]any{"id": "  "},
			wantErr:  true,
		},
		{
			name: "get flow run propagates not found",
			ctx: auth.WithSpaceScope(
				auth.WithPrincipal(context.Background(), auth.Principal{Subject: "usr_1"}),
				"spc_1",
				string(space.RoleMember),
			),
			toolName: "workflows_get_flow_run",
			args:     map[string]any{"id": "wfr_missing"},
			setupMocks: func(agg *WorkflowAggregatorMock, _ *WorkflowCoordinatorMock, _ *SpaceSettingsReaderMock) {
				agg.GetFlowRunFunc = func(_ context.Context, _ string) (*workflowaggregator.FlowRunView, error) {
					return nil, errors.E(errors.NotExist, "flow run not found")
				}
			},
			wantErr: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			agg := &WorkflowAggregatorMock{}
			coord := &WorkflowCoordinatorMock{}
			ss := &SpaceSettingsReaderMock{}
			if tc.setupMocks != nil {
				tc.setupMocks(agg, coord, ss)
			}

			srv := mcptransport.NewServer(mcptransport.ServerConfig{})
			NewHandler(Dependencies{
				Aggregator:    agg,
				Coordinator:   coord,
				SpaceSettings: ss,
			}).Register(srv.Registry())

			session, err := srv.ConnectInMemory(tc.ctx)
			if err != nil {
				t.Fatalf("ConnectInMemory failed: %v", err)
			}
			defer func() { _ = session.Close() }()

			res, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
				Name:      tc.toolName,
				Arguments: tc.args,
			})
			if err != nil {
				t.Fatalf("CallTool failed: %v", err)
			}
			if tc.wantErr {
				if !res.IsError {
					t.Fatal("expected IsError=true")
				}
				return
			}
			if res.IsError {
				t.Fatalf("unexpected tool error: %+v", res.Content)
			}
			tc.assertOut(t, res.StructuredContent.(map[string]any))
		})
	}
}
