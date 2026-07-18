package app

import (
	"context"
	"crypto/ed25519"
	"database/sql"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"strings"

	"github.com/grpc-ecosystem/grpc-gateway/v2/runtime"
	"github.com/jmoiron/sqlx"
	"github.com/masterkeysrd/saturn/api"
	"github.com/masterkeysrd/saturn/internal/platform/token"
	transportauth "github.com/masterkeysrd/saturn/internal/transport/auth"
	"golang.org/x/sync/errgroup"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"

	admingrpc "github.com/masterkeysrd/saturn/apis/saturn/identity/admin/v1"
	identityv1 "github.com/masterkeysrd/saturn/apis/saturn/identity/v1"
	"github.com/masterkeysrd/saturn/internal/application/iam"
	"github.com/masterkeysrd/saturn/internal/domain/identity"
	identitystorage "github.com/masterkeysrd/saturn/internal/domain/identity/storage"
	"github.com/masterkeysrd/saturn/internal/platform/password"
	"github.com/masterkeysrd/saturn/internal/shutdown"
	identitygrpc "github.com/masterkeysrd/saturn/internal/transport/identity"
)

// GRPCServer manages the standalone gRPC server listening on a Unix socket.
type GRPCServer struct {
	listener net.Listener
	grpc     *grpc.Server
}

// NewGRPCServer creates a new GRPCServer instance.
func NewGRPCServer(cfg *Config) *GRPCServer {
	return &GRPCServer{}
}

// Start initializes the gRPC server, registers the Identity service, and
// begins listening on the configured Unix socket.
func (s *GRPCServer) Start(ctx context.Context, cfg *Config, db *sql.DB) error {
	if err := os.Remove(cfg.GRPC.Socket); err != nil && !os.IsNotExist(err) {
		slog.Warn("failed to remove stale socket file", "path", cfg.GRPC.Socket, "err", err)
	}

	var err error
	s.listener, err = net.Listen("unix", cfg.GRPC.Socket)
	if err != nil {
		return fmt.Errorf("listen unix: %w", err)
	}

	// Wire IAM application
	sqlxDB := sqlx.NewDb(db, "postgres")
	userStore := identitystorage.NewUserStore(sqlxDB)
	credentialStore := identitystorage.NewCredentialStore(sqlxDB)
	passwordHasher, err := password.NewArgon2id(password.DefaultParams())
	if err != nil {
		return fmt.Errorf("create password hasher: %w", err)
	}
	identityService := identity.NewService(
		identity.Dependencies{
			UserStore:       userStore,
			CredentialStore: credentialStore,
			Hasher:          passwordHasher,
		},
	)
	coordinator := iam.NewCoordinator(identityService, passwordHasher)

	// Wire JWT token service
	issuer, audience, accessTTL, clockSkew, activeKeyID := cfg.Auth.ToTokenConfig()
	var activeKey ed25519.PrivateKey
	if cfg.Auth.PrivateKeyPath != "" {
		privKey, err := token.LoadPrivateKey(cfg.Auth.PrivateKeyPath)
		if err != nil {
			return fmt.Errorf("load private key: %w", err)
		}
		activeKey = privKey
	}
	publicKeys, err := token.LoadPublicKeys(cfg.Auth.PublicKeys)
	if err != nil {
		return fmt.Errorf("load public keys: %w", err)
	}

	tokenCfg := token.Config{
		Issuer:      issuer,
		Audience:    audience,
		AccessTTL:   accessTTL,
		ClockSkew:   clockSkew,
		ActiveKeyID: activeKeyID,
	}
	tokenService, err := token.NewEd25519Service(tokenCfg, activeKey, publicKeys)
	if err != nil {
		return fmt.Errorf("create token service: %w", err)
	}

	iamApp := identitygrpc.NewIAMApplication(coordinator, tokenService)
	identityHandler := identitygrpc.NewHandler(iamApp)

	// Load service configs at startup
	global, modules, err := api.LoadServiceConfigs()
	if err != nil {
		return fmt.Errorf("load service configs: %w", err)
	}
	rules := api.CompileAllRules(global, modules)

	// Wire auth interceptor with loaded rules
	authInterceptor := transportauth.NewAuthInterceptor(tokenService, userStore, rules)

	s.grpc = grpc.NewServer(
		grpc.UnaryInterceptor(authInterceptor.UnaryServerInterceptor()),
		grpc.StreamInterceptor(authInterceptor.StreamServerInterceptor()),
	)

	identityv1.RegisterIdentityServer(s.grpc, identityHandler)

	// Wire admin identity service
	adminHandler := identitygrpc.NewAdminHandler(coordinator)
	admingrpc.RegisterAdminIdentityServer(s.grpc, adminHandler)
	return nil
}

// Shutdown gracefully stops the gRPC server.
func (s *GRPCServer) Shutdown(ctx context.Context) error {
	if s.grpc == nil {
		return nil
	}
	s.grpc.GracefulStop()
	slog.Info("gRPC server stopped")
	return nil
}

// GRPCGatewayServer manages the gRPC-Gateway HTTP server that proxies
// REST calls into the gRPC backend over a Unix socket.
type GRPCGatewayServer struct {
	addr           string
	mux            *runtime.ServeMux
	grpcConn       *grpc.ClientConn
	server         *http.Server
	swaggerEnabled bool
	swaggerPath    string
}

// NewGRPCGatewayServer creates a new GRPCGatewayServer instance.
func NewGRPCGatewayServer(cfg *Config) *GRPCGatewayServer {
	return &GRPCGatewayServer{
		addr:           cfg.Gateway.Addr,
		swaggerEnabled: cfg.Swagger.Enabled,
		swaggerPath:    cfg.Swagger.Path,
	}
}

// Start connects to the gRPC backend via Unix socket, registers the gRPC-Gateway
// handlers, and starts the HTTP server.
func (s *GRPCGatewayServer) Start(ctx context.Context, cfg *Config) error {
	conn, err := grpc.NewClient("unix:"+cfg.GRPC.Socket,
		grpc.WithTransportCredentials(insecure.NewCredentials()),
	)
	if err != nil {
		return fmt.Errorf("dial gRPC backend: %w", err)
	}
	s.grpcConn = conn
	s.mux = runtime.NewServeMux()

	if err := identityv1.RegisterIdentityHandlerFromEndpoint(ctx, s.mux, "unix:"+cfg.GRPC.Socket, []grpc.DialOption{grpc.WithTransportCredentials(insecure.NewCredentials())}); err != nil {
		return fmt.Errorf("register gateway handler: %w", err)
	}

	if err := admingrpc.RegisterAdminIdentityHandlerFromEndpoint(ctx, s.mux, "unix:"+cfg.GRPC.Socket, []grpc.DialOption{grpc.WithTransportCredentials(insecure.NewCredentials())}); err != nil {
		return fmt.Errorf("register admin gateway handler: %w", err)
	}

	handler := http.NewServeMux()
	handler.Handle("/api/v1/", apiV1Handler(s.mux))
	if s.swaggerEnabled {
		swaggerPath := strings.TrimRight(s.swaggerPath, "/") + "/"
		swaggerJSONPath := swaggerPath + "api.swagger.json"
		handler.Handle(swaggerPath, SwaggerHandler(swaggerJSONPath))
	}

	s.server = &http.Server{Addr: s.addr, Handler: handler}
	return nil
}

// Shutdown gracefully stops the HTTP server and closes the gRPC connection.
func (s *GRPCGatewayServer) Shutdown(ctx context.Context) error {
	if s.server == nil {
		return nil
	}
	if err := s.server.Shutdown(ctx); err != nil {
		return err
	}
	if s.grpcConn != nil {
		s.grpcConn.Close()
	}
	slog.Info("gRPC-Gateway server stopped")
	return nil
}

// StartAll starts both gRPC and gRPC-Gateway servers and waits for a
// shutdown signal before gracefully tearing them down.
func StartAll(ctx context.Context, mgr *shutdown.Manager, cfg *Config) error {
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	// Open database
	db, err := OpenDB(cfg)
	if err != nil {
		return fmt.Errorf("open db: %w", err)
	}
	defer db.Close()

	grpcSrv := NewGRPCServer(cfg)
	gwSrv := NewGRPCGatewayServer(cfg)

	// Register shutdown callbacks (LIFO order: gateway first, then gRPC).
	mgr.Register(grpcSrv.Shutdown)
	mgr.Register(gwSrv.Shutdown)

	if err := grpcSrv.Start(ctx, cfg, db); err != nil {
		return fmt.Errorf("grpc: %w", err)
	}
	if err := gwSrv.Start(ctx, cfg); err != nil {
		return fmt.Errorf("gateway: %w", err)
	}

	g, _ := errgroup.WithContext(ctx)
	g.Go(func() error {
		slog.Info("gRPC server starting", "socket", cfg.GRPC.Socket)
		if err := grpcSrv.grpc.Serve(grpcSrv.listener); err != nil && err != grpc.ErrServerStopped {
			return fmt.Errorf("grpc: %w", err)
		}
		return nil
	})

	g.Go(func() error {
		slog.Info("gRPC-Gateway server starting", "addr", gwSrv.addr)
		if err := gwSrv.server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			return fmt.Errorf("gateway: %w", err)
		}
		return nil
	})

	if err := g.Wait(); err != nil {
		slog.Error("server stopped", "err", err)
	}
	slog.Info("all servers stopped")
	return nil
}
