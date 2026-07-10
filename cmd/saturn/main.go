package main

import (
	"context"
	"log/slog"
	"os"

	"github.com/masterkeysrd/saturn/cmd/saturn/app"
)

func main() {
	slog.Info("Saturn starting")
	if err := app.StartAll(context.Background()); err != nil {
		slog.Error("server failed", "err", err)
		os.Exit(1)
	}
}
