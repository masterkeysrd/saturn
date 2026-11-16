package mcpcalendar

import (
	"context"
	"testing"
	"time"

	calendaraggregator "github.com/masterkeysrd/saturn/internal/aggregator/calendar"
	calendarapp "github.com/masterkeysrd/saturn/internal/application/calendar"
	spaceapp "github.com/masterkeysrd/saturn/internal/application/space"
	domaincalendar "github.com/masterkeysrd/saturn/internal/domain/calendar"
	"github.com/masterkeysrd/saturn/internal/domain/identity"
	"github.com/masterkeysrd/saturn/internal/domain/space"
	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/settings"
	mcptransport "github.com/masterkeysrd/saturn/internal/transport/mcp"
	sdkmcp "github.com/modelcontextprotocol/go-sdk/mcp"
)

func TestCalendarHandler(t *testing.T) {
	tests := []struct {
		name       string
		ctx        context.Context
		toolName   string
		args       map[string]any
		setupMocks func(agg *CalendarAggregatorMock, coord *CalendarCoordinatorMock, ss *SpaceSettingsReaderMock)
		wantErr    bool
		assertOut  func(t *testing.T, out map[string]any)
	}{
		{
			name: "list calendars succeeds",
			ctx: auth.WithSpaceScope(
				auth.WithPrincipal(context.Background(), auth.Principal{Subject: "usr_1"}),
				"spc_1",
				string(space.RoleViewer),
			),
			toolName: "calendar_list_calendars",
			args:     map[string]any{},
			setupMocks: func(agg *CalendarAggregatorMock, _ *CalendarCoordinatorMock, _ *SpaceSettingsReaderMock) {
				agg.ListCalendarsFunc = func(_ context.Context, spaceID string) ([]*domaincalendar.Calendar, error) {
					if spaceID != "spc_1" {
						t.Errorf("unexpected spaceID %q", spaceID)
					}
					return []*domaincalendar.Calendar{
						{
							ID:         "cal_1",
							Name:       "Personal",
							Source:     domaincalendar.SourceNative,
							Timezone:   "America/New_York",
							AccessRole: domaincalendar.AccessRoleOwner,
							IsPrimary:  true,
							IsEnabled:  true,
						},
					}, nil
				}
			},
			assertOut: func(t *testing.T, out map[string]any) {
				cals := out["calendars"].([]any)
				if len(cals) != 1 || cals[0].(map[string]any)["can_write"] != true {
					t.Errorf("unexpected calendars: %+v", cals)
				}
			},
		},
		{
			name: "list events localizes times to workspace timezone",
			ctx: auth.WithSpaceScope(
				auth.WithPrincipal(context.Background(), auth.Principal{Subject: "usr_1"}),
				"spc_1",
				string(space.RoleMember),
			),
			toolName: "calendar_list_events",
			args: map[string]any{
				"time_min": "2026-04-15",
				"time_max": "2026-04-16",
			},
			setupMocks: func(agg *CalendarAggregatorMock, _ *CalendarCoordinatorMock, ss *SpaceSettingsReaderMock) {
				ss.GetSettingsFunc = func(_ context.Context, _ *spaceapp.GetSettingsRequest) (*settings.Entry[space.Settings], error) {
					return &settings.Entry[space.Settings]{Value: space.Settings{Timezone: "America/New_York"}}, nil
				}
				agg.ListEventsFunc = func(_ context.Context, _ string, _ []string, _, _ time.Time, _ string) ([]*calendaraggregator.OccurrenceProjection, error) {
					utcTime := time.Date(2026, 4, 15, 14, 0, 0, 0, time.UTC)
					return []*calendaraggregator.OccurrenceProjection{
						{
							EventID:    "cev_1",
							CalendarID: "cal_1",
							Title:      "Standup",
							StartTime:  new(utcTime),
							EndTime:    new(utcTime.Add(30 * time.Minute)),
							Timezone:   "America/New_York",
							Status:     domaincalendar.EventStatusConfirmed,
						},
					}, nil
				}
			},
			assertOut: func(t *testing.T, out map[string]any) {
				if out["workspace_timezone"] != "America/New_York" {
					t.Errorf("workspace_timezone = %v", out["workspace_timezone"])
				}
				evs := out["events"].([]any)
				if evs[0].(map[string]any)["start_time"] != "2026-04-15T10:00:00-04:00" {
					t.Errorf("expected localized start_time, got %v", evs[0].(map[string]any)["start_time"])
				}
			},
		},
		{
			name: "create event succeeds",
			ctx: auth.WithSpaceScope(
				auth.WithPrincipal(context.Background(), auth.Principal{Subject: "usr_1"}),
				"spc_1",
				string(space.RoleMember),
			),
			toolName: "calendar_create_event",
			args: map[string]any{
				"calendar_id": "cal_1",
				"title":       "Dentist",
				"start_time":  "2026-04-20T09:00:00Z",
				"end_time":    "2026-04-20T10:00:00Z",
			},
			setupMocks: func(_ *CalendarAggregatorMock, coord *CalendarCoordinatorMock, ss *SpaceSettingsReaderMock) {
				ss.GetSettingsFunc = func(_ context.Context, _ *spaceapp.GetSettingsRequest) (*settings.Entry[space.Settings], error) {
					return &settings.Entry[space.Settings]{Value: space.Settings{Timezone: "UTC"}}, nil
				}
				coord.CreateEventFunc = func(_ context.Context, req *calendarapp.CreateEventRequest) (*domaincalendar.Event, error) {
					ev := req.Event
					ev.ID = "cev_created"
					return ev, nil
				}
			},
			assertOut: func(t *testing.T, out map[string]any) {
				if out["id"] != "cev_created" || out["title"] != "Dentist" {
					t.Errorf("unexpected created event: %+v", out)
				}
			},
		},
		{
			name: "update event with empty fields fails",
			ctx: auth.WithSpaceScope(
				auth.WithPrincipal(context.Background(), auth.Principal{Subject: "usr_1"}),
				"spc_1",
				string(space.RoleMember),
			),
			toolName: "calendar_update_event",
			args:     map[string]any{"id": "cev_1"},
			setupMocks: func(_ *CalendarAggregatorMock, _ *CalendarCoordinatorMock, ss *SpaceSettingsReaderMock) {
				ss.GetSettingsFunc = func(_ context.Context, _ *spaceapp.GetSettingsRequest) (*settings.Entry[space.Settings], error) {
					return nil, errors.E(errors.NotExist, "none")
				}
			},
			wantErr: true,
		},
		{
			name: "delete event propagates error",
			ctx: auth.WithSpaceScope(
				auth.WithPrincipal(context.Background(), auth.Principal{
					Subject:  "usr_1",
					APIKeyID: "apk_1",
					Scopes:   []string{string(identity.ScopeCalendarWrite)},
				}),
				"spc_1",
				string(space.RoleOwner),
			),
			toolName: "calendar_delete_event",
			args:     map[string]any{"id": "cev_missing"},
			setupMocks: func(_ *CalendarAggregatorMock, coord *CalendarCoordinatorMock, _ *SpaceSettingsReaderMock) {
				coord.DeleteEventFunc = func(_ context.Context, _ *calendarapp.DeleteEventRequest) error {
					return errors.E(errors.NotExist, "event not found")
				}
			},
			wantErr: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			agg := &CalendarAggregatorMock{}
			coord := &CalendarCoordinatorMock{}
			ss := &SpaceSettingsReaderMock{}
			if tc.setupMocks != nil {
				tc.setupMocks(agg, coord, ss)
			}

			srv := mcptransport.NewServer(mcptransport.ServerConfig{})
			NewHandler(Dependencies{
				Aggregator:    agg,
				Coordinator:   coord,
				SpaceSettings: ss,
			}).Register(srv.Registry())

			session, err := srv.ConnectInMemory(tc.ctx)
			if err != nil {
				t.Fatalf("ConnectInMemory failed: %v", err)
			}
			defer func() { _ = session.Close() }()

			res, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
				Name:      tc.toolName,
				Arguments: tc.args,
			})
			if err != nil {
				t.Fatalf("CallTool failed: %v", err)
			}
			if tc.wantErr {
				if !res.IsError {
					t.Fatal("expected IsError=true")
				}
				return
			}
			if res.IsError {
				t.Fatalf("unexpected tool error: %+v", res.Content)
			}
			tc.assertOut(t, res.StructuredContent.(map[string]any))
		})
	}
}
