//go:build integration

package driver

import (
	"encoding/json/v2"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
)

// MockGoogleServer simulates upstream Google OAuth2, People, and Calendar v3 endpoints.
type MockGoogleServer struct {
	server      *httptest.Server
	URL         string
	mu          sync.RWMutex
	userSub     string
	userEmail   string
	userName    string
	userPicture string
	accessToken string
	scopes      string
}

// StartMockGoogleServer launches an ephemeral mock server mimicking Google APIs.
func StartMockGoogleServer(tb testing.TB) *MockGoogleServer {
	if tb != nil {
		tb.Helper()
	}

	mock := &MockGoogleServer{
		userSub:     "google_sub_98765",
		userEmail:   "integration-test-user@gmail.com",
		userName:    "Integration Test User",
		userPicture: "https://example.com/avatar.png",
		accessToken: "mock_access_token_xyz",
		scopes:      "openid email profile https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/contacts.readonly",
	}

	mock.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		mock.mu.RLock()
		defer mock.mu.RUnlock()

		switch r.URL.Path {
		case "/oauth2/token":
			_ = json.MarshalWrite(w, map[string]any{
				"access_token":  mock.accessToken,
				"refresh_token": "mock_refresh_token_xyz",
				"expires_in":    3600,
				"scope":         mock.scopes,
			})
		case "/oauth2/v3/userinfo":
			_ = json.MarshalWrite(w, map[string]any{
				"sub":     mock.userSub,
				"email":   mock.userEmail,
				"name":    mock.userName,
				"picture": mock.userPicture,
			})
		case "/people/me/connections":
			_ = json.MarshalWrite(w, map[string]any{
				"connections": []map[string]any{
					{
						"resourceName": "people/c_1",
						"names": []map[string]any{
							{"displayName": "Alice Contact"},
						},
						"emailAddresses": []map[string]any{
							{"value": "alice@gmail.com"},
						},
					},
				},
			})
		case "/otherContacts":
			_ = json.MarshalWrite(w, map[string]any{
				"otherContacts": []any{},
			})
		case "/oauth2/revoke":
			w.WriteHeader(http.StatusOK)
		case "/calendar/v3/users/me/calendarList":
			_ = json.MarshalWrite(w, map[string]any{
				"items": []map[string]any{
					{
						"id":              "primary",
						"summary":         "Google Primary",
						"backgroundColor": "#4285F4",
						"timeZone":        "UTC",
						"accessRole":      "owner",
						"primary":         true,
					},
				},
			})
		default:
			if strings.HasPrefix(r.URL.Path, "/calendar/v3/calendars/") {
				if r.Method == http.MethodPost {
					w.WriteHeader(http.StatusCreated)
					_ = json.MarshalWrite(w, map[string]any{
						"id":   "google_ev_created_1",
						"etag": "\"etag_mock_1\"",
						"conferenceData": map[string]any{
							"entryPoints": []map[string]any{
								{
									"entryPointType": "video",
									"uri":            "https://meet.google.com/test-meet-mock",
								},
							},
						},
					})
					return
				}
				if r.Method == http.MethodPut {
					w.WriteHeader(http.StatusOK)
					_ = json.MarshalWrite(w, map[string]any{
						"id":   "google_ev_updated_1",
						"etag": "\"etag_mock_updated\"",
					})
					return
				}
				if r.Method == http.MethodDelete {
					w.WriteHeader(http.StatusNoContent)
					return
				}
				if r.Method == http.MethodGet {
					w.WriteHeader(http.StatusOK)
					_ = json.MarshalWrite(w, map[string]any{
						"nextSyncToken": "mock_sync_token_v1",
						"items": []map[string]any{
							{
								"id":          "google_ev_synced_1",
								"summary":     "Synced Meeting",
								"description": "Synced via mock Google",
								"status":      "confirmed",
								"start": map[string]any{
									"dateTime": "2026-10-25T14:00:00Z",
									"timeZone": "UTC",
								},
								"end": map[string]any{
									"dateTime": "2026-10-25T15:00:00Z",
									"timeZone": "UTC",
								},
								"conferenceData": map[string]any{
									"entryPoints": []map[string]any{
										{
											"entryPointType": "video",
											"uri":            "https://meet.google.com/mock-synced",
										},
									},
								},
								"etag": "\"mock_etag_synced\"",
							},
						},
					})
					return
				}
			}
			http.NotFound(w, r)
		}
	}))

	mock.URL = mock.server.URL

	if tb != nil {
		tb.Cleanup(func() {
			mock.server.Close()
		})
	}

	return mock
}

// TokenURL returns the mock OAuth2 token endpoint URL.
func (m *MockGoogleServer) TokenURL() string {
	return m.URL + "/oauth2/token"
}

// UserinfoURL returns the mock OIDC userinfo endpoint URL.
func (m *MockGoogleServer) UserinfoURL() string {
	return m.URL + "/oauth2/v3/userinfo"
}

// RevokeURL returns the mock token revocation endpoint URL.
func (m *MockGoogleServer) RevokeURL() string {
	return m.URL + "/oauth2/revoke"
}

// PeopleURL returns the mock People API connections endpoint URL.
func (m *MockGoogleServer) PeopleURL() string {
	return m.URL + "/people/me/connections"
}

// OtherURL returns the mock People API otherContacts endpoint URL.
func (m *MockGoogleServer) OtherURL() string {
	return m.URL + "/otherContacts"
}

// CalendarURL returns the mock Calendar v3 endpoint URL.
func (m *MockGoogleServer) CalendarURL() string {
	return m.URL + "/calendar/v3"
}

// Close shuts down the underlying HTTP server.
func (m *MockGoogleServer) Close() {
	if m.server != nil {
		m.server.Close()
	}
}
