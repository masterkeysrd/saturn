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
		scopes:      "openid email profile https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/contacts.readonly",
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
		case "/gmail/v1/users/me/labels":
			_ = json.MarshalWrite(w, map[string]any{
				"labels": []map[string]any{
					{"id": "INBOX", "name": "INBOX", "type": "system", "messagesUnread": 1, "messagesTotal": 10},
					{"id": "STARRED", "name": "STARRED", "type": "system"},
					{"id": "SENT", "name": "SENT", "type": "system"},
					{"id": "DRAFT", "name": "DRAFT", "type": "system"},
				},
			})
		case "/gmail/v1/users/me/profile":
			_ = json.MarshalWrite(w, map[string]any{
				"emailAddress":  mock.userEmail,
				"historyId":     "999123",
				"messagesTotal": 10,
				"threadsTotal":  2,
			})
		case "/gmail/v1/users/me/threads":
			_ = json.MarshalWrite(w, map[string]any{
				"threads": []map[string]any{
					{"id": "gm_th_1", "snippet": "Mock Google Thread Snippet", "historyId": "999123"},
				},
			})
		case "/gmail/v1/users/me/threads/gm_th_1":
			_ = json.MarshalWrite(w, map[string]any{
				"id":        "gm_th_1",
				"historyId": "999123",
				"messages": []map[string]any{
					{
						"id":           "gm_msg_1",
						"threadId":     "gm_th_1",
						"labelIds":     []string{"INBOX"},
						"snippet":      "Mock message snippet",
						"internalDate": "1680000000000",
						"payload": map[string]any{
							"mimeType": "text/html",
							"headers": []map[string]string{
								{"name": "Subject", "value": "Mock Thread Subject"},
								{"name": "From", "value": "Sender <sender@example.com>"},
								{"name": "To", "value": "User <integration-test-user@gmail.com>"},
							},
							"body": map[string]any{
								"data": "PHA+U2FmZSBtb2NrIGVtYWlsIGJvZHk8L3A+",
							},
						},
					},
				},
			})
		case "/gmail/v1/users/me/threads/gm_th_1/modify":
			_ = json.MarshalWrite(w, map[string]any{"id": "gm_th_1"})
		case "/gmail/v1/users/me/drafts":
			if r.Method == http.MethodPost {
				_ = json.MarshalWrite(w, map[string]any{
					"id": "gm_dft_1",
					"message": map[string]any{
						"id":       "gm_msg_dft_1",
						"threadId": "gm_th_1",
					},
				})
				return
			}
			_ = json.MarshalWrite(w, map[string]any{"drafts": []any{}})
		case "/gmail/v1/users/me/drafts/gm_dft_1":
			if r.Method == http.MethodPut {
				_ = json.MarshalWrite(w, map[string]any{
					"id": "gm_dft_1",
					"message": map[string]any{
						"id": "gm_msg_dft_1_v2",
					},
				})
				return
			}
			if r.Method == http.MethodDelete {
				w.WriteHeader(http.StatusNoContent)
				return
			}
		case "/gmail/v1/users/me/drafts/send":
			_ = json.MarshalWrite(w, map[string]any{
				"id":           "gm_msg_sent_1",
				"threadId":     "gm_th_1",
				"labelIds":     []string{"SENT"},
				"internalDate": "1680001000000",
				"payload": map[string]any{
					"headers": []map[string]string{
						{"name": "Subject", "value": "Mock Sent Draft"},
						{"name": "From", "value": mock.userEmail},
					},
				},
			})
		case "/gmail/v1/users/me/messages/gm_msg_1":
			_ = json.MarshalWrite(w, map[string]any{
				"id":       "gm_msg_1",
				"threadId": "gm_th_1",
				"payload": map[string]any{
					"mimeType": "text/html",
					"body": map[string]any{
						"data": "PHA+U2FmZSBtb2NrIGVtYWlsIGJvZHk8L3A+",
					},
				},
			})
		case "/gmail/v1/users/me/messages/gm_msg_1/attachments/att_1":
			_ = json.MarshalWrite(w, map[string]any{
				"attachmentId": "att_1",
				"size":         14,
				"data":         "VGVzdCBhdHRhY2htZW50",
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

// GmailURL returns the mock Gmail v1 endpoint URL.
func (m *MockGoogleServer) GmailURL() string {
	return m.URL + "/gmail/v1"
}

// Close shuts down the underlying HTTP server.
func (m *MockGoogleServer) Close() {
	if m.server != nil {
		m.server.Close()
	}
}
