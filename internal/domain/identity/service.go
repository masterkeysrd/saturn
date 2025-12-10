package identity

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	"github.com/masterkeysrd/saturn/internal/pkg/deps"
)

// Service provides identity management functionalities.
type Service struct {
	userStore       UserStore
	sessionStore    SessionStore
	passwordHasher  PasswordHasher
	tokenHasher     TokenHasher
	secretGenerator SecretGenerator
}

type ServiceParams struct {
	deps.In

	UserStore       UserStore
	SessionStore    SessionStore
	TokenHasher     TokenHasher
	PasswordHasher  PasswordHasher
	SecretGenerator SecretGenerator
}

func NewService(params ServiceParams) *Service {
	return &Service{
		userStore:       params.UserStore,
		sessionStore:    params.SessionStore,
		passwordHasher:  params.PasswordHasher,
		tokenHasher:     params.TokenHasher,
		secretGenerator: params.SecretGenerator,
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

func (s *Service) LoginUser(ctx context.Context, in *LoginUserInput) (*User, *Session, string, error) {
	// Validate early before querying the database
	if err := in.Validate(); err != nil {
		return nil, nil, "", fmt.Errorf("invalid login input: %w", err)
	}

	user, err := s.userStore.GetBy(ctx, ByUsernameOrEmail(in.UsernameOrEmail))
	if err != nil {
		return nil, nil, "", fmt.Errorf("failed to get user: %w", err)
	}
	if user == nil {
		return nil, nil, "", fmt.Errorf("invalid username/email or password")
	}

	if !user.VerifyPassword(in.Password, s.passwordHasher) {
		return nil, nil, "", errors.New("invalid username/email or password")
	}

	if user.Status != UserStatusActive {
		return nil, nil, "", fmt.Errorf("user account is not active")
	}

	ttl := DefaultSessionTTL
	if in.RememberMe {
		ttl = ExtendedSessionTTL
	}

	session := &Session{
		UserID:    user.ID,
		UserAgent: in.UserAgent,
		ClientIP:  in.ClientIP,
		ExpiresAt: time.Now().UTC().Add(ttl),
	}

	if err := session.Initialize(); err != nil {
		return nil, nil, "", fmt.Errorf("failed to initialize session: %w", err)
	}

	token, err := session.GenerateToken(s.tokenHasher, s.secretGenerator)
	if err != nil {
		return nil, nil, "", fmt.Errorf("failed to generate session token: %w", err)
	}

	session.Sanitize()
	if err := session.Validate(); err != nil {
		return nil, nil, "", fmt.Errorf("invalid session data: %w", err)
	}

	if err := s.sessionStore.Store(ctx, session); err != nil {
		return nil, nil, "", fmt.Errorf("failed to store session: %w", err)
	}

	return user, session, token, nil
}

func (s *Service) RefreshSession(ctx context.Context, in *RefreshSessionInput) (*User, *Session, string, error) {
	if err := in.Validate(); err != nil {
		return nil, nil, "", fmt.Errorf("invalid session verification input: %w", err)
	}

	session, err := s.sessionStore.Get(ctx, in.SessionID)
	if err != nil {
		return nil, nil, "", fmt.Errorf("failed to get session: %w", err)
	}

	// Verify token correctness
	if !session.VerifyToken(in.Token, s.tokenHasher) {
		_ = s.sessionStore.Delete(ctx, session.ID)
		return nil, nil, "", fmt.Errorf("invalid session token")
	}

	if session.IsExpired() {
		_ = s.sessionStore.Delete(ctx, session.ID)
		return nil, nil, "", fmt.Errorf("invalid or expired session")
	}

	user, err := s.userStore.Get(ctx, session.UserID)
	if err != nil {
		return nil, nil, "", fmt.Errorf("failed to get user: %w", err)
	}

	if user == nil {
		return nil, nil, "", fmt.Errorf("user not found for session")
	}

	if user.Status != UserStatusActive {
		return nil, nil, "", fmt.Errorf("user account is not active")
	}

	// Rotate session token
	newToken, err := session.GenerateToken(s.tokenHasher, s.secretGenerator)
	if err != nil {
		return nil, nil, "", fmt.Errorf("failed to generate new session token: %w", err)
	}

	session.Sanitize()
	if err := session.Validate(); err != nil {
		return nil, nil, "", fmt.Errorf("invalid session data: %w", err)
	}

	if err := s.sessionStore.Store(ctx, session); err != nil {
		return nil, nil, "", fmt.Errorf("failed to update session: %w", err)
	}

	return user, session, newToken, nil
}

func (s *Service) RevokeSession(ctx context.Context, sessionID SessionID) error {
	return s.sessionStore.Delete(ctx, sessionID)
}

func (s *Service) RevokeUserSessions(ctx context.Context, userID UserID) error {
	return s.sessionStore.DeleteBy(ctx, ByUserID(userID))
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
