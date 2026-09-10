package identity

import (
	"context"
	"fmt"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/log"
	"github.com/masterkeysrd/saturn/internal/platform/paging"
	"github.com/masterkeysrd/saturn/internal/platform/password"
)

// UserStoreProvider provides access to the UserStore.
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
type CredentialStoreProvider interface {
	Create(ctx context.Context, credential *Credential) error
	GetByUserID(ctx context.Context, userID UserID) ([]*Credential, error)
	GetByUserIDAndAuthType(ctx context.Context, userID UserID, authType string) (*Credential, error)
	Delete(ctx context.Context, userID UserID, authType string) error
	Update(ctx context.Context, credential *Credential) error
}

// Dependencies holds all storage and hashing interfaces required by the Service.
type Dependencies struct {
	UserStore          UserStoreProvider
	CredentialStore    CredentialStoreProvider
	SessionStore       SessionStoreProvider
	SecurityEventStore SecurityEventStore
	Hasher             Hasher
}

// Hasher is the password hashing interface used for authentication.
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

	if err := s.deps.SessionStore.RevokeAllForUser(ctx, userID, time.Now()); err != nil {
		return 0, errors.E(op, err)
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

	if err := s.deps.SessionStore.RevokeFamily(ctx, session.TokenFamilyID, time.Now()); err != nil {
		return errors.E(op, err)
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

	session.Revoke(time.Now())
	if err := s.deps.SessionStore.Update(ctx, session); err != nil {
		return errors.E(op, err)
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
