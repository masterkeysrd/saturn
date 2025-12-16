package main

import (
	"context"
	"errors"
	"fmt"
	"net/http"

	"github.com/grpc-ecosystem/grpc-gateway/v2/runtime"
	identitypb "github.com/masterkeysrd/saturn/gen/proto/go/saturn/identity/v1"
	"github.com/masterkeysrd/saturn/internal/pkg/deps"
)

type Server struct {
	handler http.Handler
}

type ServerParams struct {
	deps.In

	IdentityServer identitypb.IdentityServer
}

func NewServer(params ServerParams) *Server {
	ctx := context.Background()
	mux := runtime.NewServeMux()

	identitypb.RegisterIdentityHandlerServer(ctx, mux, params.IdentityServer)

	handler := http.NewServeMux()
	handler.Handle("/api/", http.StripPrefix("/api", mux))

	return &Server{
		handler: handler,
	}
}

func (s *Server) Start() error {
	srv := &http.Server{
		Addr:    ":3000",
		Handler: s.handler,
	}

	if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		return fmt.Errorf("failed to start HTTP server: %w", err)
	}

	return nil
}

// func (s *Server) cors(handler http.Handler) http.Handler {
// 	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
// 		w.Header().Set("Access-Control-Allow-Origin", "*")
// 		w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, PATCH, DELETE")
// 		w.Header().Set("Access-Control-Allow-Headers", "Accept, Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization")
//
// 		if r.Method == http.MethodOptions {
// 			w.WriteHeader(http.StatusOK)
// 			return
// 		}
//
// 		handler.ServeHTTP(w, r)
// 	})
// }
