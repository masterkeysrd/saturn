package calendar_test

import (
	"context"
	"slices"
	"testing"
	"time"

	appcalendar "github.com/masterkeysrd/saturn/internal/application/calendar"
	domaincalendar "github.com/masterkeysrd/saturn/internal/domain/calendar"
	"github.com/masterkeysrd/saturn/internal/platform/eventbus"
	"github.com/masterkeysrd/saturn/internal/platform/workflow"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type workflowEventStore struct {
	*mockEventStore
}

func (s *workflowEventStore) ListInTimeRange(
	_ context.Context,
	spaceID string,
	calendarIDs []string,
	startTime, endTime time.Time,
	startDate, endDate string,
) ([]*domaincalendar.Event, error) {
	var out []*domaincalendar.Event
	for _, ev := range s.events {
		if ev.SpaceID != spaceID || !slices.Contains(calendarIDs, ev.CalendarID) {
			continue
		}
		if ev.IsAllDay {
			if ev.StartDate != nil && ev.EndDate != nil && *ev.EndDate > startDate && *ev.StartDate < endDate {
				out = append(out, ev)
			}
			continue
		}
		if ev.StartTime != nil && ev.EndTime != nil && ev.EndTime.After(startTime) && ev.StartTime.Before(endTime) {
			out = append(out, ev)
		}
	}
	return out, nil
}

func newCalendarWorkflowTestSetup(t *testing.T) (
	*workflow.Registry,
	*mockCalendarStore,
	*workflowEventStore,
) {
	t.Helper()
	calStore := newMockCalendarStore()
	evStore := &workflowEventStore{mockEventStore: newMockEventStore()}
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

	reg := workflow.NewRegistry()
	appcalendar.RegisterWorkflows(reg, appcalendar.WorkflowDependencies{
		Coordinator:   coord,
		CalendarStore: calStore,
		EventStore:    evStore,
		DomainService: domainSvc,
	})
	return reg, calStore, evStore
}

func TestCalendarRegisterWorkflows(t *testing.T) {
	reg, _, _ := newCalendarWorkflowTestSetup(t)

	for _, name := range []string{"calendar.calendars", "calendar.events", "calendar.event"} {
		desc, loader, ok := reg.GetLoader(name)
		require.True(t, ok, "expected loader %q", name)
		require.NotNil(t, loader)
		assert.NotNil(t, desc.ParamsSchema)
		assert.NotNil(t, desc.OutputSchema)
	}

	desc, handler, ok := reg.GetStep("calendar.upsert_event")
	require.True(t, ok)
	require.NotNil(t, handler)
	assert.Equal(t, []string{"calendar."}, desc.InvalidatesPrefixes)
	assert.NotNil(t, desc.InputsSchema)
	assert.NotNil(t, desc.OutputSchema)
}

func TestCalendarLoaders(t *testing.T) {
	t.Run("calendar.calendars", func(t *testing.T) {
		reg, calStore, _ := newCalendarWorkflowTestSetup(t)
		require.NoError(t, calStore.Create(t.Context(), &domaincalendar.Calendar{
			ID:              "cal_rw",
			SpaceID:         "spc_1",
			Name:            "Primary",
			Source:          domaincalendar.SourceNative,
			AccessRole:      domaincalendar.AccessRoleOwner,
			Timezone:        "UTC",
			IsPrimary:       true,
			IsEnabled:       true,
			IsDefaultNative: true,
		}))
		require.NoError(t, calStore.Create(t.Context(), &domaincalendar.Calendar{
			ID:         "cal_ro",
			SpaceID:    "spc_1",
			Name:       "Holidays",
			Source:     domaincalendar.SourceNative,
			AccessRole: domaincalendar.AccessRoleReader,
			Timezone:   "UTC",
			IsEnabled:  true,
		}))

		_, loader, _ := reg.GetLoader("calendar.calendars")

		tests := []struct {
			name      string
			params    map[string]any
			wantCount int
		}{
			{name: "AllCalendars", params: map[string]any{}, wantCount: 2},
			{name: "WritableOnly", params: map[string]any{"writable_only": true}, wantCount: 1},
		}
		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				res, err := loader.Load(t.Context(), "spc_1", tc.params)
				require.NoError(t, err)
				items := res.([]any)
				assert.Len(t, items, tc.wantCount)
			})
		}
	})

	t.Run("calendar.events", func(t *testing.T) {
		reg, calStore, evStore := newCalendarWorkflowTestSetup(t)
		require.NoError(t, calStore.Create(t.Context(), &domaincalendar.Calendar{
			ID:              "cal_primary",
			SpaceID:         "spc_1",
			Name:            "Primary",
			Source:          domaincalendar.SourceNative,
			AccessRole:      domaincalendar.AccessRoleOwner,
			Timezone:        "UTC",
			IsPrimary:       true,
			IsEnabled:       true,
			IsDefaultNative: true,
		}))
		tz := "UTC"
		t1Start := time.Date(2026, 5, 10, 14, 0, 0, 0, time.UTC)
		t1End := time.Date(2026, 5, 10, 15, 0, 0, 0, time.UTC)
		t2Start := time.Date(2026, 5, 11, 10, 0, 0, 0, time.UTC)
		t2End := time.Date(2026, 5, 11, 11, 0, 0, 0, time.UTC)
		require.NoError(t, evStore.Create(t.Context(), &domaincalendar.Event{
			ID:         "cev_1",
			SpaceID:    "spc_1",
			CalendarID: "cal_primary",
			Title:      "Dentist Appointment",
			Status:     domaincalendar.EventStatusConfirmed,
			StartTime:  &t1Start,
			EndTime:    &t1End,
			Timezone:   &tz,
		}))
		require.NoError(t, evStore.Create(t.Context(), &domaincalendar.Event{
			ID:         "cev_2",
			SpaceID:    "spc_1",
			CalendarID: "cal_primary",
			Title:      "Team Standup",
			Status:     domaincalendar.EventStatusConfirmed,
			StartTime:  &t2Start,
			EndTime:    &t2End,
			Timezone:   &tz,
		}))

		_, loader, _ := reg.GetLoader("calendar.events")

		tests := []struct {
			name      string
			params    map[string]any
			wantCount int
			wantErr   bool
		}{
			{
				name: "PrimaryWindow",
				params: map[string]any{
					"calendar_id": "primary",
					"start_time":  "2026-05-01T00:00:00Z",
					"end_time":    "2026-05-31T00:00:00Z",
				},
				wantCount: 2,
			},
			{
				name: "QueryFilter",
				params: map[string]any{
					"start_time": "2026-05-01T00:00:00Z",
					"end_time":   "2026-05-31T00:00:00Z",
					"query":      "dentist",
				},
				wantCount: 1,
			},
			{
				name:    "InvalidStartTime",
				params:  map[string]any{"start_time": "not-a-time", "end_time": "2026-05-31T00:00:00Z"},
				wantErr: true,
			},
		}
		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				res, err := loader.Load(t.Context(), "spc_1", tc.params)
				if tc.wantErr {
					require.Error(t, err)
					return
				}
				require.NoError(t, err)
				assert.Len(t, res.([]any), tc.wantCount)
			})
		}
	})

	t.Run("calendar.event", func(t *testing.T) {
		reg, calStore, evStore := newCalendarWorkflowTestSetup(t)
		require.NoError(t, calStore.Create(t.Context(), &domaincalendar.Calendar{
			ID:         "cal_1",
			SpaceID:    "spc_1",
			Name:       "Primary",
			Source:     domaincalendar.SourceNative,
			AccessRole: domaincalendar.AccessRoleOwner,
			Timezone:   "UTC",
			IsEnabled:  true,
		}))
		dStart := "2026-06-01"
		dEnd := "2026-06-02"
		require.NoError(t, evStore.Create(t.Context(), &domaincalendar.Event{
			ID:         "cev_exact",
			SpaceID:    "spc_1",
			CalendarID: "cal_1",
			Title:      "Flight",
			IsAllDay:   true,
			StartDate:  &dStart,
			EndDate:    &dEnd,
		}))

		_, loader, _ := reg.GetLoader("calendar.event")

		res, err := loader.Load(t.Context(), "spc_1", map[string]any{"id": "cev_exact"})
		require.NoError(t, err)
		require.NotNil(t, res)
		assert.Equal(t, "Flight", res.(map[string]any)["title"])

		nilRes, err := loader.Load(t.Context(), "spc_1", map[string]any{})
		require.NoError(t, err)
		assert.Nil(t, nilRes)
	})
}

func TestCalendarUpsertEventStep(t *testing.T) {
	t.Run("IdempotentTimedAndAllDayUpserts", func(t *testing.T) {
		reg, calStore, evStore := newCalendarWorkflowTestSetup(t)
		require.NoError(t, calStore.Create(t.Context(), &domaincalendar.Calendar{
			ID:              "cal_primary",
			SpaceID:         "spc_1",
			Name:            "Primary",
			Source:          domaincalendar.SourceNative,
			AccessRole:      domaincalendar.AccessRoleOwner,
			Timezone:        "America/New_York",
			IsPrimary:       true,
			IsEnabled:       true,
			IsDefaultNative: true,
		}))

		_, upsertHandler, _ := reg.GetStep("calendar.upsert_event")
		_, eventLoader, _ := reg.GetLoader("calendar.event")

		state := &workflow.FlowState{
			Space: workflow.SpaceContext{ID: "spc_1", Timezone: "America/New_York"},
		}

		// 1. Initial create by external_ref
		out1, err := upsertHandler.Execute(t.Context(), &workflow.StepExecutionContext{
			SpaceID: "spc_1",
			State:   state,
			Inputs: map[string]any{
				"external_ref": "bill:netflix:2026-05",
				"calendar_id":  "primary",
				"title":        "Netflix Due",
				"start_time":   "2026-05-15T09:00:00Z",
			},
		})
		require.NoError(t, err)
		assert.Equal(t, true, out1["created"])
		eventID := out1["event_id"].(string)
		require.NotEmpty(t, eventID)

		// 2. Lookup by external_ref via calendar.event DataLoader
		loaded, err := eventLoader.Load(t.Context(), "spc_1", map[string]any{"external_ref": "bill:netflix:2026-05"})
		require.NoError(t, err)
		require.NotNil(t, loaded)
		assert.Equal(t, eventID, loaded.(map[string]any)["id"])

		// 3. Re-upsert with updated title/location -> updates existing event, created=false
		out2, err := upsertHandler.Execute(t.Context(), &workflow.StepExecutionContext{
			SpaceID: "spc_1",
			State:   state,
			Inputs: map[string]any{
				"external_ref": "bill:netflix:2026-05",
				"calendar_id":  "primary",
				"title":        "Netflix Due ($15.99)",
				"location":     "Autopay",
				"start_time":   "2026-05-15T09:00:00Z",
			},
		})
		require.NoError(t, err)
		assert.Equal(t, false, out2["created"])
		assert.Equal(t, eventID, out2["event_id"])
		assert.Equal(t, "Netflix Due ($15.99)", evStore.events[eventID].Title)

		// 4. All-day event with auto end_date (+1 day)
		outAllDay, err := upsertHandler.Execute(t.Context(), &workflow.StepExecutionContext{
			SpaceID: "spc_1",
			State:   state,
			Inputs: map[string]any{
				"calendar_id": "primary",
				"title":       "Tax Day",
				"is_all_day":  true,
				"start_date":  "2026-04-15",
			},
		})
		require.NoError(t, err)
		assert.Equal(t, true, outAllDay["created"])
		allDayEv := evStore.events[outAllDay["event_id"].(string)]
		require.NotNil(t, allDayEv.EndDate)
		assert.Equal(t, "2026-04-16", *allDayEv.EndDate)
	})

	t.Run("ValidationErrors", func(t *testing.T) {
		reg, _, _ := newCalendarWorkflowTestSetup(t)
		_, upsertHandler, _ := reg.GetStep("calendar.upsert_event")

		_, err := upsertHandler.Execute(t.Context(), &workflow.StepExecutionContext{
			SpaceID: "spc_1",
			Inputs:  map[string]any{"calendar_id": "primary", "title": ""},
		})
		require.Error(t, err)
	})

	t.Run("EngineExecutionInvalidatesCalendarLoaderCache", func(t *testing.T) {
		reg, _, _ := newCalendarWorkflowTestSetup(t)
		engine, err := workflow.NewEngine(workflow.Dependencies{Registry: reg})
		require.NoError(t, err)

		flow := &workflow.Flow{
			ID:      "flw_cal",
			Name:    "Calendar Reminder",
			Version: 1,
			Steps: []workflow.StepNode{
				workflow.ActionStep(workflow.ActionStepConfig[appcalendar.UpsertEventInputs]{
					ID:   "upsert",
					Type: "calendar.upsert_event",
					Inputs: appcalendar.UpsertEventInputs{
						ExternalRef: "rem_1",
						CalendarID:  "primary",
						Title:       "Pay Rent",
						IsAllDay:    true,
						StartDate:   "2026-05-01",
					},
				}),
			},
		}

		run, err := engine.Execute(t.Context(), workflow.ExecuteOptions{
			Flow:    flow,
			Space:   workflow.SpaceContext{ID: "spc_1", Timezone: "UTC"},
			Persist: false,
		})
		require.NoError(t, err)
		assert.Equal(t, workflow.RunCompleted, run.Status)
		require.Len(t, run.StepRuns, 1)
		assert.Equal(t, true, run.StepRuns[0].Output["created"])
	})
}
