package calendar

import (
	"context"
	"time"
)

//go:generate go run github.com/masterkeysrd/saturn/tools/mockgen .

// CalendarStore defines persistence operations for calendar entities.
//
// @Mock
type CalendarStore interface {
	// Create persists a new Calendar entity.
	Create(ctx context.Context, cal *Calendar) error

	// GetByID retrieves a Calendar by space ID and calendar ID.
	GetByID(ctx context.Context, spaceID, id string) (*Calendar, error)

	// GetDefaultNative retrieves the default native calendar for a workspace.
	GetDefaultNative(ctx context.Context, spaceID string) (*Calendar, error)

	// GetByConnectedAccountAndProviderID retrieves an external calendar by provider calendar ID.
	GetByConnectedAccountAndProviderID(ctx context.Context, spaceID, accountID, providerCalendarID string) (*Calendar, error)

	// Update updates mutable attributes of an existing Calendar.
	Update(ctx context.Context, cal *Calendar) error

	// Delete removes a Calendar and all of its associated events.
	Delete(ctx context.Context, spaceID, id string) error

	// DeleteByConnectedAccount removes all calendars and events associated with a connected account.
	DeleteByConnectedAccount(ctx context.Context, spaceID, accountID string) error

	// ListBySpace retrieves all calendars for a space matching optional filter criteria.
	ListBySpace(ctx context.Context, spaceID string, filter *ListCalendarsFilter) ([]*Calendar, error)
}

// ListCalendarsFilter encapsulates filtering options for listing calendars.
type ListCalendarsFilter struct {
	ConnectedAccountID *string
	Source             *CalendarSource
	EnabledOnly        bool
}

// EventStore defines persistence operations for calendar events.
//
// @Mock
type EventStore interface {
	// Create persists a new Event entity.
	Create(ctx context.Context, event *Event) error

	// GetByID retrieves an Event by space ID and event ID.
	GetByID(ctx context.Context, spaceID, id string) (*Event, error)

	// GetByProviderEventID retrieves an event by its external provider event ID.
	GetByProviderEventID(ctx context.Context, calendarID, providerEventID string) (*Event, error)

	// Update updates mutable attributes of an existing Event.
	Update(ctx context.Context, event *Event) error

	// Delete removes an Event.
	Delete(ctx context.Context, spaceID, id string) error

	// DeleteByCalendarID removes all events belonging to a calendar.
	DeleteByCalendarID(ctx context.Context, spaceID, calendarID string) error

	// ListByCalendar retrieves events in a calendar matching optional filter criteria.
	ListByCalendar(ctx context.Context, spaceID, calendarID string, filter *ListEventsFilter) ([]*Event, error)

	// ListInTimeRange retrieves non-recurring events and exceptions overlapping the time or date range.
	ListInTimeRange(ctx context.Context, spaceID string, calendarIDs []string, startTime, endTime time.Time, startDate, endDate string) ([]*Event, error)

	// ListRecurringMasters retrieves all recurring master events for the given calendars.
	ListRecurringMasters(ctx context.Context, spaceID string, calendarIDs []string) ([]*Event, error)

	// ListExceptionsByMasterID retrieves all recurrence exception events for a specific master event.
	ListExceptionsByMasterID(ctx context.Context, spaceID, masterID string) ([]*Event, error)

	// ListExceptionsByMasterIDs retrieves all recurrence exception events for a set of master events.
	ListExceptionsByMasterIDs(ctx context.Context, spaceID string, masterIDs []string) ([]*Event, error)
}

// ListEventsFilter encapsulates filtering options for listing events in a calendar.
type ListEventsFilter struct {
	Status                     *EventStatus
	IncludeRecurringExceptions bool
}

// DiscoveredCalendar represents calendar metadata returned from an external provider.
type DiscoveredCalendar struct {
	ProviderCalendarID string
	Name               string
	Description        string
	Color              string
	Timezone           string
	AccessRole         AccessRole
	IsPrimary          bool
}

// DiscoveredEvent represents an event entry returned from an external provider during sync.
type DiscoveredEvent struct {
	ProviderEventID    string
	ICalUID            string
	Status             EventStatus
	Title              string
	Description        string
	Location           string
	ConferenceURL      string
	ConferenceProvider string
	IsAllDay           bool
	StartTime          *time.Time
	EndTime            *time.Time
	Timezone           string
	StartDate          *string
	EndDate            *string
	RRULE              *string
	EXDates            []string
	RecurringMasterID  *string
	OriginalStartTime  *time.Time
	OriginalStartDate  *string
	Organizer          *Organizer
	Attendees          []Attendee
	Reminders          []Reminder
	ETag               string
	UpdatedAt          time.Time
}

// EventSyncResult holds the incremental or full sync response from an external calendar.
type EventSyncResult struct {
	Events             []*DiscoveredEvent
	NextSyncCursor     string
	FullResyncRequired bool
}

// EventWriteResult holds the response after a write-through mutation on an external provider.
type EventWriteResult struct {
	ProviderEventID string
	ETag            string
	ConferenceURL   string
}

// ExternalCalendarProvider defines the port interface for external calendar providers (e.g. Google, Microsoft).
//
// @Mock
type ExternalCalendarProvider interface {
	// Provider returns the provider name (e.g. "google", "microsoft").
	Provider() string

	// ListCalendars fetches all calendars accessible to the connected account.
	ListCalendars(ctx context.Context, accessToken string) ([]*DiscoveredCalendar, error)

	// SyncEvents retrieves event changes since syncCursor using incremental sync tokens.
	SyncEvents(ctx context.Context, accessToken, providerCalendarID, syncCursor string) (*EventSyncResult, error)

	// CreateEvent creates an event directly on the external provider.
	CreateEvent(ctx context.Context, accessToken, providerCalendarID string, event *Event) (*EventWriteResult, error)

	// UpdateEvent updates an event directly on the external provider.
	UpdateEvent(ctx context.Context, accessToken, providerCalendarID string, event *Event) (*EventWriteResult, error)

	// DeleteEvent removes an event directly on the external provider.
	DeleteEvent(ctx context.Context, accessToken, providerCalendarID, providerEventID string) error

	// RespondToEvent updates the user's RSVP status directly on the external provider.
	RespondToEvent(ctx context.Context, accessToken, providerCalendarID, providerEventID, attendeeEmail, responseStatus string) error
}
