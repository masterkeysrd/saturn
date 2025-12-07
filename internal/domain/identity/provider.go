package identity

import (
	"fmt"

	"github.com/masterkeysrd/saturn/internal/pkg/deps"
)

// RegisterProviders registers the identity application providers.
func RegisterProviders(inj deps.Injector) error {
	if err := inj.Provide(NewService); err != nil {
		return fmt.Errorf("cannot register finance service provider: %w", err)
	}

	return nil
}
