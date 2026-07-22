package app

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"strconv"

	"github.com/jmoiron/sqlx"
	"github.com/masterkeysrd/saturn/internal/application/iam"
	"github.com/masterkeysrd/saturn/internal/domain/identity"
	identitystorage "github.com/masterkeysrd/saturn/internal/domain/identity/storage"
	"github.com/masterkeysrd/saturn/internal/domain/space"
	spacestorage "github.com/masterkeysrd/saturn/internal/domain/space/storage"
	"github.com/masterkeysrd/saturn/internal/platform/backup"
	"github.com/masterkeysrd/saturn/internal/platform/password"
	"github.com/masterkeysrd/saturn/internal/shutdown"
	"github.com/masterkeysrd/saturn/migrations"
	"github.com/spf13/cobra"
)

// Execute runs the command tree.
func Execute() error {
	rootCmd := &cobra.Command{
		Use:   "saturn",
		Short: "Saturn personal productivity service",
	}

	serveCmd := &cobra.Command{
		Use:   "serve",
		Short: "Start the Saturn service",
		RunE: func(cmd *cobra.Command, args []string) error {
			v := NewViper()
			BindFlags(v, cmd.Flags())
			cfg := LoadConfig(v)
			initLogging(cfg)
			slog.Info("config loaded", "config", cfg)

			mgr := shutdown.New(shutdown.WithTimeout(cfg.Shutdown.Timeout))
			ctx, cancel := mgr.Init()
			defer cancel()
			defer mgr.Defer()

			return StartAll(ctx, mgr, cfg)
		},
	}
	serveCmd.Flags().Bool("swagger.enabled", false, "enable swagger UI")

	migrateCmd := &cobra.Command{
		Use:   "migrate",
		Short: "Run database migrations",
	}

	migrateUpCmd := &cobra.Command{
		Use:   "up",
		Short: "Run all pending migrations",
		RunE: func(cmd *cobra.Command, args []string) error {
			v := NewViper()
			BindFlags(v, cmd.Flags())
			cfg := LoadConfig(v)

			db, err := OpenDB(cfg)
			if err != nil {
				return err
			}
			defer db.Close()

			slog.Info("running migrations up")
			if err := migrations.Migrate(db); err != nil {
				return fmt.Errorf("migrate up: %w", err)
			}
			slog.Info("migrations applied")

			return nil
		},
	}

	migrateDownCmd := &cobra.Command{
		Use:   "down",
		Short: "Roll back all applied migrations",
		RunE: func(cmd *cobra.Command, args []string) error {
			v := NewViper()
			BindFlags(v, cmd.Flags())
			cfg := LoadConfig(v)

			db, err := OpenDB(cfg)
			if err != nil {
				return err
			}
			defer db.Close()

			slog.Info("rolling back migrations")
			if err := migrations.Down(db); err != nil {
				return fmt.Errorf("migrate down: %w", err)
			}
			slog.Info("migrations rolled back")

			return nil
		},
	}

	migrateCmd.AddCommand(migrateUpCmd)
	migrateCmd.AddCommand(migrateDownCmd)

	adminCmd := &cobra.Command{
		Use:   "admin",
		Short: "Admin operations",
	}

	createUserCmd := &cobra.Command{
		Use:   "create-user",
		Short: "Create a new user (admin-only)",
		RunE: func(cmd *cobra.Command, args []string) error {
			v := NewViper()
			BindFlags(v, cmd.Flags())
			cfg := LoadConfig(v)

			db, err := OpenDB(cfg)
			if err != nil {
				return err
			}
			defer db.Close()

			sqlxDB := sqlx.NewDb(db, "postgres")
			userStore := identitystorage.NewUserStore(sqlxDB)
			credentialStore := identitystorage.NewCredentialStore(sqlxDB)
			passwordHasher, err := password.NewArgon2id(password.DefaultParams())
			if err != nil {
				return fmt.Errorf("create password hasher: %w", err)
			}
			sessionStore := identitystorage.NewSessionStore(sqlxDB)
			identityService := identity.NewService(identity.Dependencies{
				UserStore:       userStore,
				CredentialStore: credentialStore,
				SessionStore:    sessionStore,
				Hasher:          passwordHasher,
			})
			spaceStore := spacestorage.NewSpaceStore(sqlxDB)
			memberStore := spacestorage.NewMemberStore(sqlxDB)
			spaceService := space.NewService(space.Dependencies{
				SpaceStore:  spaceStore,
				MemberStore: memberStore,
			})
			coordinator := iam.NewCoordinator(iam.Dependencies{
				IdentityService: identityService,
				PasswordHasher:  passwordHasher,
				SpaceService:    spaceService,
			})

			email, _ := cmd.Flags().GetString("email")
			username, _ := cmd.Flags().GetString("username")
			name, _ := cmd.Flags().GetString("name")
			password, _ := cmd.Flags().GetString("password")
			roleStr, _ := cmd.Flags().GetString("role")

			var accessLevel identity.AccessLevel
			switch roleStr {
			case "admin":
				accessLevel = identity.AccessLevelAdmin
			default:
				accessLevel = identity.AccessLevelUser
			}

			req := &iam.AdminCreateUserRequest{
				Email:       email,
				Username:    username,
				Name:        name,
				Password:    password,
				AccessLevel: accessLevel,
			}

			resp, err := coordinator.AdminCreateUser(cmd.Context(), req)
			if err != nil {
				return fmt.Errorf("create user: %w", err)
			}

			slog.Info("user created successfully", "user_id", resp.UserID, "email", resp.Email, "role", resp.AccessLevel, "status", resp.Status)
			fmt.Printf("User created: ID=%s Email=%s Role=%s Status=%s\n", resp.UserID, resp.Email, resp.AccessLevel, resp.Status)

			return nil
		},
	}
	createUserCmd.Flags().String("email", "", "user email (required)")
	createUserCmd.Flags().String("username", "", "username (required)")
	createUserCmd.Flags().String("name", "", "display name (required)")
	createUserCmd.Flags().StringP("password", "p", "", "password (will prompt if empty)")
	createUserCmd.Flags().String("role", "user", "access level: admin or user")
	createUserCmd.MarkFlagRequired("email")
	createUserCmd.MarkFlagRequired("username")
	createUserCmd.MarkFlagRequired("name")

	adminCmd.AddCommand(createUserCmd)
	rootCmd.AddCommand(serveCmd)
	rootCmd.AddCommand(migrateCmd)
	rootCmd.AddCommand(adminCmd)

	backupCmd := &cobra.Command{
		Use:   "backup",
		Short: "Trigger a database backup snapshot and sync metadata",
		RunE: func(cmd *cobra.Command, args []string) error {
			v := NewViper()
			BindFlags(v, cmd.Flags())
			cfg := LoadConfig(v)
			initLogging(cfg)

			store, err := initBackupStorage(cmd.Context(), cfg)
			if err != nil {
				return fmt.Errorf("init storage: %w", err)
			}

			pgConfig := backup.PostgresConfig{
				Host:     cfg.DB.Host,
				Port:     strconv.Itoa(cfg.DB.Port),
				User:     cfg.DB.User,
				Password: cfg.DB.Password,
				Database: cfg.DB.Name,
			}

			mgr := backup.NewPostgresBackupManager(store, pgConfig, cfg.Backup.LocalDir)

			slog.Info("starting database backup snapshot")
			entry, err := mgr.RunBackup(cmd.Context(), "cli_manual")
			if err != nil {
				return fmt.Errorf("backup execution failed: %w", err)
			}

			slog.Info("database backup completed successfully",
				"filename", entry.Filename,
				"size_bytes", entry.SizeBytes,
				"sha256", entry.Sha256,
			)
			fmt.Printf("Backup successful!\nFile: %s\nSize: %d bytes\nSHA256: %s\n",
				entry.Filename, entry.SizeBytes, entry.Sha256)

			return nil
		},
	}
	rootCmd.AddCommand(backupCmd)

	return rootCmd.Execute()
}

func initBackupStorage(ctx context.Context, cfg *Config) (backup.Storage, error) {
	switch cfg.Backup.Driver {
	case "s3":
		if cfg.Backup.S3Bucket == "" {
			return nil, fmt.Errorf("backup.s3_bucket must be set when driver is s3")
		}
		return backup.NewS3Storage(ctx, cfg.Backup.S3Bucket, cfg.Backup.S3Region, cfg.Backup.S3Endpoint)
	default:
		return backup.NewLocalStorage(cfg.Backup.LocalDir)
	}
}

func initLogging(cfg *Config) {
	var handler slog.Handler
	level := logLevels[cfg.Log.Level]
	if cfg.Log.Format == "json" {
		handler = slog.NewJSONHandler(os.Stderr, &slog.HandlerOptions{Level: level})
	} else {
		handler = slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: level})
	}
	slog.SetDefault(slog.New(handler))
}
