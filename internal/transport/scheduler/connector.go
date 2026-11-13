package scheduler

import (
	"context"
	"time"

	connectorv1 "github.com/masterkeysrd/saturn/apis/saturn/platform/connector/v1"
	connectorapp "github.com/masterkeysrd/saturn/internal/application/connector"
	"github.com/masterkeysrd/saturn/internal/platform/connector"
	"github.com/masterkeysrd/saturn/internal/platform/scheduler"
)

// RegisterConnectorJobs binds connector background jobs to the scheduler engine.
func RegisterConnectorJobs(engine *scheduler.Engine, coord connectorapp.Coordinator, store connector.Store) {
	connectorv1.RegisterSyncContactsPayload(engine, func(ctx context.Context, payload *connectorv1.SyncContactsPayload) error {
		return coord.SyncContacts(ctx, &connectorapp.SyncContactsRequest{
			SpaceID:   payload.GetSpaceId(),
			AccountID: payload.GetAccountId(),
		})
	})

	engine.RegisterJSON("connector.periodic_sync", func(ctx context.Context, _ *struct{}) error {
		accounts, err := store.ListActiveAccounts(ctx)
		if err != nil {
			return err
		}

		now := time.Now().UTC()
		for _, acc := range accounts {
			if acc.HasCapability(connector.CapabilityCalendar) {
				_ = engine.Enqueue(ctx, scheduler.Job{
					JobType: "connector.sync_calendar",
					RunAt:   now,
					Payload: map[string]string{
						"space_id":   acc.SpaceID,
						"account_id": acc.ID,
					},
					MaxAttempts: 1,
				})
			}
			if acc.HasCapability(connector.CapabilityMail) {
				_ = engine.Enqueue(ctx, scheduler.Job{
					JobType: "connector.sync_mail",
					RunAt:   now,
					Payload: map[string]string{
						"space_id":   acc.SpaceID,
						"account_id": acc.ID,
					},
					MaxAttempts: 1,
				})
			}
		}
		return nil
	})
}

// RegisterConnectorSchedules registers the 3-minute cron schedule for connector.periodic_sync.
func RegisterConnectorSchedules(ctx context.Context, engine *scheduler.Engine) error {
	return engine.RegisterSchedule(ctx, scheduler.Schedule{
		ID:             "connector_periodic_sync",
		JobType:        "connector.periodic_sync",
		CronExpression: "0 */3 * * * *",
		Payload:        struct{}{},
	})
}
