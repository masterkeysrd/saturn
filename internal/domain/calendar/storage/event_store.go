package storage

import (
	"context"
	"database/sql"
	"strconv"
	"time"

	"github.com/lib/pq"
	"github.com/masterkeysrd/saturn/internal/domain/calendar"
	"github.com/masterkeysrd/saturn/internal/platform/db"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

// EventRecord represents the row schema for calendar.events.
type EventRecord struct {
	ID                  string         `db:"id"`
	SpaceID             string         `db:"space_id"`
	CalendarID          string         `db:"calendar_id"`
	ProviderEventID     sql.NullString `db:"provider_event_id"`
	ICalUID             sql.NullString `db:"ical_uid"`
	Status              string         `db:"status"`
	Visibility          string         `db:"visibility"`
	Transparency        string         `db:"transparency"`
	Title               string         `db:"title"`
	Description         sql.NullString `db:"description"`
	Location            sql.NullString `db:"location"`
	ConferenceURL       sql.NullString `db:"conference_url"`
	ConferenceProvider  sql.NullString `db:"conference_provider"`
	IsAllDay            bool           `db:"is_all_day"`
	StartTime           sql.NullTime   `db:"start_time"`
	EndTime             sql.NullTime   `db:"end_time"`
	Timezone            sql.NullString `db:"timezone"`
	StartDate           sql.NullString `db:"start_date"`
	EndDate             sql.NullString `db:"end_date"`
	RRULE               sql.NullString `db:"rrule"`
	EXDates             pq.StringArray `db:"exdates"`
	EXDatesAllDay       pq.StringArray `db:"exdates_all_day"`
	RecurringMasterID   sql.NullString `db:"recurring_master_id"`
	OriginalStartTime   sql.NullTime   `db:"original_start_time"`
	OriginalStartDate   sql.NullString `db:"original_start_date"`
	OrganizerJSON       []byte         `db:"organizer_json"`
	AttendeesJSON       []byte         `db:"attendees_json"`
	RemindersJSON       []byte         `db:"reminders_json"`
	SourceMailMessageID sql.NullString `db:"source_mail_message_id"`
	ETag                sql.NullString `db:"etag"`
	Version             int64          `db:"version"`
	CreateTime          time.Time      `db:"create_time"`
	UpdateTime          time.Time      `db:"update_time"`
}

func (r *EventRecord) toModel() *calendar.Event {
	return &calendar.Event{
		ID:                  r.ID,
		SpaceID:             r.SpaceID,
		CalendarID:          r.CalendarID,
		ProviderEventID:     nullStringToStrPtr(r.ProviderEventID),
		ICalUID:             nullStringToStrPtr(r.ICalUID),
		Status:              calendar.EventStatus(r.Status),
		Visibility:          calendar.EventVisibility(r.Visibility),
		Transparency:        calendar.EventTransparency(r.Transparency),
		Title:               r.Title,
		Description:         nullStringToStrPtr(r.Description),
		Location:            nullStringToStrPtr(r.Location),
		ConferenceURL:       nullStringToStrPtr(r.ConferenceURL),
		ConferenceProvider:  nullStringToStrPtr(r.ConferenceProvider),
		IsAllDay:            r.IsAllDay,
		StartTime:           nullTimeToTimePtr(r.StartTime),
		EndTime:             nullTimeToTimePtr(r.EndTime),
		Timezone:            nullStringToStrPtr(r.Timezone),
		StartDate:           nullStringToStrPtr(r.StartDate),
		EndDate:             nullStringToStrPtr(r.EndDate),
		RRULE:               nullStringToStrPtr(r.RRULE),
		EXDates:             []string(r.EXDates),
		EXDatesAllDay:       []string(r.EXDatesAllDay),
		RecurringMasterID:   nullStringToStrPtr(r.RecurringMasterID),
		OriginalStartTime:   nullTimeToTimePtr(r.OriginalStartTime),
		OriginalStartDate:   nullStringToStrPtr(r.OriginalStartDate),
		OrganizerJSON:       r.OrganizerJSON,
		AttendeesJSON:       r.AttendeesJSON,
		RemindersJSON:       r.RemindersJSON,
		SourceMailMessageID: nullStringToStrPtr(r.SourceMailMessageID),
		ETag:                nullStringToStrPtr(r.ETag),
		Version:             r.Version,
		CreateTime:          r.CreateTime,
		UpdateTime:          r.UpdateTime,
	}
}

// EventStore implements calendar.EventStore.
type EventStore struct {
	db db.DB
}

// NewEventStore creates a new EventStore backed by PostgreSQL.
func NewEventStore(database db.DB) *EventStore {
	return &EventStore{db: database}
}

// Create persists a new Event entity.
func (s *EventStore) Create(ctx context.Context, event *calendar.Event) error {
	const op errors.Op = "calendar/storage.CreateEvent"

	query := `
		INSERT INTO calendar.events (
			id, space_id, calendar_id, provider_event_id, ical_uid,
			status, visibility, transparency, title, description,
			location, conference_url, conference_provider, is_all_day,
			start_time, end_time, timezone, start_date, end_date,
			rrule, exdates, exdates_all_day, recurring_master_id,
			original_start_time, original_start_date, organizer_json,
			attendees_json, reminders_json, source_mail_message_id,
			etag, version, create_time, update_time
		) VALUES (
			$1, $2, $3, $4, $5,
			$6, $7, $8, $9, $10,
			$11, $12, $13, $14,
			$15, $16, $17, $18, $19,
			$20, $21, $22, $23,
			$24, $25, $26,
			$27, $28, $29,
			$30, $31, $32, $33
		)
	`

	_, err := s.db.Exec(
		ctx,
		query,
		event.ID,
		event.SpaceID,
		event.CalendarID,
		strToNullString(event.ProviderEventID),
		strToNullString(event.ICalUID),
		string(event.Status),
		string(event.Visibility),
		string(event.Transparency),
		event.Title,
		strToNullString(event.Description),
		strToNullString(event.Location),
		strToNullString(event.ConferenceURL),
		strToNullString(event.ConferenceProvider),
		event.IsAllDay,
		timeToNullTime(event.StartTime),
		timeToNullTime(event.EndTime),
		strToNullString(event.Timezone),
		strToNullString(event.StartDate),
		strToNullString(event.EndDate),
		strToNullString(event.RRULE),
		stringArrayOrEmpty(event.EXDates),
		stringArrayOrEmpty(event.EXDatesAllDay),
		strToNullString(event.RecurringMasterID),
		timeToNullTime(event.OriginalStartTime),
		strToNullString(event.OriginalStartDate),
		event.OrganizerJSON,
		event.AttendeesJSON,
		event.RemindersJSON,
		strToNullString(event.SourceMailMessageID),
		strToNullString(event.ETag),
		event.Version,
		event.CreateTime,
		event.UpdateTime,
	)
	if err != nil {
		return errors.E(op, err)
	}

	return nil
}

// GetByID retrieves an Event by space ID and event ID.
func (s *EventStore) GetByID(ctx context.Context, spaceID, id string) (*calendar.Event, error) {
	const op errors.Op = "calendar/storage.GetEventByID"

	query := `
		SELECT
			id, space_id, calendar_id, provider_event_id, ical_uid,
			status, visibility, transparency, title, description,
			location, conference_url, conference_provider, is_all_day,
			start_time, end_time, timezone, start_date, end_date,
			rrule, exdates, exdates_all_day, recurring_master_id,
			original_start_time, original_start_date, organizer_json,
			attendees_json, reminders_json, source_mail_message_id,
			etag, version, create_time, update_time
		FROM calendar.events
		WHERE space_id = $1 AND id = $2
	`

	var rec EventRecord
	if err := s.db.Get(ctx, &rec, query, spaceID, id); err != nil {
		if errors.Is(err, errors.NotExist) {
			return nil, nil
		}
		return nil, errors.E(op, err)
	}

	return rec.toModel(), nil
}

// GetByProviderEventID retrieves an Event by calendar ID and provider event ID.
func (s *EventStore) GetByProviderEventID(ctx context.Context, calendarID, providerEventID string) (*calendar.Event, error) {
	const op errors.Op = "calendar/storage.GetByProviderEventID"

	query := `
		SELECT
			id, space_id, calendar_id, provider_event_id, ical_uid,
			status, visibility, transparency, title, description,
			location, conference_url, conference_provider, is_all_day,
			start_time, end_time, timezone, start_date, end_date,
			rrule, exdates, exdates_all_day, recurring_master_id,
			original_start_time, original_start_date, organizer_json,
			attendees_json, reminders_json, source_mail_message_id,
			etag, version, create_time, update_time
		FROM calendar.events
		WHERE calendar_id = $1 AND provider_event_id = $2
	`

	var rec EventRecord
	if err := s.db.Get(ctx, &rec, query, calendarID, providerEventID); err != nil {
		if errors.Is(err, errors.NotExist) {
			return nil, nil
		}
		return nil, errors.E(op, err)
	}

	return rec.toModel(), nil
}

// Update modifies an existing event using optimistic concurrency control.
func (s *EventStore) Update(ctx context.Context, event *calendar.Event) error {
	const op errors.Op = "calendar/storage.UpdateEvent"

	query := `
		UPDATE calendar.events SET
			status = $1,
			visibility = $2,
			transparency = $3,
			title = $4,
			description = $5,
			location = $6,
			conference_url = $7,
			conference_provider = $8,
			is_all_day = $9,
			start_time = $10,
			end_time = $11,
			timezone = $12,
			start_date = $13,
			end_date = $14,
			rrule = $15,
			exdates = $16,
			exdates_all_day = $17,
			recurring_master_id = $18,
			original_start_time = $19,
			original_start_date = $20,
			organizer_json = $21,
			attendees_json = $22,
			reminders_json = $23,
			source_mail_message_id = $24,
			etag = $25,
			version = version + 1,
			update_time = $26
		WHERE space_id = $27 AND id = $28 AND version = $29
	`

	now := time.Now().UTC()
	err := s.db.ExecOne(
		ctx,
		query,
		string(event.Status),
		string(event.Visibility),
		string(event.Transparency),
		event.Title,
		strToNullString(event.Description),
		strToNullString(event.Location),
		strToNullString(event.ConferenceURL),
		strToNullString(event.ConferenceProvider),
		event.IsAllDay,
		timeToNullTime(event.StartTime),
		timeToNullTime(event.EndTime),
		strToNullString(event.Timezone),
		strToNullString(event.StartDate),
		strToNullString(event.EndDate),
		strToNullString(event.RRULE),
		stringArrayOrEmpty(event.EXDates),
		stringArrayOrEmpty(event.EXDatesAllDay),
		strToNullString(event.RecurringMasterID),
		timeToNullTime(event.OriginalStartTime),
		strToNullString(event.OriginalStartDate),
		event.OrganizerJSON,
		event.AttendeesJSON,
		event.RemindersJSON,
		strToNullString(event.SourceMailMessageID),
		strToNullString(event.ETag),
		now,
		event.SpaceID,
		event.ID,
		event.Version,
	)
	if err != nil {
		if errors.Is(err, errors.NotExist) {
			return errors.E(op, errors.Conflict, "event version conflict or event not found")
		}
		return errors.E(op, err)
	}

	event.Version++
	event.UpdateTime = now
	return nil
}

// Delete removes an Event by ID.
func (s *EventStore) Delete(ctx context.Context, spaceID, id string) error {
	const op errors.Op = "calendar/storage.DeleteEvent"

	query := `DELETE FROM calendar.events WHERE space_id = $1 AND id = $2`
	if err := s.db.ExecOne(ctx, query, spaceID, id); err != nil {
		return errors.E(op, err)
	}
	return nil
}

// DeleteByCalendarID removes all events belonging to a calendar.
func (s *EventStore) DeleteByCalendarID(ctx context.Context, spaceID, calendarID string) error {
	const op errors.Op = "calendar/storage.DeleteByCalendarID"

	query := `DELETE FROM calendar.events WHERE space_id = $1 AND calendar_id = $2`
	if _, err := s.db.Exec(ctx, query, spaceID, calendarID); err != nil {
		return errors.E(op, err)
	}
	return nil
}

// ListByCalendar retrieves all events for a calendar matching optional filter criteria.
func (s *EventStore) ListByCalendar(ctx context.Context, spaceID, calendarID string, filter *calendar.ListEventsFilter) ([]*calendar.Event, error) {
	const op errors.Op = "calendar/storage.ListByCalendar"

	baseQuery := `
		SELECT
			id, space_id, calendar_id, provider_event_id, ical_uid,
			status, visibility, transparency, title, description,
			location, conference_url, conference_provider, is_all_day,
			start_time, end_time, timezone, start_date, end_date,
			rrule, exdates, exdates_all_day, recurring_master_id,
			original_start_time, original_start_date, organizer_json,
			attendees_json, reminders_json, source_mail_message_id,
			etag, version, create_time, update_time
		FROM calendar.events
		WHERE space_id = $1 AND calendar_id = $2
	`

	args := []any{spaceID, calendarID}
	idx := 3

	if filter != nil {
		if filter.Status != nil {
			baseQuery += ` AND status = $` + strconv.Itoa(idx)
			args = append(args, string(*filter.Status))
		}
		if !filter.IncludeRecurringExceptions {
			baseQuery += ` AND recurring_master_id IS NULL`
		}
	}

	baseQuery += ` ORDER BY COALESCE(start_time, (start_date || ' 00:00:00Z')::timestamptz) ASC`

	var records []EventRecord
	if err := s.db.Select(ctx, &records, baseQuery, args...); err != nil {
		return nil, errors.E(op, err)
	}

	result := make([]*calendar.Event, len(records))
	for i := range records {
		result[i] = records[i].toModel()
	}

	return result, nil
}

// ListInTimeRange retrieves events in calendarIDs overlapping the time or date range.
func (s *EventStore) ListInTimeRange(
	ctx context.Context,
	spaceID string,
	calendarIDs []string,
	startTime, endTime time.Time,
	startDate, endDate string,
) ([]*calendar.Event, error) {
	const op errors.Op = "calendar/storage.ListInTimeRange"

	if len(calendarIDs) == 0 {
		return nil, nil
	}

	query := `
		SELECT
			id, space_id, calendar_id, provider_event_id, ical_uid,
			status, visibility, transparency, title, description,
			location, conference_url, conference_provider, is_all_day,
			start_time, end_time, timezone, start_date, end_date,
			rrule, exdates, exdates_all_day, recurring_master_id,
			original_start_time, original_start_date, organizer_json,
			attendees_json, reminders_json, source_mail_message_id,
			etag, version, create_time, update_time
		FROM calendar.events
		WHERE space_id = $1
		  AND calendar_id = ANY($2)
		  AND (
		    (NOT is_all_day AND start_time < $3 AND end_time > $4)
		    OR
		    (is_all_day AND start_date < $5 AND end_date > $6)
		  )
		ORDER BY COALESCE(start_time, (start_date || ' 00:00:00Z')::timestamptz) ASC
	`

	var records []EventRecord
	if err := s.db.Select(ctx, &records, query, spaceID, pq.Array(calendarIDs), endTime, startTime, endDate, startDate); err != nil {
		return nil, errors.E(op, err)
	}

	result := make([]*calendar.Event, len(records))
	for i := range records {
		result[i] = records[i].toModel()
	}

	return result, nil
}

// ListRecurringMasters retrieves recurring master events for the specified calendars.
func (s *EventStore) ListRecurringMasters(ctx context.Context, spaceID string, calendarIDs []string) ([]*calendar.Event, error) {
	const op errors.Op = "calendar/storage.ListRecurringMasters"

	if len(calendarIDs) == 0 {
		return nil, nil
	}

	query := `
		SELECT
			id, space_id, calendar_id, provider_event_id, ical_uid,
			status, visibility, transparency, title, description,
			location, conference_url, conference_provider, is_all_day,
			start_time, end_time, timezone, start_date, end_date,
			rrule, exdates, exdates_all_day, recurring_master_id,
			original_start_time, original_start_date, organizer_json,
			attendees_json, reminders_json, source_mail_message_id,
			etag, version, create_time, update_time
		FROM calendar.events
		WHERE space_id = $1
		  AND calendar_id = ANY($2)
		  AND rrule IS NOT NULL
		  AND rrule != ''
		ORDER BY COALESCE(start_time, (start_date || ' 00:00:00Z')::timestamptz) ASC
	`

	var records []EventRecord
	if err := s.db.Select(ctx, &records, query, spaceID, pq.Array(calendarIDs)); err != nil {
		return nil, errors.E(op, err)
	}

	result := make([]*calendar.Event, len(records))
	for i := range records {
		result[i] = records[i].toModel()
	}

	return result, nil
}

// ListExceptionsByMasterID retrieves all recurrence exceptions for a master event.
func (s *EventStore) ListExceptionsByMasterID(ctx context.Context, spaceID, masterID string) ([]*calendar.Event, error) {
	const op errors.Op = "calendar/storage.ListExceptionsByMasterID"

	query := `
		SELECT
			id, space_id, calendar_id, provider_event_id, ical_uid,
			status, visibility, transparency, title, description,
			location, conference_url, conference_provider, is_all_day,
			start_time, end_time, timezone, start_date, end_date,
			rrule, exdates, exdates_all_day, recurring_master_id,
			original_start_time, original_start_date, organizer_json,
			attendees_json, reminders_json, source_mail_message_id,
			etag, version, create_time, update_time
		FROM calendar.events
		WHERE space_id = $1 AND recurring_master_id = $2
	`

	var records []EventRecord
	if err := s.db.Select(ctx, &records, query, spaceID, masterID); err != nil {
		return nil, errors.E(op, err)
	}

	result := make([]*calendar.Event, len(records))
	for i := range records {
		result[i] = records[i].toModel()
	}

	return result, nil
}

// ListExceptionsByMasterIDs retrieves all recurrence exceptions for a set of master events.
func (s *EventStore) ListExceptionsByMasterIDs(ctx context.Context, spaceID string, masterIDs []string) ([]*calendar.Event, error) {
	const op errors.Op = "calendar/storage.ListExceptionsByMasterIDs"

	if len(masterIDs) == 0 {
		return nil, nil
	}

	query := `
		SELECT
			id, space_id, calendar_id, provider_event_id, ical_uid,
			status, visibility, transparency, title, description,
			location, conference_url, conference_provider, is_all_day,
			start_time, end_time, timezone, start_date, end_date,
			rrule, exdates, exdates_all_day, recurring_master_id,
			original_start_time, original_start_date, organizer_json,
			attendees_json, reminders_json, source_mail_message_id,
			etag, version, create_time, update_time
		FROM calendar.events
		WHERE space_id = $1 AND recurring_master_id = ANY($2)
	`

	var records []EventRecord
	if err := s.db.Select(ctx, &records, query, spaceID, pq.Array(masterIDs)); err != nil {
		return nil, errors.E(op, err)
	}

	result := make([]*calendar.Event, len(records))
	for i := range records {
		result[i] = records[i].toModel()
	}

	return result, nil
}

func stringArrayOrEmpty(arr []string) pq.StringArray {
	if arr == nil {
		return pq.StringArray([]string{})
	}
	return pq.StringArray(arr)
}
