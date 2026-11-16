package scheduler

import (
	"context"

	"github.com/masterkeysrd/saturn/internal/platform/scheduler"
)

const (
	// JobTypeAIPurgeExpiredRuns is the scheduler job type for daily AI run retention cleanup.
	JobTypeAIPurgeExpiredRuns = "ai.PurgeExpiredRuns"

	// ScheduleIDPurgeExpiredRuns is the recurring schedule ID for AI run retention cleanup.
	ScheduleIDPurgeExpiredRuns = "ai_purge_expired_runs"
)

// AIRetentionCoordinator outlines the scheduler dependency for purging expired AI runs.
type AIRetentionCoordinator interface {
	PurgeExpiredRuns(ctx context.Context) error
}

// RegisterAIJobs binds AI background maintenance jobs to the scheduler engine.
func RegisterAIJobs(engine *scheduler.Engine, coord AIRetentionCoordinator) {
	engine.RegisterJSON(JobTypeAIPurgeExpiredRuns, func(ctx context.Context, _ *struct{}) error {
		return coord.PurgeExpiredRuns(ctx)
	})
}

// RegisterAISchedules seeds recurring AI cron triggers into the scheduler engine.
func RegisterAISchedules(ctx context.Context, engine *scheduler.Engine) error {
	return engine.RegisterSchedule(ctx, scheduler.Schedule{
		ID:             ScheduleIDPurgeExpiredRuns,
		JobType:        JobTypeAIPurgeExpiredRuns,
		CronExpression: "0 0 3 * * *", // Run daily at 03:00 AM UTC
		Payload:        struct{}{},
	})
}
