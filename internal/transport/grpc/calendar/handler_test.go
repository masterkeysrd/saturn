package calendar_test

import (
	"context"
	"testing"
	"time"

	calendarv1 "github.com/masterkeysrd/saturn/apis/saturn/calendar/v1"
	calendaraggregator "github.com/masterkeysrd/saturn/internal/aggregator/calendar"
	appcalendar "github.com/masterkeysrd/saturn/internal/application/calendar"
	domaincalendar "github.com/masterkeysrd/saturn/internal/domain/calendar"
	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	grpccalendar "github.com/masterkeysrd/saturn/internal/transport/grpc/calendar"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/protobuf/types/known/timestamppb"
)

type mockCoordinator struct {
	createCalendarFunc func(ctx context.Context, req *appcalendar.CreateCalendarRequest) (*domaincalendar.Calendar, error)
	updateCalendarFunc func(ctx context.Context, req *appcalendar.UpdateCalendarRequest) (*domaincalendar.Calendar, error)
	deleteCalendarFunc func(ctx context.Context, req *appcalendar.DeleteCalendarRequest) error
	ensureDefaultFunc  func(ctx context.Context, req *appcalendar.EnsureDefaultCalendarRequest) (*domaincalendar.Calendar, error)
	createEventFunc    func(ctx context.Context, req *appcalendar.CreateEventRequest) (*domaincalendar.Event, error)
	updateEventFunc    func(ctx context.Context, req *appcalendar.UpdateEventRequest) (*domaincalendar.Event, error)
	deleteEventFunc    func(ctx context.Context, req *appcalendar.DeleteEventRequest) error
	respondToEventFunc func(ctx context.Context, req *appcalendar.RespondToEventRequest) (*domaincalendar.Event, error)
	syncFunc           func(ctx context.Context, req *appcalendar.SyncConnectedAccountCalendarsRequest) error
}

func (m *mockCoordinator) CreateCalendar(ctx context.Context, req *appcalendar.CreateCalendarRequest) (*domaincalendar.Calendar, error) {
	if m.createCalendarFunc != nil {
		return m.createCalendarFunc(ctx, req)
	}
	return nil, nil
}
func (m *mockCoordinator) UpdateCalendar(ctx context.Context, req *appcalendar.UpdateCalendarRequest) (*domaincalendar.Calendar, error) {
	if m.updateCalendarFunc != nil {
		return m.updateCalendarFunc(ctx, req)
	}
	return nil, nil
}
func (m *mockCoordinator) DeleteCalendar(ctx context.Context, req *appcalendar.DeleteCalendarRequest) error {
	if m.deleteCalendarFunc != nil {
		return m.deleteCalendarFunc(ctx, req)
	}
	return nil
}
func (m *mockCoordinator) EnsureDefaultCalendar(ctx context.Context, req *appcalendar.EnsureDefaultCalendarRequest) (*domaincalendar.Calendar, error) {
	if m.ensureDefaultFunc != nil {
		return m.ensureDefaultFunc(ctx, req)
	}
	return nil, nil
}
func (m *mockCoordinator) CreateEvent(ctx context.Context, req *appcalendar.CreateEventRequest) (*domaincalendar.Event, error) {
	if m.createEventFunc != nil {
		return m.createEventFunc(ctx, req)
	}
	return nil, nil
}
func (m *mockCoordinator) UpdateEvent(ctx context.Context, req *appcalendar.UpdateEventRequest) (*domaincalendar.Event, error) {
	if m.updateEventFunc != nil {
		return m.updateEventFunc(ctx, req)
	}
	return nil, nil
}
func (m *mockCoordinator) DeleteEvent(ctx context.Context, req *appcalendar.DeleteEventRequest) error {
	if m.deleteEventFunc != nil {
		return m.deleteEventFunc(ctx, req)
	}
	return nil
}
func (m *mockCoordinator) RespondToEvent(ctx context.Context, req *appcalendar.RespondToEventRequest) (*domaincalendar.Event, error) {
	if m.respondToEventFunc != nil {
		return m.respondToEventFunc(ctx, req)
	}
	return nil, nil
}
func (m *mockCoordinator) SyncConnectedAccountCalendars(ctx context.Context, req *appcalendar.SyncConnectedAccountCalendarsRequest) error {
	if m.syncFunc != nil {
		return m.syncFunc(ctx, req)
	}
	return nil
}

type mockCalendarReader struct {
	getByIDFunc     func(ctx context.Context, spaceID, id string) (*domaincalendar.Calendar, error)
	listBySpaceFunc func(ctx context.Context, spaceID string, filter *domaincalendar.ListCalendarsFilter) ([]*domaincalendar.Calendar, error)
}

func (m *mockCalendarReader) GetByID(ctx context.Context, spaceID, id string) (*domaincalendar.Calendar, error) {
	if m.getByIDFunc != nil {
		return m.getByIDFunc(ctx, spaceID, id)
	}
	return nil, nil
}
func (m *mockCalendarReader) ListBySpace(ctx context.Context, spaceID string, filter *domaincalendar.ListCalendarsFilter) ([]*domaincalendar.Calendar, error) {
	if m.listBySpaceFunc != nil {
		return m.listBySpaceFunc(ctx, spaceID, filter)
	}
	return nil, nil
}

type mockEventReader struct {
	getByIDFunc              func(ctx context.Context, spaceID, id string) (*domaincalendar.Event, error)
	listByCalendarFunc       func(ctx context.Context, spaceID, calendarID string, filter *domaincalendar.ListEventsFilter) ([]*domaincalendar.Event, error)
	listInTimeRangeFunc      func(ctx context.Context, spaceID string, calendarIDs []string, startTime, endTime time.Time, startDate, endDate string) ([]*domaincalendar.Event, error)
	listRecurringMastersFunc func(ctx context.Context, spaceID string, calendarIDs []string) ([]*domaincalendar.Event, error)
	listExceptionsFunc       func(ctx context.Context, spaceID string, masterIDs []string) ([]*domaincalendar.Event, error)
}

func (m *mockEventReader) GetByID(ctx context.Context, spaceID, id string) (*domaincalendar.Event, error) {
	if m.getByIDFunc != nil {
		return m.getByIDFunc(ctx, spaceID, id)
	}
	return nil, nil
}
func (m *mockEventReader) ListByCalendar(ctx context.Context, spaceID, calendarID string, filter *domaincalendar.ListEventsFilter) ([]*domaincalendar.Event, error) {
	if m.listByCalendarFunc != nil {
		return m.listByCalendarFunc(ctx, spaceID, calendarID, filter)
	}
	return nil, nil
}
func (m *mockEventReader) ListInTimeRange(ctx context.Context, spaceID string, calendarIDs []string, startTime, endTime time.Time, startDate, endDate string) ([]*domaincalendar.Event, error) {
	if m.listInTimeRangeFunc != nil {
		return m.listInTimeRangeFunc(ctx, spaceID, calendarIDs, startTime, endTime, startDate, endDate)
	}
	return nil, nil
}
func (m *mockEventReader) ListRecurringMasters(ctx context.Context, spaceID string, calendarIDs []string) ([]*domaincalendar.Event, error) {
	if m.listRecurringMastersFunc != nil {
		return m.listRecurringMastersFunc(ctx, spaceID, calendarIDs)
	}
	return nil, nil
}
func (m *mockEventReader) ListExceptionsByMasterIDs(ctx context.Context, spaceID string, masterIDs []string) ([]*domaincalendar.Event, error) {
	if m.listExceptionsFunc != nil {
		return m.listExceptionsFunc(ctx, spaceID, masterIDs)
	}
	return nil, nil
}

func contextWithScope(spaceID, role string) context.Context {
	return auth.WithSpaceScope(context.Background(), spaceID, role)
}

func TestHandler_CalendarOperations(t *testing.T) {
	t.Parallel()

	mockCoord := &mockCoordinator{
		createCalendarFunc: func(ctx context.Context, req *appcalendar.CreateCalendarRequest) (*domaincalendar.Calendar, error) {
			return &domaincalendar.Calendar{
				ID:       "cal_created",
				SpaceID:  "spc_1",
				Name:     req.Calendar.Name,
				Timezone: req.Calendar.Timezone,
			}, nil
		},
		ensureDefaultFunc: func(ctx context.Context, req *appcalendar.EnsureDefaultCalendarRequest) (*domaincalendar.Calendar, error) {
			return &domaincalendar.Calendar{
				ID:              "cal_default",
				SpaceID:         "spc_1",
				Name:            "Primary",
				IsDefaultNative: true,
			}, nil
		},
		deleteCalendarFunc: func(ctx context.Context, req *appcalendar.DeleteCalendarRequest) error {
			return nil
		},
	}

	mockCalReader := &mockCalendarReader{
		getByIDFunc: func(ctx context.Context, spaceID, id string) (*domaincalendar.Calendar, error) {
			return &domaincalendar.Calendar{
				ID:      id,
				SpaceID: spaceID,
				Name:    "Work Calendar",
			}, nil
		},
		listBySpaceFunc: func(ctx context.Context, spaceID string, filter *domaincalendar.ListCalendarsFilter) ([]*domaincalendar.Calendar, error) {
			return []*domaincalendar.Calendar{
				{ID: "cal_1", SpaceID: spaceID, Name: "Primary", IsDefaultNative: true},
			}, nil
		},
	}

	agg := calendaraggregator.NewService(mockCalReader, nil, nil)
	handler := grpccalendar.NewHandler(mockCoord, agg)

	t.Run("ListCalendars returns proto list", func(t *testing.T) {
		ctx := contextWithScope("spc_1", "member")
		res, err := handler.ListCalendars(ctx, &calendarv1.ListCalendarsRequest{})
		require.NoError(t, err)
		assert.Len(t, res.GetCalendars(), 1)
		assert.Equal(t, "cal_1", res.GetCalendars()[0].GetId())
	})

	t.Run("GetCalendar returns proto calendar", func(t *testing.T) {
		ctx := contextWithScope("spc_1", "member")
		cal, err := handler.GetCalendar(ctx, &calendarv1.GetCalendarRequest{Id: "cal_1"})
		require.NoError(t, err)
		assert.Equal(t, "cal_1", cal.GetId())
		assert.Equal(t, "Work Calendar", cal.GetName())
	})

	t.Run("CreateCalendar delegates to coordinator", func(t *testing.T) {
		ctx := contextWithScope("spc_1", "admin")
		cal, err := handler.CreateCalendar(ctx, &calendarv1.CreateCalendarRequest{
			Calendar: &calendarv1.Calendar{Name: "New Calendar", Timezone: "UTC"},
		})
		require.NoError(t, err)
		assert.Equal(t, "cal_created", cal.GetId())
		assert.Equal(t, "New Calendar", cal.GetName())
	})

	t.Run("EnsureDefaultCalendar delegates to coordinator", func(t *testing.T) {
		ctx := contextWithScope("spc_1", "admin")
		cal, err := handler.EnsureDefaultCalendar(ctx, &calendarv1.EnsureDefaultCalendarRequest{})
		require.NoError(t, err)
		assert.Equal(t, "cal_default", cal.GetId())
		assert.True(t, cal.GetIsDefaultNative())
	})

	t.Run("DeleteCalendar delegates to coordinator", func(t *testing.T) {
		ctx := contextWithScope("spc_1", "admin")
		_, err := handler.DeleteCalendar(ctx, &calendarv1.DeleteCalendarRequest{Id: "cal_to_delete"})
		require.NoError(t, err)
	})
}

func TestHandler_EventOperations(t *testing.T) {
	t.Parallel()

	start := time.Date(2026, 10, 20, 10, 0, 0, 0, time.UTC)
	end := time.Date(2026, 10, 20, 11, 0, 0, 0, time.UTC)

	mockCoord := &mockCoordinator{
		createEventFunc: func(ctx context.Context, req *appcalendar.CreateEventRequest) (*domaincalendar.Event, error) {
			return &domaincalendar.Event{
				ID:         "cev_created",
				CalendarID: req.Event.CalendarID,
				Title:      req.Event.Title,
				StartTime:  &start,
				EndTime:    &end,
			}, nil
		},
		respondToEventFunc: func(ctx context.Context, req *appcalendar.RespondToEventRequest) (*domaincalendar.Event, error) {
			return &domaincalendar.Event{
				ID:    req.ID,
				Title: "RSVP Event",
			}, nil
		},
	}

	mockEventReader := &mockEventReader{
		getByIDFunc: func(ctx context.Context, spaceID, id string) (*domaincalendar.Event, error) {
			return &domaincalendar.Event{
				ID:         id,
				CalendarID: "cal_1",
				Title:      "Team Sync",
				StartTime:  &start,
				EndTime:    &end,
			}, nil
		},
		listInTimeRangeFunc: func(ctx context.Context, spaceID string, calendarIDs []string, startTime, endTime time.Time, startDate, endDate string) ([]*domaincalendar.Event, error) {
			return []*domaincalendar.Event{
				{
					ID:         "cev_in_range",
					CalendarID: "cal_1",
					Title:      "Viewport Event",
					StartTime:  &start,
					EndTime:    &end,
				},
			}, nil
		},
		listRecurringMastersFunc: func(ctx context.Context, spaceID string, calendarIDs []string) ([]*domaincalendar.Event, error) {
			return nil, nil
		},
	}

	mockCalReader := &mockCalendarReader{
		listBySpaceFunc: func(ctx context.Context, spaceID string, filter *domaincalendar.ListCalendarsFilter) ([]*domaincalendar.Calendar, error) {
			return []*domaincalendar.Calendar{
				{ID: "cal_1", SpaceID: spaceID, Name: "Primary"},
			}, nil
		},
	}

	agg := calendaraggregator.NewService(mockCalReader, mockEventReader, nil)
	handler := grpccalendar.NewHandler(mockCoord, agg)

	t.Run("ListEvents returns expanded occurrences in viewport", func(t *testing.T) {
		ctx := contextWithScope("spc_1", "member")
		res, err := handler.ListEvents(ctx, &calendarv1.ListEventsRequest{
			TimeMin: timestamppb.New(start.Add(-1 * time.Hour)),
			TimeMax: timestamppb.New(end.Add(1 * time.Hour)),
		})
		require.NoError(t, err)
		assert.Len(t, res.GetOccurrences(), 1)
		assert.Equal(t, "cev_in_range", res.GetOccurrences()[0].GetEventId())
		assert.Equal(t, "Viewport Event", res.GetOccurrences()[0].GetTitle())
	})

	t.Run("GetEvent returns event", func(t *testing.T) {
		ctx := contextWithScope("spc_1", "member")
		ev, err := handler.GetEvent(ctx, &calendarv1.GetEventRequest{Id: "cev_123"})
		require.NoError(t, err)
		assert.Equal(t, "cev_123", ev.GetId())
		assert.Equal(t, "Team Sync", ev.GetTitle())
	})

	t.Run("CreateEvent delegates to coordinator", func(t *testing.T) {
		ctx := contextWithScope("spc_1", "member")
		ev, err := handler.CreateEvent(ctx, &calendarv1.CreateEventRequest{
			Event: &calendarv1.Event{
				CalendarId: "cal_1",
				Title:      "New Meet",
				StartTime:  timestamppb.New(start),
				EndTime:    timestamppb.New(end),
			},
		})
		require.NoError(t, err)
		assert.Equal(t, "cev_created", ev.GetId())
	})

	t.Run("RespondToEvent delegates to coordinator", func(t *testing.T) {
		ctx := contextWithScope("spc_1", "member")
		ev, err := handler.RespondToEvent(ctx, &calendarv1.RespondToEventRequest{
			Id:       "cev_123",
			Response: calendarv1.AttendeeResponseStatus_ATTENDEE_RESPONSE_STATUS_ACCEPTED,
		})
		require.NoError(t, err)
		assert.Equal(t, "cev_123", ev.GetId())
	})
}
