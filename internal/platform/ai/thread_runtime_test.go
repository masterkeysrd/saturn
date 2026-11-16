package ai

import (
	"context"
	"fmt"
	"slices"
	"sync"
	"testing"
	"time"

	"github.com/masterkeysrd/loom/message"
	"github.com/masterkeysrd/loom/tool"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/paging"
	"github.com/masterkeysrd/saturn/internal/platform/settings"
)

type memThreadHarness struct {
	mu       sync.Mutex
	thread   *Thread
	messages []*ThreadMessage
	runs     map[string]*Run
	steps    []*RunStep
	now      time.Time
}

func newMemThreadHarness(t *testing.T, initialThread *Thread, invoker *ModelInvokerMock, mcpConn *MCPConnectorMock) (*ThreadRuntime, *memThreadHarness) {
	t.Helper()

	if mcpConn == nil || mcpConn.ConnectToolsFunc == nil {
		mcpConn = &MCPConnectorMock{
			ConnectToolsFunc: func(_ context.Context, _ *MCPServer, _ []string) (*ConnectedMCPTools, error) {
				return &ConnectedMCPTools{Close: func() {}}, nil
			},
		}
	}

	h := &memThreadHarness{
		thread: initialThread,
		runs:   make(map[string]*Run),
		now:    time.Date(2026, 4, 15, 12, 0, 0, 0, time.UTC),
	}

	provStore := &ProviderStoreMock{
		GetFunc: func(_ context.Context, _, id string) (*Provider, error) {
			return &Provider{ID: id, SpaceID: "spc_1", Driver: DriverOpenAI, IsEnabled: true}, nil
		},
	}
	modelStore := &ModelStoreMock{
		GetFunc: func(_ context.Context, _, id string) (*Model, error) {
			return &Model{
				ID: id, SpaceID: "spc_1", ProviderID: "prv_1", ModelID: "gpt-4.1", IsEnabled: true,
				Profile: ModelProfile{
					Capabilities: ModelCapabilities{ToolCalling: true, Vision: true},
					Limits:       ModelLimits{ContextWindow: 128000, MaxOutputTokens: 8192},
				},
			}, nil
		},
	}
	mcpStore := &MCPServerStoreMock{
		GetFunc: func(_ context.Context, _, id string) (*MCPServer, error) {
			return &MCPServer{
				ID: id, SpaceID: "spc_1", Slug: "saturn", Name: "Saturn Workspace",
				Transport: TransportInMemory, Config: MCPServerConfig{TrustReadHints: true}, IsEnabled: true,
			}, nil
		},
	}
	agentStore := &AgentStoreMock{
		GetFunc: func(_ context.Context, _, id string) (*Agent, error) {
			return &Agent{
				ID: "agt_saturn", SpaceID: "spc_1", SystemKey: new(SystemSaturnAssistantKey),
				Slug: "saturn-assistant", Name: "Saturn Assistant", IsEnabled: true,
				Config: AgentConfig{
					SystemInstruction: new("Help the user."),
					Execution:         ExecutionConfig{ApprovalPolicy: ApprovalConfirmWrites, MaxSteps: 10, TimeoutSeconds: 60},
					MCPBindings:       []MCPBinding{{MCPServerID: "mcp_saturn", AllowedTools: []string{"*"}}},
				},
			}, nil
		},
	}
	threadStore := &ThreadStoreMock{
		GetFunc: func(_ context.Context, spaceID, userID, id string) (*Thread, error) {
			h.mu.Lock()
			defer h.mu.Unlock()
			if h.thread == nil || h.thread.SpaceID != spaceID || h.thread.UserID != userID || h.thread.ID != id {
				return nil, ErrThreadNotFound
			}
			cp := *h.thread
			cp.State.PendingApprovals = slices.Clone(h.thread.State.PendingApprovals)
			return &cp, nil
		},
		UpdateFunc: func(_ context.Context, th *Thread) error {
			h.mu.Lock()
			defer h.mu.Unlock()
			cp := *th
			cp.State.PendingApprovals = slices.Clone(th.State.PendingApprovals)
			h.thread = &cp
			return nil
		},
		AppendMessageFunc: func(_ context.Context, spaceID, _ string, msg *ThreadMessage) error {
			h.mu.Lock()
			defer h.mu.Unlock()
			if msg.ID == "" {
				msg.ID = fmt.Sprintf("aim_%d", len(h.messages)+1)
			}
			msg.Seq = int32(len(h.messages) + 1)
			msg.SpaceID = spaceID
			h.messages = append(h.messages, msg)
			h.thread.MessageCount = int32(len(h.messages))
			return nil
		},
		ListMessagesFunc: func(_ context.Context, _ ListMessagesFilter) (*paging.Page[*ThreadMessage], error) {
			h.mu.Lock()
			defer h.mu.Unlock()
			return &paging.Page[*ThreadMessage]{Items: slices.Clone(h.messages)}, nil
		},
	}
	runStore := &RunStoreMock{
		CreateFunc: func(_ context.Context, r *Run) error {
			h.mu.Lock()
			defer h.mu.Unlock()
			if r.ID == "" {
				r.ID = fmt.Sprintf("air_%d", len(h.runs)+1)
			}
			h.runs[r.ID] = r
			return nil
		},
		GetFunc: func(_ context.Context, _, id string) (*Run, error) {
			h.mu.Lock()
			defer h.mu.Unlock()
			r, ok := h.runs[id]
			if !ok {
				return nil, ErrRunNotFound
			}
			return r, nil
		},
		UpdateFunc: func(_ context.Context, r *Run) error {
			h.mu.Lock()
			defer h.mu.Unlock()
			h.runs[r.ID] = r
			return nil
		},
		AppendStepFunc: func(_ context.Context, step *RunStep) error {
			h.mu.Lock()
			defer h.mu.Unlock()
			h.steps = append(h.steps, step)
			return nil
		},
	}

	store := &StoreMock{
		ProvidersFunc:  func() ProviderStore { return provStore },
		ModelsFunc:     func() ModelStore { return modelStore },
		MCPServersFunc: func() MCPServerStore { return mcpStore },
		AgentsFunc:     func() AgentStore { return agentStore },
		ThreadsFunc:    func() ThreadStore { return threadStore },
		RunsFunc:       func() RunStore { return runStore },
	}
	settingsReader := &SettingsReaderMock{
		GetOrDefaultFunc: func(_ context.Context, _ string, _ Settings) (*settings.Entry[Settings], error) {
			return &settings.Entry[Settings]{
				Value: Settings{Models: ModelRoleSettings{DefaultModelID: new("mdl_default")}},
			}, nil
		},
	}

	rt := NewRuntime(RuntimeDependencies{
		Store:    store,
		Invoker:  invoker,
		MCP:      mcpConn,
		Settings: settingsReader,
		NowFunc:  func() time.Time { return h.now },
	})
	return NewThreadRuntime(rt), h
}

func TestThreadRuntime_StreamTurn_ReadAutoRunAndWriteApprovalLifecycle(t *testing.T) {
	readTool, _ := tool.New("finance_list_accounts", "List Accounts", "Read accounts", func(_ context.Context, _ struct{}) (map[string]any, error) {
		return map[string]any{"accounts": 2}, nil
	})
	writeExecuted := false
	writeTool, _ := tool.New("finance_create_transaction", "Create Transaction", "Create txn", func(_ context.Context, _ map[string]any) (map[string]any, error) {
		writeExecuted = true
		return map[string]any{"id": "txn_99"}, nil
	})

	mcpConn := &MCPConnectorMock{
		ConnectToolsFunc: func(_ context.Context, _ *MCPServer, _ []string) (*ConnectedMCPTools, error) {
			return &ConnectedMCPTools{
				Tools: []*BoundMCPTool{
					{MCPServerID: "mcp_saturn", MCPServerName: "Saturn Workspace", OriginalToolName: "finance_list_accounts", Tool: readTool, ReadOnlyHint: true},
					{MCPServerID: "mcp_saturn", MCPServerName: "Saturn Workspace", OriginalToolName: "finance_create_transaction", Tool: writeTool, ReadOnlyHint: false, DestructiveHint: false},
				},
				Close: func() {},
			}, nil
		},
	}

	var streamTurn int
	inv := &ModelInvokerMock{
		StreamFunc: func(_ context.Context, req InvokeRequest, cb StreamCallbacks) (*message.Assistant, error) {
			streamTurn++
			switch streamTurn {
			case 1:
				cb.OnThinkingDelta("Checking accounts first.")
				return &message.Assistant{
					Content: message.Content{
						&message.ThinkingBlock{Thinking: "Checking accounts first."},
						&message.ToolCall{ID: "tc_read", Name: "finance_list_accounts", Args: map[string]any{}},
					},
				}, nil
			case 2:
				return &message.Assistant{
					Content: message.Content{
						&message.ToolCall{ID: "tc_write", Name: "finance_create_transaction", Args: map[string]any{"amount": 500}},
					},
				}, nil
			default:
				cb.OnTextDelta("Done! Logged your expense.")
				return &message.Assistant{
					Content: message.Content{&message.TextBlock{Text: "Done! Logged your expense."}},
				}, nil
			}
		},
		InvokeFunc: func(_ context.Context, _ InvokeRequest) (*message.Assistant, error) {
			return &message.Assistant{
				Content: message.Content{&message.TextBlock{Text: "Log Coffee Expense"}},
			}, nil
		},
	}

	tr, h := newMemThreadHarness(t, &Thread{
		ID:      "thr_1",
		SpaceID: "spc_1",
		UserID:  "usr_1",
		Title:   "New Chat",
		Status:  ThreadIdle,
	}, inv, mcpConn)

	var events []ThreadStreamEvent
	err := tr.StreamTurn(context.Background(), StreamTurnRequest{
		SpaceID:  "spc_1",
		UserID:   "usr_1",
		ThreadID: "thr_1",
		Content:  "Check accounts and log $5 coffee",
	}, func(ev ThreadStreamEvent) {
		events = append(events, ev)
	})
	if err != nil {
		t.Fatalf("StreamTurn failed: %v", err)
	}
	if writeExecuted {
		t.Fatal("mutating tool must NOT execute before user approval under confirm_writes")
	}
	if h.thread.Status != ThreadAwaitingApproval || len(h.thread.State.PendingApprovals) != 1 || h.thread.State.PendingApprovals[0].ToolCallID != "tc_write" {
		t.Fatalf("expected thread awaiting_approval with tc_write, got status=%s pending=%+v", h.thread.Status, h.thread.State.PendingApprovals)
	}

	hasApprovalEvent := false
	for _, ev := range events {
		if ev.Type == EventToolApprovalRequired {
			hasApprovalEvent = true
		}
	}
	if !hasApprovalEvent {
		t.Error("expected EventToolApprovalRequired emitted")
	}

	// Resume with approval -> executes write tool and finishes turn
	var resumeEvents []ThreadStreamEvent
	err = tr.ResolveApprovals(context.Background(), ResolveApprovalsRequest{
		SpaceID:   "spc_1",
		UserID:    "usr_1",
		ThreadID:  "thr_1",
		Decisions: []ToolApprovalDecision{{ToolCallID: "tc_write", Approved: true}},
	}, func(ev ThreadStreamEvent) {
		resumeEvents = append(resumeEvents, ev)
	})
	if err != nil {
		t.Fatalf("ResolveApprovals failed: %v", err)
	}
	if !writeExecuted {
		t.Fatal("expected mutating tool to execute after approval")
	}
	if h.thread.Status != ThreadIdle || len(h.thread.State.PendingApprovals) != 0 {
		t.Errorf("expected thread idle with cleared pending approvals, got status=%s pending=%+v", h.thread.Status, h.thread.State.PendingApprovals)
	}

	// Verify rejection records declined ToolResult block and resumes cleanly
	streamTurn = 1 // Next turn proposes tc_write again
	if err := tr.StreamTurn(context.Background(), StreamTurnRequest{
		SpaceID:  "spc_1",
		UserID:   "usr_1",
		ThreadID: "thr_1",
		Content:  "Try again",
	}, nil); err != nil {
		t.Fatalf("second StreamTurn failed: %v", err)
	}
	writeExecuted = false
	if err := tr.ResolveApprovals(context.Background(), ResolveApprovalsRequest{
		SpaceID:   "spc_1",
		UserID:    "usr_1",
		ThreadID:  "thr_1",
		Decisions: []ToolApprovalDecision{{ToolCallID: "tc_write", Approved: false}},
	}, nil); err != nil {
		t.Fatalf("ResolveApprovals reject failed: %v", err)
	}
	if writeExecuted {
		t.Fatal("rejected tool must NOT execute")
	}
	lastToolMsg := h.messages[len(h.messages)-2]
	if lastToolMsg.Role != RoleTool || lastToolMsg.Blocks[0].IsError == nil || !*lastToolMsg.Blocks[0].IsError {
		t.Errorf("expected declined ToolResult with IsError=true, got %+v", lastToolMsg)
	}
}

func TestThreadRuntime_StaleApprovalCleanup_OrphanRecovery_Attachments_And_Compaction(t *testing.T) {
	t.Run("stale approval cleanup + orphaned streaming lock recovery + attachments", func(t *testing.T) {
		inv := &ModelInvokerMock{
			StreamFunc: func(_ context.Context, req InvokeRequest, cb StreamCallbacks) (*message.Assistant, error) {
				cb.OnTextDelta("Got your CSV.")
				return &message.Assistant{
					Content: message.Content{&message.TextBlock{Text: "Got your CSV."}},
				}, nil
			},
			InvokeFunc: func(_ context.Context, _ InvokeRequest) (*message.Assistant, error) {
				return &message.Assistant{
					Content: message.Content{&message.TextBlock{Text: "CSV Summary"}},
				}, nil
			},
		}

		// Orphaned streaming lock older than 90s + stale pending approval
		tr, h := newMemThreadHarness(t, &Thread{
			ID:         "thr_stale",
			SpaceID:    "spc_1",
			UserID:     "usr_1",
			Title:      "New Chat",
			Status:     ThreadStreaming,
			UpdateTime: time.Date(2026, 4, 15, 11, 50, 0, 0, time.UTC),
			State: ThreadState{
				ActiveRunID: new("air_orphan"),
			},
		}, inv, &MCPConnectorMock{})
		h.runs["air_orphan"] = &Run{ID: "air_orphan", SpaceID: "spc_1", Status: RunRunning}

		// Reject oversized attachment
		err := tr.StreamTurn(context.Background(), StreamTurnRequest{
			SpaceID:  "spc_1",
			UserID:   "usr_1",
			ThreadID: "thr_stale",
			Content:  "Read this",
			Attachments: []TurnAttachment{{
				Filename:    "huge.csv",
				ContentType: "text/csv",
				Data:        make([]byte, maxAttachmentBytes+1),
			}},
		}, nil)
		if !errors.Is(err, errors.Invalid) || errors.CodeOf(err) != CodeInvalidAttachment {
			t.Fatalf("expected CodeInvalidAttachment for >10MB file, got %v", err)
		}

		// Recover orphaned streaming thread + persist attachment summary only (no binary blob)
		if err := tr.StreamTurn(context.Background(), StreamTurnRequest{
			SpaceID:  "spc_1",
			UserID:   "usr_1",
			ThreadID: "thr_stale",
			Content:  "Summarize CSV",
			Attachments: []TurnAttachment{{
				Filename:    "april.csv",
				ContentType: "text/csv",
				Data:        []byte("date,amount\n2026-04-01,12.50"),
			}},
		}, nil); err != nil {
			t.Fatalf("StreamTurn after orphan recovery failed: %v", err)
		}
		if h.runs["air_orphan"].Status != RunFailed || *h.runs["air_orphan"].Error.Code != string(CodeRunInterrupted) {
			t.Errorf("expected orphan run marked failed with CodeRunInterrupted, got %+v", h.runs["air_orphan"])
		}
		if h.messages[0].Blocks[0].Type != BlockAttachment || h.messages[0].Blocks[0].Attachment.Filename != "april.csv" {
			t.Errorf("expected attachment_summary block persisted, got %+v", h.messages[0].Blocks)
		}

		// Now simulate awaiting_approval and send a new message -> pairs cancelled ToolResult
		h.mu.Lock()
		h.thread.Status = ThreadAwaitingApproval
		h.thread.State.PendingApprovals = []PendingToolApproval{{
			ToolCallID:  "tc_stale",
			MCPServerID: "mcp_saturn",
			ToolName:    "finance_create_transaction",
		}}
		h.mu.Unlock()

		if err := tr.StreamTurn(context.Background(), StreamTurnRequest{
			SpaceID:  "spc_1",
			UserID:   "usr_1",
			ThreadID: "thr_stale",
			Content:  "Never mind, do something else",
		}, nil); err != nil {
			t.Fatalf("StreamTurn during awaiting_approval failed: %v", err)
		}
		foundCancel := false
		for _, msg := range h.messages {
			if msg.Role == RoleTool && len(msg.Blocks) > 0 && msg.Blocks[0].ToolCallID != nil && *msg.Blocks[0].ToolCallID == "tc_stale" {
				foundCancel = true
			}
		}
		if !foundCancel {
			t.Error("expected stale PendingApprovals auto-cancelled with paired ToolResult")
		}
	})

	t.Run("rolling memory compaction triggers above 30 messages and updates Memory.Summary & UpToSeq", func(t *testing.T) {
		inv := &ModelInvokerMock{
			InvokeFunc: func(_ context.Context, _ InvokeRequest) (*message.Assistant, error) {
				return &message.Assistant{
					Content: message.Content{&message.TextBlock{Text: "Compacted summary of turns 1-22."}},
				}, nil
			},
			StreamFunc: func(_ context.Context, req InvokeRequest, _ StreamCallbacks) (*message.Assistant, error) {
				return &message.Assistant{
					Content: message.Content{&message.TextBlock{Text: "Continued with summary."}},
				}, nil
			},
		}
		tr, h := newMemThreadHarness(t, &Thread{
			ID:      "thr_long",
			SpaceID: "spc_1",
			UserID:  "usr_1",
			Title:   "Long Chat",
			Status:  ThreadIdle,
		}, inv, &MCPConnectorMock{})

		for i := range 32 {
			role := RoleUser
			if i%2 == 1 {
				role = RoleAssistant
			}
			h.messages = append(h.messages, &ThreadMessage{
				ID:       fmt.Sprintf("aim_%d", i+1),
				ThreadID: "thr_long",
				SpaceID:  "spc_1",
				Seq:      int32(i + 1),
				Role:     role,
				Blocks:   []ContentBlock{{Type: BlockText, Text: new(fmt.Sprintf("Turn %d message", i+1))}},
			})
		}
		h.thread.MessageCount = 32

		if err := tr.StreamTurn(context.Background(), StreamTurnRequest{
			SpaceID:  "spc_1",
			UserID:   "usr_1",
			ThreadID: "thr_long",
			Content:  "What did we discuss?",
		}, nil); err != nil {
			t.Fatalf("StreamTurn failed: %v", err)
		}
		if h.thread.State.Memory.Summary != "Compacted summary of turns 1-22." || h.thread.State.Memory.UpToSeq <= 0 {
			t.Errorf("expected rolling memory compacted, got %+v", h.thread.State.Memory)
		}
	})

	t.Run("CancelTurn aborts active stream and persists partial text", func(t *testing.T) {
		started := make(chan struct{})
		inv := &ModelInvokerMock{
			StreamFunc: func(ctx context.Context, _ InvokeRequest, cb StreamCallbacks) (*message.Assistant, error) {
				cb.OnTextDelta("Partial answer ")
				close(started)
				<-ctx.Done()
				return nil, ctx.Err()
			},
		}
		tr, h := newMemThreadHarness(t, &Thread{
			ID:      "thr_cancel",
			SpaceID: "spc_1",
			UserID:  "usr_1",
			Title:   "Cancelable",
			Status:  ThreadIdle,
		}, inv, &MCPConnectorMock{})

		errCh := make(chan error, 1)
		go func() {
			errCh <- tr.StreamTurn(context.Background(), StreamTurnRequest{
				SpaceID:  "spc_1",
				UserID:   "usr_1",
				ThreadID: "thr_cancel",
				Content:  "Write a long essay",
			}, nil)
		}()

		<-started
		if _, err := tr.CancelTurn(context.Background(), "spc_1", "usr_1", "thr_cancel"); err != nil {
			t.Fatalf("CancelTurn failed: %v", err)
		}
		if err := <-errCh; err != nil {
			t.Fatalf("expected clean exit on cancellation, got %v", err)
		}
		if h.thread.Status != ThreadIdle {
			t.Errorf("expected thread idle after CancelTurn, got %s", h.thread.Status)
		}
		lastMsg := h.messages[len(h.messages)-1]
		if lastMsg.Role != RoleAssistant || *lastMsg.Blocks[0].Text != "Partial answer" {
			t.Errorf("expected partial streamed text saved, got %+v", lastMsg)
		}
	})

	t.Run("DeadlineExceeded marks run timed_out, saves partial text, and unlocks thread", func(t *testing.T) {
		inv := &ModelInvokerMock{
			StreamFunc: func(_ context.Context, _ InvokeRequest, cb StreamCallbacks) (*message.Assistant, error) {
				cb.OnTextDelta("Half-written reply")
				return nil, fmt.Errorf("llm stream chunk: stream error: %w", context.DeadlineExceeded)
			},
		}
		tr, h := newMemThreadHarness(t, &Thread{
			ID:      "thr_timeout",
			SpaceID: "spc_1",
			UserID:  "usr_1",
			Title:   "Slow Model",
			Status:  ThreadIdle,
		}, inv, &MCPConnectorMock{})

		var events []ThreadStreamEvent
		err := tr.StreamTurn(context.Background(), StreamTurnRequest{
			SpaceID:  "spc_1",
			UserID:   "usr_1",
			ThreadID: "thr_timeout",
			Content:  "Explain everything",
		}, func(ev ThreadStreamEvent) {
			events = append(events, ev)
		})
		if err == nil || errors.CodeOf(err) != CodeExecutionTimedOut {
			t.Fatalf("expected CodeExecutionTimedOut, got %v", err)
		}
		if h.thread.Status != ThreadIdle {
			t.Errorf("expected thread idle after timeout, got %s", h.thread.Status)
		}
		var lastRun *Run
		for _, r := range h.runs {
			lastRun = r
		}
		if lastRun == nil || lastRun.Status != RunTimedOut {
			t.Fatalf("expected RunTimedOut, got %+v", lastRun)
		}
		lastMsg := h.messages[len(h.messages)-1]
		if lastMsg.Role != RoleAssistant || *lastMsg.Blocks[0].Text != "Half-written reply" {
			t.Errorf("expected partial streamed text preserved on timeout, got %+v", lastMsg)
		}
		var sawRunErr bool
		for _, ev := range events {
			if ev.Type == EventRunError && ev.Error != nil && ev.Error.Code != nil && *ev.Error.Code == string(CodeExecutionTimedOut) {
				sawRunErr = true
			}
		}
		if !sawRunErr {
			t.Errorf("expected EventRunError with CodeExecutionTimedOut, got %+v", events)
		}
	})
}
