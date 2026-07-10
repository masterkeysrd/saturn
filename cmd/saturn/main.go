package main

import (
	"log/slog"
	"os"

	"github.com/masterkeysrd/saturn/cmd/saturn/app"
)

func main() {
	if err := app.Execute(); err != nil {
		slog.Error("command failed", "err", err)
		os.Exit(1)
	}
}
