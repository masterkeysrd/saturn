package mail_test

import (
	"context"
	"io"
	"strings"
	"testing"
	"time"

	appmail "github.com/masterkeysrd/saturn/internal/application/mail"
	domainmail "github.com/masterkeysrd/saturn/internal/domain/mail"
	"github.com/masterkeysrd/saturn/internal/platform/connector"
	"github.com/masterkeysrd/saturn/internal/platform/crypto"
	"github.com/masterkeysrd/saturn/internal/platform/eventbus"
	"github.com/masterkeysrd/saturn/internal/platform/workflow"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type workflowMailboxStore struct {
	*mockMailboxStore
}

func (s *workflowMailboxStore) ListBySpace(ctx context.Context, spaceID string, filter *domainmail.ListMailboxesFilter) ([]*domainmail.Mailbox, error) {
	all, err := s.mockMailboxStore.ListBySpace(ctx, spaceID, filter)
	if err != nil || filter == nil || filter.ConnectedAccountID == nil {
		return all, err
	}
	var out []*domainmail.Mailbox
	for _, m := range all {
		if m.ConnectedAccountID == *filter.ConnectedAccountID {
			out = append(out, m)
		}
	}
	return out, nil
}

type streamMailProvider struct {
	*mockExternalMailProvider
	streamFn func(ctx context.Context, accessToken, providerMessageID, attachmentID string) (io.ReadCloser, string, int64, error)
}

func (p *streamMailProvider) OpenAttachmentStream(ctx context.Context, accessToken, providerMessageID, attachmentID string) (io.ReadCloser, string, int64, error) {
	if p.streamFn != nil {
		return p.streamFn(ctx, accessToken, providerMessageID, attachmentID)
	}
	return p.mockExternalMailProvider.OpenAttachmentStream(ctx, accessToken, providerMessageID, attachmentID)
}

func newMailWorkflowTestSetup(t *testing.T, extProv domainmail.ExternalMailProvider) (
	*workflow.Registry,
	*workflowMailboxStore,
	*mockThreadStore,
	*mockMessageStore,
	*mockDraftStore,
	*mockAccountStore,
	*mockThreadSummaryStore,
) {
	t.Helper()
	mbxStore := &workflowMailboxStore{mockMailboxStore: newMockMailboxStore()}
	thStore := newMockThreadStore()
	msgStore := newMockMessageStore()
	dftStore := newMockDraftStore()
	syncStore := &mockSyncStateStore{}
	sumStore := newMockThreadSummaryStore()
	accStore := &mockAccountStore{accounts: make(map[string]*connector.ConnectedAccount)}

	cipher, err := crypto.NewCipher("0123456789abcdef0123456789abcdef")
	require.NoError(t, err)
	encAccess, err := cipher.Encrypt("valid-access-token")
	require.NoError(t, err)
	encRefresh, err := cipher.Encrypt("valid-refresh-token")
	require.NoError(t, err)

	accStore.accounts["acc_1"] = &connector.ConnectedAccount{
		ID:                  "acc_1",
		SpaceID:             "spc_1",
		Provider:            "google",
		Status:              connector.AccountStatusHealthy,
		EnabledCapabilities: []string{string(connector.CapabilityMail)},
		AccessTokenEnc:      encAccess,
		RefreshTokenEnc:     encRefresh,
		TokenExpiry:         time.Now().Add(time.Hour),
	}

	tokenMgr := connector.NewTokenManager(accStore, cipher, connector.NewProviderRegistry(), nil)
	domainSvc := domainmail.NewService(domainmail.Dependencies{
		MailboxStore:   mbxStore,
		ThreadStore:    thStore,
		MessageStore:   msgStore,
		DraftStore:     dftStore,
		SyncStateStore: syncStore,
	})
	providers := map[string]domainmail.ExternalMailProvider{
		"google": extProv,
	}
	coord := appmail.NewCoordinator(appmail.Dependencies{
		DomainService:     domainSvc,
		MailboxStore:      mbxStore,
		ThreadStore:       thStore,
		MessageStore:      msgStore,
		DraftStore:        dftStore,
		SyncStateStore:    syncStore,
		SummaryStore:      sumStore,
		AccountStore:      accStore,
		TokenManager:      tokenMgr,
		ExternalProviders: providers,
		Events:            eventbus.NoopPublisher{},
		SummarizeFlow:     &mockSummaryFlowExecutor{},
		HMACSecret:        []byte("test-super-secret-hmac-key-32bytes"),
	})

	reg := workflow.NewRegistry()
	appmail.RegisterWorkflows(reg, appmail.WorkflowDependencies{
		Coordinator:       coord,
		MessageStore:      msgStore,
		MailboxStore:      mbxStore,
		ThreadStore:       thStore,
		AccountStore:      accStore,
		TokenManager:      tokenMgr,
		ExternalProviders: providers,
	})
	return reg, mbxStore, thStore, msgStore, dftStore, accStore, sumStore
}

func TestMailRegisterWorkflows(t *testing.T) {
	reg, _, _, _, _, _, _ := newMailWorkflowTestSetup(t, &streamMailProvider{mockExternalMailProvider: &mockExternalMailProvider{}})

	for _, name := range []string{"mail.message", "mail.mailboxes", "mail.thread"} {
		desc, loader, ok := reg.GetLoader(name)
		require.True(t, ok, "expected loader %q", name)
		require.NotNil(t, loader)
		assert.NotNil(t, desc.ParamsSchema)
		assert.NotNil(t, desc.OutputSchema)
	}

	for _, stepType := range []string{"mail.create_draft", "mail.modify_labels", "mail.save_thread_summary"} {
		desc, handler, ok := reg.GetStep(stepType)
		require.True(t, ok, "expected step %q", stepType)
		require.NotNil(t, handler)
		assert.Equal(t, []string{"mail."}, desc.InvalidatesPrefixes)
		assert.NotNil(t, desc.InputsSchema)
		assert.NotNil(t, desc.OutputSchema)
	}

	reader, ok := reg.GetArtifactReader("mail")
	require.True(t, ok)
	assert.Equal(t, "mail", reader.Scheme())
}

func TestMailLoaders(t *testing.T) {
	t.Run("mail.message", func(t *testing.T) {
		reg, _, _, msgStore, _, _, _ := newMailWorkflowTestSetup(t, &streamMailProvider{mockExternalMailProvider: &mockExternalMailProvider{}})
		msgID, err := domainmail.GenerateMessageID()
		require.NoError(t, err)

		require.NoError(t, msgStore.Create(t.Context(), &domainmail.Message{
			ID:                 msgID,
			SpaceID:            "spc_1",
			ConnectedAccountID: "acc_1",
			ThreadID:           "mth_1",
			Subject:            "Invoice #104",
			Snippet:            "Please see attached",
			From:               domainmail.Participant{Name: "Billing", Email: "billing@acme.com"},
			ReceivedAt:         time.Date(2026, 4, 15, 12, 0, 0, 0, time.UTC),
			Attachments: []domainmail.AttachmentMeta{
				{ID: "mat_pdf1", Filename: "invoice.pdf", ContentType: "application/pdf", Size: 2048},
			},
		}))
		require.NoError(t, msgStore.SaveBody(t.Context(), &domainmail.MessageBody{
			MessageID:     msgID,
			SpaceID:       "spc_1",
			PlainText:     "Total due: $99.00",
			SanitizedHTML: "<p>Total due: $99.00</p>",
			ExpiresAt:     time.Now().Add(time.Hour),
		}))

		_, loader, _ := reg.GetLoader("mail.message")
		res, err := loader.Load(t.Context(), "spc_1", map[string]any{"id": msgID})
		require.NoError(t, err)
		require.NotNil(t, res)

		detail := res.(map[string]any)
		assert.Equal(t, "Invoice #104", detail["subject"])
		assert.Equal(t, "Total due: $99.00", detail["body_plain"])
		atts := detail["attachments"].([]any)
		require.Len(t, atts, 1)
		assert.Equal(t, "mail://"+msgID+"/mat_pdf1", atts[0].(map[string]any)["ref"])

		missing, err := loader.Load(t.Context(), "spc_1", map[string]any{"id": "msg_missing"})
		require.NoError(t, err)
		assert.Nil(t, missing)
	})

	t.Run("mail.mailboxes", func(t *testing.T) {
		reg, mbxStore, _, _, _, _, _ := newMailWorkflowTestSetup(t, &streamMailProvider{mockExternalMailProvider: &mockExternalMailProvider{}})
		require.NoError(t, mbxStore.Create(t.Context(), &domainmail.Mailbox{
			ID:                 "mbx_1",
			SpaceID:            "spc_1",
			ConnectedAccountID: "acc_1",
			Name:               "Inbox",
			SystemRole:         domainmail.SystemBucketInbox,
			UnreadCount:        3,
			TotalCount:         10,
		}))
		require.NoError(t, mbxStore.Create(t.Context(), &domainmail.Mailbox{
			ID:                 "mbx_2",
			SpaceID:            "spc_1",
			ConnectedAccountID: "acc_2",
			Name:               "Work",
			SystemRole:         domainmail.SystemBucketCustom,
		}))

		_, loader, _ := reg.GetLoader("mail.mailboxes")
		all, err := loader.Load(t.Context(), "spc_1", map[string]any{})
		require.NoError(t, err)
		assert.Len(t, all.([]any), 2)

		filtered, err := loader.Load(t.Context(), "spc_1", map[string]any{"connected_account_id": "acc_1"})
		require.NoError(t, err)
		assert.Len(t, filtered.([]any), 1)
	})
}

func TestMailArtifactReader(t *testing.T) {
	prov := &streamMailProvider{
		mockExternalMailProvider: &mockExternalMailProvider{},
		streamFn: func(_ context.Context, _, providerMessageID, attachmentID string) (io.ReadCloser, string, int64, error) {
			assert.Equal(t, "gmail_msg_1", providerMessageID)
			assert.Equal(t, "mat_1", attachmentID)
			return io.NopCloser(strings.NewReader("%PDF-1.4 receipt bytes")), "application/octet-stream", 23, nil
		},
	}
	reg, _, _, msgStore, _, _, _ := newMailWorkflowTestSetup(t, prov)

	msgID := "msg_att_1"
	provMsgID := "gmail_msg_1"
	require.NoError(t, msgStore.Create(t.Context(), &domainmail.Message{
		ID:                 msgID,
		SpaceID:            "spc_1",
		ConnectedAccountID: "acc_1",
		ProviderMessageID:  &provMsgID,
		ThreadID:           "mth_1",
		ReceivedAt:         time.Now().UTC(),
		Attachments: []domainmail.AttachmentMeta{
			{ID: "mat_1", Filename: "statement.pdf", ContentType: "application/pdf", Size: 23},
		},
	}))

	reader, ok := reg.GetArtifactReader("mail")
	require.True(t, ok)

	t.Run("StreamsAttachmentWithMetadata", func(t *testing.T) {
		art, err := reader.Read(t.Context(), "spc_1", "mail://"+msgID+"/mat_1")
		require.NoError(t, err)
		assert.Equal(t, "statement.pdf", art.Filename)
		assert.Equal(t, "application/pdf", art.ContentType)
		assert.Equal(t, "%PDF-1.4 receipt bytes", string(art.Data))
	})

	t.Run("RejectsMalformedRef", func(t *testing.T) {
		_, err := reader.Read(t.Context(), "spc_1", "mail://only_message_id")
		require.Error(t, err)
	})

	t.Run("RejectsMissingMessage", func(t *testing.T) {
		_, err := reader.Read(t.Context(), "spc_1", "mail://msg_missing/mat_1")
		require.Error(t, err)
	})
}

func TestMailSteps(t *testing.T) {
	t.Run("mail.create_draft", func(t *testing.T) {
		reg, _, _, msgStore, dftStore, _, _ := newMailWorkflowTestSetup(t, &streamMailProvider{mockExternalMailProvider: &mockExternalMailProvider{}})
		require.NoError(t, msgStore.Create(t.Context(), &domainmail.Message{
			ID:                 "msg_orig",
			SpaceID:            "spc_1",
			ConnectedAccountID: "acc_1",
			ThreadID:           "mth_orig",
			ReceivedAt:         time.Now().UTC(),
		}))

		_, handler, _ := reg.GetStep("mail.create_draft")

		out, err := handler.Execute(t.Context(), &workflow.StepExecutionContext{
			SpaceID: "spc_1",
			Inputs: map[string]any{
				"connected_account_id": "acc_1",
				"to":                   []any{map[string]any{"name": "Alice", "email": "alice@example.com"}},
				"subject":              "Re: Invoice",
				"body_text":            "Thanks, received!",
				"reply_to_message_id":  "msg_orig",
			},
		})
		require.NoError(t, err)
		draftID := out["draft_id"].(string)
		require.NotEmpty(t, draftID)

		saved, err := dftStore.GetByID(t.Context(), "spc_1", draftID)
		require.NoError(t, err)
		require.NotNil(t, saved)
		assert.Equal(t, domainmail.DraftModeReply, saved.Mode)
		require.NotNil(t, saved.ThreadID)
		assert.Equal(t, "mth_orig", *saved.ThreadID)

		_, err = handler.Execute(t.Context(), &workflow.StepExecutionContext{
			SpaceID: "spc_1",
			Inputs:  map[string]any{"subject": "Missing account"},
		})
		require.Error(t, err)
	})

	t.Run("mail.modify_labels", func(t *testing.T) {
		reg, _, thStore, msgStore, _, _, _ := newMailWorkflowTestSetup(t, &streamMailProvider{mockExternalMailProvider: &mockExternalMailProvider{}})
		threadID, err := domainmail.GenerateThreadID()
		require.NoError(t, err)
		require.NoError(t, thStore.Create(t.Context(), &domainmail.Thread{
			ID:                 threadID,
			SpaceID:            "spc_1",
			ConnectedAccountID: "acc_1",
			InInbox:            true,
			LastMessageAt:      time.Now().UTC(),
		}))
		require.NoError(t, msgStore.Create(t.Context(), &domainmail.Message{
			ID:                 "msg_1",
			SpaceID:            "spc_1",
			ConnectedAccountID: "acc_1",
			ThreadID:           threadID,
			ReceivedAt:         time.Now().UTC(),
		}))

		_, handler, _ := reg.GetStep("mail.modify_labels")

		out, err := handler.Execute(t.Context(), &workflow.StepExecutionContext{
			SpaceID: "spc_1",
			Inputs: map[string]any{
				"message_id":      "msg_1",
				"add_mailbox_ids": []any{"mbx_receipts"},
				"archive":         true,
			},
		})
		require.NoError(t, err)
		assert.Equal(t, true, out["updated"])

		th, err := thStore.GetByID(t.Context(), "spc_1", threadID)
		require.NoError(t, err)
		assert.False(t, th.InInbox)
		assert.Contains(t, th.MailboxIDs, "mbx_receipts")

		_, err = handler.Execute(t.Context(), &workflow.StepExecutionContext{
			SpaceID: "spc_1",
			Inputs:  map[string]any{},
		})
		require.Error(t, err)
	})
}

func TestMailThreadLoader(t *testing.T) {
	reg, _, thStore, msgStore, _, _, _ := newMailWorkflowTestSetup(t, &streamMailProvider{mockExternalMailProvider: &mockExternalMailProvider{}})

	_, loader, ok := reg.GetLoader("mail.thread")
	require.True(t, ok)

	t.Run("empty id returns nil", func(t *testing.T) {
		out, err := loader.Load(t.Context(), "spc_1", map[string]any{"id": " "})
		require.NoError(t, err)
		assert.Nil(t, out)
	})

	t.Run("unknown thread returns nil", func(t *testing.T) {
		out, err := loader.Load(t.Context(), "spc_1", map[string]any{"id": "mth_missing"})
		require.NoError(t, err)
		assert.Nil(t, out)
	})

	t.Run("loads chronological messages with html fallback", func(t *testing.T) {
		threadID, err := domainmail.GenerateThreadID()
		require.NoError(t, err)
		require.NoError(t, thStore.Create(t.Context(), &domainmail.Thread{
			ID:                 threadID,
			SpaceID:            "spc_1",
			ConnectedAccountID: "acc_1",
			Subject:            "Q3 Planning",
			Participants:       []domainmail.Participant{{Name: "Alice", Email: "alice@example.com"}},
			MessageCount:       2,
			LastMessageAt:      time.Date(2026, 5, 2, 10, 0, 0, 0, time.UTC),
		}))
		require.NoError(t, msgStore.Create(t.Context(), &domainmail.Message{
			ID:                 "msg_a",
			SpaceID:            "spc_1",
			ConnectedAccountID: "acc_1",
			ThreadID:           threadID,
			From:               domainmail.Participant{Name: "Alice", Email: "alice@example.com"},
			ReceivedAt:         time.Date(2026, 5, 1, 10, 0, 0, 0, time.UTC),
		}))
		require.NoError(t, msgStore.Create(t.Context(), &domainmail.Message{
			ID:                 "msg_b",
			SpaceID:            "spc_1",
			ConnectedAccountID: "acc_1",
			ThreadID:           threadID,
			From:               domainmail.Participant{Name: "Bob", Email: "bob@example.com"},
			ReceivedAt:         time.Date(2026, 5, 2, 10, 0, 0, 0, time.UTC),
		}))
		require.NoError(t, msgStore.SaveBody(t.Context(), &domainmail.MessageBody{
			MessageID:     "msg_b",
			SpaceID:       "spc_1",
			SanitizedHTML: "<p>Hello <b>team</b></p><ul><li>item one</li></ul>",
			ExpiresAt:     time.Now().Add(time.Hour),
		}))

		out, err := loader.Load(t.Context(), "spc_1", map[string]any{"id": threadID})
		require.NoError(t, err)
		require.NotNil(t, out)

		detail, ok := out.(map[string]any)
		require.True(t, ok)
		assert.Equal(t, threadID, detail["id"])
		assert.Equal(t, "Q3 Planning", detail["subject"])
		msgs, ok := detail["messages"].([]any)
		require.True(t, ok)
		require.Len(t, msgs, 2)
		assert.Equal(t, "msg_b", detail["last_message_id"])
		second := msgs[1].(map[string]any)
		assert.Equal(t, "Hello team item one", second["body_text"])
	})
}

func TestMailSaveThreadSummaryStep(t *testing.T) {
	reg, _, _, _, _, _, _ := newMailWorkflowTestSetup(t, &streamMailProvider{mockExternalMailProvider: &mockExternalMailProvider{}})

	threadID, err := domainmail.GenerateThreadID()
	require.NoError(t, err)

	_, handler, ok := reg.GetStep("mail.save_thread_summary")
	require.True(t, ok)

	t.Run("missing thread id fails", func(t *testing.T) {
		_, err := handler.Execute(t.Context(), &workflow.StepExecutionContext{
			SpaceID: "spc_1",
			Inputs:  map[string]any{"tldr": "x"},
		})
		require.Error(t, err)
	})

	t.Run("persists summary with flow run id", func(t *testing.T) {
		out, err := handler.Execute(t.Context(), &workflow.StepExecutionContext{
			SpaceID:   "spc_1",
			FlowRunID: "frw_42",
			Inputs: map[string]any{
				"thread_id":       threadID,
				"language":        "es-DO",
				"tldr":            "Resumen del hilo",
				"key_points":      []any{"punto uno"},
				"action_items":    []any{"enviar informe"},
				"last_message_id": "msg_9",
				"last_message_at": "2026-05-02T10:00:00Z",
				"message_count":   int64(3),
			},
		})
		require.NoError(t, err)
		assert.Equal(t, threadID, out["thread_id"])
		assert.Equal(t, "es", out["language"])
	})

	t.Run("invalid last_message_at fails", func(t *testing.T) {
		_, err := handler.Execute(t.Context(), &workflow.StepExecutionContext{
			SpaceID: "spc_1",
			Inputs: map[string]any{
				"thread_id":       threadID,
				"tldr":            "x",
				"last_message_at": "not-a-timestamp",
			},
		})
		require.Error(t, err)
	})
}

func TestMailSummarizeThreadSystemFlowBlueprint(t *testing.T) {
	reg, _, thStore, msgStore, _, _, sumStore := newMailWorkflowTestSetup(t, &streamMailProvider{mockExternalMailProvider: &mockExternalMailProvider{}})

	bp, ok := reg.GetSystemFlow(appmail.SystemFlowMailSummarizeThread)
	require.True(t, ok)
	assert.Equal(t, "system.mail.summarize_thread", bp.SystemKey)

	flow, triggers := bp.Build("spc_1")
	require.NotNil(t, flow)
	assert.True(t, flow.IsSystem)
	assert.True(t, flow.IsEnabled)
	require.NotNil(t, flow.SystemKey)
	assert.Equal(t, appmail.SystemFlowMailSummarizeThread, *flow.SystemKey)
	require.NotNil(t, flow.Config.DefaultModel)
	require.NotNil(t, flow.Config.DefaultModel.Role)
	assert.Equal(t, "fast", *flow.Config.DefaultModel.Role)
	assert.NotNil(t, flow.InputSchema)

	require.Len(t, triggers, 2)
	assert.Equal(t, workflow.TriggerManual, triggers[0].Type)
	assert.True(t, triggers[0].IsEnabled)
	assert.Equal(t, "Summarize Email Thread", triggers[0].Name)
	assert.Equal(t, workflow.TriggerEvent, triggers[1].Type)
	assert.False(t, triggers[1].IsEnabled, "background auto-summarization must be opt-in")
	require.NotNil(t, triggers[1].Config.Topic)
	assert.Equal(t, "mail.message.received", *triggers[1].Config.Topic)

	t.Run("flow and triggers pass engine validation", func(t *testing.T) {
		engine := newMailWorkflowTestEngine(t, reg, &stubMailAgentExecutor{})
		require.NoError(t, engine.ValidateFlow(flow))
		for i := range triggers {
			require.NoError(t, triggers[i].Validate(), "Trigger[%d].Validate()", i)
		}
	})

	t.Run("engine executes flow and persists summary", func(t *testing.T) {
		threadID, err := domainmail.GenerateThreadID()
		require.NoError(t, err)
		lastAt := time.Date(2026, 5, 2, 10, 0, 0, 0, time.UTC)
		require.NoError(t, thStore.Create(t.Context(), &domainmail.Thread{
			ID:                 threadID,
			SpaceID:            "spc_1",
			ConnectedAccountID: "acc_1",
			Subject:            "Q3 Planning",
			Participants:       []domainmail.Participant{{Name: "Alice", Email: "alice@example.com"}},
			MessageCount:       2,
			LastMessageAt:      lastAt,
		}))
		require.NoError(t, msgStore.Create(t.Context(), &domainmail.Message{
			ID:                 "msg_e2e_a",
			SpaceID:            "spc_1",
			ConnectedAccountID: "acc_1",
			ThreadID:           threadID,
			From:               domainmail.Participant{Name: "Alice", Email: "alice@example.com"},
			ReceivedAt:         time.Date(2026, 5, 1, 10, 0, 0, 0, time.UTC),
		}))
		require.NoError(t, msgStore.Create(t.Context(), &domainmail.Message{
			ID:                 "msg_e2e_b",
			SpaceID:            "spc_1",
			ConnectedAccountID: "acc_1",
			ThreadID:           threadID,
			From:               domainmail.Participant{Name: "Bob", Email: "bob@example.com"},
			ReceivedAt:         lastAt,
		}))

		agentExec := &stubMailAgentExecutor{
			fn: func(_ context.Context, _ workflow.LLMRequest) (*workflow.LLMResponse, error) {
				return &workflow.LLMResponse{
					ParsedJSON: map[string]any{
						"tldr":         "Team aligned on Q3 scope.",
						"key_points":   []any{"Scope locked", "Hiring approved"},
						"action_items": []any{"Send roadmap update"},
					},
				}, nil
			},
		}
		engine := newMailWorkflowTestEngine(t, reg, agentExec)

		run, err := engine.Execute(t.Context(), workflow.ExecuteOptions{
			Flow:    flow,
			Space:   workflow.SpaceContext{ID: "spc_1", Timezone: "UTC"},
			Input:   map[string]any{"thread_id": threadID, "language": "es"},
			Persist: false,
		})
		require.NoError(t, err)
		require.Equal(t, workflow.RunCompleted, run.Status, "run error = %+v", run.Error)

		stored, err := sumStore.Get(t.Context(), "spc_1", threadID, "es")
		require.NoError(t, err)
		require.NotNil(t, stored, "mail.save_thread_summary must persist the summary")
		assert.Equal(t, "Team aligned on Q3 scope.", stored.TLDR)
		assert.Equal(t, []string{"Scope locked", "Hiring approved"}, stored.KeyPoints)
		assert.Equal(t, []string{"Send roadmap update"}, stored.ActionItems)
		assert.Equal(t, "msg_e2e_b", stored.LastMessageID)
		assert.Equal(t, lastAt, stored.LastMessageAt)
		assert.Equal(t, 2, stored.MessageCount)
		require.NotNil(t, stored.FlowRunID, "step context must capture the flow run id")
		assert.Equal(t, run.ID, *stored.FlowRunID)
	})
}

type stubMailAgentExecutor struct {
	fn func(ctx context.Context, req workflow.LLMRequest) (*workflow.LLMResponse, error)
}

func (s *stubMailAgentExecutor) Execute(ctx context.Context, req workflow.LLMRequest) (*workflow.LLMResponse, error) {
	return s.fn(ctx, req)
}

func (s *stubMailAgentExecutor) ExecuteAgent(_ context.Context, _ workflow.AgentRunRequest) (*workflow.LLMResponse, error) {
	return &workflow.LLMResponse{}, nil
}

func newMailWorkflowTestEngine(t *testing.T, reg *workflow.Registry, agentExec workflow.AgentExecutor) *workflow.Engine {
	t.Helper()
	engine, err := workflow.NewEngine(workflow.Dependencies{
		Registry:      reg,
		AgentExecutor: agentExec,
	})
	require.NoError(t, err)
	return engine
}
