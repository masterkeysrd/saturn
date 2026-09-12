//go:build integration

package driver

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/x509"
	"database/sql"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/jmoiron/sqlx"
	_ "github.com/lib/pq"
	"github.com/masterkeysrd/saturn/apis/saturn"
	identityv1 "github.com/masterkeysrd/saturn/apis/saturn/identity/v1"
	"github.com/masterkeysrd/saturn/cmd/saturn/app"
	"github.com/masterkeysrd/saturn/internal/platform/eventbus"
	"github.com/masterkeysrd/saturn/internal/platform/password"
	"github.com/masterkeysrd/saturn/internal/platform/scheduler"
	"github.com/masterkeysrd/saturn/migrations"
	"github.com/testcontainers/testcontainers-go"
	tcpostgres "github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

// TestEnv manages the database connection, test container (if any), and the live Saturn HTTP server.
type TestEnv struct {
	DB            *sqlx.DB
	ServerURL     string
	BackupDir     string
	grpcSrv       *app.GRPCServer
	gwSrv         *app.GRPCGatewayServer
	container     testcontainers.Container
	adminToken    string
	cleanupPGDump func()
}

// StartTestEnv launches PostgreSQL (via Testcontainers or TEST_DATABASE_URL), runs migrations, and starts Saturn API servers.
func StartTestEnv() (*TestEnv, error) {
	ctx := context.Background()

	dbURL := os.Getenv("TEST_DATABASE_URL")
	var container testcontainers.Container

	if dbURL == "" {
		pgContainer, err := tcpostgres.Run(ctx,
			"postgres:16-alpine",
			tcpostgres.WithDatabase("saturn_test"),
			tcpostgres.WithUsername("saturn"),
			tcpostgres.WithPassword("saturn_password"),
			testcontainers.WithWaitStrategy(
				wait.ForLog("database system is ready to accept connections").
					WithOccurrence(2).
					WithStartupTimeout(30*time.Second),
			),
		)
		if err != nil {
			return nil, fmt.Errorf("failed to start postgres container: %w", err)
		}
		container = pgContainer

		connStr, err := pgContainer.ConnectionString(ctx, "sslmode=disable")
		if err != nil {
			_ = pgContainer.Terminate(ctx)
			return nil, fmt.Errorf("failed to get container connection string: %w", err)
		}
		dbURL = connStr
	}

	sqlDB, err := sql.Open("postgres", dbURL)
	if err != nil {
		if container != nil {
			_ = container.Terminate(ctx)
		}
		return nil, fmt.Errorf("failed to open postgres connection: %w", err)
	}

	if err := sqlDB.Ping(); err != nil {
		if container != nil {
			_ = container.Terminate(ctx)
		}
		return nil, fmt.Errorf("failed to ping postgres: %w", err)
	}

	sqlxDB := sqlx.NewDb(sqlDB, "postgres")

	// Run Goose migrations
	if err := migrations.Migrate(sqlDB); err != nil {
		if container != nil {
			_ = container.Terminate(ctx)
		}
		return nil, fmt.Errorf("failed to run goose migrations: %w", err)
	}

	// Create temp socket dir
	socketDir, err := os.MkdirTemp("", "saturn-test-socket-*")
	if err != nil {
		return nil, fmt.Errorf("create temp socket dir: %w", err)
	}
	sockPath := filepath.Join(socketDir, "saturn.sock")

	// Pick free HTTP port
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return nil, fmt.Errorf("listen free port: %w", err)
	}
	port := listener.Addr().(*net.TCPAddr).Port
	_ = listener.Close()

	privPath, publicKeysMap, err := createTempAuthKeys()
	if err != nil {
		return nil, fmt.Errorf("create temp auth keys: %w", err)
	}

	cleanupPGDump, err := ensurePGDump()
	if err != nil {
		return nil, fmt.Errorf("ensure pg_dump: %w", err)
	}

	backupDir, err := os.MkdirTemp("", "saturn-test-backups-*")
	if err != nil {
		if cleanupPGDump != nil {
			cleanupPGDump()
		}
		return nil, fmt.Errorf("create temp backup dir: %w", err)
	}

	dbPort := 5432
	dbHost := "localhost"
	dbUser := "saturn"
	dbPass := "saturn_password"
	dbName := "saturn_test"

	if parsedURL, err := url.Parse(dbURL); err == nil {
		if h := parsedURL.Hostname(); h != "" {
			dbHost = h
		}
		if p := parsedURL.Port(); p != "" {
			if portNum, err := strconv.Atoi(p); err == nil {
				dbPort = portNum
			}
		}
		if parsedURL.User != nil {
			if u := parsedURL.User.Username(); u != "" {
				dbUser = u
			}
			if pass, ok := parsedURL.User.Password(); ok {
				dbPass = pass
			}
		}
		if path := strings.TrimPrefix(parsedURL.Path, "/"); path != "" {
			dbName = path
		}
	}

	cfg := &app.Config{
		DB: app.DBConfig{
			Host:     dbHost,
			Port:     dbPort,
			User:     dbUser,
			Password: dbPass,
			Name:     dbName,
		},
		GRPC: app.GRPCConfig{
			Socket: sockPath,
		},
		Gateway: app.GatewayConfig{
			Addr: fmt.Sprintf("127.0.0.1:%d", port),
		},
		Auth: app.AuthConfig{
			Issuer:         "saturn-test",
			Audience:       "saturn-test-aud",
			AccessTTL:      15 * time.Minute,
			ActiveKeyID:    "test-key-1",
			PrivateKeyPath: privPath,
			PublicKeys:     publicKeysMap,
		},
		Security: app.SecurityConfig{
			EncryptionKey: "12345678901234567890123456789012",
		},
		Backup: app.BackupConfig{
			LocalDir: backupDir,
		},
	}

	grpcSrv := app.NewGRPCServer(cfg)
	if err := grpcSrv.Start(ctx, cfg, sqlDB); err != nil {
		if cleanupPGDump != nil {
			cleanupPGDump()
		}
		_ = os.RemoveAll(backupDir)
		return nil, fmt.Errorf("start grpc server: %w", err)
	}

	go func() {
		_ = grpcSrv.ServeListener()
	}()

	gwSrv := app.NewGRPCGatewayServer(cfg, grpcSrv.TokenService, grpcSrv.IntegrationRegistry, grpcSrv.EventBus)
	if err := gwSrv.Start(ctx, cfg); err != nil {
		if cleanupPGDump != nil {
			cleanupPGDump()
		}
		_ = os.RemoveAll(backupDir)
		return nil, fmt.Errorf("start gateway server: %w", err)
	}

	go func() {
		_ = gwSrv.ServeHTTP()
	}()

	serverURL := fmt.Sprintf("http://127.0.0.1:%d", port)

	// Wait for server to accept HTTP connections
	waitForServer(serverURL, 5*time.Second)

	return &TestEnv{
		DB:            sqlxDB,
		ServerURL:     serverURL,
		BackupDir:     backupDir,
		grpcSrv:       grpcSrv,
		gwSrv:         gwSrv,
		container:     container,
		cleanupPGDump: cleanupPGDump,
	}, nil
}

// Stop shuts down Saturn HTTP/gRPC servers and terminates the Postgres container.
func (e *TestEnv) Stop() {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if e.gwSrv != nil {
		_ = e.gwSrv.Shutdown(ctx)
	}
	if e.grpcSrv != nil {
		_ = e.grpcSrv.Shutdown(ctx)
	}
	if e.container != nil {
		_ = e.container.Terminate(ctx)
	}
	if e.DB != nil {
		_ = e.DB.Close()
	}
	if e.BackupDir != "" {
		_ = os.RemoveAll(e.BackupDir)
	}
	if e.cleanupPGDump != nil {
		e.cleanupPGDump()
	}
}

func ensurePGDump() (func(), error) {
	binDir, err := os.MkdirTemp("", "saturn-test-bin-*")
	if err != nil {
		return nil, fmt.Errorf("create temp bin dir: %w", err)
	}

	scriptPath := filepath.Join(binDir, "pg_dump")
	scriptContent := "#!/bin/sh\n" +
		"echo \"-- Saturn Test PostgreSQL Database Dump\"\n" +
		"echo \"-- Dumped by pg_dump test stub\"\n" +
		"echo \"SET statement_timeout = 0;\"\n" +
		"echo \"SELECT 1;\"\n"

	if err := os.WriteFile(scriptPath, []byte(scriptContent), 0755); err != nil {
		_ = os.RemoveAll(binDir)
		return nil, fmt.Errorf("write pg_dump script: %w", err)
	}

	oldPath := os.Getenv("PATH")
	if err := os.Setenv("PATH", binDir+string(filepath.ListSeparator)+oldPath); err != nil {
		_ = os.RemoveAll(binDir)
		return nil, fmt.Errorf("set PATH: %w", err)
	}

	cleanup := func() {
		_ = os.Setenv("PATH", oldPath)
		_ = os.RemoveAll(binDir)
	}
	return cleanup, nil
}

func waitForServer(url string, timeout time.Duration) {
	deadline := time.Now().Add(timeout)
	client := &http.Client{Timeout: 200 * time.Millisecond}
	for time.Now().Before(deadline) {
		resp, err := client.Get(url + "/healthz")
		if err == nil {
			_ = resp.Body.Close()
			return
		}
		time.Sleep(50 * time.Millisecond)
	}
}

func createTempAuthKeys() (string, map[string]string, error) {
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		return "", nil, err
	}

	keyDir, err := os.MkdirTemp("", "saturn-test-keys-*")
	if err != nil {
		return "", nil, err
	}

	privDER, err := x509.MarshalPKCS8PrivateKey(priv)
	if err != nil {
		return "", nil, err
	}
	privPath := filepath.Join(keyDir, "ed25519.priv")
	if err := os.WriteFile(privPath, privDER, 0600); err != nil {
		return "", nil, err
	}

	pubDER, err := x509.MarshalPKIXPublicKey(pub)
	if err != nil {
		return "", nil, err
	}
	pubPath := filepath.Join(keyDir, "ed25519.pub")
	if err := os.WriteFile(pubPath, pubDER, 0600); err != nil {
		return "", nil, err
	}

	return privPath, map[string]string{"test-key-1": pubPath}, nil
}

// getAdminToken lazy-initializes and returns an active System Admin access token.
func (e *TestEnv) getAdminToken(tb testing.TB) string {
	tb.Helper()
	if e.adminToken != "" {
		return e.adminToken
	}

	adminEmail := "system_admin@saturn.local"
	adminPass := "AdminPassword123!"

	hasher, err := password.NewArgon2id(password.DefaultParams())
	if err != nil {
		tb.Fatalf("failed to create hasher: %v", err)
	}
	hash, err := hasher.Hash(adminPass)
	if err != nil {
		tb.Fatalf("failed to hash adminPass: %v", err)
	}

	tx, err := e.DB.BeginTx(tb.Context(), nil)
	if err != nil {
		tb.Fatalf("failed to begin tx for sysadmin fixture: %v", err)
	}
	defer tx.Rollback()

	// Ensure system admin exists in DB fixture
	if _, err := tx.ExecContext(tb.Context(), `
		INSERT INTO identity.user (id, name, email, username, status, access_level)
		VALUES ('usr_sysadmin', 'System Admin', 'system_admin@saturn.local', 'sysadmin', 'active', 'admin')
		ON CONFLICT (email) DO UPDATE SET status = 'active', access_level = 'admin'
	`); err != nil {
		tb.Fatalf("failed to insert sysadmin user: %v", err)
	}

	if _, err := tx.ExecContext(tb.Context(), `
		INSERT INTO identity.user_credentials (user_id, auth_type, secret_data)
		VALUES ('usr_sysadmin', 'password', $1)
		ON CONFLICT (user_id, auth_type) DO UPDATE SET secret_data = EXCLUDED.secret_data
	`, hash); err != nil {
		tb.Fatalf("failed to insert sysadmin credentials: %v", err)
	}

	if err := tx.Commit(); err != nil {
		tb.Fatalf("failed to commit sysadmin credentials: %v", err)
	}

	client := identityv1.NewClient(saturn.Config{
		BaseURL:    e.ServerURL,
		HTTPClient: &http.Client{Timeout: 5 * time.Second},
	})

	resp, err := client.LoginUser(tb.Context(), &identityv1.LoginUserRequest{
		Method: &identityv1.LoginUserRequest_UserPassword_{
			UserPassword: &identityv1.LoginUserRequest_UserPassword{
				Identifier: adminEmail,
				Password:   adminPass,
			},
		},
	})
	if err != nil {
		tb.Fatalf("failed to authenticate system admin token: %v", err)
	}

	e.adminToken = resp.GetAccessToken()
	return e.adminToken
}

// AdminToken returns the active System Admin access token.
func (e *TestEnv) AdminToken(tb testing.TB) string {
	return e.getAdminToken(tb)
}

// EventBus returns the running EventBus Engine from the gRPC server.
func (e *TestEnv) EventBus() *eventbus.Engine {
	if e.grpcSrv != nil {
		return e.grpcSrv.EventBus
	}
	return nil
}

// Scheduler returns the running Scheduler Engine from the gRPC server.
func (e *TestEnv) Scheduler() *scheduler.Engine {
	if e.grpcSrv != nil {
		return e.grpcSrv.Scheduler
	}
	return nil
}
