package app

import (
	"log/slog"
	"os"

	"github.com/masterkeysrd/saturn/internal/shutdown"
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

			mgr := shutdown.New(shutdown.WithTimeout(cfg.Shutdown.Timeout))
			ctx, cancel := mgr.Init()
			defer cancel()
			defer mgr.Defer()

			slog.SetDefault(slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: logLevels[cfg.Log.Level]})))

			return StartAll(ctx, mgr, cfg)
		},
	}

	rootCmd.AddCommand(serveCmd)
	return rootCmd.Execute()
}
