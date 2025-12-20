package financegrpc

import (
	"fmt"

	financepb "github.com/masterkeysrd/saturn/gen/proto/go/saturn/finance/v1"
	"github.com/masterkeysrd/saturn/internal/application"
	"github.com/masterkeysrd/saturn/internal/pkg/deps"
)

func RegisterDeps(inj deps.Injector) error {
	if err := inj.Provide(func(app *application.FinanceApp) Application {
		return app
	}); err != nil {
		return fmt.Errorf("cannot inject finance.Application dep")
	}

	if err := inj.Provide(func(app Application) financepb.FinanceServer {
		return NewServer(app)
	}); err != nil {
		return fmt.Errorf("cannot provide finance gRPC server: %w", err)
	}

	return nil
}
