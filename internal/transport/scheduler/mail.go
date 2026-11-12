package scheduler

import (
	"context"
	"time"

	appmail "github.com/masterkeysrd/saturn/internal/application/mail"
	"github.com/masterkeysrd/saturn/internal/platform/scheduler"
)

// SyncMailJobPayload models the payload for the connector.sync_mail job.
type SyncMailJobPayload struct {
	SpaceID   string `json:"space_id"`
	AccountID string `json:"account_id"`
}

// RegisterMailJobs binds mail background jobs to the scheduler engine.
func RegisterMailJobs(engine *scheduler.Engine, coord appmail.Coordinator) {
	engine.RegisterJSON("connector.sync_mail", func(ctx context.Context, payload *SyncMailJobPayload) error {
		return coord.SyncConnectedAccountMail(ctx, &appmail.SyncConnectedAccountMailRequest{
			SpaceID:            payload.SpaceID,
			ConnectedAccountID: payload.AccountID,
		})
	})

	engine.RegisterJSON("mail.prune_window_and_bodies", func(ctx context.Context, _ *struct{}) error {
		return coord.PruneWindowAndBodies(ctx, &appmail.PruneWindowAndBodiesRequest{
			Now: time.Now().UTC(),
		})
	})
}

// RegisterMailSchedules seeds cron schedules for periodic mail cache pruning.
func RegisterMailSchedules(ctx context.Context, engine *scheduler.Engine) error {
	return engine.RegisterSchedule(ctx, scheduler.Schedule{
		ID:             "mail_prune_window_and_bodies",
		JobType:        "mail.prune_window_and_bodies",
		CronExpression: "0 0 3 * * *",
		Payload:        struct{}{},
	})
}
