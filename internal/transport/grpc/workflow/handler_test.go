package workflow

import (
	"context"
	"testing"
	"time"

	workflowv1 "github.com/masterkeysrd/saturn/apis/saturn/platform/workflow/v1"
	workflowaggregator "github.com/masterkeysrd/saturn/internal/aggregator/workflow"
	workflowapp "github.com/masterkeysrd/saturn/internal/application/workflow"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/workflow"
	"google.golang.org/grpc/metadata"
	"google.golang.org/protobuf/types/known/fieldmaskpb"
	"google.golang.org/protobuf/types/known/structpb"
)

type stubCoordinator struct {
	workflowapp.Coordinator
	ensureFn   func(ctx context.Context) error
	createFn   func(ctx context.Context, flow *workflow.Flow) (*workflow.Flow, error)
	updateFn   func(ctx context.Context, req *workflowapp.UpdateFlowRequest) (*workflow.Flow, error)
	deleteFn   func(ctx context.Context, id string) error
	enableFn   func(ctx context.Context, id string) (*workflow.Flow, error)
	disableFn  func(ctx context.Context, id string) (*workflow.Flow, error)
	resetFn    func(ctx context.Context, id string) (*workflow.Flow, error)
	executeFn  func(ctx context.Context, req *workflowapp.ExecuteFlowRequest) (*workflow.FlowRun, error)
	webhookFn  func(ctx context.Context, req *workflowapp.InvokeWebhookTriggerRequest) (*workflow.FlowRun, error)
	testFn     func(ctx context.Context, req *workflowapp.TestFlowRequest) (*workflow.FlowRun, error)
	generateFn func(ctx context.Context, req *workflowapp.GenerateFlowRequest) (*workflow.Flow, error)
}

func (s *stubCoordinator) EnsureSystemFlows(ctx context.Context) error {
	return s.ensureFn(ctx)
}

func (s *stubCoordinator) CreateFlow(ctx context.Context, flow *workflow.Flow) (*workflow.Flow, error) {
	return s.createFn(ctx, flow)
}

func (s *stubCoordinator) UpdateFlow(ctx context.Context, req *workflowapp.UpdateFlowRequest) (*workflow.Flow, error) {
	return s.updateFn(ctx, req)
}

func (s *stubCoordinator) DeleteFlow(ctx context.Context, id string) error {
	return s.deleteFn(ctx, id)
}

func (s *stubCoordinator) EnableFlow(ctx context.Context, id string) (*workflow.Flow, error) {
	return s.enableFn(ctx, id)
}

func (s *stubCoordinator) DisableFlow(ctx context.Context, id string) (*workflow.Flow, error) {
	return s.disableFn(ctx, id)
}

func (s *stubCoordinator) ResetFlow(ctx context.Context, id string) (*workflow.Flow, error) {
	return s.resetFn(ctx, id)
}

func (s *stubCoordinator) ExecuteFlow(ctx context.Context, req *workflowapp.ExecuteFlowRequest) (*workflow.FlowRun, error) {
	return s.executeFn(ctx, req)
}

func (s *stubCoordinator) InvokeWebhookTrigger(ctx context.Context, req *workflowapp.InvokeWebhookTriggerRequest) (*workflow.FlowRun, error) {
	return s.webhookFn(ctx, req)
}

func (s *stubCoordinator) TestFlow(ctx context.Context, req *workflowapp.TestFlowRequest) (*workflow.FlowRun, error) {
	return s.testFn(ctx, req)
}

func (s *stubCoordinator) GenerateFlow(ctx context.Context, req *workflowapp.GenerateFlowRequest) (*workflow.Flow, error) {
	return s.generateFn(ctx, req)
}

type stubAggregator struct {
	listFlowsFn    func(ctx context.Context, filter workflow.ListFlowsFilter) ([]*workflow.Flow, error)
	getFlowFn      func(ctx context.Context, id string) (*workflow.Flow, error)
	listFlowRunsFn func(ctx context.Context, filter workflow.ListFlowRunsFilter) (*workflowaggregator.FlowRunListResult, error)
	getFlowRunFn   func(ctx context.Context, id string) (*workflowaggregator.FlowRunView, error)
	catalogFn      func(locale string) workflow.Catalog
}

func (s *stubAggregator) ListFlows(ctx context.Context, filter workflow.ListFlowsFilter) ([]*workflow.Flow, error) {
	return s.listFlowsFn(ctx, filter)
}

func (s *stubAggregator) GetFlow(ctx context.Context, id string) (*workflow.Flow, error) {
	return s.getFlowFn(ctx, id)
}

func (s *stubAggregator) ListFlowRuns(ctx context.Context, filter workflow.ListFlowRunsFilter) (*workflowaggregator.FlowRunListResult, error) {
	return s.listFlowRunsFn(ctx, filter)
}

func (s *stubAggregator) GetFlowRun(ctx context.Context, id string) (*workflowaggregator.FlowRunView, error) {
	return s.getFlowRunFn(ctx, id)
}

func (s *stubAggregator) GetCatalog(locale string) workflow.Catalog {
	return s.catalogFn(locale)
}

func TestHandler_AllRPCs(t *testing.T) {
	now := time.Date(2026, 5, 1, 10, 0, 0, 0, time.UTC)

	t.Run("ListFlows_And_GetFlow_WithLazySystemSeeding", func(t *testing.T) {
		ensured := false
		getCalls := 0
		h := NewHandler(&stubCoordinator{
			ensureFn: func(_ context.Context) error {
				ensured = true
				return nil
			},
		}, &stubAggregator{
			listFlowsFn: func(_ context.Context, _ workflow.ListFlowsFilter) ([]*workflow.Flow, error) {
				return []*workflow.Flow{
					{
						ID:        "flw_1",
						SpaceID:   "spc_1",
						IsSystem:  true,
						IsEnabled: true,
						Name:      "Inbox",
						Steps: []workflow.StepNode{
							{
								ID:   "sw",
								Type: workflow.StepSwitch,
								Cases: []workflow.SwitchCase{
									{Name: "c1", Condition: "true", Steps: []workflow.StepNode{{ID: "inner", Type: workflow.StepStop}}},
								},
							},
						},
						Triggers: []workflow.Trigger{{ID: "trg_1", Name: "Manual", Type: workflow.TriggerManual, IsEnabled: true}},
						Stats:    &workflow.FlowStats{TotalRuns7d: 3, LastRunAt: &now, DailyCounts7d: []int32{0, 0, 0, 0, 0, 1, 2}},
					},
				}, nil
			},
			getFlowFn: func(_ context.Context, id string) (*workflow.Flow, error) {
				getCalls++
				if getCalls == 1 {
					return nil, workflow.ErrFlowNotFound
				}
				return &workflow.Flow{ID: "flw_sys", SystemKey: new(id), Name: "System Flow"}, nil
			},
		})

		listRes, err := h.ListFlows(t.Context(), &workflowv1.ListFlowsRequest{})
		if err != nil || !ensured || len(listRes.Flows) != 1 || listRes.Flows[0].Stats.TotalRuns_7D != 3 {
			t.Fatalf("ListFlows = (%+v, %v), ensured=%v", listRes, err, ensured)
		}

		sysFlow, err := h.GetFlow(t.Context(), &workflowv1.GetFlowRequest{Id: "system.finance.inbox_ingestion"})
		if err != nil || getCalls != 2 || sysFlow.Id != "flw_sys" {
			t.Fatalf("GetFlow lazy seed = (%+v, %v), calls=%d", sysFlow, err, getCalls)
		}
	})

	t.Run("Create_Update_Delete_Enable_Disable_Reset", func(t *testing.T) {
		h := NewHandler(&stubCoordinator{
			createFn: func(_ context.Context, flow *workflow.Flow) (*workflow.Flow, error) {
				return &workflow.Flow{ID: "flw_new", Name: flow.Name, Steps: flow.Steps}, nil
			},
			updateFn: func(_ context.Context, req *workflowapp.UpdateFlowRequest) (*workflow.Flow, error) {
				if len(req.UpdateMask) != 1 || req.UpdateMask[0] != "name" {
					t.Errorf("unexpected update mask: %v", req.UpdateMask)
				}
				return &workflow.Flow{ID: req.ID, Name: req.Flow.Name}, nil
			},
			deleteFn: func(_ context.Context, id string) error {
				if id == "flw_sys" {
					return workflow.ErrCannotDeleteSystemFlow
				}
				return nil
			},
			enableFn: func(_ context.Context, id string) (*workflow.Flow, error) {
				return &workflow.Flow{ID: id, IsEnabled: true}, nil
			},
			disableFn: func(_ context.Context, id string) (*workflow.Flow, error) {
				return &workflow.Flow{ID: id, IsEnabled: false}, nil
			},
			resetFn: func(_ context.Context, id string) (*workflow.Flow, error) {
				return &workflow.Flow{ID: id, IsSystem: true}, nil
			},
		}, &stubAggregator{})

		created, err := h.CreateFlow(t.Context(), &workflowv1.CreateFlowRequest{
			Flow: &workflowv1.Flow{
				Name:      "My Flow",
				IsEnabled: true,
				Steps:     []*workflowv1.Flow_StepNode{{Id: "s1", Type: workflow.StepTransform}},
			},
		})
		if err != nil || created.Id != "flw_new" {
			t.Fatalf("CreateFlow = (%+v, %v)", created, err)
		}

		updated, err := h.UpdateFlow(t.Context(), &workflowv1.UpdateFlowRequest{
			Id:         "flw_new",
			Flow:       &workflowv1.Flow{Name: "Renamed"},
			UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{"name"}},
		})
		if err != nil || updated.Name != "Renamed" {
			t.Fatalf("UpdateFlow = (%+v, %v)", updated, err)
		}

		if _, err := h.DeleteFlow(t.Context(), &workflowv1.DeleteFlowRequest{Id: "flw_sys"}); !errors.Is(err, workflow.ErrCannotDeleteSystemFlow) {
			t.Fatalf("expected ErrCannotDeleteSystemFlow, got %v", err)
		}
		if _, err := h.DeleteFlow(t.Context(), &workflowv1.DeleteFlowRequest{Id: "flw_new"}); err != nil {
			t.Fatalf("DeleteFlow error = %v", err)
		}

		if en, err := h.EnableFlow(t.Context(), &workflowv1.EnableFlowRequest{Id: "flw_new"}); err != nil || !en.IsEnabled {
			t.Fatalf("EnableFlow = (%+v, %v)", en, err)
		}
		if dis, err := h.DisableFlow(t.Context(), &workflowv1.DisableFlowRequest{Id: "flw_new"}); err != nil || dis.IsEnabled {
			t.Fatalf("DisableFlow = (%+v, %v)", dis, err)
		}
		if rst, err := h.ResetFlow(t.Context(), &workflowv1.ResetFlowRequest{Id: "system.finance.inbox_ingestion"}); err != nil || !rst.IsSystem {
			t.Fatalf("ResetFlow = (%+v, %v)", rst, err)
		}
	})

	t.Run("Execute_Webhook_Test_Generate", func(t *testing.T) {
		inStruct, _ := structpb.NewStruct(map[string]any{"text": "hi"})
		h := NewHandler(&stubCoordinator{
			executeFn: func(_ context.Context, req *workflowapp.ExecuteFlowRequest) (*workflow.FlowRun, error) {
				return &workflow.FlowRun{
					ID:     "wfr_exec",
					FlowID: req.ID,
					Status: workflow.RunCompleted,
					Output: map[string]any{"done": true},
					StepRuns: []workflow.StepRun{
						{ID: "wsr_1", StepID: "s1", Status: workflow.StepCompleted, StartTime: now, EndTime: &now},
					},
				}, nil
			},
			webhookFn: func(_ context.Context, req *workflowapp.InvokeWebhookTriggerRequest) (*workflow.FlowRun, error) {
				return &workflow.FlowRun{ID: "wfr_wh", TriggerID: new(req.TriggerID), Status: workflow.RunPending}, nil
			},
			testFn: func(_ context.Context, req *workflowapp.TestFlowRequest) (*workflow.FlowRun, error) {
				return &workflow.FlowRun{ID: "wfr_test", Status: workflow.RunCompleted, Output: map[string]any{"count": len(req.Artifacts)}}, nil
			},
			generateFn: func(_ context.Context, req *workflowapp.GenerateFlowRequest) (*workflow.Flow, error) {
				return &workflow.Flow{Name: "Generated", Description: req.Prompt}, nil
			},
		}, &stubAggregator{})

		execRes, err := h.ExecuteFlow(t.Context(), &workflowv1.ExecuteFlowRequest{Id: "flw_1", Input: inStruct})
		if err != nil || execRes.Id != "wfr_exec" || len(execRes.StepRuns) != 1 {
			t.Fatalf("ExecuteFlow = (%+v, %v)", execRes, err)
		}

		whRes, err := h.InvokeWebhookTrigger(t.Context(), &workflowv1.InvokeWebhookTriggerRequest{TriggerId: "trg_1", Payload: inStruct})
		if err != nil || whRes.Id != "wfr_wh" {
			t.Fatalf("InvokeWebhookTrigger = (%+v, %v)", whRes, err)
		}

		testRes, err := h.TestFlow(t.Context(), &workflowv1.TestFlowRequest{
			Flow:      &workflowv1.Flow{Name: "T"},
			Artifacts: []*workflowv1.InlineArtifact{{Filename: "a.txt", ContentType: "text/plain", Data: []byte("ok")}},
		})
		if err != nil || testRes.Output.AsMap()["count"] != float64(1) {
			t.Fatalf("TestFlow = (%+v, %v)", testRes, err)
		}

		genRes, err := h.GenerateFlow(t.Context(), &workflowv1.GenerateFlowRequest{Prompt: "automate"})
		if err != nil || genRes.Name != "Generated" {
			t.Fatalf("GenerateFlow = (%+v, %v)", genRes, err)
		}
	})

	t.Run("ListFlowRuns_GetFlowRun_And_CatalogWithStringSlices", func(t *testing.T) {
		h := NewHandler(&stubCoordinator{}, &stubAggregator{
			listFlowRunsFn: func(_ context.Context, _ workflow.ListFlowRunsFilter) (*workflowaggregator.FlowRunListResult, error) {
				return &workflowaggregator.FlowRunListResult{
					Runs:          []*workflowaggregator.FlowRunView{{FlowRun: &workflow.FlowRun{ID: "wfr_1"}, FlowName: new("Flow A")}},
					NextPageToken: "tok",
				}, nil
			},
			getFlowRunFn: func(_ context.Context, id string) (*workflowaggregator.FlowRunView, error) {
				return &workflowaggregator.FlowRunView{FlowRun: &workflow.FlowRun{ID: id}, FlowName: new("Flow A")}, nil
			},
			catalogFn: func(locale string) workflow.Catalog {
				return workflow.LocalizeCatalog(workflow.Catalog{
					TriggerTopics: []workflow.TriggerTopicDescriptor{
						{
							Topic:       "mail.message.received",
							DisplayName: "Message Received",
							Description: "Published on incremental delta syncs for newly ingested inbound messages.",
							PayloadSchema: map[string]any{
								"type":     "object",
								"required": []string{"message"},
							},
						},
					},
					CelHelpers: workflow.BuiltinCelHelpers(),
				}, locale)
			},
		})

		runsRes, err := h.ListFlowRuns(t.Context(), &workflowv1.ListFlowRunsRequest{Status: new("completed")})
		if err != nil || len(runsRes.Runs) != 1 || runsRes.NextPageToken != "tok" {
			t.Fatalf("ListFlowRuns = (%+v, %v)", runsRes, err)
		}

		runRes, err := h.GetFlowRun(t.Context(), &workflowv1.GetFlowRunRequest{Id: "wfr_1"})
		if err != nil || runRes.GetFlowName() != "Flow A" {
			t.Fatalf("GetFlowRun = (%+v, %v)", runRes, err)
		}

		catRes, err := h.GetCatalog(t.Context(), &workflowv1.GetCatalogRequest{})
		if err != nil || len(catRes.TriggerTopics) != 1 || len(catRes.CelHelpers) == 0 {
			t.Fatalf("GetCatalog = (%+v, %v)", catRes, err)
		}
	})

	t.Run("GetCatalog_Localization", func(t *testing.T) {
		reg := workflow.NewRegistry()
		tests := []struct {
			name             string
			ctx              context.Context
			req              *workflowv1.GetCatalogRequest
			wantLocalePassed string
			wantFilterName   string
		}{
			{
				name:             "explicit locale es-ES",
				ctx:              t.Context(),
				req:              &workflowv1.GetCatalogRequest{Locale: new("es-ES")},
				wantLocalePassed: "es-ES",
				wantFilterName:   "Filtrar",
			},
			{
				name:             "accept-language metadata fallback",
				ctx:              metadata.NewIncomingContext(t.Context(), metadata.Pairs("accept-language", "es-419,es;q=0.9")),
				req:              &workflowv1.GetCatalogRequest{},
				wantLocalePassed: "es-419,es;q=0.9",
				wantFilterName:   "Filtrar",
			},
			{
				name:             "grpcgateway-accept-language metadata fallback",
				ctx:              metadata.NewIncomingContext(t.Context(), metadata.Pairs("grpcgateway-accept-language", "es-DO")),
				req:              &workflowv1.GetCatalogRequest{},
				wantLocalePassed: "es-DO",
				wantFilterName:   "Filtrar",
			},
			{
				name:             "default english",
				ctx:              t.Context(),
				req:              &workflowv1.GetCatalogRequest{},
				wantLocalePassed: "",
				wantFilterName:   "Filter",
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				var gotLocale string
				h := NewHandler(&stubCoordinator{}, &stubAggregator{
					catalogFn: func(locale string) workflow.Catalog {
						gotLocale = locale
						return workflow.LocalizeCatalog(reg.Catalog(), locale)
					},
				})

				cat, err := h.GetCatalog(tc.ctx, tc.req)
				if err != nil {
					t.Fatalf("GetCatalog error = %v", err)
				}
				if gotLocale != tc.wantLocalePassed {
					t.Errorf("passed locale = %q, want %q", gotLocale, tc.wantLocalePassed)
				}
				found := false
				for _, st := range cat.Steps {
					if st.Type == workflow.StepFilter {
						found = true
						if st.DisplayName != tc.wantFilterName {
							t.Errorf("StepFilter DisplayName = %q, want %q", st.DisplayName, tc.wantFilterName)
						}
					}
				}
				if !found {
					t.Fatalf("StepFilter not found in response")
				}
			})
		}
	})
}
