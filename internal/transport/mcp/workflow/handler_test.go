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
		{
			name: "list flow runs returns duration, tokens, and localized timestamps",
			ctx: auth.WithSpaceScope(
				auth.WithPrincipal(context.Background(), auth.Principal{
					Subject:  "usr_1",
					APIKeyID: "apk_1",
					Scopes:   []string{string(identity.ScopeWorkflowsRead)},
				}),
				"spc_1",
				string(space.RoleViewer),
			),
			toolName: "workflows_list_flow_runs",
			args: map[string]any{
				"flow_id": "flw_1",
				"status":  "completed",
				"limit":   10,
			},
			setupMocks: func(agg *WorkflowAggregatorMock, _ *WorkflowCoordinatorMock, ss *SpaceSettingsReaderMock) {
				ss.GetSettingsFunc = func(_ context.Context, _ *spaceapp.GetSettingsRequest) (*settings.Entry[space.Settings], error) {
					return &settings.Entry[space.Settings]{Value: space.Settings{Timezone: "America/New_York"}}, nil
				}
				agg.ListFlowRunsFunc = func(_ context.Context, filter workflow.ListFlowRunsFilter) (*workflowaggregator.FlowRunListResult, error) {
					if filter.FlowID == nil || *filter.FlowID != "flw_1" || filter.Status == nil || *filter.Status != workflow.RunCompleted || filter.PageSize != 10 {
						t.Errorf("unexpected list flow runs filter: %+v", filter)
					}
					start := time.Date(2026, 4, 15, 14, 0, 0, 0, time.UTC)
					end := start.Add(1500 * time.Millisecond)
					return &workflowaggregator.FlowRunListResult{
						Runs: []*workflowaggregator.FlowRunView{
							{
								FlowRun: &workflow.FlowRun{
									ID:         "wfr_1",
									FlowID:     "flw_1",
									Status:     workflow.RunCompleted,
									StartTime:  new(start),
									EndTime:    new(end),
									CreateTime: start,
									Metadata:   map[string]any{"tokens_used": 340},
								},
								FlowName: new("Receipt Classifier"),
							},
						},
						NextPageToken: "tok_2",
					}, nil
				}
			},
			assertOut: func(t *testing.T, out map[string]any) {
				runs := out["runs"].([]any)
				if len(runs) != 1 {
					t.Fatalf("expected 1 run, got %d", len(runs))
				}
				first := runs[0].(map[string]any)
				if first["duration_ms"] != float64(1500) || first["tokens_used"] != float64(340) || out["next_page_token"] != "tok_2" {
					t.Errorf("unexpected flow run summary: %+v", out)
				}
			},
		},
		{
			name: "list flow runs rejects invalid status",
			ctx: auth.WithSpaceScope(
				auth.WithPrincipal(context.Background(), auth.Principal{Subject: "usr_1"}),
				"spc_1",
				string(space.RoleViewer),
			),
			toolName: "workflows_list_flow_runs",
			args:     map[string]any{"status": "bogus"},
			wantErr:  true,
		},
		{
			name: "set flow enabled enables workflow",
			ctx: auth.WithSpaceScope(
				auth.WithPrincipal(context.Background(), auth.Principal{
					Subject:  "usr_1",
					APIKeyID: "apk_1",
					Scopes:   []string{string(identity.ScopeWorkflowsWrite)},
				}),
				"spc_1",
				string(space.RoleMember),
			),
			toolName: "workflows_set_flow_enabled",
			args:     map[string]any{"id": "flw_1", "enabled": true},
			setupMocks: func(_ *WorkflowAggregatorMock, coord *WorkflowCoordinatorMock, _ *SpaceSettingsReaderMock) {
				coord.EnableFlowFunc = func(_ context.Context, id string) (*workflow.Flow, error) {
					return &workflow.Flow{
						ID:        id,
						Name:      "Receipt Classifier",
						IsEnabled: true,
					}, nil
				}
			},
			assertOut: func(t *testing.T, out map[string]any) {
				if out["is_enabled"] != true || out["id"] != "flw_1" {
					t.Errorf("unexpected enable flow output: %+v", out)
				}
			},
		},
		{
			name: "set flow enabled disables workflow",
			ctx: auth.WithSpaceScope(
				auth.WithPrincipal(context.Background(), auth.Principal{Subject: "usr_1"}),
				"spc_1",
				string(space.RoleMember),
			),
			toolName: "workflows_set_flow_enabled",
			args:     map[string]any{"id": "system.finance.inbox_ingestion", "enabled": false},
			setupMocks: func(_ *WorkflowAggregatorMock, coord *WorkflowCoordinatorMock, _ *SpaceSettingsReaderMock) {
				coord.DisableFlowFunc = func(_ context.Context, id string) (*workflow.Flow, error) {
					return &workflow.Flow{
						ID:        "flw_sys",
						SystemKey: new(id),
						IsSystem:  true,
						IsEnabled: false,
						Name:      "Inbox Ingestion",
					}, nil
				}
			},
			assertOut: func(t *testing.T, out map[string]any) {
				if out["is_enabled"] != false || out["system_key"] != "system.finance.inbox_ingestion" {
					t.Errorf("unexpected disable flow output: %+v", out)
				}
			},
		},
		{
			name: "set flow enabled empty id fails",
			ctx: auth.WithSpaceScope(
				auth.WithPrincipal(context.Background(), auth.Principal{Subject: "usr_1"}),
				"spc_1",
				string(space.RoleMember),
			),
			toolName: "workflows_set_flow_enabled",
			args:     map[string]any{"id": " ", "enabled": true},
			wantErr:  true,
		},
		{
			name: "set flow enabled propagates coordinator error",
			ctx: auth.WithSpaceScope(
				auth.WithPrincipal(context.Background(), auth.Principal{Subject: "usr_1"}),
				"spc_1",
				string(space.RoleMember),
			),
			toolName: "workflows_set_flow_enabled",
			args:     map[string]any{"id": "flw_missing", "enabled": true},
			setupMocks: func(_ *WorkflowAggregatorMock, coord *WorkflowCoordinatorMock, _ *SpaceSettingsReaderMock) {
				coord.EnableFlowFunc = func(_ context.Context, _ string) (*workflow.Flow, error) {
					return nil, errors.E(errors.NotExist, "flow not found")
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

func TestWorkflowHandler_ViewerReadOnlyTools(t *testing.T) {
	srv := mcptransport.NewServer(mcptransport.ServerConfig{})
	NewHandler(Dependencies{
		Aggregator:    &WorkflowAggregatorMock{},
		Coordinator:   &WorkflowCoordinatorMock{},
		SpaceSettings: &SpaceSettingsReaderMock{},
	}).Register(srv.Registry())

	ctx := auth.WithSpaceScope(
		auth.WithPrincipal(context.Background(), auth.Principal{Subject: "usr_1"}),
		"spc_1",
		string(space.RoleViewer),
	)
	session, err := srv.ConnectInMemory(ctx)
	if err != nil {
		t.Fatalf("ConnectInMemory failed: %v", err)
	}
	defer func() { _ = session.Close() }()

	toolsRes, err := session.ListTools(context.Background(), &sdkmcp.ListToolsParams{})
	if err != nil {
		t.Fatalf("ListTools failed: %v", err)
	}
	for _, tool := range toolsRes.Tools {
		if !tool.Annotations.ReadOnlyHint {
			t.Errorf("unexpected non-readonly tool %q exposed to viewer", tool.Name)
		}
	}
}
