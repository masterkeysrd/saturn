package connector

import (
	"context"
	"strings"
	"time"

	"github.com/lib/pq"
	"github.com/masterkeysrd/saturn/internal/platform/crypto"
	"github.com/masterkeysrd/saturn/internal/platform/db"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

// Store defines the storage persistence contract for connected accounts, OAuth states, and contact cache.
// @Mock
type Store interface {
	CreateAccount(ctx context.Context, account *ConnectedAccount) error
	GetAccount(ctx context.Context, spaceID, accountID string) (*ConnectedAccount, error)
	GetAccountByID(ctx context.Context, accountID string) (*ConnectedAccount, error)
	GetAccountByProvider(ctx context.Context, spaceID, provider, providerAccountID string) (*ConnectedAccount, error)
	ListAccounts(ctx context.Context, spaceID string) ([]*ConnectedAccount, error)
	ListActiveAccounts(ctx context.Context) ([]*ConnectedAccount, error)
	UpdateAccount(ctx context.Context, account *ConnectedAccount) error
	UpdateAccountTokens(ctx context.Context, accountID string, accessTokenEnc, refreshTokenEnc string, expiry time.Time) error
	UpdateAccountStatus(ctx context.Context, spaceID, accountID string, status AccountStatus, reason *string, backoffUntil *time.Time) error
	DeleteAccount(ctx context.Context, spaceID, accountID string) error
	CountActiveByProviderIdentity(ctx context.Context, provider, providerAccountID, excludeSpaceID string) (int, error)
	CreateOAuthState(ctx context.Context, state *OAuthState) error
	ConsumeOAuthState(ctx context.Context, stateHash string) (*OAuthState, error)
	UpsertContacts(ctx context.Context, contacts []*AccountContact) error
	ListContacts(ctx context.Context, spaceID, accountID string) ([]*AccountContact, error)
	SuggestContacts(ctx context.Context, spaceID string, query string, limit int) ([]*AccountContact, error)
}

// SQLStore implements Store backed by PostgreSQL.
type SQLStore struct {
	db db.DB
}

// NewStore initializes a new SQLStore.
func NewStore(database db.DB) *SQLStore {
	return &SQLStore{db: database}
}

// CreateAccount persists a new ConnectedAccount, strictly enforcing that tokens are encrypted.
func (s *SQLStore) CreateAccount(ctx context.Context, account *ConnectedAccount) error {
	const op errors.Op = "platform/connector/storage.CreateAccount"

	if account == nil {
		return errors.E(op, errors.Invalid, "account is nil")
	}

	// Guardrail: plain tokens must NEVER be stored
	if !strings.HasPrefix(account.AccessTokenEnc, crypto.Prefix) {
		return errors.E(op, errors.Invalid, "cannot store unencrypted access token: missing enc:v1: prefix")
	}
	if !strings.HasPrefix(account.RefreshTokenEnc, crypto.Prefix) {
		return errors.E(op, errors.Invalid, "cannot store unencrypted refresh token: missing enc:v1: prefix")
	}

	if account.ID == "" {
		id, err := GenerateConnectedAccountID()
		if err != nil {
			return errors.E(op, err)
		}
		account.ID = id
	}

	if account.Status == "" {
		account.Status = AccountStatusHealthy
	}
	if account.Version <= 0 {
		account.Version = 1
	}

	query := `INSERT INTO platform.connected_accounts (
		id, space_id, created_by_user_id, provider, provider_account_id,
		email, display_name, avatar_url, color,
		access_token_enc, refresh_token_enc, token_expiry,
		granted_scopes, enabled_capabilities, status, status_reason,
		backoff_until, last_sync_time, version, create_time, update_time
	) VALUES (
		$1, $2, $3, $4, $5,
		$6, $7, $8, $9,
		$10, $11, $12,
		$13, $14, $15, $16,
		$17, $18, $19, NOW(), NOW()
	) RETURNING create_time, update_time`

	var ct, ut time.Time
	err := s.db.Get(ctx, &struct {
		CreateTime *time.Time `db:"create_time"`
		UpdateTime *time.Time `db:"update_time"`
	}{
		CreateTime: &ct,
		UpdateTime: &ut,
	}, query,
		account.ID, account.SpaceID, account.CreatedByUserID, account.Provider, account.ProviderAccountID,
		account.Email, account.DisplayName, account.AvatarURL, account.Color,
		account.AccessTokenEnc, account.RefreshTokenEnc, account.TokenExpiry,
		pq.Array(account.GrantedScopes), pq.Array(account.EnabledCapabilities), account.Status, account.StatusReason,
		account.BackoffUntil, account.LastSyncTime, account.Version,
	)
	if err != nil {
		return errors.E(op, err)
	}

	account.CreateTime = ct
	account.UpdateTime = ut
	return nil
}

// GetAccount retrieves a ConnectedAccount by space ID and account ID.
func (s *SQLStore) GetAccount(ctx context.Context, spaceID, accountID string) (*ConnectedAccount, error) {
	const op errors.Op = "platform/connector/storage.GetAccount"

	query := `SELECT
		id, space_id, created_by_user_id, provider, provider_account_id,
		email, display_name, avatar_url, color,
		access_token_enc, refresh_token_enc, token_expiry,
		granted_scopes, enabled_capabilities, status, status_reason,
		backoff_until, last_sync_time, version, create_time, update_time
	FROM platform.connected_accounts
	WHERE space_id = $1 AND id = $2`

	var acc ConnectedAccount
	if err := s.db.Get(ctx, &acc, query, spaceID, accountID); err != nil {
		if errors.Is(err, errors.NotExist) {
			return nil, nil
		}
		return nil, errors.E(op, err)
	}
	return &acc, nil
}

// GetAccountByID retrieves a ConnectedAccount across spaces by account ID.
func (s *SQLStore) GetAccountByID(ctx context.Context, accountID string) (*ConnectedAccount, error) {
	const op errors.Op = "platform/connector/storage.GetAccountByID"

	query := `SELECT
		id, space_id, created_by_user_id, provider, provider_account_id,
		email, display_name, avatar_url, color,
		access_token_enc, refresh_token_enc, token_expiry,
		granted_scopes, enabled_capabilities, status, status_reason,
		backoff_until, last_sync_time, version, create_time, update_time
	FROM platform.connected_accounts
	WHERE id = $1`

	var acc ConnectedAccount
	if err := s.db.Get(ctx, &acc, query, accountID); err != nil {
		if errors.Is(err, errors.NotExist) {
			return nil, nil
		}
		return nil, errors.E(op, err)
	}
	return &acc, nil
}

// GetAccountByProvider retrieves an account matching the provider and provider_account_id in a space.
func (s *SQLStore) GetAccountByProvider(ctx context.Context, spaceID, provider, providerAccountID string) (*ConnectedAccount, error) {
	const op errors.Op = "platform/connector/storage.GetAccountByProvider"

	query := `SELECT
		id, space_id, created_by_user_id, provider, provider_account_id,
		email, display_name, avatar_url, color,
		access_token_enc, refresh_token_enc, token_expiry,
		granted_scopes, enabled_capabilities, status, status_reason,
		backoff_until, last_sync_time, version, create_time, update_time
	FROM platform.connected_accounts
	WHERE space_id = $1 AND provider = $2 AND provider_account_id = $3`

	var acc ConnectedAccount
	if err := s.db.Get(ctx, &acc, query, spaceID, provider, providerAccountID); err != nil {
		if errors.Is(err, errors.NotExist) {
			return nil, nil
		}
		return nil, errors.E(op, err)
	}
	return &acc, nil
}

// ListAccounts returns all connected accounts in a space.
func (s *SQLStore) ListAccounts(ctx context.Context, spaceID string) ([]*ConnectedAccount, error) {
	const op errors.Op = "platform/connector/storage.ListAccounts"

	query := `SELECT
		id, space_id, created_by_user_id, provider, provider_account_id,
		email, display_name, avatar_url, color,
		access_token_enc, refresh_token_enc, token_expiry,
		granted_scopes, enabled_capabilities, status, status_reason,
		backoff_until, last_sync_time, version, create_time, update_time
	FROM platform.connected_accounts
	WHERE space_id = $1
	ORDER BY create_time DESC`

	var accounts []*ConnectedAccount
	if err := s.db.Select(ctx, &accounts, query, spaceID); err != nil {
		return nil, errors.E(op, err)
	}
	return accounts, nil
}

// ListActiveAccounts returns all active connected accounts across spaces that are not in backoff.
func (s *SQLStore) ListActiveAccounts(ctx context.Context) ([]*ConnectedAccount, error) {
	const op errors.Op = "platform/connector/storage.ListActiveAccounts"

	query := `SELECT
		id, space_id, created_by_user_id, provider, provider_account_id,
		email, display_name, avatar_url, color,
		access_token_enc, refresh_token_enc, token_expiry,
		granted_scopes, enabled_capabilities, status, status_reason,
		backoff_until, last_sync_time, version, create_time, update_time
	FROM platform.connected_accounts
	WHERE status = 'healthy' AND (backoff_until IS NULL OR backoff_until <= NOW())
	ORDER BY create_time DESC`

	var accounts []*ConnectedAccount
	if err := s.db.Select(ctx, &accounts, query); err != nil {
		return nil, errors.E(op, err)
	}
	return accounts, nil
}

// UpdateAccount updates general account fields (scopes, capabilities, status, metadata).
func (s *SQLStore) UpdateAccount(ctx context.Context, account *ConnectedAccount) error {
	const op errors.Op = "platform/connector/storage.UpdateAccount"

	if account == nil {
		return errors.E(op, errors.Invalid, "account is nil")
	}

	query := `UPDATE platform.connected_accounts SET
		display_name = $1,
		avatar_url = $2,
		color = $3,
		granted_scopes = $4,
		enabled_capabilities = $5,
		status = $6,
		status_reason = $7,
		backoff_until = $8,
		last_sync_time = $9,
		version = version + 1,
		update_time = NOW()
	WHERE space_id = $10 AND id = $11`

	err := s.db.ExecOne(ctx, query,
		account.DisplayName, account.AvatarURL, account.Color,
		pq.Array(account.GrantedScopes), pq.Array(account.EnabledCapabilities),
		account.Status, account.StatusReason, account.BackoffUntil, account.LastSyncTime,
		account.SpaceID, account.ID,
	)
	if err != nil {
		return errors.E(op, err)
	}
	return nil
}

// UpdateAccountTokens persists refreshed access and refresh tokens, strictly enforcing encryption.
func (s *SQLStore) UpdateAccountTokens(ctx context.Context, accountID string, accessTokenEnc, refreshTokenEnc string, expiry time.Time) error {
	const op errors.Op = "platform/connector/storage.UpdateAccountTokens"

	if !strings.HasPrefix(accessTokenEnc, crypto.Prefix) {
		return errors.E(op, errors.Invalid, "cannot store unencrypted access token: missing enc:v1: prefix")
	}
	if !strings.HasPrefix(refreshTokenEnc, crypto.Prefix) {
		return errors.E(op, errors.Invalid, "cannot store unencrypted refresh token: missing enc:v1: prefix")
	}

	query := `UPDATE platform.connected_accounts SET
		access_token_enc = $1,
		refresh_token_enc = $2,
		token_expiry = $3,
		status = 'healthy',
		status_reason = NULL,
		backoff_until = NULL,
		version = version + 1,
		update_time = NOW()
	WHERE id = $4`

	if err := s.db.ExecOne(ctx, query, accessTokenEnc, refreshTokenEnc, expiry, accountID); err != nil {
		return errors.E(op, err)
	}
	return nil
}

// UpdateAccountStatus updates an account's health status and optional error/backoff details.
func (s *SQLStore) UpdateAccountStatus(ctx context.Context, spaceID, accountID string, status AccountStatus, reason *string, backoffUntil *time.Time) error {
	const op errors.Op = "platform/connector/storage.UpdateAccountStatus"

	query := `UPDATE platform.connected_accounts SET
		status = $1,
		status_reason = $2,
		backoff_until = $3,
		version = version + 1,
		update_time = NOW()
	WHERE space_id = $4 AND id = $5`

	if err := s.db.ExecOne(ctx, query, status, reason, backoffUntil, spaceID, accountID); err != nil {
		return errors.E(op, err)
	}
	return nil
}

// DeleteAccount removes a ConnectedAccount record.
func (s *SQLStore) DeleteAccount(ctx context.Context, spaceID, accountID string) error {
	const op errors.Op = "platform/connector/storage.DeleteAccount"

	query := `DELETE FROM platform.connected_accounts WHERE space_id = $1 AND id = $2`
	if err := s.db.ExecOne(ctx, query, spaceID, accountID); err != nil {
		return errors.E(op, err)
	}
	return nil
}

// CountActiveByProviderIdentity counts other spaces holding an active connection for the same provider identity.
// Only records where status != 'revoked' and space_id != excludeSpaceID are counted.
func (s *SQLStore) CountActiveByProviderIdentity(ctx context.Context, provider, providerAccountID, excludeSpaceID string) (int, error) {
	const op errors.Op = "platform/connector/storage.CountActiveByProviderIdentity"

	query := `SELECT COUNT(*) FROM platform.connected_accounts
	WHERE provider = $1 AND provider_account_id = $2 AND space_id != $3 AND status != 'revoked'`

	var count int
	if err := s.db.Get(ctx, &count, query, provider, providerAccountID, excludeSpaceID); err != nil {
		return 0, errors.E(op, err)
	}
	return count, nil
}

// CreateOAuthState records an OAuth PKCE session, enforcing that code_verifier is encrypted.
func (s *SQLStore) CreateOAuthState(ctx context.Context, state *OAuthState) error {
	const op errors.Op = "platform/connector/storage.CreateOAuthState"

	if state == nil {
		return errors.E(op, errors.Invalid, "state is nil")
	}
	if !strings.HasPrefix(state.CodeVerifierEnc, crypto.Prefix) {
		return errors.E(op, errors.Invalid, "cannot store unencrypted code_verifier: missing enc:v1: prefix")
	}

	query := `INSERT INTO platform.oauth_states (
		state_hash, space_id, user_id, provider, capabilities,
		connected_account_id, code_verifier_enc, return_url, expires_at, create_time
	) VALUES (
		$1, $2, $3, $4, $5,
		$6, $7, $8, $9, NOW()
	)`

	_, err := s.db.Exec(ctx, query,
		state.StateHash, state.SpaceID, state.UserID, state.Provider, pq.Array(state.Capabilities),
		state.ConnectedAccountID, state.CodeVerifierEnc, state.ReturnURL, state.ExpiresAt,
	)
	if err != nil {
		return errors.E(op, err)
	}
	return nil
}

// ConsumeOAuthState atomically finds, deletes, and returns an unexpired OAuthState record by its SHA-256 state_hash.
// Returns (nil, nil) if the state does not exist or has expired.
func (s *SQLStore) ConsumeOAuthState(ctx context.Context, stateHash string) (*OAuthState, error) {
	const op errors.Op = "platform/connector/storage.ConsumeOAuthState"

	query := `DELETE FROM platform.oauth_states
	WHERE state_hash = $1 AND expires_at > NOW()
	RETURNING state_hash, space_id, user_id, provider, capabilities,
	          connected_account_id, code_verifier_enc, return_url, expires_at, create_time`

	var state OAuthState
	if err := s.db.Get(ctx, &state, query, stateHash); err != nil {
		if errors.Is(err, errors.NotExist) {
			return nil, nil
		}
		return nil, errors.E(op, err)
	}
	return &state, nil
}

// UpsertContacts inserts or updates cached contacts for a connected account.
func (s *SQLStore) UpsertContacts(ctx context.Context, contacts []*AccountContact) error {
	const op errors.Op = "platform/connector/storage.UpsertContacts"

	if len(contacts) == 0 {
		return nil
	}

	query := `INSERT INTO platform.account_contacts_cache (
		id, space_id, connected_account_id, provider_contact_id,
		email, display_name, avatar_url, update_time
	) VALUES (
		$1, $2, $3, $4, $5, $6, $7, NOW()
	) ON CONFLICT (connected_account_id, provider_contact_id) DO UPDATE SET
		email = EXCLUDED.email,
		display_name = EXCLUDED.display_name,
		avatar_url = EXCLUDED.avatar_url,
		update_time = NOW()`

	for _, c := range contacts {
		if c.ID == "" {
			newID, err := GenerateAccountContactID()
			if err != nil {
				return errors.E(op, err)
			}
			c.ID = newID
		}
		if _, err := s.db.Exec(ctx, query,
			c.ID, c.SpaceID, c.ConnectedAccountID, c.ProviderContactID,
			c.Email, c.DisplayName, c.AvatarURL,
		); err != nil {
			return errors.E(op, err)
		}
	}
	return nil
}

// ListContacts retrieves all cached contacts for a connected account.
func (s *SQLStore) ListContacts(ctx context.Context, spaceID, accountID string) ([]*AccountContact, error) {
	const op errors.Op = "platform/connector/storage.ListContacts"

	query := `SELECT id, space_id, connected_account_id, provider_contact_id,
	                 email, display_name, avatar_url, update_time
	FROM platform.account_contacts_cache
	WHERE space_id = $1 AND connected_account_id = $2
	ORDER BY display_name ASC NULLS LAST`

	var contacts []*AccountContact
	if err := s.db.Select(ctx, &contacts, query, spaceID, accountID); err != nil {
		return nil, errors.E(op, err)
	}
	return contacts, nil
}

// SuggestContacts searches cached address book contacts across all connected accounts in the space.
func (s *SQLStore) SuggestContacts(ctx context.Context, spaceID string, query string, limit int) ([]*AccountContact, error) {
	const op errors.Op = "platform/connector/storage.SuggestContacts"

	if limit <= 0 {
		limit = 20
	}
	if limit > 100 {
		limit = 100
	}

	trimmed := strings.TrimSpace(query)
	var contacts []*AccountContact

	if trimmed == "" {
		sqlQuery := `SELECT id, space_id, connected_account_id, provider_contact_id,
		                    email, display_name, avatar_url, update_time
		FROM platform.account_contacts_cache
		WHERE space_id = $1
		ORDER BY display_name ASC NULLS LAST, email ASC NULLS LAST
		LIMIT $2`
		if err := s.db.Select(ctx, &contacts, sqlQuery, spaceID, limit); err != nil {
			return nil, errors.E(op, err)
		}
		return contacts, nil
	}

	searchPattern := trimmed + "%"
	sqlQuery := `SELECT id, space_id, connected_account_id, provider_contact_id,
	                    email, display_name, avatar_url, update_time
	FROM platform.account_contacts_cache
	WHERE space_id = $1
	  AND (email ILIKE $2 OR display_name ILIKE $2)
	ORDER BY display_name ASC NULLS LAST, email ASC NULLS LAST
	LIMIT $3`

	if err := s.db.Select(ctx, &contacts, sqlQuery, spaceID, searchPattern, limit); err != nil {
		return nil, errors.E(op, err)
	}
	return contacts, nil
}
