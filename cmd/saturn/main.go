package main

import (
	"fmt"
	"log/slog"
	"os"
	"time"

	"github.com/masterkeysrd/saturn/internal/application"
	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/domain/identity"
	"github.com/masterkeysrd/saturn/internal/domain/tenancy"
	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	"github.com/masterkeysrd/saturn/internal/foundation/id"
	infrauth "github.com/masterkeysrd/saturn/internal/infrastructure/auth"
	"github.com/masterkeysrd/saturn/internal/infrastructure/token"
	"github.com/masterkeysrd/saturn/internal/pkg/argon2id"
	"github.com/masterkeysrd/saturn/internal/pkg/deps"
	"github.com/masterkeysrd/saturn/internal/pkg/mnemo"
	"github.com/masterkeysrd/saturn/internal/pkg/secretgen"
	"github.com/masterkeysrd/saturn/internal/pkg/sha256"
	"github.com/masterkeysrd/saturn/internal/pkg/uuid"
	"github.com/masterkeysrd/saturn/internal/storage/pg"
	financepg "github.com/masterkeysrd/saturn/internal/storage/pg/finance"
	identitypg "github.com/masterkeysrd/saturn/internal/storage/pg/identity"
	tenancypg "github.com/masterkeysrd/saturn/internal/storage/pg/tenancy"
	identitygrpc "github.com/masterkeysrd/saturn/internal/transport/grpc/servers/identity"
	tenancygrpc "github.com/masterkeysrd/saturn/internal/transport/grpc/servers/tenancy"
)

func init() {
	id.SetGenerator(uuid.NewGenerator())
}

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))
	slog.Info("building DI container")
	c, err := buildContainer()
	if err != nil {
		slog.Error("failed to build di container", slog.Any("error", err))
		return
	}

	err = c.Invoke(func(s *Server) error {
		return s.Start()
	})
	if err != nil {
		slog.Error("error starting application", slog.Any("error", err))
		return
	}
}

func buildContainer() (deps.Container, error) {
	container := deps.NewDigContainer()

	if err := wireDeps(container); err != nil {
		return nil, fmt.Errorf("cannot wire dependencies: %w", err)
	}

	// Wiring Providers
	if err := container.Provide(argon2id.New); err != nil {
		return nil, fmt.Errorf("cannot provide argon2id hasher: %w", err)
	}
	if err := container.Provide(sha256.New); err != nil {
		return nil, fmt.Errorf("cannot provide sha256 hasher: %w", err)
	}
	if err := container.Provide(secretgen.NewRandomGenerator); err != nil {
		return nil, fmt.Errorf("cannot provide secret generator: %w", err)
	}

	// Wire Hasher
	if err := container.Provide(func(hasher *argon2id.Hasher) identity.PasswordHasher {
		return hasher
	}); err != nil {
		return nil, fmt.Errorf("cannot provide password hasher: %w", err)
	}

	// Infra Wiring
	if err := deps.Register(container,
		token.Provide,
		infrauth.RegisterDeps,
	); err != nil {
		return nil, fmt.Errorf("cannot register infrastructure providers: %w", err)
	}

	if err := container.Provide(func(gen *token.JWTGenerator) auth.TokenManager {
		return gen
	}); err != nil {
		return nil, fmt.Errorf("cannot provide auth token manager: %w", err)
	}

	if err := container.Provide(func(hasher *sha256.Hasher) identity.TokenHasher {
		return hasher
	}); err != nil {
		return nil, fmt.Errorf("cannot provide token hasher: %w", err)
	}
	if err := container.Provide(func(gen *secretgen.RandomGenerator) identity.SecretGenerator {
		return gen
	}); err != nil {
		return nil, fmt.Errorf("cannot provide token generator: %w", err)
	}

	// Transport Providers
	if err := deps.Register(container,
		identitygrpc.RegisterDeps,
		tenancygrpc.RegisterDeps,
	); err != nil {
		return nil, fmt.Errorf("cannot register transport providers: %w", err)
	}

	// Application Providers
	if err := deps.Register(container,
		application.RegisterProviders,
	); err != nil {
		return nil, fmt.Errorf("cannot register application providers: %w", err)
	}

	// Domain Providers
	if err := deps.Register(container,
		tenancy.RegisterProviders,
		finance.RegisterProviders,
		identity.RegisterDeps,
	); err != nil {
		return nil, fmt.Errorf("cannot register domain providers: %w", err)
	}

	// Storage
	err := deps.Register(container,
		tenancypg.Provide,
		financepg.Provide,
		identitypg.Provide,
	)
	if err != nil {
		return nil, fmt.Errorf("cannot register storage providers: %w", err)
	}

	if err := container.Provide(pg.NewDefaultConnection); err != nil {
		return nil, err
	}

	// Provide the Server
	if err := container.Provide(NewServer); err != nil {
		return nil, fmt.Errorf("cannot provide server: %w", err)
	}

	return container, nil
}

func wireDeps(inj deps.Injector) error {
	// Internal Package Deps Wiring
	if err := inj.Provide(func() *mnemo.Cache {
		return mnemo.NewCache(mnemo.Config{
			DefaultTTL: 15 * time.Minute,
		})
	}); err != nil {
		return fmt.Errorf("cannot inject mnemo.Cache dep: %w", err)
	}

	// Infrastructure Auth Deps Wiring
	if err := inj.Provide(func(s *identity.CredentialVault) infrauth.CredentialsVault {
		return s
	}); err != nil {
		return fmt.Errorf("cannot inject identity.CredentialVault dep: %w", err)
	}

	if err := inj.Provide(func(c *mnemo.Cache) *infrauth.MnemoTokenBlacklist {
		return infrauth.NewMnemoTokenBlacklist(c)
	}); err != nil {
		return fmt.Errorf("cannot inject infra.auth.TokenBlacklist dep: %w", err)
	}

	// Application Deps Wiring
	if err := inj.Provide(func(factory *infrauth.ProviderFactory) application.ProviderFactory {
		return factory
	}); err != nil {
		return fmt.Errorf("cannot inject infra.auth.ProviderFactory dep: %w", err)
	}

	if err := inj.Provide(func(s *identity.CredentialVault) application.CredentialVault {
		return s
	}); err != nil {
		fmt.Print("build error", err.Error())
		return fmt.Errorf("cannot inject identity.CredentialVault dep: %w", err)
	}

	if err := inj.Provide(func(s *identity.Service) application.IdentityService {
		return s
	}); err != nil {
		return fmt.Errorf("cannot inject identity.Service dep: %w", err)
	}

	if err := inj.Provide(func(s *tenancy.Service) application.TenancyService {
		return s
	}); err != nil {
		return fmt.Errorf("cannot inject tenancy.Service dep: %w", err)
	}

	if err := inj.Provide(func(s *token.JWTGenerator) application.TokenManager {
		return s
	}); err != nil {
		return fmt.Errorf("cannot inject token.JWTGenerator dep: %w", err)
	}

	if err := inj.Provide(func(b *infrauth.MnemoTokenBlacklist) application.TokenBlacklist {
		return b
	}); err != nil {
		return fmt.Errorf("cannot inject infra.auth.MnemoTokenBlacklist dep: %w", err)
	}

	// Foundation Deps Wiring
	if err := inj.Provide(func(bl *infrauth.MnemoTokenBlacklist) auth.TokenBlacklist {
		return bl
	}); err != nil {
		return fmt.Errorf("cannot inject infra.auth.MnemoTokenBlacklist dep: %w", err)
	}

	// Server Deps Wiring
	if err := inj.Provide(func(s *tenancy.Service) MembershipGetter {
		return s.GetMembership
	}); err != nil {
		return fmt.Errorf("cannot inject tenancy.Service dep: %w", err)
	}

	return nil
}
