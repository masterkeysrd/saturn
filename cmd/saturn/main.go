package main

import (
	"log/slog"
	"os"
	"time"

	"github.com/masterkeysrd/saturn/cmd/saturn/app"
	"github.com/masterkeysrd/saturn/internal/shutdown"
)

func main() {
	slog.Info("Saturn starting")

	// Create shutdown manager with 10s timeout for the entire shutdown sequence
	mgr := shutdown.New(shutdown.WithTimeout(10 * time.Second))

	// Start signal listener — returns context cancelled on SIGINT/SIGTERM
	ctx, cancel := mgr.Init()
	defer cancel()

	// Defer shutdown execution — catches any panics during shutdown
	defer mgr.Defer()

	if err := app.Execute(ctx, mgr); err != nil {
		slog.Error("server failed", "err", err)
		os.Exit(1)
	}
}
