package connector

import (
	"context"
	"errors"
	"fmt"
	"slices"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/crypto"
	platformerrors "github.com/masterkeysrd/saturn/internal/platform/errors"
	"golang.org/x/sync/singleflight"
)

// TokenManager manages ConnectedAccount token lifecycles, single-flight refresh,
// multi-Space safe revocation, and capability cleanups.
type TokenManager struct {
	store     Store
	cipher    *crypto.Cipher
	providers *ProviderRegistry
	cleaners  *CleanerRegistry
	sf        singleflight.Group
	nowFunc   func() time.Time
}

// NewTokenManager initializes a new TokenManager instance.
func NewTokenManager(
	store Store,
	cipher *crypto.Cipher,
	providers *ProviderRegistry,
	cleaners *CleanerRegistry,
) *TokenManager {
	if cleaners == nil {
		cleaners = DefaultCleanerRegistry
	}
	return &TokenManager{
		store:     store,
		cipher:    cipher,
		providers: providers,
		cleaners:  cleaners,
		nowFunc:   time.Now,
	}
}

// SetNowFunc overrides the current time provider (used for deterministic testing).
func (m *TokenManager) SetNowFunc(fn func() time.Time) {
	m.nowFunc = fn
}

func (m *TokenManager) now() time.Time {
	if m.nowFunc != nil {
		return m.nowFunc()
	}
	return time.Now()
}

// TokenSource retrieves a valid, decrypted access token for the given connected account.
// If the token is expired or expiring within 60 seconds, it triggers a single-flight refresh
// against the upstream provider, encrypts and stores the new tokens, and returns the fresh access token.
func (m *TokenManager) TokenSource(ctx context.Context, spaceID, accountID string) (string, error) {
	const op platformerrors.Op = "platform/connector/TokenManager.TokenSource"

	account, err := m.store.GetAccount(ctx, spaceID, accountID)
	if err != nil {
		return "", platformerrors.E(op, err)
	}
	if account == nil {
		return "", platformerrors.E(op, platformerrors.NotExist, "connected account not found")
	}

	now := m.now()

	// Check terminal and non-refreshable statuses
	if account.Status == AccountStatusRevoked {
		return "", platformerrors.E(op, platformerrors.Permission, "connected account is revoked")
	}
	if account.Status == AccountStatusReauthRequired {
		return "", platformerrors.E(op, platformerrors.Unauthenticated, ErrInvalidGrant)
	}
	if account.IsRateLimited(now) {
		return "", platformerrors.E(op, platformerrors.ResourceExhausted, fmt.Errorf("%w: backoff until %s", ErrRateLimited, account.BackoffUntil.Format(time.RFC3339)))
	}

	// If token has more than 60s remaining, decrypt and return current access token
	if account.TokenExpiry.After(now.Add(60 * time.Second)) {
		plainToken, err := m.cipher.Decrypt(account.AccessTokenEnc)
		if err != nil {
			return "", platformerrors.E(op, fmt.Errorf("decrypt access token: %w", err))
		}
		return plainToken, nil
	}

	// Token is expired or expiring within 60 seconds: execute single-flight refresh
	v, err, _ := m.sf.Do(account.ID, func() (any, error) {
		return m.refreshToken(ctx, spaceID, accountID)
	})
	if err != nil {
		return "", platformerrors.E(op, err)
	}

	token, ok := v.(string)
	if !ok {
		return "", platformerrors.E(op, platformerrors.Internal, "unexpected token source return type")
	}
	return token, nil
}

func (m *TokenManager) refreshToken(ctx context.Context, spaceID, accountID string) (string, error) {
	// Re-read account in case a concurrent execution already refreshed it
	account, err := m.store.GetAccount(ctx, spaceID, accountID)
	if err != nil {
		return "", err
	}
	if account == nil {
		return "", platformerrors.E(platformerrors.NotExist, "connected account not found")
	}

	now := m.now()
	if account.TokenExpiry.After(now.Add(60 * time.Second)) {
		return m.cipher.Decrypt(account.AccessTokenEnc)
	}

	rawRefreshToken, err := m.cipher.Decrypt(account.RefreshTokenEnc)
	if err != nil {
		return "", fmt.Errorf("decrypt refresh token: %w", err)
	}

	provider, err := m.providers.Get(account.Provider)
	if err != nil {
		return "", err
	}

	resp, err := provider.RefreshToken(ctx, rawRefreshToken)
	if err != nil {
		if errors.Is(err, ErrInvalidGrant) {
			reason := "upstream refresh token invalid or revoked"
			_ = m.store.UpdateAccountStatus(ctx, spaceID, accountID, AccountStatusReauthRequired, &reason, nil)
			return "", ErrInvalidGrant
		}
		if errors.Is(err, ErrRateLimited) {
			backoff := now.Add(5 * time.Minute)
			reason := "upstream rate limit exceeded during refresh"
			_ = m.store.UpdateAccountStatus(ctx, spaceID, accountID, AccountStatusRateLimited, &reason, &backoff)
			return "", ErrRateLimited
		}
		return "", fmt.Errorf("upstream refresh failed: %w", err)
	}

	encAccessToken, err := m.cipher.Encrypt(resp.AccessToken)
	if err != nil {
		return "", fmt.Errorf("encrypt new access token: %w", err)
	}

	// Providers like Google may not rotate refresh token on every refresh
	refreshTokenToStore := resp.RefreshToken
	if refreshTokenToStore == "" {
		refreshTokenToStore = rawRefreshToken
	}
	encRefreshToken, err := m.cipher.Encrypt(refreshTokenToStore)
	if err != nil {
		return "", fmt.Errorf("encrypt new refresh token: %w", err)
	}

	if err := m.store.UpdateAccountTokens(ctx, accountID, encAccessToken, encRefreshToken, resp.Expiry); err != nil {
		return "", fmt.Errorf("persist refreshed tokens: %w", err)
	}

	return resp.AccessToken, nil
}

// DisconnectAccount safely disconnects an account from a Space.
// It verifies whether any other Space holds an active connection for the same provider identity:
// - Upstream RevokeToken is ONLY invoked when count == 0.
// - All registered CapabilityCleaners are executed for the account's enabled capabilities.
// - The account is deleted from the database.
func (m *TokenManager) DisconnectAccount(ctx context.Context, spaceID, accountID string) error {
	const op platformerrors.Op = "platform/connector/TokenManager.DisconnectAccount"

	account, err := m.store.GetAccount(ctx, spaceID, accountID)
	if err != nil {
		return platformerrors.E(op, err)
	}
	if account == nil {
		return nil
	}

	// 1. Safe multi-Space disconnect check
	count, err := m.store.CountActiveByProviderIdentity(ctx, account.Provider, account.ProviderAccountID, spaceID)
	if err != nil {
		return platformerrors.E(op, fmt.Errorf("count active connections: %w", err))
	}

	// Only revoke upstream grant if no other space is actively using this provider identity
	if count == 0 {
		rawRefreshToken, err := m.cipher.Decrypt(account.RefreshTokenEnc)
		if err == nil && rawRefreshToken != "" {
			provider, err := m.providers.Get(account.Provider)
			if err == nil {
				// We attempt revocation; log or suppress error if token is already expired
				_ = provider.RevokeToken(ctx, rawRefreshToken)
			}
		}
	}

	// 2. Execute capability cleaners for all currently enabled capabilities
	caps := make([]Capability, 0, len(account.EnabledCapabilities))
	for _, c := range account.EnabledCapabilities {
		caps = append(caps, Capability(c))
	}
	if err := m.cleaners.RunCleaners(ctx, spaceID, accountID, caps...); err != nil {
		return platformerrors.E(op, fmt.Errorf("run capability cleaners: %w", err))
	}

	// 3. Delete account record
	if err := m.store.DeleteAccount(ctx, spaceID, accountID); err != nil {
		return platformerrors.E(op, fmt.Errorf("delete account: %w", err))
	}

	return nil
}

// DisableCapability disables a single capability on an account, executes the registered
// CapabilityCleaner within the transaction context, and updates the account capabilities.
func (m *TokenManager) DisableCapability(ctx context.Context, spaceID, accountID string, cap Capability) error {
	const op platformerrors.Op = "platform/connector/TokenManager.DisableCapability"

	account, err := m.store.GetAccount(ctx, spaceID, accountID)
	if err != nil {
		return platformerrors.E(op, err)
	}
	if account == nil {
		return platformerrors.E(op, platformerrors.NotExist, "connected account not found")
	}

	if !account.HasCapability(cap) {
		return nil
	}

	// Run capability cleaner first within the transaction
	if err := m.cleaners.RunCleaners(ctx, spaceID, accountID, cap); err != nil {
		return platformerrors.E(op, fmt.Errorf("capability cleaner failed: %w", err))
	}

	// Remove capability from enabled list
	updatedCaps := make([]string, 0, len(account.EnabledCapabilities))
	for _, c := range account.EnabledCapabilities {
		if c != string(cap) {
			updatedCaps = append(updatedCaps, c)
		}
	}
	account.EnabledCapabilities = updatedCaps

	if err := m.store.UpdateAccount(ctx, account); err != nil {
		return platformerrors.E(op, fmt.Errorf("update account capabilities: %w", err))
	}

	return nil
}

// SaveAccountParams contains inputs for creating or connecting an account after an OAuth exchange.
type SaveAccountParams struct {
	SpaceID             string
	UserID              string
	Provider            string
	ProviderAccountID   string
	Email               string
	DisplayName         *string
	AvatarURL           *string
	Color               *string
	AccessToken         string
	RefreshToken        string
	TokenExpiry         time.Time
	GrantedScopes       []string
	EnabledCapabilities []Capability
}

// SaveAccount encrypts tokens and inserts or updates a ConnectedAccount.
func (m *TokenManager) SaveAccount(ctx context.Context, params SaveAccountParams) (*ConnectedAccount, error) {
	const op platformerrors.Op = "platform/connector/TokenManager.SaveAccount"

	encAccessToken, err := m.cipher.Encrypt(params.AccessToken)
	if err != nil {
		return nil, platformerrors.E(op, fmt.Errorf("encrypt access token: %w", err))
	}

	encRefreshToken, err := m.cipher.Encrypt(params.RefreshToken)
	if err != nil {
		return nil, platformerrors.E(op, fmt.Errorf("encrypt refresh token: %w", err))
	}

	caps := make([]string, len(params.EnabledCapabilities))
	for i, c := range params.EnabledCapabilities {
		caps[i] = string(c)
	}

	existing, err := m.store.GetAccountByProvider(ctx, params.SpaceID, params.Provider, params.ProviderAccountID)
	if err != nil {
		return nil, platformerrors.E(op, err)
	}

	if existing != nil {
		// Update existing account (e.g. re-auth or capability upgrade)
		existing.AccessTokenEnc = encAccessToken
		existing.RefreshTokenEnc = encRefreshToken
		existing.TokenExpiry = params.TokenExpiry
		existing.GrantedScopes = MergeScopes(existing.GrantedScopes, params.GrantedScopes)
		for _, c := range caps {
			if !slices.Contains(existing.EnabledCapabilities, c) {
				existing.EnabledCapabilities = append(existing.EnabledCapabilities, c)
			}
		}
		if params.DisplayName != nil {
			existing.DisplayName = params.DisplayName
		}
		if params.AvatarURL != nil {
			existing.AvatarURL = params.AvatarURL
		}
		existing.Status = AccountStatusHealthy
		existing.StatusReason = nil
		existing.BackoffUntil = nil

		if err := m.store.UpdateAccountTokens(ctx, existing.ID, encAccessToken, encRefreshToken, params.TokenExpiry); err != nil {
			return nil, platformerrors.E(op, err)
		}
		if err := m.store.UpdateAccount(ctx, existing); err != nil {
			return nil, platformerrors.E(op, err)
		}
		return existing, nil
	}

	// Create new account
	id, err := GenerateConnectedAccountID()
	if err != nil {
		return nil, platformerrors.E(op, err)
	}

	newAccount := &ConnectedAccount{
		ID:                  id,
		SpaceID:             params.SpaceID,
		CreatedByUserID:     params.UserID,
		Provider:            params.Provider,
		ProviderAccountID:   params.ProviderAccountID,
		Email:               params.Email,
		DisplayName:         params.DisplayName,
		AvatarURL:           params.AvatarURL,
		Color:               params.Color,
		AccessTokenEnc:      encAccessToken,
		RefreshTokenEnc:     encRefreshToken,
		TokenExpiry:         params.TokenExpiry,
		GrantedScopes:       params.GrantedScopes,
		EnabledCapabilities: caps,
		Status:              AccountStatusHealthy,
		Version:             1,
	}

	if err := m.store.CreateAccount(ctx, newAccount); err != nil {
		return nil, platformerrors.E(op, err)
	}

	return newAccount, nil
}
