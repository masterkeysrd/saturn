package app

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"database/sql"
	"fmt"
	"io/fs"
	"net"
	"net/http"
	"net/netip"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/grpc-ecosystem/grpc-gateway/v2/runtime"
	"github.com/jmoiron/sqlx"
	"github.com/masterkeysrd/saturn/api"
	"github.com/masterkeysrd/saturn/apps/web"
	"golang.org/x/sync/errgroup"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"

	calendarv1 "github.com/masterkeysrd/saturn/apis/saturn/calendar/v1"
	financev1 "github.com/masterkeysrd/saturn/apis/saturn/finance/v1"
	admingrpc "github.com/masterkeysrd/saturn/apis/saturn/identity/admin/v1"
	identityv1 "github.com/masterkeysrd/saturn/apis/saturn/identity/v1"
	mailv1 "github.com/masterkeysrd/saturn/apis/saturn/mail/v1"
	aiv1 "github.com/masterkeysrd/saturn/apis/saturn/platform/ai/v1"
	backupv1 "github.com/masterkeysrd/saturn/apis/saturn/platform/backup/v1"
	connectorv1 "github.com/masterkeysrd/saturn/apis/saturn/platform/connector/v1"
	messagev1 "github.com/masterkeysrd/saturn/apis/saturn/platform/message/v1"
	schedulerv1 "github.com/masterkeysrd/saturn/apis/saturn/platform/scheduler/v1"
	workflowv1 "github.com/masterkeysrd/saturn/apis/saturn/platform/workflow/v1"
	spacev1 "github.com/masterkeysrd/saturn/apis/saturn/space/v1"
	aiaggregator "github.com/masterkeysrd/saturn/internal/aggregator/ai"
	calendaraggregator "github.com/masterkeysrd/saturn/internal/aggregator/calendar"
	financeaggregator "github.com/masterkeysrd/saturn/internal/aggregator/finance"
	mailaggregator "github.com/masterkeysrd/saturn/internal/aggregator/mail"
	spaceaggregator "github.com/masterkeysrd/saturn/internal/aggregator/space"
	workflowaggregator "github.com/masterkeysrd/saturn/internal/aggregator/workflow"
	aiapp "github.com/masterkeysrd/saturn/internal/application/ai"
	calendarapp "github.com/masterkeysrd/saturn/internal/application/calendar"
	connectorapp "github.com/masterkeysrd/saturn/internal/application/connector"
	financeapp "github.com/masterkeysrd/saturn/internal/application/finance"
	"github.com/masterkeysrd/saturn/internal/application/iam"
	mailapp "github.com/masterkeysrd/saturn/internal/application/mail"
	spaceapp "github.com/masterkeysrd/saturn/internal/application/space"
	workflowapp "github.com/masterkeysrd/saturn/internal/application/workflow"
	domaincalendar "github.com/masterkeysrd/saturn/internal/domain/calendar"
	calendarstorage "github.com/masterkeysrd/saturn/internal/domain/calendar/storage"
	"github.com/masterkeysrd/saturn/internal/domain/finance"
	financestorage "github.com/masterkeysrd/saturn/internal/domain/finance/storage"
	"github.com/masterkeysrd/saturn/internal/domain/identity"
	identitystorage "github.com/masterkeysrd/saturn/internal/domain/identity/storage"
	domainmail "github.com/masterkeysrd/saturn/internal/domain/mail"
	mailstorage "github.com/masterkeysrd/saturn/internal/domain/mail/storage"
	"github.com/masterkeysrd/saturn/internal/domain/space"
	spacestorage "github.com/masterkeysrd/saturn/internal/domain/space/storage"
	"github.com/masterkeysrd/saturn/internal/platform/ai"
	"github.com/masterkeysrd/saturn/internal/platform/backup"
	"github.com/masterkeysrd/saturn/internal/platform/connector"
	googleconnector "github.com/masterkeysrd/saturn/internal/platform/connector/google"
	"github.com/masterkeysrd/saturn/internal/platform/crypto"
	"github.com/masterkeysrd/saturn/internal/platform/db"
	"github.com/masterkeysrd/saturn/internal/platform/eventbus"
	"github.com/masterkeysrd/saturn/internal/platform/log"
	"github.com/masterkeysrd/saturn/internal/platform/password"
	"github.com/masterkeysrd/saturn/internal/platform/requestid"
	"github.com/masterkeysrd/saturn/internal/platform/scheduler"
	"github.com/masterkeysrd/saturn/internal/platform/settings"
	"github.com/masterkeysrd/saturn/internal/platform/shutdown"
	"github.com/masterkeysrd/saturn/internal/platform/token"
	"github.com/masterkeysrd/saturn/internal/platform/totp"
	"github.com/masterkeysrd/saturn/internal/platform/workflow"
	transportauth "github.com/masterkeysrd/saturn/internal/transport/auth"
	"github.com/masterkeysrd/saturn/internal/transport/event"
	eventmiddleware "github.com/masterkeysrd/saturn/internal/transport/event/middleware"
	aigrpc "github.com/masterkeysrd/saturn/internal/transport/grpc/ai"
	backupgrpc "github.com/masterkeysrd/saturn/internal/transport/grpc/backup"
	calendargrpc "github.com/masterkeysrd/saturn/internal/transport/grpc/calendar"
	connectorgrpc "github.com/masterkeysrd/saturn/internal/transport/grpc/connector"
	financegrpc "github.com/masterkeysrd/saturn/internal/transport/grpc/finance"
	identitygrpc "github.com/masterkeysrd/saturn/internal/transport/grpc/identity"
	"github.com/masterkeysrd/saturn/internal/transport/grpc/interceptors"
	mailgrpc "github.com/masterkeysrd/saturn/internal/transport/grpc/mail"
	messagegrpc "github.com/masterkeysrd/saturn/internal/transport/grpc/message"
	schedulergrpc "github.com/masterkeysrd/saturn/internal/transport/grpc/scheduler"
	spacegrpc "github.com/masterkeysrd/saturn/internal/transport/grpc/space"
	workflowgrpc "github.com/masterkeysrd/saturn/internal/transport/grpc/workflow"
	aihttp "github.com/masterkeysrd/saturn/internal/transport/http/ai"
	connectorhttp "github.com/masterkeysrd/saturn/internal/transport/http/connector"
	"github.com/masterkeysrd/saturn/internal/transport/http/gateway"
	mailhttp "github.com/masterkeysrd/saturn/internal/transport/http/mail"
	"github.com/masterkeysrd/saturn/internal/transport/http/middleware"
	mcptransport "github.com/masterkeysrd/saturn/internal/transport/mcp"
	mcpai "github.com/masterkeysrd/saturn/internal/transport/mcp/ai"
	mcpcalendar "github.com/masterkeysrd/saturn/internal/transport/mcp/calendar"
	mcpfinance "github.com/masterkeysrd/saturn/internal/transport/mcp/finance"
	mcpmail "github.com/masterkeysrd/saturn/internal/transport/mcp/mail"
	mcpmiddleware "github.com/masterkeysrd/saturn/internal/transport/mcp/middleware"
	mcpspace "github.com/masterkeysrd/saturn/internal/transport/mcp/space"
	mcpworkflow "github.com/masterkeysrd/saturn/internal/transport/mcp/workflow"
	transportscheduler "github.com/masterkeysrd/saturn/internal/transport/scheduler"
)

// GRPCServer manages the standalone gRPC server listening on a Unix socket.
type GRPCServer struct {
	listener             net.Listener
	grpc                 *grpc.Server
	TokenService         token.Service
	EventBus             *eventbus.Engine
	Scheduler            *scheduler.Engine
	ConnectorCoordinator connectorapp.Coordinator
	ConnectorOAuthMgr    *connector.OAuthManager
	CalendarCoordinator  calendarapp.Coordinator
	MailCoordinator      mailapp.Coordinator
	AttachmentHandler    *mailhttp.AttachmentHandler
	AIStreamHandler      *aihttp.StreamHandler
	MCPServer            *mcptransport.Server
	ConnectorStore       connector.Store
}

// NewGRPCServer creates a new GRPCServer instance.
func NewGRPCServer(cfg *Config) *GRPCServer {
	return &GRPCServer{}
}

// Start initializes the gRPC server, registers the Identity service, and
// begins listening on the configured Unix socket.
func (s *GRPCServer) Start(ctx context.Context, cfg *Config, sqlDB *sql.DB) error {
	if strings.TrimSpace(cfg.Security.EncryptionKey) == "" {
		return fmt.Errorf("security.encryption_key is required (set SATURN_SECURITY_ENCRYPTION_KEY)")
	}

	if err := os.Remove(cfg.GRPC.Socket); err != nil && !os.IsNotExist(err) {
		log.Warn(ctx, "failed to remove stale socket file", log.String("path", cfg.GRPC.Socket), log.Err(err))
	}

	var err error
	s.listener, err = net.Listen("unix", cfg.GRPC.Socket)
	if err != nil {
		return fmt.Errorf("listen unix: %w", err)
	}

	// Wire IAM application
	sqlxDB := sqlx.NewDb(sqlDB, "postgres")
	dbClient := db.New(sqlxDB)
	userStore := identitystorage.NewUserStore(dbClient)
	credentialStore := identitystorage.NewCredentialStore(dbClient)
	passwordHasher, err := password.NewArgon2id(password.DefaultParams())
	if err != nil {
		return fmt.Errorf("create password hasher: %w", err)
	}
	sessionStore := identitystorage.NewSessionStore(dbClient)
	securityEventStore := identitystorage.NewSecurityEventStore(dbClient)
	mfaFactorStore := identitystorage.NewMFAFactorStore(dbClient)
	mfaCipher, err := crypto.NewCipher(cfg.Security.EncryptionKey)
	if err != nil {
		return fmt.Errorf("create mfa cipher: %w", err)
	}
	deviceStore := identitystorage.NewDeviceStore(dbClient)
	ecdsaVerifier := crypto.NewECDSAVerifier()
	passwordResetStore := identitystorage.NewPasswordResetStore(dbClient)
	apiKeyStore := identitystorage.NewAPIKeyStore(dbClient)
	identityService := identity.NewService(
		identity.Dependencies{
			UserStore:          userStore,
			CredentialStore:    credentialStore,
			SessionStore:       sessionStore,
			SecurityEventStore: securityEventStore,
			Hasher:             passwordHasher,
			MFAStore:           mfaFactorStore,
			Cipher:             mfaCipher,
			TOTP:               totp.NewProvider(),
			DeviceStore:        deviceStore,
			ChallengeStore:     deviceStore,
			DeviceVerifier:     ecdsaVerifier,
			PasswordResetStore: passwordResetStore,
			APIKeyStore:        apiKeyStore,
		},
	)

	// Wire Space stores
	platformSettingsStore := settings.NewPostgresStore(dbClient)
	spaceStore := spacestorage.NewSpaceStore(dbClient)
	memberStore := spacestorage.NewMemberStore(dbClient)
	apiKeyGrantStore := spacestorage.NewAPIKeyGrantStore(dbClient)

	// Wire Space service
	spaceService := space.NewService(space.Dependencies{
		SpaceStore:       spaceStore,
		MemberStore:      memberStore,
		APIKeyGrantStore: apiKeyGrantStore,
		Settings:         settings.Bind(platformSettingsStore, space.SettingsKey),
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

	appLogger := log.New(
		log.WithLevel(logLevels[cfg.Log.Level]),
		log.WithMiddleware(requestid.Enricher()),
	)

	coordinator := iam.NewLoggingCoordinator(
		iam.NewTransactionalCoordinator(
			iam.NewCoordinator(iam.Dependencies{
				IdentityService: identityService,
				PasswordHasher:  passwordHasher,
				SpaceService:    spaceService,
				TokenService:    tokenService,
			}),
			dbClient,
		),
		appLogger,
	)

	iamApp := identitygrpc.NewIAMApplication(coordinator)
	identityHandler := identitygrpc.NewHandler(iamApp)

	// Load service configs at startup
	global, modules, err := api.LoadServiceConfigs()
	if err != nil {
		return fmt.Errorf("load service configs: %w", err)
	}
	rules := api.CompileAllRules(global, modules)
	spaceRules := api.CompileAllSpaceRules(global, modules)
	rateLimitRules := api.CompileAllRateLimitRules(global, modules)

	// Wire rate limit interceptor from declarative YAML rules
	rateLimitInterceptor := interceptors.NewRateLimitInterceptor(interceptors.RateLimitConfig{
		Enabled:           cfg.Auth.RateLimit.Enabled,
		Rules:             rateLimitRules,
		RequestsPerMinute: cfg.Auth.RateLimit.RequestsPerMinute,
		Burst:             cfg.Auth.RateLimit.Burst,
		TrustedProxies:    cfg.Gateway.TrustedProxies,
	})

	// Wire auth interceptor with loaded rules
	authInterceptor := interceptors.NewAuthInterceptor(tokenService, userStore, apiKeyStore, apiKeyGrantStore, rules)

	// Wire space interceptor
	spaceInterceptor := interceptors.NewSpaceInterceptor(memberStore, spaceRules)

	s.grpc = grpc.NewServer(
		grpc.StatsHandler(requestid.NewStatsHandler()),
		grpc.ChainUnaryInterceptor(
			interceptors.PanicUnaryInterceptor(),
			interceptors.LoggingUnaryServerInterceptor(),
			interceptors.ErrorUnaryInterceptor(),
			authInterceptor.UnaryServerInterceptor(),
			rateLimitInterceptor.UnaryServerInterceptor(),
			spaceInterceptor.UnaryServerInterceptor(),
		),
		grpc.ChainStreamInterceptor(
			interceptors.PanicStreamInterceptor(),
			interceptors.LoggingStreamServerInterceptor(),
			interceptors.ErrorStreamInterceptor(),
			authInterceptor.StreamServerInterceptor(),
			spaceInterceptor.StreamServerInterceptor(),
		),
	)

	identityv1.RegisterIdentityServer(s.grpc, identityHandler)

	// Wire admin identity service
	adminHandler := identitygrpc.NewAdminHandler(coordinator)
	admingrpc.RegisterAdminIdentityServer(s.grpc, adminHandler)

	spaceCoordinator := spaceapp.NewLoggingCoordinator(
		spaceapp.NewTransactionalCoordinator(
			spaceapp.NewCoordinator(spaceapp.Dependencies{
				SpaceService:    spaceService,
				IdentityService: identityService,
			}),
			dbClient,
		),
		appLogger,
	)
	spaceAggregator := spaceaggregator.NewService(spaceService, identityService)
	spaceHandler := spacegrpc.NewHandler(spaceCoordinator, spaceAggregator)
	spacev1.RegisterSpacesServer(s.grpc, spaceHandler)

	// Wire shared transport authenticator & unified Saturn MCP Server
	sharedAuthenticator := transportauth.NewAuthenticator(transportauth.Config{
		TokenValidator: tokenService,
		UserStore:      userStore,
		APIKeyStore:    apiKeyStore,
		GrantStore:     apiKeyGrantStore,
		MemberStore:    memberStore,
	})
	mcpServer := mcptransport.NewServer(mcptransport.ServerConfig{
		Name:    "saturn-mcp",
		Version: "1.0.0",
		AuthMiddleware: mcpmiddleware.AuthMiddleware(mcpmiddleware.AuthConfig{
			Authenticator: sharedAuthenticator,
		}),
	})
	s.MCPServer = mcpServer

	mcpspace.NewHandler(mcpspace.Dependencies{
		Aggregator:  spaceAggregator,
		Coordinator: spaceCoordinator,
	}).Register(mcpServer.Registry())

	// Wire EventBus service, domain event edge publisher, and context propagation middlewares
	eventBusEngine := eventbus.NewEngine(dbClient)
	eventBusEngine.UseProducer(
		eventmiddleware.RequestIDProducer(),
		eventmiddleware.SpaceIDProducer(),
		eventmiddleware.WorkflowChainProducer(),
	)
	eventBusEngine.UseConsumer(
		eventmiddleware.RequestIDConsumer(),
		eventmiddleware.SpaceIDConsumer(),
		eventmiddleware.WorkflowChainConsumer(),
	)
	s.EventBus = eventBusEngine

	converterRegistry := eventbus.NewConverterRegistry()
	event.RegisterDomainEventConverters(converterRegistry)
	edgePublisher := eventbus.NewEdgePublisher(eventBusEngine, converterRegistry)

	messageHandler := messagegrpc.NewHandler(eventBusEngine)
	messagev1.RegisterMessageAdminServer(s.grpc, messageHandler)

	// Wire Scheduler service (workers are started after all job/subscriber registrations complete)
	schedulerEngine := scheduler.NewEngine(dbClient)
	s.Scheduler = schedulerEngine
	schedulerHandler := schedulergrpc.NewHandler(schedulerEngine)
	schedulerv1.RegisterSchedulerAdminServer(s.grpc, schedulerHandler)

	// Wire Finance service
	budgetStore := financestorage.NewBudgetStore(dbClient)
	periodStore := financestorage.NewPeriodStore(dbClient)
	rateStore := financestorage.NewExchangeRateStore(dbClient)
	transactionStore := financestorage.NewTransactionStore(dbClient)
	insightsStore := financestorage.NewInsightsStore(dbClient)
	recurringTransactionStore := financestorage.NewRecurringTransactionStore(dbClient)
	scheduledTransactionStore := financestorage.NewScheduledTransactionStore(dbClient)
	borrowingStore := financestorage.NewBorrowingStore(dbClient)
	accountStore := financestorage.NewAccountStore(dbClient)
	transferStore := financestorage.NewTransferStore(dbClient)
	transactionEventStore := financestorage.NewTransactionEventStore(dbClient)
	inboxItemStore := financestorage.NewInboxItemStore(dbClient)
	institutionStore := financestorage.NewInstitutionStore(dbClient)
	statementStore := financestorage.NewStatementStore(dbClient)

	financeSettingsClient := settings.Bind(platformSettingsStore, finance.SettingsKey)
	financeService := finance.NewService(finance.Dependencies{
		Settings:                  financeSettingsClient,
		BudgetStore:               budgetStore,
		PeriodStore:               periodStore,
		ExchangeRateStore:         rateStore,
		TransactionStore:          transactionStore,
		InsightsStore:             insightsStore,
		RecurringTransactionStore: recurringTransactionStore,
		ScheduledTransactionStore: scheduledTransactionStore,
		BorrowingStore:            borrowingStore,
		AccountStore:              accountStore,
		TransferStore:             transferStore,
		TransactionEventStore:     transactionEventStore,
		InboxItemStore:            inboxItemStore,
		InstitutionStore:          institutionStore,
		StatementStore:            statementStore,
		Events:                    edgePublisher,
	})

	financeCoordinator := financeapp.NewLoggingCoordinator(
		financeapp.NewTransactionalCoordinator(
			financeapp.NewCoordinator(financeapp.Dependencies{
				FinanceService: financeService,
				SpaceService:   spaceService,
			}),
			dbClient,
		),
		appLogger,
	)

	financeAggregator := financeaggregator.NewService(financeService)
	financeHandler := financegrpc.NewHandler(financeCoordinator, financeAggregator)
	financev1.RegisterFinanceServer(s.grpc, financeHandler)

	mcpfinance.NewHandler(mcpfinance.Dependencies{
		Aggregator:  financeAggregator,
		Coordinator: financeCoordinator,
	}).Register(mcpServer.Registry())

	// Wire Platform AI service (Providers, Models, Unified MCP, Agents, Private Threads, Runs)
	rawAIStore := ai.NewStore(dbClient)
	aiStore, err := ai.NewEncryptedStore(rawAIStore, cfg.Security.EncryptionKey)
	if err != nil {
		return fmt.Errorf("init encrypted ai store: %w", err)
	}
	aiSettingsClient := settings.Bind(platformSettingsStore, ai.SettingsKey)
	aiInvoker := ai.NewLoomClient(ai.NewSSRFSafeHTTPClient(cfg.AI.MCP.AllowPrivateNetworks, 0))
	mcpConnector := ai.NewUnifiedMCPConnector(mcpServer.ConnectInMemory, cfg.AI.MCP.AllowPrivateNetworks)
	aiRuntime := ai.NewRuntime(ai.RuntimeDependencies{
		Store:    aiStore,
		Invoker:  aiInvoker,
		MCP:      mcpConnector,
		Settings: aiSettingsClient,
	})
	aiThreadRuntime := ai.NewThreadRuntime(aiRuntime)

	aiCoordinator := aiapp.NewLoggingCoordinator(
		aiapp.NewTransactionalCoordinator(
			aiapp.NewCoordinator(aiapp.Dependencies{
				Store:                aiStore,
				Settings:             aiSettingsClient,
				Invoker:              aiInvoker,
				MCP:                  mcpConnector,
				Runtime:              aiRuntime,
				ThreadRuntime:        aiThreadRuntime,
				AllowPrivateNetworks: cfg.AI.MCP.AllowPrivateNetworks,
			}),
			dbClient,
		),
		appLogger,
	)
	aiAggregator := aiaggregator.NewService(aiaggregator.Dependencies{
		Providers:  aiStore.Providers(),
		Models:     aiStore.Models(),
		MCPServers: aiStore.MCPServers(),
		Agents:     aiStore.Agents(),
		Threads:    aiStore.Threads(),
		Runs:       aiStore.Runs(),
		Settings:   aiSettingsClient,
		MCP:        mcpConnector,
	})
	aiHandler := aigrpc.NewHandler(aiCoordinator, aiAggregator)
	aiv1.RegisterAIServiceServer(s.grpc, aiHandler)

	s.AIStreamHandler = aihttp.NewStreamHandler(aiCoordinator, sharedAuthenticator)

	mcpai.NewHandler(mcpai.Dependencies{
		Aggregator:  aiAggregator,
		Coordinator: aiCoordinator,
	}).Register(mcpServer.Registry())

	transportscheduler.RegisterAIJobs(schedulerEngine, aiCoordinator)
	if err := transportscheduler.RegisterAISchedules(ctx, schedulerEngine); err != nil {
		return fmt.Errorf("register ai schedules: %w", err)
	}

	// Register background task handler execution callbacks
	transportscheduler.RegisterFinanceJobs(schedulerEngine, financeCoordinator)

	// Seed cron schedules / triggers
	if err := transportscheduler.RegisterFinanceSchedules(ctx, schedulerEngine); err != nil {
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
	transportscheduler.RegisterBackupJobs(schedulerEngine, backupManager)
	if err := transportscheduler.RegisterBackupSchedules(ctx, schedulerEngine); err != nil {
		return fmt.Errorf("register backup schedules: %w", err)
	}

	// Wire Connected Accounts service
	connectorStore := connector.NewStore(dbClient)
	connectorCipher, err := crypto.NewCipher(cfg.Security.EncryptionKey)
	if err != nil {
		return fmt.Errorf("init connector cipher failed: %w", err)
	}

	providerRegistry := connector.NewProviderRegistry()
	googleProvider := googleconnector.NewProvider(googleconnector.Config{
		ClientID:     cfg.Connector.Google.ClientID,
		ClientSecret: cfg.Connector.Google.ClientSecret,
		RedirectURI:  cfg.Connector.Google.ResolvedRedirectURI(&cfg.Connector),
		AuthURL:      cfg.Connector.Google.AuthURL,
		TokenURL:     cfg.Connector.Google.TokenURL,
		RevokeURL:    cfg.Connector.Google.RevokeURL,
		UserinfoURL:  cfg.Connector.Google.UserinfoURL,
		PeopleURL:    cfg.Connector.Google.PeopleURL,
		OtherURL:     cfg.Connector.Google.OtherURL,
		CalendarURL:  cfg.Connector.Google.CalendarURL,
		GmailURL:     cfg.Connector.Google.GmailURL,
	})
	providerRegistry.Register(googleProvider)

	oauthManager := connector.NewOAuthManager(connectorStore, connectorCipher, cfg.Connector.ResolvedAllowedReturnOrigins()...)
	tokenManager := connector.NewTokenManager(connectorStore, connectorCipher, providerRegistry, connector.DefaultCleanerRegistry)
	s.ConnectorStore = connectorStore

	connectorCoordinator := connectorapp.NewLoggingCoordinator(
		connectorapp.NewTransactionalCoordinator(
			connectorapp.NewCoordinator(connectorapp.Dependencies{
				Store:        connectorStore,
				OAuthManager: oauthManager,
				TokenManager: tokenManager,
				Providers:    providerRegistry,
				Cleaners:     connector.DefaultCleanerRegistry,
				Scheduler:    schedulerEngine,
			}),
			dbClient,
		),
		appLogger,
	)

	connectorHandler := connectorgrpc.NewHandler(connectorCoordinator)
	connectorv1.RegisterConnectorServiceServer(s.grpc, connectorHandler)

	// Bind connector execution callback to scheduler
	transportscheduler.RegisterConnectorJobs(schedulerEngine, connectorCoordinator, connectorStore)
	if err := transportscheduler.RegisterConnectorSchedules(ctx, schedulerEngine); err != nil {
		log.Warn(ctx, "failed to register connector periodic sync schedule", log.Err(err))
	}

	// Wire Calendar service
	calendarStore := calendarstorage.NewCalendarStore(dbClient)
	eventStore := calendarstorage.NewEventStore(dbClient)
	calendarDomainService := domaincalendar.NewService(domaincalendar.Dependencies{
		CalendarStore: calendarStore,
		EventStore:    eventStore,
	})
	externalCalendarProviders := map[string]domaincalendar.ExternalCalendarProvider{
		"google": googleProvider,
	}
	calendarCoordinator := calendarapp.NewLoggingCoordinator(
		calendarapp.NewTransactionalCoordinator(
			calendarapp.NewCoordinator(calendarapp.Dependencies{
				CalendarStore:     calendarStore,
				EventStore:        eventStore,
				DomainService:     calendarDomainService,
				TokenManager:      tokenManager,
				AccountStore:      connectorStore,
				ExternalProviders: externalCalendarProviders,
				Events:            edgePublisher,
			}),
			dbClient,
		),
		appLogger,
	)
	calendarAggregator := calendaraggregator.NewService(
		calendarStore,
		eventStore,
		connectorStore,
	)
	calendarHandler := calendargrpc.NewHandler(calendarCoordinator, calendarAggregator)
	calendarv1.RegisterCalendarServiceServer(s.grpc, calendarHandler)

	mcpcalendar.NewHandler(mcpcalendar.Dependencies{
		Aggregator:    calendarAggregator,
		Coordinator:   calendarCoordinator,
		SpaceSettings: spaceCoordinator,
	}).Register(mcpServer.Registry())

	transportscheduler.RegisterCalendarJobs(schedulerEngine, calendarCoordinator)

	s.ConnectorCoordinator = connectorCoordinator
	s.ConnectorOAuthMgr = oauthManager
	s.CalendarCoordinator = calendarCoordinator

	// Wire Mail service
	mailMailboxStore := mailstorage.NewMailboxStore(dbClient)
	mailThreadStore := mailstorage.NewThreadStore(dbClient)
	mailMessageStore := mailstorage.NewMessageStore(dbClient)
	mailDraftStore := mailstorage.NewDraftStore(dbClient)
	mailSyncStateStore := mailstorage.NewSyncStateStore(dbClient)

	mailDomainService := domainmail.NewService(domainmail.Dependencies{
		MailboxStore:   mailMailboxStore,
		ThreadStore:    mailThreadStore,
		MessageStore:   mailMessageStore,
		DraftStore:     mailDraftStore,
		SyncStateStore: mailSyncStateStore,
	})

	externalMailProviders := map[string]domainmail.ExternalMailProvider{
		"google": googleProvider,
	}

	hmacSecret, err := crypto.DeriveSubkey(cfg.Security.EncryptionKey, "saturn-mail-attachment-hmac-v1", 32)
	if err != nil {
		return fmt.Errorf("derive mail attachment hmac key: %w", err)
	}

	mailCoordinator := mailapp.NewLoggingCoordinator(
		mailapp.NewTransactionalCoordinator(
			mailapp.NewCoordinator(mailapp.Dependencies{
				DomainService:     mailDomainService,
				MailboxStore:      mailMailboxStore,
				ThreadStore:       mailThreadStore,
				MessageStore:      mailMessageStore,
				DraftStore:        mailDraftStore,
				SyncStateStore:    mailSyncStateStore,
				AccountStore:      connectorStore,
				TokenManager:      tokenManager,
				ExternalProviders: externalMailProviders,
				Events:            edgePublisher,
				HMACSecret:        hmacSecret,
			}),
			dbClient,
		),
		appLogger,
	)

	mailAggregator := mailaggregator.NewService(
		mailMailboxStore,
		mailThreadStore,
		mailMessageStore,
		mailDraftStore,
		connectorStore,
		tokenManager,
		externalMailProviders,
		hmacSecret,
	)

	mailHandler := mailgrpc.NewHandler(mailCoordinator, mailAggregator)
	mailv1.RegisterMailServiceServer(s.grpc, mailHandler)

	mcpmail.NewHandler(mcpmail.Dependencies{
		Aggregator:    mailAggregator,
		Coordinator:   mailCoordinator,
		SpaceSettings: spaceCoordinator,
	}).Register(mcpServer.Registry())

	attachmentHandler := mailhttp.NewAttachmentHandler(
		mailMessageStore,
		connectorStore,
		tokenManager,
		externalMailProviders,
		mailCoordinator,
		sharedAuthenticator,
		hmacSecret,
	)

	transportscheduler.RegisterMailJobs(schedulerEngine, mailCoordinator)
	if err := transportscheduler.RegisterMailSchedules(ctx, schedulerEngine); err != nil {
		return fmt.Errorf("register mail schedules: %w", err)
	}

	s.MailCoordinator = mailCoordinator
	s.AttachmentHandler = attachmentHandler

	// Wire Platform Workflow Engine, domain plugins, coordinator, aggregator & transports
	workflowRegistry := workflow.NewRegistry()
	event.RegisterWorkflowTriggerTopics(workflowRegistry)
	financeapp.RegisterWorkflows(workflowRegistry, financeapp.WorkflowDependencies{
		FinanceService: financeService,
		SpaceService:   spaceService,
		Transactor:     dbClient,
	})
	calendarapp.RegisterWorkflows(workflowRegistry, calendarapp.WorkflowDependencies{
		Coordinator:   calendarCoordinator,
		CalendarStore: calendarStore,
		EventStore:    eventStore,
		DomainService: calendarDomainService,
	})
	mailapp.RegisterWorkflows(workflowRegistry, mailapp.WorkflowDependencies{
		Coordinator:       mailCoordinator,
		MessageStore:      mailMessageStore,
		MailboxStore:      mailMailboxStore,
		AccountStore:      connectorStore,
		TokenManager:      tokenManager,
		ExternalProviders: externalMailProviders,
	})

	workflowTriggerStore := workflow.NewTriggerStore(dbClient)
	workflowFlowStore := workflow.NewFlowStore(dbClient, workflowTriggerStore)
	workflowStepRunStore := workflow.NewStepRunStore(dbClient)
	workflowFlowRunStore := workflow.NewFlowRunStore(dbClient, workflowStepRunStore)

	workflowEngine, err := workflow.NewEngine(workflow.Dependencies{
		FlowRuns:      workflowFlowRunStore,
		StepRuns:      workflowStepRunStore,
		Registry:      workflowRegistry,
		AgentExecutor: workflowapp.NewAgentExecutor(aiRuntime),
	})
	if err != nil {
		return fmt.Errorf("create workflow engine: %w", err)
	}

	workflowService := workflow.NewService(workflow.ServiceDependencies{
		Flows:    workflowFlowStore,
		Triggers: workflowTriggerStore,
		FlowRuns: workflowFlowRunStore,
		StepRuns: workflowStepRunStore,
		Engine:   workflowEngine,
	})

	workflowCoordinator := workflowapp.NewLoggingCoordinator(
		workflowapp.NewTransactionalCoordinator(
			workflowapp.NewCoordinator(workflowapp.Dependencies{
				Workflow:    workflowService,
				SpaceLoader: workflowapp.NewSpaceContextLoader(spaceStore, platformSettingsStore),
				Dispatcher:  event.NewEventBusRunDispatcher(eventBusEngine),
				Schedules:   schedulerEngine,
				AIRunner:    aiRuntime,
				Transactor:  dbClient,
			}),
			dbClient,
		),
		appLogger,
	)

	workflowAggregator := workflowaggregator.NewService(workflowaggregator.Dependencies{
		Workflow: workflowService,
		AIRuns:   rawAIStore.Runs(),
	})

	workflowHandler := workflowgrpc.NewHandler(workflowCoordinator, workflowAggregator)
	workflowv1.RegisterWorkflowServiceServer(s.grpc, workflowHandler)

	mcpworkflow.NewHandler(mcpworkflow.Dependencies{
		Aggregator:    workflowAggregator,
		Coordinator:   workflowCoordinator,
		SpaceSettings: spaceCoordinator,
	}).Register(mcpServer.Registry())

	event.RegisterWorkflowSubscribers(eventBusEngine, workflowCoordinator, workflowService, workflowService.Catalog())
	transportscheduler.RegisterWorkflowJobs(schedulerEngine, workflowCoordinator)

	// Start background workers only after all job handlers and workflow subscribers are registered.
	eventBusEngine.Start(ctx)
	schedulerEngine.Start(ctx)

	return nil
}

// ServeListener runs the gRPC server loop.
func (s *GRPCServer) ServeListener() error {
	if s.grpc == nil || s.listener == nil {
		return nil
	}
	err := s.grpc.Serve(s.listener)
	if err == grpc.ErrServerStopped {
		return nil
	}
	return err
}

// Shutdown gracefully stops the gRPC server and background worker engines.
func (s *GRPCServer) Shutdown(ctx context.Context) error {
	if s.grpc != nil {
		s.grpc.GracefulStop()
		log.Info(ctx, "gRPC server stopped")
	}
	var firstErr error
	if s.Scheduler != nil {
		if err := s.Scheduler.Shutdown(ctx); err != nil {
			firstErr = err
		}
	}
	if s.EventBus != nil {
		if err := s.EventBus.Shutdown(ctx); err != nil && firstErr == nil {
			firstErr = err
		}
	}
	return firstErr
}

// GRPCGatewayServer manages the gRPC-Gateway HTTP server that proxies
// REST calls into the gRPC backend over a Unix socket.
type GRPCGatewayServer struct {
	addr                 string
	mux                  *runtime.ServeMux
	grpcConn             *grpc.ClientConn
	server               *http.Server
	swaggerEnabled       bool
	swaggerPath          string
	tokenService         token.Service
	eventBus             *eventbus.Engine
	connectorCoordinator connectorapp.Coordinator
	connectorOAuthMgr    *connector.OAuthManager
	scheduler            *scheduler.Engine
	config               *Config
	attachmentHandler    *mailhttp.AttachmentHandler
	AIStreamHandler      *aihttp.StreamHandler
	MCPServer            *mcptransport.Server
	ConnectorStore       connector.Store
	DB                   *sql.DB
}

// NewGRPCGatewayServer creates a new GRPCGatewayServer instance.
func NewGRPCGatewayServer(
	cfg *Config,
	tokenService token.Service,
	eventBus *eventbus.Engine,
	connectorCoordinator connectorapp.Coordinator,
	connectorOAuthMgr *connector.OAuthManager,
	schedulerEngine *scheduler.Engine,
	attachmentHandler *mailhttp.AttachmentHandler,
) *GRPCGatewayServer {
	return &GRPCGatewayServer{
		addr:                 cfg.Gateway.Addr,
		swaggerEnabled:       cfg.Swagger.Enabled,
		swaggerPath:          cfg.Swagger.Path,
		tokenService:         tokenService,
		eventBus:             eventBus,
		connectorCoordinator: connectorCoordinator,
		connectorOAuthMgr:    connectorOAuthMgr,
		scheduler:            schedulerEngine,
		config:               cfg,
		attachmentHandler:    attachmentHandler,
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
		runtime.WithOutgoingHeaderMatcher(customOutgoingHeaderMatcher),
		runtime.WithForwardResponseOption(gateway.CookieResponseForwarder(s.config.Gateway.CookieSecure)),
	)

	if err := identityv1.RegisterIdentityHandler(ctx, s.mux, s.grpcConn); err != nil {
		return fmt.Errorf("register gateway handler: %w", err)
	}

	if err := admingrpc.RegisterAdminIdentityHandler(ctx, s.mux, s.grpcConn); err != nil {
		return fmt.Errorf("register admin gateway handler: %w", err)
	}

	if err := spacev1.RegisterSpacesHandler(ctx, s.mux, s.grpcConn); err != nil {
		return fmt.Errorf("register space gateway handler: %w", err)
	}

	if err := financev1.RegisterFinanceHandler(ctx, s.mux, s.grpcConn); err != nil {
		return fmt.Errorf("register finance gateway handler: %w", err)
	}

	if err := schedulerv1.RegisterSchedulerAdminHandler(ctx, s.mux, s.grpcConn); err != nil {
		return fmt.Errorf("register scheduler admin gateway handler: %w", err)
	}
	if err := messagev1.RegisterMessageAdminHandler(ctx, s.mux, s.grpcConn); err != nil {
		return fmt.Errorf("register message admin gateway handler: %w", err)
	}

	if err := backupv1.RegisterBackupAdminHandler(ctx, s.mux, s.grpcConn); err != nil {
		return fmt.Errorf("register backup admin gateway handler: %w", err)
	}

	if err := workflowv1.RegisterWorkflowServiceHandler(ctx, s.mux, s.grpcConn); err != nil {
		return fmt.Errorf("register platform workflow gateway handler: %w", err)
	}

	if err := aiv1.RegisterAIServiceHandler(ctx, s.mux, s.grpcConn); err != nil {
		return fmt.Errorf("register platform ai gateway handler: %w", err)
	}

	if err := connectorv1.RegisterConnectorServiceHandler(ctx, s.mux, s.grpcConn); err != nil {
		return fmt.Errorf("register platform connector gateway handler: %w", err)
	}

	if err := calendarv1.RegisterCalendarServiceHandler(ctx, s.mux, s.grpcConn); err != nil {
		return fmt.Errorf("register calendar gateway handler: %w", err)
	}

	if err := mailv1.RegisterMailServiceHandler(ctx, s.mux, s.grpcConn); err != nil {
		return fmt.Errorf("register mail gateway handler: %w", err)
	}

	handler := http.NewServeMux()
	// Register AI HTTP SSE thread streaming handlers (mounted on both /api/v1/... via s.mux and /v1/... directly)
	if s.AIStreamHandler != nil {
		_ = s.mux.HandlePath(http.MethodPost, "/v1/platform/ai/threads/{id}:stream", func(w http.ResponseWriter, r *http.Request, pathParams map[string]string) {
			s.AIStreamHandler.ServeStreamTurn(w, r, pathParams["id"])
		})
		_ = s.mux.HandlePath(http.MethodPost, "/v1/platform/ai/threads/{id}:resolveApprovals", func(w http.ResponseWriter, r *http.Request, pathParams map[string]string) {
			s.AIStreamHandler.ServeResolveApprovals(w, r, pathParams["id"])
		})
		handler.Handle("POST /v1/platform/ai/threads/", s.AIStreamHandler)
	}

	// Register unified Streamable HTTP MCP endpoints
	if s.MCPServer != nil {
		mcpHandler := s.MCPServer.HTTPHandler()
		handler.Handle("/mcp", mcpHandler)
		handler.Handle("/api/mcp", mcpHandler)
		handler.Handle("/spaces/{space_id}/mcp", mcpHandler)
		handler.Handle("/api/spaces/{space_id}/mcp", mcpHandler)
	}

	handler.Handle("/api/v1/", apiV1Handler(s.mux))

	// Register public OAuth callback handlers
	if s.connectorCoordinator != nil && s.connectorOAuthMgr != nil {
		oauthCallbackHandler := connectorhttp.NewOAuthCallbackHandler(s.connectorCoordinator, s.connectorOAuthMgr)
		handler.Handle("/v1/platform/connectors/oauth/{provider}/callback", oauthCallbackHandler)
		handler.Handle("/api/v1/platform/connectors/oauth/{provider}/callback", oauthCallbackHandler)
	}

	// Register Google push notification webhook handler
	if s.scheduler != nil {
		googleWebhookHandler := connectorhttp.NewGoogleWebhookHandler(s.scheduler, cfg.Connector.WebhookSecret)
		handler.Handle("/v1/platform/connectors/webhooks/google", googleWebhookHandler)
		handler.Handle("/api/v1/platform/connectors/webhooks/google", googleWebhookHandler)

		gmailWebhookHandler := mailhttp.NewGmailWebhookHandler(s.scheduler, s.ConnectorStore, cfg.Connector.WebhookSecret)
		handler.Handle("/v1/platform/connectors/webhooks/gmail", gmailWebhookHandler)
		handler.Handle("/api/v1/platform/connectors/webhooks/gmail", gmailWebhookHandler)
	}

	// Register Mail streaming attachment handlers
	if s.attachmentHandler != nil {
		handler.HandleFunc("GET /v1/mail/attachments/{token}", s.attachmentHandler.ServeDownload)
		handler.HandleFunc("GET /api/v1/mail/attachments/{token}", s.attachmentHandler.ServeDownload)
		handler.HandleFunc("POST /v1/mail/drafts/{draft_id}/attachments", s.attachmentHandler.ServeUpload)
		handler.HandleFunc("POST /api/v1/mail/drafts/{draft_id}/attachments", s.attachmentHandler.ServeUpload)
	}
	if s.swaggerEnabled {
		swaggerPath := strings.TrimRight(s.swaggerPath, "/") + "/"
		swaggerJSONPath := swaggerPath + "api.swagger.json"
		handler.Handle(swaggerPath, SwaggerHandler(swaggerJSONPath))
	}

	// Liveness probe endpoint
	handler.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	})

	// Readiness probe endpoint (verifies database connectivity)
	handler.HandleFunc("/readyz", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if s.DB == nil {
			w.WriteHeader(http.StatusServiceUnavailable)
			_, _ = w.Write([]byte(`{"status":"unavailable"}`))
			return
		}
		pingCtx, pingCancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer pingCancel()
		if err := s.DB.PingContext(pingCtx); err != nil {
			w.WriteHeader(http.StatusServiceUnavailable)
			_, _ = w.Write([]byte(`{"status":"unavailable"}`))
			return
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"ready"}`))
	})

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
			_ = f.Close()
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

	trustedProxies := interceptors.ParseTrustedProxies(s.config.Gateway.TrustedProxies)
	s.server = &http.Server{
		Addr:              s.addr,
		Handler:           trustedProxyIPMiddleware(trustedProxies, requestid.Middleware(middleware.LoggingMiddleware(middleware.RecoveryMiddleware(handler)))),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
	return nil
}

func trustedProxyIPMiddleware(trusted []netip.Prefix, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		host, _, err := net.SplitHostPort(r.RemoteAddr)
		if err != nil {
			host = r.RemoteAddr
		}
		if addr, parseErr := netip.ParseAddr(host); parseErr == nil {
			if !interceptors.IsTrustedProxy(addr, trusted) {
				r.Header.Del("X-Forwarded-For")
				r.Header.Del("X-Real-IP")
			}
		}
		next.ServeHTTP(w, r)
	})
}

// ServeHTTP starts listening and serving HTTP gateway requests.
func (s *GRPCGatewayServer) ServeHTTP() error {
	if s.server == nil {
		return nil
	}
	err := s.server.ListenAndServe()
	if err == http.ErrServerClosed {
		return nil
	}
	return err
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
		_ = s.grpcConn.Close()
	}
	log.Info(ctx, "gRPC-Gateway server stopped")
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
	defer func() { _ = db.Close() }()

	grpcSrv := NewGRPCServer(cfg)

	if err := grpcSrv.Start(ctx, cfg, db); err != nil {
		return fmt.Errorf("grpc: %w", err)
	}

	gwSrv := NewGRPCGatewayServer(
		cfg,
		grpcSrv.TokenService,
		grpcSrv.EventBus,
		grpcSrv.ConnectorCoordinator,
		grpcSrv.ConnectorOAuthMgr,
		grpcSrv.Scheduler,
		grpcSrv.AttachmentHandler,
	)
	gwSrv.DB = db
	gwSrv.AIStreamHandler = grpcSrv.AIStreamHandler
	gwSrv.MCPServer = grpcSrv.MCPServer
	gwSrv.ConnectorStore = grpcSrv.ConnectorStore

	// Register shutdown callbacks (LIFO order: gateway first, then gRPC).
	mgr.Register(grpcSrv.Shutdown)
	mgr.Register(gwSrv.Shutdown)

	if err := gwSrv.Start(ctx, cfg); err != nil {
		return fmt.Errorf("gateway: %w", err)
	}

	g, gCtx := errgroup.WithContext(ctx)
	g.Go(func() error {
		log.Info(gCtx, "gRPC server starting", log.String("socket", cfg.GRPC.Socket))
		if err := grpcSrv.grpc.Serve(grpcSrv.listener); err != nil && err != grpc.ErrServerStopped {
			return fmt.Errorf("grpc: %w", err)
		}
		return nil
	})

	g.Go(func() error {
		log.Info(gCtx, "gRPC-Gateway server starting", log.String("addr", gwSrv.addr))
		if err := gwSrv.server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			return fmt.Errorf("gateway: %w", err)
		}
		return nil
	})

	if err := g.Wait(); err != nil {
		log.Error(ctx, "server stopped", log.Err(err))
	}

	log.Info(ctx, "all servers stopped")
	return nil
}

func customHeaderMatcher(key string) (string, bool) {
	switch strings.ToLower(key) {
	case "x-request-id":
		return "x-request-id", true
	case "space-id":
		return "space-id", true
	default:
		return runtime.DefaultHeaderMatcher(key)
	}
}

func customOutgoingHeaderMatcher(key string) (string, bool) {
	switch strings.ToLower(key) {
	case "x-request-id":
		return "X-Request-ID", true
	default:
		return runtime.DefaultHeaderMatcher(key)
	}
}
