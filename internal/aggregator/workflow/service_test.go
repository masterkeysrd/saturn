package workflowaggregator

import (
	"context"
	"testing"
	"time"

	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	"github.com/masterkeysrd/saturn/internal/platform/agent"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/paging"
	"github.com/masterkeysrd/saturn/internal/platform/workflow"
)

func testAuthCtx(spaceID string) context.Context {
	return auth.WithSpaceScope(context.Background(), spaceID, "owner")
}

func TestService_Flows(t *testing.T) {
	fixedNow := time.Date(2026, 5, 1, 12, 0, 0, 0, time.UTC)

	t.Run("ListFlows", func(t *testing.T) {
		tests := []struct {
			name      string
			ctx       context.Context
			setup     func(*WorkflowReaderMock)
			wantCount int
			wantErr   error
		}{
			{
				name: "HydratesTriggersAndStatsInParallel",
				ctx:  testAuthCtx("spc_1"),
				setup: func(wr *WorkflowReaderMock) {
					wr.ListFlowsFunc = func(_ context.Context, filter workflow.ListFlowsFilter) ([]*workflow.Flow, error) {
						if filter.SpaceID != "spc_1" {
							t.Errorf("unexpected SpaceID %q", filter.SpaceID)
						}
						return []*workflow.Flow{
							{ID: "flw_1", SpaceID: "spc_1", Name: "Flow 1"},
							{ID: "flw_2", SpaceID: "spc_1", Name: "Flow 2"},
						}, nil
					}
					wr.ListTriggersByFlowIDsFunc = func(_ context.Context, _ string, flowIDs []string) (map[string][]workflow.Trigger, error) {
						if len(flowIDs) != 2 {
							t.Errorf("expected 2 flowIDs, got %v", flowIDs)
						}
						return map[string][]workflow.Trigger{
							"flw_1": {{ID: "trg_1", FlowID: "flw_1", Name: "Webhook", Type: workflow.TriggerWebhook}},
						}, nil
					}
					wr.GetStats7dFunc = func(_ context.Context, _ string, _ []string, now time.Time) (map[string]workflow.FlowStats, error) {
						if !now.Equal(fixedNow) {
							t.Errorf("unexpected now %v", now)
						}
						return map[string]workflow.FlowStats{
							"flw_1": {TotalRuns7d: 5, CompletedRuns7d: 4, FailedRuns7d: 1},
						}, nil
					}
				},
				wantCount: 2,
			},
			{
				name: "EmptyFlowsSkipsHydrationQueries",
				ctx:  testAuthCtx("spc_1"),
				setup: func(wr *WorkflowReaderMock) {
					wr.ListFlowsFunc = func(_ context.Context, _ workflow.ListFlowsFilter) ([]*workflow.Flow, error) {
						return nil, nil
					}
				},
				wantCount: 0,
			},
			{
				name:    "Unauthenticated",
				ctx:     context.Background(),
				wantErr: errors.E(errors.Unauthenticated),
			},
			{
				name: "TriggerHydrationErrorPropagates",
				ctx:  testAuthCtx("spc_1"),
				setup: func(wr *WorkflowReaderMock) {
					wr.ListFlowsFunc = func(_ context.Context, _ workflow.ListFlowsFilter) ([]*workflow.Flow, error) {
						return []*workflow.Flow{{ID: "flw_1"}}, nil
					}
					wr.ListTriggersByFlowIDsFunc = func(_ context.Context, _ string, _ []string) (map[string][]workflow.Trigger, error) {
						return nil, errors.New("trigger query failed")
					}
					wr.GetStats7dFunc = func(_ context.Context, _ string, _ []string, _ time.Time) (map[string]workflow.FlowStats, error) {
						return nil, nil
					}
				},
				wantErr: errors.New("trigger query failed"),
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				wr := &WorkflowReaderMock{}
				if tc.setup != nil {
					tc.setup(wr)
				}
				svc := NewService(Dependencies{
					Workflow: wr,
					NowFunc:  func() time.Time { return fixedNow },
				})

				flows, err := svc.ListFlows(tc.ctx, workflow.ListFlowsFilter{})
				if tc.wantErr != nil {
					if err == nil {
						t.Fatalf("expected error %v, got nil", tc.wantErr)
					}
					return
				}
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				if len(flows) != tc.wantCount {
					t.Fatalf("got %d flows, want %d", len(flows), tc.wantCount)
				}
				if tc.wantCount > 0 {
					if len(flows[0].Triggers) != 1 || flows[0].Stats == nil || flows[0].Stats.TotalRuns7d != 5 {
						t.Errorf("expected hydrated triggers and stats on flow[0]: %+v", flows[0])
					}
					if flows[1].Triggers == nil {
						t.Errorf("expected non-nil empty triggers slice on flow[1]")
					}
				}
			})
		}
	})

	t.Run("GetFlow", func(t *testing.T) {
		svc := NewService(Dependencies{
			Workflow: &WorkflowReaderMock{
				GetFlowFunc: func(_ context.Context, spaceID, _ string) (*workflow.Flow, error) {
					return &workflow.Flow{ID: "flw_1", SpaceID: spaceID, Name: "Inbox Flow"}, nil
				},
				GetStats7dFunc: func(_ context.Context, _ string, _ []string, _ time.Time) (map[string]workflow.FlowStats, error) {
					return map[string]workflow.FlowStats{"flw_1": {TotalRuns7d: 12}}, nil
				},
			},
			NowFunc: func() time.Time { return fixedNow },
		})

		if _, err := svc.GetFlow(context.Background(), "flw_1"); !errors.Is(err, errors.Unauthenticated) {
			t.Fatalf("expected Unauthenticated, got %v", err)
		}
		if _, err := svc.GetFlow(testAuthCtx("spc_1"), " "); !errors.Is(err, errors.Invalid) {
			t.Fatalf("expected Invalid, got %v", err)
		}
		f, err := svc.GetFlow(testAuthCtx("spc_1"), "system.finance.inbox_ingestion")
		if err != nil || f.Stats == nil || f.Stats.TotalRuns7d != 12 {
			t.Fatalf("unexpected GetFlow result: %+v, err=%v", f, err)
		}
	})
}

func TestService_FlowRunsAndCatalog(t *testing.T) {
	t.Run("ListFlowRuns", func(t *testing.T) {
		svc := NewService(Dependencies{
			Workflow: &WorkflowReaderMock{
				ListFlowsFunc: func(_ context.Context, _ workflow.ListFlowsFilter) ([]*workflow.Flow, error) {
					return []*workflow.Flow{{ID: "flw_1", Name: "Finance Ingestion"}}, nil
				},
				ListFlowRunsFunc: func(_ context.Context, _ workflow.ListFlowRunsFilter) (*paging.Page[*workflow.FlowRun], error) {
					return &paging.Page[*workflow.FlowRun]{
						Items: []*workflow.FlowRun{
							{ID: "wfr_1", FlowID: "flw_1", Status: workflow.RunCompleted},
						},
						NextPageToken: "next_tok",
					}, nil
				},
			},
		})

		if _, err := svc.ListFlowRuns(context.Background(), workflow.ListFlowRunsFilter{}); !errors.Is(err, errors.Unauthenticated) {
			t.Fatalf("expected Unauthenticated, got %v", err)
		}

		res, err := svc.ListFlowRuns(testAuthCtx("spc_1"), workflow.ListFlowRunsFilter{})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(res.Runs) != 1 || res.NextPageToken != "next_tok" || *res.Runs[0].FlowName != "Finance Ingestion" {
			t.Errorf("unexpected ListFlowRuns result: %+v", res)
		}
	})

	t.Run("GetFlowRun_HydratesStepRunsAndAgentRunMetrics", func(t *testing.T) {
		svc := NewService(Dependencies{
			Workflow: &WorkflowReaderMock{
				GetFlowFunc: func(_ context.Context, _, _ string) (*workflow.Flow, error) {
					return &workflow.Flow{ID: "flw_1", Name: "Inbox Ingestion"}, nil
				},
				GetFlowRunFunc: func(_ context.Context, _, id string) (*workflow.FlowRun, error) {
					return &workflow.FlowRun{ID: id, SpaceID: "spc_1", FlowID: "flw_1", Status: workflow.RunCompleted}, nil
				},
				ListStepRunsFunc: func(_ context.Context, _, _ string) ([]workflow.StepRun, error) {
					return []workflow.StepRun{
						{ID: "wsr_1", StepID: "classify", StepType: workflow.StepLLMGenerate, AgentRunID: new("run_ai_1")},
					}, nil
				},
			},
			AgentRuns: &AgentRunReaderMock{
				GetRunsByIDsFunc: func(_ context.Context, _ string, ids []string) ([]*agent.AgentRun, error) {
					if len(ids) != 1 || ids[0] != "run_ai_1" {
						t.Errorf("unexpected agent run ids: %v", ids)
					}
					return []*agent.AgentRun{
						{ID: "run_ai_1", Status: agent.RunSuccess, TokensUsed: 420},
					}, nil
				},
			},
		})

		if _, err := svc.GetFlowRun(context.Background(), "wfr_1"); !errors.Is(err, errors.Unauthenticated) {
			t.Fatalf("expected Unauthenticated, got %v", err)
		}
		if _, err := svc.GetFlowRun(testAuthCtx("spc_1"), ""); !errors.Is(err, errors.Invalid) {
			t.Fatalf("expected Invalid, got %v", err)
		}

		view, err := svc.GetFlowRun(testAuthCtx("spc_1"), "wfr_1")
		if err != nil {
			t.Fatalf("GetFlowRun error = %v", err)
		}
		if *view.FlowName != "Inbox Ingestion" || len(view.StepRuns) != 1 {
			t.Fatalf("unexpected GetFlowRun view: %+v", view)
		}
		if view.StepRuns[0].Metadata["agent_run_tokens_used"] != 420 || view.AgentRuns["run_ai_1"].TokensUsed != 420 {
			t.Errorf("expected agent_run token metrics hydrated, got %+v", view.StepRuns[0].Metadata)
		}
	})

	t.Run("GetCatalog", func(t *testing.T) {
		reg := workflow.NewRegistry()
		svc := NewService(Dependencies{
			Workflow: &WorkflowReaderMock{
				CatalogFunc: reg.Catalog,
			},
		})
		cat := svc.GetCatalog()
		if len(cat.Steps) == 0 || len(cat.CelHelpers) == 0 {
			t.Errorf("expected built-in steps and CEL helpers in catalog, got %+v", cat)
		}
	})
}
