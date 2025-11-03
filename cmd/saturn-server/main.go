package main

import (
	"fmt"
	"log/slog"
	"net/http"

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

	err = c.Invoke(func(app *finance.Application) {
		// app.CreateBudget(context.Background(), &finance.Budget{})
		budgetController := financehttp.NewController(app)

		mux := http.NewServeMux()

		apiV1Mux := http.NewServeMux()
		budgetController.RegisterRoutes(apiV1Mux)

		mux.Handle("/api/v1/", http.StripPrefix("/api/v1", apiV1Mux))

		http.ListenAndServe(":3000", mux)
	})
	if err != nil {
		slog.Error("error starting application", slog.Any("error", err))
		return
	}
	// repo := budget.NewInMemRepository()
	// service := budget.NewService(budget.ServiceParams{
	// 	Repository: repo,
	// })
	// controller := budget.NewController(service)
	//
	// mux := http.NewServeMux()
	//
	// apiV1Mux := http.NewServeMux()
	// controller.RegisterRoutes(apiV1Mux)
	//
	// mux.Handle("/api/v1/", http.StripPrefix("/api/v1", apiV1Mux))
	//
	// http.ListenAndServe(":3000", mux)
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

	return container, nil
}
