package google_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	domaincalendar "github.com/masterkeysrd/saturn/internal/domain/calendar"
	"github.com/masterkeysrd/saturn/internal/platform/connector"
	"github.com/masterkeysrd/saturn/internal/platform/connector/google"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGoogleProvider_ListCalendars(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name          string
		handler       http.HandlerFunc
		expectedCount int
		expectPrimary bool
		expectedError error
	}{
		{
			name: "successful list with primary and secondary calendars",
			handler: func(w http.ResponseWriter, r *http.Request) {
				assert.Equal(t, "Bearer test-access-token", r.Header.Get("Authorization"))
				assert.Contains(t, r.URL.Path, "/users/me/calendarList")

				w.WriteHeader(http.StatusOK)
				_, _ = w.Write([]byte(`{
					"items": [
						{
							"id": "primary-cal-id",
							"summary": "Primary Calendar",
							"description": "Work calendar",
							"backgroundColor": "#4285F4",
							"timeZone": "America/New_York",
							"accessRole": "owner",
							"primary": true
						},
						{
							"id": "secondary-cal-id",
							"summary": "Holidays",
							"backgroundColor": "#34A853",
							"timeZone": "UTC",
							"accessRole": "reader",
							"primary": false
						}
					]
				}`))
			},
			expectedCount: 2,
			expectPrimary: true,
		},
		{
			name: "unauthorized returns ErrInvalidGrant",
			handler: func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(http.StatusUnauthorized)
			},
			expectedError: connector.ErrInvalidGrant,
		},
		{
			name: "rate limited returns ErrRateLimited",
			handler: func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(http.StatusTooManyRequests)
			},
			expectedError: connector.ErrRateLimited,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			server := httptest.NewServer(tc.handler)
			defer server.Close()

			provider := google.NewProvider(google.Config{
				CalendarURL: server.URL,
				HTTPClient:  server.Client(),
			})

			cals, err := provider.ListCalendars(context.Background(), "test-access-token")
			if tc.expectedError != nil {
				require.Error(t, err)
				assert.ErrorIs(t, err, tc.expectedError)
				return
			}

			require.NoError(t, err)
			assert.Len(t, cals, tc.expectedCount)
			if tc.expectPrimary {
				assert.True(t, cals[0].IsPrimary)
				assert.Equal(t, "primary-cal-id", cals[0].ProviderCalendarID)
				assert.Equal(t, domaincalendar.AccessRoleOwner, cals[0].AccessRole)
			}
		})
	}
}

func TestGoogleProvider_SyncEvents(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name               string
		syncCursor         string
		handler            http.HandlerFunc
		expectedCount      int
		expectedCursor     string
		expectedFullResync bool
		expectedError      error
	}{
		{
			name:       "initial sync with recurring master and meet link",
			syncCursor: "",
			handler: func(w http.ResponseWriter, r *http.Request) {
				assert.Equal(t, "Bearer valid-token", r.Header.Get("Authorization"))
				assert.Contains(t, r.URL.Path, "/calendars/primary/events")
				assert.Empty(t, r.URL.Query().Get("syncToken"))

				w.WriteHeader(http.StatusOK)
				_, _ = w.Write([]byte(`{
					"nextSyncToken": "sync_token_v2",
					"items": [
						{
							"id": "event-1",
							"iCalUID": "uid-1@google.com",
							"summary": "Weekly 1:1",
							"description": "Weekly sync meeting",
							"status": "confirmed",
							"start": { "dateTime": "2026-10-20T14:00:00Z", "timeZone": "UTC" },
							"end": { "dateTime": "2026-10-20T14:30:00Z", "timeZone": "UTC" },
							"recurrence": ["RRULE:FREQ=WEEKLY;BYDAY=TU", "EXDATE;TZID=UTC:20261103T140000Z"],
							"conferenceData": {
								"entryPoints": [
									{ "entryPointType": "video", "uri": "https://meet.google.com/abc-defg-hij" }
								]
							},
							"organizer": { "email": "alice@example.com", "displayName": "Alice", "self": true },
							"attendees": [
								{ "email": "bob@example.com", "responseStatus": "accepted" }
							],
							"etag": "\"etag1\""
						},
						{
							"id": "event-2",
							"summary": "All Day Event",
							"status": "confirmed",
							"start": { "date": "2026-10-25" },
							"end": { "date": "2026-10-26" },
							"etag": "\"etag2\""
						}
					]
				}`))
			},
			expectedCount:  2,
			expectedCursor: "sync_token_v2",
		},
		{
			name:       "incremental sync delta with exception instance",
			syncCursor: "sync_token_v2",
			handler: func(w http.ResponseWriter, r *http.Request) {
				assert.Equal(t, "sync_token_v2", r.URL.Query().Get("syncToken"))

				w.WriteHeader(http.StatusOK)
				_, _ = w.Write([]byte(`{
					"nextSyncToken": "sync_token_v3",
					"items": [
						{
							"id": "exception-1",
							"summary": "Weekly 1:1 (Rescheduled)",
							"status": "confirmed",
							"recurringEventId": "event-1",
							"originalStartTime": { "dateTime": "2026-10-27T14:00:00Z" },
							"start": { "dateTime": "2026-10-27T15:00:00Z" },
							"end": { "dateTime": "2026-10-27T15:30:00Z" }
						}
					]
				}`))
			},
			expectedCount:  1,
			expectedCursor: "sync_token_v3",
		},
		{
			name:       "410 Gone triggers full resync required",
			syncCursor: "expired_token",
			handler: func(w http.ResponseWriter, r *http.Request) {
				assert.Equal(t, "expired_token", r.URL.Query().Get("syncToken"))
				w.WriteHeader(http.StatusGone)
			},
			expectedFullResync: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			server := httptest.NewServer(tc.handler)
			defer server.Close()

			provider := google.NewProvider(google.Config{
				CalendarURL: server.URL,
				HTTPClient:  server.Client(),
			})

			result, err := provider.SyncEvents(context.Background(), "valid-token", "primary", tc.syncCursor)
			if tc.expectedError != nil {
				require.Error(t, err)
				assert.ErrorIs(t, err, tc.expectedError)
				return
			}

			require.NoError(t, err)
			require.NotNil(t, result)

			if tc.expectedFullResync {
				assert.True(t, result.FullResyncRequired)
				return
			}

			assert.False(t, result.FullResyncRequired)
			assert.Len(t, result.Events, tc.expectedCount)
			assert.Equal(t, tc.expectedCursor, result.NextSyncCursor)

			if tc.name == "initial sync with recurring master and meet link" {
				first := result.Events[0]
				assert.Equal(t, "event-1", first.ProviderEventID)
				assert.Equal(t, "https://meet.google.com/abc-defg-hij", first.ConferenceURL)
				assert.Equal(t, "google_meet", first.ConferenceProvider)
				require.NotNil(t, first.RRULE)
				assert.Equal(t, "RRULE:FREQ=WEEKLY;BYDAY=TU", *first.RRULE)
				assert.Contains(t, first.EXDates, "20261103T140000Z")

				second := result.Events[1]
				assert.True(t, second.IsAllDay)
				require.NotNil(t, second.StartDate)
				assert.Equal(t, "2026-10-25", *second.StartDate)
			}

			if tc.name == "incremental sync delta with exception instance" {
				first := result.Events[0]
				require.NotNil(t, first.RecurringMasterID)
				assert.Equal(t, "event-1", *first.RecurringMasterID)
				require.NotNil(t, first.OriginalStartTime)
			}
		})
	}
}

func TestGoogleProvider_WriteThrough(t *testing.T) {
	t.Parallel()

	t.Run("CreateEvent writes to Google with conferenceData", func(t *testing.T) {
		t.Parallel()

		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			assert.Equal(t, http.MethodPost, r.Method)
			assert.Equal(t, "1", r.URL.Query().Get("conferenceDataVersion"))

			w.WriteHeader(http.StatusCreated)
			_, _ = w.Write([]byte(`{
				"id": "new-google-event-id",
				"etag": "\"created-etag\"",
				"conferenceData": {
					"entryPoints": [
						{ "entryPointType": "video", "uri": "https://meet.google.com/xyz-uvwx-rst" }
					]
				}
			}`))
		}))
		defer server.Close()

		provider := google.NewProvider(google.Config{
			CalendarURL: server.URL,
			HTTPClient:  server.Client(),
		})

		start := time.Date(2026, 10, 20, 10, 0, 0, 0, time.UTC)
		end := time.Date(2026, 10, 20, 11, 0, 0, 0, time.UTC)

		ev := &domaincalendar.Event{
			ID:        "cev_test_1",
			Title:     "Quarterly Planning",
			StartTime: &start,
			EndTime:   &end,
		}

		res, err := provider.CreateEvent(context.Background(), "access-token", "primary", ev)
		require.NoError(t, err)
		assert.Equal(t, "new-google-event-id", res.ProviderEventID)
		assert.Equal(t, "\"created-etag\"", res.ETag)
		assert.Equal(t, "https://meet.google.com/xyz-uvwx-rst", res.ConferenceURL)
	})

	t.Run("UpdateEvent calls PUT on event path", func(t *testing.T) {
		t.Parallel()

		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			assert.Equal(t, http.MethodPut, r.Method)
			assert.Contains(t, r.URL.Path, "/events/google-event-123")

			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{
				"id": "google-event-123",
				"etag": "\"updated-etag\""
			}`))
		}))
		defer server.Close()

		provider := google.NewProvider(google.Config{
			CalendarURL: server.URL,
			HTTPClient:  server.Client(),
		})

		pID := "google-event-123"
		start := time.Date(2026, 10, 20, 10, 0, 0, 0, time.UTC)
		end := time.Date(2026, 10, 20, 11, 0, 0, 0, time.UTC)

		ev := &domaincalendar.Event{
			ID:              "cev_test_1",
			ProviderEventID: &pID,
			Title:           "Quarterly Planning (Updated)",
			StartTime:       &start,
			EndTime:         &end,
		}

		res, err := provider.UpdateEvent(context.Background(), "access-token", "primary", ev)
		require.NoError(t, err)
		assert.Equal(t, "google-event-123", res.ProviderEventID)
		assert.Equal(t, "\"updated-etag\"", res.ETag)
	})

	t.Run("DeleteEvent calls DELETE and accepts 204 or 404", func(t *testing.T) {
		t.Parallel()

		deleteCount := 0
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			assert.Equal(t, http.MethodDelete, r.Method)
			deleteCount++
			if deleteCount == 1 {
				w.WriteHeader(http.StatusNoContent)
			} else {
				w.WriteHeader(http.StatusNotFound) // already deleted idempotent ok
			}
		}))
		defer server.Close()

		provider := google.NewProvider(google.Config{
			CalendarURL: server.URL,
			HTTPClient:  server.Client(),
		})

		err1 := provider.DeleteEvent(context.Background(), "access-token", "primary", "google-event-123")
		assert.NoError(t, err1)

		err2 := provider.DeleteEvent(context.Background(), "access-token", "primary", "google-event-123")
		assert.NoError(t, err2)
	})

	t.Run("RespondToEvent patches attendee status", func(t *testing.T) {
		t.Parallel()

		step := 0
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			step++
			if step == 1 {
				assert.Equal(t, http.MethodGet, r.Method)
				w.WriteHeader(http.StatusOK)
				_, _ = w.Write([]byte(`{
					"id": "event-rsvp-test",
					"attendees": [
						{ "email": "user@example.com", "responseStatus": "needs_action" }
					]
				}`))
			} else {
				assert.Equal(t, http.MethodPatch, r.Method)
				w.WriteHeader(http.StatusOK)
				_, _ = w.Write([]byte(`{ "id": "event-rsvp-test" }`))
			}
		}))
		defer server.Close()

		provider := google.NewProvider(google.Config{
			CalendarURL: server.URL,
			HTTPClient:  server.Client(),
		})

		err := provider.RespondToEvent(
			context.Background(),
			"access-token",
			"primary",
			"event-rsvp-test",
			"user@example.com",
			"accepted",
		)
		require.NoError(t, err)
	})
}
