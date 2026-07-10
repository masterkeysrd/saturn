package app

import (
	"context"

	"github.com/masterkeysrd/saturn/internal/shutdown"
	"github.com/spf13/cobra"
)

// Execute runs the command tree with the given context and shutdown manager.
func Execute(ctx context.Context, mgr *shutdown.Manager) error {
	rootCmd := &cobra.Command{
		Use: "saturn",
	}

	serveCmd := &cobra.Command{
		Use: "serve",
		RunE: func(cmd *cobra.Command, args []string) error {
			return StartAll(cmd.Context(), mgr)
		},
	}

	rootCmd.AddCommand(serveCmd)
	rootCmd.SetContext(ctx)
	return rootCmd.Execute()
}
