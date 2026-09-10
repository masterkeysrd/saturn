package integration

import (
	"context"
	"testing"

	integrationv1 "github.com/masterkeysrd/saturn/apis/saturn/platform/integration/v1"
	integrationapp "github.com/masterkeysrd/saturn/internal/application/integration"
	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/integration"
	"github.com/masterkeysrd/saturn/internal/transport/grpc/interceptors"
	"google.golang.org/grpc/codes"
)

type mockCoordinator struct {
	getFn             func(ctx context.Context, query integration.GetIntegration) (*integration.Integration, error)
	configureFn       func(ctx context.Context, cmd integration.ConfigureIntegration) (*integration.Integration, string, error)
	listFn            func(ctx context.Context, spaceID string) ([]*integration.Integration, error)
	listCatalogFn     func() []integration.Descriptor
	createTokenFn     func(ctx context.Context, query integration.GetIntegration, name string) (*integration.IntegrationToken, string, error)
	listTokensFn      func(ctx context.Context, query integration.GetIntegration) ([]*integration.IntegrationToken, error)
	deleteTokenFn     func(ctx context.Context, query integration.GetIntegration, tokenID string) error
	simulateWebhookFn func(ctx context.Context, spaceID, providerName, kind string, headers map[string][]string, body []byte) (any, error)
}

func (m *mockCoordinator) Get(ctx context.Context, query integration.GetIntegration) (*integration.Integration, error) {
	if m.getFn != nil {
		return m.getFn(ctx, query)
	}
	return nil, nil
}
func (m *mockCoordinator) Configure(ctx context.Context, cmd integration.ConfigureIntegration) (*integration.Integration, string, error) {
	if m.configureFn != nil {
		return m.configureFn(ctx, cmd)
	}
	return &integration.Integration{ID: "int_1"}, "tok_raw", nil
}
func (m *mockCoordinator) List(ctx context.Context, spaceID string) ([]*integration.Integration, error) {
	if m.listFn != nil {
		return m.listFn(ctx, spaceID)
	}
	return nil, nil
}
func (m *mockCoordinator) ListCatalog() []integration.Descriptor {
	if m.listCatalogFn != nil {
		return m.listCatalogFn()
	}
	return nil
}
func (m *mockCoordinator) CreateToken(ctx context.Context, query integration.GetIntegration, name string) (*integration.IntegrationToken, string, error) {
	if m.createTokenFn != nil {
		return m.createTokenFn(ctx, query, name)
	}
	return &integration.IntegrationToken{ID: "tok_1"}, "tok_raw", nil
}
func (m *mockCoordinator) ListTokens(ctx context.Context, query integration.GetIntegration) ([]*integration.IntegrationToken, error) {
	if m.listTokensFn != nil {
		return m.listTokensFn(ctx, query)
	}
	return nil, nil
}
func (m *mockCoordinator) DeleteToken(ctx context.Context, query integration.GetIntegration, tokenID string) error {
	if m.deleteTokenFn != nil {
		return m.deleteTokenFn(ctx, query, tokenID)
	}
	return nil
}
func (m *mockCoordinator) SimulateWebhook(ctx context.Context, spaceID, providerName, kind string, headers map[string][]string, body []byte) (any, error) {
	if m.simulateWebhookFn != nil {
		return m.simulateWebhookFn(ctx, spaceID, providerName, kind, headers, body)
	}
	return nil, nil
}

func TestHandler_ErrorPropagation(t *testing.T) {
	t.Run("Missing auth returns Unauthenticated", func(t *testing.T) {
		h := NewHandler(&mockCoordinator{})
		_, err := h.GetIntegration(context.Background(), &integrationv1.GetIntegrationRequest{Provider: "email"})
		if err == nil {
			t.Fatal("expected error, got nil")
		}
		if errors.KindOf(err) != errors.Unauthenticated {
			t.Errorf("expected Unauthenticated kind, got %v", errors.KindOf(err))
		}
		st := interceptors.ToStatus(err)
		if st.Code() != codes.Unauthenticated {
			t.Errorf("expected gRPC code Unauthenticated, got %v", st.Code())
		}
	})

	t.Run("Missing provider returns Invalid Argument", func(t *testing.T) {
		h := NewHandler(&mockCoordinator{})
		ctx := auth.WithSpaceID(context.Background(), "spc_1")
		_, err := h.GetIntegration(ctx, &integrationv1.GetIntegrationRequest{})
		if err == nil {
			t.Fatal("expected error, got nil")
		}
		if errors.KindOf(err) != errors.Invalid {
			t.Errorf("expected Invalid kind, got %v", errors.KindOf(err))
		}
		st := interceptors.ToStatus(err)
		if st.Code() != codes.InvalidArgument {
			t.Errorf("expected gRPC code InvalidArgument, got %v", st.Code())
		}
	})

	t.Run("Integration not found returns NotFound", func(t *testing.T) {
		mock := &mockCoordinator{
			getFn: func(ctx context.Context, query integration.GetIntegration) (*integration.Integration, error) {
				return nil, nil
			},
		}
		h := NewHandler(mock)
		ctx := auth.WithSpaceID(context.Background(), "spc_1")
		_, err := h.GetIntegration(ctx, &integrationv1.GetIntegrationRequest{Provider: "email"})
		if err == nil {
			t.Fatal("expected error, got nil")
		}
		if errors.KindOf(err) != errors.NotExist {
			t.Errorf("expected NotExist kind, got %v", errors.KindOf(err))
		}
		if errors.CodeOf(err) != integrationapp.IntegrationNotFound {
			t.Errorf("expected IntegrationNotFound code, got %v", errors.CodeOf(err))
		}
		st := interceptors.ToStatus(err)
		if st.Code() != codes.NotFound {
			t.Errorf("expected gRPC code NotFound, got %v", st.Code())
		}
	})
}
