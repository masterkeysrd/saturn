package app

import (
	"fmt"
	"log/slog"
	"os"

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

	rootCmd.AddCommand(serveCmd)
	rootCmd.AddCommand(migrateCmd)
	return rootCmd.Execute()
}
