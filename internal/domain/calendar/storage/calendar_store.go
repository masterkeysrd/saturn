package storage

import (
	"context"
	"database/sql"
	"strconv"
	"time"

	"github.com/masterkeysrd/saturn/internal/domain/calendar"
	"github.com/masterkeysrd/saturn/internal/platform/db"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

// CalendarRecord represents the row schema for calendar.calendars.
type CalendarRecord struct {
	ID                 string         `db:"id"`
	SpaceID            string         `db:"space_id"`
	ConnectedAccountID sql.NullString `db:"connected_account_id"`
	Source             string         `db:"source"`
	ProviderCalendarID sql.NullString `db:"provider_calendar_id"`
	Name               string         `db:"name"`
	Description        sql.NullString `db:"description"`
	Color              sql.NullString `db:"color"`
	Timezone           string         `db:"timezone"`
	AccessRole         string         `db:"access_role"`
	IsPrimary          bool           `db:"is_primary"`
	IsEnabled          bool           `db:"is_enabled"`
	IsDefaultNative    bool           `db:"is_default_native"`
	SyncCursor         sql.NullString `db:"sync_cursor"`
	LastSyncedAt       sql.NullTime   `db:"last_synced_at"`
	ETag               sql.NullString `db:"etag"`
	Version            int64          `db:"version"`
	CreateTime         time.Time      `db:"create_time"`
	UpdateTime         time.Time      `db:"update_time"`
}

func (r *CalendarRecord) toModel() *calendar.Calendar {
	return &calendar.Calendar{
		ID:                 r.ID,
		SpaceID:            r.SpaceID,
		ConnectedAccountID: nullStringToStrPtr(r.ConnectedAccountID),
		Source:             calendar.CalendarSource(r.Source),
		ProviderCalendarID: nullStringToStrPtr(r.ProviderCalendarID),
		Name:               r.Name,
		Description:        nullStringToStrPtr(r.Description),
		Color:              nullStringToStrPtr(r.Color),
		Timezone:           r.Timezone,
		AccessRole:         calendar.AccessRole(r.AccessRole),
		IsPrimary:          r.IsPrimary,
		IsEnabled:          r.IsEnabled,
		IsDefaultNative:    r.IsDefaultNative,
		SyncCursor:         nullStringToStrPtr(r.SyncCursor),
		LastSyncedAt:       nullTimeToTimePtr(r.LastSyncedAt),
		ETag:               nullStringToStrPtr(r.ETag),
		Version:            r.Version,
		CreateTime:         r.CreateTime,
		UpdateTime:         r.UpdateTime,
	}
}

// CalendarStore implements calendar.CalendarStore.
type CalendarStore struct {
	db db.DB
}

// NewCalendarStore creates a new CalendarStore backed by PostgreSQL.
func NewCalendarStore(database db.DB) *CalendarStore {
	store := &CalendarStore{db: database}
	RegisterCapabilityCleaner(store)
	return store
}

// Create persists a new Calendar entity.
func (s *CalendarStore) Create(ctx context.Context, cal *calendar.Calendar) error {
	const op errors.Op = "calendar/storage.Create"

	query := `
		INSERT INTO calendar.calendars (
			id, space_id, connected_account_id, source, provider_calendar_id,
			name, description, color, timezone, access_role,
			is_primary, is_enabled, is_default_native, sync_cursor,
			last_synced_at, etag, version, create_time, update_time
		) VALUES (
			$1, $2, $3, $4, $5,
			$6, $7, $8, $9, $10,
			$11, $12, $13, $14,
			$15, $16, $17, $18, $19
		)
	`

	_, err := s.db.Exec(
		ctx,
		query,
		cal.ID,
		cal.SpaceID,
		strToNullString(cal.ConnectedAccountID),
		string(cal.Source),
		strToNullString(cal.ProviderCalendarID),
		cal.Name,
		strToNullString(cal.Description),
		strToNullString(cal.Color),
		cal.Timezone,
		string(cal.AccessRole),
		cal.IsPrimary,
		cal.IsEnabled,
		cal.IsDefaultNative,
		strToNullString(cal.SyncCursor),
		timeToNullTime(cal.LastSyncedAt),
		strToNullString(cal.ETag),
		cal.Version,
		cal.CreateTime,
		cal.UpdateTime,
	)
	if err != nil {
		return errors.E(op, err)
	}

	return nil
}

// GetByID retrieves a Calendar by space ID and calendar ID.
func (s *CalendarStore) GetByID(ctx context.Context, spaceID, id string) (*calendar.Calendar, error) {
	const op errors.Op = "calendar/storage.GetByID"

	query := `
		SELECT
			id, space_id, connected_account_id, source, provider_calendar_id,
			name, description, color, timezone, access_role,
			is_primary, is_enabled, is_default_native, sync_cursor,
			last_synced_at, etag, version, create_time, update_time
		FROM calendar.calendars
		WHERE space_id = $1 AND id = $2
	`

	var rec CalendarRecord
	if err := s.db.Get(ctx, &rec, query, spaceID, id); err != nil {
		if errors.Is(err, errors.NotExist) {
			return nil, nil
		}
		return nil, errors.E(op, err)
	}

	return rec.toModel(), nil
}

// GetDefaultNative retrieves the default native calendar for a workspace.
func (s *CalendarStore) GetDefaultNative(ctx context.Context, spaceID string) (*calendar.Calendar, error) {
	const op errors.Op = "calendar/storage.GetDefaultNative"

	query := `
		SELECT
			id, space_id, connected_account_id, source, provider_calendar_id,
			name, description, color, timezone, access_role,
			is_primary, is_enabled, is_default_native, sync_cursor,
			last_synced_at, etag, version, create_time, update_time
		FROM calendar.calendars
		WHERE space_id = $1 AND is_default_native = true
	`

	var rec CalendarRecord
	if err := s.db.Get(ctx, &rec, query, spaceID); err != nil {
		if errors.Is(err, errors.NotExist) {
			return nil, nil
		}
		return nil, errors.E(op, err)
	}

	return rec.toModel(), nil
}

// GetByConnectedAccountAndProviderID retrieves an external calendar by provider calendar ID.
func (s *CalendarStore) GetByConnectedAccountAndProviderID(ctx context.Context, spaceID, accountID, providerCalendarID string) (*calendar.Calendar, error) {
	const op errors.Op = "calendar/storage.GetByConnectedAccountAndProviderID"

	query := `
		SELECT
			id, space_id, connected_account_id, source, provider_calendar_id,
			name, description, color, timezone, access_role,
			is_primary, is_enabled, is_default_native, sync_cursor,
			last_synced_at, etag, version, create_time, update_time
		FROM calendar.calendars
		WHERE space_id = $1 AND connected_account_id = $2 AND provider_calendar_id = $3
	`

	var rec CalendarRecord
	if err := s.db.Get(ctx, &rec, query, spaceID, accountID, providerCalendarID); err != nil {
		if errors.Is(err, errors.NotExist) {
			return nil, nil
		}
		return nil, errors.E(op, err)
	}

	return rec.toModel(), nil
}

// Update updates mutable attributes of an existing Calendar using optimistic concurrency control.
func (s *CalendarStore) Update(ctx context.Context, cal *calendar.Calendar) error {
	const op errors.Op = "calendar/storage.Update"

	query := `
		UPDATE calendar.calendars SET
			name = $1,
			description = $2,
			color = $3,
			timezone = $4,
			access_role = $5,
			is_primary = $6,
			is_enabled = $7,
			is_default_native = $8,
			sync_cursor = $9,
			last_synced_at = $10,
			etag = $11,
			version = version + 1,
			update_time = $12
		WHERE space_id = $13 AND id = $14 AND version = $15
	`

	now := time.Now().UTC()
	err := s.db.ExecOne(
		ctx,
		query,
		cal.Name,
		strToNullString(cal.Description),
		strToNullString(cal.Color),
		cal.Timezone,
		string(cal.AccessRole),
		cal.IsPrimary,
		cal.IsEnabled,
		cal.IsDefaultNative,
		strToNullString(cal.SyncCursor),
		timeToNullTime(cal.LastSyncedAt),
		strToNullString(cal.ETag),
		now,
		cal.SpaceID,
		cal.ID,
		cal.Version,
	)
	if err != nil {
		if errors.Is(err, errors.NotExist) {
			return errors.E(op, errors.Conflict, "calendar version conflict or calendar not found")
		}
		return errors.E(op, err)
	}

	cal.Version++
	cal.UpdateTime = now
	return nil
}

// Delete removes a Calendar by ID.
func (s *CalendarStore) Delete(ctx context.Context, spaceID, id string) error {
	const op errors.Op = "calendar/storage.Delete"

	query := `DELETE FROM calendar.calendars WHERE space_id = $1 AND id = $2`
	if err := s.db.ExecOne(ctx, query, spaceID, id); err != nil {
		return errors.E(op, err)
	}
	return nil
}

// DeleteByConnectedAccount removes all calendars belonging to a connected account.
func (s *CalendarStore) DeleteByConnectedAccount(ctx context.Context, spaceID, accountID string) error {
	const op errors.Op = "calendar/storage.DeleteByConnectedAccount"

	query := `DELETE FROM calendar.calendars WHERE space_id = $1 AND connected_account_id = $2`
	if _, err := s.db.Exec(ctx, query, spaceID, accountID); err != nil {
		return errors.E(op, err)
	}
	return nil
}

// ListBySpace retrieves all calendars for a space matching optional filter criteria.
func (s *CalendarStore) ListBySpace(ctx context.Context, spaceID string, filter *calendar.ListCalendarsFilter) ([]*calendar.Calendar, error) {
	const op errors.Op = "calendar/storage.ListBySpace"

	baseQuery := `
		SELECT
			id, space_id, connected_account_id, source, provider_calendar_id,
			name, description, color, timezone, access_role,
			is_primary, is_enabled, is_default_native, sync_cursor,
			last_synced_at, etag, version, create_time, update_time
		FROM calendar.calendars
		WHERE space_id = $1
	`

	args := []any{spaceID}
	idx := 2

	if filter != nil {
		if filter.ConnectedAccountID != nil {
			baseQuery += ` AND connected_account_id = $` + strconv.Itoa(idx)
			args = append(args, *filter.ConnectedAccountID)
			idx++
		}
		if filter.Source != nil {
			baseQuery += ` AND source = $` + strconv.Itoa(idx)
			args = append(args, string(*filter.Source))
		}
		if filter.EnabledOnly {
			baseQuery += ` AND is_enabled = true`
		}
	}

	baseQuery += ` ORDER BY is_primary DESC, is_default_native DESC, name ASC`

	var records []CalendarRecord
	if err := s.db.Select(ctx, &records, baseQuery, args...); err != nil {
		return nil, errors.E(op, err)
	}

	result := make([]*calendar.Calendar, len(records))
	for i := range records {
		result[i] = records[i].toModel()
	}

	return result, nil
}
