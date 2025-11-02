package main

import (
	"net/http"

	"github.com/masterkeysrd/saturn/internal/domain/budget"
)

func main() {
	repo := budget.NewInMemRepository()
	service := budget.NewService(budget.ServiceParams{
		Repository: repo,
	})
	controller := budget.NewController(service)

	mux := http.NewServeMux()

	apiV1Mux := http.NewServeMux()
	controller.RegisterRoutes(apiV1Mux)

	mux.Handle("/api/v1/", http.StripPrefix("/api/v1", apiV1Mux))

	http.ListenAndServe(":3000", mux)
}
