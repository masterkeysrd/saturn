package integration

import (
	"context"
	"testing"

	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/integration"
	"github.com/masterkeysrd/saturn/internal/platform/log"
)

type mockProvider struct {
	provider   string
	kind       string
	simulateFn func(ctx context.Context, spaceID string, headers map[string][]string, body []byte) (any, error)
}

func (m *mockProvider) Provider() string                   { return m.provider }
func (m *mockProvider) Kind() string                       { return m.kind }
func (m *mockProvider) Descriptor() integration.Descriptor { return integration.Descriptor{} }
func (m *mockProvider) Verify(ctx context.Context, headers map[string][]string, body []byte) error {
	return nil
}
func (m *mockProvider) Process(ctx context.Context, headers map[string][]string, body []byte) error {
	return nil
}
func (m *mockProvider) Simulate(ctx context.Context, spaceID string, headers map[string][]string, body []byte) (any, error) {
	if m.simulateFn != nil {
		return m.simulateFn(ctx, spaceID, headers, body)
	}
	return map[string]any{"simulated": true}, nil
}

type nonSimulatingProvider struct {
	provider string
	kind     string
}

func (m *nonSimulatingProvider) Provider() string                   { return m.provider }
func (m *nonSimulatingProvider) Kind() string                       { return m.kind }
func (m *nonSimulatingProvider) Descriptor() integration.Descriptor { return integration.Descriptor{} }
func (m *nonSimulatingProvider) Verify(ctx context.Context, headers map[string][]string, body []byte) error {
	return nil
}
func (m *nonSimulatingProvider) Process(ctx context.Context, headers map[string][]string, body []byte) error {
	return nil
}

func TestCoordinator_SimulateWebhook(t *testing.T) {
	ctx := context.Background()

	t.Run("Provider not found returns NotExist", func(t *testing.T) {
		reg := integration.NewRegistry(nil)
		coord := NewCoordinator(Dependencies{Registry: reg})
		_, err := coord.SimulateWebhook(ctx, "spc_1", "missing_provider", "kind", nil, nil)
		if err == nil {
			t.Fatal("expected error, got nil")
		}
		if errors.KindOf(err) != errors.NotExist {
			t.Errorf("expected NotExist kind, got %v", errors.KindOf(err))
		}
		if errors.CodeOf(err) != ProviderNotFound {
			t.Errorf("expected ProviderNotFound code, got %v", errors.CodeOf(err))
		}
	})

	t.Run("Provider does not support simulation returns Invalid", func(t *testing.T) {
		reg := integration.NewRegistry(nil)
		reg.Register(&nonSimulatingProvider{provider: "webhook", kind: "raw"})
		coord := NewCoordinator(Dependencies{Registry: reg})
		_, err := coord.SimulateWebhook(ctx, "spc_1", "webhook", "raw", nil, nil)
		if err == nil {
			t.Fatal("expected error, got nil")
		}
		if errors.KindOf(err) != errors.Invalid {
			t.Errorf("expected Invalid kind, got %v", errors.KindOf(err))
		}
		if errors.CodeOf(err) != SimulationNotSupported {
			t.Errorf("expected SimulationNotSupported code, got %v", errors.CodeOf(err))
		}
	})

	t.Run("Provider simulation succeeds", func(t *testing.T) {
		reg := integration.NewRegistry(nil)
		reg.Register(&mockProvider{provider: "email", kind: "transaction_ingestion"})
		coord := NewCoordinator(Dependencies{Registry: reg})
		res, err := coord.SimulateWebhook(ctx, "spc_1", "email", "transaction_ingestion", nil, []byte("{}"))
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		m, ok := res.(map[string]any)
		if !ok || m["simulated"] != true {
			t.Errorf("unexpected simulation result: %+v", res)
		}
	})
}

func TestCoordinator_LoggingDecorator(t *testing.T) {
	reg := integration.NewRegistry(nil)
	coord := NewCoordinator(Dependencies{Registry: reg})
	logger := log.New()
	logged := NewLoggingCoordinator(coord, logger)

	list := logged.ListCatalog()
	if list == nil {
		t.Error("expected non-nil catalog list")
	}
}
