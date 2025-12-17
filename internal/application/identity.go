package application

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/masterkeysrd/saturn/internal/domain/identity"
	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	"github.com/masterkeysrd/saturn/internal/pkg/deps"
)

const (
	AccessTokenTTL = 15 * time.Minute // Access token time-to-live
)

// IdentityService defines the interface for managing users
// and their bindings to authentication providers.
type IdentityService interface {
	CreateUser(context.Context, *identity.UserProfile) (*identity.User, error)
	CreateAdminUser(context.Context, *identity.UserProfile) (*identity.User, error)
	LoginUser(context.Context, *identity.LoginUserInput) (*identity.LoginUserOutput, error)
	RefreshSession(context.Context, *identity.RefreshSessionInput) (*identity.LoginUserOutput, error)
	RevokeSession(context.Context, identity.SessionID) error
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

type IdentityApp struct {
	factory         ProviderFactory
	identityService IdentityService
	tokenManager    TokenManager
	vault           CredentialVault
}

type IdentityAppParams struct {
	deps.In

	Factory         ProviderFactory
	IdentityService IdentityService
	TokenManager    TokenManager
	Vault           CredentialVault
}

func NewIdentity(params IdentityAppParams) *IdentityApp {
	return &IdentityApp{
		factory:         params.Factory,
		identityService: params.IdentityService,
		tokenManager:    params.TokenManager,
		vault:           params.Vault,
	}
}

func (app *IdentityApp) CreateUser(context context.Context, req *CreateUserRequest) (*identity.User, error) {
	profile, err := app.createProfile(context, req)
	if err != nil {
		return nil, err
	}

	user, err := app.identityService.CreateUser(context, profile)
	if err != nil {
		return nil, fmt.Errorf("failed to create user: %w", err)
	}

	return user, nil

}

func (app *IdentityApp) CreateAdminUser(context context.Context, req *CreateUserRequest) (*identity.User, error) {
	profile, err := app.createProfile(context, req)
	if err != nil {
		return nil, err
	}

	user, err := app.identityService.CreateAdminUser(context, profile)
	if err != nil {
		return nil, fmt.Errorf("failed to create admin user: %w", err)
	}

	return user, nil
}

func (app *IdentityApp) createProfile(context context.Context, req *CreateUserRequest) (*identity.UserProfile, error) {
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
	subjectID, err := app.vault.CreateCredential(context, credential)
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

func (app *IdentityApp) LoginUser(context context.Context, req *LoginUserRequest) (*TokenPair, error) {
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}

	provider, err := app.factory.GetProvider(req.ProviderType)
	if err != nil {
		return nil, fmt.Errorf("failed to get provider: %w", err)
	}

	profile, err := provider.Authenticate(context, req.Credentials)
	if err != nil {
		return nil, fmt.Errorf("authentication failed: %w", err)
	}

	out, err := app.identityService.LoginUser(context, &identity.LoginUserInput{
		Profile:   profile,
		UserAgent: req.UserAgent,
		ClientIP:  req.ClientIP,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to login user: %w", err)
	}

	user := out.User
	passport := auth.NewUserPassport(user.ID, user.Username, user.Email, user.Role)
	accessToken, err := app.tokenManager.Generate(context, passport, AccessTokenTTL)
	if err != nil {
		return nil, fmt.Errorf("failed to generate access token: %w", err)
	}

	return &TokenPair{
		AccessToken:  accessToken.String(),
		RefreshToken: fmt.Sprintf("%s.%s", out.Session.ID.String(), out.SessionToken),
		ExpireTime:   out.Session.ExpireTime,
	}, nil
}

func (app *IdentityApp) RefreshSession(context context.Context, refreshToken string) (*TokenPair, error) {
	if refreshToken == "" {
		return nil, fmt.Errorf("refresh token is empty")
	}

	parts := strings.SplitN(refreshToken, ".", 2)
	if len(parts) != 2 {
		return nil, fmt.Errorf("invalid refresh token format")
	}

	sessionID, token := parts[0], parts[1]
	out, err := app.identityService.RefreshSession(context, &identity.RefreshSessionInput{
		SessionID: identity.SessionID(sessionID),
		Token:     token,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to refresh session: %w", err)
	}

	user := out.User
	passport := auth.NewUserPassport(user.ID, user.Username, user.Email, user.Role)
	accessToken, err := app.tokenManager.Generate(context, passport, AccessTokenTTL)
	if err != nil {
		return nil, fmt.Errorf("failed to generate access token: %w", err)
	}

	return &TokenPair{
		AccessToken:  accessToken.String(),
		RefreshToken: fmt.Sprintf("%s.%s", out.Session.ID.String(), out.SessionToken),
		ExpireTime:   out.Session.ExpireTime,
	}, nil
}

func (app *IdentityApp) RevokeSession(context context.Context, sessionID identity.SessionID) error {
	if err := app.identityService.RevokeSession(context, sessionID); err != nil {
		return fmt.Errorf("failed to revoke session: %w", err)
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
