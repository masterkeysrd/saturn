package token

import (
	"fmt"

	"github.com/masterkeysrd/saturn/internal/pkg/deps"
)

func Provide(inj deps.Injector) error {
	if err := inj.Provide(NewDefaultJWTGenerator); err != nil {
		return fmt.Errorf("cannot provide token.JWTGenerator: %w", err)
	}

	return nil
}
