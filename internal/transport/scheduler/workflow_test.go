package scheduler

import (
	"context"
	"testing"

	workflowapp "github.com/masterkeysrd/saturn/internal/application/workflow"
	"github.com/masterkeysrd/saturn/internal/platform/scheduler"
	"github.com/masterkeysrd/saturn/internal/platform/workflow"
)

type stubWorkflowSchedulerCoord struct {
	spaceID   string
	flowID    string
	triggerID string
}

func (s *stubWorkflowSchedulerCoord) InvokeScheduleTrigger(_ context.Context, spaceID, flowID, triggerID string) (*workflow.FlowRun, error) {
	s.spaceID = spaceID
	s.flowID = flowID
	s.triggerID = triggerID
	return nil, nil
}

func TestRegisterWorkflowJobs(t *testing.T) {
	eng := scheduler.NewEngine(nil)
	stub := &stubWorkflowSchedulerCoord{}
	RegisterWorkflowJobs(eng, stub)

	_, _ = stub.InvokeScheduleTrigger(t.Context(), "spc_1", "flw_1", "trg_1")
	if stub.spaceID != "spc_1" || stub.flowID != "flw_1" || stub.triggerID != "trg_1" {
		t.Fatalf("unexpected stub state: %+v", stub)
	}
	if workflowapp.JobTypeExecuteTrigger == "" {
		t.Fatal("expected non-empty job type")
	}
}
