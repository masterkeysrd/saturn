package calendar

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

// Dependencies holds all stores required by the calendar Service.
type Dependencies struct {
	CalendarStore CalendarStore
	EventStore    EventStore
}

// Service provides calendar and event domain operations.
type Service struct {
	deps Dependencies
}

// NewService creates a new calendar Service.
func NewService(deps Dependencies) *Service {
	return &Service{deps: deps}
}

// CreateCalendar validates and persists a new calendar entity.
func (s *Service) CreateCalendar(ctx context.Context, cal *Calendar) error {
	if cal == nil {
		return errors.E(errors.Invalid, "calendar is required")
	}

	if cal.ID == "" {
		newID, err := GenerateCalendarID()
		if err != nil {
			return errors.E(errors.Internal, "generate calendar ID: %w", err)
		}
		cal.ID = newID
	}

	now := time.Now().UTC()
	if cal.CreateTime.IsZero() {
		cal.CreateTime = now
	}
	if cal.UpdateTime.IsZero() {
		cal.UpdateTime = now
	}
	if cal.Version == 0 {
		cal.Version = 1
	}

	if err := cal.Validate(); err != nil {
		return err
	}

	return s.deps.CalendarStore.Create(ctx, cal)
}

// GetCalendar retrieves a calendar by ID.
func (s *Service) GetCalendar(ctx context.Context, spaceID, id string) (*Calendar, error) {
	cal, err := s.deps.CalendarStore.GetByID(ctx, spaceID, id)
	if err != nil {
		return nil, err
	}
	if cal == nil {
		return nil, errors.E(errors.NotExist, ErrCalendarNotFound, "calendar not found")
	}
	return cal, nil
}

// GetDefaultNativeCalendar retrieves the default native calendar for a space.
func (s *Service) GetDefaultNativeCalendar(ctx context.Context, spaceID string) (*Calendar, error) {
	cal, err := s.deps.CalendarStore.GetDefaultNative(ctx, spaceID)
	if err != nil {
		return nil, err
	}
	if cal == nil {
		return nil, errors.E(errors.NotExist, ErrCalendarNotFound, "default native calendar not found")
	}
	return cal, nil
}

// UpdateCalendar applies partial updates to a calendar if the caller has management permissions.
// Visibility (is_enabled) and color preference updates are permitted for any reader or writer.
func (s *Service) UpdateCalendar(ctx context.Context, spaceID, id string, incoming *Calendar, mask []string) (*Calendar, error) {
	cal, err := s.GetCalendar(ctx, spaceID, id)
	if err != nil {
		return nil, err
	}

	isPrefOnly := len(mask) > 0
	for _, m := range mask {
		norm := strings.ToLower(strings.ReplaceAll(m, "_", ""))
		if norm != "isenabled" && norm != "color" {
			isPrefOnly = false
			break
		}
	}

	if !isPrefOnly && !cal.CanManage() {
		return nil, errors.E(errors.Permission, ErrReadOnlyCalendar, "only calendar owners can update calendar settings")
	}

	if err := cal.ApplyPatch(incoming, mask); err != nil {
		return nil, err
	}

	if err := s.deps.CalendarStore.Update(ctx, cal); err != nil {
		return nil, err
	}

	return cal, nil
}

// DeleteCalendar removes a calendar and its associated events.
func (s *Service) DeleteCalendar(ctx context.Context, spaceID, id string) error {
	cal, err := s.GetCalendar(ctx, spaceID, id)
	if err != nil {
		return err
	}

	if !cal.CanManage() {
		return errors.E(errors.Permission, ErrReadOnlyCalendar, "only calendar owners can delete calendars")
	}

	if cal.IsDefaultNative {
		return errors.E(errors.Precondition, ErrCannotDeleteDefault, "cannot delete default workspace calendar")
	}

	return s.deps.CalendarStore.Delete(ctx, spaceID, id)
}

// ListCalendars returns all calendars for a workspace matching the filter.
func (s *Service) ListCalendars(ctx context.Context, spaceID string, filter *ListCalendarsFilter) ([]*Calendar, error) {
	return s.deps.CalendarStore.ListBySpace(ctx, spaceID, filter)
}

// CreateEvent validates and persists a new calendar event.
func (s *Service) CreateEvent(ctx context.Context, event *Event) error {
	if event == nil {
		return errors.E(errors.Invalid, "event is required")
	}

	cal, err := s.GetCalendar(ctx, event.SpaceID, event.CalendarID)
	if err != nil {
		return err
	}

	if !cal.CanWrite() {
		return errors.E(errors.Permission, ErrReadOnlyCalendar, "calendar is read-only")
	}

	if event.ID == "" {
		newID, err := GenerateEventID()
		if err != nil {
			return errors.E(errors.Internal, "generate event ID: %w", err)
		}
		event.ID = newID
	}

	now := time.Now().UTC()
	if event.CreateTime.IsZero() {
		event.CreateTime = now
	}
	if event.UpdateTime.IsZero() {
		event.UpdateTime = now
	}
	if event.Version == 0 {
		event.Version = 1
	}

	if err := event.Validate(); err != nil {
		return err
	}

	return s.deps.EventStore.Create(ctx, event)
}

// GetEvent retrieves a calendar event by ID.
func (s *Service) GetEvent(ctx context.Context, spaceID, id string) (*Event, error) {
	event, err := s.deps.EventStore.GetByID(ctx, spaceID, id)
	if err != nil {
		return nil, err
	}
	if event == nil {
		return nil, errors.E(errors.NotExist, ErrEventNotFound, "event not found")
	}
	return event, nil
}

// UpdateEvent applies partial updates to an event after verifying calendar write access.
func (s *Service) UpdateEvent(ctx context.Context, spaceID, id string, incoming *Event, mask []string) (*Event, error) {
	event, err := s.GetEvent(ctx, spaceID, id)
	if err != nil {
		return nil, err
	}

	cal, err := s.GetCalendar(ctx, spaceID, event.CalendarID)
	if err != nil {
		return nil, err
	}
	if !cal.CanWrite() {
		return nil, errors.E(errors.Permission, ErrReadOnlyCalendar, "calendar is read-only")
	}

	if err := event.ApplyPatch(incoming, mask); err != nil {
		return nil, err
	}

	if err := s.deps.EventStore.Update(ctx, event); err != nil {
		return nil, err
	}

	return event, nil
}

// DeleteEvent removes an event after verifying calendar write access.
func (s *Service) DeleteEvent(ctx context.Context, spaceID, id string) error {
	event, err := s.GetEvent(ctx, spaceID, id)
	if err != nil {
		return err
	}

	cal, err := s.GetCalendar(ctx, spaceID, event.CalendarID)
	if err != nil {
		return err
	}
	if !cal.CanWrite() {
		return errors.E(errors.Permission, ErrReadOnlyCalendar, "calendar is read-only")
	}

	return s.deps.EventStore.Delete(ctx, spaceID, id)
}

// GetOccurrences expands all events across calendarIDs within the viewport [rangeStart, rangeEnd].
func (s *Service) GetOccurrences(
	ctx context.Context,
	spaceID string,
	calendarIDs []string,
	rangeStart time.Time,
	rangeEnd time.Time,
) ([]*EventOccurrence, error) {
	if len(calendarIDs) == 0 {
		return nil, nil
	}

	startDate := rangeStart.UTC().Format(time.DateOnly)
	endDate := rangeEnd.UTC().Format(time.DateOnly)

	// 1. Fetch non-recurring events in range
	inRangeEvents, err := s.deps.EventStore.ListInTimeRange(ctx, spaceID, calendarIDs, rangeStart, rangeEnd, startDate, endDate)
	if err != nil {
		return nil, err
	}

	// 2. Fetch recurring masters
	masters, err := s.deps.EventStore.ListRecurringMasters(ctx, spaceID, calendarIDs)
	if err != nil {
		return nil, err
	}

	// 3. Fetch exceptions for recurring masters
	var masterIDs []string
	for _, m := range masters {
		masterIDs = append(masterIDs, m.ID)
	}

	var exceptions []*Event
	if len(masterIDs) > 0 {
		var err error
		exceptions, err = s.deps.EventStore.ListExceptionsByMasterIDs(ctx, spaceID, masterIDs)
		if err != nil {
			return nil, err
		}
	}

	// 4. Combine masters with non-recurring events
	var allMasters []*Event
	for _, ev := range inRangeEvents {
		if ev.RRULE == nil || *ev.RRULE == "" {
			if ev.RecurringMasterID == nil {
				allMasters = append(allMasters, ev)
			}
		}
	}
	allMasters = append(allMasters, masters...)

	// 5. Expand occurrences
	return ExpandOccurrences(allMasters, exceptions, rangeStart, rangeEnd), nil
}

// UpdateRecurringEventParams holds inputs for updating an occurrence with scope.
type UpdateRecurringEventParams struct {
	SpaceID             string
	EventID             string
	Scope               RecurrenceEditScope
	Incoming            *Event
	Mask                []string
	OccurrenceStartTime *time.Time
	OccurrenceStartDate *string
}

// UpdateRecurringEvent modifies a single occurrence, split following instances, or the full series.
func (s *Service) UpdateRecurringEvent(
	ctx context.Context,
	params UpdateRecurringEventParams,
) (*Event, error) {
	event, err := s.GetEvent(ctx, params.SpaceID, params.EventID)
	if err != nil {
		return nil, err
	}

	cal, err := s.GetCalendar(ctx, params.SpaceID, event.CalendarID)
	if err != nil {
		return nil, err
	}
	if !cal.CanWrite() {
		return nil, errors.E(errors.Permission, ErrReadOnlyCalendar, "calendar is read-only")
	}

	switch params.Scope {
	case RecurrenceEditScopeAllEvents:
		// Modify master event directly
		if err := event.ApplyPatch(params.Incoming, params.Mask); err != nil {
			return nil, err
		}
		if err := s.deps.EventStore.Update(ctx, event); err != nil {
			return nil, err
		}
		return event, nil

	case RecurrenceEditScopeThisEvent:
		// Modify or create an exception row
		masterID := event.ID
		if event.RecurringMasterID != nil && *event.RecurringMasterID != "" {
			masterID = *event.RecurringMasterID
		}

		// Find existing exception for this occurrence
		exceptions, err := s.deps.EventStore.ListExceptionsByMasterID(ctx, params.SpaceID, masterID)
		if err != nil {
			return nil, err
		}

		var existingExc *Event
		for _, exc := range exceptions {
			if event.IsAllDay {
				if exc.OriginalStartDate != nil && params.OccurrenceStartDate != nil &&
					*exc.OriginalStartDate == *params.OccurrenceStartDate {
					existingExc = exc
					break
				}
			} else {
				if exc.OriginalStartTime != nil && params.OccurrenceStartTime != nil &&
					exc.OriginalStartTime.UTC().Equal(params.OccurrenceStartTime.UTC()) {
					existingExc = exc
					break
				}
			}
		}

		if existingExc != nil {
			if err := existingExc.ApplyPatch(params.Incoming, params.Mask); err != nil {
				return nil, err
			}
			if err := s.deps.EventStore.Update(ctx, existingExc); err != nil {
				return nil, err
			}
			return existingExc, nil
		}

		// Create a new exception event
		newID, err := GenerateEventID()
		if err != nil {
			return nil, errors.E(errors.Internal, "generate exception event ID: %w", err)
		}

		exc := *event
		exc.ID = newID
		exc.RecurringMasterID = &masterID
		exc.RRULE = nil
		exc.EXDates = nil
		exc.EXDatesAllDay = nil
		exc.OriginalStartTime = params.OccurrenceStartTime
		exc.OriginalStartDate = params.OccurrenceStartDate
		exc.Version = 1
		exc.CreateTime = time.Now().UTC()
		exc.UpdateTime = exc.CreateTime

		if err := exc.ApplyPatch(params.Incoming, params.Mask); err != nil {
			return nil, err
		}

		if err := s.deps.EventStore.Create(ctx, &exc); err != nil {
			return nil, err
		}
		return &exc, nil

	case RecurrenceEditScopeThisAndFollowing:
		// Split recurrence: add UNTIL to master, create new master for subsequent instances
		if event.RRULE == nil || *event.RRULE == "" {
			return nil, errors.E(errors.Invalid, "event is not recurring")
		}

		// 1. Truncate current master's RRULE with UNTIL
		rule, err := ParseRRULE(*event.RRULE)
		if err != nil {
			return nil, err
		}

		if event.IsAllDay {
			if params.OccurrenceStartDate == nil {
				return nil, errors.E(errors.Invalid, "occurrence start date required for all-day split")
			}
			curDate, err := time.Parse(time.DateOnly, *params.OccurrenceStartDate)
			if err != nil {
				return nil, errors.E(errors.Invalid, "invalid occurrence start date: %v", err)
			}
			untilDate := curDate.AddDate(0, 0, -1).Format(time.DateOnly)
			rule.UntilDate = &untilDate
			dTime, _ := time.Parse(time.DateOnly, untilDate)
			untilT := dTime.Add(24*time.Hour - time.Nanosecond)
			rule.Until = &untilT
		} else {
			if params.OccurrenceStartTime == nil {
				return nil, errors.E(errors.Invalid, "occurrence start time required for timed split")
			}
			untilT := params.OccurrenceStartTime.UTC().Add(-1 * time.Second)
			rule.Until = &untilT
		}

		// Clear count on truncated master
		rule.Count = nil
		newRRULE := formatRRULE(rule)
		event.RRULE = &newRRULE
		event.UpdateTime = time.Now().UTC()

		if err := s.deps.EventStore.Update(ctx, event); err != nil {
			return nil, err
		}

		// 2. Create new master starting at occurrence
		newMasterID, err := GenerateEventID()
		if err != nil {
			return nil, errors.E(errors.Internal, "generate new master ID: %w", err)
		}

		newMaster := *event
		newMaster.ID = newMasterID
		newMaster.RecurringMasterID = nil
		newMaster.Version = 1
		newMaster.CreateTime = time.Now().UTC()
		newMaster.UpdateTime = newMaster.CreateTime

		if event.IsAllDay {
			newMaster.StartDate = params.OccurrenceStartDate
			startD, _ := time.Parse(time.DateOnly, *params.OccurrenceStartDate)
			origStartD, _ := time.Parse(time.DateOnly, *event.StartDate)
			origEndD, _ := time.Parse(time.DateOnly, *event.EndDate)
			durationDays := origEndD.Sub(origStartD)
			newEndStr := startD.Add(durationDays).Format(time.DateOnly)
			newMaster.EndDate = &newEndStr
		} else {
			newMaster.StartTime = params.OccurrenceStartTime
			duration := event.EndTime.Sub(*event.StartTime)
			newEnd := params.OccurrenceStartTime.Add(duration)
			newMaster.EndTime = &newEnd
		}

		// Reset original until on new master
		rule.Until = nil
		rule.UntilDate = nil
		newMasterRRULE := formatRRULE(rule)
		newMaster.RRULE = &newMasterRRULE

		if err := newMaster.ApplyPatch(params.Incoming, params.Mask); err != nil {
			return nil, err
		}

		if err := s.deps.EventStore.Create(ctx, &newMaster); err != nil {
			return nil, err
		}

		return &newMaster, nil

	default:
		return nil, errors.E(errors.Invalid, "unsupported recurrence edit scope: %s", params.Scope)
	}
}

func formatRRULE(r *RecurrenceRule) string {
	parts := []string{fmt.Sprintf("FREQ=%s", r.Freq)}
	if r.Interval > 1 {
		parts = append(parts, fmt.Sprintf("INTERVAL=%d", r.Interval))
	}
	if r.Count != nil {
		parts = append(parts, fmt.Sprintf("COUNT=%d", *r.Count))
	}
	if r.Until != nil {
		parts = append(parts, fmt.Sprintf("UNTIL=%s", r.Until.UTC().Format("20060102T150405Z")))
	}
	if len(r.ByDay) > 0 {
		var days []string
		for _, bd := range r.ByDay {
			prefix := ""
			if bd.Ord != 0 {
				prefix = strconv.Itoa(bd.Ord)
			}
			dayCode := ""
			switch bd.Day {
			case time.Sunday:
				dayCode = "SU"
			case time.Monday:
				dayCode = "MO"
			case time.Tuesday:
				dayCode = "TU"
			case time.Wednesday:
				dayCode = "WE"
			case time.Thursday:
				dayCode = "TH"
			case time.Friday:
				dayCode = "FR"
			case time.Saturday:
				dayCode = "SA"
			}
			days = append(days, prefix+dayCode)
		}
		parts = append(parts, fmt.Sprintf("BYDAY=%s", strings.Join(days, ",")))
	}
	if len(r.ByMonthDay) > 0 {
		var nums []string
		for _, n := range r.ByMonthDay {
			nums = append(nums, strconv.Itoa(n))
		}
		parts = append(parts, fmt.Sprintf("BYMONTHDAY=%s", strings.Join(nums, ",")))
	}
	if len(r.ByMonth) > 0 {
		var nums []string
		for _, n := range r.ByMonth {
			nums = append(nums, strconv.Itoa(n))
		}
		parts = append(parts, fmt.Sprintf("BYMONTH=%s", strings.Join(nums, ",")))
	}
	if len(r.BySetPos) > 0 {
		var nums []string
		for _, n := range r.BySetPos {
			nums = append(nums, strconv.Itoa(n))
		}
		parts = append(parts, fmt.Sprintf("BYSETPOS=%s", strings.Join(nums, ",")))
	}
	return strings.Join(parts, ";")
}
