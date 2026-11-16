package aigrpc

import (
	"context"
	"testing"
	"time"

	aiv1 "github.com/masterkeysrd/saturn/apis/saturn/platform/ai/v1"
	aiaggregator "github.com/masterkeysrd/saturn/internal/aggregator/ai"
	aiapp "github.com/masterkeysrd/saturn/internal/application/ai"
	"github.com/masterkeysrd/saturn/internal/platform/ai"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/paging"
	"google.golang.org/grpc"
	"google.golang.org/protobuf/types/known/fieldmaskpb"
)

type stubCoordinator struct {
	aiapp.Coordinator
	updateSettingsFn func(context.Context, *aiapp.UpdateSettingsRequest) (ai.Settings, error)
	createProviderFn func(context.Context, *aiapp.CreateProviderRequest) (*ai.Provider, error)
	testProviderFn   func(context.Context, string) (*ai.Provider, error)
	ensureSystemFn   func(context.Context) error
	createMCPFn      func(context.Context, *aiapp.CreateMCPServerRequest) (*ai.MCPServer, error)
	resetAgentFn     func(context.Context, string) (*ai.Agent, error)
	executeAgentFn   func(context.Context, *aiapp.ExecuteAgentRequest) (*ai.Run, error)
	createThreadFn   func(context.Context, *aiapp.CreateThreadRequest) (*ai.Thread, error)
	streamTurnFn     func(context.Context, *aiapp.StreamThreadTurnRequest, ai.StreamEventEmitter) error
	resolveApprFn    func(context.Context, *aiapp.ResolveToolApprovalsRequest, ai.StreamEventEmitter) error
	generateFn       func(context.Context, *aiapp.GenerateRequest) (*ai.Run, error)
}

func (s *stubCoordinator) UpdateSettings(ctx context.Context, req *aiapp.UpdateSettingsRequest) (ai.Settings, error) {
	return s.updateSettingsFn(ctx, req)
}
func (s *stubCoordinator) CreateProvider(ctx context.Context, req *aiapp.CreateProviderRequest) (*ai.Provider, error) {
	return s.createProviderFn(ctx, req)
}
func (s *stubCoordinator) TestProvider(ctx context.Context, id string) (*ai.Provider, error) {
	return s.testProviderFn(ctx, id)
}
func (s *stubCoordinator) EnsureSystemMCPAndAssistant(ctx context.Context) error {
	return s.ensureSystemFn(ctx)
}
func (s *stubCoordinator) CreateMCPServer(ctx context.Context, req *aiapp.CreateMCPServerRequest) (*ai.MCPServer, error) {
	return s.createMCPFn(ctx, req)
}
func (s *stubCoordinator) ResetAgent(ctx context.Context, id string) (*ai.Agent, error) {
	return s.resetAgentFn(ctx, id)
}
func (s *stubCoordinator) ExecuteAgent(ctx context.Context, req *aiapp.ExecuteAgentRequest) (*ai.Run, error) {
	return s.executeAgentFn(ctx, req)
}
func (s *stubCoordinator) CreateThread(ctx context.Context, req *aiapp.CreateThreadRequest) (*ai.Thread, error) {
	return s.createThreadFn(ctx, req)
}
func (s *stubCoordinator) StreamThreadTurn(ctx context.Context, req *aiapp.StreamThreadTurnRequest, emit ai.StreamEventEmitter) error {
	return s.streamTurnFn(ctx, req, emit)
}
func (s *stubCoordinator) ResolveToolApprovals(ctx context.Context, req *aiapp.ResolveToolApprovalsRequest, emit ai.StreamEventEmitter) error {
	return s.resolveApprFn(ctx, req, emit)
}
func (s *stubCoordinator) Generate(ctx context.Context, req *aiapp.GenerateRequest) (*ai.Run, error) {
	return s.generateFn(ctx, req)
}

type stubAggregator struct {
	Aggregator
	getSettingsFn    func(context.Context) (*aiaggregator.SettingsView, error)
	getDescriptorsFn func() []ai.ProviderDescriptor
	getProviderFn    func(context.Context, string) (*aiaggregator.ProviderView, error)
	listMCPServersFn func(context.Context) ([]*ai.MCPServer, error)
	getMCPServerFn   func(context.Context, string) (*ai.MCPServer, error)
	listAgentsFn     func(context.Context) ([]*aiaggregator.AgentView, error)
	getAgentFn       func(context.Context, string) (*aiaggregator.AgentView, error)
	getThreadFn      func(context.Context, string) (*aiaggregator.ThreadView, error)
	listMessagesFn   func(context.Context, ai.ListMessagesFilter) (*paging.Page[*ai.ThreadMessage], error)
	getRunFn         func(context.Context, string) (*aiaggregator.RunView, error)
}

func (s *stubAggregator) GetSettings(ctx context.Context) (*aiaggregator.SettingsView, error) {
	return s.getSettingsFn(ctx)
}
func (s *stubAggregator) GetProviderDescriptors() []ai.ProviderDescriptor {
	return s.getDescriptorsFn()
}
func (s *stubAggregator) GetProvider(ctx context.Context, id string) (*aiaggregator.ProviderView, error) {
	return s.getProviderFn(ctx, id)
}
func (s *stubAggregator) ListMCPServers(ctx context.Context) ([]*ai.MCPServer, error) {
	return s.listMCPServersFn(ctx)
}
func (s *stubAggregator) GetMCPServer(ctx context.Context, id string) (*ai.MCPServer, error) {
	return s.getMCPServerFn(ctx, id)
}
func (s *stubAggregator) ListAgents(ctx context.Context) ([]*aiaggregator.AgentView, error) {
	return s.listAgentsFn(ctx)
}
func (s *stubAggregator) GetAgent(ctx context.Context, id string) (*aiaggregator.AgentView, error) {
	return s.getAgentFn(ctx, id)
}
func (s *stubAggregator) GetThread(ctx context.Context, id string) (*aiaggregator.ThreadView, error) {
	return s.getThreadFn(ctx, id)
}
func (s *stubAggregator) ListThreadMessages(ctx context.Context, filter ai.ListMessagesFilter) (*paging.Page[*ai.ThreadMessage], error) {
	return s.listMessagesFn(ctx, filter)
}
func (s *stubAggregator) GetRun(ctx context.Context, id string) (*aiaggregator.RunView, error) {
	return s.getRunFn(ctx, id)
}

type mockStreamServer struct {
	grpc.ServerStreamingServer[aiv1.ThreadStreamEvent]
	ctx    context.Context
	events []*aiv1.ThreadStreamEvent
}

func (m *mockStreamServer) Context() context.Context { return m.ctx }
func (m *mockStreamServer) Send(ev *aiv1.ThreadStreamEvent) error {
	m.events = append(m.events, ev)
	return nil
}

func TestHandler_SettingsAndProviders(t *testing.T) {
	coord := &stubCoordinator{
		updateSettingsFn: func(_ context.Context, req *aiapp.UpdateSettingsRequest) (ai.Settings, error) {
			return *req.Settings, nil
		},
		createProviderFn: func(_ context.Context, req *aiapp.CreateProviderRequest) (*ai.Provider, error) {
			return &ai.Provider{
				ID:        "prv_1",
				SpaceID:   "spc_1",
				Name:      req.Name,
				Driver:    req.Driver,
				HasSecret: req.Secret.HasCredentials(),
				Status:    ai.ProviderStatus{State: ai.ProviderStateUnverified},
			}, nil
		},
	}
	agg := &stubAggregator{
		getDescriptorsFn: ai.GetProviderCatalog,
		getSettingsFn: func(_ context.Context) (*aiaggregator.SettingsView, error) {
			return &aiaggregator.SettingsView{
				Settings:             ai.DefaultSettings(),
				CurrentMonthSpendUSD: 4.5,
			}, nil
		},
		getProviderFn: func(_ context.Context, id string) (*aiaggregator.ProviderView, error) {
			return &aiaggregator.ProviderView{
				Provider: &ai.Provider{
					ID:        id,
					SpaceID:   "spc_1",
					Name:      "Gemini",
					Driver:    ai.DriverGemini,
					HasSecret: true,
					Status:    ai.ProviderStatus{State: ai.ProviderStateUnverified},
				},
				ModelCount: 3,
			}, nil
		},
	}

	h := NewHandler(coord, agg)

	descs, err := h.ListProviderDescriptors(context.Background(), &aiv1.ListProviderDescriptorsRequest{})
	if err != nil || len(descs.Providers) != 6 {
		t.Fatalf("ListProviderDescriptors() failed: err=%v len=%d", err, len(descs.Providers))
	}

	settingsPB, err := h.UpdateSettings(context.Background(), &aiv1.UpdateSettingsRequest{
		Settings:   &aiv1.Settings{Governance: &aiv1.GovernanceConfig{RunRetentionDays: 30}},
		UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{"governance.run_retention_days"}},
	})
	if err != nil || settingsPB.CurrentMonthSpendUsd != 4.5 {
		t.Fatalf("UpdateSettings() failed: err=%v resp=%+v", err, settingsPB)
	}

	provPB, err := h.CreateProvider(context.Background(), &aiv1.CreateProviderRequest{
		Provider: &aiv1.Provider{
			Name:      "Gemini",
			Driver:    "gemini",
			Secret:    &aiv1.ProviderSecretInput{ApiKey: new("secret-val")},
			IsEnabled: true,
		},
	})
	if err != nil {
		t.Fatalf("CreateProvider() error = %v", err)
	}
	if !provPB.HasSecret || provPB.Secret != nil || provPB.ModelCount != 3 {
		t.Fatalf("expected masked provider response with ModelCount=3, got %+v", provPB)
	}
}

func TestHandler_LazySeedingAndStreams(t *testing.T) {
	seeded := false
	coord := &stubCoordinator{
		ensureSystemFn: func(_ context.Context) error {
			seeded = true
			return nil
		},
		streamTurnFn: func(_ context.Context, req *aiapp.StreamThreadTurnRequest, emit ai.StreamEventEmitter) error {
			emit(ai.ThreadStreamEvent{Type: ai.EventRunStarted, ThreadID: new(req.ThreadID), RunID: new("air_1")})
			emit(ai.ThreadStreamEvent{Type: ai.EventMessageDelta, ThreadID: new(req.ThreadID), Delta: new("Hello")})
			emit(ai.ThreadStreamEvent{Type: ai.EventRunCompleted, ThreadID: new(req.ThreadID), Run: &ai.Run{ID: "air_1", Status: ai.RunCompleted, StartTime: time.Now()}})
			return nil
		},
		resolveApprFn: func(_ context.Context, req *aiapp.ResolveToolApprovalsRequest, emit ai.StreamEventEmitter) error {
			if len(req.Decisions) != 1 || !req.Decisions[0].Approved {
				return errors.E(errors.Invalid, "unexpected decisions")
			}
			emit(ai.ThreadStreamEvent{Type: ai.EventRunCompleted, ThreadID: new(req.ThreadID)})
			return nil
		},
	}
	agg := &stubAggregator{
		listMCPServersFn: func(_ context.Context) ([]*ai.MCPServer, error) {
			return []*ai.MCPServer{ai.SystemSaturnMCPBlueprint("spc_1")}, nil
		},
		getAgentFn: func(_ context.Context, id string) (*aiaggregator.AgentView, error) {
			if !seeded {
				return nil, ai.ErrAgentNotFound
			}
			return &aiaggregator.AgentView{
				Agent: ai.SystemAssistantBlueprint("spc_1", "mcp_1"),
				Stats: &ai.AgentStats{TotalRuns7d: 2},
			}, nil
		},
	}

	h := NewHandler(coord, agg)

	mcpResp, err := h.ListMCPServers(context.Background(), &aiv1.ListMCPServersRequest{})
	if err != nil || !seeded || len(mcpResp.McpServers) != 1 {
		t.Fatalf("ListMCPServers() failed: err=%v seeded=%v", err, seeded)
	}

	seeded = false
	agtResp, err := h.GetAgent(context.Background(), &aiv1.GetAgentRequest{Id: ai.SystemSaturnAssistantKey})
	if err != nil || !seeded || agtResp.Stats.TotalRuns_7D != 2 {
		t.Fatalf("GetAgent(system) failed: err=%v seeded=%v agt=%+v", err, seeded, agtResp)
	}

	stream := &mockStreamServer{ctx: context.Background()}
	if err := h.StreamThreadTurn(&aiv1.StreamThreadTurnRequest{
		Id:      "thr_1",
		Content: "Hi",
	}, stream); err != nil {
		t.Fatalf("StreamThreadTurn() error = %v", err)
	}
	if len(stream.events) != 3 || stream.events[1].GetDelta() != "Hello" {
		t.Fatalf("unexpected stream events: %+v", stream.events)
	}

	resStream := &mockStreamServer{ctx: context.Background()}
	if err := h.StreamResolveToolApprovals(&aiv1.StreamResolveToolApprovalsRequest{
		Id:        "thr_1",
		Decisions: []*aiv1.ToolApprovalDecision{{ToolCallId: "tc_1", Approved: true}},
	}, resStream); err != nil {
		t.Fatalf("StreamResolveToolApprovals() error = %v", err)
	}
	if len(resStream.events) != 1 || resStream.events[0].Type != string(ai.EventRunCompleted) {
		t.Fatalf("unexpected approval stream events: %+v", resStream.events)
	}
}
