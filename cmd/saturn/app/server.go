package app

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"database/sql"
	"fmt"
	"io/fs"
	"log/slog"
	"net"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/grpc-ecosystem/grpc-gateway/v2/runtime"
	"github.com/jmoiron/sqlx"
	"github.com/masterkeysrd/saturn/api"
	"github.com/masterkeysrd/saturn/apps/web"
	"github.com/masterkeysrd/saturn/internal/platform/backup"
	"github.com/masterkeysrd/saturn/internal/platform/token"
	transportauth "github.com/masterkeysrd/saturn/internal/transport/auth"
	"golang.org/x/sync/errgroup"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"

	financev1 "github.com/masterkeysrd/saturn/apis/saturn/finance/v1"
	admingrpc "github.com/masterkeysrd/saturn/apis/saturn/identity/admin/v1"
	identityv1 "github.com/masterkeysrd/saturn/apis/saturn/identity/v1"
	backupv1 "github.com/masterkeysrd/saturn/apis/saturn/platform/backup/v1"
	schedulerv1 "github.com/masterkeysrd/saturn/apis/saturn/platform/scheduler/v1"
	spacev1 "github.com/masterkeysrd/saturn/apis/saturn/space/v1"
	financeapp "github.com/masterkeysrd/saturn/internal/application/finance"
	"github.com/masterkeysrd/saturn/internal/application/iam"
	spaceapp "github.com/masterkeysrd/saturn/internal/application/space"
	"github.com/masterkeysrd/saturn/internal/domain/finance"
	financestorage "github.com/masterkeysrd/saturn/internal/domain/finance/storage"
	"github.com/masterkeysrd/saturn/internal/domain/identity"
	identitystorage "github.com/masterkeysrd/saturn/internal/domain/identity/storage"
	"github.com/masterkeysrd/saturn/internal/domain/space"
	spacestorage "github.com/masterkeysrd/saturn/internal/domain/space/storage"
	"github.com/masterkeysrd/saturn/internal/platform/password"
	"github.com/masterkeysrd/saturn/internal/platform/scheduler"
	"github.com/masterkeysrd/saturn/internal/shutdown"
	backupgrpc "github.com/masterkeysrd/saturn/internal/transport/backup"
	financegrpc "github.com/masterkeysrd/saturn/internal/transport/finance"
	identitygrpc "github.com/masterkeysrd/saturn/internal/transport/identity"
	schedulergrpc "github.com/masterkeysrd/saturn/internal/transport/scheduler"
	spacegrpc "github.com/masterkeysrd/saturn/internal/transport/space"
)

// GRPCServer manages the standalone gRPC server listening on a Unix socket.
type GRPCServer struct {
	listener     net.Listener
	grpc         *grpc.Server
	TokenService token.Service
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
	sessionStore := identitystorage.NewSessionStore(sqlxDB)
	identityService := identity.NewService(
		identity.Dependencies{
			UserStore:       userStore,
			CredentialStore: credentialStore,
			SessionStore:    sessionStore,
			Hasher:          passwordHasher,
		},
	)

	// Wire Space stores
	spaceStore := spacestorage.NewSpaceStore(sqlxDB)
	memberStore := spacestorage.NewMemberStore(sqlxDB)

	// Wire Space service
	spaceService := space.NewService(space.Dependencies{
		SpaceStore:  spaceStore,
		MemberStore: memberStore,
	})

	// Wire JWT token service
	issuer, audience, accessTTL, clockSkew, activeKeyID := cfg.Auth.ToTokenConfig()
	var activeKey ed25519.PrivateKey
	if cfg.Auth.PrivateKeyPath != "" {
		privKey, err := token.LoadOrGeneratePrivateKey(cfg.Auth.PrivateKeyPath)
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
	s.TokenService = tokenService

	coordinator := iam.NewCoordinator(iam.Dependencies{
		IdentityService: identityService,
		PasswordHasher:  passwordHasher,
		SpaceService:    spaceService,
		TokenService:    tokenService,
	})

	iamApp := identitygrpc.NewIAMApplication(coordinator)
	identityHandler := identitygrpc.NewHandler(iamApp)

	// Load service configs at startup
	global, modules, err := api.LoadServiceConfigs()
	if err != nil {
		return fmt.Errorf("load service configs: %w", err)
	}
	rules := api.CompileAllRules(global, modules)
	spaceRules := api.CompileAllSpaceRules(global, modules)

	// Wire auth interceptor with loaded rules
	authInterceptor := transportauth.NewAuthInterceptor(tokenService, userStore, rules)

	// Wire space interceptor
	spaceInterceptor := transportauth.NewSpaceInterceptor(memberStore, spaceRules)

	s.grpc = grpc.NewServer(
		grpc.ChainUnaryInterceptor(
			transportauth.PanicUnaryInterceptor(),
			authInterceptor.UnaryServerInterceptor(),
			spaceInterceptor.UnaryServerInterceptor(),
		),
		grpc.ChainStreamInterceptor(
			transportauth.PanicStreamInterceptor(),
			authInterceptor.StreamServerInterceptor(),
			spaceInterceptor.StreamServerInterceptor(),
		),
	)

	identityv1.RegisterIdentityServer(s.grpc, identityHandler)

	// Wire admin identity service
	adminHandler := identitygrpc.NewAdminHandler(coordinator)
	admingrpc.RegisterAdminIdentityServer(s.grpc, adminHandler)

	// Wire Space service
	spaceCoordinator := spaceapp.NewCoordinator(spaceapp.Dependencies{
		SpaceService:    spaceService,
		IdentityService: identityService,
	})
	spaceHandler := spacegrpc.NewHandler(spaceCoordinator)
	spacev1.RegisterSpacesServer(s.grpc, spaceHandler)

	// Wire Finance service
	settingsStore := financestorage.NewSettingsStore(sqlxDB)
	budgetStore := financestorage.NewBudgetStore(sqlxDB)
	periodStore := financestorage.NewPeriodStore(sqlxDB)
	rateStore := financestorage.NewExchangeRateStore(sqlxDB)
	transactionStore := financestorage.NewTransactionStore(sqlxDB)
	insightsStore := financestorage.NewInsightsStore(sqlxDB)
	recurringExpenseStore := financestorage.NewRecurringExpenseStore(sqlxDB)
	scheduledPaymentStore := financestorage.NewScheduledPaymentStore(sqlxDB)
	borrowingStore := financestorage.NewBorrowingStore(sqlxDB)
	borrowingRepaymentStore := financestorage.NewBorrowingRepaymentStore(sqlxDB)
	accountStore := financestorage.NewAccountStore(sqlxDB)
	transferStore := financestorage.NewTransferStore(sqlxDB)

	financeService := finance.NewService(finance.Dependencies{
		SettingsStore:           settingsStore,
		BudgetStore:             budgetStore,
		PeriodStore:             periodStore,
		ExchangeRateStore:       rateStore,
		TransactionStore:        transactionStore,
		InsightsStore:           insightsStore,
		RecurringExpenseStore:   recurringExpenseStore,
		ScheduledPaymentStore:   scheduledPaymentStore,
		BorrowingStore:          borrowingStore,
		BorrowingRepaymentStore: borrowingRepaymentStore,
		AccountStore:            accountStore,
		TransferStore:           transferStore,
	})

	financeCoordinator := financeapp.NewCoordinator(financeapp.Dependencies{
		FinanceService: financeService,
		SpaceService:   spaceService,
	})

	financeHandler := financegrpc.NewHandler(financeCoordinator)
	financev1.RegisterFinanceServer(s.grpc, financeHandler)

	// Wire Scheduler service & start workers
	schedulerEngine := scheduler.NewEngine(sqlxDB)
	schedulerEngine.Start(ctx)
	schedulerHandler := schedulergrpc.NewHandler(schedulerEngine)
	schedulerv1.RegisterSchedulerAdminServer(s.grpc, schedulerHandler)

	// Register background task handler execution callbacks
	financev1.RegisterGenerateScheduledPaymentsPayload(schedulerEngine, financeHandler.HandleGenerateScheduledPayments)

	// Seed cron schedules / triggers
	if err := financeHandler.RegisterSchedules(ctx, schedulerEngine); err != nil {
		return fmt.Errorf("register finance schedules: %w", err)
	}

	// Wire Backup service
	backupPgConfig := backup.PostgresConfig{
		Host:     cfg.DB.Host,
		Port:     strconv.Itoa(cfg.DB.Port),
		User:     cfg.DB.User,
		Password: cfg.DB.Password,
		Database: cfg.DB.Name,
	}

	var store backup.Storage
	switch cfg.Backup.Driver {
	case "s3":
		if cfg.Backup.S3Bucket == "" {
			return fmt.Errorf("backup.s3_bucket must be set when driver is s3")
		}
		var err error
		store, err = backup.NewS3Storage(ctx, cfg.Backup.S3Bucket, cfg.Backup.S3Region, cfg.Backup.S3Endpoint)
		if err != nil {
			return fmt.Errorf("init backup storage failed: %w", err)
		}
	default:
		var err error
		store, err = backup.NewLocalStorage(cfg.Backup.LocalDir)
		if err != nil {
			return fmt.Errorf("init backup storage failed: %w", err)
		}
	}

	backupManager := backup.NewPostgresBackupManager(store, backupPgConfig, cfg.Backup.LocalDir)
	backupHandler := backupgrpc.NewHandler(backupManager)
	backupv1.RegisterBackupAdminServer(s.grpc, backupHandler)

	// Bind backup execution callback to scheduler and seed daily schedule
	backupv1.RegisterRunDatabaseBackupPayload(schedulerEngine, backupHandler.HandleRunDatabaseBackup)
	if err := backupHandler.RegisterSchedules(ctx, schedulerEngine); err != nil {
		return fmt.Errorf("register backup schedules: %w", err)
	}

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
	tokenService   token.Service
	config         *Config
}

// NewGRPCGatewayServer creates a new GRPCGatewayServer instance.
func NewGRPCGatewayServer(cfg *Config, tokenService token.Service) *GRPCGatewayServer {
	return &GRPCGatewayServer{
		addr:           cfg.Gateway.Addr,
		swaggerEnabled: cfg.Swagger.Enabled,
		swaggerPath:    cfg.Swagger.Path,
		tokenService:   tokenService,
		config:         cfg,
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
	s.mux = runtime.NewServeMux(
		runtime.WithIncomingHeaderMatcher(customHeaderMatcher),
	)

	if err := identityv1.RegisterIdentityHandlerFromEndpoint(ctx, s.mux, "unix:"+cfg.GRPC.Socket, []grpc.DialOption{grpc.WithTransportCredentials(insecure.NewCredentials())}); err != nil {
		return fmt.Errorf("register gateway handler: %w", err)
	}

	if err := admingrpc.RegisterAdminIdentityHandlerFromEndpoint(ctx, s.mux, "unix:"+cfg.GRPC.Socket, []grpc.DialOption{grpc.WithTransportCredentials(insecure.NewCredentials())}); err != nil {
		return fmt.Errorf("register admin gateway handler: %w", err)
	}

	if err := spacev1.RegisterSpacesHandlerFromEndpoint(ctx, s.mux, "unix:"+cfg.GRPC.Socket, []grpc.DialOption{grpc.WithTransportCredentials(insecure.NewCredentials())}); err != nil {
		return fmt.Errorf("register space gateway handler: %w", err)
	}

	if err := financev1.RegisterFinanceHandlerFromEndpoint(ctx, s.mux, "unix:"+cfg.GRPC.Socket, []grpc.DialOption{grpc.WithTransportCredentials(insecure.NewCredentials())}); err != nil {
		return fmt.Errorf("register finance gateway handler: %w", err)
	}

	if err := schedulerv1.RegisterSchedulerAdminHandlerFromEndpoint(ctx, s.mux, "unix:"+cfg.GRPC.Socket, []grpc.DialOption{grpc.WithTransportCredentials(insecure.NewCredentials())}); err != nil {
		return fmt.Errorf("register scheduler admin gateway handler: %w", err)
	}

	if err := backupv1.RegisterBackupAdminHandlerFromEndpoint(ctx, s.mux, "unix:"+cfg.GRPC.Socket, []grpc.DialOption{grpc.WithTransportCredentials(insecure.NewCredentials())}); err != nil {
		return fmt.Errorf("register backup admin gateway handler: %w", err)
	}

	handler := http.NewServeMux()
	handler.Handle("/api/v1/", apiV1Handler(s.mux))
	if s.swaggerEnabled {
		swaggerPath := strings.TrimRight(s.swaggerPath, "/") + "/"
		swaggerJSONPath := swaggerPath + "api.swagger.json"
		handler.Handle(swaggerPath, SwaggerHandler(swaggerJSONPath))
	}

	// Serve static files from embedded React UI assets with client-routing fallback
	uiFS := web.GetUIFS()
	fileServer := http.FileServer(http.FS(uiFS))
	handler.Handle("/", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path
		if path == "/" {
			fileServer.ServeHTTP(w, r)
			return
		}

		// Clean the path to prevent directory traversal
		cleaned := strings.TrimPrefix(path, "/")

		// Check if file exists in the embedded filesystem
		f, err := uiFS.Open(cleaned)
		if err == nil {
			f.Close()
			fileServer.ServeHTTP(w, r)
			return
		}

		// File does not exist, fall back to index.html for client-side routing
		indexContent, err := fs.ReadFile(uiFS, "index.html")
		if err != nil {
			http.Error(w, "index.html not found", http.StatusNotFound)
			return
		}
		http.ServeContent(w, r, "index.html", time.Time{}, bytes.NewReader(indexContent))
	}))

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

	if err := grpcSrv.Start(ctx, cfg, db); err != nil {
		return fmt.Errorf("grpc: %w", err)
	}

	gwSrv := NewGRPCGatewayServer(cfg, grpcSrv.TokenService)

	// Register shutdown callbacks (LIFO order: gateway first, then gRPC).
	mgr.Register(grpcSrv.Shutdown)
	mgr.Register(gwSrv.Shutdown)

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

func customHeaderMatcher(key string) (string, bool) {
	switch strings.ToLower(key) {
	case "space-id":
		return "space-id", true
	default:
		return runtime.DefaultHeaderMatcher(key)
	}
}
