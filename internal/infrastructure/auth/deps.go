package auth

import (
	"github.com/masterkeysrd/saturn/internal/domain/identity"
	"github.com/masterkeysrd/saturn/internal/pkg/deps"
)

func RegisterDeps(inj deps.Injector) error {
	if err := inj.Provide(NewVaultProvider); err != nil {
		return err
	}

	if err := inj.Provide(func(vp *VaultProvider) *ProviderFactory {
		return NewProviderFactory([]identity.Provider{vp})
	}); err != nil {
		return err
	}

	return nil
}
