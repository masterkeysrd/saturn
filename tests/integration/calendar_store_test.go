//go:build integration

package integration_test

import (
	"context"
	"testing"
	"time"

	"github.com/masterkeysrd/saturn/internal/domain/calendar"
	calendarstorage "github.com/masterkeysrd/saturn/internal/domain/calendar/storage"
	"github.com/masterkeysrd/saturn/internal/platform/connector"
	"github.com/masterkeysrd/saturn/internal/platform/crypto"
	"github.com/masterkeysrd/saturn/internal/platform/db"
	"github.com/masterkeysrd/saturn/migrations"
	"github.com/masterkeysrd/saturn/tests/driver"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCalendarMigrationUpDown(t *testing.T) {
	d := driver.New(t, testEnv)
	ctx := context.Background()

	// 1. Verify 052 tables exist initially
	var calendarsExists bool
	err := d.Env().DB.GetContext(ctx, &calendarsExists, `
		SELECT EXISTS (
			SELECT FROM information_schema.tables 
			WHERE table_schema = 'calendar' AND table_name = 'calendars'
		)
	`)
	require.NoError(t, err)
	assert.True(t, calendarsExists, "calendar.calendars must exist initially")

	var eventsExists bool
	err = d.Env().DB.GetContext(ctx, &eventsExists, `
		SELECT EXISTS (
			SELECT FROM information_schema.tables 
			WHERE table_schema = 'calendar' AND table_name = 'events'
		)
	`)
	require.NoError(t, err)
	assert.True(t, eventsExists, "calendar.events must exist initially")

	// 2. Roll back migration 052
	err = migrations.DownTo(d.Env().DB.DB, 51)
	require.NoError(t, err, "migration down must succeed")

	// Verify tables dropped
	err = d.Env().DB.GetContext(ctx, &calendarsExists, `
		SELECT EXISTS (
			SELECT FROM information_schema.tables 
			WHERE table_schema = 'calendar' AND table_name = 'calendars'
		)
	`)
	require.NoError(t, err)
	assert.False(t, calendarsExists, "calendar.calendars must be dropped after migration down")

	// 3. Migrate back up to 052
	err = migrations.Migrate(d.Env().DB.DB)
	require.NoError(t, err, "migration up must succeed")

	err = d.Env().DB.GetContext(ctx, &calendarsExists, `
		SELECT EXISTS (
			SELECT FROM information_schema.tables 
			WHERE table_schema = 'calendar' AND table_name = 'calendars'
		)
	`)
	require.NoError(t, err)
	assert.True(t, calendarsExists, "calendar.calendars must exist after migrating up")
}

func TestCalendarStore_CRUD_RangeQueries_And_Cascade(t *testing.T) {
	d := driver.New(t, testEnv)
	ctx := context.Background()

	d.Auth().CreateApprovedUser(t).Login(t)
	d.Space().Ensure(t, "Calendar Test Space")
	spaceID := d.State().SpaceID
	userID := d.State().UserID

	dbClient := db.New(d.Env().DB)
	calStore := calendarstorage.NewCalendarStore(dbClient)
	eventStore := calendarstorage.NewEventStore(dbClient)

	// Create connected account
	cipher, err := crypto.NewCipher("test-master-encryption-key-32b!!")
	require.NoError(t, err)
	encAccess, _ := cipher.Encrypt("access-token-1")
	encRefresh, _ := cipher.Encrypt("refresh-token-1")
	connectorStore := connector.NewStore(dbClient)

	connAcc := &connector.ConnectedAccount{
		SpaceID:             spaceID,
		CreatedByUserID:     userID,
		Provider:            "google",
		ProviderAccountID:   "user_google_cal",
		Email:               "user_cal@gmail.com",
		AccessTokenEnc:      encAccess,
		RefreshTokenEnc:     encRefresh,
		TokenExpiry:         time.Now().Add(1 * time.Hour),
		GrantedScopes:       []string{"https://www.googleapis.com/auth/calendar"},
		EnabledCapabilities: []string{"calendar"},
		Status:              connector.AccountStatusHealthy,
	}
	err = connectorStore.CreateAccount(ctx, connAcc)
	require.NoError(t, err)
	require.NotEmpty(t, connAcc.ID)

	// 1. Create native calendar
	nativeCalID, err := calendar.GenerateCalendarID()
	require.NoError(t, err)

	nativeCal := &calendar.Calendar{
		ID:              nativeCalID,
		SpaceID:         spaceID,
		Source:          calendar.SourceNative,
		Name:            "Workspace Native Calendar",
		Timezone:        "America/New_York",
		AccessRole:      calendar.AccessRoleOwner,
		IsDefaultNative: true,
		IsEnabled:       true,
		Version:         1,
		CreateTime:      time.Now().UTC(),
		UpdateTime:      time.Now().UTC(),
	}
	err = calStore.Create(ctx, nativeCal)
	require.NoError(t, err)

	// 2. Create external calendar linked to connected account
	extCalID, err := calendar.GenerateCalendarID()
	require.NoError(t, err)

	extCal := &calendar.Calendar{
		ID:                 extCalID,
		SpaceID:            spaceID,
		ConnectedAccountID: &connAcc.ID,
		Source:             calendar.SourceExternal,
		ProviderCalendarID: new("primary"),
		Name:               "Google Calendar (External)",
		Timezone:           "America/New_York",
		AccessRole:         calendar.AccessRoleWriter,
		IsPrimary:          true,
		IsEnabled:          true,
		Version:            1,
		CreateTime:         time.Now().UTC(),
		UpdateTime:         time.Now().UTC(),
	}
	err = calStore.Create(ctx, extCal)
	require.NoError(t, err)

	// Verify GetByID & GetDefaultNative
	gotNative, err := calStore.GetDefaultNative(ctx, spaceID)
	require.NoError(t, err)
	require.NotNil(t, gotNative)
	assert.Equal(t, nativeCalID, gotNative.ID)

	gotExt, err := calStore.GetByConnectedAccountAndProviderID(ctx, spaceID, connAcc.ID, "primary")
	require.NoError(t, err)
	require.NotNil(t, gotExt)
	assert.Equal(t, extCalID, gotExt.ID)

	// 3. Create Events
	// Event A: Timed event in native calendar (Nov 15, 2026, 14:00 - 15:00 UTC)
	evAStartTime := time.Date(2026, 11, 15, 14, 0, 0, 0, time.UTC)
	evAEndTime := time.Date(2026, 11, 15, 15, 0, 0, 0, time.UTC)
	evAID, err := calendar.GenerateEventID()
	require.NoError(t, err)

	evA := &calendar.Event{
		ID:         evAID,
		SpaceID:    spaceID,
		CalendarID: nativeCalID,
		Title:      "Native Timed Event",
		IsAllDay:   false,
		StartTime:  &evAStartTime,
		EndTime:    &evAEndTime,
		Timezone:   new("America/New_York"),
		Status:     calendar.EventStatusConfirmed,
		Version:    1,
		CreateTime: time.Now().UTC(),
		UpdateTime: time.Now().UTC(),
	}
	err = eventStore.Create(ctx, evA)
	require.NoError(t, err)

	// Event B: All-day event in native calendar (Nov 15 - Nov 17, 2026)
	evBID, err := calendar.GenerateEventID()
	require.NoError(t, err)

	evB := &calendar.Event{
		ID:         evBID,
		SpaceID:    spaceID,
		CalendarID: nativeCalID,
		Title:      "Native All-Day Event",
		IsAllDay:   true,
		StartDate:  new("2026-11-15"),
		EndDate:    new("2026-11-17"),
		Status:     calendar.EventStatusConfirmed,
		Version:    1,
		CreateTime: time.Now().UTC(),
		UpdateTime: time.Now().UTC(),
	}
	err = eventStore.Create(ctx, evB)
	require.NoError(t, err)

	// Event C: Recurring master event in external calendar
	evCStartTime := time.Date(2026, 11, 1, 10, 0, 0, 0, time.UTC)
	evCEndTime := time.Date(2026, 11, 1, 11, 0, 0, 0, time.UTC)
	evCID, err := calendar.GenerateEventID()
	require.NoError(t, err)

	evC := &calendar.Event{
		ID:         evCID,
		SpaceID:    spaceID,
		CalendarID: extCalID,
		Title:      "Weekly Sync Master",
		IsAllDay:   false,
		StartTime:  &evCStartTime,
		EndTime:    &evCEndTime,
		Timezone:   new("UTC"),
		RRULE:      new("FREQ=WEEKLY;INTERVAL=1"),
		Status:     calendar.EventStatusConfirmed,
		Version:    1,
		CreateTime: time.Now().UTC(),
		UpdateTime: time.Now().UTC(),
	}
	err = eventStore.Create(ctx, evC)
	require.NoError(t, err)

	// 4. Test ListInTimeRange queries
	rangeQueryStart := time.Date(2026, 11, 15, 0, 0, 0, 0, time.UTC)
	rangeQueryEnd := time.Date(2026, 11, 16, 0, 0, 0, 0, time.UTC)
	startDateStr := "2026-11-15"
	endDateStr := "2026-11-16"

	inRange, err := eventStore.ListInTimeRange(ctx, spaceID, []string{nativeCalID}, rangeQueryStart, rangeQueryEnd, startDateStr, endDateStr)
	require.NoError(t, err)
	assert.Len(t, inRange, 2, "both timed event A and all-day event B should overlap Nov 15")

	// 5. Test ListRecurringMasters
	masters, err := eventStore.ListRecurringMasters(ctx, spaceID, []string{extCalID})
	require.NoError(t, err)
	assert.Len(t, masters, 1)
	assert.Equal(t, evCID, masters[0].ID)

	// 6. Test DeleteByConnectedAccount: purges external calendar & its events, preserves native
	err = calStore.DeleteByConnectedAccount(ctx, spaceID, connAcc.ID)
	require.NoError(t, err)

	// External calendar must be deleted
	deletedExtCal, err := calStore.GetByID(ctx, spaceID, extCalID)
	require.NoError(t, err)
	assert.Nil(t, deletedExtCal, "external calendar must be deleted")

	// External event C must be cascaded
	deletedEvC, err := eventStore.GetByID(ctx, spaceID, evCID)
	require.NoError(t, err)
	assert.Nil(t, deletedEvC, "external event must be deleted via cascade")

	// Native calendar and its events must be completely intact
	intactNative, err := calStore.GetByID(ctx, spaceID, nativeCalID)
	require.NoError(t, err)
	assert.NotNil(t, intactNative, "native calendar must be preserved")

	intactEvA, err := eventStore.GetByID(ctx, spaceID, evAID)
	require.NoError(t, err)
	assert.NotNil(t, intactEvA, "native event A must be preserved")
}
