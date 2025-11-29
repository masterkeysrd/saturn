package finance

import (
	"fmt"

	"github.com/masterkeysrd/saturn/internal/pkg/deps"
)

func RegisterProviders(inj deps.Injector) error {
	if err := inj.Provide(NewService); err != nil {
		return fmt.Errorf("cannot register finance service provider: %w", err)
	}

	if err := inj.Provide(NewSearchService); err != nil {
		return fmt.Errorf("cannot register finance search service provider: %w", err)
	}

	return nil
}
