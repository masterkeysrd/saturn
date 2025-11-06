package main

import (
	"fmt"
	"log/slog"

	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/pkg/deps"
	financeinmem "github.com/masterkeysrd/saturn/internal/storage/inmem/finance"
	"github.com/masterkeysrd/saturn/internal/transport/financehttp"
)

func main() {
	c, err := buildContainer()
	if err != nil {
		slog.Error("failed to build di container", slog.Any("error", err))
		return
	}

	err = c.Invoke(func(s *Server) error {
		return s.Start()
	})
	if err != nil {
		slog.Error("error starting application", slog.Any("error", err))
		return
	}
}

func buildContainer() (deps.Container, error) {
	container := deps.NewDigContainer()

	// Storage
	err := deps.Register(container,
		financeinmem.Provide,
	)
	if err != nil {
		return nil, fmt.Errorf("cannot register storage providers: %w", err)
	}

	// Domain Providers
	if err := deps.Register(container, finance.RegisterProviders); err != nil {
		return nil, fmt.Errorf("cannot register domain providers: %w", err)
	}

	// Transport Providers
	if err := deps.Register(container, financehttp.RegisterProviders); err != nil {
		return nil, fmt.Errorf("cannot register transport providers: %w", err)
	}

	// Provide the Server
	if err := container.Provide(NewServer); err != nil {
		return nil, fmt.Errorf("cannot provide server: %w", err)
	}

	return container, nil
}
