//go:build integration

package integration_test

import (
	"context"
	"testing"
	"time"

	calendarv1 "github.com/masterkeysrd/saturn/apis/saturn/calendar/v1"
	connectorv1 "github.com/masterkeysrd/saturn/apis/saturn/platform/connector/v1"
	appcalendar "github.com/masterkeysrd/saturn/internal/application/calendar"
	"github.com/masterkeysrd/saturn/internal/domain/space"
	"github.com/masterkeysrd/saturn/tests/driver"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/timestamppb"
)

func TestCalendarWorkflow_EndToEnd(t *testing.T) {
	d := driver.New(t, testEnv)

	// 1. Authenticate user and create primary workspace
	d.Auth().
		CreateApprovedUser(t).
		Login(t)

	d.Space().Ensure(t, "Calendar Test Workspace")

	ownerToken := d.State().AccessToken
	spaceID := d.State().SpaceID

	// 2. Connect to gRPC server via Unix socket to test full interceptor chain
	conn, err := grpc.NewClient("unix:"+d.Env().SocketPath,
		grpc.WithTransportCredentials(insecure.NewCredentials()),
	)
	require.NoError(t, err)
	defer func() { _ = conn.Close() }()

	calClient := calendarv1.NewCalendarServiceClient(conn)
	connClient := connectorv1.NewConnectorServiceClient(conn)

	// Context helper with metadata
	authCtx := func(token, sID string) context.Context {
		md := metadata.New(map[string]string{
			"authorization": "Bearer " + token,
			"space-id":      sID,
		})
		return metadata.NewOutgoingContext(context.Background(), md)
	}

	ctx := authCtx(ownerToken, spaceID)

	// 3. Ensure Default Native Calendar
	defaultCal, err := calClient.EnsureDefaultCalendar(ctx, &calendarv1.EnsureDefaultCalendarRequest{})
	require.NoError(t, err)
	assert.NotEmpty(t, defaultCal.GetId())
	assert.True(t, defaultCal.GetIsDefaultNative())
	assert.Equal(t, calendarv1.CalendarSource_CALENDAR_SOURCE_NATIVE, defaultCal.GetSource())
	assert.Equal(t, "Primary", defaultCal.GetName())

	// Calling EnsureDefaultCalendar again is idempotent
	defaultCal2, err := calClient.EnsureDefaultCalendar(ctx, &calendarv1.EnsureDefaultCalendarRequest{})
	require.NoError(t, err)
	assert.Equal(t, defaultCal.GetId(), defaultCal2.GetId())

	// 4. Create Native Events
	now := time.Now().UTC().Truncate(time.Hour)
	ev1Start := now.Add(2 * time.Hour)
	ev1End := now.Add(3 * time.Hour)

	mailMsgID := "msg_test_123"
	singleEv, err := calClient.CreateEvent(ctx, &calendarv1.CreateEventRequest{
		Event: &calendarv1.Event{
			CalendarId:          defaultCal.GetId(),
			Title:               "Sprint Planning",
			Description:         "Discuss roadmap items",
			Location:            "Room 101",
			StartTime:           timestamppb.New(ev1Start),
			EndTime:             timestamppb.New(ev1End),
			Timezone:            "UTC",
			SourceMailMessageId: mailMsgID,
		},
	})
	require.NoError(t, err)
	assert.NotEmpty(t, singleEv.GetId())
	assert.Equal(t, "Sprint Planning", singleEv.GetTitle())
	assert.Equal(t, mailMsgID, singleEv.GetSourceMailMessageId())

	// Create Recurring Master Event
	recStart := now.Add(24 * time.Hour)
	recEnd := now.Add(25 * time.Hour)
	rrule := "FREQ=DAILY;COUNT=5"

	recMaster, err := calClient.CreateEvent(ctx, &calendarv1.CreateEventRequest{
		Event: &calendarv1.Event{
			CalendarId: defaultCal.GetId(),
			Title:      "Daily Standup",
			StartTime:  timestamppb.New(recStart),
			EndTime:    timestamppb.New(recEnd),
			Timezone:   "UTC",
			Rrule:      rrule,
		},
	})
	require.NoError(t, err)
	assert.NotEmpty(t, recMaster.GetId())

	// 5. ListEvents over gRPC with Viewport Recurrence Expansion
	listRes, err := calClient.ListEvents(ctx, &calendarv1.ListEventsRequest{
		CalendarIds: []string{defaultCal.GetId()},
		TimeMin:     timestamppb.New(now.Add(-1 * time.Hour)),
		TimeMax:     timestamppb.New(now.Add(7 * 24 * time.Hour)),
	})
	require.NoError(t, err)

	// Expect 1 single event + 5 daily standup occurrences = 6 occurrences
	assert.Len(t, listRes.GetOccurrences(), 6)

	// Verify occurrence metadata
	foundSingle := false
	dailyCount := 0
	for _, occ := range listRes.GetOccurrences() {
		assert.Equal(t, defaultCal.GetName(), occ.GetCalendarName())
		assert.NotEmpty(t, occ.GetColor())
		if occ.GetEventId() == singleEv.GetId() {
			foundSingle = true
		}
		if occ.GetTitle() == "Daily Standup" {
			dailyCount++
			if occ.GetMasterId() != "" {
				assert.Equal(t, recMaster.GetId(), occ.GetMasterId())
			}
		}
	}
	assert.True(t, foundSingle)
	assert.Equal(t, 5, dailyCount)

	// 6. Connect External Google Calendar and Test Two-Way Sync
	initRes, err := connClient.InitiateOAuth(ctx, &connectorv1.InitiateOAuthRequest{
		Provider:     "google",
		ReturnUrl:    "http://localhost:8080/settings",
		Capabilities: []string{"calendar", "mail", "contacts"},
	})
	require.NoError(t, err)
	assert.NotEmpty(t, initRes.GetAuthUrl())

	// Simulate OAuth callback code exchange
	_, err = d.HTTPClient().Get(d.Env().ServerURL + "/api/v1/platform/connectors/oauth/google/callback?code=mock_auth_code&state=" + initRes.GetState())
	require.NoError(t, err)

	// Verify connected account exists
	accsRes, err := connClient.ListConnectedAccounts(ctx, &connectorv1.ListConnectedAccountsRequest{})
	require.NoError(t, err)
	require.NotEmpty(t, accsRes.GetAccounts())
	connectedAccID := accsRes.GetAccounts()[0].GetId()

	// Trigger synchronization directly on the coordinator for immediate execution in test
	err = d.Env().CalendarCoordinator().SyncConnectedAccountCalendars(ctx, &appcalendar.SyncConnectedAccountCalendarsRequest{
		SpaceID:            spaceID,
		ConnectedAccountID: connectedAccID,
	})
	require.NoError(t, err)

	// Verify external calendar was mirrored
	calsRes, err := calClient.ListCalendars(ctx, &calendarv1.ListCalendarsRequest{})
	require.NoError(t, err)
	assert.GreaterOrEqual(t, len(calsRes.GetCalendars()), 2)

	var extCal *calendarv1.Calendar
	for _, c := range calsRes.GetCalendars() {
		if c.GetSource() == calendarv1.CalendarSource_CALENDAR_SOURCE_EXTERNAL {
			extCal = c
			break
		}
	}
	require.NotNil(t, extCal, "external Google calendar should be mirrored")
	assert.Equal(t, "Google Primary", extCal.GetName())
	assert.True(t, extCal.GetIsEnabled())

	// 7. Write-through to Google Calendar via gRPC
	googleEvStart := now.Add(4 * time.Hour)
	googleEvEnd := now.Add(5 * time.Hour)

	extEv, err := calClient.CreateEvent(ctx, &calendarv1.CreateEventRequest{
		Event: &calendarv1.Event{
			CalendarId: extCal.GetId(),
			Title:      "Meeting with Google Meet",
			StartTime:  timestamppb.New(googleEvStart),
			EndTime:    timestamppb.New(googleEvEnd),
			Timezone:   "UTC",
		},
	})
	require.NoError(t, err)
	assert.NotEmpty(t, extEv.GetId())
	assert.NotEmpty(t, extEv.GetProviderEventId())
	assert.Contains(t, extEv.GetMeetUrl(), "meet.google.com")

	// 8. Space Isolation Verification
	t.Run("space isolation prevents other spaces from viewing calendar events", func(t *testing.T) {
		otherSpaceID, sErr := space.NewSpaceID()
		require.NoError(t, sErr)

		otherCtx := authCtx(ownerToken, string(otherSpaceID))

		// Non-member access is rejected
		_, err := calClient.ListCalendars(otherCtx, &calendarv1.ListCalendarsRequest{})
		require.Error(t, err)
		st, ok := status.FromError(err)
		require.True(t, ok)
		assert.Equal(t, codes.PermissionDenied, st.Code())
	})
}
