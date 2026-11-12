package storage

import (
	"context"
	"database/sql"

	"github.com/masterkeysrd/saturn/internal/domain/mail"
	"github.com/masterkeysrd/saturn/internal/platform/db"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

// SyncStateRecord represents the row schema for mail.sync_states.
type SyncStateRecord struct {
	ConnectedAccountID string         `db:"connected_account_id"`
	SpaceID            string         `db:"space_id"`
	SyncCursor         sql.NullString `db:"sync_cursor"`
	WindowDays         int            `db:"window_days"`
	OldestSyncedTime   sql.NullTime   `db:"oldest_synced_time"`
	LastSyncedAt       sql.NullTime   `db:"last_synced_at"`
	WatchExpiration    sql.NullTime   `db:"watch_expiration"`
}

func (r *SyncStateRecord) toModel() *mail.SyncState {
	return &mail.SyncState{
		ConnectedAccountID: r.ConnectedAccountID,
		SpaceID:            r.SpaceID,
		SyncCursor:         nullStringToStrPtr(r.SyncCursor),
		WindowDays:         r.WindowDays,
		OldestSyncedTime:   nullTimeToTimePtr(r.OldestSyncedTime),
		LastSyncedAt:       nullTimeToTimePtr(r.LastSyncedAt),
		WatchExpiration:    nullTimeToTimePtr(r.WatchExpiration),
	}
}

// SyncStateStore implements mail.SyncStateStore backed by PostgreSQL.
type SyncStateStore struct {
	db db.DB
}

// NewSyncStateStore constructs a new SyncStateStore.
func NewSyncStateStore(database db.DB) *SyncStateStore {
	return &SyncStateStore{db: database}
}

// Get retrieves the sync state for a connected account.
func (s *SyncStateStore) Get(ctx context.Context, spaceID, connectedAccountID string) (*mail.SyncState, error) {
	const op errors.Op = "mail/storage.SyncStateStore.Get"

	query := `
		SELECT
			connected_account_id, space_id, sync_cursor, window_days,
			oldest_synced_time, last_synced_at, watch_expiration
		FROM mail.sync_states
		WHERE space_id = $1 AND connected_account_id = $2
	`

	var record SyncStateRecord
	err := s.db.Get(ctx, &record, query, spaceID, connectedAccountID)
	if err != nil {
		if errors.Is(err, errors.NotExist) {
			return nil, nil
		}
		return nil, errors.E(op, err)
	}

	return record.toModel(), nil
}

// Upsert persists or updates the sync state for a connected account.
func (s *SyncStateStore) Upsert(ctx context.Context, state *mail.SyncState) error {
	const op errors.Op = "mail/storage.SyncStateStore.Upsert"

	query := `
		INSERT INTO mail.sync_states (
			connected_account_id, space_id, sync_cursor, window_days,
			oldest_synced_time, last_synced_at, watch_expiration
		) VALUES (
			$1, $2, $3, $4,
			$5, $6, $7
		)
		ON CONFLICT (connected_account_id) DO UPDATE SET
			sync_cursor = EXCLUDED.sync_cursor,
			window_days = EXCLUDED.window_days,
			oldest_synced_time = EXCLUDED.oldest_synced_time,
			last_synced_at = EXCLUDED.last_synced_at,
			watch_expiration = EXCLUDED.watch_expiration
	`

	_, err := s.db.Exec(
		ctx,
		query,
		state.ConnectedAccountID,
		state.SpaceID,
		strToNullString(state.SyncCursor),
		state.WindowDays,
		timeToNullTime(state.OldestSyncedTime),
		timeToNullTime(state.LastSyncedAt),
		timeToNullTime(state.WatchExpiration),
	)
	if err != nil {
		return errors.E(op, err)
	}

	return nil
}

// Delete removes the sync state for a connected account.
func (s *SyncStateStore) Delete(ctx context.Context, spaceID, connectedAccountID string) error {
	const op errors.Op = "mail/storage.SyncStateStore.Delete"

	query := `DELETE FROM mail.sync_states WHERE space_id = $1 AND connected_account_id = $2`
	_, err := s.db.Exec(ctx, query, spaceID, connectedAccountID)
	if err != nil {
		return errors.E(op, err)
	}

	return nil
}
