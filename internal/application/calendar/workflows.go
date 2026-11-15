package calendar

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"strings"
	"time"

	domaincalendar "github.com/masterkeysrd/saturn/internal/domain/calendar"
	"github.com/masterkeysrd/saturn/internal/domain/space"
	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/workflow"
)

// WorkflowDependencies provides services and stores needed by calendar workflow loaders and actions.
type WorkflowDependencies struct {
	Coordinator   Coordinator
	CalendarStore domaincalendar.CalendarStore
	EventStore    domaincalendar.EventStore
	DomainService *domaincalendar.Service
}

// ListCalendarsParams configures filtering for calendar.calendars.
type ListCalendarsParams struct {
	WritableOnly bool `json:"writable_only,omitempty" jsonschema:"When true, only return calendars where events can be created or modified"`
}

// CalendarSummary is the workflow-facing projection of a domaincalendar.Calendar.
type CalendarSummary struct {
	ID              string `json:"id"`
	Name            string `json:"name"`
	Source          string `json:"source"`
	Timezone        string `json:"timezone"`
	AccessRole      string `json:"access_role"`
	IsPrimary       bool   `json:"is_primary"`
	IsEnabled       bool   `json:"is_enabled"`
	IsDefaultNative bool   `json:"is_default_native"`
	CanWrite        bool   `json:"can_write"`
}

// ListEventsParams configures time-bounded occurrence queries for calendar.events.
type ListEventsParams struct {
	CalendarID string `json:"calendar_id,omitempty" jsonschema:"Target calendar ID or 'primary' (defaults to all enabled calendars)"`
	StartTime  string `json:"start_time" jsonschema:"Inclusive window start (RFC3339 or YYYY-MM-DD)"`
	EndTime    string `json:"end_time" jsonschema:"Exclusive window end (RFC3339 or YYYY-MM-DD)"`
	Query      string `json:"query,omitempty" jsonschema:"Optional case-insensitive substring match against title, description, or location"`
}

// EventSummary is the workflow-facing projection of a calendar event or expanded occurrence.
type EventSummary struct {
	ID          string  `json:"id"`
	MasterID    *string `json:"master_id,omitempty"`
	CalendarID  string  `json:"calendar_id"`
	Title       string  `json:"title"`
	Description *string `json:"description,omitempty"`
	Location    *string `json:"location,omitempty"`
	Status      string  `json:"status"`
	IsAllDay    bool    `json:"is_all_day"`
	StartTime   *string `json:"start_time,omitempty"`
	EndTime     *string `json:"end_time,omitempty"`
	Timezone    *string `json:"timezone,omitempty"`
	StartDate   *string `json:"start_date,omitempty"`
	EndDate     *string `json:"end_date,omitempty"`
	ICalUID     *string `json:"ical_uid,omitempty"`
}

// GetEventParams identifies a calendar event by ID or external_ref for calendar.event.
type GetEventParams struct {
	ID          string `json:"id,omitempty" jsonschema:"Exact calendar event ID"`
	ExternalRef string `json:"external_ref,omitempty" jsonschema:"Deterministic external reference used to derive iCalUID"`
	CalendarID  string `json:"calendar_id,omitempty" jsonschema:"Optional calendar ID hint when resolving external_ref"`
}

// UpsertEventInputs defines inputs for the calendar.upsert_event action step.
type UpsertEventInputs struct {
	ExternalRef         string                    `json:"external_ref,omitempty" jsonschema:"Optional idempotent reference used to derive a deterministic iCalUID"`
	CalendarID          string                    `json:"calendar_id" jsonschema:"Target calendar ID or 'primary'"`
	Title               string                    `json:"title" jsonschema:"Event title"`
	Description         string                    `json:"description,omitempty" jsonschema:"Optional event description"`
	Location            string                    `json:"location,omitempty" jsonschema:"Optional event location"`
	IsAllDay            bool                      `json:"is_all_day,omitempty" jsonschema:"True for all-day date-based events"`
	StartTime           string                    `json:"start_time,omitempty" jsonschema:"RFC3339 start timestamp for timed events"`
	EndTime             string                    `json:"end_time,omitempty" jsonschema:"RFC3339 end timestamp for timed events"`
	StartDate           string                    `json:"start_date,omitempty" jsonschema:"YYYY-MM-DD start date for all-day events"`
	EndDate             string                    `json:"end_date,omitempty" jsonschema:"YYYY-MM-DD exclusive end date for all-day events"`
	Timezone            string                    `json:"timezone,omitempty" jsonschema:"IANA timezone for timed events (defaults to space timezone)"`
	Reminders           []domaincalendar.Reminder `json:"reminders,omitempty" jsonschema:"Optional event alarm reminders"`
	SourceMailMessageID string                    `json:"source_mail_message_id,omitempty" jsonschema:"Optional originating mail message ID"`
}

// UpsertEventOutput defines outputs for calendar.upsert_event.
type UpsertEventOutput struct {
	EventID string `json:"event_id"`
	Created bool   `json:"created"`
}

// RegisterWorkflows registers calendar DataLoaders and Action Steps onto reg.
func RegisterWorkflows(reg *workflow.Registry, deps WorkflowDependencies) {
	registerCalendarLoaders(reg, deps)
	registerCalendarSteps(reg, deps)
}

func registerCalendarLoaders(reg *workflow.Registry, deps WorkflowDependencies) {
	reg.RegisterLoader(workflow.LoaderDescriptor{
		Name:        "calendar.calendars",
		Owner:       "calendar",
		DisplayName: "Calendars",
		Description: "Lists workspace calendars, optionally filtered to writable calendars only.",
	}, func(ctx context.Context, spaceID string, params ListCalendarsParams) ([]CalendarSummary, error) {
		cals, err := deps.CalendarStore.ListBySpace(ctx, spaceID, &domaincalendar.ListCalendarsFilter{})
		if err != nil {
			return nil, err
		}
		out := make([]CalendarSummary, 0, len(cals))
		for _, c := range cals {
			if params.WritableOnly && !c.CanWrite() {
				continue
			}
			out = append(out, CalendarSummary{
				ID:              c.ID,
				Name:            c.Name,
				Source:          string(c.Source),
				Timezone:        c.Timezone,
				AccessRole:      string(c.AccessRole),
				IsPrimary:       c.IsPrimary,
				IsEnabled:       c.IsEnabled,
				IsDefaultNative: c.IsDefaultNative,
				CanWrite:        c.CanWrite(),
			})
		}
		return out, nil
	})

	reg.RegisterLoader(workflow.LoaderDescriptor{
		Name:        "calendar.events",
		Owner:       "calendar",
		DisplayName: "Calendar Events",
		Description: "Queries expanded calendar occurrences in a time window, optionally filtered by calendar_id or search query.",
	}, func(ctx context.Context, spaceID string, params ListEventsParams) ([]EventSummary, error) {
		startTime, err := parseCalendarTime(params.StartTime)
		if err != nil {
			return nil, fmt.Errorf("invalid start_time: %w", err)
		}
		endTime, err := parseCalendarTime(params.EndTime)
		if err != nil {
			return nil, fmt.Errorf("invalid end_time: %w", err)
		}

		calIDs, err := resolveQueryCalendarIDs(ctx, deps.CalendarStore, spaceID, params.CalendarID)
		if err != nil {
			return nil, err
		}
		if len(calIDs) == 0 {
			return []EventSummary{}, nil
		}

		occs, err := deps.DomainService.GetOccurrences(ctx, spaceID, calIDs, startTime, endTime)
		if err != nil {
			return nil, err
		}

		q := strings.ToLower(strings.TrimSpace(params.Query))
		out := make([]EventSummary, 0, len(occs))
		for _, occ := range occs {
			if q != "" && !matchesEventQuery(occ, q) {
				continue
			}
			out = append(out, occurrenceToSummary(occ))
		}
		return out, nil
	})

	reg.RegisterLoader(workflow.LoaderDescriptor{
		Name:        "calendar.event",
		Owner:       "calendar",
		DisplayName: "Get Calendar Event",
		Description: "Retrieves a single calendar event by ID or deterministic external_ref.",
	}, func(ctx context.Context, spaceID string, params GetEventParams) (*EventSummary, error) {
		idStr := strings.TrimSpace(params.ID)
		if idStr != "" {
			ev, err := deps.EventStore.GetByID(ctx, spaceID, idStr)
			if err != nil {
				if errors.Is(err, errors.NotExist) {
					return nil, nil
				}
				return nil, err
			}
			if ev == nil {
				return nil, nil
			}
			summary := eventToSummary(ev)
			return &summary, nil
		}

		extRef := strings.TrimSpace(params.ExternalRef)
		if extRef == "" {
			return nil, nil
		}

		icalUID := deterministicICalUID(spaceID, extRef)
		calIDs, err := resolveQueryCalendarIDs(ctx, deps.CalendarStore, spaceID, params.CalendarID)
		if err != nil {
			return nil, err
		}
		for _, calID := range calIDs {
			ev, err := deps.EventStore.GetByICalUID(ctx, spaceID, calID, icalUID)
			if err != nil {
				if errors.Is(err, errors.NotExist) {
					continue
				}
				return nil, err
			}
			if ev != nil {
				summary := eventToSummary(ev)
				return &summary, nil
			}
		}
		return nil, nil
	})
}

func registerCalendarSteps(reg *workflow.Registry, deps WorkflowDependencies) {
	reg.RegisterStep(workflow.StepDescriptor{
		Type:                "calendar.upsert_event",
		Owner:               "calendar",
		Category:            "action",
		DisplayName:         "Upsert Calendar Event",
		Description:         "Creates or idempotently updates a calendar event keyed by a deterministic iCalUID derived from external_ref.",
		InvalidatesPrefixes: []string{"calendar."},
	}, func(ctx context.Context, execCtx *workflow.StepContext[UpsertEventInputs]) (UpsertEventOutput, error) {
		in := execCtx.Inputs
		title := strings.TrimSpace(in.Title)
		if title == "" {
			return UpsertEventOutput{}, fmt.Errorf("title is required")
		}

		scopedCtx := auth.WithSpaceScope(ctx, execCtx.SpaceID, string(space.RoleOwner))
		calID, calTZ, err := resolveTargetCalendar(scopedCtx, deps, execCtx.SpaceID, in.CalendarID)
		if err != nil {
			return UpsertEventOutput{}, err
		}

		ev := &domaincalendar.Event{
			SpaceID:      execCtx.SpaceID,
			CalendarID:   calID,
			Title:        title,
			Status:       domaincalendar.EventStatusConfirmed,
			Visibility:   domaincalendar.VisibilityDefault,
			Transparency: domaincalendar.TransparencyOpaque,
			IsAllDay:     in.IsAllDay,
		}
		if desc := strings.TrimSpace(in.Description); desc != "" {
			ev.Description = &desc
		}
		if loc := strings.TrimSpace(in.Location); loc != "" {
			ev.Location = &loc
		}
		if srcMailID := strings.TrimSpace(in.SourceMailMessageID); srcMailID != "" {
			ev.SourceMailMessageID = &srcMailID
		}
		if len(in.Reminders) > 0 {
			if err := ev.SetReminders(in.Reminders); err != nil {
				return UpsertEventOutput{}, err
			}
		}

		if in.IsAllDay {
			startDate := strings.TrimSpace(in.StartDate)
			if startDate == "" {
				return UpsertEventOutput{}, fmt.Errorf("all-day event requires start_date")
			}
			endDate := strings.TrimSpace(in.EndDate)
			if endDate == "" {
				parsed, parseErr := time.Parse(time.DateOnly, startDate)
				if parseErr != nil {
					return UpsertEventOutput{}, fmt.Errorf("invalid start_date %q: %w", startDate, parseErr)
				}
				endDate = parsed.AddDate(0, 0, 1).Format(time.DateOnly)
			}
			ev.StartDate = &startDate
			ev.EndDate = &endDate
		} else {
			tz := strings.TrimSpace(in.Timezone)
			if tz == "" && execCtx.State != nil {
				tz = strings.TrimSpace(execCtx.State.Space.Timezone)
			}
			if tz == "" {
				tz = calTZ
			}
			if tz == "" {
				tz = "UTC"
			}
			ev.Timezone = &tz

			startT, err := parseCalendarTime(in.StartTime)
			if err != nil {
				return UpsertEventOutput{}, fmt.Errorf("invalid start_time: %w", err)
			}
			var endT time.Time
			if strings.TrimSpace(in.EndTime) == "" {
				endT = startT.Add(time.Hour)
			} else {
				endT, err = parseCalendarTime(in.EndTime)
				if err != nil {
					return UpsertEventOutput{}, fmt.Errorf("invalid end_time: %w", err)
				}
			}
			ev.StartTime = &startT
			ev.EndTime = &endT
		}

		if extRef := strings.TrimSpace(in.ExternalRef); extRef != "" {
			icalUID := deterministicICalUID(execCtx.SpaceID, extRef)
			ev.ICalUID = &icalUID

			existing, err := deps.EventStore.GetByICalUID(scopedCtx, execCtx.SpaceID, calID, icalUID)
			if err != nil && !errors.Is(err, errors.NotExist) {
				return UpsertEventOutput{}, err
			}
			if existing != nil {
				updated, err := deps.Coordinator.UpdateEvent(scopedCtx, &UpdateEventRequest{
					ID:         existing.ID,
					Event:      ev,
					UpdateMask: buildEventPatchMask(ev),
					Scope:      domaincalendar.RecurrenceEditScopeAllEvents,
				})
				if err != nil {
					return UpsertEventOutput{}, err
				}
				return UpsertEventOutput{
					EventID: updated.ID,
					Created: false,
				}, nil
			}
		}

		created, err := deps.Coordinator.CreateEvent(scopedCtx, &CreateEventRequest{Event: ev})
		if err != nil {
			return UpsertEventOutput{}, err
		}
		return UpsertEventOutput{
			EventID: created.ID,
			Created: true,
		}, nil
	})
}

func deterministicICalUID(spaceID, externalRef string) string {
	sum := sha256.Sum256([]byte(spaceID + ":" + strings.TrimSpace(externalRef)))
	return "saturn-wf-" + hex.EncodeToString(sum[:16]) + "@saturn.local"
}

func resolveQueryCalendarIDs(ctx context.Context, store domaincalendar.CalendarStore, spaceID, calendarID string) ([]string, error) {
	calID := strings.TrimSpace(calendarID)
	if calID != "" && !strings.EqualFold(calID, "primary") {
		return []string{calID}, nil
	}
	cals, err := store.ListBySpace(ctx, spaceID, &domaincalendar.ListCalendarsFilter{EnabledOnly: true})
	if err != nil {
		return nil, err
	}
	if strings.EqualFold(calID, "primary") {
		for _, c := range cals {
			if c.IsPrimary || c.IsDefaultNative {
				return []string{c.ID}, nil
			}
		}
	}
	ids := make([]string, 0, len(cals))
	for _, c := range cals {
		ids = append(ids, c.ID)
	}
	return ids, nil
}

func resolveTargetCalendar(ctx context.Context, deps WorkflowDependencies, spaceID, calendarID string) (string, string, error) {
	calID := strings.TrimSpace(calendarID)
	if calID != "" && !strings.EqualFold(calID, "primary") {
		cal, err := deps.CalendarStore.GetByID(ctx, spaceID, calID)
		if err != nil {
			return "", "", err
		}
		return cal.ID, cal.Timezone, nil
	}

	if cal, err := deps.CalendarStore.GetDefaultNative(ctx, spaceID); err == nil && cal != nil && cal.CanWrite() {
		return cal.ID, cal.Timezone, nil
	}

	cals, err := deps.CalendarStore.ListBySpace(ctx, spaceID, &domaincalendar.ListCalendarsFilter{EnabledOnly: true})
	if err != nil {
		return "", "", err
	}
	for _, c := range cals {
		if c.IsPrimary && c.CanWrite() {
			return c.ID, c.Timezone, nil
		}
	}
	for _, c := range cals {
		if c.CanWrite() {
			return c.ID, c.Timezone, nil
		}
	}

	defCal, err := deps.Coordinator.EnsureDefaultCalendar(ctx, &EnsureDefaultCalendarRequest{SpaceID: spaceID})
	if err != nil {
		return "", "", err
	}
	return defCal.ID, defCal.Timezone, nil
}

func buildEventPatchMask(ev *domaincalendar.Event) []string {
	mask := []string{"title", "is_all_day"}
	if ev.Description != nil {
		mask = append(mask, "description")
	}
	if ev.Location != nil {
		mask = append(mask, "location")
	}
	if ev.IsAllDay {
		mask = append(mask, "start_date", "end_date")
	} else {
		mask = append(mask, "start_time", "end_time", "timezone")
	}
	return mask
}

func parseCalendarTime(raw string) (time.Time, error) {
	s := strings.TrimSpace(raw)
	if s == "" {
		return time.Time{}, fmt.Errorf("timestamp is required")
	}
	if t, err := time.Parse(time.RFC3339Nano, s); err == nil {
		return t, nil
	}
	if t, err := time.Parse(time.RFC3339, s); err == nil {
		return t, nil
	}
	if t, err := time.Parse(time.DateOnly, s); err == nil {
		return t, nil
	}
	return time.Time{}, fmt.Errorf("unsupported time format %q (expected RFC3339 or YYYY-MM-DD)", raw)
}

func matchesEventQuery(occ *domaincalendar.EventOccurrence, q string) bool {
	if strings.Contains(strings.ToLower(occ.Title), q) {
		return true
	}
	if occ.Description != nil && strings.Contains(strings.ToLower(*occ.Description), q) {
		return true
	}
	if occ.Location != nil && strings.Contains(strings.ToLower(*occ.Location), q) {
		return true
	}
	return false
}

func occurrenceToSummary(occ *domaincalendar.EventOccurrence) EventSummary {
	s := EventSummary{
		ID:          occ.EventID,
		MasterID:    occ.MasterID,
		CalendarID:  occ.CalendarID,
		Title:       occ.Title,
		Description: occ.Description,
		Location:    occ.Location,
		Status:      string(occ.Status),
		IsAllDay:    occ.IsAllDay,
		Timezone:    occ.Timezone,
		StartDate:   occ.StartDate,
		EndDate:     occ.EndDate,
	}
	if occ.StartTime != nil {
		s.StartTime = new(occ.StartTime.UTC().Format(time.RFC3339))
	}
	if occ.EndTime != nil {
		s.EndTime = new(occ.EndTime.UTC().Format(time.RFC3339))
	}
	return s
}

func eventToSummary(ev *domaincalendar.Event) EventSummary {
	s := EventSummary{
		ID:          ev.ID,
		MasterID:    ev.RecurringMasterID,
		CalendarID:  ev.CalendarID,
		Title:       ev.Title,
		Description: ev.Description,
		Location:    ev.Location,
		Status:      string(ev.Status),
		IsAllDay:    ev.IsAllDay,
		Timezone:    ev.Timezone,
		StartDate:   ev.StartDate,
		EndDate:     ev.EndDate,
		ICalUID:     ev.ICalUID,
	}
	if ev.StartTime != nil {
		s.StartTime = new(ev.StartTime.UTC().Format(time.RFC3339))
	}
	if ev.EndTime != nil {
		s.EndTime = new(ev.EndTime.UTC().Format(time.RFC3339))
	}
	return s
}
