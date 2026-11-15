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
) {
	t.Helper()
	mbxStore := &workflowMailboxStore{mockMailboxStore: newMockMailboxStore()}
	thStore := newMockThreadStore()
	msgStore := newMockMessageStore()
	dftStore := newMockDraftStore()
	syncStore := &mockSyncStateStore{}
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
		AccountStore:      accStore,
		TokenManager:      tokenMgr,
		ExternalProviders: providers,
		Events:            eventbus.NoopPublisher{},
		HMACSecret:        []byte("test-super-secret-hmac-key-32bytes"),
	})

	reg := workflow.NewRegistry()
	appmail.RegisterWorkflows(reg, appmail.WorkflowDependencies{
		Coordinator:       coord,
		MessageStore:      msgStore,
		MailboxStore:      mbxStore,
		AccountStore:      accStore,
		TokenManager:      tokenMgr,
		ExternalProviders: providers,
	})
	return reg, mbxStore, thStore, msgStore, dftStore, accStore
}

func TestMailRegisterWorkflows(t *testing.T) {
	reg, _, _, _, _, _ := newMailWorkflowTestSetup(t, &streamMailProvider{mockExternalMailProvider: &mockExternalMailProvider{}})

	for _, name := range []string{"mail.message", "mail.mailboxes"} {
		desc, loader, ok := reg.GetLoader(name)
		require.True(t, ok, "expected loader %q", name)
		require.NotNil(t, loader)
		assert.NotNil(t, desc.ParamsSchema)
		assert.NotNil(t, desc.OutputSchema)
	}

	for _, stepType := range []string{"mail.create_draft", "mail.modify_labels"} {
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
		reg, _, _, msgStore, _, _ := newMailWorkflowTestSetup(t, &streamMailProvider{mockExternalMailProvider: &mockExternalMailProvider{}})
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
		reg, mbxStore, _, _, _, _ := newMailWorkflowTestSetup(t, &streamMailProvider{mockExternalMailProvider: &mockExternalMailProvider{}})
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
	reg, _, _, msgStore, _, _ := newMailWorkflowTestSetup(t, prov)

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
		reg, _, _, msgStore, dftStore, _ := newMailWorkflowTestSetup(t, &streamMailProvider{mockExternalMailProvider: &mockExternalMailProvider{}})
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
		reg, _, thStore, msgStore, _, _ := newMailWorkflowTestSetup(t, &streamMailProvider{mockExternalMailProvider: &mockExternalMailProvider{}})
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
