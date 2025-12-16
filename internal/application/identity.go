package application

import (
	"context"
	"fmt"
	"strings"

	"github.com/masterkeysrd/saturn/internal/domain/identity"
)

// IdentityService defines the interface for managing users
// and their bindings to authentication providers.
type IdentityService interface {
	CreateUser(context.Context, *identity.UserProfile) (*identity.User, error)
}

// CredentialVault defines the interface for managing credentials
// in a secure vault (the password provider implementation).
type CredentialVault interface {
	CreateCredential(context.Context, *identity.CreateCredentialInput) (identity.SubjectID, error)
	VerifyCredential(context.Context, *identity.ValidateCredentialInput) (*identity.UserProfile, error)
}

type IdentityApp struct {
	identityService IdentityService
	vault           CredentialVault
}

func NewIdentity(identityService IdentityService, vault CredentialVault) *IdentityApp {
	return &IdentityApp{
		identityService: identityService,
		vault:           vault,
	}
}

func (app *IdentityApp) CreateUser(context context.Context, req *CreateUserRequest) (*identity.User, error) {
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

	user, err := app.identityService.CreateUser(context, profile)
	if err != nil {
		return nil, fmt.Errorf("failed to create user: %w", err)
	}

	return user, nil
}

type CreateUserRequest struct {
	Name      string
	AvatarURL string
	Username  string
	Email     string
	Password  string
}
