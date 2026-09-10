package scheduler

import (
	"context"

	financev1 "github.com/masterkeysrd/saturn/apis/saturn/finance/v1"
	"github.com/masterkeysrd/saturn/internal/platform/scheduler"
)

// FinanceCoordinator outlines the scheduler dependencies on the finance application layer.
type FinanceCoordinator interface {
	GenerateScheduledTransactions(ctx context.Context) error
}

// RegisterFinanceJobs binds finance background jobs to the scheduler engine.
func RegisterFinanceJobs(engine *scheduler.Engine, coord FinanceCoordinator) {
	financev1.RegisterGenerateScheduledTransactionsPayload(engine, func(ctx context.Context, payload *financev1.GenerateScheduledTransactionsPayload) error {
		return coord.GenerateScheduledTransactions(ctx)
	})
}

// RegisterFinanceSchedules seeds recurring finance cron triggers into the scheduler engine.
func RegisterFinanceSchedules(ctx context.Context, engine *scheduler.Engine) error {
	return engine.RegisterSchedule(ctx, scheduler.Schedule{
		ID:             "generate_scheduled_transactions",
		JobType:        "finance.GenerateScheduledTransactions",
		CronExpression: "0 0 0 * * *",
		Payload:        struct{}{},
	})
}
