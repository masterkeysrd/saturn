package connector_test

import (
	"context"
	"errors"
	"testing"
	"time"

	connectorapp "github.com/masterkeysrd/saturn/internal/application/connector"
	"github.com/masterkeysrd/saturn/internal/domain/space"
	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	"github.com/masterkeysrd/saturn/internal/platform/connector"
	"github.com/masterkeysrd/saturn/internal/platform/crypto"
	platformerrors "github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/scheduler"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type mockStore struct {
	createAccountFunc                 func(ctx context.Context, account *connector.ConnectedAccount) error
	getAccountFunc                    func(ctx context.Context, spaceID, accountID string) (*connector.ConnectedAccount, error)
	getAccountByIDFunc                func(ctx context.Context, accountID string) (*connector.ConnectedAccount, error)
	getAccountByProviderFunc          func(ctx context.Context, spaceID, provider, providerAccountID string) (*connector.ConnectedAccount, error)
	listAccountsFunc                  func(ctx context.Context, spaceID string) ([]*connector.ConnectedAccount, error)
	listActiveAccountsFunc            func(ctx context.Context) ([]*connector.ConnectedAccount, error)
	updateAccountFunc                 func(ctx context.Context, account *connector.ConnectedAccount) error
	updateAccountTokensFunc           func(ctx context.Context, accountID string, accessTokenEnc, refreshTokenEnc string, expiry time.Time) error
	updateAccountStatusFunc           func(ctx context.Context, spaceID, accountID string, status connector.AccountStatus, reason *string, backoffUntil *time.Time) error
	deleteAccountFunc                 func(ctx context.Context, spaceID, accountID string) error
	countActiveByProviderIdentityFunc func(ctx context.Context, provider, providerAccountID, excludeSpaceID string) (int, error)
	createOAuthStateFunc              func(ctx context.Context, state *connector.OAuthState) error
	consumeOAuthStateFunc             func(ctx context.Context, stateHash string) (*connector.OAuthState, error)
	upsertContactsFunc                func(ctx context.Context, contacts []*connector.AccountContact) error
	listContactsFunc                  func(ctx context.Context, spaceID, accountID string) ([]*connector.AccountContact, error)
	suggestContactsFunc               func(ctx context.Context, spaceID string, query string, limit int) ([]*connector.AccountContact, error)
}

func (m *mockStore) CreateAccount(ctx context.Context, account *connector.ConnectedAccount) error {
	if m.createAccountFunc != nil {
		return m.createAccountFunc(ctx, account)
	}
	return nil
}
func (m *mockStore) GetAccount(ctx context.Context, spaceID, accountID string) (*connector.ConnectedAccount, error) {
	if m.getAccountFunc != nil {
		return m.getAccountFunc(ctx, spaceID, accountID)
	}
	return nil, nil
}
func (m *mockStore) GetAccountByID(ctx context.Context, accountID string) (*connector.ConnectedAccount, error) {
	if m.getAccountByIDFunc != nil {
		return m.getAccountByIDFunc(ctx, accountID)
	}
	return nil, nil
}
func (m *mockStore) GetAccountByProvider(ctx context.Context, spaceID, provider, providerAccountID string) (*connector.ConnectedAccount, error) {
	if m.getAccountByProviderFunc != nil {
		return m.getAccountByProviderFunc(ctx, spaceID, provider, providerAccountID)
	}
	return nil, nil
}
func (m *mockStore) ListAccounts(ctx context.Context, spaceID string) ([]*connector.ConnectedAccount, error) {
	if m.listAccountsFunc != nil {
		return m.listAccountsFunc(ctx, spaceID)
	}
	return nil, nil
}
func (m *mockStore) ListActiveAccounts(ctx context.Context) ([]*connector.ConnectedAccount, error) {
	if m.listActiveAccountsFunc != nil {
		return m.listActiveAccountsFunc(ctx)
	}
	return nil, nil
}
func (m *mockStore) UpdateAccount(ctx context.Context, account *connector.ConnectedAccount) error {
	if m.updateAccountFunc != nil {
		return m.updateAccountFunc(ctx, account)
	}
	return nil
}
func (m *mockStore) UpdateAccountTokens(ctx context.Context, accountID string, accessTokenEnc, refreshTokenEnc string, expiry time.Time) error {
	if m.updateAccountTokensFunc != nil {
		return m.updateAccountTokensFunc(ctx, accountID, accessTokenEnc, refreshTokenEnc, expiry)
	}
	return nil
}
func (m *mockStore) UpdateAccountStatus(ctx context.Context, spaceID, accountID string, status connector.AccountStatus, reason *string, backoffUntil *time.Time) error {
	if m.updateAccountStatusFunc != nil {
		return m.updateAccountStatusFunc(ctx, spaceID, accountID, status, reason, backoffUntil)
	}
	return nil
}
func (m *mockStore) DeleteAccount(ctx context.Context, spaceID, accountID string) error {
	if m.deleteAccountFunc != nil {
		return m.deleteAccountFunc(ctx, spaceID, accountID)
	}
	return nil
}
func (m *mockStore) CountActiveByProviderIdentity(ctx context.Context, provider, providerAccountID, excludeSpaceID string) (int, error) {
	if m.countActiveByProviderIdentityFunc != nil {
		return m.countActiveByProviderIdentityFunc(ctx, provider, providerAccountID, excludeSpaceID)
	}
	return 0, nil
}
func (m *mockStore) CreateOAuthState(ctx context.Context, state *connector.OAuthState) error {
	if m.createOAuthStateFunc != nil {
		return m.createOAuthStateFunc(ctx, state)
	}
	return nil
}
func (m *mockStore) ConsumeOAuthState(ctx context.Context, stateHash string) (*connector.OAuthState, error) {
	if m.consumeOAuthStateFunc != nil {
		return m.consumeOAuthStateFunc(ctx, stateHash)
	}
	return nil, nil
}
func (m *mockStore) UpsertContacts(ctx context.Context, contacts []*connector.AccountContact) error {
	if m.upsertContactsFunc != nil {
		return m.upsertContactsFunc(ctx, contacts)
	}
	return nil
}
func (m *mockStore) ListContacts(ctx context.Context, spaceID, accountID string) ([]*connector.AccountContact, error) {
	if m.listContactsFunc != nil {
		return m.listContactsFunc(ctx, spaceID, accountID)
	}
	return nil, nil
}
func (m *mockStore) SuggestContacts(ctx context.Context, spaceID string, query string, limit int) ([]*connector.AccountContact, error) {
	if m.suggestContactsFunc != nil {
		return m.suggestContactsFunc(ctx, spaceID, query, limit)
	}
	return nil, nil
}

type mockProvider struct {
	providerName              string
	authCodeURLFunc           func(state string, challenge string, capabilities []connector.Capability, promptConsent bool) string
	exchangeFunc              func(ctx context.Context, code string, verifier string) (*connector.TokenResponse, error)
	refreshTokenFunc          func(ctx context.Context, refreshToken string) (*connector.TokenResponse, error)
	revokeTokenFunc           func(ctx context.Context, token string) error
	fetchIdentityFunc         func(ctx context.Context, accessToken string) (*connector.Identity, error)
	fetchContactsFunc         func(ctx context.Context, accessToken string) ([]*connector.Contact, error)
	scopesForCapabilitiesFunc func(capabilities []connector.Capability) []string
}

func (m *mockProvider) Provider() string {
	if m.providerName != "" {
		return m.providerName
	}
	return "google"
}
func (m *mockProvider) AuthCodeURL(state string, challenge string, capabilities []connector.Capability, promptConsent bool) string {
	if m.authCodeURLFunc != nil {
		return m.authCodeURLFunc(state, challenge, capabilities, promptConsent)
	}
	return "https://accounts.google.com/o/oauth2/auth?state=" + state
}
func (m *mockProvider) Exchange(ctx context.Context, code string, verifier string) (*connector.TokenResponse, error) {
	if m.exchangeFunc != nil {
		return m.exchangeFunc(ctx, code, verifier)
	}
	return &connector.TokenResponse{
		AccessToken:   "access_token_123",
		RefreshToken:  "refresh_token_123",
		Expiry:        time.Now().Add(1 * time.Hour),
		GrantedScopes: []string{"openid", "email"},
	}, nil
}
func (m *mockProvider) RefreshToken(ctx context.Context, refreshToken string) (*connector.TokenResponse, error) {
	if m.refreshTokenFunc != nil {
		return m.refreshTokenFunc(ctx, refreshToken)
	}
	return nil, nil
}
func (m *mockProvider) RevokeToken(ctx context.Context, token string) error {
	if m.revokeTokenFunc != nil {
		return m.revokeTokenFunc(ctx, token)
	}
	return nil
}
func (m *mockProvider) FetchIdentity(ctx context.Context, accessToken string) (*connector.Identity, error) {
	if m.fetchIdentityFunc != nil {
		return m.fetchIdentityFunc(ctx, accessToken)
	}
	return &connector.Identity{
		ProviderAccountID: "google-user-123",
		Email:             "user@example.com",
		DisplayName:       "Test User",
		AvatarURL:         "https://example.com/avatar.png",
	}, nil
}
func (m *mockProvider) FetchContacts(ctx context.Context, accessToken string) ([]*connector.Contact, error) {
	if m.fetchContactsFunc != nil {
		return m.fetchContactsFunc(ctx, accessToken)
	}
	return []*connector.Contact{
		{
			ProviderContactID: "c1",
			Email:             "alice@example.com",
			DisplayName:       "Alice",
		},
	}, nil
}
func (m *mockProvider) ScopesForCapabilities(capabilities []connector.Capability) []string {
	if m.scopesForCapabilitiesFunc != nil {
		return m.scopesForCapabilitiesFunc(capabilities)
	}
	var scopes []string
	for _, cap := range capabilities {
		if cap == connector.CapabilityCalendar {
			scopes = append(scopes, "https://www.googleapis.com/auth/calendar")
		}
		if cap == connector.CapabilityContacts {
			scopes = append(scopes, "https://www.googleapis.com/auth/contacts.readonly")
		}
	}
	return scopes
}

type mockScheduler struct {
	enqueueFunc func(ctx context.Context, job scheduler.Job) error
}

func (m *mockScheduler) Enqueue(ctx context.Context, job scheduler.Job) error {
	if m.enqueueFunc != nil {
		return m.enqueueFunc(ctx, job)
	}
	return nil
}
func (m *mockScheduler) RegisterSchedule(ctx context.Context, s scheduler.Schedule) error {
	return nil
}

func setupTestCoordinator(t *testing.T, store connector.Store, provider connector.OAuthProvider, sched scheduler.Scheduler, cleaners *connector.CleanerRegistry) connectorapp.Coordinator {
	t.Helper()
	cipher, err := crypto.NewCipher("test-master-encryption-key-32ch")
	require.NoError(t, err)

	providerRegistry := connector.NewProviderRegistry()
	if provider != nil {
		providerRegistry.Register(provider)
	}

	if cleaners == nil {
		cleaners = connector.NewCleanerRegistry()
	}

	oauthManager := connector.NewOAuthManager(store, cipher)
	tokenManager := connector.NewTokenManager(store, cipher, providerRegistry, cleaners)

	return connectorapp.NewCoordinator(connectorapp.Dependencies{
		Store:        store,
		OAuthManager: oauthManager,
		TokenManager: tokenManager,
		Providers:    providerRegistry,
		Cleaners:     cleaners,
		Scheduler:    sched,
	})
}

func TestCoordinator_Authorization(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name        string
		role        string
		hasRole     bool
		wantAllowed bool
	}{
		{
			name:        "owner is authorized",
			role:        string(space.RoleOwner),
			hasRole:     true,
			wantAllowed: true,
		},
		{
			name:        "admin is authorized",
			role:        string(space.RoleAdmin),
			hasRole:     true,
			wantAllowed: true,
		},
		{
			name:        "member is unauthorized",
			role:        string(space.RoleMember),
			hasRole:     true,
			wantAllowed: false,
		},
		{
			name:        "viewer is unauthorized",
			role:        string(space.RoleViewer),
			hasRole:     true,
			wantAllowed: false,
		},
		{
			name:        "missing role in context is unauthorized",
			hasRole:     false,
			wantAllowed: false,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			store := &mockStore{}
			coord := setupTestCoordinator(t, store, &mockProvider{providerName: "google"}, nil, nil)

			ctx := context.Background()
			if tc.hasRole {
				ctx = auth.WithSpaceScope(ctx, "spc_123", tc.role)
			}

			// Test InitiateOAuth
			initRes, initErr := coord.InitiateOAuth(ctx, &connectorapp.InitiateOAuthRequest{
				SpaceID:   "spc_123",
				Provider:  "google",
				ReturnURL: "/settings/connectors",
			})
			if tc.wantAllowed {
				require.NoError(t, initErr)
				assert.NotEmpty(t, initRes.AuthURL)
			} else {
				require.Error(t, initErr)
				platErr, ok := platformerrors.AsType[*platformerrors.Error](initErr)
				require.True(t, ok)
				assert.Equal(t, platformerrors.Permission, platErr.Kind)
			}

			// Test DeleteConnectedAccount
			delErr := coord.DeleteConnectedAccount(ctx, &connectorapp.DeleteConnectedAccountRequest{
				SpaceID:   "spc_123",
				AccountID: "cac_123",
			})
			if tc.wantAllowed {
				require.NoError(t, delErr)
			} else {
				require.Error(t, delErr)
				platErr, ok := platformerrors.AsType[*platformerrors.Error](delErr)
				require.True(t, ok)
				assert.Equal(t, platformerrors.Permission, platErr.Kind)
			}
		})
	}
}

func TestCoordinator_CapabilityScopeCheck_FailedPrecondition(t *testing.T) {
	t.Parallel()

	existing := &connector.ConnectedAccount{
		ID:                  "cac_test",
		SpaceID:             "spc_test",
		Provider:            "google",
		GrantedScopes:       []string{"openid", "email"},
		EnabledCapabilities: []string{},
	}

	store := &mockStore{
		getAccountFunc: func(ctx context.Context, spaceID, accountID string) (*connector.ConnectedAccount, error) {
			return existing, nil
		},
	}

	coord := setupTestCoordinator(t, store, &mockProvider{
		providerName: "google",
		scopesForCapabilitiesFunc: func(capabilities []connector.Capability) []string {
			return []string{"https://www.googleapis.com/auth/calendar"}
		},
	}, nil, nil)

	ctx := auth.WithSpaceScope(context.Background(), "spc_test", string(space.RoleOwner))

	// Attempt to enable calendar without calendar scope
	_, err := coord.UpdateConnectedAccount(ctx, &connectorapp.UpdateConnectedAccountRequest{
		SpaceID:   "spc_test",
		AccountID: "cac_test",
		Account: &connector.ConnectedAccount{
			EnabledCapabilities: []string{"calendar"},
		},
		UpdateMask: []string{"enabled_capabilities"},
	})

	require.Error(t, err)
	platErr, ok := platformerrors.AsType[*platformerrors.Error](err)
	require.True(t, ok)
	assert.Equal(t, platformerrors.Precondition, platErr.Kind)
	assert.Equal(t, connectorapp.ErrMissingOAuthScopes, platErr.Code)
}

func TestCoordinator_CapabilityDisable_ExecutesCleaners(t *testing.T) {
	t.Parallel()

	existing := &connector.ConnectedAccount{
		ID:                  "cac_test",
		SpaceID:             "spc_test",
		Provider:            "google",
		GrantedScopes:       []string{"openid", "email", "https://www.googleapis.com/auth/calendar"},
		EnabledCapabilities: []string{"calendar"},
	}

	updated := false
	store := &mockStore{
		getAccountFunc: func(ctx context.Context, spaceID, accountID string) (*connector.ConnectedAccount, error) {
			return existing, nil
		},
		updateAccountFunc: func(ctx context.Context, account *connector.ConnectedAccount) error {
			updated = true
			return nil
		},
	}

	cleaners := connector.NewCleanerRegistry()
	cleanerCalled := false
	cleaners.RegisterCleaner(connector.CapabilityCalendar, func(ctx context.Context, spaceID, accountID string) error {
		cleanerCalled = true
		assert.Equal(t, "spc_test", spaceID)
		assert.Equal(t, "cac_test", accountID)
		return nil
	})

	coord := setupTestCoordinator(t, store, &mockProvider{providerName: "google"}, nil, cleaners)

	ctx := auth.WithSpaceScope(context.Background(), "spc_test", string(space.RoleOwner))

	res, err := coord.UpdateConnectedAccount(ctx, &connectorapp.UpdateConnectedAccountRequest{
		SpaceID:   "spc_test",
		AccountID: "cac_test",
		Account: &connector.ConnectedAccount{
			EnabledCapabilities: []string{},
		},
		UpdateMask: []string{"enabled_capabilities"},
	})

	require.NoError(t, err)
	assert.True(t, cleanerCalled)
	assert.True(t, updated)
	assert.Empty(t, res.EnabledCapabilities)
}

func TestCoordinator_SyncCooldownEnforcement(t *testing.T) {
	t.Parallel()

	recentSync := time.Now().Add(-5 * time.Second)
	account := &connector.ConnectedAccount{
		ID:           "cac_test",
		SpaceID:      "spc_test",
		LastSyncTime: &recentSync,
	}

	store := &mockStore{
		getAccountFunc: func(ctx context.Context, spaceID, accountID string) (*connector.ConnectedAccount, error) {
			return account, nil
		},
	}

	coord := setupTestCoordinator(t, store, &mockProvider{providerName: "google"}, nil, nil)
	ctx := auth.WithSpaceScope(context.Background(), "spc_test", string(space.RoleOwner))

	// Should fail due to 15s cooldown
	_, err := coord.SyncConnectedAccount(ctx, &connectorapp.SyncConnectedAccountRequest{
		SpaceID:   "spc_test",
		AccountID: "cac_test",
	})
	require.Error(t, err)
	platErr, ok := platformerrors.AsType[*platformerrors.Error](err)
	require.True(t, ok)
	assert.Equal(t, platformerrors.Precondition, platErr.Kind)
	assert.Equal(t, connectorapp.ErrCooldownActive, platErr.Code)

	// Past cooldown (> 15s)
	oldSync := time.Now().Add(-20 * time.Second)
	account.LastSyncTime = &oldSync
	enqueued := false
	sched := &mockScheduler{
		enqueueFunc: func(ctx context.Context, job scheduler.Job) error {
			enqueued = true
			return nil
		},
	}
	coordWithSched := setupTestCoordinator(t, store, &mockProvider{providerName: "google"}, sched, nil)

	account.EnabledCapabilities = []string{string(connector.CapabilityContacts)}
	res, err := coordWithSched.SyncConnectedAccount(ctx, &connectorapp.SyncConnectedAccountRequest{
		SpaceID:   "spc_test",
		AccountID: "cac_test",
	})
	require.NoError(t, err)
	assert.NotNil(t, res.LastSyncTime)
	assert.True(t, enqueued)
}

func TestCoordinator_CompleteOAuth(t *testing.T) {
	t.Parallel()

	t.Run("invalid or expired state returns error", func(t *testing.T) {
		t.Parallel()

		store := &mockStore{
			consumeOAuthStateFunc: func(ctx context.Context, stateHash string) (*connector.OAuthState, error) {
				return nil, nil // not found / expired
			},
		}

		coord := setupTestCoordinator(t, store, &mockProvider{providerName: "google"}, nil, nil)
		_, err := coord.CompleteOAuth(context.Background(), &connectorapp.CompleteOAuthRequest{
			Provider: "google",
			Code:     "auth_code_123",
			State:    "expired_state",
		})
		require.Error(t, err)
	})

	t.Run("provider exchange failure returns error", func(t *testing.T) {
		t.Parallel()

		cipher, err := crypto.NewCipher("test-master-encryption-key-32ch")
		require.NoError(t, err)
		verifierEnc, err := cipher.Encrypt("code_verifier_123")
		require.NoError(t, err)

		store := &mockStore{
			consumeOAuthStateFunc: func(ctx context.Context, stateHash string) (*connector.OAuthState, error) {
				return &connector.OAuthState{
					StateHash:       stateHash,
					SpaceID:         "spc_123",
					UserID:          "usr_123",
					Provider:        "google",
					CodeVerifierEnc: verifierEnc,
					ReturnURL:       "/settings/connectors",
					ExpiresAt:       time.Now().Add(10 * time.Minute),
				}, nil
			},
		}

		failingProvider := &mockProvider{
			providerName: "google",
			exchangeFunc: func(ctx context.Context, code string, verifier string) (*connector.TokenResponse, error) {
				return nil, errors.New("upstream provider token exchange rejected")
			},
		}

		coord := setupTestCoordinator(t, store, failingProvider, nil, nil)
		_, err = coord.CompleteOAuth(context.Background(), &connectorapp.CompleteOAuthRequest{
			Provider: "google",
			Code:     "bad_code",
			State:    "valid_state",
		})
		require.Error(t, err)
	})

	t.Run("successful exchange saves account and enqueues sync", func(t *testing.T) {
		t.Parallel()

		cipher, err := crypto.NewCipher("test-master-encryption-key-32ch")
		require.NoError(t, err)
		verifierEnc, err := cipher.Encrypt("code_verifier_123")
		require.NoError(t, err)

		store := &mockStore{
			consumeOAuthStateFunc: func(ctx context.Context, stateHash string) (*connector.OAuthState, error) {
				return &connector.OAuthState{
					StateHash:       stateHash,
					SpaceID:         "spc_123",
					UserID:          "usr_123",
					Provider:        "google",
					Capabilities:    []string{"contacts"},
					CodeVerifierEnc: verifierEnc,
					ReturnURL:       "/settings/connectors",
					ExpiresAt:       time.Now().Add(10 * time.Minute),
				}, nil
			},
			getAccountByProviderFunc: func(ctx context.Context, spaceID, provider, providerAccountID string) (*connector.ConnectedAccount, error) {
				return nil, nil // new connection
			},
			createAccountFunc: func(ctx context.Context, account *connector.ConnectedAccount) error {
				account.ID = "cac_new"
				return nil
			},
		}

		enqueued := false
		sched := &mockScheduler{
			enqueueFunc: func(ctx context.Context, job scheduler.Job) error {
				enqueued = true
				assert.Equal(t, "connector.sync_contacts", job.JobType)
				return nil
			},
		}

		coord := setupTestCoordinator(t, store, &mockProvider{providerName: "google"}, sched, nil)
		res, err := coord.CompleteOAuth(context.Background(), &connectorapp.CompleteOAuthRequest{
			Provider: "google",
			Code:     "auth_code_123",
			State:    "valid_state",
		})
		require.NoError(t, err)
		assert.Equal(t, "/settings/connectors", res.ReturnURL)
		assert.Equal(t, "cac_new", res.Account.ID)
		assert.True(t, enqueued)
	})
}
