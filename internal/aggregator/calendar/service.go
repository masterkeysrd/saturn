package calendaraggregator

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"

	domaincalendar "github.com/masterkeysrd/saturn/internal/domain/calendar"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"golang.org/x/sync/errgroup"
)

// Service provides aggregated, read-only multi-entity calendar projections and occurrence expansion.
type Service struct {
	calendarReader  CalendarReader
	eventReader     EventReader
	accountReader   ConnectedAccountReader
	timelineSources []TimelineSource
}

// NewService instantiates a new Calendar Aggregator Service.
func NewService(
	calendarReader CalendarReader,
	eventReader EventReader,
	accountReader ConnectedAccountReader,
	timelineSources ...TimelineSource,
) *Service {
	return &Service{
		calendarReader:  calendarReader,
		eventReader:     eventReader,
		accountReader:   accountReader,
		timelineSources: timelineSources,
	}
}

// GetCalendar retrieves a single calendar by space ID and calendar ID.
func (s *Service) GetCalendar(ctx context.Context, spaceID, id string) (*domaincalendar.Calendar, error) {
	const op errors.Op = "aggregator/calendar.GetCalendar"

	cal, err := s.calendarReader.GetByID(ctx, spaceID, id)
	if err != nil {
		return nil, errors.E(op, err)
	}
	return cal, nil
}

// ListCalendars retrieves all calendars belonging to the workspace.
func (s *Service) ListCalendars(ctx context.Context, spaceID string) ([]*domaincalendar.Calendar, error) {
	const op errors.Op = "aggregator/calendar.ListCalendars"

	cals, err := s.calendarReader.ListBySpace(ctx, spaceID, nil)
	if err != nil {
		return nil, errors.E(op, err)
	}
	return cals, nil
}

// GetEvent retrieves a single event by space ID and event ID.
func (s *Service) GetEvent(ctx context.Context, spaceID, id string) (*domaincalendar.Event, error) {
	const op errors.Op = "aggregator/calendar.GetEvent"

	ev, err := s.eventReader.GetByID(ctx, spaceID, id)
	if err != nil {
		return nil, errors.E(op, err)
	}
	return ev, nil
}

// ListEvents fetches, expands, and aggregates occurrences for the viewport across target calendars.
func (s *Service) ListEvents(
	ctx context.Context,
	spaceID string,
	calendarIDs []string,
	timeMin, timeMax time.Time,
	query string,
) ([]*OccurrenceProjection, error) {
	const op errors.Op = "aggregator/calendar.ListEvents"

	if timeMax.Before(timeMin) {
		return nil, errors.E(op, errors.Invalid, "time_max cannot be before time_min")
	}

	// 1. Resolve calendars to include
	targetCalendarIDs := calendarIDs
	calendarMap := make(map[string]*domaincalendar.Calendar)

	if len(targetCalendarIDs) == 0 {
		cals, err := s.calendarReader.ListBySpace(ctx, spaceID, &domaincalendar.ListCalendarsFilter{
			EnabledOnly: true,
		})
		if err != nil {
			return nil, errors.E(op, err)
		}
		for _, c := range cals {
			targetCalendarIDs = append(targetCalendarIDs, c.ID)
			calendarMap[c.ID] = c
		}
	} else {
		// Populate map for the specified calendar IDs
		cals, err := s.calendarReader.ListBySpace(ctx, spaceID, nil)
		if err != nil {
			return nil, errors.E(op, err)
		}
		for _, c := range cals {
			calendarMap[c.ID] = c
		}
	}

	if len(targetCalendarIDs) == 0 {
		return []*OccurrenceProjection{}, nil
	}

	// Format date boundary strings for all-day event intersection
	startDateStr := timeMin.Format("2006-01-02")
	endDateStr := timeMax.AddDate(0, 0, 1).Format("2006-01-02")

	// 2. Parallel hydration using errgroup
	g, gCtx := errgroup.WithContext(ctx)

	var standaloneEvents []*domaincalendar.Event
	var recurringMasters []*domaincalendar.Event
	var virtualItems []VirtualOccurrence

	// Query 1: Standalone single events and exception overrides overlapping the time interval
	g.Go(func() error {
		items, err := s.eventReader.ListInTimeRange(
			gCtx,
			spaceID,
			targetCalendarIDs,
			timeMin,
			timeMax,
			startDateStr,
			endDateStr,
		)
		if err != nil {
			return err
		}
		standaloneEvents = items
		return nil
	})

	// Query 2: Recurring master definitions
	g.Go(func() error {
		masters, err := s.eventReader.ListRecurringMasters(gCtx, spaceID, targetCalendarIDs)
		if err != nil {
			return err
		}
		recurringMasters = masters
		return nil
	})

	// Query 3: Virtual timeline sources (e.g. bills, subscriptions)
	for _, source := range s.timelineSources {
		src := source
		g.Go(func() error {
			items, err := src.FetchOccurrences(gCtx, spaceID, timeMin, timeMax)
			if err != nil {
				return err
			}
			virtualItems = append(virtualItems, items...)
			return nil
		})
	}

	if err := g.Wait(); err != nil {
		return nil, errors.E(op, err)
	}

	// 3. Expand occurrences for recurring masters
	var expandedOccurrences []*domaincalendar.EventOccurrence
	if len(recurringMasters) > 0 {
		masterIDs := make([]string, 0, len(recurringMasters))
		for _, m := range recurringMasters {
			masterIDs = append(masterIDs, m.ID)
		}

		exceptions, err := s.eventReader.ListExceptionsByMasterIDs(ctx, spaceID, masterIDs)
		if err != nil {
			return nil, errors.E(op, err)
		}

		expandedOccurrences = domaincalendar.ExpandOccurrences(recurringMasters, exceptions, timeMin, timeMax)
	}

	// 4. Combine and project all occurrences
	totalCount := len(standaloneEvents) + len(expandedOccurrences) + len(virtualItems)
	allOccurrences := make([]*OccurrenceProjection, 0, totalCount)

	// Add standalone non-recurring events
	for _, ev := range standaloneEvents {
		// Skip recurring masters (they are expanded separately below)
		if ev.RRULE != nil && strings.TrimSpace(*ev.RRULE) != "" {
			continue
		}
		// Skip exception instances here as ExpandOccurrences already incorporates them into recurrence
		if ev.RecurringMasterID != nil && *ev.RecurringMasterID != "" {
			continue
		}

		occ := mapEventToProjection(ev)
		allOccurrences = append(allOccurrences, occ)
	}

	// Add expanded recurring occurrences
	for _, occ := range expandedOccurrences {
		allOccurrences = append(allOccurrences, mapDomainOccurrenceToProjection(occ))
	}

	// Add virtual timeline overlays
	for _, v := range virtualItems {
		occ := mapVirtualToProjection(v)
		allOccurrences = append(allOccurrences, occ)
	}

	// 5. Hydrate calendar metadata (Color, CalendarName)
	for _, occ := range allOccurrences {
		if cal, ok := calendarMap[occ.CalendarID]; ok {
			if occ.Color == "" && cal.Color != nil {
				occ.Color = *cal.Color
			}
			if occ.CalendarName == "" {
				occ.CalendarName = cal.Name
			}
		}
		if occ.Color == "" {
			occ.Color = "#3b82f6"
		}
	}

	// 6. Apply search query filter if provided
	if query != "" {
		filtered := make([]*OccurrenceProjection, 0, len(allOccurrences))
		q := strings.ToLower(strings.TrimSpace(query))
		for _, occ := range allOccurrences {
			if strings.Contains(strings.ToLower(occ.Title), q) ||
				strings.Contains(strings.ToLower(occ.Description), q) ||
				strings.Contains(strings.ToLower(occ.Location), q) {
				filtered = append(filtered, occ)
			}
		}
		allOccurrences = filtered
	}

	// 7. Sort chronologically
	sort.Slice(allOccurrences, func(i, j int) bool {
		tI := projectionStartInstant(allOccurrences[i])
		tJ := projectionStartInstant(allOccurrences[j])
		return tI.Before(tJ)
	})

	return allOccurrences, nil
}

// Occurrence conversion helpers

func mapEventToProjection(ev *domaincalendar.Event) *OccurrenceProjection {
	desc := ""
	if ev.Description != nil {
		desc = *ev.Description
	}
	loc := ""
	if ev.Location != nil {
		loc = *ev.Location
	}
	conf := ""
	if ev.ConferenceURL != nil {
		conf = *ev.ConferenceURL
	}
	tz := "UTC"
	if ev.Timezone != nil {
		tz = *ev.Timezone
	}

	org, _ := ev.Organizer()
	atts, _ := ev.Attendees()
	rems, _ := ev.Reminders()

	return &OccurrenceProjection{
		EventID:     ev.ID,
		CalendarID:  ev.CalendarID,
		InstanceID:  ev.ID,
		Title:       ev.Title,
		Description: desc,
		Location:    loc,
		IsAllDay:    ev.IsAllDay,
		StartTime:   ev.StartTime,
		EndTime:     ev.EndTime,
		StartDate:   ev.StartDate,
		EndDate:     ev.EndDate,
		Timezone:    tz,
		Status:      ev.Status,
		MeetURL:     conf,
		Organizer:   org,
		Attendees:   atts,
		Reminders:   rems,
	}
}

func mapDomainOccurrenceToProjection(occ *domaincalendar.EventOccurrence) *OccurrenceProjection {
	desc := ""
	if occ.Description != nil {
		desc = *occ.Description
	}
	loc := ""
	if occ.Location != nil {
		loc = *occ.Location
	}
	tz := "UTC"
	if occ.Timezone != nil {
		tz = *occ.Timezone
	}

	instanceID := occ.EventID
	if occ.StartTime != nil {
		instanceID = fmt.Sprintf("%s_%s", occ.EventID, occ.StartTime.UTC().Format("20060102T150405Z"))
	} else if occ.StartDate != nil {
		instanceID = fmt.Sprintf("%s_%s", occ.EventID, *occ.StartDate)
	}

	return &OccurrenceProjection{
		EventID:     occ.EventID,
		CalendarID:  occ.CalendarID,
		MasterID:    occ.MasterID,
		InstanceID:  instanceID,
		Title:       occ.Title,
		Description: desc,
		Location:    loc,
		IsAllDay:    occ.IsAllDay,
		StartTime:   occ.StartTime,
		EndTime:     occ.EndTime,
		StartDate:   occ.StartDate,
		EndDate:     occ.EndDate,
		Timezone:    tz,
		Status:      occ.Status,
		IsException: occ.IsException,
	}
}

func mapVirtualToProjection(v VirtualOccurrence) *OccurrenceProjection {
	occ := &OccurrenceProjection{
		EventID:     v.ID,
		InstanceID:  v.ID,
		Title:       v.Title,
		Description: v.Description,
		IsAllDay:    v.IsAllDay,
		Color:       v.Color,
		IsVirtual:   true,
		SourceType:  v.SourceType,
	}
	if v.IsAllDay {
		sDate := v.StartDate
		eDate := v.EndDate
		occ.StartDate = &sDate
		occ.EndDate = &eDate
	} else {
		sTime := v.StartTime.UTC()
		eTime := v.EndTime.UTC()
		occ.StartTime = &sTime
		occ.EndTime = &eTime
	}
	return occ
}

func projectionStartInstant(occ *OccurrenceProjection) time.Time {
	if occ.StartTime != nil {
		return *occ.StartTime
	}
	if occ.StartDate != nil {
		if t, err := time.Parse("2006-01-02", *occ.StartDate); err == nil {
			return t
		}
	}
	return time.Time{}
}
