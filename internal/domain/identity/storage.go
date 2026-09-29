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
	ConsumeChallenge(ctx context.Context, nonce string, now time.Time) (bool, error)
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
