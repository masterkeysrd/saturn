package identity

import (
	"context"
	"fmt"
	"time"

	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	"github.com/masterkeysrd/saturn/internal/pkg/deps"
)

// Service provides identity management functionalities.
type Service struct {
	userStore       UserStore
	sessionStore    SessionStore
	bindingStore    BindingStore
	passwordHasher  PasswordHasher
	tokenHasher     TokenHasher
	secretGenerator SecretGenerator
}

type ServiceParams struct {
	deps.In

	UserStore       UserStore
	SessionStore    SessionStore
	BindingStore    BindingStore
	TokenHasher     TokenHasher
	PasswordHasher  PasswordHasher
	SecretGenerator SecretGenerator
}

func NewService(params ServiceParams) *Service {
	return &Service{
		userStore:       params.UserStore,
		sessionStore:    params.SessionStore,
		bindingStore:    params.BindingStore,
		passwordHasher:  params.PasswordHasher,
		tokenHasher:     params.TokenHasher,
		secretGenerator: params.SecretGenerator,
	}
}

// CreateUser creates a new user in the system.
func (s *Service) CreateUser(ctx context.Context, in *UserProfile) (*User, error) {
	user, err := s.createUser(ctx, in, false)
	if err != nil {
		return nil, err
	}
	return user, nil
}

func (s *Service) CreateAdminUser(ctx context.Context, in *UserProfile) (*User, error) {
	user, err := s.createUser(ctx, in, true)
	if err != nil {
		return nil, err
	}
	return user, nil
}

func (s *Service) createUser(ctx context.Context, profile *UserProfile, isAdmin bool) (*User, error) {
	if profile == nil {
		return nil, fmt.Errorf("user profile is nil")
	}

	user := &User{
		Name:     profile.DisplayName,
		Username: profile.Username,
		Status:   UserStatusPending, // Only admins can activate users
	}

	if len(profile.Emails) > 0 {
		user.Email = profile.Emails[0] // Use the first email as the primary email
	}

	if profile.DisplayName != "" {
		user.Name = profile.DisplayName
	}

	if user.Name == "" && (profile.Name.FirstName != "" || profile.Name.LastName != "") {
		user.Name = fmt.Sprintf("%s %s", profile.Name.FirstName, profile.Name.LastName)
	}

	if err := user.Initialize(); err != nil {
		return nil, fmt.Errorf("failed to initialize user: %w", err)
	}

	if isAdmin {
		user.Role = auth.RoleAdmin
		user.Status = UserStatusActive // Admin users are active by default
	}

	user.Sanitize()
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

	binding := Binding{
		BindingID: BindingID{
			Provider: profile.Provider,
			UserID:   user.ID,
		},
		SubjectID: profile.ID,
	}
	if err := binding.Initialize(); err != nil {
		return nil, fmt.Errorf("failed to initialize binding: %w", err)
	}

	if err := s.bindingStore.Store(ctx, &binding); err != nil {
		return nil, fmt.Errorf("failed to store binding: %w", err)
	}

	return user, nil
}

func (s *Service) LoginUser(ctx context.Context, in *LoginUserInput) (*LoginUserOutput, error) {
	if in == nil {
		return nil, fmt.Errorf("login input is nil")
	}

	if in.Profile == nil {
		return nil, fmt.Errorf("user profile is nil")
	}

	if provider := in.Profile.Provider; !provider.IsValid() {
		return nil, fmt.Errorf("invalid provider type: %q", provider)
	}

	if in.Profile.ID == "" {
		return nil, fmt.Errorf("subject ID is required for login")
	}

	binding, err := s.bindingStore.GetBy(ctx, ByProviderAndSubjectID{
		Provider:  in.Profile.Provider,
		SubjectID: in.Profile.ID,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to get binding: %w", err)
	}

	if binding == nil {
		return nil, fmt.Errorf("invalid credentials")
	}

	user, err := s.userStore.Get(ctx, binding.UserID)
	if err != nil {
		return nil, fmt.Errorf("failed to get user: %w", err)
	}

	if user.Status != UserStatusActive {
		return nil, fmt.Errorf("user account is not active")
	}

	ttl := DefaultSessionTTL
	if in.RememberMe {
		ttl = ExtendedSessionTTL
	}

	session := &Session{
		UserID:     user.ID,
		UserAgent:  in.UserAgent,
		ClientIP:   in.ClientIP,
		ExpireTime: time.Now().UTC().Add(ttl),
	}

	if err := session.Initialize(); err != nil {
		return nil, fmt.Errorf("failed to initialize session: %w", err)
	}

	token, err := session.GenerateToken(s.tokenHasher, s.secretGenerator)
	if err != nil {
		return nil, fmt.Errorf("failed to generate session token: %w", err)
	}

	session.Sanitize()
	if err := session.Validate(); err != nil {
		return nil, fmt.Errorf("invalid session data: %w", err)
	}

	if err := s.sessionStore.Store(ctx, session); err != nil {
		return nil, fmt.Errorf("failed to store session: %w", err)
	}

	return &LoginUserOutput{
		User:         user,
		Session:      session,
		SessionToken: token,
	}, nil
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

type LoginUserInput struct {
	Profile    *UserProfile
	RememberMe bool
	ClientIP   *string
	UserAgent  *string
}

type LoginUserOutput struct {
	User         *User
	Session      *Session
	SessionToken string
}
