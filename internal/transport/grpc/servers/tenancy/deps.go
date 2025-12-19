package tenancygrpc

import (
	"fmt"

	tenancypb "github.com/masterkeysrd/saturn/gen/proto/go/saturn/tenancy/v1"
	"github.com/masterkeysrd/saturn/internal/application"
	"github.com/masterkeysrd/saturn/internal/pkg/deps"
)

func RegisterDeps(inj deps.Injector) error {
	if err := inj.Provide(func(app *application.TenancyApp) Application {
		return app
	}); err != nil {
		return fmt.Errorf("cannot inject tenancy.Application dep")
	}

	if err := inj.Provide(func(app Application) tenancypb.TenancyServer {
		return NewServer(app)
	}); err != nil {
		return fmt.Errorf("cannot provide identity gRPC server: %w", err)
	}

	return nil
}
