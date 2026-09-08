package finance

import (
	"context"

	financev1 "github.com/masterkeysrd/saturn/apis/saturn/finance/v1"
	"github.com/masterkeysrd/saturn/internal/platform/scheduler"
)

// HandleGenerateScheduledTransactions processes the system-wide generation of scheduled transactions.
func (h *Handler) HandleGenerateScheduledTransactions(ctx context.Context, payload *financev1.GenerateScheduledTransactionsPayload) error {
	return h.Coordinator.GenerateScheduledTransactions(ctx)
}

// RegisterSchedules seeds the cron triggers/templates into the platform database.
func (h *Handler) RegisterSchedules(ctx context.Context, engine *scheduler.Engine) error {
	return engine.RegisterSchedule(ctx, scheduler.Schedule{
		ID:             "generate_scheduled_transactions",
		JobType:        "finance.GenerateScheduledTransactions",
		CronExpression: "0 0 0 * * *",
		Payload:        struct{}{},
	})
}
