package identitygrpc

import (
	"fmt"

	identitypb "github.com/masterkeysrd/saturn/gen/proto/go/saturn/identity/v1"
	"github.com/masterkeysrd/saturn/internal/application"
	"github.com/masterkeysrd/saturn/internal/pkg/deps"
)

func RegisterDeps(inj deps.Injector) error {
	if err := inj.Provide(func(app *application.IdentityApp) Application {
		return app
	}); err != nil {
		return fmt.Errorf("cannot inject identity.Application dep")
	}

	if err := inj.Provide(func(app Application) identitypb.IdentityServer {
		return NewIdentityServer(app)
	}); err != nil {
		return fmt.Errorf("cannot provide identity gRPC server: %w", err)
	}

	return nil
}
