package application

import (
	"context"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/masterkeysrd/saturn/internal/domain/identity"
	"github.com/masterkeysrd/saturn/internal/domain/tenancy"
	"github.com/masterkeysrd/saturn/internal/foundation/access"
	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	"github.com/masterkeysrd/saturn/internal/pkg/deps"
	"github.com/masterkeysrd/saturn/internal/pkg/ptr"
)

const (
	AccessTokenTTL = 15 * time.Minute // Access token time-to-live
)

// IdentityService defines the interface for managing users
// and their bindings to authentication providers.
type IdentityService interface {
	CreateUser(context.Context, *identity.UserProfile) (*identity.User, error)
	GetUser(context.Context, identity.UserID) (*identity.User, error)
	CreateAdminUser(context.Context, *identity.UserProfile) (*identity.User, error)
	LoginUser(context.Context, *identity.LoginUserInput) (*identity.LoginUserOutput, error)
	RefreshSession(context.Context, *identity.RefreshSessionInput) (*identity.LoginUserOutput, error)
	RevokeSession(context.Context, identity.SessionID) error
	RevokeAllSessions(context.Context, identity.UserID) error
}

// CredentialVault defines the interface for managing credentials
// in a secure vault (the password provider implementation).
type CredentialVault interface {
	CreateCredential(context.Context, *identity.CreateCredentialInput) (identity.SubjectID, error)
	VerifyCredential(context.Context, *identity.ValidateCredentialInput) (*identity.UserProfile, error)
}

// ProviderFactory defines the interface for obtaining identity providers.
type ProviderFactory interface {
	GetProvider(providerType identity.ProviderType) (identity.Provider, error)
}

type TokenManager interface {
	Generate(context.Context, auth.UserPassport, time.Duration) (auth.Token, error)
	Parse(context.Context, auth.Token) (auth.UserPassport, error)
}

type TokenBlacklist interface {
	Revoke(ctx context.Context, token auth.Token, ttl time.Duration) error
}

type IdentityApp struct {
	factory         ProviderFactory
	identityService IdentityService
	tenancyService  TenancyService
	tokenManager    TokenManager
	tokenBlacklist  TokenBlacklist
	vault           CredentialVault
}

type IdentityAppParams struct {
	deps.In

	Factory         ProviderFactory
	IdentityService IdentityService
	TenancyService  TenancyService
	TokenManager    TokenManager
	TokenBlacklist  TokenBlacklist
	Vault           CredentialVault
}

func NewIdentity(params IdentityAppParams) *IdentityApp {
	return &IdentityApp{
		factory:         params.Factory,
		identityService: params.IdentityService,
		tenancyService:  params.TenancyService,
		tokenManager:    params.TokenManager,
		tokenBlacklist:  params.TokenBlacklist,
		vault:           params.Vault,
	}
}

func (app *IdentityApp) CreateUser(ctx context.Context, req *CreateUserRequest) (*identity.User, error) {
	profile, err := app.createProfile(ctx, req)
	if err != nil {
		return nil, err
	}

	user, err := app.identityService.CreateUser(ctx, profile)
	if err != nil {
		return nil, fmt.Errorf("failed to create user: %w", err)
	}

	// After creating the user, we can create a default space for them
	principal := access.NewPrincipal(user.ID, "", user.Role, "")

	space := &tenancy.Space{
		Name:        fmt.Sprintf("%s's Space", req.Name),
		Description: ptr.Of("Default personal space"),
	}
	if err := app.tenancyService.CreateSpace(ctx, principal, space); err != nil {
		return nil, fmt.Errorf("failed to create default space for user: %w", err)
	}

	return user, nil
}

func (app *IdentityApp) GetUser(ctx context.Context, identifier string) (*identity.User, error) {
	if identifier == "me" {
		userID, ok := auth.GetCurrentUserID(ctx)
		if !ok {
			return nil, fmt.Errorf("failed to get current user ID from context")
		}
		identifier = string(userID)
	}

	currUser, ok := auth.GetCurrentUserPassport(ctx)
	if !ok {
		return nil, fmt.Errorf("failed to get current user from context")
	}

	// Only admin users can get other users' information
	if identifier != currUser.UserID().String() && currUser.Role() != auth.RoleAdmin {
		return nil, fmt.Errorf("permission denied: only admin users can get other users' information")
	}

	user, err := app.identityService.GetUser(ctx, identity.UserID(identifier))
	if err != nil {
		return nil, fmt.Errorf("failed to get user: %w", err)
	}
	return user, nil
}

func (app *IdentityApp) CreateAdminUser(ctx context.Context, req *CreateUserRequest) (*identity.User, error) {
	profile, err := app.createProfile(ctx, req)
	if err != nil {
		return nil, err
	}

	user, err := app.identityService.CreateAdminUser(ctx, profile)
	if err != nil {
		return nil, fmt.Errorf("failed to create admin user: %w", err)
	}

	// Return the created admin user, admin users are not associated to
	// any space because the intention is just to administer the system
	// and not to participate in any tenancy.
	return user, nil
}

func (app *IdentityApp) createProfile(ctx context.Context, req *CreateUserRequest) (*identity.UserProfile, error) {
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}

	// Create the credential
	credential := &identity.CreateCredentialInput{
		Username: req.Username,
		Email:    req.Email,
		Password: req.Password,
	}

	// Store the credential in the vault
	subjectID, err := app.vault.CreateCredential(ctx, credential)
	if err != nil {
		return nil, fmt.Errorf("failed to create credential: %w", err)
	}

	// Create user profile
	profile := &identity.UserProfile{
		Provider:    identity.ProviderTypeVault,
		ID:          subjectID,
		Username:    req.Username,
		DisplayName: req.Name,
		Emails:      []string{req.Email},
	}

	if parts := strings.SplitN(req.Name, " ", 2); len(parts) == 2 {
		profile.Name = identity.UserProfileName{
			FirstName: parts[0],
			LastName:  parts[1],
		}
	}

	if req.AvatarURL != "" {
		profile.Photos = []string{req.AvatarURL}
	}

	return profile, nil
}

func (app *IdentityApp) LoginUser(ctx context.Context, req *LoginUserRequest) (*TokenPair, error) {
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}

	provider, err := app.factory.GetProvider(req.ProviderType)
	if err != nil {
		return nil, fmt.Errorf("failed to get provider: %w", err)
	}

	profile, err := provider.Authenticate(ctx, req.Credentials)
	if err != nil {
		return nil, fmt.Errorf("authentication failed: %w", err)
	}

	out, err := app.identityService.LoginUser(ctx, &identity.LoginUserInput{
		Profile:   profile,
		UserAgent: req.UserAgent,
		ClientIP:  req.ClientIP,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to login user: %w", err)
	}

	user := out.User
	session := out.Session
	passport := auth.NewUserPassport(session.ID, user.ID, user.Username, user.Email, user.Role)
	accessToken, err := app.tokenManager.Generate(ctx, passport, AccessTokenTTL)
	if err != nil {
		return nil, fmt.Errorf("failed to generate access token: %w", err)
	}

	return &TokenPair{
		AccessToken:  accessToken.String(),
		RefreshToken: fmt.Sprintf("%s.%s", session.ID.String(), out.SessionToken),
		ExpireTime:   out.Session.ExpireTime,
	}, nil
}

func (app *IdentityApp) LogoutUser(ctx context.Context) error {
	token, ok := auth.GetToken(ctx)
	if !ok {
		return fmt.Errorf("failed to get token from context")
	}

	// Revoke the access token
	if err := app.tokenBlacklist.Revoke(ctx, token, AccessTokenTTL); err != nil {
		log.Printf("warning: failed to revoke access token: %v", err)
	}

	sessionID, ok := auth.GetCurrentSessionID(ctx)
	if !ok {
		return fmt.Errorf("failed to get current session ID from context")
	}

	// Revoke the session
	if err := app.identityService.RevokeSession(ctx, sessionID); err != nil {
		return fmt.Errorf("failed to revoke session: %w", err)
	}

	return nil
}

func (app *IdentityApp) RefreshSession(ctx context.Context, refreshToken string) (*TokenPair, error) {
	if refreshToken == "" {
		return nil, fmt.Errorf("refresh token is empty")
	}

	parts := strings.SplitN(refreshToken, ".", 2)
	if len(parts) != 2 {
		return nil, fmt.Errorf("invalid refresh token format")
	}

	sessionID, token := parts[0], parts[1]
	out, err := app.identityService.RefreshSession(ctx, &identity.RefreshSessionInput{
		SessionID: identity.SessionID(sessionID),
		Token:     token,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to refresh session: %w", err)
	}

	user := out.User
	session := out.Session

	passport := auth.NewUserPassport(session.ID, user.ID, user.Username, user.Email, user.Role)
	accessToken, err := app.tokenManager.Generate(ctx, passport, AccessTokenTTL)
	if err != nil {
		return nil, fmt.Errorf("failed to generate access token: %w", err)
	}

	return &TokenPair{
		AccessToken:  accessToken.String(),
		RefreshToken: fmt.Sprintf("%s.%s", session.ID.String(), out.SessionToken),
		ExpireTime:   out.Session.ExpireTime,
	}, nil
}

func (app *IdentityApp) RevokeSession(ctx context.Context, sessionID identity.SessionID) error {
	if err := app.identityService.RevokeSession(ctx, sessionID); err != nil {
		return fmt.Errorf("failed to revoke session: %w", err)
	}
	return nil
}

func (app *IdentityApp) RevokeAllSessions(ctx context.Context) error {
	userID, ok := auth.GetCurrentUserID(ctx)
	if !ok {
		return fmt.Errorf("failed to get current user ID from context")
	}

	if err := app.identityService.RevokeAllSessions(ctx, userID); err != nil {
		return fmt.Errorf("failed to revoke all sessions: %w", err)
	}
	return nil
}

type CreateUserRequest struct {
	Name      string
	AvatarURL string
	Username  string
	Email     string
	Password  string
}

type LoginUserRequest struct {
	ProviderType identity.ProviderType
	Credentials  map[string]string
	RememberMe   bool
	UserAgent    *string
	ClientIP     *string
}

type TokenPair struct {
	AccessToken  string
	RefreshToken string
	ExpireTime   time.Time
}
