package calendaraggregator

import (
	"context"
	"errors"
	"testing"
	"time"

	domaincalendar "github.com/masterkeysrd/saturn/internal/domain/calendar"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestService_GetCalendar(t *testing.T) {
	t.Parallel()

	calReader := &CalendarReaderMock{
		GetByIDFunc: func(ctx context.Context, spaceID, id string) (*domaincalendar.Calendar, error) {
			if id == "cal_found" {
				return &domaincalendar.Calendar{ID: "cal_found", Name: "My Cal"}, nil
			}
			return nil, errors.New("not found")
		},
	}

	svc := NewService(calReader, nil, nil)

	t.Run("success", func(t *testing.T) {
		cal, err := svc.GetCalendar(context.Background(), "spc_1", "cal_found")
		require.NoError(t, err)
		assert.Equal(t, "cal_found", cal.ID)
		assert.Equal(t, "My Cal", cal.Name)
	})

	t.Run("not found propagates error", func(t *testing.T) {
		_, err := svc.GetCalendar(context.Background(), "spc_1", "cal_missing")
		require.Error(t, err)
	})
}

func TestService_ListEvents_ParallelHydration(t *testing.T) {
	t.Parallel()

	start := time.Date(2026, 10, 20, 0, 0, 0, 0, time.UTC)
	end := time.Date(2026, 10, 27, 0, 0, 0, 0, time.UTC)

	t.Run("propagates error when eventReader fails", func(t *testing.T) {
		color := "#3b82f6"
		calReader := &CalendarReaderMock{
			ListBySpaceFunc: func(ctx context.Context, spaceID string, filter *domaincalendar.ListCalendarsFilter) ([]*domaincalendar.Calendar, error) {
				return []*domaincalendar.Calendar{{ID: "cal_1", Name: "Work", Color: &color}}, nil
			},
		}
		eventReader := &EventReaderMock{
			ListInTimeRangeFunc: func(ctx context.Context, spaceID string, calendarIDs []string, startTime, endTime time.Time, startDate, endDate string) ([]*domaincalendar.Event, error) {
				return nil, errors.New("db connection failure")
			},
			ListRecurringMastersFunc: func(ctx context.Context, spaceID string, calendarIDs []string) ([]*domaincalendar.Event, error) {
				return nil, nil
			},
		}

		svc := NewService(calReader, eventReader, nil)
		_, err := svc.ListEvents(context.Background(), "spc_1", nil, start, end, "")
		require.Error(t, err)
		assert.Contains(t, err.Error(), "db connection failure")
	})

	t.Run("combines standalone events, recurring occurrences, and virtual timeline items", func(t *testing.T) {
		color := "#4285F4"
		calReader := &CalendarReaderMock{
			ListBySpaceFunc: func(ctx context.Context, spaceID string, filter *domaincalendar.ListCalendarsFilter) ([]*domaincalendar.Calendar, error) {
				return []*domaincalendar.Calendar{
					{ID: "cal_1", Name: "Work", Color: &color},
				}, nil
			},
		}

		evStart := time.Date(2026, 10, 21, 10, 0, 0, 0, time.UTC)
		evEnd := time.Date(2026, 10, 21, 11, 0, 0, 0, time.UTC)
		rrule := "FREQ=WEEKLY;BYDAY=WE"

		eventReader := &EventReaderMock{
			ListInTimeRangeFunc: func(ctx context.Context, spaceID string, calendarIDs []string, startTime, endTime time.Time, startDate, endDate string) ([]*domaincalendar.Event, error) {
				return []*domaincalendar.Event{
					{
						ID:         "cev_single_1",
						CalendarID: "cal_1",
						Title:      "Product Review",
						StartTime:  &evStart,
						EndTime:    &evEnd,
						Status:     domaincalendar.EventStatusConfirmed,
					},
				}, nil
			},
			ListRecurringMastersFunc: func(ctx context.Context, spaceID string, calendarIDs []string) ([]*domaincalendar.Event, error) {
				mStart := time.Date(2026, 10, 14, 14, 0, 0, 0, time.UTC)
				mEnd := time.Date(2026, 10, 14, 15, 0, 0, 0, time.UTC)
				tz := "UTC"
				return []*domaincalendar.Event{
					{
						ID:         "cev_master_1",
						CalendarID: "cal_1",
						Title:      "Team Weekly",
						StartTime:  &mStart,
						EndTime:    &mEnd,
						Timezone:   &tz,
						RRULE:      &rrule,
						Status:     domaincalendar.EventStatusConfirmed,
					},
				}, nil
			},
			ListExceptionsByMasterIDsFunc: func(ctx context.Context, spaceID string, masterIDs []string) ([]*domaincalendar.Event, error) {
				return nil, nil
			},
		}

		mockTimeline := &TimelineSourceMock{
			SourceTypeFunc: func() string { return "bill" },
			FetchOccurrencesFunc: func(ctx context.Context, spaceID string, rangeStart, rangeEnd time.Time) ([]VirtualOccurrence, error) {
				return []VirtualOccurrence{
					{
						ID:         "v_bill_1",
						Title:      "AWS Monthly Invoice Due",
						StartTime:  time.Date(2026, 10, 22, 9, 0, 0, 0, time.UTC),
						EndTime:    time.Date(2026, 10, 22, 9, 0, 0, 0, time.UTC),
						Color:      "#f59e0b",
						SourceType: "bill",
					},
				}, nil
			},
		}

		svc := NewService(calReader, eventReader, nil, mockTimeline)

		occurrences, err := svc.ListEvents(context.Background(), "spc_1", []string{"cal_1"}, start, end, "")
		require.NoError(t, err)

		// Expecting:
		// 1. cev_single_1 (Oct 21 10:00)
		// 2. Expanded instance of cev_master_1 (Oct 21 14:00)
		// 3. v_bill_1 (Oct 22 09:00)
		assert.Len(t, occurrences, 3)

		assert.Equal(t, "Product Review", occurrences[0].Title)
		assert.Equal(t, "#4285F4", occurrences[0].Color)
		assert.Equal(t, "Work", occurrences[0].CalendarName)

		assert.Equal(t, "Team Weekly", occurrences[1].Title)
		assert.Equal(t, "cev_master_1", *occurrences[1].MasterID)

		assert.Equal(t, "AWS Monthly Invoice Due", occurrences[2].Title)
		assert.True(t, occurrences[2].IsVirtual)
		assert.Equal(t, "bill", occurrences[2].SourceType)
	})

	t.Run("filters occurrences by search query", func(t *testing.T) {
		calReader := &CalendarReaderMock{
			ListBySpaceFunc: func(ctx context.Context, spaceID string, filter *domaincalendar.ListCalendarsFilter) ([]*domaincalendar.Calendar, error) {
				return []*domaincalendar.Calendar{{ID: "cal_1", Name: "Work"}}, nil
			},
		}

		ev1Start := time.Date(2026, 10, 21, 10, 0, 0, 0, time.UTC)
		ev2Start := time.Date(2026, 10, 22, 10, 0, 0, 0, time.UTC)

		eventReader := &EventReaderMock{
			ListInTimeRangeFunc: func(ctx context.Context, spaceID string, calendarIDs []string, startTime, endTime time.Time, startDate, endDate string) ([]*domaincalendar.Event, error) {
				return []*domaincalendar.Event{
					{ID: "cev_1", CalendarID: "cal_1", Title: "Design Review", StartTime: &ev1Start, EndTime: &ev1Start},
					{ID: "cev_2", CalendarID: "cal_1", Title: "Sprint Planning", StartTime: &ev2Start, EndTime: &ev2Start},
				}, nil
			},
			ListRecurringMastersFunc: func(ctx context.Context, spaceID string, calendarIDs []string) ([]*domaincalendar.Event, error) {
				return nil, nil
			},
		}

		svc := NewService(calReader, eventReader, nil)

		occurrences, err := svc.ListEvents(context.Background(), "spc_1", []string{"cal_1"}, start, end, "design")
		require.NoError(t, err)
		require.Len(t, occurrences, 1)
		assert.Equal(t, "Design Review", occurrences[0].Title)
	})
}
