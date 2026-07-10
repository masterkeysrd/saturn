package app

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"

	"golang.org/x/sync/errgroup"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"

	identityv1 "github.com/masterkeysrd/saturn/apis/saturn/identity/v1"
	"github.com/masterkeysrd/saturn/internal/shutdown"
)

// GRPCServer manages the standalone gRPC server listening on a Unix socket.
type GRPCServer struct {
	listener net.Listener
	grpc     *grpc.Server
}

// NewGRPCServer creates a new GRPCServer instance.
func NewGRPCServer(cfg *Config) *GRPCServer {
	return &GRPCServer{}
}

// Start initializes the gRPC server, registers the Identity service, and
// begins listening on the configured Unix socket.
func (s *GRPCServer) Start(ctx context.Context, cfg *Config) error {
	if err := os.Remove(cfg.GRPC.Socket); err != nil && !os.IsNotExist(err) {
		slog.Warn("failed to remove stale socket file", "path", cfg.GRPC.Socket, "err", err)
	}

	var err error
	s.listener, err = net.Listen("unix", cfg.GRPC.Socket)
	if err != nil {
		return fmt.Errorf("listen unix: %w", err)
	}

	s.grpc = grpc.NewServer()
	identityv1.RegisterIdentityServer(s.grpc, &identityHandler{})
	return nil
}

// Shutdown gracefully stops the gRPC server.
func (s *GRPCServer) Shutdown(ctx context.Context) error {
	s.grpc.GracefulStop()
	slog.Info("gRPC server stopped")
	return nil
}

// identityHandler implements the IdentityServer interface.
type identityHandler struct{}

func (*identityHandler) LoginUser(ctx context.Context, req *identityv1.LoginUserRequest) (*identityv1.LoginUserResponse, error) {
	return nil, nil
}

// GRPCGatewayServer manages the gRPC-Gateway HTTP server that proxies
// REST calls into the gRPC backend over a Unix socket.
type GRPCGatewayServer struct {
	addr     string
	mux      *http.ServeMux
	client   identityv1.IdentityClient
	grpcConn *grpc.ClientConn
	server   *http.Server
}

// NewGRPCGatewayServer creates a new GRPCGatewayServer instance.
func NewGRPCGatewayServer(cfg *Config) *GRPCGatewayServer {
	return &GRPCGatewayServer{addr: cfg.Gateway.Addr}
}

// Start connects to the gRPC backend via Unix socket, sets up the gateway
// mux, and starts the HTTP server.
func (s *GRPCGatewayServer) Start(ctx context.Context, cfg *Config) error {
	conn, err := grpc.NewClient("unix:"+cfg.GRPC.Socket,
		grpc.WithTransportCredentials(insecure.NewCredentials()),
	)
	if err != nil {
		return fmt.Errorf("dial gRPC backend: %w", err)
	}
	s.grpcConn = conn
	s.client = identityv1.NewIdentityClient(conn)
	s.mux = http.NewServeMux()

	// Gateway handler: proxy identity calls to the gRPC backend.
	s.mux.HandleFunc("POST /api/v1/identity/login", func(w http.ResponseWriter, r *http.Request) {
		var req identityv1.LoginUserRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		resp, err := s.client.LoginUser(r.Context(), &req)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	})

	s.server = &http.Server{Addr: s.addr, Handler: s.mux}
	return nil
}

// Shutdown gracefully stops the HTTP server and closes the gRPC connection.
func (s *GRPCGatewayServer) Shutdown(ctx context.Context) error {
	if err := s.server.Shutdown(ctx); err != nil {
		return err
	}
	s.grpcConn.Close()
	slog.Info("gRPC-Gateway server stopped")
	return nil
}

// StartAll starts both gRPC and gRPC-Gateway servers and waits for a
// shutdown signal before gracefully tearing them down.
func StartAll(ctx context.Context, mgr *shutdown.Manager, cfg *Config) error {
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	grpcSrv := NewGRPCServer(cfg)
	gwSrv := NewGRPCGatewayServer(cfg)

	// Register shutdown callbacks (LIFO order: gateway first, then gRPC).
	mgr.Register(grpcSrv.Shutdown)
	mgr.Register(gwSrv.Shutdown)

	if err := grpcSrv.Start(ctx, cfg); err != nil {
		return fmt.Errorf("grpc: %w", err)
	}
	if err := gwSrv.Start(ctx, cfg); err != nil {
		return fmt.Errorf("gateway: %w", err)
	}

	g, _ := errgroup.WithContext(ctx)
	g.Go(func() error {
		slog.Info("gRPC server starting", "socket", cfg.GRPC.Socket)
		if err := grpcSrv.grpc.Serve(grpcSrv.listener); err != nil && err != grpc.ErrServerStopped {
			return fmt.Errorf("grpc: %w", err)
		}
		return nil
	})

	g.Go(func() error {
		slog.Info("gRPC-Gateway server starting", "addr", gwSrv.addr)
		if err := gwSrv.server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			return fmt.Errorf("gateway: %w", err)
		}
		return nil
	})

	if err := g.Wait(); err != nil {
		slog.Error("server stopped", "err", err)
	}
	slog.Info("all servers stopped")
	return nil
}
