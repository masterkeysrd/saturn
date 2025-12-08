package identity

import (
	"context"
	"fmt"

	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	"github.com/masterkeysrd/saturn/internal/pkg/deps"
)

// Service provides identity management functionalities.
type Service struct {
	userStore      UserStore
	passwordHasher PasswordHasher
}

type ServiceParams struct {
	deps.In

	UserStore      UserStore
	PasswordHasher PasswordHasher
}

func NewService(params ServiceParams) *Service {
	return &Service{
		userStore:      params.UserStore,
		passwordHasher: params.PasswordHasher,
	}
}

// CreateUser creates a new user in the system.
func (s *Service) CreateUser(ctx context.Context, in *CreateUserInput) (*User, error) {
	user := &User{
		Username: in.Username,
		Email:    in.Email,
		Role:     auth.RoleUser,
	}

	if err := s.createUser(ctx, user, in.Password); err != nil {
		return nil, err
	}

	return user, nil
}

func (s *Service) CreateAdminUser(ctx context.Context, in *CreateUserInput) (*User, error) {
	user := &User{
		Username: in.Username,
		Email:    in.Email,
		Role:     auth.RoleAdmin,
	}

	if err := s.createUser(ctx, user, in.Password); err != nil {
		return nil, err
	}

	return user, nil
}

func (s *Service) createUser(ctx context.Context, user *User, password string) error {
	if err := user.Initialize(); err != nil {
		return fmt.Errorf("failed to initialize user: %w", err)
	}

	user.Sanitize()
	if err := user.SetPassword(password, s.passwordHasher); err != nil {
		return fmt.Errorf("failed to set user password: %w", err)
	}

	if err := user.Validate(); err != nil {
		return fmt.Errorf("invalid user data: %w", err)
	}

	exists, err := s.userStore.ExistsBy(ctx, ByUsername(user.Username))
	if err != nil {
		return fmt.Errorf("failed to check existing username: %w", err)
	}
	if exists {
		return fmt.Errorf("username %q is already taken", user.Username)
	}

	exists, err = s.userStore.ExistsBy(ctx, ByEmail(user.Email))
	if err != nil {
		return fmt.Errorf("failed to check existing email: %w", err)
	}

	if exists {
		return fmt.Errorf("email %q is already registered", user.Email)
	}

	if err := s.userStore.Store(ctx, user); err != nil {
		return fmt.Errorf("failed to store user: %w", err)
	}

	return nil
}
