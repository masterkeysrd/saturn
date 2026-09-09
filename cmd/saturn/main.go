package main

import (
	"context"
	"os"

	"github.com/masterkeysrd/saturn/cmd/saturn/app"
	"github.com/masterkeysrd/saturn/internal/platform/log"
)

func main() {
	if err := app.Execute(); err != nil {
		log.Error(context.Background(), "command failed", log.Err(err))
		os.Exit(1)
	}
}
