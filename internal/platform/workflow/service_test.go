package workflow

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

func newTestPlatformService(
	t *testing.T,
	reg *Registry,
	fs FlowStore,
	ts TriggerStore,
	frs FlowRunStore,
	srs StepRunStore,
) *Service {
	t.Helper()
	if reg == nil {
		reg = NewRegistry()
	}
	eng, err := NewEngine(Dependencies{
		Registry: reg,
		FlowRuns: frs,
		StepRuns: srs,
	})
	if err != nil {
		t.Fatalf("NewEngine() error = %v", err)
	}
	return NewService(ServiceDependencies{
		Flows:    fs,
		Triggers: ts,
		FlowRuns: frs,
		StepRuns: srs,
		Engine:   eng,
	})
}

func TestService_FlowLifecycle(t *testing.T) {
	t.Run("CreateFlow_ValidatesAndPreparesScheduleID", func(t *testing.T) {
		fs := &FlowStoreMock{
			CreateFunc: func(_ context.Context, f *Flow) error {
				f.ID = "flw_1"
				return nil
			},
		}
		ts := &TriggerStoreMock{
			ReplaceForFlowFunc: func(_ context.Context, _, _ string, triggers []Trigger) ([]Trigger, error) {
				return triggers, nil
			},
		}
		svc := newTestPlatformService(t, nil, fs, ts, &FlowRunStoreMock{}, &StepRunStoreMock{})

		created, err := svc.CreateFlow(t.Context(), &Flow{
			SpaceID: "spc_1",
			Name:    "Daily Sync",
			Steps:   []StepNode{{ID: "s1", Type: StepTransform}},
			Triggers: []Trigger{
				{Name: "Cron", Type: TriggerSchedule, IsEnabled: true, Config: TriggerConfig{Cron: new("0 8 * * *")}},
			},
		})
		if err != nil {
			t.Fatalf("CreateFlow error = %v", err)
		}
		if created.ID != "flw_1" || created.Triggers[0].Config.ScheduleID == nil || !strings.HasPrefix(*created.Triggers[0].Config.ScheduleID, "wfs_") {
			t.Fatalf("unexpected created flow: %+v", created)
		}

		if _, err := svc.CreateFlow(t.Context(), &Flow{
			SpaceID: "spc_1",
			Name:    "Bad",
			Steps:   []StepNode{{ID: "s1", Type: StepTransform, Inputs: map[string]any{"x": "{{ steps.missing.val }}"}}},
		}); !errors.Is(err, errors.Code("WORKFLOW_VALIDATION_FAILED")) {
			t.Fatalf("expected WORKFLOW_VALIDATION_FAILED, got %v", err)
		}
	})

	t.Run("DeleteFlow_ProtectsSystemFlows", func(t *testing.T) {
		fs := &FlowStoreMock{
			GetFunc: func(_ context.Context, _, id string) (*Flow, error) {
				if id == "flw_sys" {
					return &Flow{ID: "flw_sys", SpaceID: "spc_1", IsSystem: true}, nil
				}
				return &Flow{
					ID:       "flw_usr",
					SpaceID:  "spc_1",
					IsSystem: false,
					Triggers: []Trigger{{ID: "trg_1", Type: TriggerSchedule}},
				}, nil
			},
			DeleteFunc: func(_ context.Context, _, _ string) error { return nil },
		}
		svc := newTestPlatformService(t, nil, fs, &TriggerStoreMock{}, &FlowRunStoreMock{}, &StepRunStoreMock{})

		if _, err := svc.DeleteFlow(t.Context(), "spc_1", "flw_sys"); !errors.Is(err, ErrCannotDeleteSystemFlow) {
			t.Fatalf("expected ErrCannotDeleteSystemFlow, got %v", err)
		}
		trigs, err := svc.DeleteFlow(t.Context(), "spc_1", "flw_usr")
		if err != nil || len(trigs) != 1 {
			t.Fatalf("DeleteFlow = (%+v, %v)", trigs, err)
		}
	})

	t.Run("ResetFlow_RestoresBlueprint", func(t *testing.T) {
		reg := NewRegistry()
		reg.RegisterSystemFlow(SystemFlowBlueprint{
			SystemKey: "system.test.flow",
			Build: func(spaceID string) (*Flow, []Trigger) {
				return &Flow{
					SpaceID:   spaceID,
					SystemKey: new("system.test.flow"),
					IsSystem:  true,
					IsEnabled: true,
					Name:      "Factory",
					Steps:     []StepNode{{ID: "s1", Type: StepTransform}},
				}, []Trigger{{Name: "Manual", Type: TriggerManual, IsEnabled: true}}
			},
		})
		fs := &FlowStoreMock{
			GetFunc: func(_ context.Context, _, id string) (*Flow, error) {
				if id == "flw_user" {
					return &Flow{ID: "flw_user", SpaceID: "spc_1", IsSystem: false}, nil
				}
				return &Flow{
					ID:        "flw_sys",
					SpaceID:   "spc_1",
					SystemKey: new("system.test.flow"),
					IsSystem:  true,
					Name:      "Edited",
					Triggers:  []Trigger{{ID: "trg_old", Name: "Old", Type: TriggerSchedule}},
				}, nil
			},
			UpdateFunc: func(_ context.Context, _ *Flow) error { return nil },
		}
		ts := &TriggerStoreMock{
			ReplaceForFlowFunc: func(_ context.Context, _, _ string, triggers []Trigger) ([]Trigger, error) {
				return triggers, nil
			},
		}
		svc := newTestPlatformService(t, reg, fs, ts, &FlowRunStoreMock{}, &StepRunStoreMock{})

		if _, _, err := svc.ResetFlow(t.Context(), "spc_1", "flw_user"); !errors.Is(err, ErrNotSystemFlow) {
			t.Fatalf("expected ErrNotSystemFlow, got %v", err)
		}
		reset, oldTrigs, err := svc.ResetFlow(t.Context(), "spc_1", "system.test.flow")
		if err != nil || reset.Name != "Factory" || len(oldTrigs) != 1 {
			t.Fatalf("ResetFlow = (%+v, %+v, %v)", reset, oldTrigs, err)
		}
	})

	t.Run("EnsureSystemFlows_And_ResolveFlowOrSeedSystem", func(t *testing.T) {
		reg := NewRegistry()
		reg.RegisterSystemFlow(SystemFlowBlueprint{
			SystemKey: "system.test.seed",
			Build: func(spaceID string) (*Flow, []Trigger) {
				return &Flow{
					SpaceID:   spaceID,
					SystemKey: new("system.test.seed"),
					IsSystem:  true,
					IsEnabled: true,
					Name:      "Seeded",
					Steps:     []StepNode{{ID: "s1", Type: StepTransform}},
				}, nil
			},
		})
		fs := &FlowStoreMock{
			GetFunc: func(_ context.Context, _, _ string) (*Flow, error) {
				return nil, ErrFlowNotFound
			},
			EnsureSystemFlowFunc: func(_ context.Context, flow *Flow, _ []Trigger, _ TriggerStore) (*Flow, error) {
				flow.ID = "flw_seeded"
				return flow, nil
			},
		}
		svc := newTestPlatformService(t, reg, fs, &TriggerStoreMock{}, &FlowRunStoreMock{}, &StepRunStoreMock{})

		ensured, err := svc.EnsureSystemFlows(t.Context(), "spc_1")
		if err != nil || len(ensured) != 1 || ensured[0].ID != "flw_seeded" {
			t.Fatalf("EnsureSystemFlows = (%+v, %v)", ensured, err)
		}
		resolved, err := svc.ResolveFlowOrSeedSystem(t.Context(), "spc_1", "system.test.seed")
		if err != nil || resolved.ID != "flw_seeded" {
			t.Fatalf("ResolveFlowOrSeedSystem = (%+v, %v)", resolved, err)
		}
		_ = time.Now()
	})
}
