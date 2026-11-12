package google_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/connector"
	"github.com/masterkeysrd/saturn/internal/platform/connector/google"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGoogleProvider_AuthCodeURL(t *testing.T) {
	t.Parallel()

	p := google.NewProvider(google.Config{
		ClientID:    "google-client-id.apps.googleusercontent.com",
		RedirectURI: "http://localhost:8080/api/v1/connectors/callback",
	})

	uStr := p.AuthCodeURL("test-state-token", "test-code-challenge", []connector.Capability{
		connector.CapabilityCalendar,
		connector.CapabilityMail,
		connector.CapabilityContacts,
	}, true)

	u, err := url.Parse(uStr)
	require.NoError(t, err)

	q := u.Query()
	assert.Equal(t, "google-client-id.apps.googleusercontent.com", q.Get("client_id"))
	assert.Equal(t, "http://localhost:8080/api/v1/connectors/callback", q.Get("redirect_uri"))
	assert.Equal(t, "code", q.Get("response_type"))
	assert.Equal(t, "test-state-token", q.Get("state"))
	assert.Equal(t, "test-code-challenge", q.Get("code_challenge"))
	assert.Equal(t, "S256", q.Get("code_challenge_method"))
	assert.Equal(t, "offline", q.Get("access_type"))
	assert.Equal(t, "consent", q.Get("prompt"))

	// Check scopes
	scopeStr := q.Get("scope")
	assert.Contains(t, scopeStr, "openid")
	assert.Contains(t, scopeStr, "https://www.googleapis.com/auth/userinfo.email")
	assert.Contains(t, scopeStr, "https://www.googleapis.com/auth/calendar")
	assert.Contains(t, scopeStr, "https://www.googleapis.com/auth/gmail.modify")
	assert.Contains(t, scopeStr, "https://www.googleapis.com/auth/contacts.readonly")
}

func TestGoogleProvider_Exchange(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name           string
		serverStatus   int
		serverResponse string
		wantErr        bool
		errIs          error
		wantToken      string
	}{
		{
			name:         "successful exchange",
			serverStatus: http.StatusOK,
			serverResponse: `{
				"access_token": "ya29.google-test-access-token",
				"refresh_token": "1//0g-google-refresh-token",
				"expires_in": 3600,
				"scope": "openid email https://www.googleapis.com/auth/calendar",
				"token_type": "Bearer"
			}`,
			wantErr:   false,
			wantToken: "ya29.google-test-access-token",
		},
		{
			name:         "invalid_grant error",
			serverStatus: http.StatusBadRequest,
			serverResponse: `{
				"error": "invalid_grant",
				"error_description": "Bad Request or expired code"
			}`,
			wantErr: true,
			errIs:   connector.ErrInvalidGrant,
		},
		{
			name:           "rate limit 429",
			serverStatus:   http.StatusTooManyRequests,
			serverResponse: `Rate limit exceeded`,
			wantErr:        true,
			errIs:          connector.ErrRateLimited,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				assert.Equal(t, http.MethodPost, r.Method)
				assert.Equal(t, "application/x-www-form-urlencoded", r.Header.Get("Content-Type"))
				_ = r.ParseForm()
				assert.Equal(t, "authorization_code", r.Form.Get("grant_type"))
				assert.Equal(t, "auth-code-123", r.Form.Get("code"))
				assert.Equal(t, "code-verifier-456", r.Form.Get("code_verifier"))

				w.WriteHeader(tc.serverStatus)
				_, _ = w.Write([]byte(tc.serverResponse))
			}))
			defer srv.Close()

			p := google.NewProvider(google.Config{
				ClientID:     "client-id",
				ClientSecret: "client-secret",
				RedirectURI:  "http://localhost:8080/callback",
				TokenURL:     srv.URL,
				HTTPClient:   srv.Client(),
			})

			resp, err := p.Exchange(context.Background(), "auth-code-123", "code-verifier-456")
			if tc.wantErr {
				require.Error(t, err)
				if tc.errIs != nil {
					assert.ErrorIs(t, err, tc.errIs)
				}
			} else {
				require.NoError(t, err)
				assert.Equal(t, tc.wantToken, resp.AccessToken)
				assert.Equal(t, "1//0g-google-refresh-token", resp.RefreshToken)
				assert.True(t, resp.Expiry.After(time.Now()))
				assert.Contains(t, resp.GrantedScopes, "email")
			}
		})
	}
}

func TestGoogleProvider_RefreshToken(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name           string
		serverStatus   int
		serverResponse string
		wantErr        bool
		errIs          error
		wantToken      string
	}{
		{
			name:         "successful refresh without new refresh_token",
			serverStatus: http.StatusOK,
			serverResponse: `{
				"access_token": "ya29.refreshed-access-token",
				"expires_in": 3600,
				"scope": "openid email",
				"token_type": "Bearer"
			}`,
			wantErr:   false,
			wantToken: "ya29.refreshed-access-token",
		},
		{
			name:         "refresh token invalid_grant",
			serverStatus: http.StatusBadRequest,
			serverResponse: `{
				"error": "invalid_grant",
				"error_description": "Token has been expired or revoked."
			}`,
			wantErr: true,
			errIs:   connector.ErrInvalidGrant,
		},
		{
			name:           "rate limit 429",
			serverStatus:   http.StatusTooManyRequests,
			serverResponse: `Rate limit exceeded`,
			wantErr:        true,
			errIs:          connector.ErrRateLimited,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				_ = r.ParseForm()
				assert.Equal(t, "refresh_token", r.Form.Get("grant_type"))
				assert.Equal(t, "input-refresh-token", r.Form.Get("refresh_token"))

				w.WriteHeader(tc.serverStatus)
				_, _ = w.Write([]byte(tc.serverResponse))
			}))
			defer srv.Close()

			p := google.NewProvider(google.Config{
				ClientID:     "client-id",
				ClientSecret: "client-secret",
				TokenURL:     srv.URL,
				HTTPClient:   srv.Client(),
			})

			resp, err := p.RefreshToken(context.Background(), "input-refresh-token")
			if tc.wantErr {
				require.Error(t, err)
				if tc.errIs != nil {
					assert.ErrorIs(t, err, tc.errIs)
				}
			} else {
				require.NoError(t, err)
				assert.Equal(t, tc.wantToken, resp.AccessToken)
			}
		})
	}
}

func TestGoogleProvider_RevokeToken(t *testing.T) {
	t.Parallel()

	var receivedToken string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = r.ParseForm()
		receivedToken = r.Form.Get("token")
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	p := google.NewProvider(google.Config{
		RevokeURL:  srv.URL,
		HTTPClient: srv.Client(),
	})

	err := p.RevokeToken(context.Background(), "token-to-revoke")
	require.NoError(t, err)
	assert.Equal(t, "token-to-revoke", receivedToken)
}

func TestGoogleProvider_FetchIdentity(t *testing.T) {
	t.Parallel()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		auth := r.Header.Get("Authorization")
		if auth != "Bearer valid-access-token" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{
			"sub": "google-sub-109283019283",
			"email": "user@example.com",
			"name": "Saturn Explorer",
			"picture": "https://lh3.googleusercontent.com/avatar.jpg"
		}`))
	}))
	defer srv.Close()

	p := google.NewProvider(google.Config{
		UserinfoURL: srv.URL,
		HTTPClient:  srv.Client(),
	})

	// 1. Success
	identity, err := p.FetchIdentity(context.Background(), "valid-access-token")
	require.NoError(t, err)
	assert.Equal(t, "google-sub-109283019283", identity.ProviderAccountID)
	assert.Equal(t, "user@example.com", identity.Email)
	assert.Equal(t, "Saturn Explorer", identity.DisplayName)
	assert.Equal(t, "https://lh3.googleusercontent.com/avatar.jpg", identity.AvatarURL)

	// 2. Unauthorized
	_, err = p.FetchIdentity(context.Background(), "invalid-access-token")
	assert.ErrorIs(t, err, connector.ErrInvalidGrant)
}

func TestGoogleProvider_FetchContacts(t *testing.T) {
	t.Parallel()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "Bearer valid-token", r.Header.Get("Authorization"))

		if strings.Contains(r.URL.Path, "connections") {
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{
				"connections": [
					{
						"resourceName": "people/c111",
						"names": [{"displayName": "Alice Smith"}],
						"emailAddresses": [{"value": "alice@example.com"}],
						"photos": [{"url": "https://example.com/alice.jpg"}]
					}
				]
			}`))
			return
		}

		if strings.Contains(r.URL.Path, "otherContacts") {
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{
				"otherContacts": [
					{
						"resourceName": "otherContacts/c222",
						"names": [{"displayName": "Bob Jones"}],
						"emailAddresses": [{"value": "bob@example.com"}]
					}
				]
			}`))
			return
		}

		w.WriteHeader(http.StatusNotFound)
	}))
	defer srv.Close()

	p := google.NewProvider(google.Config{
		PeopleURL:  srv.URL + "/connections",
		OtherURL:   srv.URL + "/otherContacts",
		HTTPClient: srv.Client(),
	})

	contacts, err := p.FetchContacts(context.Background(), "valid-token")
	require.NoError(t, err)
	require.Len(t, contacts, 2)

	assert.Equal(t, "otherContacts/c222", contacts[0].ProviderContactID)
	assert.Equal(t, "bob@example.com", contacts[0].Email)
	assert.Equal(t, "Bob Jones", contacts[0].DisplayName)

	assert.Equal(t, "people/c111", contacts[1].ProviderContactID)
	assert.Equal(t, "alice@example.com", contacts[1].Email)
	assert.Equal(t, "Alice Smith", contacts[1].DisplayName)
	assert.Equal(t, "https://example.com/alice.jpg", contacts[1].AvatarURL)
}
