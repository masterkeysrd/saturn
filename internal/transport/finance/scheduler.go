package finance

import (
	"context"

	financev1 "github.com/masterkeysrd/saturn/apis/saturn/finance/v1"
	"github.com/masterkeysrd/saturn/internal/platform/scheduler"
)

// HandleGenerateScheduledPayments processes the system-wide generation of scheduled payments.
func (h *Handler) HandleGenerateScheduledPayments(ctx context.Context, payload *financev1.GenerateScheduledPaymentsPayload) error {
	// Placeholders for underlying domain actions
	return nil
}

// RegisterSchedules seeds the cron triggers/templates into the platform database.
func (h *Handler) RegisterSchedules(ctx context.Context, engine *scheduler.Engine) error {
	return engine.RegisterSchedule(ctx, scheduler.Schedule{
		ID:             "generate_scheduled_payments",
		JobType:        "finance.GenerateScheduledPayments",
		CronExpression: "0 0 0 * * *",
		Payload:        struct{}{},
	})
}
