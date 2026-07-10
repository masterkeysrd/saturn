package app

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"golang.org/x/sync/errgroup"

	identityv1 "github.com/masterkeysrd/saturn/apis/saturn/identity/v1"
)

const (
	grpcUnixSocketPath = "/tmp/saturn-identity.sock"
)

// GRPCServer manages the standalone gRPC server listening on a Unix socket.
type GRPCServer struct {
	listener net.Listener
	grpc     *grpc.Server
}

// NewGRPCServer creates a new GRPCServer instance.
func NewGRPCServer() *GRPCServer {
	return &GRPCServer{}
}

// Start initializes the gRPC server, registers the Identity service, and
// begins listening on the configured Unix socket.
func (s *GRPCServer) Start(ctx context.Context) error {
	if err := os.Remove(grpcUnixSocketPath); err != nil && !os.IsNotExist(err) {
		slog.Warn("failed to remove stale socket file", "path", grpcUnixSocketPath, "err", err)
	}

	var err error
	s.listener, err = net.Listen("unix", grpcUnixSocketPath)
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
func NewGRPCGatewayServer() *GRPCGatewayServer {
	return &GRPCGatewayServer{addr: ":8080"}
}

// Start connects to the gRPC backend via Unix socket, sets up the gateway
// mux, and starts the HTTP server.
func (s *GRPCGatewayServer) Start(ctx context.Context) error {
	conn, err := grpc.NewClient("unix:"+grpcUnixSocketPath,
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
func StartAll(ctx context.Context) error {
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	grpcSrv := NewGRPCServer()
	gwSrv := NewGRPCGatewayServer()

	if err := grpcSrv.Start(ctx); err != nil {
		return fmt.Errorf("grpc: %w", err)
	}
	if err := gwSrv.Start(ctx); err != nil {
		return fmt.Errorf("gateway: %w", err)
	}

	g, ctx := errgroup.WithContext(ctx)

	g.Go(func() error {
		slog.Info("gRPC server starting", "socket", grpcUnixSocketPath)
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

	shutdownCtx, done := context.WithTimeout(context.Background(), 10*time.Second)
	defer done()

	if err := grpcSrv.Shutdown(shutdownCtx); err != nil {
		slog.Error("grpc shutdown error", "err", err)
	}
	if err := gwSrv.Shutdown(shutdownCtx); err != nil {
		slog.Error("gateway shutdown error", "err", err)
	}
	slog.Info("all servers stopped")
	return nil
}
