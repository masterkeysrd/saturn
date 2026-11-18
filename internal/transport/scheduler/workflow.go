package scheduler

import (
	"context"

	workflowapp "github.com/masterkeysrd/saturn/internal/application/workflow"
	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	"github.com/masterkeysrd/saturn/internal/platform/scheduler"
	"github.com/masterkeysrd/saturn/internal/platform/workflow"
)

// ScheduleTriggerInvoker executes cron-scheduled workflow triggers.
type ScheduleTriggerInvoker interface {
	InvokeScheduleTrigger(ctx context.Context, spaceID string, flowID string, triggerID string) (*workflow.FlowRun, error)
}

// RegisterWorkflowJobs binds cron-triggered workflow execution onto engine.
func RegisterWorkflowJobs(engine *scheduler.Engine, invoker ScheduleTriggerInvoker) {
	engine.RegisterJSON(workflowapp.JobTypeExecuteTrigger, func(ctx context.Context, payload *workflowapp.ScheduleTriggerPayload) error {
		if payload.SpaceID != "" {
			ctx = auth.WithSpaceID(ctx, payload.SpaceID)
		}
		_, err := invoker.InvokeScheduleTrigger(ctx, payload.SpaceID, payload.FlowID, payload.TriggerID)
		return err
	})
}
