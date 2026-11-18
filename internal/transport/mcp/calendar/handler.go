package mcpcalendar

//go:generate go run github.com/masterkeysrd/saturn/tools/mockgen .

import (
	"context"
	"strings"
	"time"

	calendaraggregator "github.com/masterkeysrd/saturn/internal/aggregator/calendar"
	calendarapp "github.com/masterkeysrd/saturn/internal/application/calendar"
	spaceapp "github.com/masterkeysrd/saturn/internal/application/space"
	domaincalendar "github.com/masterkeysrd/saturn/internal/domain/calendar"
	"github.com/masterkeysrd/saturn/internal/domain/identity"
	"github.com/masterkeysrd/saturn/internal/domain/space"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/settings"
	mcptransport "github.com/masterkeysrd/saturn/internal/transport/mcp"
)

const (
	defaultEventsLimit = 50
	maxEventsLimit     = 100
)

// CalendarAggregator defines read-only calendar and occurrence queries.
// @Mock
type CalendarAggregator interface {
	ListCalendars(ctx context.Context, spaceID string) ([]*domaincalendar.Calendar, error)
	ListEvents(ctx context.Context, spaceID string, calendarIDs []string, timeMin, timeMax time.Time, query string) ([]*calendaraggregator.OccurrenceProjection, error)
}

// CalendarCoordinator defines calendar event write operations.
// @Mock
type CalendarCoordinator interface {
	CreateEvent(ctx context.Context, req *calendarapp.CreateEventRequest) (*domaincalendar.Event, error)
	UpdateEvent(ctx context.Context, req *calendarapp.UpdateEventRequest) (*domaincalendar.Event, error)
	DeleteEvent(ctx context.Context, req *calendarapp.DeleteEventRequest) error
	RespondToEvent(ctx context.Context, req *calendarapp.RespondToEventRequest) (*domaincalendar.Event, error)
}

// SpaceSettingsReader retrieves the workspace IANA timezone.
// @Mock
type SpaceSettingsReader interface {
	GetSettings(ctx context.Context, req *spaceapp.GetSettingsRequest) (*settings.Entry[space.Settings], error)
}

// Dependencies holds the collaborators required by the calendar MCP handler.
type Dependencies struct {
	Aggregator    CalendarAggregator
	Coordinator   CalendarCoordinator
	SpaceSettings SpaceSettingsReader
}

// Handler adapts calendar operations into MCP tools.
type Handler struct {
	agg           CalendarAggregator
	coord         CalendarCoordinator
	spaceSettings SpaceSettingsReader
}

// NewHandler constructs a new calendar MCP Handler.
func NewHandler(deps Dependencies) *Handler {
	return &Handler{
		agg:           deps.Aggregator,
		coord:         deps.Coordinator,
		spaceSettings: deps.SpaceSettings,
	}
}

// Register registers calendar MCP tools onto the registry.
func (h *Handler) Register(reg *mcptransport.Registry) {
	reg.RegisterTool(mcptransport.ToolSpec{
		Name:          "calendar_list_calendars",
		Domain:        "calendar",
		Title:         "List Calendars",
		Description:   "Lists calendars in the workspace along with source, timezone, primary status, and write capability.",
		RequiredScope: identity.ScopeCalendarRead,
		ReadOnly:      true,
	}, h.listCalendars)

	reg.RegisterTool(mcptransport.ToolSpec{
		Name:          "calendar_list_events",
		Domain:        "calendar",
		Title:         "List Calendar Events",
		Description:   "Lists calendar event occurrences in a time window (defaults to the next 7 days in workspace timezone).",
		RequiredScope: identity.ScopeCalendarRead,
		ReadOnly:      true,
	}, h.listEvents)

	reg.RegisterTool(mcptransport.ToolSpec{
		Name:          "calendar_create_event",
		Domain:        "calendar",
		Title:         "Create Calendar Event",
		Description:   "Creates a timed or all-day event on a writable workspace calendar.",
		RequiredScope: identity.ScopeCalendarWrite,
		ReadOnly:      false,
		Destructive:   false,
	}, h.createEvent)

	reg.RegisterTool(mcptransport.ToolSpec{
		Name:          "calendar_update_event",
		Domain:        "calendar",
		Title:         "Update Calendar Event",
		Description:   "Updates properties (title, description, location, times/dates) of an existing calendar event.",
		RequiredScope: identity.ScopeCalendarWrite,
		ReadOnly:      false,
		Destructive:   false,
	}, h.updateEvent)

	reg.RegisterTool(mcptransport.ToolSpec{
		Name:          "calendar_delete_event",
		Domain:        "calendar",
		Title:         "Delete Calendar Event",
		Description:   "Deletes a calendar event (or a single/following recurrence instance).",
		RequiredScope: identity.ScopeCalendarWrite,
		ReadOnly:      false,
		Destructive:   true,
	}, h.deleteEvent)

	reg.RegisterTool(mcptransport.ToolSpec{
		Name:          "calendar_respond_to_event",
		Domain:        "calendar",
		Title:         "Respond to Calendar Event",
		Description:   "Updates the caller's RSVP response status ('accepted', 'tentative', or 'declined') for a calendar event.",
		RequiredScope: identity.ScopeCalendarWrite,
		ReadOnly:      false,
		Destructive:   false,
	}, h.respondToEvent)
}

// ListCalendarsInput is an empty input object for calendar_list_calendars.
type ListCalendarsInput struct{}

// CalendarItem summarizes a workspace calendar.
type CalendarItem struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Source    string `json:"source"`
	Timezone  string `json:"timezone"`
	IsPrimary bool   `json:"is_primary"`
	IsEnabled bool   `json:"is_enabled"`
	CanWrite  bool   `json:"can_write"`
}

// ListCalendarsOutput is returned by calendar_list_calendars.
type ListCalendarsOutput struct {
	Calendars []CalendarItem `json:"calendars"`
}

func (h *Handler) listCalendars(ctx context.Context, _ ListCalendarsInput) (ListCalendarsOutput, error) {
	spaceID, err := mcptransport.RequireSpaceID(ctx)
	if err != nil {
		return ListCalendarsOutput{}, err
	}

	cals, err := h.agg.ListCalendars(ctx, spaceID)
	if err != nil {
		return ListCalendarsOutput{}, err
	}

	items := make([]CalendarItem, 0, len(cals))
	for _, c := range cals {
		items = append(items, CalendarItem{
			ID:        c.ID,
			Name:      c.Name,
			Source:    string(c.Source),
			Timezone:  c.Timezone,
			IsPrimary: c.IsPrimary,
			IsEnabled: c.IsEnabled,
			CanWrite:  c.CanWrite(),
		})
	}

	return ListCalendarsOutput{Calendars: items}, nil
}

// ListEventsInput defines parameters for calendar_list_events.
type ListEventsInput struct {
	CalendarIDs []string `json:"calendar_ids,omitempty" jsonschema:"Optional calendar IDs to filter by"`
	TimeMin     string   `json:"time_min,omitempty" jsonschema:"Window start (RFC3339 or YYYY-MM-DD); defaults to start of today in workspace timezone"`
	TimeMax     string   `json:"time_max,omitempty" jsonschema:"Window end (RFC3339 or YYYY-MM-DD); defaults to +7 days from time_min"`
	Query       string   `json:"query,omitempty" jsonschema:"Optional text filter against title, description, or location"`
	Limit       int      `json:"limit,omitempty" jsonschema:"Maximum occurrences to return (1-100, default 50)"`
}

// EventOccurrenceItem summarizes a localized calendar occurrence.
type EventOccurrenceItem struct {
	EventID      string `json:"event_id"`
	CalendarID   string `json:"calendar_id"`
	CalendarName string `json:"calendar_name,omitempty"`
	Title        string `json:"title"`
	Description  string `json:"description,omitempty"`
	Location     string `json:"location,omitempty"`
	IsAllDay     bool   `json:"is_all_day"`
	StartTime    string `json:"start_time,omitempty"`
	EndTime      string `json:"end_time,omitempty"`
	StartDate    string `json:"start_date,omitempty"`
	EndDate      string `json:"end_date,omitempty"`
	Timezone     string `json:"timezone"`
	Status       string `json:"status"`
}

// ListEventsOutput is returned by calendar_list_events.
type ListEventsOutput struct {
	WorkspaceTimezone string                `json:"workspace_timezone"`
	Events            []EventOccurrenceItem `json:"events"`
	Truncated         bool                  `json:"truncated"`
}

func (h *Handler) listEvents(ctx context.Context, in ListEventsInput) (ListEventsOutput, error) {
	spaceID, err := mcptransport.RequireSpaceID(ctx)
	if err != nil {
		return ListEventsOutput{}, err
	}

	loc := mcptransport.ResolveLocation(ctx, h.spaceSettings.GetSettings, spaceID)
	now := time.Now().In(loc)

	timeMin := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, loc)
	if t, err := mcptransport.ParseOptionalTime(in.TimeMin, "time_min", loc); err != nil {
		return ListEventsOutput{}, err
	} else if t != nil {
		timeMin = *t
	}

	timeMax := timeMin.AddDate(0, 0, 7)
	if t, err := mcptransport.ParseOptionalTime(in.TimeMax, "time_max", loc); err != nil {
		return ListEventsOutput{}, err
	} else if t != nil {
		timeMax = *t
	}

	occs, err := h.agg.ListEvents(ctx, spaceID, in.CalendarIDs, timeMin, timeMax, strings.TrimSpace(in.Query))
	if err != nil {
		return ListEventsOutput{}, err
	}

	limit := mcptransport.ClampLimit(in.Limit, defaultEventsLimit, maxEventsLimit)

	truncated := len(occs) > limit
	if truncated {
		occs = occs[:limit]
	}

	items := make([]EventOccurrenceItem, 0, len(occs))
	for _, occ := range occs {
		item := EventOccurrenceItem{
			EventID:      occ.EventID,
			CalendarID:   occ.CalendarID,
			CalendarName: occ.CalendarName,
			Title:        occ.Title,
			Description:  occ.Description,
			Location:     occ.Location,
			IsAllDay:     occ.IsAllDay,
			Timezone:     occ.Timezone,
			Status:       string(occ.Status),
		}
		if occ.StartTime != nil {
			item.StartTime = occ.StartTime.In(loc).Format(time.RFC3339)
		}
		if occ.EndTime != nil {
			item.EndTime = occ.EndTime.In(loc).Format(time.RFC3339)
		}
		if occ.StartDate != nil {
			item.StartDate = *occ.StartDate
		}
		if occ.EndDate != nil {
			item.EndDate = *occ.EndDate
		}
		items = append(items, item)
	}

	return ListEventsOutput{
		WorkspaceTimezone: loc.String(),
		Events:            items,
		Truncated:         truncated,
	}, nil
}

// CreateEventInput defines parameters for calendar_create_event.
type CreateEventInput struct {
	CalendarID  string `json:"calendar_id" jsonschema:"Target writable calendar ID"`
	Title       string `json:"title" jsonschema:"Event title"`
	Description string `json:"description,omitempty" jsonschema:"Optional event description"`
	Location    string `json:"location,omitempty" jsonschema:"Optional event location"`
	IsAllDay    bool   `json:"is_all_day,omitempty" jsonschema:"Whether this is an all-day event"`
	StartTime   string `json:"start_time,omitempty" jsonschema:"Timed event start (RFC3339)"`
	EndTime     string `json:"end_time,omitempty" jsonschema:"Timed event end (RFC3339)"`
	StartDate   string `json:"start_date,omitempty" jsonschema:"All-day start date (YYYY-MM-DD)"`
	EndDate     string `json:"end_date,omitempty" jsonschema:"All-day exclusive end date (YYYY-MM-DD)"`
	Timezone    string `json:"timezone,omitempty" jsonschema:"Optional IANA timezone (defaults to workspace timezone)"`
}

// EventOutput summarizes a created or updated calendar event.
type EventOutput struct {
	ID         string `json:"id"`
	CalendarID string `json:"calendar_id"`
	Title      string `json:"title"`
	IsAllDay   bool   `json:"is_all_day"`
	StartTime  string `json:"start_time,omitempty"`
	EndTime    string `json:"end_time,omitempty"`
	StartDate  string `json:"start_date,omitempty"`
	EndDate    string `json:"end_date,omitempty"`
	Timezone   string `json:"timezone,omitempty"`
}

func (h *Handler) createEvent(ctx context.Context, in CreateEventInput) (EventOutput, error) {
	spaceID, err := mcptransport.RequireSpaceID(ctx)
	if err != nil {
		return EventOutput{}, err
	}
	if strings.TrimSpace(in.CalendarID) == "" || strings.TrimSpace(in.Title) == "" {
		return EventOutput{}, errors.E(errors.Invalid, "calendar_id and title are required")
	}

	loc := mcptransport.ResolveLocation(ctx, h.spaceSettings.GetSettings, spaceID)
	tz := strings.TrimSpace(in.Timezone)
	if tz == "" {
		tz = loc.String()
	}

	ev := &domaincalendar.Event{
		CalendarID: strings.TrimSpace(in.CalendarID),
		Title:      strings.TrimSpace(in.Title),
		IsAllDay:   in.IsAllDay,
		Timezone:   new(tz),
		Status:     domaincalendar.EventStatusConfirmed,
	}
	if d := strings.TrimSpace(in.Description); d != "" {
		ev.Description = new(d)
	}
	if l := strings.TrimSpace(in.Location); l != "" {
		ev.Location = new(l)
	}

	if in.IsAllDay {
		sd := strings.TrimSpace(in.StartDate)
		ed := strings.TrimSpace(in.EndDate)
		if sd == "" {
			return EventOutput{}, errors.E(errors.Invalid, "start_date is required for all-day events")
		}
		if ed == "" {
			ed = sd
		}
		ev.StartDate = new(sd)
		ev.EndDate = new(ed)
	} else {
		st, err := mcptransport.ParseTimeInLocation(in.StartTime, "start_time", loc)
		if err != nil {
			return EventOutput{}, err
		}
		et, err := mcptransport.ParseTimeInLocation(in.EndTime, "end_time", loc)
		if err != nil {
			return EventOutput{}, err
		}
		ev.StartTime = new(st)
		ev.EndTime = new(et)
	}

	created, err := h.coord.CreateEvent(ctx, &calendarapp.CreateEventRequest{Event: ev})
	if err != nil {
		return EventOutput{}, err
	}

	return toEventOutput(created, loc), nil
}

// UpdateEventInput defines parameters for calendar_update_event.
type UpdateEventInput struct {
	ID          string  `json:"id" jsonschema:"Event ID to update"`
	Title       *string `json:"title,omitempty" jsonschema:"Updated title"`
	Description *string `json:"description,omitempty" jsonschema:"Updated description"`
	Location    *string `json:"location,omitempty" jsonschema:"Updated location"`
	StartTime   *string `json:"start_time,omitempty" jsonschema:"Updated start time (RFC3339)"`
	EndTime     *string `json:"end_time,omitempty" jsonschema:"Updated end time (RFC3339)"`
	StartDate   *string `json:"start_date,omitempty" jsonschema:"Updated all-day start date (YYYY-MM-DD)"`
	EndDate     *string `json:"end_date,omitempty" jsonschema:"Updated all-day end date (YYYY-MM-DD)"`
	Timezone    *string `json:"timezone,omitempty" jsonschema:"Updated IANA timezone"`
}

func (h *Handler) updateEvent(ctx context.Context, in UpdateEventInput) (EventOutput, error) {
	spaceID, err := mcptransport.RequireSpaceID(ctx)
	if err != nil {
		return EventOutput{}, err
	}
	if strings.TrimSpace(in.ID) == "" {
		return EventOutput{}, errors.E(errors.Invalid, "event id is required")
	}

	loc := mcptransport.ResolveLocation(ctx, h.spaceSettings.GetSettings, spaceID)
	ev := &domaincalendar.Event{}
	var mask []string

	if in.Title != nil {
		ev.Title = strings.TrimSpace(*in.Title)
		mask = append(mask, "title")
	}
	if in.Description != nil {
		ev.Description = new(strings.TrimSpace(*in.Description))
		mask = append(mask, "description")
	}
	if in.Location != nil {
		ev.Location = new(strings.TrimSpace(*in.Location))
		mask = append(mask, "location")
	}
	if in.Timezone != nil {
		ev.Timezone = new(strings.TrimSpace(*in.Timezone))
		mask = append(mask, "timezone")
	}
	if in.StartTime != nil {
		t, pErr := mcptransport.ParseTimeInLocation(*in.StartTime, "start_time", loc)
		if pErr != nil {
			return EventOutput{}, pErr
		}
		ev.StartTime = new(t)
		mask = append(mask, "start_time")
	}
	if in.EndTime != nil {
		t, pErr := mcptransport.ParseTimeInLocation(*in.EndTime, "end_time", loc)
		if pErr != nil {
			return EventOutput{}, pErr
		}
		ev.EndTime = new(t)
		mask = append(mask, "end_time")
	}
	if in.StartDate != nil {
		ev.StartDate = new(strings.TrimSpace(*in.StartDate))
		mask = append(mask, "start_date")
	}
	if in.EndDate != nil {
		ev.EndDate = new(strings.TrimSpace(*in.EndDate))
		mask = append(mask, "end_date")
	}
	if len(mask) == 0 {
		return EventOutput{}, errors.E(errors.Invalid, "at least one field to update must be provided")
	}

	updated, err := h.coord.UpdateEvent(ctx, &calendarapp.UpdateEventRequest{
		ID:         strings.TrimSpace(in.ID),
		Event:      ev,
		UpdateMask: mask,
	})
	if err != nil {
		return EventOutput{}, err
	}

	return toEventOutput(updated, loc), nil
}

// DeleteEventInput defines parameters for calendar_delete_event.
type DeleteEventInput struct {
	ID    string `json:"id" jsonschema:"Event ID to delete"`
	Scope string `json:"scope,omitempty" jsonschema:"Optional recurrence edit scope ('THIS_EVENT', 'THIS_AND_FOLLOWING', 'ALL_EVENTS')"`
}

// DeleteEventOutput confirms event deletion.
type DeleteEventOutput struct {
	Deleted bool   `json:"deleted"`
	ID      string `json:"id"`
}

func (h *Handler) deleteEvent(ctx context.Context, in DeleteEventInput) (DeleteEventOutput, error) {
	if _, err := mcptransport.RequireSpaceID(ctx); err != nil {
		return DeleteEventOutput{}, err
	}
	id := strings.TrimSpace(in.ID)
	if id == "" {
		return DeleteEventOutput{}, errors.E(errors.Invalid, "event id is required")
	}

	err := h.coord.DeleteEvent(ctx, &calendarapp.DeleteEventRequest{
		ID:    id,
		Scope: domaincalendar.RecurrenceEditScope(strings.TrimSpace(in.Scope)),
	})
	if err != nil {
		return DeleteEventOutput{}, err
	}

	return DeleteEventOutput{Deleted: true, ID: id}, nil
}

// RespondToEventInput defines parameters for calendar_respond_to_event.
type RespondToEventInput struct {
	ID             string `json:"id" jsonschema:"Calendar event ID (cev_...) to respond to"`
	ResponseStatus string `json:"response_status" jsonschema:"RSVP status: 'accepted', 'tentative', or 'declined'"`
}

// RespondToEventOutput confirms the updated event RSVP status.
type RespondToEventOutput struct {
	ID             string `json:"id"`
	Title          string `json:"title"`
	ResponseStatus string `json:"response_status"`
}

func (h *Handler) respondToEvent(ctx context.Context, in RespondToEventInput) (RespondToEventOutput, error) {
	if _, err := mcptransport.RequireSpaceID(ctx); err != nil {
		return RespondToEventOutput{}, err
	}
	id := strings.TrimSpace(in.ID)
	if id == "" {
		return RespondToEventOutput{}, errors.E(errors.Invalid, "event id is required")
	}

	status := strings.ToLower(strings.TrimSpace(in.ResponseStatus))
	switch status {
	case "accepted", "tentative", "declined":
	default:
		return RespondToEventOutput{}, errors.E(errors.Invalid, "response_status must be 'accepted', 'tentative', or 'declined'")
	}

	ev, err := h.coord.RespondToEvent(ctx, &calendarapp.RespondToEventRequest{
		ID:             id,
		ResponseStatus: status,
	})
	if err != nil {
		return RespondToEventOutput{}, err
	}

	return RespondToEventOutput{
		ID:             ev.ID,
		Title:          ev.Title,
		ResponseStatus: status,
	}, nil
}

func toEventOutput(ev *domaincalendar.Event, loc *time.Location) EventOutput {
	out := EventOutput{
		ID:         ev.ID,
		CalendarID: ev.CalendarID,
		Title:      ev.Title,
		IsAllDay:   ev.IsAllDay,
	}
	if ev.Timezone != nil {
		out.Timezone = *ev.Timezone
	}
	if ev.StartTime != nil {
		out.StartTime = ev.StartTime.In(loc).Format(time.RFC3339)
	}
	if ev.EndTime != nil {
		out.EndTime = ev.EndTime.In(loc).Format(time.RFC3339)
	}
	if ev.StartDate != nil {
		out.StartDate = *ev.StartDate
	}
	if ev.EndDate != nil {
		out.EndDate = *ev.EndDate
	}
	return out
}
