package calendar

import (
	"encoding/json/v2"
	"strings"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/id"
	"github.com/masterkeysrd/saturn/internal/platform/patch"
)

// EventPrefix is the unique prefix for calendar event IDs.
const EventPrefix = "cev_"

// EventIDGenerator generates and validates Event IDs.
var EventIDGenerator = id.NewPrefixGenerator(EventPrefix)

// GenerateEventID generates a new Event ID with the cev_ prefix.
func GenerateEventID() (string, error) {
	return EventIDGenerator.Generate()
}

// ValidateEventID checks that idStr is a valid Event ID.
func ValidateEventID(idStr string) error {
	return EventIDGenerator.Validate(idStr)
}

// EventStatus indicates the lifecycle or attendance state of an event.
type EventStatus string

const (
	EventStatusConfirmed EventStatus = "confirmed"
	EventStatusTentative EventStatus = "tentative"
	EventStatusCancelled EventStatus = "cancelled"
)

// IsValid checks if the event status is valid.
func (s EventStatus) IsValid() bool {
	switch s {
	case EventStatusConfirmed, EventStatusTentative, EventStatusCancelled:
		return true
	default:
		return false
	}
}

// EventVisibility determines audience privacy for the event.
type EventVisibility string

const (
	VisibilityDefault      EventVisibility = "default"
	VisibilityPublic       EventVisibility = "public"
	VisibilityPrivate      EventVisibility = "private"
	VisibilityConfidential EventVisibility = "confidential"
)

// IsValid checks if the event visibility is valid.
func (v EventVisibility) IsValid() bool {
	switch v {
	case VisibilityDefault, VisibilityPublic, VisibilityPrivate, VisibilityConfidential:
		return true
	default:
		return false
	}
}

// EventTransparency determines whether the event consumes time on the busy schedule.
type EventTransparency string

const (
	TransparencyOpaque      EventTransparency = "opaque"
	TransparencyTransparent EventTransparency = "transparent"
)

// IsValid checks if the transparency setting is valid.
func (t EventTransparency) IsValid() bool {
	return t == TransparencyOpaque || t == TransparencyTransparent
}

// RecurrenceEditScope defines the update target when modifying a recurring event instance.
type RecurrenceEditScope string

const (
	// RecurrenceEditScopeThisEvent modifies or deletes only the targeted single occurrence.
	RecurrenceEditScopeThisEvent RecurrenceEditScope = "THIS_EVENT"

	// RecurrenceEditScopeThisAndFollowing splits recurrence, keeping historical instances and altering future ones.
	RecurrenceEditScopeThisAndFollowing RecurrenceEditScope = "THIS_AND_FOLLOWING"

	// RecurrenceEditScopeAllEvents modifies the recurring master event definition across all past and future instances.
	RecurrenceEditScopeAllEvents RecurrenceEditScope = "ALL_EVENTS"
)

// Attendee represents an invited participant on a calendar event.
type Attendee struct {
	Email          string `json:"email"`
	DisplayName    string `json:"display_name,omitempty"`
	ResponseStatus string `json:"response_status,omitempty"` // needs_action, accepted, tentative, declined
	Optional       bool   `json:"optional,omitempty"`
	Organizer      bool   `json:"organizer,omitempty"`
}

// Organizer represents the host or creator of a calendar event.
type Organizer struct {
	Email       string `json:"email"`
	DisplayName string `json:"display_name,omitempty"`
	Self        bool   `json:"self,omitempty"`
}

// Reminder represents an alarm/notification trigger for an event.
type Reminder struct {
	Method  string `json:"method"` // popup, email
	Minutes int32  `json:"minutes"`
}

// Event represents a scheduled timed or all-day calendar entry with optional recurrence.
type Event struct {
	ID                  string            `db:"id" json:"id"`
	SpaceID             string            `db:"space_id" json:"space_id"`
	CalendarID          string            `db:"calendar_id" json:"calendar_id"`
	ProviderEventID     *string           `db:"provider_event_id" json:"provider_event_id,omitempty"`
	ICalUID             *string           `db:"ical_uid" json:"ical_uid,omitempty"`
	Status              EventStatus       `db:"status" json:"status"`
	Visibility          EventVisibility   `db:"visibility" json:"visibility"`
	Transparency        EventTransparency `db:"transparency" json:"transparency"`
	Title               string            `db:"title" json:"title"`
	Description         *string           `db:"description" json:"description,omitempty"`
	Location            *string           `db:"location" json:"location,omitempty"`
	ConferenceURL       *string           `db:"conference_url" json:"conference_url,omitempty"`
	ConferenceProvider  *string           `db:"conference_provider" json:"conference_provider,omitempty"`
	IsAllDay            bool              `db:"is_all_day" json:"is_all_day"`
	StartTime           *time.Time        `db:"start_time" json:"start_time,omitempty"`
	EndTime             *time.Time        `db:"end_time" json:"end_time,omitempty"`
	Timezone            *string           `db:"timezone" json:"timezone,omitempty"`
	StartDate           *string           `db:"start_date" json:"start_date,omitempty"` // YYYY-MM-DD
	EndDate             *string           `db:"end_date" json:"end_date,omitempty"`     // YYYY-MM-DD (exclusive)
	RRULE               *string           `db:"rrule" json:"rrule,omitempty"`
	EXDates             []string          `db:"exdates" json:"exdates,omitempty"`
	EXDatesAllDay       []string          `db:"exdates_all_day" json:"exdates_all_day,omitempty"`
	RecurringMasterID   *string           `db:"recurring_master_id" json:"recurring_master_id,omitempty"`
	OriginalStartTime   *time.Time        `db:"original_start_time" json:"original_start_time,omitempty"`
	OriginalStartDate   *string           `db:"original_start_date" json:"original_start_date,omitempty"`
	OrganizerJSON       []byte            `db:"organizer_json" json:"organizer_json,omitempty"`
	AttendeesJSON       []byte            `db:"attendees_json" json:"attendees_json,omitempty"`
	RemindersJSON       []byte            `db:"reminders_json" json:"reminders_json,omitempty"`
	SourceMailMessageID *string           `db:"source_mail_message_id" json:"source_mail_message_id,omitempty"`
	ETag                *string           `db:"etag" json:"etag,omitempty"`
	Version             int64             `db:"version" json:"version"`
	CreateTime          time.Time         `db:"create_time" json:"create_time"`
	UpdateTime          time.Time         `db:"update_time" json:"update_time"`
}

// Attendees deserializes attendees from JSON.
func (e *Event) Attendees() ([]Attendee, error) {
	if len(e.AttendeesJSON) == 0 {
		return nil, nil
	}
	var attendees []Attendee
	if err := json.Unmarshal(e.AttendeesJSON, &attendees); err != nil {
		return nil, errors.E(errors.Invalid, "unmarshal attendees: %v", err)
	}
	return attendees, nil
}

// SetAttendees serializes attendees into AttendeesJSON.
func (e *Event) SetAttendees(attendees []Attendee) error {
	if len(attendees) == 0 {
		e.AttendeesJSON = nil
		return nil
	}
	data, err := json.Marshal(attendees)
	if err != nil {
		return errors.E(errors.Invalid, "marshal attendees: %v", err)
	}
	e.AttendeesJSON = data
	return nil
}

// Organizer deserializes the organizer from JSON.
func (e *Event) Organizer() (*Organizer, error) {
	if len(e.OrganizerJSON) == 0 {
		return nil, nil
	}
	var org Organizer
	if err := json.Unmarshal(e.OrganizerJSON, &org); err != nil {
		return nil, errors.E(errors.Invalid, "unmarshal organizer: %v", err)
	}
	return &org, nil
}

// SetOrganizer serializes the organizer into OrganizerJSON.
func (e *Event) SetOrganizer(org *Organizer) error {
	if org == nil {
		e.OrganizerJSON = nil
		return nil
	}
	data, err := json.Marshal(org)
	if err != nil {
		return errors.E(errors.Invalid, "marshal organizer: %v", err)
	}
	e.OrganizerJSON = data
	return nil
}

// Reminders deserializes reminders from JSON.
func (e *Event) Reminders() ([]Reminder, error) {
	if len(e.RemindersJSON) == 0 {
		return nil, nil
	}
	var reminders []Reminder
	if err := json.Unmarshal(e.RemindersJSON, &reminders); err != nil {
		return nil, errors.E(errors.Invalid, "unmarshal reminders: %v", err)
	}
	return reminders, nil
}

// SetReminders serializes reminders into RemindersJSON.
func (e *Event) SetReminders(reminders []Reminder) error {
	if len(reminders) == 0 {
		e.RemindersJSON = nil
		return nil
	}
	data, err := json.Marshal(reminders)
	if err != nil {
		return errors.E(errors.Invalid, "marshal reminders: %v", err)
	}
	e.RemindersJSON = data
	return nil
}

// Validate enforces strict invariants between timed and all-day events.
func (e *Event) Validate() error {
	if e == nil {
		return errors.E(errors.Invalid, "event is required")
	}

	if e.ID != "" {
		if err := ValidateEventID(e.ID); err != nil {
			return errors.E(errors.Invalid, "invalid event ID: %v", err)
		}
	}

	if strings.TrimSpace(e.SpaceID) == "" {
		return errors.E(errors.Invalid, "space_id is required")
	}

	if strings.TrimSpace(e.CalendarID) == "" {
		return errors.E(errors.Invalid, "calendar_id is required")
	}

	if e.Status == "" {
		e.Status = EventStatusConfirmed
	}
	if !e.Status.IsValid() {
		return errors.E(errors.Invalid, "invalid status: %s", e.Status)
	}

	if e.Visibility == "" {
		e.Visibility = VisibilityDefault
	}
	if !e.Visibility.IsValid() {
		return errors.E(errors.Invalid, "invalid visibility: %s", e.Visibility)
	}

	if e.Transparency == "" {
		e.Transparency = TransparencyOpaque
	}
	if !e.Transparency.IsValid() {
		return errors.E(errors.Invalid, "invalid transparency: %s", e.Transparency)
	}

	if e.IsAllDay {
		// All-day event invariant
		if e.StartDate == nil || strings.TrimSpace(*e.StartDate) == "" {
			return errors.E(errors.Invalid, "all-day event requires start_date")
		}
		if e.EndDate == nil || strings.TrimSpace(*e.EndDate) == "" {
			return errors.E(errors.Invalid, "all-day event requires end_date")
		}
		if e.StartTime != nil || e.EndTime != nil {
			return errors.E(errors.Invalid, "all-day event must have nil start_time and end_time")
		}

		startD, err := time.Parse(time.DateOnly, *e.StartDate)
		if err != nil {
			return errors.E(errors.Invalid, "invalid start_date format (must be YYYY-MM-DD): %v", err)
		}
		endD, err := time.Parse(time.DateOnly, *e.EndDate)
		if err != nil {
			return errors.E(errors.Invalid, "invalid end_date format (must be YYYY-MM-DD): %v", err)
		}

		if !endD.After(startD) {
			return errors.E(errors.Invalid, "end_date must be strictly after start_date")
		}
	} else {
		// Timed event invariant
		if e.StartTime == nil {
			return errors.E(errors.Invalid, "timed event requires start_time")
		}
		if e.EndTime == nil {
			return errors.E(errors.Invalid, "timed event requires end_time")
		}
		if !e.EndTime.After(*e.StartTime) {
			return errors.E(errors.Invalid, "end_time must be strictly after start_time")
		}
		if e.Timezone == nil || strings.TrimSpace(*e.Timezone) == "" {
			return errors.E(errors.Invalid, "timed event requires valid IANA timezone")
		}
		if _, err := time.LoadLocation(*e.Timezone); err != nil {
			return errors.E(errors.Invalid, "invalid timezone: %s", *e.Timezone)
		}
		if e.StartDate != nil || e.EndDate != nil {
			return errors.E(errors.Invalid, "timed event must have nil start_date and end_date")
		}
	}

	return nil
}

// EventPatchSchema defines fields permitted in partial event updates.
var EventPatchSchema = patch.NewSchema[Event]().
	Field("title", func(e *Event) *string { return &e.Title }).
	Field("description", func(e *Event) **string { return &e.Description }).
	Field("location", func(e *Event) **string { return &e.Location }).
	Field("status", func(e *Event) *EventStatus { return &e.Status }).
	Field("visibility", func(e *Event) *EventVisibility { return &e.Visibility }).
	Field("transparency", func(e *Event) *EventTransparency { return &e.Transparency }).
	Field("conference_url", func(e *Event) **string { return &e.ConferenceURL }).
	Field("conference_provider", func(e *Event) **string { return &e.ConferenceProvider }).
	Field("is_all_day", func(e *Event) *bool { return &e.IsAllDay }).
	Field("start_time", func(e *Event) **time.Time { return &e.StartTime }).
	Field("end_time", func(e *Event) **time.Time { return &e.EndTime }).
	Field("timezone", func(e *Event) **string { return &e.Timezone }).
	Field("start_date", func(e *Event) **string { return &e.StartDate }).
	Field("end_date", func(e *Event) **string { return &e.EndDate }).
	Field("rrule", func(e *Event) **string { return &e.RRULE })

// ApplyPatch applies field-masked updates to the Event.
func (e *Event) ApplyPatch(incoming *Event, mask []string) error {
	if incoming == nil {
		return errors.E(errors.Invalid, "incoming event is required")
	}

	if err := EventPatchSchema.Apply(e, incoming, mask); err != nil {
		return errors.E(errors.Invalid, err)
	}

	e.UpdateTime = time.Now().UTC()
	return e.Validate()
}
