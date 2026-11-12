package calendar

//go:generate go run github.com/masterkeysrd/saturn/tools/mockgen .
//go:generate go run github.com/masterkeysrd/saturn/tools/txgen -target=Coordinator
//go:generate go run github.com/masterkeysrd/saturn/tools/loggen -target=Coordinator

import (
	"context"
	"fmt"
	"strings"
	"time"

	domaincalendar "github.com/masterkeysrd/saturn/internal/domain/calendar"
	"github.com/masterkeysrd/saturn/internal/domain/space"
	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	"github.com/masterkeysrd/saturn/internal/platform/connector"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

// Coordinator defines application use-case operations for calendars and events.
//
// @Mock
// @logged
type Coordinator interface {
	// @transactional
	CreateCalendar(ctx context.Context, req *CreateCalendarRequest) (*domaincalendar.Calendar, error)

	// @transactional
	UpdateCalendar(ctx context.Context, req *UpdateCalendarRequest) (*domaincalendar.Calendar, error)

	// @transactional
	DeleteCalendar(ctx context.Context, req *DeleteCalendarRequest) error

	// @transactional
	EnsureDefaultCalendar(ctx context.Context, req *EnsureDefaultCalendarRequest) (*domaincalendar.Calendar, error)

	// @transactional
	CreateEvent(ctx context.Context, req *CreateEventRequest) (*domaincalendar.Event, error)

	// @transactional
	UpdateEvent(ctx context.Context, req *UpdateEventRequest) (*domaincalendar.Event, error)

	// @transactional
	DeleteEvent(ctx context.Context, req *DeleteEventRequest) error

	// @transactional
	RespondToEvent(ctx context.Context, req *RespondToEventRequest) (*domaincalendar.Event, error)

	// @transactional
	SyncConnectedAccountCalendars(ctx context.Context, req *SyncConnectedAccountCalendarsRequest) error
}

// CreateCalendarRequest represents parameters to create a native calendar.
type CreateCalendarRequest struct {
	Calendar *domaincalendar.Calendar
}

// UpdateCalendarRequest represents parameters to update an existing calendar.
type UpdateCalendarRequest struct {
	ID         string
	Calendar   *domaincalendar.Calendar
	UpdateMask []string
}

// DeleteCalendarRequest represents parameters to delete a calendar.
type DeleteCalendarRequest struct {
	ID string
}

// EnsureDefaultCalendarRequest represents parameters to guarantee default calendar provisioning.
type EnsureDefaultCalendarRequest struct {
	SpaceID string
}

// CreateEventRequest represents parameters to create an event.
type CreateEventRequest struct {
	Event *domaincalendar.Event
}

// UpdateEventRequest represents parameters to update an event with optional recurrence scope.
type UpdateEventRequest struct {
	ID              string
	Event           *domaincalendar.Event
	UpdateMask      []string
	Scope           domaincalendar.RecurrenceEditScope
	TargetStartTime *time.Time
	TargetStartDate *string
}

// DeleteEventRequest represents parameters to delete an event with optional recurrence scope.
type DeleteEventRequest struct {
	ID              string
	Scope           domaincalendar.RecurrenceEditScope
	TargetStartTime *time.Time
	TargetStartDate *string
}

// RespondToEventRequest represents parameters to update RSVP status on an event.
type RespondToEventRequest struct {
	ID             string
	ResponseStatus string
}

// SyncConnectedAccountCalendarsRequest represents input for running background calendar synchronization.
type SyncConnectedAccountCalendarsRequest struct {
	SpaceID            string
	ConnectedAccountID string
}

// Dependencies contains the ports and domain services needed by the Coordinator.
type Dependencies struct {
	CalendarStore     domaincalendar.CalendarStore
	EventStore        domaincalendar.EventStore
	DomainService     *domaincalendar.Service
	TokenManager      *connector.TokenManager
	AccountStore      connector.Store
	ExternalProviders map[string]domaincalendar.ExternalCalendarProvider
}

type coordinator struct {
	calendarStore     domaincalendar.CalendarStore
	eventStore        domaincalendar.EventStore
	domainService     *domaincalendar.Service
	tokenManager      *connector.TokenManager
	accountStore      connector.Store
	externalProviders map[string]domaincalendar.ExternalCalendarProvider
}

// NewCoordinator creates a new calendar Coordinator.
func NewCoordinator(deps Dependencies) Coordinator {
	return &coordinator{
		calendarStore:     deps.CalendarStore,
		eventStore:        deps.EventStore,
		domainService:     deps.DomainService,
		tokenManager:      deps.TokenManager,
		accountStore:      deps.AccountStore,
		externalProviders: deps.ExternalProviders,
	}
}

var _ Coordinator = (*coordinator)(nil)

func requireWriteAccess(ctx context.Context) error {
	role, ok := auth.SpaceRoleFromContext(ctx)
	if !ok || role == string(space.RoleViewer) || role == "viewer" {
		return errors.E(errors.Permission, "viewers cannot modify calendars or events")
	}
	return nil
}

func getSpaceID(ctx context.Context) (string, error) {
	sID, ok := auth.SpaceIDFromContext(ctx)
	if !ok || sID == "" {
		return "", errors.E(errors.Unauthenticated, "missing active space context")
	}
	return sID, nil
}

func (c *coordinator) CreateCalendar(ctx context.Context, req *CreateCalendarRequest) (*domaincalendar.Calendar, error) {
	const op errors.Op = "application/calendar.CreateCalendar"

	if err := requireWriteAccess(ctx); err != nil {
		return nil, errors.E(op, err)
	}

	spaceID, err := getSpaceID(ctx)
	if err != nil {
		return nil, errors.E(op, err)
	}

	cal := req.Calendar
	if cal == nil {
		return nil, errors.E(op, errors.Invalid, "calendar is required")
	}
	cal.SpaceID = spaceID
	cal.Source = domaincalendar.SourceNative
	cal.AccessRole = domaincalendar.AccessRoleOwner

	if err := c.domainService.CreateCalendar(ctx, cal); err != nil {
		return nil, errors.E(op, err)
	}

	return cal, nil
}

func (c *coordinator) UpdateCalendar(ctx context.Context, req *UpdateCalendarRequest) (*domaincalendar.Calendar, error) {
	const op errors.Op = "application/calendar.UpdateCalendar"

	if err := requireWriteAccess(ctx); err != nil {
		return nil, errors.E(op, err)
	}

	spaceID, err := getSpaceID(ctx)
	if err != nil {
		return nil, errors.E(op, err)
	}

	updated, err := c.domainService.UpdateCalendar(ctx, spaceID, req.ID, req.Calendar, req.UpdateMask)
	if err != nil {
		return nil, errors.E(op, err)
	}

	return updated, nil
}

func (c *coordinator) DeleteCalendar(ctx context.Context, req *DeleteCalendarRequest) error {
	const op errors.Op = "application/calendar.DeleteCalendar"

	if err := requireWriteAccess(ctx); err != nil {
		return errors.E(op, err)
	}

	spaceID, err := getSpaceID(ctx)
	if err != nil {
		return errors.E(op, err)
	}

	if err := c.domainService.DeleteCalendar(ctx, spaceID, req.ID); err != nil {
		return errors.E(op, err)
	}

	return nil
}

func (c *coordinator) EnsureDefaultCalendar(ctx context.Context, req *EnsureDefaultCalendarRequest) (*domaincalendar.Calendar, error) {
	const op errors.Op = "application/calendar.EnsureDefaultCalendar"

	spaceID := req.SpaceID
	if spaceID == "" {
		var err error
		spaceID, err = getSpaceID(ctx)
		if err != nil {
			return nil, errors.E(op, err)
		}
	}

	// 1. Check if default native calendar already exists
	existing, err := c.calendarStore.GetDefaultNative(ctx, spaceID)
	if err == nil && existing != nil {
		return existing, nil
	}

	// 2. Provision new default native calendar
	defaultColor := "#3b82f6"
	newCal := &domaincalendar.Calendar{
		SpaceID:         spaceID,
		Name:            "Primary",
		Color:           &defaultColor,
		Timezone:        "UTC",
		Source:          domaincalendar.SourceNative,
		AccessRole:      domaincalendar.AccessRoleOwner,
		IsDefaultNative: true,
		IsEnabled:       true,
		IsPrimary:       true,
	}

	if err := c.domainService.CreateCalendar(ctx, newCal); err != nil {
		return nil, errors.E(op, err)
	}

	return newCal, nil
}

func (c *coordinator) CreateEvent(ctx context.Context, req *CreateEventRequest) (*domaincalendar.Event, error) {
	const op errors.Op = "application/calendar.CreateEvent"

	if err := requireWriteAccess(ctx); err != nil {
		return nil, errors.E(op, err)
	}

	spaceID, err := getSpaceID(ctx)
	if err != nil {
		return nil, errors.E(op, err)
	}

	ev := req.Event
	if ev == nil {
		return nil, errors.E(op, errors.Invalid, "event is required")
	}
	ev.SpaceID = spaceID

	// Verify calendar exists and allows writes
	cal, err := c.calendarStore.GetByID(ctx, spaceID, ev.CalendarID)
	if err != nil {
		return nil, errors.E(op, err)
	}
	if !cal.CanWrite() {
		return nil, errors.E(op, domaincalendar.ErrReadOnlyCalendar)
	}

	// Synchronous write-through for external calendars
	if cal.Source == domaincalendar.SourceExternal {
		if cal.ConnectedAccountID == nil || cal.ProviderCalendarID == nil {
			return nil, errors.E(op, errors.Invalid, "external calendar missing connected account or provider calendar ID")
		}

		token := ""
		if c.tokenManager != nil {
			var tErr error
			token, tErr = c.tokenManager.TokenSource(ctx, spaceID, *cal.ConnectedAccountID)
			if tErr != nil {
				return nil, errors.E(op, tErr)
			}
		}

		providerName := c.resolveProviderName(ctx, spaceID, *cal.ConnectedAccountID)
		prov, ok := c.externalProviders[providerName]
		if !ok {
			return nil, errors.E(op, errors.NotExist, "unsupported external calendar provider: %s", providerName)
		}

		writeRes, err := prov.CreateEvent(ctx, token, *cal.ProviderCalendarID, ev)
		if err != nil {
			// Write-through rejected by external provider -> abort and rollback transaction
			return nil, errors.E(op, fmt.Errorf("external provider rejected create: %w", err))
		}

		ev.ProviderEventID = &writeRes.ProviderEventID
		ev.ETag = &writeRes.ETag
		if writeRes.ConferenceURL != "" {
			ev.ConferenceURL = &writeRes.ConferenceURL
			meetProv := "google_meet"
			ev.ConferenceProvider = &meetProv
		}
	}

	if err := c.domainService.CreateEvent(ctx, ev); err != nil {
		return nil, errors.E(op, err)
	}

	return ev, nil
}

func (c *coordinator) UpdateEvent(ctx context.Context, req *UpdateEventRequest) (*domaincalendar.Event, error) {
	const op errors.Op = "application/calendar.UpdateEvent"

	if err := requireWriteAccess(ctx); err != nil {
		return nil, errors.E(op, err)
	}

	spaceID, err := getSpaceID(ctx)
	if err != nil {
		return nil, errors.E(op, err)
	}

	existing, err := c.eventStore.GetByID(ctx, spaceID, req.ID)
	if err != nil {
		return nil, errors.E(op, err)
	}

	cal, err := c.calendarStore.GetByID(ctx, spaceID, existing.CalendarID)
	if err != nil {
		return nil, errors.E(op, err)
	}
	if !cal.CanWrite() {
		return nil, errors.E(op, domaincalendar.ErrReadOnlyCalendar)
	}

	// External write-through
	if cal.Source == domaincalendar.SourceExternal && existing.ProviderEventID != nil {
		token := ""
		if c.tokenManager != nil {
			var tErr error
			token, tErr = c.tokenManager.TokenSource(ctx, spaceID, *cal.ConnectedAccountID)
			if tErr != nil {
				return nil, errors.E(op, tErr)
			}
		}

		providerName := c.resolveProviderName(ctx, spaceID, *cal.ConnectedAccountID)
		prov, ok := c.externalProviders[providerName]
		if !ok {
			return nil, errors.E(op, errors.NotExist, "unsupported provider: %s", providerName)
		}

		writeRes, err := prov.UpdateEvent(ctx, token, *cal.ProviderCalendarID, req.Event)
		if err != nil {
			return nil, errors.E(op, fmt.Errorf("external provider rejected update: %w", err))
		}
		req.Event.ETag = &writeRes.ETag
		if writeRes.ConferenceURL != "" {
			req.Event.ConferenceURL = &writeRes.ConferenceURL
		}
	}

	scope := req.Scope
	if scope == "" {
		scope = domaincalendar.RecurrenceEditScopeAllEvents
	}

	if existing.RRULE != nil && *existing.RRULE != "" {
		res, err := c.domainService.UpdateRecurringEvent(ctx, domaincalendar.UpdateRecurringEventParams{
			SpaceID:             spaceID,
			EventID:             req.ID,
			Scope:               scope,
			Incoming:            req.Event,
			Mask:                req.UpdateMask,
			OccurrenceStartTime: req.TargetStartTime,
			OccurrenceStartDate: req.TargetStartDate,
		})
		if err != nil {
			return nil, errors.E(op, err)
		}
		return res, nil
	}

	updated, err := c.domainService.UpdateEvent(ctx, spaceID, req.ID, req.Event, req.UpdateMask)
	if err != nil {
		return nil, errors.E(op, err)
	}

	return updated, nil
}

func (c *coordinator) DeleteEvent(ctx context.Context, req *DeleteEventRequest) error {
	const op errors.Op = "application/calendar.DeleteEvent"

	if err := requireWriteAccess(ctx); err != nil {
		return errors.E(op, err)
	}

	spaceID, err := getSpaceID(ctx)
	if err != nil {
		return errors.E(op, err)
	}

	existing, err := c.eventStore.GetByID(ctx, spaceID, req.ID)
	if err != nil {
		return errors.E(op, err)
	}

	cal, err := c.calendarStore.GetByID(ctx, spaceID, existing.CalendarID)
	if err != nil {
		return errors.E(op, err)
	}
	if !cal.CanWrite() {
		return errors.E(op, domaincalendar.ErrReadOnlyCalendar)
	}

	// External write-through
	if cal.Source == domaincalendar.SourceExternal && existing.ProviderEventID != nil {
		token := ""
		if c.tokenManager != nil {
			var tErr error
			token, tErr = c.tokenManager.TokenSource(ctx, spaceID, *cal.ConnectedAccountID)
			if tErr != nil {
				return errors.E(op, tErr)
			}
		}

		providerName := c.resolveProviderName(ctx, spaceID, *cal.ConnectedAccountID)
		prov, ok := c.externalProviders[providerName]
		if !ok {
			return errors.E(op, errors.NotExist, "unsupported provider: %s", providerName)
		}

		if err := prov.DeleteEvent(ctx, token, *cal.ProviderCalendarID, *existing.ProviderEventID); err != nil {
			return errors.E(op, fmt.Errorf("external provider rejected delete: %w", err))
		}
	}

	scope := req.Scope
	if scope == "" {
		scope = domaincalendar.RecurrenceEditScopeAllEvents
	}

	if scope == domaincalendar.RecurrenceEditScopeThisEvent && (req.TargetStartTime != nil || req.TargetStartDate != nil) {
		// Single occurrence suppression: append EXDATE
		if req.TargetStartTime != nil {
			existing.EXDates = append(existing.EXDates, req.TargetStartTime.UTC().Format("20060102T150405Z"))
		} else if req.TargetStartDate != nil {
			existing.EXDatesAllDay = append(existing.EXDatesAllDay, *req.TargetStartDate)
		}
		return c.eventStore.Update(ctx, existing)
	}

	return c.domainService.DeleteEvent(ctx, spaceID, req.ID)
}

func (c *coordinator) RespondToEvent(ctx context.Context, req *RespondToEventRequest) (*domaincalendar.Event, error) {
	const op errors.Op = "application/calendar.RespondToEvent"

	if err := requireWriteAccess(ctx); err != nil {
		return nil, errors.E(op, err)
	}

	spaceID, err := getSpaceID(ctx)
	if err != nil {
		return nil, errors.E(op, err)
	}

	existing, err := c.eventStore.GetByID(ctx, spaceID, req.ID)
	if err != nil {
		return nil, errors.E(op, err)
	}

	callerEmail := ""
	if u, ok := auth.CurrentUserFromContext(ctx); ok {
		callerEmail = u.Email
	}

	// Update local attendees list
	attendees, err := existing.Attendees()
	if err != nil {
		return nil, errors.E(op, err)
	}
	matched := false
	for i := range attendees {
		if strings.EqualFold(attendees[i].Email, callerEmail) {
			attendees[i].ResponseStatus = req.ResponseStatus
			matched = true
			break
		}
	}
	if !matched && callerEmail != "" {
		attendees = append(attendees, domaincalendar.Attendee{
			Email:          callerEmail,
			ResponseStatus: req.ResponseStatus,
		})
	}
	_ = existing.SetAttendees(attendees)

	// External write-through if applicable
	cal, err := c.calendarStore.GetByID(ctx, spaceID, existing.CalendarID)
	if err == nil && cal.Source == domaincalendar.SourceExternal && existing.ProviderEventID != nil {
		token := ""
		if c.tokenManager != nil {
			token, _ = c.tokenManager.TokenSource(ctx, spaceID, *cal.ConnectedAccountID)
		}
		if token != "" {
			providerName := c.resolveProviderName(ctx, spaceID, *cal.ConnectedAccountID)
			if prov, ok := c.externalProviders[providerName]; ok {
				_ = prov.RespondToEvent(ctx, token, *cal.ProviderCalendarID, *existing.ProviderEventID, callerEmail, req.ResponseStatus)
			}
		}
	}

	if err := c.eventStore.Update(ctx, existing); err != nil {
		return nil, errors.E(op, err)
	}

	return existing, nil
}

func (c *coordinator) resolveProviderName(ctx context.Context, spaceID, accountID string) string {
	if c.accountStore != nil {
		acc, err := c.accountStore.GetAccount(ctx, spaceID, accountID)
		if err == nil && acc != nil && acc.Provider != "" {
			return acc.Provider
		}
	}
	return "google"
}
