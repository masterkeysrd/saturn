package scheduler

import (
	"context"
	"encoding/json/v2"
	"testing"

	workflowapp "github.com/masterkeysrd/saturn/internal/application/workflow"
	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	"github.com/masterkeysrd/saturn/internal/platform/scheduler"
	"github.com/masterkeysrd/saturn/internal/platform/workflow"
)

type stubWorkflowSchedulerCoord struct {
	spaceID    string
	flowID     string
	triggerID  string
	ctxSpaceID string
}

func (s *stubWorkflowSchedulerCoord) InvokeScheduleTrigger(ctx context.Context, spaceID, flowID, triggerID string) (*workflow.FlowRun, error) {
	s.spaceID = spaceID
	s.flowID = flowID
	s.triggerID = triggerID
	s.ctxSpaceID, _ = auth.SpaceIDFromContext(ctx)
	return nil, nil
}

func TestRegisterWorkflowJobs(t *testing.T) {
	eng := scheduler.NewEngine(nil)
	stub := &stubWorkflowSchedulerCoord{}
	RegisterWorkflowJobs(eng, stub)

	payload, _ := json.Marshal(workflowapp.ScheduleTriggerPayload{
		SpaceID:   "spc_1",
		FlowID:    "flw_1",
		TriggerID: "trg_1",
	})
	handler, ok := eng.GetHandler(workflowapp.JobTypeExecuteTrigger)
	if !ok {
		t.Fatalf("expected handler registered for %q", workflowapp.JobTypeExecuteTrigger)
	}
	if err := handler(t.Context(), payload); err != nil {
		t.Fatalf("handler failed: %v", err)
	}
	if stub.spaceID != "spc_1" || stub.flowID != "flw_1" || stub.triggerID != "trg_1" {
		t.Fatalf("unexpected stub state: %+v", stub)
	}
	if stub.ctxSpaceID != "spc_1" {
		t.Fatalf("expected ctx SpaceID spc_1, got %q", stub.ctxSpaceID)
	}
	if workflowapp.JobTypeExecuteTrigger == "" {
		t.Fatal("expected non-empty job type")
	}
}
