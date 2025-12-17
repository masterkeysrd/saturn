package application

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/masterkeysrd/saturn/internal/domain/identity"
	"github.com/masterkeysrd/saturn/internal/pkg/deps"
)

// IdentityService defines the interface for managing users
// and their bindings to authentication providers.
type IdentityService interface {
	CreateUser(context.Context, *identity.UserProfile) (*identity.User, error)
	CreateAdminUser(context.Context, *identity.UserProfile) (*identity.User, error)
	LoginUser(context.Context, *identity.LoginUserInput) (*identity.LoginUserOutput, error)
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

type IdentityApp struct {
	identityService IdentityService
	vault           CredentialVault
	factory         ProviderFactory
}

type IdentityAppParams struct {
	deps.In

	IdentityService IdentityService
	Vault           CredentialVault
	Factory         ProviderFactory
}

func NewIdentity(params IdentityAppParams) *IdentityApp {
	return &IdentityApp{
		identityService: params.IdentityService,
		vault:           params.Vault,
		factory:         params.Factory,
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

	return &TokenPair{
		RefreshToken: fmt.Sprintf("%s.%s", out.Session.ID.String(), out.SessionToken),
		ExpireTime:   out.Session.ExpireTime,
	}, nil
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
