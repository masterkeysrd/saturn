package application

import (
	"fmt"

	"github.com/masterkeysrd/saturn/internal/domain/identity"
	"github.com/masterkeysrd/saturn/internal/domain/tenancy"
	"github.com/masterkeysrd/saturn/internal/pkg/deps"
)

// RegisterProviders registers the identity application providers.
func RegisterProviders(inj deps.Injector) error {
	if err := inj.Provide(func(s *identity.Service) IdentityService {
		return s
	}); err != nil {
		return fmt.Errorf("cannot inject identity.IdentityService dep")
	}

	if err := inj.Provide(NewIdentity); err != nil {
		return fmt.Errorf("cannot provide identity application: %w", err)
	}

	if err := inj.Provide(func(s *tenancy.Service) TenancyService {
		return s
	}); err != nil {
		return fmt.Errorf("cannot inject tenancy.TenancyService dep")
	}

	if err := inj.Provide(NewTenancyApplication); err != nil {
		return fmt.Errorf("cannot provide tenancy application: %w", err)
	}

	return nil
}
