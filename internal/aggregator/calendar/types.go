package calendaraggregator

import (
	"context"
	"time"

	domaincalendar "github.com/masterkeysrd/saturn/internal/domain/calendar"
	"github.com/masterkeysrd/saturn/internal/platform/connector"
)

//go:generate go run github.com/masterkeysrd/saturn/tools/mockgen .

// CalendarReader defines read-only domain operations on calendars.
//
// @Mock
type CalendarReader interface {
	GetByID(ctx context.Context, spaceID, id string) (*domaincalendar.Calendar, error)
	ListBySpace(ctx context.Context, spaceID string, filter *domaincalendar.ListCalendarsFilter) ([]*domaincalendar.Calendar, error)
}

// EventReader defines read-only domain operations on events.
//
// @Mock
type EventReader interface {
	GetByID(ctx context.Context, spaceID, id string) (*domaincalendar.Event, error)
	ListByCalendar(ctx context.Context, spaceID, calendarID string, filter *domaincalendar.ListEventsFilter) ([]*domaincalendar.Event, error)
	ListInTimeRange(ctx context.Context, spaceID string, calendarIDs []string, startTime, endTime time.Time, startDate, endDate string) ([]*domaincalendar.Event, error)
	ListRecurringMasters(ctx context.Context, spaceID string, calendarIDs []string) ([]*domaincalendar.Event, error)
	ListExceptionsByMasterIDs(ctx context.Context, spaceID string, masterIDs []string) ([]*domaincalendar.Event, error)
}

// ConnectedAccountReader provides read-only access to external connected account metadata.
//
// @Mock
type ConnectedAccountReader interface {
	GetAccount(ctx context.Context, spaceID, id string) (*connector.ConnectedAccount, error)
	ListAccounts(ctx context.Context, spaceID string) ([]*connector.ConnectedAccount, error)
}

// VirtualOccurrence models a cross-domain milestone, bill, or subscription projected onto the calendar timeline.
type VirtualOccurrence struct {
	ID          string
	Title       string
	Description string
	StartTime   time.Time
	EndTime     time.Time
	IsAllDay    bool
	StartDate   string
	EndDate     string
	Color       string
	SourceType  string // e.g. "bill", "subscription", "milestone"
}

// TimelineSource allows external subsystems (e.g. finance, tasks) to register virtual read-only timeline overlays.
//
// @Mock
type TimelineSource interface {
	SourceType() string
	FetchOccurrences(ctx context.Context, spaceID string, rangeStart, rangeEnd time.Time) ([]VirtualOccurrence, error)
}

// OccurrenceProjection is the CQRS hydrated read projection for an event occurrence on the calendar timeline.
type OccurrenceProjection struct {
	EventID      string
	CalendarID   string
	MasterID     *string
	InstanceID   string
	Title        string
	Description  string
	Location     string
	IsAllDay     bool
	StartTime    *time.Time
	EndTime      *time.Time
	StartDate    *string
	EndDate      *string
	Timezone     string
	Status       domaincalendar.EventStatus
	IsException  bool
	MeetURL      string
	Color        string
	CalendarName string
	Organizer    *domaincalendar.Organizer
	Attendees    []domaincalendar.Attendee
	Reminders    []domaincalendar.Reminder
	IsVirtual    bool
	SourceType   string
}
