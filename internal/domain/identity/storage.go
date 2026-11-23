package identity

import (
	"context"
	"time"
)

// UserStore defines the interface for user persistence operations.
type UserStore interface {
	// Create inserts a new user and returns the created record.
	Create(ctx context.Context, user *User) error

	// GetByID retrieves a user by their unique ID.
	GetByID(ctx context.Context, id UserID) (*User, error)

	// GetByIDs retrieves multiple users by their unique IDs in a single batch query.
	GetByIDs(ctx context.Context, ids []UserID) ([]*User, error)

	// GetByEmail retrieves a user by their email address.
	GetByEmail(ctx context.Context, email string) (*User, error)

	// GetByUsername retrieves a user by their username.
	GetByUsername(ctx context.Context, username string) (*User, error)

	// Update modifies an existing user with optimistic locking.
	Update(ctx context.Context, user *User) error

	// Delete removes a user by their unique ID.
	Delete(ctx context.Context, id UserID) error

	// GetUsers returns users with optional filtering and pagination.
	GetUsers(ctx context.Context, filter *ListUsersFilter) ([]*User, string, error)

	// UpdateLockoutState modifies the failed login attempts and lockout timestamps.
	UpdateLockoutState(ctx context.Context, req UpdateLockoutRequest) error
}

// UpdateLockoutRequest contains parameters for modifying a user's lockout state.
type UpdateLockoutRequest struct {
	UserID      UserID
	Attempts    int
	LockedUntil *time.Time
}

// UserCredentialStore defines the interface for user credential persistence operations.
type UserCredentialStore interface {
	// Create inserts a new credential for the given user.
	Create(ctx context.Context, credential *Credential) error

	// GetByUserID retrieves all credentials for a user.
	GetByUserID(ctx context.Context, userID UserID) ([]*Credential, error)

	// GetByUserIDAndAuthType retrieves a specific credential for a user.
	GetByUserIDAndAuthType(ctx context.Context, userID UserID, authType string) (*Credential, error)

	// Delete removes a credential for a user.
	Delete(ctx context.Context, userID UserID, authType string) error

	// Update replaces the secret_data for an existing credential.
	Update(ctx context.Context, credential *Credential) error
}

// MFAFactorStore defines persistence operations for MFA factors and recovery backup codes.
// @Mock
type MFAFactorStore interface {
	CreateFactor(ctx context.Context, factor *MFAFactor) error
	GetFactorByID(ctx context.Context, id MFAFactorID) (*MFAFactor, error)
	ListFactorsByUserID(ctx context.Context, userID UserID) ([]*MFAFactor, error)
	UpdateFactor(ctx context.Context, factor *MFAFactor) error
	DeleteFactor(ctx context.Context, id MFAFactorID, now time.Time) error
	SetPrimaryFactor(ctx context.Context, userID UserID, factorID MFAFactorID) error
	GetRecovery(ctx context.Context, userID UserID) (*MFARecovery, error)
	UpsertRecovery(ctx context.Context, recovery *MFARecovery) error
}

//go:generate go run github.com/masterkeysrd/saturn/tools/mockgen .

// DeviceStore defines persistence operations for trusted hardware devices.
// @Mock
type DeviceStore interface {
	CreateDevice(ctx context.Context, device *Device) error
	GetDeviceByID(ctx context.Context, id DeviceID) (*Device, error)
	ListDevicesByUserID(ctx context.Context, userID UserID) ([]*Device, error)
	UpdateDeviceLastUsed(ctx context.Context, id DeviceID, lastUsedAt time.Time) error
	RevokeDevice(ctx context.Context, id DeviceID, revokedAt time.Time) error
	RevokeAllByUserID(ctx context.Context, userID UserID, revokedAt time.Time) error
}

// AuthChallengeStore defines persistence operations for ephemeral authentication challenges.
// @Mock
type AuthChallengeStore interface {
	CreateChallenge(ctx context.Context, challenge *Challenge) error
	DeleteChallenge(ctx context.Context, nonce string) error
}

// SessionStoreProvider provides access to session persistence operations.
// @Mock
type SessionStoreProvider interface {
	Create(ctx context.Context, session *Session) error
	GetByID(ctx context.Context, id SessionID) (*Session, error)
	GetByRefreshTokenHash(ctx context.Context, hash []byte) (*Session, error)
	Update(ctx context.Context, session *Session) error
	ListActiveSessions(ctx context.Context, userID UserID) ([]*Session, error)
	RevokeFamily(ctx context.Context, familyID TokenFamilyID, now time.Time) error
	RevokeAllForUser(ctx context.Context, userID UserID, now time.Time) error
	RevokeByDeviceID(ctx context.Context, deviceID DeviceID, now time.Time) error
}

// PasswordResetStore defines persistence operations for single-use password reset tokens.
// @Mock
type PasswordResetStore interface {
	Create(ctx context.Context, token *PasswordResetToken) error
	GetByTokenHash(ctx context.Context, tokenHash []byte) (*PasswordResetToken, error)
	Update(ctx context.Context, token *PasswordResetToken) error
}

// APIKeyStore defines persistence operations for user-owned fine-grained API keys.
// @Mock
type APIKeyStore interface {
	Create(ctx context.Context, key *APIKey) error
	GetByID(ctx context.Context, id APIKeyID) (*APIKey, error)
	GetByHash(ctx context.Context, keyHash string) (*APIKey, error)
	ListByUserID(ctx context.Context, userID UserID) ([]*APIKey, error)
	ListByIDs(ctx context.Context, ids []APIKeyID) ([]*APIKey, error)
	Update(ctx context.Context, key *APIKey) error
	Delete(ctx context.Context, id APIKeyID) error
	TouchLastUsed(ctx context.Context, id APIKeyID, lastUsedAt time.Time) error
}

// OAuthClientStore defines persistence operations for registered OAuth 2.1 clients.
// @Mock
type OAuthClientStore interface {
	Create(ctx context.Context, client *OAuthClient) error
	UpsertCIMD(ctx context.Context, client *OAuthClient) error
	GetByID(ctx context.Context, id OAuthClientID) (*OAuthClient, error)
	ListByIDs(ctx context.Context, ids []OAuthClientID) ([]*OAuthClient, error)
	ListInstanceClients(ctx context.Context) ([]*OAuthClient, error)
	ListBySpaceID(ctx context.Context, spaceID string) ([]*OAuthClient, error)
	Update(ctx context.Context, client *OAuthClient) error
	UpdateSecret(ctx context.Context, id OAuthClientID, secretPrefix, secretHash string, updateTime time.Time) error
	Delete(ctx context.Context, id OAuthClientID) error
}

// OAuthGrantStore defines persistence operations for user OAuth 2.1 workspace grants.
// @Mock
type OAuthGrantStore interface {
	Create(ctx context.Context, grant *OAuthGrant) error
	GetByID(ctx context.Context, id OAuthGrantID) (*OAuthGrant, error)
	GetByRefreshTokenHash(ctx context.Context, tokenHash string) (*OAuthGrant, error)
	ListByUserID(ctx context.Context, userID UserID) ([]*OAuthGrant, error)
	ListBySpaceID(ctx context.Context, spaceID string) ([]*OAuthGrant, error)
	Update(ctx context.Context, grant *OAuthGrant) error
	Revoke(ctx context.Context, id OAuthGrantID, revokedAt time.Time) error
	TouchLastUsed(ctx context.Context, id OAuthGrantID, lastUsedAt time.Time) error
}

// OAuthAuthCodeStore defines persistence operations for single-use OAuth 2.1 authorization codes and handoff nonces.
// @Mock
type OAuthAuthCodeStore interface {
	Create(ctx context.Context, code *OAuthAuthCode) error
	ConsumeHandoff(ctx context.Context, handoffHash, newCodeHash string, codeExpiresAt, now time.Time) (*OAuthAuthCode, error)
	GetByCodeHash(ctx context.Context, codeHash string) (*OAuthAuthCode, error)
	MarkConsumed(ctx context.Context, id OAuthAuthCodeID, consumedAt time.Time) error
}

// OAuthAccessTokenStore defines persistence operations for opaque `sat_oat_...` OAuth access tokens.
// @Mock
type OAuthAccessTokenStore interface {
	Create(ctx context.Context, token *OAuthAccessToken) error
	GetByHash(ctx context.Context, tokenHash string) (*OAuthAccessToken, error)
	RevokeByTokenHash(ctx context.Context, tokenHash string, revokedAt time.Time) error
	RevokeByGrantID(ctx context.Context, grantID OAuthGrantID, revokedAt time.Time) error
}
