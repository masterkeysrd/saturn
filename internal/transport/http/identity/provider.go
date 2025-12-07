package identityhttp

import (
	"fmt"

	"github.com/masterkeysrd/saturn/internal/application"
	"github.com/masterkeysrd/saturn/internal/pkg/deps"
)

func RegisterProviders(inj deps.Injector) error {
	if err := inj.Provide(func(app *application.Identity) IdentityApplication {
		return app
	}); err != nil {
		return fmt.Errorf("cannot inject finance.Application dep")
	}

	if err := inj.Provide(NewUsersController); err != nil {
		return fmt.Errorf("cannot provide users controller: %w", err)
	}

	if err := inj.Provide(NewRouter); err != nil {
		return fmt.Errorf("cannot provide finance router: %w", err)
	}

	return nil
}
