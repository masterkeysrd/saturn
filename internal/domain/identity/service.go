package identity

import (
	"context"
	"errors"
	"fmt"
	"time"
)

var (
	ErrUserNotFound     = errors.New("user not found")
	ErrUserExists       = errors.New("user already exists")
	ErrCredentialExists = errors.New("credential already exists")
)

// UserStoreProvider provides access to the UserStore.
type UserStoreProvider interface {
	Create(ctx context.Context, user *User) error
	GetByID(ctx context.Context, id UserID) (*User, error)
	GetByEmail(ctx context.Context, email string) (*User, error)
	GetByUsername(ctx context.Context, username string) (*User, error)
	Update(ctx context.Context, user *User) error
	Delete(ctx context.Context, id UserID) error
	GetUsers(ctx context.Context, filter *ListUsersFilter) ([]*User, string, error)
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
	Verify(encodedHash, raw string) (bool, error)
}

// Service handles identity business logic.
type Service struct {
	deps Dependencies
}

// NewService creates a new Service.
func NewService(deps Dependencies) *Service {
	return &Service{deps: deps}
}

// CreateUser creates a new user. Returns ErrUserExists if a user with the same email or username already exists.
func (s *Service) CreateUser(ctx context.Context, user *User) error {
	if user.Status == "" {
		user.Status = UserStatusActive
	}

	existing, err := s.deps.UserStore.GetByEmail(ctx, user.Email)
	if err == nil && existing.ID != "" {
		return ErrUserExists
	}

	existing, err = s.deps.UserStore.GetByUsername(ctx, user.Username)
	if err == nil && existing.ID != "" {
		return ErrUserExists
	}

	return s.deps.UserStore.Create(ctx, user)
}

// CreateCredential creates a credential. Returns ErrCredentialExists if the user/authType combo already exists.
func (s *Service) CreateCredential(ctx context.Context, credential *Credential) error {
	existing, err := s.deps.CredentialStore.GetByUserIDAndAuthType(ctx, credential.UserID, credential.AuthType)
	if err == nil && existing != nil {
		return ErrCredentialExists
	}

	return s.deps.CredentialStore.Create(ctx, credential)
}

// UpdateCredential replaces the secret_data for an existing credential.
func (s *Service) UpdateCredential(ctx context.Context, credential *Credential) error {
	return s.deps.CredentialStore.Update(ctx, credential)
}

// GetUserByID retrieves a user by their ID. Returns ErrUserNotFound if not found.
func (s *Service) GetUserByID(ctx context.Context, id UserID) (*User, error) {
	user, err := s.deps.UserStore.GetByID(ctx, id)
	if err != nil {
		return nil, ErrUserNotFound
	}
	return user, nil
}

// UpdateUser updates an existing user with optimistic locking. Returns ErrUserNotFound if the version doesn't match.
func (s *Service) UpdateUser(ctx context.Context, user *User) error {
	return s.deps.UserStore.Update(ctx, user)
}

// ListUsersFilter encapsulates filtering and pagination parameters for listing users.
type ListUsersFilter struct {
	PageSize      int32
	NextPageToken string
	StatusFilter  UserStatus
	SearchQuery   string
}

// ListUsers returns users with optional filtering by status and search query, using a filter struct for clarity.
func (s *Service) ListUsers(ctx context.Context, filter *ListUsersFilter) ([]*User, string, error) {
	if filter.PageSize <= 0 || filter.PageSize > 100 {
		filter.PageSize = 20
	}

	users, nextToken, err := s.deps.UserStore.GetUsers(ctx, filter)
	if err != nil {
		return nil, "", err
	}

	return users, nextToken, nil
}

// ApproveUser activates a pending user account. Returns an error if the user is not in pending_approval state.
func (s *Service) ApproveUser(ctx context.Context, userID UserID) (*User, error) {
	user, err := s.GetUserByID(ctx, userID)
	if err != nil {
		return nil, err
	}

	if user.Status != UserStatusPendingApproval {
		return nil, fmt.Errorf("user is not in pending approval state: current status=%s", user.Status)
	}

	user.Status = UserStatusActive
	if err := s.UpdateUser(ctx, user); err != nil {
		return nil, fmt.Errorf("update user: %w", err)
	}

	return user, nil
}

// RejectUser deactivates a pending user account by setting status to inactive. Returns an error if the user is not in pending_approval state.
func (s *Service) RejectUser(ctx context.Context, userID UserID) (*User, error) {
	user, err := s.GetUserByID(ctx, userID)
	if err != nil {
		return nil, err
	}

	if user.Status != UserStatusPendingApproval {
		return nil, fmt.Errorf("user is not in pending approval state: current status=%s", user.Status)
	}

	user.Status = UserStatusInactive
	if err := s.UpdateUser(ctx, user); err != nil {
		return nil, fmt.Errorf("update user: %w", err)
	}

	return user, nil
}

// UpdateUserRole changes a user's access level. Validates that the new role is either admin or user.
func (s *Service) UpdateUserRole(ctx context.Context, userID UserID, accessLevel AccessLevel) (*User, error) {
	user, err := s.GetUserByID(ctx, userID)
	if err != nil {
		return nil, err
	}

	if accessLevel != AccessLevelAdmin && accessLevel != AccessLevelUser {
		return nil, fmt.Errorf("invalid access level: %s", accessLevel)
	}

	user.AccessLevel = accessLevel
	if err := s.UpdateUser(ctx, user); err != nil {
		return nil, fmt.Errorf("update user: %w", err)
	}

	return user, nil
}

// GetUserByEmail retrieves a user by email. Returns ErrUserNotFound if not found.
func (s *Service) GetUserByEmail(ctx context.Context, email string) (*User, error) {
	user, err := s.deps.UserStore.GetByEmail(ctx, email)
	if err != nil {
		return nil, ErrUserNotFound
	}
	return user, nil
}

// GetUserByUsername retrieves a user by username. Returns ErrUserNotFound if not found.
func (s *Service) GetUserByUsername(ctx context.Context, username string) (*User, error) {
	user, err := s.deps.UserStore.GetByUsername(ctx, username)
	if err != nil {
		return nil, ErrUserNotFound
	}
	return user, nil
}

// GetCredentialByUserIDAndAuthType retrieves a credential by user ID and auth type.
func (s *Service) GetCredentialByUserIDAndAuthType(ctx context.Context, userID UserID, authType string) (*Credential, error) {
	cred, err := s.deps.CredentialStore.GetByUserIDAndAuthType(ctx, userID, authType)
	if err != nil {
		return nil, ErrUserNotFound
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

// ErrAccountPendingApproval is returned when a user tries to authenticate but their account is pending approval.
var ErrAccountPendingApproval = errors.New("account pending approval")

// Authenticate verifies a user's credentials and returns the user if valid.
func (s *Service) Authenticate(ctx context.Context, identifier string, password string) (*User, error) {
	user, err := s.GetUserByEmail(ctx, identifier)
	if err != nil {
		// Try username as fallback
		user, err = s.GetUserByUsername(ctx, identifier)
		if err != nil {
			return nil, errors.New("invalid credentials")
		}
	}

	if user.Status == UserStatusPendingApproval {
		return nil, ErrAccountPendingApproval
	}

	cred, err := s.deps.CredentialStore.GetByUserIDAndAuthType(ctx, user.ID, "password")
	if err != nil {
		return nil, errors.New("invalid credentials")
	}

	_, err = s.deps.Hasher.Verify(string(cred.SecretData), password)
	if err != nil {
		return nil, errors.New("invalid credentials")
	}

	return user, nil
}

// RevokeAllSessions marks all non-revoked sessions for a user as revoked and increments auth_version.
func (s *Service) RevokeAllSessions(ctx context.Context, userID UserID) (int64, error) {
	// Increment auth version to invalidate all existing tokens
	newAuthVersion, err := s.IncrementAuthVersion(ctx, userID)
	if err != nil {
		return 0, fmt.Errorf("increment auth version: %w", err)
	}

	if err := s.deps.SessionStore.RevokeAllForUser(ctx, userID, time.Now()); err != nil {
		return 0, fmt.Errorf("revoke all sessions for user: %w", err)
	}

	return newAuthVersion, nil
}

// CreateSession generates SessionID, TokenFamilyID, and stores the new session.
func (s *Service) CreateSession(ctx context.Context, req *CreateSessionRequest) (*Session, error) {
	sessionID, err := NewSessionID()
	if err != nil {
		return nil, fmt.Errorf("create session id: %w", err)
	}

	familyID, err := NewTokenFamilyID()
	if err != nil {
		return nil, fmt.Errorf("create token family id: %w", err)
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
		return nil, err
	}
	return session, nil
}

// RotateSession generates a successor Session ID and rotates the session.
func (s *Service) RotateSession(ctx context.Context, req *RotateSessionRequest) (*Session, error) {
	successorID, err := NewSessionID()
	if err != nil {
		return nil, fmt.Errorf("create successor session id: %w", err)
	}

	successor := &Session{
		ID:               successorID,
		RefreshTokenHash: req.SuccessorHash,
		ExpiresAt:        req.ExpiresAt,
		CreateTime:       time.Now(),
		UserAgent:        req.UserAgent,
		IPAddress:        req.IPAddress,
	}

	return s.deps.SessionStore.Rotate(ctx, req.RefreshTokenHash, time.Now(), successor)
}

// RevokeSessionByHash delegates to the session store's RevokeByHash method.
func (s *Service) RevokeSessionByHash(ctx context.Context, refreshTokenHash []byte) error {
	return s.deps.SessionStore.RevokeByHash(ctx, refreshTokenHash, time.Now())
}

// GetActiveSessions returns all currently active sessions for the given user.
func (s *Service) GetActiveSessions(ctx context.Context, userID UserID) ([]*Session, error) {
	return s.deps.SessionStore.GetActiveSessions(ctx, userID)
}

// RevokeSessionByID invalidates a specific user session by its ID.
func (s *Service) RevokeSessionByID(ctx context.Context, sessionID SessionID, userID UserID) error {
	return s.deps.SessionStore.RevokeByID(ctx, sessionID, userID, time.Now())
}

// UpdateLockoutState modifies the failed login attempts and lockout timestamps for a user.
func (s *Service) UpdateLockoutState(ctx context.Context, req UpdateLockoutRequest) error {
	return s.deps.UserStore.UpdateLockoutState(ctx, req)
}

// CreateSecurityEvent records a security audit log event.
func (s *Service) CreateSecurityEvent(ctx context.Context, event *SecurityEvent) error {
	return s.deps.SecurityEventStore.Create(ctx, event)
}

// ListSecurityEvents queries security logs satisfying the given criteria.
func (s *Service) ListSecurityEvents(ctx context.Context, filter SecurityEventFilter) ([]*SecurityEvent, string, error) {
	return s.deps.SecurityEventStore.List(ctx, filter)
}
