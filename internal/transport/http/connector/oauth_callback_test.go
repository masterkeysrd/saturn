package connector_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	connectorapp "github.com/masterkeysrd/saturn/internal/application/connector"
	"github.com/masterkeysrd/saturn/internal/platform/connector"
	"github.com/masterkeysrd/saturn/internal/platform/crypto"
	platformerrors "github.com/masterkeysrd/saturn/internal/platform/errors"
	connectorhttp "github.com/masterkeysrd/saturn/internal/transport/http/connector"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type mockCoordinator struct {
	completeOAuthFunc func(ctx context.Context, req *connectorapp.CompleteOAuthRequest) (*connectorapp.CompleteOAuthResult, error)
}

func (m *mockCoordinator) ListProviders(ctx context.Context) ([]*connectorapp.ProviderDescriptor, error) {
	return nil, nil
}
func (m *mockCoordinator) InitiateOAuth(ctx context.Context, req *connectorapp.InitiateOAuthRequest) (*connectorapp.InitiateOAuthResult, error) {
	return nil, nil
}
func (m *mockCoordinator) CompleteOAuth(ctx context.Context, req *connectorapp.CompleteOAuthRequest) (*connectorapp.CompleteOAuthResult, error) {
	if m.completeOAuthFunc != nil {
		return m.completeOAuthFunc(ctx, req)
	}
	return nil, nil
}
func (m *mockCoordinator) ListConnectedAccounts(ctx context.Context, req *connectorapp.ListConnectedAccountsRequest) ([]*connector.ConnectedAccount, error) {
	return nil, nil
}
func (m *mockCoordinator) GetConnectedAccount(ctx context.Context, req *connectorapp.GetConnectedAccountRequest) (*connector.ConnectedAccount, error) {
	return nil, nil
}
func (m *mockCoordinator) UpdateConnectedAccount(ctx context.Context, req *connectorapp.UpdateConnectedAccountRequest) (*connector.ConnectedAccount, error) {
	return nil, nil
}
func (m *mockCoordinator) DeleteConnectedAccount(ctx context.Context, req *connectorapp.DeleteConnectedAccountRequest) error {
	return nil
}
func (m *mockCoordinator) SyncConnectedAccount(ctx context.Context, req *connectorapp.SyncConnectedAccountRequest) (*connector.ConnectedAccount, error) {
	return nil, nil
}
func (m *mockCoordinator) SuggestContacts(ctx context.Context, req *connectorapp.SuggestContactsRequest) ([]*connector.AccountContact, error) {
	return nil, nil
}
func (m *mockCoordinator) SyncContacts(ctx context.Context, req *connectorapp.SyncContactsRequest) error {
	return nil
}

type mockOAuthStore struct {
	consumeOAuthStateFunc func(ctx context.Context, stateHash string) (*connector.OAuthState, error)
}

func (m *mockOAuthStore) CreateAccount(ctx context.Context, account *connector.ConnectedAccount) error {
	return nil
}
func (m *mockOAuthStore) GetAccount(ctx context.Context, spaceID, accountID string) (*connector.ConnectedAccount, error) {
	return nil, nil
}
func (m *mockOAuthStore) GetAccountByID(ctx context.Context, accountID string) (*connector.ConnectedAccount, error) {
	return nil, nil
}
func (m *mockOAuthStore) GetAccountByProvider(ctx context.Context, spaceID, provider, providerAccountID string) (*connector.ConnectedAccount, error) {
	return nil, nil
}
func (m *mockOAuthStore) ListAccounts(ctx context.Context, spaceID string) ([]*connector.ConnectedAccount, error) {
	return nil, nil
}
func (m *mockOAuthStore) ListActiveAccounts(ctx context.Context) ([]*connector.ConnectedAccount, error) {
	return nil, nil
}
func (m *mockOAuthStore) UpdateAccount(ctx context.Context, account *connector.ConnectedAccount) error {
	return nil
}
func (m *mockOAuthStore) UpdateAccountTokens(ctx context.Context, accountID string, accessTokenEnc, refreshTokenEnc string, expiry time.Time) error {
	return nil
}
func (m *mockOAuthStore) UpdateAccountStatus(ctx context.Context, spaceID, accountID string, status connector.AccountStatus, reason *string, backoffUntil *time.Time) error {
	return nil
}
func (m *mockOAuthStore) DeleteAccount(ctx context.Context, spaceID, accountID string) error {
	return nil
}
func (m *mockOAuthStore) CountActiveByProviderIdentity(ctx context.Context, provider, providerAccountID, excludeSpaceID string) (int, error) {
	return 0, nil
}
func (m *mockOAuthStore) CreateOAuthState(ctx context.Context, state *connector.OAuthState) error {
	return nil
}
func (m *mockOAuthStore) ConsumeOAuthState(ctx context.Context, stateHash string) (*connector.OAuthState, error) {
	if m.consumeOAuthStateFunc != nil {
		return m.consumeOAuthStateFunc(ctx, stateHash)
	}
	return nil, nil
}
func (m *mockOAuthStore) UpsertContacts(ctx context.Context, contacts []*connector.AccountContact) error {
	return nil
}
func (m *mockOAuthStore) ListContacts(ctx context.Context, spaceID, accountID string) ([]*connector.AccountContact, error) {
	return nil, nil
}
func (m *mockOAuthStore) SuggestContacts(ctx context.Context, spaceID string, query string, limit int) ([]*connector.AccountContact, error) {
	return nil, nil
}

func TestOAuthCallbackHandler(t *testing.T) {
	t.Parallel()

	cipher, err := crypto.NewCipher("test-cipher-key-32-chars-long!!")
	require.NoError(t, err)
	encVerifier, err := cipher.Encrypt("code_verifier_123")
	require.NoError(t, err)

	tests := []struct {
		name           string
		url            string
		completeOAuth  func(ctx context.Context, req *connectorapp.CompleteOAuthRequest) (*connectorapp.CompleteOAuthResult, error)
		consumeState   func(ctx context.Context, stateHash string) (*connector.OAuthState, error)
		wantStatus     int
		wantLocation   string
		locationSubstr string
	}{
		{
			name: "valid 302 redirect to web URL on success",
			url:  "/v1/platform/connectors/oauth/google/callback?code=valid_code&state=valid_state",
			completeOAuth: func(ctx context.Context, req *connectorapp.CompleteOAuthRequest) (*connectorapp.CompleteOAuthResult, error) {
				assert.Equal(t, "google", req.Provider)
				assert.Equal(t, "valid_code", req.Code)
				assert.Equal(t, "valid_state", req.State)
				return &connectorapp.CompleteOAuthResult{
					Account: &connector.ConnectedAccount{
						ID: "cac_123456",
					},
					ReturnURL: "https://app.saturn.local/settings/connectors",
				}, nil
			},
			wantStatus:   http.StatusFound,
			wantLocation: "https://app.saturn.local/settings/connectors?connected_account_id=cac_123456",
		},
		{
			name: "valid 302 redirect to saturn:// mobile deep link on success",
			url:  "/v1/platform/connectors/oauth/google/callback?code=mobile_code&state=mobile_state",
			completeOAuth: func(ctx context.Context, req *connectorapp.CompleteOAuthRequest) (*connectorapp.CompleteOAuthResult, error) {
				return &connectorapp.CompleteOAuthResult{
					Account: &connector.ConnectedAccount{
						ID: "cac_mob789",
					},
					ReturnURL: "saturn://connectors/callback",
				}, nil
			},
			wantStatus:   http.StatusFound,
			wantLocation: "saturn://connectors/callback?connected_account_id=cac_mob789",
		},
		{
			name: "provider access_denied redirect to web return_url",
			url:  "/v1/platform/connectors/oauth/google/callback?error=access_denied&state=denied_state",
			consumeState: func(ctx context.Context, stateHash string) (*connector.OAuthState, error) {
				return &connector.OAuthState{
					StateHash:       stateHash,
					SpaceID:         "spc_123",
					Provider:        "google",
					ReturnURL:       "https://app.saturn.local/connectors",
					CodeVerifierEnc: encVerifier,
					ExpiresAt:       time.Now().Add(10 * time.Minute),
				}, nil
			},
			wantStatus:   http.StatusFound,
			wantLocation: "https://app.saturn.local/connectors?oauth_error=access_denied",
		},
		{
			name: "provider access_denied redirect to saturn:// deep link",
			url:  "/v1/platform/connectors/oauth/google/callback?error=access_denied&state=mobile_denied",
			consumeState: func(ctx context.Context, stateHash string) (*connector.OAuthState, error) {
				return &connector.OAuthState{
					StateHash:       stateHash,
					SpaceID:         "spc_123",
					Provider:        "google",
					ReturnURL:       "saturn://oauth/callback",
					CodeVerifierEnc: encVerifier,
					ExpiresAt:       time.Now().Add(10 * time.Minute),
				}, nil
			},
			wantStatus:   http.StatusFound,
			wantLocation: "saturn://oauth/callback?oauth_error=access_denied",
		},
		{
			name: "invalid or expired state on error returns 400 Bad Request",
			url:  "/v1/platform/connectors/oauth/google/callback?error=access_denied&state=expired_state",
			consumeState: func(ctx context.Context, stateHash string) (*connector.OAuthState, error) {
				return nil, nil // not found / expired
			},
			wantStatus: http.StatusBadRequest,
		},
		{
			name: "invalid or expired state on code exchange returns 400 Bad Request",
			url:  "/v1/platform/connectors/oauth/google/callback?code=any_code&state=expired_state",
			completeOAuth: func(ctx context.Context, req *connectorapp.CompleteOAuthRequest) (*connectorapp.CompleteOAuthResult, error) {
				return nil, platformerrors.E(platformerrors.Invalid, connectorapp.ErrInvalidState, "state expired")
			},
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "missing state query param returns 400 Bad Request",
			url:        "/v1/platform/connectors/oauth/google/callback?code=any_code",
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "missing code and error query params returns 400 Bad Request",
			url:        "/v1/platform/connectors/oauth/google/callback?state=any_state",
			wantStatus: http.StatusBadRequest,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			store := &mockOAuthStore{
				consumeOAuthStateFunc: tc.consumeState,
			}
			mgr := connector.NewOAuthManager(store, cipher)
			coord := &mockCoordinator{
				completeOAuthFunc: tc.completeOAuth,
			}
			handler := connectorhttp.NewOAuthCallbackHandler(coord, mgr)

			req := httptest.NewRequest(http.MethodGet, tc.url, nil)
			rec := httptest.NewRecorder()

			handler.ServeHTTP(rec, req)

			assert.Equal(t, tc.wantStatus, rec.Code)
			if tc.wantLocation != "" {
				assert.Equal(t, tc.wantLocation, rec.Header().Get("Location"))
			}
		})
	}
}
