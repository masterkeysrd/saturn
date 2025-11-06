package main

import (
	"errors"
	"fmt"
	"net/http"

	"github.com/masterkeysrd/saturn/internal/pkg/deps"
	"github.com/masterkeysrd/saturn/internal/pkg/httprouter"
	"github.com/masterkeysrd/saturn/internal/transport/financehttp"
)

type Server struct {
	handler http.Handler
}

type ServerParams struct {
	deps.In

	FinanceRouter *financehttp.Router
}

func NewServer(params ServerParams) *Server {
	routers := []httprouter.RoutesRegister{
		params.FinanceRouter,
	}

	mux := http.NewServeMux()

	apiV1Mux := http.NewServeMux()
	mux.Handle("/api/v1/", http.StripPrefix("/api/v1", apiV1Mux))

	for _, router := range routers {
		router.RegisterRoutes(apiV1Mux)
	}

	return &Server{
		handler: mux,
	}
}

func (s *Server) Start() error {
	if s.handler == nil {
		return errors.New("server handle is not initalize, call the NewServer function")
	}

	if err := http.ListenAndServe(":3000", s.handler); err != nil && !errors.Is(err, http.ErrServerClosed) {
		return fmt.Errorf("server error: %w", err)
	}

	return nil
}
