package finance

import (
	"fmt"

	"github.com/masterkeysrd/saturn/internal/pkg/deps"
)

func RegisterProviders(inj deps.Injector) error {
	if err := inj.Provide(NewService); err != nil {
		return fmt.Errorf("cannot register finance application provider: %w", err)
	}

	return nil
}
