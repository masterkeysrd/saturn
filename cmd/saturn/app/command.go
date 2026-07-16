package app

import (
	"fmt"
	"log/slog"
	"os"

	"github.com/masterkeysrd/saturn/internal/application/iam"
	"github.com/masterkeysrd/saturn/internal/domain/identity"
	identitystorage "github.com/masterkeysrd/saturn/internal/domain/identity/storage"
	"github.com/masterkeysrd/saturn/internal/shutdown"
	"github.com/masterkeysrd/saturn/migrations"
	"github.com/jmoiron/sqlx"
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
			slog.Info("config loaded", "config", cfg)

			mgr := shutdown.New(shutdown.WithTimeout(cfg.Shutdown.Timeout))
			ctx, cancel := mgr.Init()
			defer cancel()
			defer mgr.Defer()

			slog.SetDefault(slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: logLevels[cfg.Log.Level]})))

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
			identityService := identity.NewService(identity.Dependencies{
				UserStore:       userStore,
				CredentialStore: credentialStore,
			})
			coordinator := iam.NewCoordinator(identityService)

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
	return rootCmd.Execute()
}
