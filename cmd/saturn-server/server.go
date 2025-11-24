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

	handler := s.handler
	handler = s.cors(handler)
	if err := http.ListenAndServe(":3000", handler); err != nil && !errors.Is(err, http.ErrServerClosed) {
		return fmt.Errorf("server error: %w", err)
	}

	return nil
}

func (s *Server) cors(handler http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, PATCH, DELETE")
		w.Header().Set("Access-Control-Allow-Headers", "Accept, Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}

		handler.ServeHTTP(w, r)
	})
}
