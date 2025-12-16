package auth

import (
	"fmt"

	"github.com/masterkeysrd/saturn/internal/domain/identity"
)

type ProviderFactory struct {
	providers map[string]identity.Provider
}

func NewProviderFactory(providers []identity.Provider) *ProviderFactory {
	factory := &ProviderFactory{
		providers: make(map[string]identity.Provider),
	}

	for _, provider := range providers {
		factory.providers[provider.Type().String()] = provider
	}

	return factory
}

func (f *ProviderFactory) GetProvider(providerType identity.ProviderType) (identity.Provider, error) {
	provider, exists := f.providers[providerType.String()]
	if !exists {
		return nil, fmt.Errorf("provider not found: %s", providerType.String())
	}
	return provider, nil
}
