package auth

import (
	"context"

	"github.com/masterkeysrd/saturn/internal/domain/identity"
)

var _ identity.Provider = (*VaultProvider)(nil)

type CredentialsVault interface {
	VerifyCredential(context.Context, *identity.ValidateCredentialInput) (*identity.UserProfile, error)
}

type VaultProvider struct {
	vault CredentialsVault
}

func NewVaultProvider(vault CredentialsVault) *VaultProvider {
	return &VaultProvider{
		vault: vault,
	}
}

func (p *VaultProvider) Type() identity.ProviderType {
	return identity.ProviderTypeVault
}

func (p *VaultProvider) Authenticate(ctx context.Context, credentials map[string]string) (*identity.UserProfile, error) {
	input := &identity.ValidateCredentialInput{
		Identifier: credentials["identifier"],
		Password:   credentials["password"],
	}
	return p.vault.VerifyCredential(ctx, input)
}
