package scheduler

import (
	"context"

	appcalendar "github.com/masterkeysrd/saturn/internal/application/calendar"
	"github.com/masterkeysrd/saturn/internal/platform/scheduler"
)

// SyncCalendarJobPayload models the payload for the connector.sync_calendar job.
type SyncCalendarJobPayload struct {
	SpaceID   string `json:"space_id"`
	AccountID string `json:"account_id"`
}

// RegisterCalendarJobs binds calendar background jobs to the scheduler engine.
func RegisterCalendarJobs(engine *scheduler.Engine, coord appcalendar.Coordinator) {
	engine.RegisterJSON("connector.sync_calendar", func(ctx context.Context, payload *SyncCalendarJobPayload) error {
		if payload == nil {
			return nil
		}
		return coord.SyncConnectedAccountCalendars(ctx, &appcalendar.SyncConnectedAccountCalendarsRequest{
			SpaceID:            payload.SpaceID,
			ConnectedAccountID: payload.AccountID,
		})
	})
}
