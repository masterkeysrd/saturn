package workflowapp

import (
	"context"
	"encoding/json/v2"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/masterkeysrd/saturn/internal/domain/space"
	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	"github.com/masterkeysrd/saturn/internal/platform/ai"
	"github.com/masterkeysrd/saturn/internal/platform/db"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	platformi18n "github.com/masterkeysrd/saturn/internal/platform/i18n"
	"github.com/masterkeysrd/saturn/internal/platform/scheduler"
	"github.com/masterkeysrd/saturn/internal/platform/workflow"
)

type noopTransactor struct{}

func (noopTransactor) Begin(ctx context.Context) (context.Context, *db.TxController, error) {
	return ctx, &db.TxController{}, nil
}

func (noopTransactor) WithTx(ctx context.Context, fn func(ctx context.Context) error) error {
	return fn(ctx)
}

func testSpaceCtx(spaceID, role string) context.Context {
	return auth.WithSpaceScope(context.Background(), spaceID, role)
}

func newTestEngine(t *testing.T, reg *workflow.Registry) *workflow.Engine {
	t.Helper()
	if reg == nil {
		reg = workflow.NewRegistry()
	}
	eng, err := workflow.NewEngine(workflow.Dependencies{
		Registry: reg,
	})
	if err != nil {
		t.Fatalf("NewEngine() error = %v", err)
	}
	return eng
}

func defaultSpaceLoader() *SpaceContextLoaderMock {
	return &SpaceContextLoaderMock{
		LoadFunc: func(_ context.Context, spaceID string) (workflow.SpaceContext, error) {
			return workflow.SpaceContext{
				ID:              spaceID,
				Name:            "Personal",
				Timezone:        "UTC",
				DefaultCurrency: "USD",
			}, nil
		},
	}
}

func TestCoordinator_SystemFlows(t *testing.T) {
	t.Run("EnsureSystemFlows", func(t *testing.T) {
		tests := []struct {
			name    string
			ctx     context.Context
			setup   func(*WorkflowServiceMock, *ScheduleSyncerMock)
			wantErr bool
		}{
			{
				name: "SeedsAndSyncsSchedules",
				ctx:  testSpaceCtx("spc_1", string(space.RoleOwner)),
				setup: func(ws *WorkflowServiceMock, ss *ScheduleSyncerMock) {
					ws.EnsureSystemFlowsFunc = func(_ context.Context, spaceID string) ([]*workflow.Flow, error) {
						return []*workflow.Flow{
							{
								ID:        "flw_sys_1",
								SpaceID:   spaceID,
								IsEnabled: true,
								Triggers: []workflow.Trigger{
									{
										ID:        "trg_1",
										Name:      "Daily Cron",
										Type:      workflow.TriggerSchedule,
										IsEnabled: true,
										Config:    workflow.TriggerConfig{Cron: new("0 9 * * *"), ScheduleID: new("wfs_trg_1")},
									},
								},
							},
						}, nil
					}
					ss.RegisterScheduleFunc = func(_ context.Context, s scheduler.Schedule) error {
						if s.JobType != JobTypeExecuteTrigger || s.ID != "wfs_trg_1" {
							t.Errorf("unexpected schedule %+v", s)
						}
						return nil
					}
				},
			},
			{
				name:    "Unauthenticated",
				ctx:     context.Background(),
				wantErr: true,
			},
			{
				name: "ServiceErrorPropagates",
				ctx:  testSpaceCtx("spc_1", string(space.RoleOwner)),
				setup: func(ws *WorkflowServiceMock, _ *ScheduleSyncerMock) {
					ws.EnsureSystemFlowsFunc = func(_ context.Context, _ string) ([]*workflow.Flow, error) {
						return nil, errors.New("db error")
					}
				},
				wantErr: true,
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				ws := &WorkflowServiceMock{}
				ss := &ScheduleSyncerMock{}
				if tc.setup != nil {
					tc.setup(ws, ss)
				}

				coord := NewCoordinator(Dependencies{
					Workflow:  ws,
					Schedules: ss,
				})
				err := coord.EnsureSystemFlows(tc.ctx)
				if tc.wantErr {
					if err == nil {
						t.Fatal("expected error, got nil")
					}
					return
				}
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				if len(ss.RegisterScheduleCalls()) != 1 {
					t.Errorf("expected 1 RegisterSchedule call, got %d", len(ss.RegisterScheduleCalls()))
				}
			})
		}
	})

	t.Run("ResetFlow", func(t *testing.T) {
		tests := []struct {
			name    string
			ctx     context.Context
			id      string
			setup   func(*WorkflowServiceMock, *ScheduleSyncerMock)
			wantErr error
		}{
			{
				name: "RestoresFactoryAndSyncsRemovedSchedule",
				ctx:  testSpaceCtx("spc_1", string(space.RoleOwner)),
				id:   "system.test.flow",
				setup: func(ws *WorkflowServiceMock, ss *ScheduleSyncerMock) {
					ws.ResetFlowFunc = func(_ context.Context, _ string, _ string) (*workflow.Flow, []workflow.Trigger, error) {
						return &workflow.Flow{
							ID:        "flw_1",
							SpaceID:   "spc_1",
							IsEnabled: true,
							Name:      "Factory Flow",
							Triggers:  []workflow.Trigger{{ID: "trg_new", Type: workflow.TriggerManual, IsEnabled: true}},
						}, []workflow.Trigger{
							{ID: "trg_old", Type: workflow.TriggerSchedule, Config: workflow.TriggerConfig{ScheduleID: new("wfs_trg_old")}},
						}, nil
					}
					ss.PauseScheduleFunc = func(_ context.Context, scheduleID string) error {
						if scheduleID != "wfs_trg_old" {
							t.Errorf("unexpected scheduleID %q", scheduleID)
						}
						return nil
					}
				},
			},
			{
				name:    "ViewerDenied",
				ctx:     testSpaceCtx("spc_1", string(space.RoleViewer)),
				id:      "system.test.flow",
				wantErr: errors.E(errors.Permission),
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				ws := &WorkflowServiceMock{}
				ss := &ScheduleSyncerMock{}
				if tc.setup != nil {
					tc.setup(ws, ss)
				}
				coord := NewCoordinator(Dependencies{Workflow: ws, Schedules: ss})
				res, err := coord.ResetFlow(tc.ctx, tc.id)
				if tc.wantErr != nil {
					if !errors.Is(err, tc.wantErr) {
						t.Fatalf("expected %v, got %v", tc.wantErr, err)
					}
					return
				}
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				if res.Name != "Factory Flow" || len(ss.PauseScheduleCalls()) != 1 {
					t.Errorf("unexpected reset result: %+v", res)
				}
			})
		}
	})
}

func TestCoordinator_FlowCRUD(t *testing.T) {
	t.Run("CreateFlow", func(t *testing.T) {
		tests := []struct {
			name    string
			ctx     context.Context
			flow    *workflow.Flow
			setup   func(*WorkflowServiceMock, *ScheduleSyncerMock)
			wantErr error
		}{
			{
				name: "SuccessWithScheduleSync",
				ctx:  testSpaceCtx("spc_1", string(space.RoleMember)),
				flow: &workflow.Flow{
					Name:      "Morning Brief",
					IsEnabled: true,
					Steps:     []workflow.StepNode{{ID: "s1", Type: workflow.StepTransform}},
					Triggers: []workflow.Trigger{
						{Name: "Cron", Type: workflow.TriggerSchedule, IsEnabled: true, Config: workflow.TriggerConfig{Cron: new("0 8 * * *")}},
					},
				},
				setup: func(ws *WorkflowServiceMock, ss *ScheduleSyncerMock) {
					ws.CreateFlowFunc = func(_ context.Context, f *workflow.Flow) (*workflow.Flow, error) {
						f.ID = "flw_new"
						f.Triggers[0].ID = "trg_1"
						f.Triggers[0].Config.ScheduleID = new("wfs_trg_1")
						return f, nil
					}
					ss.RegisterScheduleFunc = func(_ context.Context, s scheduler.Schedule) error {
						if s.CronExpression != "0 8 * * *" {
							t.Errorf("unexpected cron %q", s.CronExpression)
						}
						return nil
					}
				},
			},
			{
				name:    "Unauthenticated",
				ctx:     context.Background(),
				flow:    &workflow.Flow{Name: "X"},
				wantErr: errors.E(errors.Unauthenticated),
			},
			{
				name:    "ViewerDenied",
				ctx:     testSpaceCtx("spc_1", string(space.RoleViewer)),
				flow:    &workflow.Flow{Name: "X"},
				wantErr: errors.E(errors.Permission),
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				ws := &WorkflowServiceMock{}
				ss := &ScheduleSyncerMock{}
				if tc.setup != nil {
					tc.setup(ws, ss)
				}
				coord := NewCoordinator(Dependencies{
					Workflow:  ws,
					Schedules: ss,
				})
				res, err := coord.CreateFlow(tc.ctx, tc.flow)
				if tc.wantErr != nil {
					if !errors.Is(err, tc.wantErr) {
						t.Fatalf("expected %v, got %v", tc.wantErr, err)
					}
					return
				}
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				if res.ID != "flw_new" || len(ss.RegisterScheduleCalls()) != 1 {
					t.Errorf("unexpected result: %+v", res)
				}
			})
		}
	})

	t.Run("UpdateAndDeleteAndToggleFlow", func(t *testing.T) {
		ctx := testSpaceCtx("spc_1", string(space.RoleOwner))

		ws := &WorkflowServiceMock{
			UpdateFlowFunc: func(_ context.Context, _ string, _ string, incoming *workflow.Flow, _ []string) (*workflow.Flow, []workflow.Trigger, error) {
				return &workflow.Flow{
					ID:        "flw_1",
					SpaceID:   "spc_1",
					IsEnabled: true,
					Name:      incoming.Name,
					Triggers:  []workflow.Trigger{},
				}, []workflow.Trigger{
					{ID: "trg_sched_old", Type: workflow.TriggerSchedule, Config: workflow.TriggerConfig{ScheduleID: new("wfs_trg_sched_old")}},
				}, nil
			},
			DeleteFlowFunc: func(_ context.Context, _, id string) ([]workflow.Trigger, error) {
				if id == "flw_sys" {
					return nil, workflow.ErrCannotDeleteSystemFlow
				}
				return []workflow.Trigger{
					{ID: "trg_sched_old", Type: workflow.TriggerSchedule, Config: workflow.TriggerConfig{ScheduleID: new("wfs_trg_sched_old")}},
				}, nil
			},
			SetFlowEnabledFunc: func(_ context.Context, _, id string, enabled bool) (*workflow.Flow, error) {
				return &workflow.Flow{
					ID:        id,
					SpaceID:   "spc_1",
					IsEnabled: enabled,
					Triggers: []workflow.Trigger{
						{ID: "trg_1", Type: workflow.TriggerSchedule, IsEnabled: true, Config: workflow.TriggerConfig{Cron: new("0 8 * * *"), ScheduleID: new("wfs_trg_1")}},
					},
				}, nil
			},
		}
		ss := &ScheduleSyncerMock{
			RegisterScheduleFunc: func(_ context.Context, _ scheduler.Schedule) error { return nil },
			PauseScheduleFunc:    func(_ context.Context, _ string) error { return nil },
		}

		coord := NewCoordinator(Dependencies{Workflow: ws, Schedules: ss})

		updated, err := coord.UpdateFlow(ctx, &UpdateFlowRequest{
			ID:         "flw_1",
			Flow:       &workflow.Flow{Name: "New Name"},
			UpdateMask: []string{"name", "triggers"},
		})
		if err != nil {
			t.Fatalf("UpdateFlow error = %v", err)
		}
		if updated.Name != "New Name" || len(ss.PauseScheduleCalls()) != 1 {
			t.Errorf("expected old schedule paused on removal, got %+v", ss.PauseScheduleCalls())
		}

		if err := coord.DeleteFlow(ctx, "flw_sys"); !errors.Is(err, workflow.ErrCannotDeleteSystemFlow) {
			t.Fatalf("expected ErrCannotDeleteSystemFlow, got %v", err)
		}
		if err := coord.DeleteFlow(ctx, "flw_1"); err != nil {
			t.Fatalf("DeleteFlow error = %v", err)
		}
		if _, err := coord.DisableFlow(ctx, "flw_1"); err != nil {
			t.Fatalf("DisableFlow error = %v", err)
		}
		if _, err := coord.EnableFlow(ctx, "flw_1"); err != nil {
			t.Fatalf("EnableFlow error = %v", err)
		}
		if len(ss.RegisterScheduleCalls()) != 1 || len(ss.PauseScheduleCalls()) != 3 {
			t.Errorf("unexpected schedule calls: register=%d pause=%d", len(ss.RegisterScheduleCalls()), len(ss.PauseScheduleCalls()))
		}
	})
}

func TestCoordinator_ExecutionAndTriggers(t *testing.T) {
	t.Run("ExecuteFlow_SyncWithInlineArtifactAndAsync", func(t *testing.T) {
		ctx := testSpaceCtx("spc_1", string(space.RoleOwner))
		eng := newTestEngine(t, nil)

		ws := &WorkflowServiceMock{
			ResolveFlowOrSeedSystemFunc: func(_ context.Context, _, id string) (*workflow.Flow, error) {
				if id == "flw_disabled" {
					return &workflow.Flow{ID: "flw_disabled", SpaceID: "spc_1", IsEnabled: false}, nil
				}
				return &workflow.Flow{
					ID:        "flw_sync",
					SpaceID:   "spc_1",
					IsEnabled: true,
					Name:      "Extract Flow",
					Steps: []workflow.StepNode{
						workflow.DocumentExtractTextStep(workflow.DocumentExtractTextStepConfig{
							ID:          "doc",
							ArtifactRef: "{{ input.document }}",
							Filename:    "note.txt",
							ContentType: "text/plain",
						}),
						workflow.OutputStep(workflow.OutputStepConfig{
							ID:    "out",
							Value: map[string]any{"extracted": "{{ steps.doc.text }}"},
						}),
					},
				}, nil
			},
			ExecuteFunc: eng.Execute,
			CreateOrResumeRunFunc: func(_ context.Context, run *workflow.FlowRun) (*workflow.FlowRun, bool, error) {
				run.ID = "wfr_async"
				return run, true, nil
			},
		}
		dispatcher := &RunDispatcherMock{
			DispatchFunc: func(_ context.Context, _, _ string) error { return nil },
		}

		coord := NewCoordinator(Dependencies{
			Workflow:    ws,
			SpaceLoader: defaultSpaceLoader(),
			Dispatcher:  dispatcher,
			Transactor:  noopTransactor{},
		})

		syncRun, err := coord.ExecuteFlow(ctx, &ExecuteFlowRequest{
			ID: "flw_sync",
			Artifacts: []InlineArtifact{
				{Filename: "note.txt", ContentType: "text/plain", Data: []byte("hello world")},
			},
		})
		if err != nil {
			t.Fatalf("ExecuteFlow sync error = %v", err)
		}
		if syncRun.Status != workflow.RunCompleted || syncRun.Output["extracted"] != "hello world" {
			t.Errorf("unexpected sync run: %+v", syncRun)
		}

		asyncRun, err := coord.ExecuteFlow(ctx, &ExecuteFlowRequest{
			ID:    "flw_sync",
			Input: map[string]any{"foo": "bar"},
			Async: true,
		})
		if err != nil {
			t.Fatalf("ExecuteFlow async error = %v", err)
		}
		if asyncRun.Status != workflow.RunPending || len(dispatcher.DispatchCalls()) != 1 {
			t.Errorf("unexpected async run: %+v", asyncRun)
		}

		if _, err := coord.ExecuteFlow(ctx, &ExecuteFlowRequest{ID: "flw_disabled"}); !errors.Is(err, workflow.ErrFlowDisabled) {
			t.Fatalf("expected ErrFlowDisabled, got %v", err)
		}

		if _, err := coord.ExecuteFlow(ctx, &ExecuteFlowRequest{
			ID:        "flw_sync",
			Async:     true,
			Artifacts: []InlineArtifact{{Filename: "note.txt", ContentType: "text/plain", Data: []byte("abc")}},
		}); !errors.Is(err, errors.Invalid) {
			t.Fatalf("expected errors.Invalid for async + inline artifacts, got %v", err)
		}
	})

	t.Run("InvokeWebhookTrigger", func(t *testing.T) {
		ctx := testSpaceCtx("spc_1", string(space.RoleOwner))
		eng := newTestEngine(t, nil)

		tests := []struct {
			name         string
			payload      map[string]any
			trigger      *workflow.Trigger
			flow         *workflow.Flow
			wantStatus   workflow.FlowRunStatus
			wantDispatch int
			wantErr      error
		}{
			{
				name:    "PassesFilterMapsInputAndDispatches",
				payload: map[string]any{"amount": 100.0, "vendor": "Stripe"},
				trigger: &workflow.Trigger{
					ID:        "trg_wh1",
					FlowID:    "flw_1",
					SpaceID:   "spc_1",
					Name:      "Webhook",
					Type:      workflow.TriggerWebhook,
					IsEnabled: true,
					Config: workflow.TriggerConfig{
						Filter:       new("trigger.data.amount > 10"),
						InputMapping: map[string]any{"merchant": "{{ trigger.data.vendor }}"},
					},
				},
				flow:         &workflow.Flow{ID: "flw_1", SpaceID: "spc_1", IsEnabled: true, Version: 2},
				wantStatus:   workflow.RunPending,
				wantDispatch: 1,
			},
			{
				name:    "FilteredOutReturnsFilteredWithoutDispatch",
				payload: map[string]any{"amount": 1.0, "vendor": "Tiny"},
				trigger: &workflow.Trigger{
					ID:        "trg_wh1",
					FlowID:    "flw_1",
					SpaceID:   "spc_1",
					Name:      "Webhook",
					Type:      workflow.TriggerWebhook,
					IsEnabled: true,
					Config: workflow.TriggerConfig{
						Filter: new("trigger.data.amount > 10"),
					},
				},
				flow:         &workflow.Flow{ID: "flw_1", SpaceID: "spc_1", IsEnabled: true},
				wantStatus:   workflow.RunFiltered,
				wantDispatch: 0,
			},
			{
				name:    "DisabledTriggerRejected",
				trigger: &workflow.Trigger{ID: "trg_wh1", Type: workflow.TriggerWebhook, IsEnabled: false},
				wantErr: workflow.ErrTriggerDisabled,
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				ws := &WorkflowServiceMock{
					GetTriggerFunc:            func(_ context.Context, _, _ string) (*workflow.Trigger, error) { return tc.trigger, nil },
					GetFlowFunc:               func(_ context.Context, _, _ string) (*workflow.Flow, error) { return tc.flow, nil },
					EvaluateTriggerFilterFunc: eng.EvaluateTriggerFilter,
					MapTriggerInputFunc:       eng.MapTriggerInput,
					CreateOrResumeRunFunc: func(_ context.Context, run *workflow.FlowRun) (*workflow.FlowRun, bool, error) {
						run.ID = "wfr_wh"
						return run, true, nil
					},
				}
				dispatcher := &RunDispatcherMock{
					DispatchFunc: func(_ context.Context, _, _ string) error { return nil },
				}

				coord := NewCoordinator(Dependencies{
					Workflow:    ws,
					SpaceLoader: defaultSpaceLoader(),
					Dispatcher:  dispatcher,
				})

				run, err := coord.InvokeWebhookTrigger(ctx, &InvokeWebhookTriggerRequest{
					TriggerID: "trg_wh1",
					Payload:   tc.payload,
				})
				if tc.wantErr != nil {
					if !errors.Is(err, tc.wantErr) {
						t.Fatalf("expected %v, got %v", tc.wantErr, err)
					}
					return
				}
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				if run.Status != tc.wantStatus || len(dispatcher.DispatchCalls()) != tc.wantDispatch {
					t.Errorf("got status=%s dispatches=%d, want status=%s dispatches=%d", run.Status, len(dispatcher.DispatchCalls()), tc.wantStatus, tc.wantDispatch)
				}
			})
		}
	})

	t.Run("TestFlow_ZeroPersistenceDryRun", func(t *testing.T) {
		ctx := testSpaceCtx("spc_1", string(space.RoleOwner))
		eng := newTestEngine(t, nil)
		var persistCalls atomic.Int32

		ws := &WorkflowServiceMock{
			ValidateFlowFunc:          eng.ValidateFlow,
			EvaluateTriggerFilterFunc: eng.EvaluateTriggerFilter,
			MapTriggerInputFunc:       eng.MapTriggerInput,
			ExecuteFunc: func(ctx context.Context, opts workflow.ExecuteOptions) (*workflow.FlowRun, error) {
				if opts.Persist {
					persistCalls.Add(1)
				}
				return eng.Execute(ctx, opts)
			},
		}

		coord := NewCoordinator(Dependencies{
			Workflow:    ws,
			SpaceLoader: defaultSpaceLoader(),
		})

		run, err := coord.TestFlow(ctx, &TestFlowRequest{
			Flow: &workflow.Flow{
				Name: "Unsaved Test",
				Triggers: []workflow.Trigger{
					{
						Name:      "Event",
						Type:      workflow.TriggerEvent,
						IsEnabled: true,
						Config: workflow.TriggerConfig{
							Topic:        new("mail.message.received"),
							InputMapping: map[string]any{"msg": "{{ trigger.data.subject }}"},
						},
					},
				},
				Steps: []workflow.StepNode{
					workflow.OutputStep(workflow.OutputStepConfig{
						ID:    "out",
						Value: map[string]any{"echo": "{{ input.msg }}"},
					}),
				},
			},
			TriggerData: map[string]any{"subject": "Hello"},
		})
		if err != nil {
			t.Fatalf("TestFlow error = %v", err)
		}
		if persistCalls.Load() != 0 || run.Status != workflow.RunCompleted || run.Output["echo"] != "Hello" {
			t.Errorf("unexpected TestFlow run=%+v persistCalls=%d", run, persistCalls.Load())
		}
	})

	t.Run("DispatchEventTrigger_ExecuteFlowRun_And_InvokeScheduleTrigger", func(t *testing.T) {
		eng := newTestEngine(t, nil)
		ws := &WorkflowServiceMock{
			GetFlowFunc: func(_ context.Context, _, _ string) (*workflow.Flow, error) {
				return &workflow.Flow{
					ID:        "flw_1",
					SpaceID:   "spc_1",
					IsEnabled: true,
					Name:      "Scheduled Flow",
					Triggers: []workflow.Trigger{
						{ID: "trg_1", FlowID: "flw_1", SpaceID: "spc_1", Name: "Cron", Type: workflow.TriggerSchedule, IsEnabled: true, Config: workflow.TriggerConfig{Cron: new("0 9 * * *")}},
					},
					Steps: []workflow.StepNode{
						workflow.OutputStep(workflow.OutputStepConfig{ID: "out", Value: map[string]any{"ok": true}}),
					},
				}, nil
			},
			EvaluateTriggerFilterFunc: eng.EvaluateTriggerFilter,
			MapTriggerInputFunc:       eng.MapTriggerInput,
			CreateOrResumeRunFunc: func(_ context.Context, run *workflow.FlowRun) (*workflow.FlowRun, bool, error) {
				run.ID = "wfr_ev"
				return run, true, nil
			},
			GetFlowRunFunc: func(_ context.Context, _, id string) (*workflow.FlowRun, error) {
				return &workflow.FlowRun{
					ID:        id,
					SpaceID:   "spc_1",
					FlowID:    "flw_1",
					TriggerID: new("trg_1"),
					Status:    workflow.RunPending,
					Input:     map[string]any{"x": 1},
				}, nil
			},
			ExecuteFunc: func(ctx context.Context, opts workflow.ExecuteOptions) (*workflow.FlowRun, error) {
				opts.Persist = false
				return eng.Execute(ctx, opts)
			},
		}
		dispatcher := &RunDispatcherMock{
			DispatchFunc: func(_ context.Context, _, _ string) error { return nil },
		}

		coord := NewCoordinator(Dependencies{
			Workflow:    ws,
			SpaceLoader: defaultSpaceLoader(),
			Dispatcher:  dispatcher,
		})

		run, dispatched, err := coord.DispatchEventTrigger(context.Background(), &DispatchEventTriggerRequest{
			SpaceID:        "spc_1",
			Trigger:        &workflow.Trigger{ID: "trg_1", FlowID: "flw_1", Name: "Ev", Type: workflow.TriggerEvent, IsEnabled: true, Config: workflow.TriggerConfig{Topic: new("finance.transaction.created")}},
			TriggerData:    map[string]any{"amount": 10},
			IdempotencyKey: "ev:1",
		})
		if err != nil || !dispatched || run.ID != "wfr_ev" {
			t.Fatalf("DispatchEventTrigger = (%+v, %v, %v)", run, dispatched, err)
		}

		execRun, err := coord.ExecuteFlowRun(context.Background(), "spc_1", "wfr_ev")
		if err != nil || execRun.Status != workflow.RunCompleted {
			t.Fatalf("ExecuteFlowRun = (%+v, %v)", execRun, err)
		}

		schedRun, err := coord.InvokeScheduleTrigger(context.Background(), "spc_1", "flw_1", "trg_1")
		if err != nil || schedRun.Status != workflow.RunCompleted || schedRun.Output["ok"] != true {
			t.Fatalf("InvokeScheduleTrigger = (%+v, %v)", schedRun, err)
		}
	})
}

func TestCoordinator_GenerateFlow(t *testing.T) {
	if len(generatedFlowOutputSchema) == 0 {
		t.Fatal("expected generatedFlowOutputSchema to be non-empty")
	}

	t.Run("AutoRepairsInvalidDraftAndValidates", func(t *testing.T) {
		ctx := testSpaceCtx("spc_1", string(space.RoleOwner))
		eng := newTestEngine(t, nil)
		attempts := 0

		ws := &WorkflowServiceMock{
			CatalogFunc:      func(ctx context.Context) workflow.Catalog { return eng.Registry().Catalog() },
			ValidateFlowFunc: eng.ValidateFlow,
		}
		promptExec := &AIRunnerMock{
			GenerateFunc: func(_ context.Context, req ai.GenerateRequest) (*ai.Run, error) {
				attempts++
				if req.SystemInstruction == nil || !strings.Contains(*req.SystemInstruction, "Catalog:") {
					t.Errorf("expected Catalog in system prompt")
				}
				if attempts == 1 {
					bad, _ := json.Marshal(generatedFlowDraft{
						Name:        "Draft",
						Description: "Test",
						Steps: []workflow.StepNode{
							{ID: "s1", Type: workflow.StepTransform, Inputs: map[string]any{"x": "{{ steps.missing.val }}"}},
						},
					})
					return &ai.Run{Output: &ai.RunOutput{Text: new(string(bad))}}, nil
				}
				good, _ := json.Marshal(generatedFlowDraft{
					Name:        "Weekly Digest",
					Description: "Summarizes weekly finances",
					Triggers: []workflow.Trigger{
						{Name: "Weekly", Type: workflow.TriggerSchedule, IsEnabled: true, Config: workflow.TriggerConfig{Cron: new("0 9 * * 1")}},
					},
					Steps: []workflow.StepNode{
						workflow.OutputStep(workflow.OutputStepConfig{ID: "out", Value: map[string]any{"space": "{{ space.name }}"}}),
					},
				})
				return &ai.Run{Output: &ai.RunOutput{Text: new(string(good))}}, nil
			},
		}

		coord := NewCoordinator(Dependencies{
			Workflow: ws,
			AIRunner: promptExec,
		})

		flow, err := coord.GenerateFlow(ctx, &GenerateFlowRequest{
			Prompt: "Send me a weekly digest every Monday at 9am",
		})
		if err != nil {
			t.Fatalf("GenerateFlow error = %v", err)
		}
		if attempts != 2 || flow.Name != "Weekly Digest" || len(flow.Steps) != 1 {
			t.Errorf("unexpected GenerateFlow result: attempts=%d flow=%+v", attempts, flow)
		}
	})

	t.Run("LocalizesCatalogAndLanguageRule", func(t *testing.T) {
		tests := []struct {
			name         string
			language     string
			wantStepName string
			wantRule     string
		}{
			{name: "english default", language: "", wantStepName: "Filter", wantRule: "Write the flow name and description in English."},
			{name: "spanish language", language: "es", wantStepName: "Filtrar", wantRule: "Write the flow name and description in Spanish."},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				ctx := testSpaceCtx("spc_1", string(space.RoleOwner))
				if tc.language != "" {
					ctx = platformi18n.With(ctx, tc.language)
				}
				eng := newTestEngine(t, nil)
				svc := workflow.NewService(workflow.ServiceDependencies{Engine: eng})

				var systemPrompt string
				coord := NewCoordinator(Dependencies{
					Workflow: svc,
					AIRunner: &AIRunnerMock{
						GenerateFunc: func(_ context.Context, req ai.GenerateRequest) (*ai.Run, error) {
							if req.SystemInstruction != nil {
								systemPrompt = *req.SystemInstruction
							}
							good, _ := json.Marshal(generatedFlowDraft{
								Name:  "Draft",
								Steps: []workflow.StepNode{workflow.OutputStep(workflow.OutputStepConfig{ID: "out", Value: map[string]any{"ok": true}})},
							})
							return &ai.Run{Output: &ai.RunOutput{Text: new(string(good))}}, nil
						},
					},
				})

				if _, err := coord.GenerateFlow(ctx, &GenerateFlowRequest{Prompt: "make a flow"}); err != nil {
					t.Fatalf("GenerateFlow error = %v", err)
				}
				if !strings.Contains(systemPrompt, tc.wantStepName) {
					t.Errorf("system prompt missing localized step name %q", tc.wantStepName)
				}
				if !strings.Contains(systemPrompt, tc.wantRule) {
					t.Errorf("system prompt missing language rule %q", tc.wantRule)
				}
			})
		}
	})

	t.Run("ErrorCases", func(t *testing.T) {
		eng := newTestEngine(t, nil)
		coord := NewCoordinator(Dependencies{
			Workflow: &WorkflowServiceMock{
				CatalogFunc:      func(ctx context.Context) workflow.Catalog { return eng.Registry().Catalog() },
				ValidateFlowFunc: eng.ValidateFlow,
			},
			AIRunner: &AIRunnerMock{
				GenerateFunc: func(_ context.Context, _ ai.GenerateRequest) (*ai.Run, error) {
					return &ai.Run{Output: &ai.RunOutput{Text: new(`{"name":"Bad","steps":[{"id":"bad-id","type":"transform"}]}`)}}, nil
				},
			},
		})

		if _, err := coord.GenerateFlow(context.Background(), &GenerateFlowRequest{Prompt: "hi"}); !errors.Is(err, errors.Unauthenticated) {
			t.Errorf("expected Unauthenticated, got %v", err)
		}
		if _, err := coord.GenerateFlow(testSpaceCtx("spc_1", string(space.RoleViewer)), &GenerateFlowRequest{Prompt: "hi"}); !errors.Is(err, errors.Permission) {
			t.Errorf("expected Permission, got %v", err)
		}
		if _, err := coord.GenerateFlow(testSpaceCtx("spc_1", string(space.RoleOwner)), &GenerateFlowRequest{Prompt: "  "}); !errors.Is(err, errors.Invalid) {
			t.Errorf("expected Invalid for empty prompt, got %v", err)
		}
		if _, err := coord.GenerateFlow(testSpaceCtx("spc_1", string(space.RoleOwner)), &GenerateFlowRequest{Prompt: "make flow"}); !errors.Is(err, errors.Code("WORKFLOW_VALIDATION_FAILED")) {
			t.Errorf("expected WORKFLOW_VALIDATION_FAILED after retries, got %v", err)
		}
	})
}

func TestCoordinator_InvokeScheduleTrigger_SetsSpaceID(t *testing.T) {
	var capturedSpaceID string
	ws := &WorkflowServiceMock{
		GetFlowFunc: func(_ context.Context, spaceID, id string) (*workflow.Flow, error) {
			return &workflow.Flow{
				ID:        id,
				SpaceID:   spaceID,
				IsEnabled: true,
				Triggers: []workflow.Trigger{
					{ID: "trg_1", Type: workflow.TriggerSchedule, IsEnabled: true},
				},
			}, nil
		},
		MapTriggerInputFunc: func(_ *workflow.Trigger, _ workflow.SpaceContext, data map[string]any) (map[string]any, error) {
			return data, nil
		},
		ExecuteFunc: func(ctx context.Context, opts workflow.ExecuteOptions) (*workflow.FlowRun, error) {
			capturedSpaceID, _ = auth.SpaceIDFromContext(ctx)
			return &workflow.FlowRun{ID: "wfr_1", SpaceID: opts.Space.ID, Status: workflow.RunCompleted}, nil
		},
	}

	coord := NewCoordinator(Dependencies{
		Workflow:    ws,
		SpaceLoader: defaultSpaceLoader(),
	})

	run, err := coord.InvokeScheduleTrigger(context.Background(), "spc_sched", "flw_1", "trg_1")
	if err != nil {
		t.Fatalf("InvokeScheduleTrigger error = %v", err)
	}
	if run == nil || capturedSpaceID != "spc_sched" {
		t.Fatalf("expected space_id spc_sched in Execute context, got %q", capturedSpaceID)
	}
}
