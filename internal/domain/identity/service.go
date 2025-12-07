package identity

import (
	"context"
	"fmt"

	"github.com/masterkeysrd/saturn/internal/pkg/deps"
)

// Service provides identity management functionalities.
type Service struct {
	userStore      UserStore
	passwordHasher PasswordHasher
}

type IdentityServiceParams struct {
	deps.In

	UserStore      UserStore
	PasswordHasher PasswordHasher
}

func NewService(params IdentityServiceParams) *Service {
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
	}

	if err := user.Initialize(); err != nil {
		return nil, fmt.Errorf("failed to initialize user: %w", err)
	}

	user.Sanitize()
	if err := user.SetPassword(in.Password, s.passwordHasher); err != nil {
		return nil, fmt.Errorf("failed to set user password: %w", err)
	}

	if err := user.Validate(); err != nil {
		return nil, fmt.Errorf("invalid user data: %w", err)
	}

	exists, err := s.userStore.ExistsBy(ctx, ByUsername(user.Username))
	if err != nil {
		return nil, fmt.Errorf("failed to check existing username: %w", err)
	}
	if exists {
		return nil, fmt.Errorf("username %q is already taken", user.Username)
	}

	exists, err = s.userStore.ExistsBy(ctx, ByEmail(user.Email))
	if err != nil {
		return nil, fmt.Errorf("failed to check existing email: %w", err)
	}

	if exists {
		return nil, fmt.Errorf("email %q is already registered", user.Email)
	}

	if err := s.userStore.Store(ctx, user); err != nil {
		return nil, fmt.Errorf("failed to store user: %w", err)
	}

	return user, nil
}
