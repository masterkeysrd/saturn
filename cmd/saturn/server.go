package main

import (
	"context"
	"errors"
	"fmt"
	"net/http"

	"github.com/grpc-ecosystem/grpc-gateway/v2/runtime"
	identitypb "github.com/masterkeysrd/saturn/gen/proto/go/saturn/identity/v1"
	tenancypb "github.com/masterkeysrd/saturn/gen/proto/go/saturn/tenancy/v1"
	"github.com/masterkeysrd/saturn/internal/domain/tenancy"
	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	"github.com/masterkeysrd/saturn/internal/pkg/deps"
	"github.com/masterkeysrd/saturn/internal/transport/http/middleware"
)

type MembershipGetter func(context.Context, tenancy.MembershipID) (*tenancy.Membership, error)

type Server struct {
	handler http.Handler
}

type ServerParams struct {
	deps.In

	IdentityServer identitypb.IdentityServer
	TenancyServer  tenancypb.TenancyServer

	TokenManager     auth.TokenManager
	TokenBlacklist   auth.TokenBlacklist
	MembershipGetter MembershipGetter
}

func NewServer(params ServerParams) *Server {
	ctx := context.Background()
	mux := runtime.NewServeMux()

	identitypb.RegisterIdentityHandlerServer(ctx, mux, params.IdentityServer)
	tenancypb.RegisterTenancyHandlerServer(ctx, mux, params.TenancyServer)

	handler := http.NewServeMux()
	handler.Handle("/api/", http.StripPrefix("/api", mux))

	authMiddleware := middleware.NewAuthMiddleware(middleware.AuthMiddlewareConfig{
		ExemptPaths: []string{
			"/api/v1/identity/users",
			"/api/v1/identity/users:login",
			"/api/v1/identity/sessions:refresh",
		},
		TokenParser:      params.TokenManager.Parse,
		BlacklistChecker: params.TokenBlacklist.IsRevoked,
	})
	accessMiddleware := middleware.NewAccessMiddleware(middleware.AccessConfig{
		ExemptPaths: []string{
			"/api/v1/identity/users",
			"/api/v1/identity/users:login",
			"/api/v1/identity/sessions:refresh",
		},
	})
	spaceMiddleware := middleware.NewSpaceMiddleware(middleware.SpaceConfig{
		ExemptPaths: []string{
			"/api/v1/identity/users/*",
			"/api/v1/spaces/*",
		},
		MembershipGetter: params.MembershipGetter,
	})

	var finalHandler http.Handler = handler
	finalHandler = spaceMiddleware.Handler(finalHandler)
	finalHandler = accessMiddleware.Handler(finalHandler)
	finalHandler = authMiddleware.Handler(finalHandler)

	return &Server{
		handler: finalHandler,
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
