package scheduler

import (
	"context"

	connectorv1 "github.com/masterkeysrd/saturn/apis/saturn/platform/connector/v1"
	connectorapp "github.com/masterkeysrd/saturn/internal/application/connector"
	"github.com/masterkeysrd/saturn/internal/platform/scheduler"
)

// RegisterConnectorJobs binds connector background jobs to the scheduler engine.
func RegisterConnectorJobs(engine *scheduler.Engine, coord connectorapp.Coordinator) {
	connectorv1.RegisterSyncContactsPayload(engine, func(ctx context.Context, payload *connectorv1.SyncContactsPayload) error {
		return coord.SyncContacts(ctx, &connectorapp.SyncContactsRequest{
			SpaceID:   payload.GetSpaceId(),
			AccountID: payload.GetAccountId(),
		})
	})
}
