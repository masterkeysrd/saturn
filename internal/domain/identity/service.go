package identity

import (
	"context"
	"errors"
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
}

// CredentialStoreProvider provides access to the CredentialStore.
type CredentialStoreProvider interface {
	Create(ctx context.Context, credential *Credential) error
	GetByUserID(ctx context.Context, userID UserID) ([]*Credential, error)
	GetByUserIDAndAuthType(ctx context.Context, userID UserID, authType string) (*Credential, error)
	Delete(ctx context.Context, userID UserID, authType string) error
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
