package identity

import (
	"context"
	"errors"
	"fmt"
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
}

// CredentialStoreProvider provides access to the CredentialStore.
type CredentialStoreProvider interface {
	Create(ctx context.Context, credential *Credential) error
	GetByUserID(ctx context.Context, userID UserID) ([]*Credential, error)
	GetByUserIDAndAuthType(ctx context.Context, userID UserID, authType string) (*Credential, error)
	Delete(ctx context.Context, userID UserID, authType string) error
	Update(ctx context.Context, credential *Credential) error
}

// Dependencies holds all storage interfaces required by the Service.
type Dependencies struct {
	UserStore       UserStoreProvider
	CredentialStore CredentialStoreProvider
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
