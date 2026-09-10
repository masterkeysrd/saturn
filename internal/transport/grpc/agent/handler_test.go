package agent

import (
	"context"
	"testing"

	agentv1 "github.com/masterkeysrd/saturn/apis/saturn/platform/agent/v1"
	agentapp "github.com/masterkeysrd/saturn/internal/application/agent"
	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	"github.com/masterkeysrd/saturn/internal/platform/agent"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/paging"
	"github.com/masterkeysrd/saturn/internal/transport/grpc/interceptors"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type mockCoordinator struct {
	getSuggestionsFn func(ctx context.Context, spaceID string, purpose string, req *agentapp.SuggestionRequest) (map[string]any, error)
	executeAgentFn   func(ctx context.Context, req agentapp.ExecutionRequest) (string, error)
	createProviderFn func(ctx context.Context, req *agentapp.CreateProviderRequest) (*agent.LLMProvider, error)
	getProviderFn    func(ctx context.Context, spaceID string, id string) (*agent.LLMProvider, error)
	listProvidersFn  func(ctx context.Context, spaceID string) ([]*agent.LLMProvider, error)
	updateProviderFn func(ctx context.Context, req *agentapp.UpdateProviderRequest) (*agent.LLMProvider, error)
	deleteProviderFn func(ctx context.Context, spaceID string, id string) error
	createAgentFn    func(ctx context.Context, req *agentapp.CreateAgentRequest) (*agent.Agent, error)
	getAgentFn       func(ctx context.Context, spaceID string, id string) (*agent.Agent, error)
	listAgentsFn     func(ctx context.Context, spaceID string) ([]*agent.Agent, error)
	updateAgentFn    func(ctx context.Context, req *agentapp.UpdateAgentRequest) (*agent.Agent, error)
	deleteAgentFn    func(ctx context.Context, spaceID string, id string) error
	listRunsFn       func(ctx context.Context, q agent.ListAgentRuns) (*paging.Page[*agent.AgentRun], error)
}

func (m *mockCoordinator) GetSuggestions(ctx context.Context, spaceID string, purpose string, req *agentapp.SuggestionRequest) (map[string]any, error) {
	if m.getSuggestionsFn != nil {
		return m.getSuggestionsFn(ctx, spaceID, purpose, req)
	}
	return nil, nil
}
func (m *mockCoordinator) ExecuteAgent(ctx context.Context, req agentapp.ExecutionRequest) (string, error) {
	if m.executeAgentFn != nil {
		return m.executeAgentFn(ctx, req)
	}
	return "", nil
}
func (m *mockCoordinator) RegisterSuggestionProcessor(purpose string, processor agentapp.SuggestionProcessor) {
}
func (m *mockCoordinator) CreateProvider(ctx context.Context, req *agentapp.CreateProviderRequest) (*agent.LLMProvider, error) {
	if m.createProviderFn != nil {
		return m.createProviderFn(ctx, req)
	}
	name := ""
	spaceID := ""
	if req != nil {
		name = req.Name
		spaceID = req.SpaceID
	}
	return &agent.LLMProvider{ID: "prv_1", SpaceID: spaceID, Name: name}, nil
}
func (m *mockCoordinator) GetProvider(ctx context.Context, spaceID string, id string) (*agent.LLMProvider, error) {
	if m.getProviderFn != nil {
		return m.getProviderFn(ctx, spaceID, id)
	}
	return nil, nil
}
func (m *mockCoordinator) ListProviders(ctx context.Context, spaceID string) ([]*agent.LLMProvider, error) {
	if m.listProvidersFn != nil {
		return m.listProvidersFn(ctx, spaceID)
	}
	return nil, nil
}
func (m *mockCoordinator) UpdateProvider(ctx context.Context, req *agentapp.UpdateProviderRequest) (*agent.LLMProvider, error) {
	if m.updateProviderFn != nil {
		return m.updateProviderFn(ctx, req)
	}
	id := ""
	spaceID := ""
	name := ""
	if req != nil {
		id = req.ID
		spaceID = req.SpaceID
		name = req.Name
	}
	return &agent.LLMProvider{ID: id, SpaceID: spaceID, Name: name}, nil
}
func (m *mockCoordinator) DeleteProvider(ctx context.Context, spaceID string, id string) error {
	if m.deleteProviderFn != nil {
		return m.deleteProviderFn(ctx, spaceID, id)
	}
	return nil
}
func (m *mockCoordinator) CreateAgent(ctx context.Context, req *agentapp.CreateAgentRequest) (*agent.Agent, error) {
	if m.createAgentFn != nil {
		return m.createAgentFn(ctx, req)
	}
	name := ""
	spaceID := ""
	purpose := ""
	if req != nil {
		name = req.Name
		spaceID = req.SpaceID
		purpose = req.Purpose
	}
	return &agent.Agent{ID: "agt_1", SpaceID: spaceID, Name: name, Purpose: purpose}, nil
}
func (m *mockCoordinator) GetAgent(ctx context.Context, spaceID string, id string) (*agent.Agent, error) {
	if m.getAgentFn != nil {
		return m.getAgentFn(ctx, spaceID, id)
	}
	return nil, nil
}
func (m *mockCoordinator) ListAgents(ctx context.Context, spaceID string) ([]*agent.Agent, error) {
	if m.listAgentsFn != nil {
		return m.listAgentsFn(ctx, spaceID)
	}
	return nil, nil
}
func (m *mockCoordinator) UpdateAgent(ctx context.Context, req *agentapp.UpdateAgentRequest) (*agent.Agent, error) {
	if m.updateAgentFn != nil {
		return m.updateAgentFn(ctx, req)
	}
	id := ""
	spaceID := ""
	name := ""
	if req != nil {
		id = req.ID
		spaceID = req.SpaceID
		name = req.Name
	}
	return &agent.Agent{ID: id, SpaceID: spaceID, Name: name}, nil
}
func (m *mockCoordinator) DeleteAgent(ctx context.Context, spaceID string, id string) error {
	if m.deleteAgentFn != nil {
		return m.deleteAgentFn(ctx, spaceID, id)
	}
	return nil
}
func (m *mockCoordinator) ListRuns(ctx context.Context, q agent.ListAgentRuns) (*paging.Page[*agent.AgentRun], error) {
	if m.listRunsFn != nil {
		return m.listRunsFn(ctx, q)
	}
	return &paging.Page[*agent.AgentRun]{}, nil
}

func TestHandler_ErrorPropagation(t *testing.T) {
	t.Run("Missing auth returns Unauthenticated platform error", func(t *testing.T) {
		h := NewHandler(&mockCoordinator{})
		_, err := h.CreateProvider(context.Background(), &agentv1.CreateProviderRequest{Name: "test"})
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

	t.Run("Coordinator NotExist propagates to NotFound gRPC status", func(t *testing.T) {
		mock := &mockCoordinator{
			getProviderFn: func(ctx context.Context, spaceID string, id string) (*agent.LLMProvider, error) {
				return nil, errors.E("application/agent.GetProvider", errors.NotExist, agentapp.ProviderNotFound, "llm provider not found")
			},
		}
		h := NewHandler(mock)
		ctx := auth.WithSpaceID(context.Background(), "spc_1")
		_, err := h.GetProvider(ctx, &agentv1.GetProviderRequest{Id: "prv_missing"})
		if err == nil {
			t.Fatal("expected error, got nil")
		}
		if errors.KindOf(err) != errors.NotExist {
			t.Errorf("expected NotExist kind, got %v", errors.KindOf(err))
		}
		st := interceptors.ToStatus(err)
		if st.Code() != codes.NotFound {
			t.Errorf("expected gRPC code NotFound, got %v", st.Code())
		}
		if status.Convert(interceptors.ToGRPC(err)).Code() != codes.NotFound {
			t.Errorf("expected status.Convert to be NotFound")
		}
	})

	t.Run("Coordinator Exist propagates to AlreadyExists gRPC status", func(t *testing.T) {
		mock := &mockCoordinator{
			createAgentFn: func(ctx context.Context, req *agentapp.CreateAgentRequest) (*agent.Agent, error) {
				return nil, errors.E("application/agent.CreateAgent", errors.Exist, agentapp.AgentExists, "an agent configuration for this purpose already exists")
			},
		}
		h := NewHandler(mock)
		ctx := auth.WithSpaceID(context.Background(), "spc_1")
		_, err := h.CreateAgent(ctx, &agentv1.CreateAgentRequest{Name: "Hyperion", Purpose: "INBOX_PARSER"})
		if err == nil {
			t.Fatal("expected error, got nil")
		}
		if errors.KindOf(err) != errors.Exist {
			t.Errorf("expected Exist kind, got %v", errors.KindOf(err))
		}
		st := interceptors.ToStatus(err)
		if st.Code() != codes.AlreadyExists {
			t.Errorf("expected gRPC code AlreadyExists, got %v", st.Code())
		}
	})
}
