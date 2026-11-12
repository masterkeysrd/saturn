package connector_test

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/connector"
	"github.com/masterkeysrd/saturn/internal/platform/crypto"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestTokenManager_TokenSourceSingleFlight(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	cipher, err := crypto.NewCipher("test-encryption-key-32byteslong!")
	require.NoError(t, err)

	encAccess, err := cipher.Encrypt("old-access-token")
	require.NoError(t, err)
	encRefresh, err := cipher.Encrypt("old-refresh-token")
	require.NoError(t, err)

	now := time.Now()

	// Account whose token has expired
	account := &connector.ConnectedAccount{
		ID:              "cac_123",
		SpaceID:         "spc_1",
		Provider:        "google",
		AccessTokenEnc:  encAccess,
		RefreshTokenEnc: encRefresh,
		TokenExpiry:     now.Add(-5 * time.Minute), // expired
		Status:          connector.AccountStatusHealthy,
	}

	var mu sync.Mutex
	var refreshCallCount atomic.Int32

	storeMock := &connector.StoreMock{
		GetAccountFunc: func(ctx context.Context, spaceID, accountID string) (*connector.ConnectedAccount, error) {
			mu.Lock()
			defer mu.Unlock()
			// Return a copy so caller modifications don't race
			cp := *account
			return &cp, nil
		},
		UpdateAccountTokensFunc: func(ctx context.Context, accountID string, accessTokenEnc, refreshTokenEnc string, expiry time.Time) error {
			mu.Lock()
			defer mu.Unlock()
			account.AccessTokenEnc = accessTokenEnc
			account.RefreshTokenEnc = refreshTokenEnc
			account.TokenExpiry = expiry
			return nil
		},
	}

	providerMock := &connector.OAuthProviderMock{
		ProviderFunc: func() string {
			return "google"
		},
		RefreshTokenFunc: func(ctx context.Context, refreshToken string) (*connector.TokenResponse, error) {
			refreshCallCount.Add(1)
			// Small sleep to ensure concurrent goroutines collide and test singleflight
			time.Sleep(50 * time.Millisecond)
			return &connector.TokenResponse{
				AccessToken:   "new-fresh-access-token",
				RefreshToken:  "new-fresh-refresh-token",
				Expiry:        now.Add(1 * time.Hour),
				GrantedScopes: []string{"openid", "email"},
			}, nil
		},
	}

	providers := connector.NewProviderRegistry()
	providers.Register(providerMock)

	mgr := connector.NewTokenManager(storeMock, cipher, providers, nil)
	mgr.SetNowFunc(func() time.Time { return now })

	// Launch 20 concurrent goroutines calling TokenSource for the same account
	const goroutines = 20
	var wg sync.WaitGroup
	wg.Add(goroutines)

	results := make([]string, goroutines)
	errs := make([]error, goroutines)

	for i := range goroutines {
		idx := i
		go func() {
			defer wg.Done()
			token, err := mgr.TokenSource(ctx, "spc_1", "cac_123")
			results[idx] = token
			errs[idx] = err
		}()
	}

	wg.Wait()

	// Verify all returned the new fresh access token without error
	for i := range goroutines {
		require.NoError(t, errs[i], "goroutine %d failed", i)
		assert.Equal(t, "new-fresh-access-token", results[i])
	}

	// Verify singleflight: exactly 1 upstream RefreshToken call was made
	assert.Equal(t, int32(1), refreshCallCount.Load(), "expected exactly 1 upstream RefreshToken call")
}

func TestTokenManager_TokenSourceCached(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	cipher, err := crypto.NewCipher("test-encryption-key-32byteslong!")
	require.NoError(t, err)

	encAccess, err := cipher.Encrypt("valid-cached-token")
	require.NoError(t, err)

	now := time.Now()

	account := &connector.ConnectedAccount{
		ID:             "cac_valid",
		SpaceID:        "spc_1",
		Provider:       "google",
		AccessTokenEnc: encAccess,
		TokenExpiry:    now.Add(10 * time.Minute), // valid, well beyond 60s
		Status:         connector.AccountStatusHealthy,
	}

	storeMock := &connector.StoreMock{
		GetAccountFunc: func(ctx context.Context, spaceID, accountID string) (*connector.ConnectedAccount, error) {
			return account, nil
		},
	}

	var refreshCalled bool
	providerMock := &connector.OAuthProviderMock{
		ProviderFunc: func() string { return "google" },
		RefreshTokenFunc: func(ctx context.Context, refreshToken string) (*connector.TokenResponse, error) {
			refreshCalled = true
			return nil, errors.New("should not be called")
		},
	}

	providers := connector.NewProviderRegistry()
	providers.Register(providerMock)

	mgr := connector.NewTokenManager(storeMock, cipher, providers, nil)
	mgr.SetNowFunc(func() time.Time { return now })

	token, err := mgr.TokenSource(ctx, "spc_1", "cac_valid")
	require.NoError(t, err)
	assert.Equal(t, "valid-cached-token", token)
	assert.False(t, refreshCalled, "upstream refresh must not be called when token has > 60s validity")
}

func TestTokenManager_InvalidGrantTransition(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	cipher, err := crypto.NewCipher("test-encryption-key-32byteslong!")
	require.NoError(t, err)

	encAccess, _ := cipher.Encrypt("old-access")
	encRefresh, _ := cipher.Encrypt("old-refresh")

	now := time.Now()
	account := &connector.ConnectedAccount{
		ID:              "cac_reauth",
		SpaceID:         "spc_1",
		Provider:        "google",
		AccessTokenEnc:  encAccess,
		RefreshTokenEnc: encRefresh,
		TokenExpiry:     now.Add(-10 * time.Minute), // expired
		Status:          connector.AccountStatusHealthy,
	}

	var updatedStatus connector.AccountStatus
	var updatedReason *string

	storeMock := &connector.StoreMock{
		GetAccountFunc: func(ctx context.Context, spaceID, accountID string) (*connector.ConnectedAccount, error) {
			return account, nil
		},
		UpdateAccountStatusFunc: func(ctx context.Context, spaceID, accountID string, status connector.AccountStatus, reason *string, backoffUntil *time.Time) error {
			updatedStatus = status
			updatedReason = reason
			account.Status = status
			return nil
		},
	}

	providerMock := &connector.OAuthProviderMock{
		ProviderFunc: func() string { return "google" },
		RefreshTokenFunc: func(ctx context.Context, refreshToken string) (*connector.TokenResponse, error) {
			return nil, connector.ErrInvalidGrant
		},
	}

	providers := connector.NewProviderRegistry()
	providers.Register(providerMock)

	mgr := connector.NewTokenManager(storeMock, cipher, providers, nil)
	mgr.SetNowFunc(func() time.Time { return now })

	_, err = mgr.TokenSource(ctx, "spc_1", "cac_reauth")
	assert.ErrorIs(t, err, connector.ErrInvalidGrant)
	assert.Equal(t, connector.AccountStatusReauthRequired, updatedStatus)
	require.NotNil(t, updatedReason)
	assert.Contains(t, *updatedReason, "invalid or revoked")
}

func TestTokenManager_SafeMultiSpaceDisconnect(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	cipher, err := crypto.NewCipher("test-encryption-key-32byteslong!")
	require.NoError(t, err)

	encRefresh, _ := cipher.Encrypt("refresh-token-123")

	tests := []struct {
		name               string
		activeOtherSpaces  int
		wantRevokeCalled   bool
		enabledCaps        []string
		wantCleanersCalled []string
	}{
		{
			name:               "another space holds connection: upstream revoke skipped",
			activeOtherSpaces:  1,
			wantRevokeCalled:   false,
			enabledCaps:        []string{"calendar"},
			wantCleanersCalled: []string{"calendar"},
		},
		{
			name:               "last space: upstream revoke called",
			activeOtherSpaces:  0,
			wantRevokeCalled:   true,
			enabledCaps:        []string{"calendar", "mail"},
			wantCleanersCalled: []string{"calendar", "mail"},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			account := &connector.ConnectedAccount{
				ID:                  "cac_disconnect",
				SpaceID:             "spc_disconnect",
				Provider:            "google",
				ProviderAccountID:   "google_user_sub_999",
				RefreshTokenEnc:     encRefresh,
				EnabledCapabilities: tc.enabledCaps,
				Status:              connector.AccountStatusHealthy,
			}

			var deletedAccountID string
			storeMock := &connector.StoreMock{
				GetAccountFunc: func(ctx context.Context, spaceID, accountID string) (*connector.ConnectedAccount, error) {
					return account, nil
				},
				CountActiveByProviderIdentityFunc: func(ctx context.Context, provider, providerAccountID, excludeSpaceID string) (int, error) {
					assert.Equal(t, "google", provider)
					assert.Equal(t, "google_user_sub_999", providerAccountID)
					assert.Equal(t, "spc_disconnect", excludeSpaceID)
					return tc.activeOtherSpaces, nil
				},
				DeleteAccountFunc: func(ctx context.Context, spaceID, accountID string) error {
					deletedAccountID = accountID
					return nil
				},
			}

			var revokeTokenCalled bool
			providerMock := &connector.OAuthProviderMock{
				ProviderFunc: func() string { return "google" },
				RevokeTokenFunc: func(ctx context.Context, token string) error {
					revokeTokenCalled = true
					assert.Equal(t, "refresh-token-123", token)
					return nil
				},
			}

			providers := connector.NewProviderRegistry()
			providers.Register(providerMock)

			var cleanedCaps []string
			cleaners := connector.NewCleanerRegistry()
			cleaners.RegisterCleaner(connector.CapabilityCalendar, func(ctx context.Context, spaceID, accountID string) error {
				cleanedCaps = append(cleanedCaps, "calendar")
				return nil
			})
			cleaners.RegisterCleaner(connector.CapabilityMail, func(ctx context.Context, spaceID, accountID string) error {
				cleanedCaps = append(cleanedCaps, "mail")
				return nil
			})

			mgr := connector.NewTokenManager(storeMock, cipher, providers, cleaners)

			err := mgr.DisconnectAccount(ctx, "spc_disconnect", "cac_disconnect")
			require.NoError(t, err)

			assert.Equal(t, tc.wantRevokeCalled, revokeTokenCalled)
			assert.Equal(t, "cac_disconnect", deletedAccountID)
			assert.ElementsMatch(t, tc.wantCleanersCalled, cleanedCaps)
		})
	}
}

func TestTokenManager_DisableCapability(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	cipher, err := crypto.NewCipher("test-encryption-key-32byteslong!")
	require.NoError(t, err)

	account := &connector.ConnectedAccount{
		ID:                  "cac_cap",
		SpaceID:             "spc_1",
		Provider:            "google",
		EnabledCapabilities: []string{"calendar", "mail"},
		Status:              connector.AccountStatusHealthy,
	}

	var updatedAccount *connector.ConnectedAccount
	storeMock := &connector.StoreMock{
		GetAccountFunc: func(ctx context.Context, spaceID, accountID string) (*connector.ConnectedAccount, error) {
			return account, nil
		},
		UpdateAccountFunc: func(ctx context.Context, acc *connector.ConnectedAccount) error {
			updatedAccount = acc
			return nil
		},
	}

	var cleanerCalledWithCap string
	cleaners := connector.NewCleanerRegistry()
	cleaners.RegisterCleaner(connector.CapabilityCalendar, func(ctx context.Context, spaceID, accountID string) error {
		cleanerCalledWithCap = "calendar"
		assert.Equal(t, "spc_1", spaceID)
		assert.Equal(t, "cac_cap", accountID)
		return nil
	})

	mgr := connector.NewTokenManager(storeMock, cipher, nil, cleaners)

	err = mgr.DisableCapability(ctx, "spc_1", "cac_cap", connector.CapabilityCalendar)
	require.NoError(t, err)

	assert.Equal(t, "calendar", cleanerCalledWithCap)
	require.NotNil(t, updatedAccount)
	assert.Equal(t, []string{"mail"}, []string(updatedAccount.EnabledCapabilities))
}
