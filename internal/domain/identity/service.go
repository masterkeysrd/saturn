package identity

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/crypto"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/id"
	"github.com/masterkeysrd/saturn/internal/platform/log"
	"github.com/masterkeysrd/saturn/internal/platform/paging"
	"github.com/masterkeysrd/saturn/internal/platform/password"
)

// UserStoreProvider provides access to the UserStore.
// @Mock
type UserStoreProvider interface {
	Create(ctx context.Context, user *User) error
	GetByID(ctx context.Context, id UserID) (*User, error)
	GetByEmail(ctx context.Context, email string) (*User, error)
	GetByUsername(ctx context.Context, username string) (*User, error)
	Update(ctx context.Context, user *User) error
	Delete(ctx context.Context, id UserID) error
	GetUsers(ctx context.Context, filter *ListUsersFilter) (*paging.Page[*User], error)
	GetAuthVersion(ctx context.Context, id UserID) (int64, error)
	IncrementAuthVersion(ctx context.Context, id UserID) (int64, error)
	UpdateLockoutState(ctx context.Context, req UpdateLockoutRequest) error
}

// CredentialStoreProvider provides access to the CredentialStore.
// @Mock
type CredentialStoreProvider interface {
	Create(ctx context.Context, credential *Credential) error
	GetByUserID(ctx context.Context, userID UserID) ([]*Credential, error)
	GetByUserIDAndAuthType(ctx context.Context, userID UserID, authType string) (*Credential, error)
	Delete(ctx context.Context, userID UserID, authType string) error
	Update(ctx context.Context, credential *Credential) error
}

// Cipher defines encryption and decryption methods for sensitive credentials.
// @Mock
type Cipher interface {
	Encrypt(plaintext string) (string, error)
	Decrypt(ciphertext string) (string, error)
}

// TOTPProvider defines the interface for TOTP secret generation, passcode validation, and backup code handling.
// @Mock
type TOTPProvider interface {
	GenerateSecret() (string, error)
	ValidateCode(secret, code string, t time.Time) bool
	GenerateBackupCodes() (plainCodes []string, hashedCodes []string, err error)
	ValidateAndConsumeBackupCode(input string, hashedCodes []string) (remainingCodes []string, valid bool)
}

// DeviceVerifier defines cryptographic verification for hardware-bound device assertions.
// @Mock
type DeviceVerifier interface {
	VerifyAssertion(params crypto.VerifyAssertionParams) error
}

// Dependencies holds all storage and hashing interfaces required by the Service.
type Dependencies struct {
	UserStore          UserStoreProvider
	CredentialStore    CredentialStoreProvider
	SessionStore       SessionStoreProvider
	SecurityEventStore SecurityEventStore
	Hasher             Hasher
	MFAStore           MFAFactorStore
	Cipher             Cipher
	TOTP               TOTPProvider
	DeviceStore        DeviceStore
	ChallengeStore     AuthChallengeStore
	DeviceVerifier     DeviceVerifier
	PasswordResetStore PasswordResetStore
}

// Hasher is the password hashing interface used for authentication.
// @Mock
type Hasher interface {
	Verify(encodedHash, raw string) (needsRehash bool, err error)
}

// Service handles identity business logic.
type Service struct {
	deps Dependencies
}

// NewService creates a new Service.
func NewService(deps Dependencies) *Service {
	return &Service{deps: deps}
}

// CreateUser creates a new user. Returns UserExists if a user with the same email or username already exists.
func (s *Service) CreateUser(ctx context.Context, user *User) error {
	const op errors.Op = "domain/identity.CreateUser"

	if user.Status == "" {
		user.Status = UserStatusActive
	}

	existing, err := s.deps.UserStore.GetByEmail(ctx, user.Email)
	if err == nil && existing != nil && existing.ID != "" {
		return errors.E(op, errors.Exist, UserExists, "user with email already exists")
	}

	existing, err = s.deps.UserStore.GetByUsername(ctx, user.Username)
	if err == nil && existing != nil && existing.ID != "" {
		return errors.E(op, errors.Exist, UserExists, "user with username already exists")
	}

	if err := s.deps.UserStore.Create(ctx, user); err != nil {
		return errors.E(op, err)
	}
	return nil
}

// CreateCredential creates a credential. Returns CredentialExists if the user/authType combo already exists.
func (s *Service) CreateCredential(ctx context.Context, credential *Credential) error {
	const op errors.Op = "domain/identity.CreateCredential"

	existing, err := s.deps.CredentialStore.GetByUserIDAndAuthType(ctx, credential.UserID, credential.AuthType)
	if err == nil && existing != nil {
		return errors.E(op, errors.Exist, CredentialExists, "credential already exists")
	}

	if err := s.deps.CredentialStore.Create(ctx, credential); err != nil {
		return errors.E(op, err)
	}
	return nil
}

// UpdateCredential replaces the secret_data for an existing credential.
func (s *Service) UpdateCredential(ctx context.Context, credential *Credential) error {
	const op errors.Op = "domain/identity.UpdateCredential"

	if err := s.deps.CredentialStore.Update(ctx, credential); err != nil {
		return errors.E(op, err)
	}
	return nil
}

// GetUserByID retrieves a user by their ID. Returns NotFound if not found.
func (s *Service) GetUserByID(ctx context.Context, id UserID) (*User, error) {
	const op errors.Op = "domain/identity.GetUserByID"

	user, err := s.deps.UserStore.GetByID(ctx, id)
	if err != nil {
		if errors.Is(err, errors.NotExist) {
			return nil, errors.E(op, errors.NotExist, NotFound, "user not found")
		}
		return nil, errors.E(op, err)
	}
	return user, nil
}

// UpdateUser updates an existing user with optimistic locking. Returns VersionMismatch if the version doesn't match.
func (s *Service) UpdateUser(ctx context.Context, user *User) error {
	const op errors.Op = "domain/identity.UpdateUser"

	if err := s.deps.UserStore.Update(ctx, user); err != nil {
		if errors.Is(err, errors.Conflict) {
			return errors.E(op, errors.Conflict, VersionMismatch, "user not found or version mismatch")
		}
		return errors.E(op, err)
	}
	return nil
}

// ListUsersFilter encapsulates filtering and pagination parameters for listing users.
type ListUsersFilter struct {
	PageSize      int32
	NextPageToken string
	StatusFilter  UserStatus
	SearchQuery   string
}

// ListUsers returns users with optional filtering by status and search query, using a filter struct for clarity.
func (s *Service) ListUsers(ctx context.Context, filter *ListUsersFilter) (*paging.Page[*User], error) {
	const op errors.Op = "domain/identity.ListUsers"

	if filter.PageSize <= 0 || filter.PageSize > 100 {
		filter.PageSize = 20
	}

	page, err := s.deps.UserStore.GetUsers(ctx, filter)
	if err != nil {
		return nil, errors.E(op, err)
	}

	return page, nil
}

// ApproveUser activates a pending user account. Returns an error if the user is not in pending_approval state.
func (s *Service) ApproveUser(ctx context.Context, userID UserID) (*User, error) {
	const op errors.Op = "domain/identity.ApproveUser"

	user, err := s.GetUserByID(ctx, userID)
	if err != nil {
		return nil, errors.E(op, err)
	}

	if user.Status != UserStatusPendingApproval {
		return nil, errors.E(op, errors.Precondition, AccountPending, fmt.Sprintf("user is not in pending approval state: current status=%s", user.Status))
	}

	user.Status = UserStatusActive
	if err := s.UpdateUser(ctx, user); err != nil {
		return nil, errors.E(op, err)
	}

	return user, nil
}

// RejectUser deactivates a pending user account by setting status to inactive. Returns an error if the user is not in pending_approval state.
func (s *Service) RejectUser(ctx context.Context, userID UserID) (*User, error) {
	const op errors.Op = "domain/identity.RejectUser"

	user, err := s.GetUserByID(ctx, userID)
	if err != nil {
		return nil, errors.E(op, err)
	}

	if user.Status != UserStatusPendingApproval {
		return nil, errors.E(op, errors.Precondition, AccountPending, fmt.Sprintf("user is not in pending approval state: current status=%s", user.Status))
	}

	user.Status = UserStatusInactive
	if err := s.UpdateUser(ctx, user); err != nil {
		return nil, errors.E(op, err)
	}

	return user, nil
}

// UpdateUserRole changes a user's access level. Validates that the new role is either admin or user.
func (s *Service) UpdateUserRole(ctx context.Context, userID UserID, accessLevel AccessLevel) (*User, error) {
	const op errors.Op = "domain/identity.UpdateUserRole"

	user, err := s.GetUserByID(ctx, userID)
	if err != nil {
		return nil, errors.E(op, err)
	}

	if accessLevel != AccessLevelAdmin && accessLevel != AccessLevelUser {
		return nil, errors.E(op, errors.Invalid, "invalid access level: "+string(accessLevel))
	}

	user.AccessLevel = accessLevel
	if err := s.UpdateUser(ctx, user); err != nil {
		return nil, errors.E(op, err)
	}

	return user, nil
}

// GetUserByEmail retrieves a user by email. Returns NotFound if not found.
func (s *Service) GetUserByEmail(ctx context.Context, email string) (*User, error) {
	const op errors.Op = "domain/identity.GetUserByEmail"

	user, err := s.deps.UserStore.GetByEmail(ctx, email)
	if err != nil {
		if errors.Is(err, errors.NotExist) {
			return nil, errors.E(op, errors.NotExist, NotFound, "user not found")
		}
		return nil, errors.E(op, err)
	}
	return user, nil
}

// GetUserByUsername retrieves a user by username. Returns NotFound if not found.
func (s *Service) GetUserByUsername(ctx context.Context, username string) (*User, error) {
	const op errors.Op = "domain/identity.GetUserByUsername"

	user, err := s.deps.UserStore.GetByUsername(ctx, username)
	if err != nil {
		if errors.Is(err, errors.NotExist) {
			return nil, errors.E(op, errors.NotExist, NotFound, "user not found")
		}
		return nil, errors.E(op, err)
	}
	return user, nil
}

// GetCredentialByUserIDAndAuthType retrieves a credential by user ID and auth type.
func (s *Service) GetCredentialByUserIDAndAuthType(ctx context.Context, userID UserID, authType string) (*Credential, error) {
	const op errors.Op = "domain/identity.GetCredentialByUserIDAndAuthType"

	cred, err := s.deps.CredentialStore.GetByUserIDAndAuthType(ctx, userID, authType)
	if err != nil {
		if errors.Is(err, errors.NotExist) {
			return nil, errors.E(op, errors.NotExist, CredentialNotFound, "credential not found")
		}
		return nil, errors.E(op, err)
	}
	return cred, nil
}

// GetAuthVersion retrieves the auth_version for a user.
func (s *Service) GetAuthVersion(ctx context.Context, id UserID) (int64, error) {
	return s.deps.UserStore.GetAuthVersion(ctx, id)
}

// IncrementAuthVersion atomically increments the auth_version for a user and returns the new value.
func (s *Service) IncrementAuthVersion(ctx context.Context, id UserID) (int64, error) {
	return s.deps.UserStore.IncrementAuthVersion(ctx, id)
}

// Authenticate verifies a user's credentials and returns the user if valid.
func (s *Service) Authenticate(ctx context.Context, identifier string, rawPassword string) (*User, error) {
	const op errors.Op = "domain/identity.Authenticate"

	user, err := s.GetUserByEmail(ctx, identifier)
	if err != nil {
		if !errors.Is(err, errors.NotExist) {
			return nil, errors.E(op, err)
		}

		// Try username as fallback
		user, err = s.GetUserByUsername(ctx, identifier)
		if err != nil {
			return nil, errors.E(op, errors.Unauthenticated, InvalidCredentials, "invalid credentials")
		}
	}

	if user.Status == UserStatusPendingApproval {
		return nil, errors.E(op, errors.Permission, AccountPending, "account pending approval")
	}
	if user.Status == UserStatusSuspended {
		return nil, errors.E(op, errors.Permission, AccountSuspended, "account is suspended")
	}
	if user.Status == UserStatusInactive {
		return nil, errors.E(op, errors.Permission, AccountInactive, "account is inactive")
	}

	cred, err := s.deps.CredentialStore.GetByUserIDAndAuthType(ctx, user.ID, "password")
	if err != nil {
		return nil, errors.E(op, errors.Unauthenticated, InvalidCredentials, "invalid credentials")
	}

	if _, err := s.deps.Hasher.Verify(string(cred.SecretData), rawPassword); err != nil {
		if !errors.Is(err, password.ErrPasswordMismatch) {
			log.Error(ctx, "failed to verify password due to internal hasher error",
				log.String("user_id", string(user.ID)),
				log.Err(err),
			)
		}
		return nil, errors.E(op, errors.Unauthenticated, InvalidCredentials, "invalid credentials")
	}

	return user, nil
}

// RevokeAllSessions marks all non-revoked sessions for a user as revoked and increments auth_version.
func (s *Service) RevokeAllSessions(ctx context.Context, userID UserID) (int64, error) {
	const op errors.Op = "domain/identity.RevokeAllSessions"

	// Increment auth version to invalidate all existing tokens
	newAuthVersion, err := s.IncrementAuthVersion(ctx, userID)
	if err != nil {
		return 0, errors.E(op, err)
	}

	now := time.Now().UTC()
	if err := s.deps.SessionStore.RevokeAllForUser(ctx, userID, now); err != nil {
		return 0, errors.E(op, err)
	}

	if err := s.deps.DeviceStore.RevokeAllByUserID(ctx, userID, now); err != nil {
		log.Warn(ctx, "failed to revoke all devices on RevokeAllSessions", log.String("user_id", string(userID)), log.Err(err))
	}

	return newAuthVersion, nil
}

// CreateSession generates SessionID, TokenFamilyID, and stores the new session.
func (s *Service) CreateSession(ctx context.Context, req *CreateSessionRequest) (*Session, error) {
	const op errors.Op = "domain/identity.CreateSession"

	sessionID, err := NewSessionID()
	if err != nil {
		return nil, errors.E(op, err)
	}

	familyID, err := NewTokenFamilyID()
	if err != nil {
		return nil, errors.E(op, err)
	}

	session := &Session{
		ID:                sessionID,
		UserID:            req.UserID,
		DeviceID:          req.DeviceID,
		RefreshTokenHash:  req.RefreshTokenHash,
		TokenFamilyID:     familyID,
		ExpiresAt:         req.ExpiresAt,
		AbsoluteExpiresAt: req.AbsoluteExpiresAt,
		CreateTime:        time.Now(),
		UserAgent:         req.UserAgent,
		IPAddress:         req.IPAddress,
	}

	if err := s.deps.SessionStore.Create(ctx, session); err != nil {
		return nil, errors.E(op, err)
	}
	return session, nil
}

// RotateSession validates and rotates an existing session, returning the successor.
func (s *Service) RotateSession(ctx context.Context, req *RotateSessionRequest) (*Session, error) {
	const op errors.Op = "domain/identity.RotateSession"
	now := time.Now()

	session, err := s.deps.SessionStore.GetByRefreshTokenHash(ctx, req.RefreshTokenHash)
	if err != nil {
		if errors.Is(err, errors.NotExist) {
			return nil, errors.E(op, errors.NotExist, SessionNotFound, "session not found")
		}
		return nil, errors.E(op, err)
	}

	// 1. Detect token reuse attack: if token was already replaced, revoke the entire token family
	if session.IsReplaced() {
		_ = s.deps.SessionStore.RevokeFamily(ctx, session.TokenFamilyID, now)
		return nil, errors.E(op, errors.Conflict, SessionReused, "session reused")
	}

	// 2. Validate session state
	if session.IsRevoked() {
		return nil, errors.E(op, errors.Unauthenticated, SessionRevoked, "session revoked")
	}
	if session.IsExpired(now) {
		return nil, errors.E(op, errors.Unauthenticated, SessionExpired, "session expired")
	}

	// 3. Generate successor session ID
	successorID, err := NewSessionID()
	if err != nil {
		return nil, errors.E(op, err)
	}

	// 4. Rotate domain entity
	successor, err := session.Rotate(RotateInput{
		SuccessorID:   successorID,
		SuccessorHash: req.SuccessorHash,
		UserAgent:     req.UserAgent,
		IPAddress:     req.IPAddress,
		ExpiresAt:     req.ExpiresAt,
		Now:           now,
	})
	if err != nil {
		return nil, errors.E(op, err)
	}

	// 5. Persist: update old session and insert successor
	if err := s.deps.SessionStore.Update(ctx, session); err != nil {
		return nil, errors.E(op, err)
	}
	if err := s.deps.SessionStore.Create(ctx, successor); err != nil {
		return nil, errors.E(op, err)
	}

	return successor, nil
}

// RevokeSessionByHash revokes the token family associated with the given refresh token hash.
func (s *Service) RevokeSessionByHash(ctx context.Context, refreshTokenHash []byte) error {
	const op errors.Op = "domain/identity.RevokeSessionByHash"

	session, err := s.deps.SessionStore.GetByRefreshTokenHash(ctx, refreshTokenHash)
	if err != nil {
		if errors.Is(err, errors.NotExist) {
			return errors.E(op, errors.NotExist, SessionNotFound, "session not found")
		}
		return errors.E(op, err)
	}

	now := time.Now().UTC()
	if err := s.deps.SessionStore.RevokeFamily(ctx, session.TokenFamilyID, now); err != nil {
		return errors.E(op, err)
	}

	if session.DeviceID != nil {
		if err := s.deps.DeviceStore.RevokeDevice(ctx, *session.DeviceID, now); err != nil {
			log.Warn(ctx, "failed to revoke device on session logout", log.String("device_id", string(*session.DeviceID)), log.Err(err))
		}
	}
	return nil
}

// ListActiveSessions returns all currently active sessions for the given user.
func (s *Service) ListActiveSessions(ctx context.Context, userID UserID) ([]*Session, error) {
	const op errors.Op = "domain/identity.ListActiveSessions"

	sessions, err := s.deps.SessionStore.ListActiveSessions(ctx, userID)
	if err != nil {
		return nil, errors.E(op, err)
	}
	return sessions, nil
}

// RevokeSessionByID invalidates a specific user session by its ID.
func (s *Service) RevokeSessionByID(ctx context.Context, sessionID SessionID, userID UserID) error {
	const op errors.Op = "domain/identity.RevokeSessionByID"

	session, err := s.deps.SessionStore.GetByID(ctx, sessionID)
	if err != nil {
		if errors.Is(err, errors.NotExist) {
			return errors.E(op, errors.NotExist, SessionNotFound, "session not found")
		}
		return errors.E(op, err)
	}

	if session.UserID != userID {
		return errors.E(op, errors.Permission, "session does not belong to user")
	}

	if session.IsRevoked() {
		return nil
	}

	now := time.Now().UTC()
	session.Revoke(now)
	if err := s.deps.SessionStore.Update(ctx, session); err != nil {
		return errors.E(op, err)
	}

	if session.DeviceID != nil {
		if err := s.deps.DeviceStore.RevokeDevice(ctx, *session.DeviceID, now); err != nil {
			log.Warn(ctx, "failed to revoke device on session revoke", log.String("device_id", string(*session.DeviceID)), log.Err(err))
		}
	}
	return nil
}

// UpdateLockoutState modifies the failed login attempts and lockout timestamps for a user.
func (s *Service) UpdateLockoutState(ctx context.Context, req UpdateLockoutRequest) error {
	const op errors.Op = "domain/identity.UpdateLockoutState"

	if err := s.deps.UserStore.UpdateLockoutState(ctx, req); err != nil {
		return errors.E(op, err)
	}
	return nil
}

// UnlockUser clears the lockout state and resets failed login attempts for a user.
func (s *Service) UnlockUser(ctx context.Context, userID UserID) (*User, error) {
	const op errors.Op = "domain/identity.UnlockUser"

	user, err := s.GetUserByID(ctx, userID)
	if err != nil {
		return nil, errors.E(op, err)
	}

	if err := s.deps.UserStore.UpdateLockoutState(ctx, UpdateLockoutRequest{
		UserID:      userID,
		Attempts:    0,
		LockedUntil: nil,
	}); err != nil {
		return nil, errors.E(op, err)
	}

	user.FailedLoginAttempts = 0
	user.LockedUntil = nil

	if s.deps.SecurityEventStore != nil {
		eventID, _ := id.Generate("evt_")
		_ = s.deps.SecurityEventStore.Create(ctx, &SecurityEvent{
			ID:        eventID,
			UserID:    &user.ID,
			Email:     user.Email,
			EventType: SecurityEventAccountUnlocked,
			CreatedAt: time.Now(),
		})
	}

	return user, nil
}

// CreateSecurityEvent records a security audit log event.
func (s *Service) CreateSecurityEvent(ctx context.Context, event *SecurityEvent) error {
	const op errors.Op = "domain/identity.CreateSecurityEvent"

	if err := s.deps.SecurityEventStore.Create(ctx, event); err != nil {
		return errors.E(op, err)
	}
	return nil
}

// ListSecurityEvents queries security logs satisfying the given criteria.
func (s *Service) ListSecurityEvents(ctx context.Context, filter SecurityEventFilter) (*paging.Page[*SecurityEvent], error) {
	const op errors.Op = "domain/identity.ListSecurityEvents"

	page, err := s.deps.SecurityEventStore.List(ctx, filter)
	if err != nil {
		return nil, errors.E(op, err)
	}
	return page, nil
}

// HasActiveMFA checks if the user has any active enrolled MFA factors.
func (s *Service) HasActiveMFA(ctx context.Context, userID UserID) (bool, []*MFAFactor, error) {
	const op errors.Op = "domain/identity.HasActiveMFA"

	factors, err := s.deps.MFAStore.ListFactorsByUserID(ctx, userID)
	if err != nil {
		return false, nil, errors.E(op, err)
	}

	return len(factors) > 0, factors, nil
}

// SetupTOTP initiates enrollment of a new TOTP factor and stages it for confirmation.
func (s *Service) SetupTOTP(ctx context.Context, req SetupTOTPRequest) (*SetupTOTPResult, error) {
	const op errors.Op = "domain/identity.SetupTOTP"

	user, err := s.GetUserByID(ctx, req.UserID)
	if err != nil {
		return nil, errors.E(op, err)
	}

	secret, err := s.deps.TOTP.GenerateSecret()
	if err != nil {
		return nil, errors.E(op, err)
	}

	encryptedSecret, err := s.deps.Cipher.Encrypt(secret)
	if err != nil {
		return nil, errors.E(op, fmt.Errorf("encrypt secret: %w", err))
	}

	factorID, err := NewMFAFactorID()
	if err != nil {
		return nil, errors.E(op, err)
	}

	now := time.Now()
	factor := &MFAFactor{
		ID:        factorID,
		UserID:    req.UserID,
		Type:      MFAFactorTypeTOTP,
		Name:      req.Name,
		Config:    &TOTPConfig{EncryptedSecret: encryptedSecret},
		IsPrimary: false,
		CreatedAt: now,
		RevokedAt: &now, // Staged pending confirmation
	}

	if err := s.deps.MFAStore.CreateFactor(ctx, factor); err != nil {
		return nil, errors.E(op, err)
	}

	accountName := user.Email
	if accountName == "" {
		accountName = user.Username
	}

	return &SetupTOTPResult{
		FactorID:    factorID,
		Secret:      secret,
		AccountName: accountName,
	}, nil
}

// ConfirmTOTP verifies the first code from an authenticator app and activates the factor.
// If this is the user's first active MFA factor, it generates and returns 8 single-use backup recovery codes.
func (s *Service) ConfirmTOTP(ctx context.Context, req ConfirmTOTPRequest) ([]string, error) {
	const op errors.Op = "domain/identity.ConfirmTOTP"

	factor, err := s.deps.MFAStore.GetFactorByID(ctx, req.FactorID)
	if err != nil {
		if errors.Is(err, errors.NotExist) {
			return nil, errors.E(op, errors.NotExist, MFANotFound, "mfa factor not found")
		}
		return nil, errors.E(op, err)
	}

	if factor.UserID != req.UserID {
		return nil, errors.E(op, errors.Permission, "factor does not belong to user")
	}

	totpCfg := factor.TOTPConfig()
	if totpCfg == nil {
		return nil, errors.E(op, errors.Internal, "invalid factor config")
	}

	secret, err := s.deps.Cipher.Decrypt(totpCfg.EncryptedSecret)
	if err != nil {
		return nil, errors.E(op, errors.Internal, fmt.Errorf("decrypt secret: %w", err))
	}

	now := time.Now()
	if !s.deps.TOTP.ValidateCode(secret, req.Code, now) {
		return nil, errors.E(op, errors.Invalid, MFAInvalidCode, "invalid verification code")
	}

	// Check if user had existing active factors
	existingFactors, err := s.deps.MFAStore.ListFactorsByUserID(ctx, req.UserID)
	if err != nil {
		return nil, errors.E(op, err)
	}

	factor.RevokedAt = nil
	if len(existingFactors) == 0 {
		factor.IsPrimary = true
	}
	factor.LastUsedAt = &now

	if err := s.deps.MFAStore.UpdateFactor(ctx, factor); err != nil {
		return nil, errors.E(op, err)
	}

	// Generate backup recovery codes if not already present
	var backupCodes []string
	recovery, err := s.deps.MFAStore.GetRecovery(ctx, req.UserID)
	if err != nil || recovery == nil || len(recovery.BackupCodes) == 0 {
		plainCodes, hashedCodes, genErr := s.deps.TOTP.GenerateBackupCodes()
		if genErr != nil {
			return nil, errors.E(op, fmt.Errorf("generate backup codes: %w", genErr))
		}
		if err := s.deps.MFAStore.UpsertRecovery(ctx, &MFARecovery{
			UserID:      req.UserID,
			BackupCodes: hashedCodes,
			UpdatedAt:   now,
		}); err != nil {
			return nil, errors.E(op, fmt.Errorf("save backup codes: %w", err))
		}
		backupCodes = plainCodes
	}

	return backupCodes, nil
}

// ListMFAFactors retrieves all active factors and recovery code status for a user.
func (s *Service) ListMFAFactors(ctx context.Context, userID UserID) (*MFAFactorsSummary, error) {
	const op errors.Op = "domain/identity.ListMFAFactors"

	factors, err := s.deps.MFAStore.ListFactorsByUserID(ctx, userID)
	if err != nil {
		return nil, errors.E(op, err)
	}

	var hasBackupCodes bool
	var remainingCount int
	recovery, err := s.deps.MFAStore.GetRecovery(ctx, userID)
	if err == nil && recovery != nil {
		remainingCount = len(recovery.BackupCodes)
		hasBackupCodes = remainingCount > 0
	}

	return &MFAFactorsSummary{
		Factors:              factors,
		HasBackupCodes:       hasBackupCodes,
		RemainingBackupCodes: remainingCount,
	}, nil
}

// DeleteMFAFactor revokes an MFA factor. If it was primary, promotes another active factor.
func (s *Service) DeleteMFAFactor(ctx context.Context, req DeleteMFAFactorRequest) error {
	const op errors.Op = "domain/identity.DeleteMFAFactor"

	factor, err := s.deps.MFAStore.GetFactorByID(ctx, req.FactorID)
	if err != nil {
		if errors.Is(err, errors.NotExist) {
			return errors.E(op, errors.NotExist, MFANotFound, "mfa factor not found")
		}
		return errors.E(op, err)
	}

	if factor.UserID != req.UserID {
		return errors.E(op, errors.Permission, "factor does not belong to user")
	}

	now := time.Now()
	if err := s.deps.MFAStore.DeleteFactor(ctx, req.FactorID, now); err != nil {
		return errors.E(op, err)
	}

	if factor.IsPrimary {
		remaining, err := s.deps.MFAStore.ListFactorsByUserID(ctx, req.UserID)
		if err == nil && len(remaining) > 0 {
			_ = s.deps.MFAStore.SetPrimaryFactor(ctx, req.UserID, remaining[0].ID)
		}
	}

	return nil
}

// SetPrimaryMFAFactor updates the user's default/primary factor.
func (s *Service) SetPrimaryMFAFactor(ctx context.Context, req SetPrimaryMFAFactorRequest) error {
	const op errors.Op = "domain/identity.SetPrimaryMFAFactor"

	factor, err := s.deps.MFAStore.GetFactorByID(ctx, req.FactorID)
	if err != nil {
		if errors.Is(err, errors.NotExist) {
			return errors.E(op, errors.NotExist, MFANotFound, "mfa factor not found")
		}
		return errors.E(op, err)
	}

	if factor.UserID != req.UserID {
		return errors.E(op, errors.Permission, "factor does not belong to user")
	}
	if !factor.IsActive() {
		return errors.E(op, errors.Invalid, "cannot set inactive factor as primary")
	}

	if err := s.deps.MFAStore.SetPrimaryFactor(ctx, req.UserID, req.FactorID); err != nil {
		return errors.E(op, err)
	}

	return nil
}

// RegenerateBackupCodes regenerates a fresh set of 8 single-use recovery codes after step-up verification.
func (s *Service) RegenerateBackupCodes(ctx context.Context, req RegenerateBackupCodesRequest) ([]string, error) {
	const op errors.Op = "domain/identity.RegenerateBackupCodes"

	factors, err := s.deps.MFAStore.ListFactorsByUserID(ctx, req.UserID)
	if err != nil {
		return nil, errors.E(op, err)
	}
	if len(factors) == 0 {
		return nil, errors.E(op, errors.Precondition, "user does not have active MFA factors")
	}

	now := time.Now()
	var codeValid bool
	for _, factor := range factors {
		if factor.Type == MFAFactorTypeTOTP {
			if totpCfg := factor.TOTPConfig(); totpCfg != nil {
				if secret, err := s.deps.Cipher.Decrypt(totpCfg.EncryptedSecret); err == nil {
					if s.deps.TOTP.ValidateCode(secret, req.VerificationCode, now) {
						codeValid = true
						break
					}
				}
			}
		}
	}

	if !codeValid {
		return nil, errors.E(op, errors.Invalid, MFAInvalidCode, "invalid verification code")
	}

	plainCodes, hashedCodes, err := s.deps.TOTP.GenerateBackupCodes()
	if err != nil {
		return nil, errors.E(op, fmt.Errorf("generate backup codes: %w", err))
	}

	if err := s.deps.MFAStore.UpsertRecovery(ctx, &MFARecovery{
		UserID:      req.UserID,
		BackupCodes: hashedCodes,
		UpdatedAt:   now,
	}); err != nil {
		return nil, errors.E(op, fmt.Errorf("save backup codes: %w", err))
	}

	return plainCodes, nil
}

// VerifyMFAAssertion verifies a Step 2 second factor assertion (TOTP code or backup code).
func (s *Service) VerifyMFAAssertion(ctx context.Context, req VerifyMFAAssertionRequest) error {
	const op errors.Op = "domain/identity.VerifyMFAAssertion"

	now := time.Now()

	// Backup code assertion
	if req.FactorID == "recovery" || req.BackupCode != "" {
		if req.BackupCode == "" {
			return errors.E(op, errors.Invalid, MFAInvalidCode, "missing backup code")
		}
		recovery, err := s.deps.MFAStore.GetRecovery(ctx, req.UserID)
		if err != nil {
			if errors.Is(err, errors.NotExist) {
				return errors.E(op, errors.Invalid, MFAInvalidCode, "no backup recovery codes enrolled")
			}
			return errors.E(op, err)
		}

		remaining, valid := s.deps.TOTP.ValidateAndConsumeBackupCode(req.BackupCode, recovery.BackupCodes)
		if !valid {
			return errors.E(op, errors.Invalid, MFAInvalidCode, "invalid backup code")
		}

		if err := s.deps.MFAStore.UpsertRecovery(ctx, &MFARecovery{
			UserID:      req.UserID,
			BackupCodes: remaining,
			UpdatedAt:   now,
		}); err != nil {
			return errors.E(op, fmt.Errorf("consume backup code: %w", err))
		}

		return nil
	}

	// TOTP assertion
	if req.FactorID == "" {
		return errors.E(op, errors.Invalid, "missing factor id")
	}

	factor, err := s.deps.MFAStore.GetFactorByID(ctx, MFAFactorID(req.FactorID))
	if err != nil {
		if errors.Is(err, errors.NotExist) {
			return errors.E(op, errors.NotExist, MFANotFound, "mfa factor not found")
		}
		return errors.E(op, err)
	}

	if factor.UserID != req.UserID {
		return errors.E(op, errors.Permission, "factor does not belong to user")
	}
	if !factor.IsActive() {
		return errors.E(op, errors.Invalid, "factor is not active")
	}

	totpCfg := factor.TOTPConfig()
	if totpCfg == nil {
		return errors.E(op, errors.Internal, "invalid factor config")
	}

	secret, err := s.deps.Cipher.Decrypt(totpCfg.EncryptedSecret)
	if err != nil {
		return errors.E(op, errors.Internal, fmt.Errorf("decrypt secret: %w", err))
	}

	if !s.deps.TOTP.ValidateCode(secret, req.TOTPCode, now) {
		return errors.E(op, errors.Invalid, MFAInvalidCode, "invalid verification code")
	}

	factor.MarkUsed(now)
	_ = s.deps.MFAStore.UpdateFactor(ctx, factor)

	return nil
}

// CreateAuthChallenge generates a cryptographically secure random challenge nonce valid for 5 minutes.
func (s *Service) CreateAuthChallenge(ctx context.Context) (*Challenge, error) {
	const op errors.Op = "identity.CreateAuthChallenge"

	nonce, err := id.Generate("chg_")
	if err != nil {
		return nil, errors.E(op, err)
	}

	now := time.Now().UTC()
	challenge := &Challenge{
		Nonce:     nonce,
		CreatedAt: now,
		ExpiresAt: now.Add(5 * time.Minute),
	}

	if err := s.deps.ChallengeStore.CreateChallenge(ctx, challenge); err != nil {
		return nil, errors.E(op, err)
	}

	return challenge, nil
}

// CreateDeviceRequest encapsulates the parameters needed to enroll a new trusted hardware device.
type CreateDeviceRequest struct {
	UserID     UserID
	DeviceName string
	PublicKey  []byte
	Algorithm  string
	Challenge  string
	Signature  []byte
	TOTPCode   string
	Now        time.Time
}

// CreateDevice registers a new trusted hardware device for an authenticated user, enforcing MFA step-up if enabled.
func (s *Service) CreateDevice(ctx context.Context, req CreateDeviceRequest) (*Device, error) {
	const op errors.Op = "identity.CreateDevice"

	if req.UserID == "" {
		return nil, errors.E(op, errors.Invalid, InvalidUserID, "user id is required")
	}
	if req.DeviceName == "" {
		return nil, errors.E(op, errors.Invalid, "device name is required")
	}
	if len(req.PublicKey) == 0 {
		return nil, errors.E(op, errors.Invalid, "public key is required")
	}
	if req.Algorithm == "" {
		return nil, errors.E(op, errors.Invalid, "algorithm is required")
	}
	if req.Challenge == "" {
		return nil, errors.E(op, errors.Invalid, "challenge is required")
	}
	if len(req.Signature) == 0 {
		return nil, errors.E(op, errors.Invalid, "signature is required")
	}

	now := req.Now
	if now.IsZero() {
		now = time.Now().UTC()
	}

	// If user has active MFA factor(s), enforce step-up verification via TOTP
	if err := s.verifyStepUpTOTP(ctx, req.UserID, req.TOTPCode, now, "register device"); err != nil {
		return nil, errors.E(op, err)
	}

	// Consume challenge (enforcing replay protection and 5-min TTL)
	if err := s.deps.ChallengeStore.DeleteChallenge(ctx, req.Challenge); err != nil {
		if errors.Is(err, errors.NotExist) {
			return nil, errors.E(op, errors.Unauthenticated, DeviceInvalidChallenge, "invalid or expired challenge")
		}
		return nil, errors.E(op, err)
	}

	// Verify cryptographic signature
	if err := s.deps.DeviceVerifier.VerifyAssertion(crypto.VerifyAssertionParams{
		PublicKey: req.PublicKey,
		Algorithm: req.Algorithm,
		Challenge: req.Challenge,
		Signature: req.Signature,
	}); err != nil {
		return nil, errors.E(op, errors.Unauthenticated, DeviceInvalidSignature, fmt.Sprintf("invalid device signature: %v", err))
	}

	deviceID, err := NewDeviceID()
	if err != nil {
		return nil, errors.E(op, err)
	}

	device := &Device{
		ID:           deviceID,
		UserID:       req.UserID,
		PublicKey:    req.PublicKey,
		KeyAlgorithm: req.Algorithm,
		DeviceName:   req.DeviceName,
		CreatedAt:    now,
		ExpiresAt:    now.Add(DefaultDeviceExpiration),
	}

	if err := s.deps.DeviceStore.CreateDevice(ctx, device); err != nil {
		return nil, errors.E(op, err)
	}

	return device, nil
}

// ListDevices returns all active, registered devices for the given user.
func (s *Service) ListDevices(ctx context.Context, userID UserID) ([]*Device, error) {
	const op errors.Op = "identity.ListDevices"

	devices, err := s.deps.DeviceStore.ListDevicesByUserID(ctx, userID)
	if err != nil {
		return nil, errors.E(op, err)
	}
	return devices, nil
}

// RevokeDevice revokes a trusted device and terminates all sessions originated from it.
func (s *Service) RevokeDevice(ctx context.Context, userID UserID, deviceID DeviceID) error {
	const op errors.Op = "identity.RevokeDevice"

	device, err := s.deps.DeviceStore.GetDeviceByID(ctx, deviceID)
	if err != nil {
		return errors.E(op, errors.NotExist, DeviceNotFound, "device not found")
	}
	if device.UserID != userID {
		return errors.E(op, errors.NotExist, DeviceNotFound, "device not found")
	}
	if device.IsRevoked() {
		return nil
	}

	now := time.Now().UTC()
	if err := s.deps.DeviceStore.RevokeDevice(ctx, deviceID, now); err != nil {
		return errors.E(op, err)
	}

	// Revoke all sessions associated with this device
	if err := s.deps.SessionStore.RevokeByDeviceID(ctx, deviceID, now); err != nil {
		return errors.E(op, err)
	}

	return nil
}

// VerifyDeviceAssertionRequest encapsulates the fields for authenticating via trusted device.
type VerifyDeviceAssertionRequest struct {
	DeviceID  DeviceID
	Challenge string
	Signature []byte
	Now       time.Time
}

// VerifyDeviceAssertion validates biometric device assertion, checking revocation, 60d expiration, 30d inactivity, challenge, and signature.
func (s *Service) VerifyDeviceAssertion(ctx context.Context, req VerifyDeviceAssertionRequest) (*Device, *User, error) {
	const op errors.Op = "identity.VerifyDeviceAssertion"

	now := req.Now
	if now.IsZero() {
		now = time.Now().UTC()
	}

	device, err := s.deps.DeviceStore.GetDeviceByID(ctx, req.DeviceID)
	if err != nil {
		return nil, nil, errors.E(op, errors.Unauthenticated, DeviceNotFound, "device not found")
	}

	if device.IsRevoked() {
		return nil, nil, errors.E(op, errors.Unauthenticated, DeviceRevoked, "device has been revoked")
	}

	if device.IsExpired(now) {
		return nil, nil, errors.E(op, errors.Unauthenticated, DeviceExpired, "device registration expired (60-day limit reached)")
	}

	if device.IsInactive(now, DefaultDeviceInactivity) {
		return nil, nil, errors.E(op, errors.Unauthenticated, DeviceInactive, "device registration inactive for over 30 days")
	}

	if err := s.deps.ChallengeStore.DeleteChallenge(ctx, req.Challenge); err != nil {
		if errors.Is(err, errors.NotExist) {
			return nil, nil, errors.E(op, errors.Unauthenticated, DeviceInvalidChallenge, "invalid or expired challenge")
		}
		return nil, nil, errors.E(op, err)
	}

	if err := s.deps.DeviceVerifier.VerifyAssertion(crypto.VerifyAssertionParams{
		PublicKey: device.PublicKey,
		Algorithm: device.KeyAlgorithm,
		Challenge: req.Challenge,
		Signature: req.Signature,
	}); err != nil {
		return nil, nil, errors.E(op, errors.Unauthenticated, DeviceInvalidSignature, "invalid device signature")
	}

	user, err := s.deps.UserStore.GetByID(ctx, device.UserID)
	if err != nil {
		return nil, nil, errors.E(op, errors.Unauthenticated, InvalidCredentials, "user not found")
	}

	if err := s.deps.DeviceStore.UpdateDeviceLastUsed(ctx, device.ID, now); err != nil {
		log.Warn(ctx, "failed to update device last used timestamp", log.String("device_id", string(device.ID)), log.Err(err))
	}
	device.LastUsedAt = &now

	return device, user, nil
}

// CreatePasswordResetToken stores a password reset token record with the given tokenHash.
func (s *Service) CreatePasswordResetToken(ctx context.Context, req CreatePasswordResetTokenRequest) (*PasswordResetToken, error) {
	const op errors.Op = "domain/identity.CreatePasswordResetToken"

	targetUser, err := s.deps.UserStore.GetByID(ctx, req.TargetUserID)
	if err != nil {
		if errors.Is(err, errors.NotExist) {
			return nil, errors.E(op, errors.NotExist, NotFound, "target user not found")
		}
		return nil, errors.E(op, err)
	}
	if targetUser.Status != UserStatusActive {
		return nil, errors.E(op, errors.Precondition, "target user is not active")
	}

	if len(req.TokenHash) == 0 {
		return nil, errors.E(op, errors.Invalid, "token hash is required")
	}

	ttl := req.TTL
	if ttl <= 0 {
		ttl = DefaultResetTokenTTL
	} else if ttl > MaxResetTokenTTL {
		ttl = MaxResetTokenTTL
	}

	tokenID, err := NewResetTokenID()
	if err != nil {
		return nil, errors.E(op, err)
	}

	now := time.Now().UTC()
	record := &PasswordResetToken{
		ID:         tokenID,
		UserID:     req.TargetUserID,
		TokenHash:  req.TokenHash,
		ExpiresAt:  now.Add(ttl),
		CreatedBy:  req.AdminID,
		CreateTime: now,
	}

	if err := s.deps.PasswordResetStore.Create(ctx, record); err != nil {
		return nil, errors.E(op, err)
	}

	return record, nil
}

// ValidatePasswordResetToken verifies that a password reset token exists for the given hash, is unconsumed, and is not expired.
// Returns the associated user and token record.
func (s *Service) ValidatePasswordResetToken(ctx context.Context, req ValidatePasswordResetTokenRequest) (*User, *PasswordResetToken, error) {
	const op errors.Op = "domain/identity.ValidatePasswordResetToken"

	if len(req.TokenHash) == 0 {
		return nil, nil, errors.E(op, errors.Invalid, ResetTokenNotFound, "reset token hash is required")
	}

	record, err := s.deps.PasswordResetStore.GetByTokenHash(ctx, req.TokenHash)
	if err != nil {
		if errors.Is(err, errors.NotExist) {
			return nil, nil, errors.E(op, errors.Invalid, ResetTokenNotFound, "reset token is invalid or does not exist")
		}
		return nil, nil, errors.E(op, err)
	}

	if record.IsUsed() {
		return nil, nil, errors.E(op, errors.Precondition, ResetTokenUsed, "reset token has already been used")
	}

	if record.IsExpired(req.Now) {
		return nil, nil, errors.E(op, errors.Precondition, ResetTokenExpired, "reset token has expired")
	}

	user, err := s.deps.UserStore.GetByID(ctx, record.UserID)
	if err != nil {
		if errors.Is(err, errors.NotExist) {
			return nil, nil, errors.E(op, errors.Precondition, NotFound, "user not found")
		}
		return nil, nil, errors.E(op, err)
	}
	if user.Status != UserStatusActive {
		return nil, nil, errors.E(op, errors.Precondition, "user account is not active")
	}

	return user, record, nil
}

// CompletePasswordReset consumes a valid password reset token by hash, updates the user's password credential,
// increments auth_version to invalidate all outstanding sessions, marks the token used, and logs a security event.
func (s *Service) CompletePasswordReset(ctx context.Context, req CompletePasswordResetRequest) (*User, error) {
	const op errors.Op = "domain/identity.CompletePasswordReset"

	user, record, err := s.ValidatePasswordResetToken(ctx, ValidatePasswordResetTokenRequest{
		TokenHash: req.TokenHash,
		Now:       req.Now,
	})
	if err != nil {
		return nil, errors.E(op, err)
	}

	// 1. Update or create password credential
	cred, err := s.deps.CredentialStore.GetByUserIDAndAuthType(ctx, user.ID, "password")
	if err != nil {
		if errors.Is(err, errors.NotExist) {
			newCred := &Credential{
				UserID:     user.ID,
				AuthType:   "password",
				SecretData: req.HashedPassword,
			}
			if err := s.deps.CredentialStore.Create(ctx, newCred); err != nil {
				return nil, errors.E(op, err)
			}
		} else {
			return nil, errors.E(op, err)
		}
	} else {
		cred.SecretData = req.HashedPassword
		if err := s.deps.CredentialStore.Update(ctx, cred); err != nil {
			return nil, errors.E(op, err)
		}
	}

	// 2. Increment auth_version to revoke all active refresh tokens globally
	newAuthVersion, err := s.IncrementAuthVersion(ctx, user.ID)
	if err != nil {
		return nil, errors.E(op, err)
	}
	user.AuthVersion = newAuthVersion

	// 3. Mark reset token as used
	record.UsedAt = &req.Now
	if err := s.deps.PasswordResetStore.Update(ctx, record); err != nil {
		return nil, errors.E(op, err)
	}

	// 4. Revoke all active sessions
	if err := s.deps.SessionStore.RevokeAllForUser(ctx, user.ID, req.Now); err != nil {
		log.Warn(ctx, "failed to revoke all sessions during password reset", log.String("user_id", string(user.ID)), log.Err(err))
	}

	// 5. Audit security event
	eventID, _ := id.Generate("evt_")
	_ = s.deps.SecurityEventStore.Create(ctx, &SecurityEvent{
		ID:        eventID,
		UserID:    &user.ID,
		Email:     user.Email,
		EventType: SecurityEventPasswordReset,
		CreatedAt: req.Now,
	})

	return user, nil
}

// ChangePasswordRequest contains inputs for an authenticated password change.
type ChangePasswordRequest struct {
	UserID              UserID
	CurrentPassword     string
	NewPassword         string
	HashedNewPassword   string
	TOTPCode            string
	RevokeOtherSessions bool
	IPAddress           string
	UserAgent           string
}

// ChangePassword verifies the user's current password, verifies step-up TOTP if MFA is enabled,
// checks that new password != current password, updates the password credential,
// increments auth_version, revokes existing sessions if requested, and emits an audit event.
func (s *Service) ChangePassword(ctx context.Context, req ChangePasswordRequest) (*User, error) {
	const op errors.Op = "domain/identity.ChangePassword"

	now := time.Now().UTC()

	if req.UserID == "" {
		return nil, errors.E(op, errors.Invalid, InvalidUserID, "user id is required")
	}
	if req.CurrentPassword == "" {
		return nil, errors.E(op, errors.Invalid, "current password is required")
	}
	if req.NewPassword == "" {
		return nil, errors.E(op, errors.Invalid, "new password is required")
	}
	if req.CurrentPassword == req.NewPassword {
		return nil, errors.E(op, errors.Invalid, PasswordMatchesCurrent, "new password cannot be the same as current password")
	}
	if req.HashedNewPassword == "" {
		return nil, errors.E(op, errors.Invalid, "hashed new password is required")
	}

	user, err := s.deps.UserStore.GetByID(ctx, req.UserID)
	if err != nil {
		if errors.Is(err, errors.NotExist) {
			return nil, errors.E(op, errors.NotExist, NotFound, "user not found")
		}
		return nil, errors.E(op, err)
	}
	if user.Status != UserStatusActive {
		return nil, errors.E(op, errors.Precondition, "user is not active")
	}

	// 1. Verify current password
	cred, err := s.deps.CredentialStore.GetByUserIDAndAuthType(ctx, user.ID, "password")
	if err != nil {
		return nil, errors.E(op, errors.Unauthenticated, InvalidCredentials, "invalid credentials")
	}
	if _, err := s.deps.Hasher.Verify(string(cred.SecretData), req.CurrentPassword); err != nil {
		return nil, errors.E(op, errors.Unauthenticated, InvalidCredentials, "current password is incorrect")
	}

	// 2. Step-up MFA verification if user has active TOTP factors
	if err := s.verifyStepUpTOTP(ctx, user.ID, req.TOTPCode, now, "change password"); err != nil {
		return nil, errors.E(op, err)
	}

	// 3. Update password credential
	cred.SecretData = req.HashedNewPassword
	if err := s.deps.CredentialStore.Update(ctx, cred); err != nil {
		return nil, errors.E(op, err)
	}

	// 4. Increment auth_version to invalidate all existing tokens globally
	newAuthVersion, err := s.IncrementAuthVersion(ctx, user.ID)
	if err != nil {
		return nil, errors.E(op, err)
	}
	user.AuthVersion = newAuthVersion

	// 5. Revoke existing sessions if requested
	if req.RevokeOtherSessions && s.deps.SessionStore != nil {
		if err := s.deps.SessionStore.RevokeAllForUser(ctx, user.ID, now); err != nil {
			log.Warn(ctx, "failed to revoke all sessions during password change",
				log.String("user_id", string(user.ID)),
				log.Err(err),
			)
		}
	}

	// 6. Record audit security event
	if s.deps.SecurityEventStore != nil {
		eventID, _ := id.Generate("evt_")
		_ = s.deps.SecurityEventStore.Create(ctx, &SecurityEvent{
			ID:        eventID,
			UserID:    &user.ID,
			Email:     user.Email,
			EventType: SecurityEventPasswordChange,
			IPAddress: req.IPAddress,
			UserAgent: req.UserAgent,
			CreatedAt: now,
		})
	}

	return user, nil
}

// verifyStepUpTOTP validates a TOTP code if the user has at least one active TOTP MFA factor.
func (s *Service) verifyStepUpTOTP(ctx context.Context, userID UserID, totpCode string, now time.Time, actionDescription string) error {
	factors, err := s.deps.MFAStore.ListFactorsByUserID(ctx, userID)
	if err != nil {
		return err
	}
	var hasActiveTOTP bool
	for _, f := range factors {
		if !f.IsRevoked() && f.Type == MFAFactorTypeTOTP {
			hasActiveTOTP = true
			break
		}
	}
	if !hasActiveTOTP {
		return nil
	}
	if totpCode == "" {
		return errors.E(errors.Permission, MFARequired, fmt.Sprintf("mfa verification required to %s", actionDescription))
	}

	var totpVerified bool
	for _, f := range factors {
		if f.IsRevoked() || f.Type != MFAFactorTypeTOTP {
			continue
		}
		totpCfg := f.TOTPConfig()
		if totpCfg == nil {
			continue
		}
		secret, err := s.deps.Cipher.Decrypt(totpCfg.EncryptedSecret)
		if err != nil {
			continue
		}
		if s.deps.TOTP.ValidateCode(secret, totpCode, now) {
			totpVerified = true
			break
		}
	}
	if !totpVerified {
		return errors.E(errors.Permission, MFAInvalidCode, "invalid totp code")
	}
	return nil
}

// UpdateProfileParams contains parameters for modifying a user profile.
type UpdateProfileParams struct {
	UserID    UserID
	Name      *string
	AvatarURL *string
}

// UpdateProfile updates the display name and avatar URL of a user.
func (s *Service) UpdateProfile(ctx context.Context, params UpdateProfileParams) (*User, error) {
	const op errors.Op = "domain/identity.UpdateProfile"

	if !params.UserID.IsValid() {
		return nil, errors.E(op, errors.Invalid, InvalidUserID, "invalid user id")
	}

	user, err := s.GetUserByID(ctx, params.UserID)
	if err != nil {
		return nil, errors.E(op, err)
	}

	if user.Status != UserStatusActive {
		return nil, errors.E(op, errors.Precondition, "user is not active")
	}

	changed := false
	if params.Name != nil && *params.Name != user.Name {
		user.Name = *params.Name
		changed = true
	}
	if params.AvatarURL != nil && *params.AvatarURL != user.AvatarURL {
		user.AvatarURL = *params.AvatarURL
		changed = true
	}

	if changed {
		if err := s.UpdateUser(ctx, user); err != nil {
			return nil, errors.E(op, err)
		}
	}

	return user, nil
}

// ChangeEmailParams contains parameters for updating a user's primary email.
type ChangeEmailParams struct {
	UserID          UserID
	NewEmail        string
	CurrentPassword string
	TOTPCode        string
	IPAddress       string
	UserAgent       string
}

// ChangeEmail updates a user's primary email after re-authenticating with current password and step-up MFA.
func (s *Service) ChangeEmail(ctx context.Context, params ChangeEmailParams) (*User, error) {
	const op errors.Op = "domain/identity.ChangeEmail"
	now := time.Now().UTC()

	if !params.UserID.IsValid() {
		return nil, errors.E(op, errors.Invalid, InvalidUserID, "invalid user id")
	}
	if params.NewEmail == "" {
		return nil, errors.E(op, errors.Invalid, "new email is required")
	}
	if params.CurrentPassword == "" {
		return nil, errors.E(op, errors.Invalid, "current password is required")
	}

	user, err := s.GetUserByID(ctx, params.UserID)
	if err != nil {
		return nil, errors.E(op, err)
	}
	if user.Status != UserStatusActive {
		return nil, errors.E(op, errors.Precondition, "user is not active")
	}

	if strings.EqualFold(user.Email, params.NewEmail) {
		return user, nil
	}

	// Check if new email is already taken
	existingUser, err := s.deps.UserStore.GetByEmail(ctx, params.NewEmail)
	if err == nil && existingUser != nil && existingUser.ID != user.ID {
		return nil, errors.E(op, errors.Conflict, EmailExists, "email address is already in use")
	} else if err != nil && !errors.Is(err, errors.NotExist) {
		return nil, errors.E(op, err)
	}

	// 1. Verify current password
	cred, err := s.deps.CredentialStore.GetByUserIDAndAuthType(ctx, user.ID, "password")
	if err != nil {
		return nil, errors.E(op, errors.Unauthenticated, InvalidCredentials, "invalid credentials")
	}
	if _, err := s.deps.Hasher.Verify(string(cred.SecretData), params.CurrentPassword); err != nil {
		return nil, errors.E(op, errors.Unauthenticated, InvalidCredentials, "current password is incorrect")
	}

	// 2. Step-up MFA verification
	if err := s.verifyStepUpTOTP(ctx, user.ID, params.TOTPCode, now, "change email"); err != nil {
		return nil, errors.E(op, err)
	}

	// 3. Update user email
	user.Email = params.NewEmail
	if err := s.UpdateUser(ctx, user); err != nil {
		return nil, errors.E(op, err)
	}

	// 4. Record audit security event
	if s.deps.SecurityEventStore != nil {
		eventID, _ := id.Generate("evt_")
		_ = s.deps.SecurityEventStore.Create(ctx, &SecurityEvent{
			ID:        eventID,
			UserID:    &user.ID,
			Email:     user.Email,
			EventType: SecurityEventEmailChange,
			IPAddress: params.IPAddress,
			UserAgent: params.UserAgent,
			CreatedAt: now,
		})
	}

	return user, nil
}

// DeleteAccountParams contains parameters for deactivating and anonymizing an account.
type DeleteAccountParams struct {
	UserID          UserID
	CurrentPassword string
	TOTPCode        string
	IPAddress       string
	UserAgent       string
}

// DeleteAccount permanently revokes credentials, sessions, MFA factors, and anonymizes user profile identifiers.
func (s *Service) DeleteAccount(ctx context.Context, params DeleteAccountParams) error {
	const op errors.Op = "domain/identity.DeleteAccount"
	now := time.Now().UTC()

	if !params.UserID.IsValid() {
		return errors.E(op, errors.Invalid, InvalidUserID, "invalid user id")
	}
	if params.CurrentPassword == "" {
		return errors.E(op, errors.Invalid, "current password is required")
	}

	user, err := s.GetUserByID(ctx, params.UserID)
	if err != nil {
		return errors.E(op, err)
	}
	if user.Status != UserStatusActive {
		return errors.E(op, errors.Precondition, "user is not active")
	}

	// 1. Verify current password
	cred, err := s.deps.CredentialStore.GetByUserIDAndAuthType(ctx, user.ID, "password")
	if err != nil {
		return errors.E(op, errors.Unauthenticated, InvalidCredentials, "invalid credentials")
	}
	if _, err := s.deps.Hasher.Verify(string(cred.SecretData), params.CurrentPassword); err != nil {
		return errors.E(op, errors.Unauthenticated, InvalidCredentials, "current password is incorrect")
	}

	// 2. Step-up MFA verification
	if err := s.verifyStepUpTOTP(ctx, user.ID, params.TOTPCode, now, "delete account"); err != nil {
		return errors.E(op, err)
	}

	// 3. Delete credentials
	if err := s.deps.CredentialStore.Delete(ctx, user.ID, "password"); err != nil {
		log.Warn(ctx, "failed to delete credential during account deletion",
			log.String("user_id", string(user.ID)),
			log.Err(err),
		)
	}

	// 4. Revoke all active sessions
	if s.deps.SessionStore != nil {
		if err := s.deps.SessionStore.RevokeAllForUser(ctx, user.ID, now); err != nil {
			log.Warn(ctx, "failed to revoke all sessions during account deletion",
				log.String("user_id", string(user.ID)),
				log.Err(err),
			)
		}
	}

	// 5. Revoke all trusted devices
	if s.deps.DeviceStore != nil {
		if err := s.deps.DeviceStore.RevokeAllByUserID(ctx, user.ID, now); err != nil {
			log.Warn(ctx, "failed to revoke all devices during account deletion",
				log.String("user_id", string(user.ID)),
				log.Err(err),
			)
		}
	}

	// 6. Delete all MFA factors
	factors, err := s.deps.MFAStore.ListFactorsByUserID(ctx, user.ID)
	if err == nil {
		for _, f := range factors {
			_ = s.deps.MFAStore.DeleteFactor(ctx, f.ID, now)
		}
	}

	// 7. Increment auth_version to invalidate tokens
	newAuthVersion, err := s.IncrementAuthVersion(ctx, user.ID)
	if err == nil {
		user.AuthVersion = newAuthVersion
	}

	// 8. Record audit event
	if s.deps.SecurityEventStore != nil {
		eventID, _ := id.Generate("evt_")
		_ = s.deps.SecurityEventStore.Create(ctx, &SecurityEvent{
			ID:        eventID,
			UserID:    &user.ID,
			Email:     user.Email,
			EventType: SecurityEventAccountDelete,
			IPAddress: params.IPAddress,
			UserAgent: params.UserAgent,
			CreatedAt: now,
		})
	}

	// 9. Anonymize user record
	user.Name = "Deleted User"
	user.Email = fmt.Sprintf("deleted_%s@deleted.saturn.local", user.ID)
	user.Username = fmt.Sprintf("deleted_%s", user.ID)
	user.AvatarURL = ""
	user.Status = UserStatusInactive

	if err := s.UpdateUser(ctx, user); err != nil {
		return errors.E(op, err)
	}

	return nil
}
