package identity

import (
	"fmt"

	"github.com/masterkeysrd/saturn/internal/pkg/deps"
)

// RegisterDepds registers the identity domain dependencies.
func RegisterDepds(inj deps.Injector) error {
	if err := inj.Provide(NewService); err != nil {
		return fmt.Errorf("cannot register finance service provider: %w", err)
	}

	if err := inj.Provide(NewCredentialVault); err != nil {
		return fmt.Errorf("cannot register credential vault provider: %w", err)
	}

	return nil
}
