package calendar_test

import (
	"context"
	"errors"
	"testing"
	"time"

	appcalendar "github.com/masterkeysrd/saturn/internal/application/calendar"
	domaincalendar "github.com/masterkeysrd/saturn/internal/domain/calendar"
	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	"github.com/masterkeysrd/saturn/internal/platform/connector"
	platformerrors "github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/eventbus"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// In-memory mock store for CalendarStore
type mockCalendarStore struct {
	calendars     map[string]*domaincalendar.Calendar
	defaultNative *domaincalendar.Calendar
}

func newMockCalendarStore() *mockCalendarStore {
	return &mockCalendarStore{
		calendars: make(map[string]*domaincalendar.Calendar),
	}
}

func (m *mockCalendarStore) Create(ctx context.Context, cal *domaincalendar.Calendar) error {
	m.calendars[cal.ID] = cal
	if cal.IsDefaultNative {
		m.defaultNative = cal
	}
	return nil
}

func (m *mockCalendarStore) GetByID(ctx context.Context, spaceID, id string) (*domaincalendar.Calendar, error) {
	cal, ok := m.calendars[id]
	if !ok || cal.SpaceID != spaceID {
		return nil, errors.New("calendar not found")
	}
	return cal, nil
}

func (m *mockCalendarStore) GetDefaultNative(ctx context.Context, spaceID string) (*domaincalendar.Calendar, error) {
	if m.defaultNative != nil && m.defaultNative.SpaceID == spaceID {
		return m.defaultNative, nil
	}
	return nil, errors.New("default native calendar not found")
}

func (m *mockCalendarStore) GetByConnectedAccountAndProviderID(ctx context.Context, spaceID, accountID, providerCalendarID string) (*domaincalendar.Calendar, error) {
	for _, c := range m.calendars {
		if c.SpaceID == spaceID && c.ConnectedAccountID != nil && *c.ConnectedAccountID == accountID &&
			c.ProviderCalendarID != nil && *c.ProviderCalendarID == providerCalendarID {
			return c, nil
		}
	}
	return nil, errors.New("calendar not found")
}

func (m *mockCalendarStore) Update(ctx context.Context, cal *domaincalendar.Calendar) error {
	m.calendars[cal.ID] = cal
	return nil
}

func (m *mockCalendarStore) Delete(ctx context.Context, spaceID, id string) error {
	delete(m.calendars, id)
	return nil
}

func (m *mockCalendarStore) DeleteByConnectedAccount(ctx context.Context, spaceID, accountID string) error {
	for id, c := range m.calendars {
		if c.SpaceID == spaceID && c.ConnectedAccountID != nil && *c.ConnectedAccountID == accountID {
			delete(m.calendars, id)
		}
	}
	return nil
}

func (m *mockCalendarStore) ListBySpace(ctx context.Context, spaceID string, filter *domaincalendar.ListCalendarsFilter) ([]*domaincalendar.Calendar, error) {
	var res []*domaincalendar.Calendar
	for _, c := range m.calendars {
		if c.SpaceID == spaceID {
			res = append(res, c)
		}
	}
	return res, nil
}

// In-memory mock store for EventStore
type mockEventStore struct {
	events map[string]*domaincalendar.Event
}

func newMockEventStore() *mockEventStore {
	return &mockEventStore{
		events: make(map[string]*domaincalendar.Event),
	}
}

func (m *mockEventStore) Create(ctx context.Context, ev *domaincalendar.Event) error {
	m.events[ev.ID] = ev
	return nil
}

func (m *mockEventStore) GetByID(ctx context.Context, spaceID, id string) (*domaincalendar.Event, error) {
	ev, ok := m.events[id]
	if !ok || ev.SpaceID != spaceID {
		return nil, errors.New("event not found")
	}
	return ev, nil
}

func (m *mockEventStore) GetByProviderEventID(ctx context.Context, spaceID, calendarID, providerEventID string) (*domaincalendar.Event, error) {
	for _, ev := range m.events {
		if ev.SpaceID == spaceID && ev.CalendarID == calendarID && ev.ProviderEventID != nil && *ev.ProviderEventID == providerEventID {
			return ev, nil
		}
	}
	return nil, errors.New("event not found")
}

func (m *mockEventStore) GetByICalUID(ctx context.Context, spaceID, calendarID, icalUID string) (*domaincalendar.Event, error) {
	for _, ev := range m.events {
		if ev.SpaceID == spaceID && ev.CalendarID == calendarID && ev.ICalUID != nil && *ev.ICalUID == icalUID {
			return ev, nil
		}
	}
	return nil, nil
}

func (m *mockEventStore) UpsertByICalUID(ctx context.Context, ev *domaincalendar.Event) (bool, error) {
	if ev.ICalUID == nil {
		return false, errors.New("ical_uid is required")
	}
	existing, _ := m.GetByICalUID(ctx, ev.SpaceID, ev.CalendarID, *ev.ICalUID)
	if existing == nil {
		m.events[ev.ID] = ev
		return true, nil
	}
	ev.ID = existing.ID
	m.events[ev.ID] = ev
	return false, nil
}

func (m *mockEventStore) Update(ctx context.Context, ev *domaincalendar.Event) error {
	m.events[ev.ID] = ev
	return nil
}

func (m *mockEventStore) Delete(ctx context.Context, spaceID, id string) error {
	delete(m.events, id)
	return nil
}

func (m *mockEventStore) DeleteByCalendarID(ctx context.Context, spaceID, calendarID string) error {
	for id, ev := range m.events {
		if ev.SpaceID == spaceID && ev.CalendarID == calendarID {
			delete(m.events, id)
		}
	}
	return nil
}

func (m *mockEventStore) ListByCalendar(ctx context.Context, spaceID, calendarID string, filter *domaincalendar.ListEventsFilter) ([]*domaincalendar.Event, error) {
	var res []*domaincalendar.Event
	for _, ev := range m.events {
		if ev.SpaceID == spaceID && ev.CalendarID == calendarID {
			res = append(res, ev)
		}
	}
	return res, nil
}

func (m *mockEventStore) ListInTimeRange(ctx context.Context, spaceID string, calendarIDs []string, startTime, endTime time.Time, startDate, endDate string) ([]*domaincalendar.Event, error) {
	return nil, nil
}

func (m *mockEventStore) ListRecurringMasters(ctx context.Context, spaceID string, calendarIDs []string) ([]*domaincalendar.Event, error) {
	return nil, nil
}

func (m *mockEventStore) ListExceptionsByMasterID(ctx context.Context, spaceID, masterID string) ([]*domaincalendar.Event, error) {
	return nil, nil
}

func (m *mockEventStore) ListExceptionsByMasterIDs(ctx context.Context, spaceID string, masterIDs []string) ([]*domaincalendar.Event, error) {
	return nil, nil
}

// Mock external calendar provider
type mockExternalProvider struct {
	createErr      error
	lastUpdatedEvt *domaincalendar.Event
}

func (m *mockExternalProvider) Provider() string { return "google" }
func (m *mockExternalProvider) ListCalendars(ctx context.Context, accessToken string) ([]*domaincalendar.DiscoveredCalendar, error) {
	return nil, nil
}
func (m *mockExternalProvider) SyncEvents(ctx context.Context, accessToken, providerCalendarID, syncCursor string) (*domaincalendar.EventSyncResult, error) {
	return nil, nil
}
func (m *mockExternalProvider) CreateEvent(ctx context.Context, accessToken, providerCalendarID string, event *domaincalendar.Event) (*domaincalendar.EventWriteResult, error) {
	if m.createErr != nil {
		return nil, m.createErr
	}
	return &domaincalendar.EventWriteResult{
		ProviderEventID: "google_cev_123",
		ETag:            "\"etag123\"",
		ConferenceURL:   "https://meet.google.com/test-meet-123",
	}, nil
}
func (m *mockExternalProvider) UpdateEvent(ctx context.Context, accessToken, providerCalendarID string, event *domaincalendar.Event) (*domaincalendar.EventWriteResult, error) {
	cp := *event
	m.lastUpdatedEvt = &cp
	return &domaincalendar.EventWriteResult{ProviderEventID: "google_cev_123", ETag: "\"etag_updated\""}, nil
}
func (m *mockExternalProvider) DeleteEvent(ctx context.Context, accessToken, providerCalendarID, providerEventID string) error {
	return nil
}
func (m *mockExternalProvider) RespondToEvent(ctx context.Context, accessToken, providerCalendarID, providerEventID, attendeeEmail, responseStatus string) error {
	return nil
}

func contextWithRole(role, spaceID string) context.Context {
	return auth.WithSpaceScope(context.Background(), spaceID, role)
}

func TestCoordinator_Permissions(t *testing.T) {
	t.Parallel()

	calStore := newMockCalendarStore()
	evStore := newMockEventStore()
	domainSvc := domaincalendar.NewService(domaincalendar.Dependencies{
		CalendarStore: calStore,
		EventStore:    evStore,
	})

	coord := appcalendar.NewCoordinator(appcalendar.Dependencies{
		CalendarStore: calStore,
		EventStore:    evStore,
		DomainService: domainSvc,
		Events:        eventbus.NoopPublisher{},
	})

	t.Run("viewer rejected on CreateCalendar", func(t *testing.T) {
		ctx := contextWithRole("viewer", "spc_1")
		_, err := coord.CreateCalendar(ctx, &appcalendar.CreateCalendarRequest{
			Calendar: &domaincalendar.Calendar{Name: "Forbidden Cal"},
		})
		require.Error(t, err)
		assert.Contains(t, err.Error(), "viewers cannot modify")
	})

	t.Run("admin allowed on CreateCalendar", func(t *testing.T) {
		ctx := contextWithRole("admin", "spc_1")
		cal, err := coord.CreateCalendar(ctx, &appcalendar.CreateCalendarRequest{
			Calendar: &domaincalendar.Calendar{Name: "Allowed Cal", Timezone: "UTC"},
		})
		require.NoError(t, err)
		assert.NotEmpty(t, cal.ID)
		assert.Equal(t, "spc_1", cal.SpaceID)
	})

	t.Run("viewer rejected on EnsureDefaultCalendar", func(t *testing.T) {
		ctx := contextWithRole("viewer", "spc_1")
		_, err := coord.EnsureDefaultCalendar(ctx, &appcalendar.EnsureDefaultCalendarRequest{})
		require.Error(t, err)
		assert.Contains(t, err.Error(), "viewers cannot modify")
	})

	t.Run("missing role rejected on EnsureDefaultCalendar", func(t *testing.T) {
		ctx := auth.WithSpaceID(context.Background(), "spc_1")
		_, err := coord.EnsureDefaultCalendar(ctx, &appcalendar.EnsureDefaultCalendarRequest{})
		require.Error(t, err)
		assert.Contains(t, err.Error(), "viewers cannot modify")
	})
}

func TestCoordinator_EnsureDefaultCalendar(t *testing.T) {
	t.Parallel()

	calStore := newMockCalendarStore()
	evStore := newMockEventStore()
	domainSvc := domaincalendar.NewService(domaincalendar.Dependencies{
		CalendarStore: calStore,
		EventStore:    evStore,
	})

	coord := appcalendar.NewCoordinator(appcalendar.Dependencies{
		CalendarStore: calStore,
		EventStore:    evStore,
		DomainService: domainSvc,
		Events:        eventbus.NoopPublisher{},
	})

	ctx := contextWithRole("member", "spc_100")

	// First call provisions new default native calendar
	cal1, err := coord.EnsureDefaultCalendar(ctx, &appcalendar.EnsureDefaultCalendarRequest{})
	require.NoError(t, err)
	assert.True(t, cal1.IsDefaultNative)
	assert.Equal(t, "Primary", cal1.Name)
	assert.Equal(t, domaincalendar.SourceNative, cal1.Source)

	// Second call returns existing without creating duplicate
	cal2, err := coord.EnsureDefaultCalendar(ctx, &appcalendar.EnsureDefaultCalendarRequest{})
	require.NoError(t, err)
	assert.Equal(t, cal1.ID, cal2.ID)
}

func TestCoordinator_WriteThrough(t *testing.T) {
	t.Parallel()

	calStore := newMockCalendarStore()
	evStore := newMockEventStore()
	domainSvc := domaincalendar.NewService(domaincalendar.Dependencies{
		CalendarStore: calStore,
		EventStore:    evStore,
	})

	mockProv := &mockExternalProvider{}
	externalProviders := map[string]domaincalendar.ExternalCalendarProvider{
		"google": mockProv,
	}

	coord := appcalendar.NewCoordinator(appcalendar.Dependencies{
		CalendarStore:     calStore,
		EventStore:        evStore,
		DomainService:     domainSvc,
		ExternalProviders: externalProviders,
		Events:            eventbus.NoopPublisher{},
	})

	// Setup external calendar
	accID := "cac_test_1"
	pCalID := "primary"
	color := "#4285F4"
	extCal := &domaincalendar.Calendar{
		ID:                 "cal_ext_1",
		SpaceID:            "spc_1",
		ConnectedAccountID: &accID,
		ProviderCalendarID: &pCalID,
		Name:               "Google Calendar",
		Color:              &color,
		Timezone:           "UTC",
		Source:             domaincalendar.SourceExternal,
		AccessRole:         domaincalendar.AccessRoleWriter,
		IsEnabled:          true,
	}
	require.NoError(t, calStore.Create(context.Background(), extCal))

	t.Run("rejects when external provider fails and does not commit", func(t *testing.T) {
		mockProv.createErr = errors.New("google api 500 error")

		ctx := contextWithRole("member", "spc_1")
		start := time.Date(2026, 10, 20, 10, 0, 0, 0, time.UTC)
		end := time.Date(2026, 10, 20, 11, 0, 0, 0, time.UTC)

		_, err := coord.CreateEvent(ctx, &appcalendar.CreateEventRequest{
			Event: &domaincalendar.Event{
				CalendarID: "cal_ext_1",
				Title:      "Meeting with External",
				StartTime:  &start,
				EndTime:    &end,
			},
		})
		require.Error(t, err)
		assert.Contains(t, err.Error(), "google api 500 error")

		// Verify event was NOT persisted
		events, _ := evStore.ListByCalendar(context.Background(), "spc_1", "cal_ext_1", nil)
		assert.Empty(t, events)
	})

	t.Run("read-only calendar rejects write", func(t *testing.T) {
		readCal := &domaincalendar.Calendar{
			ID:                 "cal_read_only",
			SpaceID:            "spc_1",
			Name:               "Public Holidays",
			Timezone:           "UTC",
			Source:             domaincalendar.SourceExternal,
			AccessRole:         domaincalendar.AccessRoleReader,
			ConnectedAccountID: &accID,
			ProviderCalendarID: &pCalID,
		}
		require.NoError(t, calStore.Create(context.Background(), readCal))

		ctx := contextWithRole("member", "spc_1")
		start := time.Date(2026, 10, 20, 10, 0, 0, 0, time.UTC)
		end := time.Date(2026, 10, 20, 11, 0, 0, 0, time.UTC)

		_, err := coord.CreateEvent(ctx, &appcalendar.CreateEventRequest{
			Event: &domaincalendar.Event{
				CalendarID: "cal_read_only",
				Title:      "Holiday attempt",
				StartTime:  &start,
				EndTime:    &end,
			},
		})
		require.Error(t, err)
		assert.Contains(t, err.Error(), string(domaincalendar.ErrReadOnlyCalendar))
	})
}

type nilReturningCalendarStore struct {
	*mockCalendarStore
}

func (n *nilReturningCalendarStore) GetByID(ctx context.Context, spaceID, id string) (*domaincalendar.Calendar, error) {
	return nil, nil
}

type nilReturningEventStore struct {
	*mockEventStore
}

func (n *nilReturningEventStore) GetByID(ctx context.Context, spaceID, id string) (*domaincalendar.Event, error) {
	return nil, nil
}

type nilAccountStore struct {
	connector.Store
}

func (n *nilAccountStore) GetAccount(ctx context.Context, spaceID, id string) (*connector.ConnectedAccount, error) {
	return nil, nil
}

func TestCoordinator_NilGuards(t *testing.T) {
	t.Parallel()

	calStore := &nilReturningCalendarStore{mockCalendarStore: newMockCalendarStore()}
	evStore := &nilReturningEventStore{mockEventStore: newMockEventStore()}
	domainSvc := domaincalendar.NewService(domaincalendar.Dependencies{
		CalendarStore: calStore,
		EventStore:    evStore,
	})

	coord := appcalendar.NewCoordinator(appcalendar.Dependencies{
		CalendarStore: calStore,
		EventStore:    evStore,
		DomainService: domainSvc,
		AccountStore:  &nilAccountStore{},
		Events:        eventbus.NoopPublisher{},
	})

	ctx := contextWithRole("member", "spc_1")

	t.Run("CreateEvent missing calendar returns NotExist", func(t *testing.T) {
		_, err := coord.CreateEvent(ctx, &appcalendar.CreateEventRequest{
			Event: &domaincalendar.Event{CalendarID: "cal_missing", Title: "Test"},
		})
		require.Error(t, err)
		assert.True(t, platformerrors.Is(err, platformerrors.NotExist))
	})

	t.Run("UpdateEvent missing event returns NotExist", func(t *testing.T) {
		_, err := coord.UpdateEvent(ctx, &appcalendar.UpdateEventRequest{
			ID:    "cev_missing",
			Event: &domaincalendar.Event{Title: "Test"},
		})
		require.Error(t, err)
		assert.True(t, platformerrors.Is(err, platformerrors.NotExist))
	})

	t.Run("DeleteEvent missing event returns NotExist", func(t *testing.T) {
		err := coord.DeleteEvent(ctx, &appcalendar.DeleteEventRequest{ID: "cev_missing"})
		require.Error(t, err)
		assert.True(t, platformerrors.Is(err, platformerrors.NotExist))
	})

	t.Run("RespondToEvent missing event returns NotExist", func(t *testing.T) {
		_, err := coord.RespondToEvent(ctx, &appcalendar.RespondToEventRequest{ID: "cev_missing", ResponseStatus: "accepted"})
		require.Error(t, err)
		assert.True(t, platformerrors.Is(err, platformerrors.NotExist))
	})

	t.Run("SyncConnectedAccountCalendars nil account returns nil", func(t *testing.T) {
		err := coord.SyncConnectedAccountCalendars(context.Background(), &appcalendar.SyncConnectedAccountCalendarsRequest{
			SpaceID:            "spc_1",
			ConnectedAccountID: "cac_missing",
		})
		require.NoError(t, err)
	})

	t.Run("SyncConnectedAccountCalendars missing spaceID returns Unauthenticated", func(t *testing.T) {
		err := coord.SyncConnectedAccountCalendars(context.Background(), &appcalendar.SyncConnectedAccountCalendarsRequest{
			ConnectedAccountID: "cac_1",
		})
		require.Error(t, err)
		assert.True(t, platformerrors.Is(err, platformerrors.Unauthenticated))
	})
}

func TestCoordinator_UpdateEvent_WriteThroughPreservesProviderIDAndUnmaskedFields(t *testing.T) {
	t.Parallel()

	calStore := newMockCalendarStore()
	evStore := newMockEventStore()
	domainSvc := domaincalendar.NewService(domaincalendar.Dependencies{
		CalendarStore: calStore,
		EventStore:    evStore,
	})
	mockProv := &mockExternalProvider{}
	coord := appcalendar.NewCoordinator(appcalendar.Dependencies{
		CalendarStore:     calStore,
		EventStore:        evStore,
		DomainService:     domainSvc,
		ExternalProviders: map[string]domaincalendar.ExternalCalendarProvider{"google": mockProv},
		Events:            eventbus.NoopPublisher{},
	})

	calID, err := domaincalendar.GenerateCalendarID()
	require.NoError(t, err)
	evID, err := domaincalendar.GenerateEventID()
	require.NoError(t, err)

	accID := "cac_1"
	pCalID := "primary"
	require.NoError(t, calStore.Create(context.Background(), &domaincalendar.Calendar{
		ID:                 calID,
		SpaceID:            "spc_1",
		ConnectedAccountID: &accID,
		ProviderCalendarID: &pCalID,
		Name:               "Ext",
		Timezone:           "UTC",
		Source:             domaincalendar.SourceExternal,
		AccessRole:         domaincalendar.AccessRoleWriter,
		IsEnabled:          true,
	}))

	start := time.Date(2026, 10, 20, 10, 0, 0, 0, time.UTC)
	end := time.Date(2026, 10, 20, 11, 0, 0, 0, time.UTC)
	tz := "UTC"
	pEvID := "g_ev_99"
	require.NoError(t, evStore.Create(context.Background(), &domaincalendar.Event{
		ID:              evID,
		SpaceID:         "spc_1",
		CalendarID:      calID,
		ProviderEventID: &pEvID,
		Title:           "Old Title",
		StartTime:       &start,
		EndTime:         &end,
		Timezone:        &tz,
		Status:          domaincalendar.EventStatusConfirmed,
	}))

	ctx := contextWithRole("member", "spc_1")
	updated, err := coord.UpdateEvent(ctx, &appcalendar.UpdateEventRequest{
		ID:         evID,
		Event:      &domaincalendar.Event{Title: "New Title"},
		UpdateMask: []string{"title"},
	})
	require.NoError(t, err)
	assert.Equal(t, "New Title", updated.Title)
	require.NotNil(t, mockProv.lastUpdatedEvt)
	require.NotNil(t, mockProv.lastUpdatedEvt.ProviderEventID)
	assert.Equal(t, "g_ev_99", *mockProv.lastUpdatedEvt.ProviderEventID)
	assert.Equal(t, "New Title", mockProv.lastUpdatedEvt.Title)
	require.NotNil(t, mockProv.lastUpdatedEvt.StartTime)
	assert.True(t, mockProv.lastUpdatedEvt.StartTime.Equal(start))
}
