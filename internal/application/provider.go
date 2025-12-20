package application

import (
	"fmt"

	"github.com/masterkeysrd/saturn/internal/pkg/deps"
)

// RegisterProviders registers the identity application providers.
func RegisterProviders(inj deps.Injector) error {
	if err := inj.Provide(NewFinanceApp); err != nil {
		return fmt.Errorf("cannot provide finance application: %w", err)
	}

	if err := inj.Provide(NewIdentity); err != nil {
		return fmt.Errorf("cannot provide identity application: %w", err)
	}

	if err := inj.Provide(NewTenancyApplication); err != nil {
		return fmt.Errorf("cannot provide tenancy application: %w", err)
	}

	return nil
}
