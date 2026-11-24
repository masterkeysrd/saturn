package mail_test

import (
	"bytes"
	"context"
	"io"
	"sort"
	"strings"
	"testing"
	"time"

	appmail "github.com/masterkeysrd/saturn/internal/application/mail"
	domainmail "github.com/masterkeysrd/saturn/internal/domain/mail"
	"github.com/masterkeysrd/saturn/internal/domain/space"
	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	"github.com/masterkeysrd/saturn/internal/platform/connector"
	"github.com/masterkeysrd/saturn/internal/platform/crypto"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/eventbus"
	platformworkflow "github.com/masterkeysrd/saturn/internal/platform/workflow"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type mockMailboxStore struct {
	mailboxes map[string]*domainmail.Mailbox
}

func newMockMailboxStore() *mockMailboxStore {
	return &mockMailboxStore{mailboxes: make(map[string]*domainmail.Mailbox)}
}
func (m *mockMailboxStore) Create(ctx context.Context, mbx *domainmail.Mailbox) error {
	m.mailboxes[mbx.ID] = mbx
	return nil
}
func (m *mockMailboxStore) GetByID(ctx context.Context, spaceID, id string) (*domainmail.Mailbox, error) {
	mbx, ok := m.mailboxes[id]
	if !ok || mbx.SpaceID != spaceID {
		return nil, nil
	}
	return mbx, nil
}
func (m *mockMailboxStore) GetByProviderID(ctx context.Context, spaceID, connectedAccountID, providerMailboxID string) (*domainmail.Mailbox, error) {
	for _, mbx := range m.mailboxes {
		if mbx.SpaceID == spaceID && mbx.ConnectedAccountID == connectedAccountID && mbx.ProviderMailboxID != nil && *mbx.ProviderMailboxID == providerMailboxID {
			return mbx, nil
		}
	}
	return nil, nil
}
func (m *mockMailboxStore) GetBySystemRole(ctx context.Context, spaceID, connectedAccountID string, role domainmail.SystemBucket) (*domainmail.Mailbox, error) {
	for _, mbx := range m.mailboxes {
		if mbx.SpaceID == spaceID && mbx.ConnectedAccountID == connectedAccountID && mbx.SystemRole == role {
			return mbx, nil
		}
	}
	return nil, nil
}
func (m *mockMailboxStore) Update(ctx context.Context, mbx *domainmail.Mailbox) error {
	m.mailboxes[mbx.ID] = mbx
	return nil
}
func (m *mockMailboxStore) Delete(ctx context.Context, spaceID, id string) error {
	delete(m.mailboxes, id)
	return nil
}
func (m *mockMailboxStore) ListBySpace(ctx context.Context, spaceID string, filter *domainmail.ListMailboxesFilter) ([]*domainmail.Mailbox, error) {
	var list []*domainmail.Mailbox
	for _, mbx := range m.mailboxes {
		if mbx.SpaceID == spaceID {
			list = append(list, mbx)
		}
	}
	return list, nil
}
func (m *mockMailboxStore) Upsert(ctx context.Context, mbx *domainmail.Mailbox) error {
	m.mailboxes[mbx.ID] = mbx
	return nil
}
func (m *mockMailboxStore) DeleteByConnectedAccount(ctx context.Context, spaceID, connectedAccountID string) error {
	for id, mbx := range m.mailboxes {
		if mbx.SpaceID == spaceID && mbx.ConnectedAccountID == connectedAccountID {
			delete(m.mailboxes, id)
		}
	}
	return nil
}

type mockThreadStore struct {
	threads map[string]*domainmail.Thread
}

func newMockThreadStore() *mockThreadStore {
	return &mockThreadStore{threads: make(map[string]*domainmail.Thread)}
}
func (m *mockThreadStore) Create(ctx context.Context, th *domainmail.Thread) error {
	m.threads[th.ID] = th
	return nil
}
func (m *mockThreadStore) GetByID(ctx context.Context, spaceID, id string) (*domainmail.Thread, error) {
	th, ok := m.threads[id]
	if !ok || th.SpaceID != spaceID {
		return nil, nil
	}
	return th, nil
}
func (m *mockThreadStore) GetByProviderID(ctx context.Context, spaceID, connectedAccountID, providerThreadID string) (*domainmail.Thread, error) {
	for _, th := range m.threads {
		if th.SpaceID == spaceID && th.ConnectedAccountID == connectedAccountID && th.ProviderThreadID != nil && *th.ProviderThreadID == providerThreadID {
			return th, nil
		}
	}
	return nil, nil
}
func (m *mockThreadStore) Update(ctx context.Context, th *domainmail.Thread) error {
	m.threads[th.ID] = th
	return nil
}
func (m *mockThreadStore) Delete(ctx context.Context, spaceID, id string) error {
	delete(m.threads, id)
	return nil
}
func (m *mockThreadStore) ListBySpace(ctx context.Context, spaceID string, filter *domainmail.ListThreadsFilter) ([]*domainmail.Thread, error) {
	var list []*domainmail.Thread
	for _, th := range m.threads {
		if th.SpaceID != spaceID {
			continue
		}
		if filter != nil {
			if filter.ConnectedAccountID != nil && *filter.ConnectedAccountID != "" && th.ConnectedAccountID != *filter.ConnectedAccountID {
				continue
			}
			if filter.SystemBucket != nil {
				switch *filter.SystemBucket {
				case domainmail.SystemBucketInbox:
					if !th.InInbox || th.InTrash || th.InSpam {
						continue
					}
				case domainmail.SystemBucketSent:
					if !th.InSent || th.InTrash {
						continue
					}
				}
			}
		}
		list = append(list, th)
	}
	sort.Slice(list, func(i, j int) bool {
		return list[i].LastMessageAt.After(list[j].LastMessageAt)
	})
	if filter != nil && (filter.Limit > 0 || filter.Offset > 0) {
		if filter.Offset >= len(list) {
			return nil, nil
		}
		end := len(list)
		if filter.Limit > 0 && filter.Offset+filter.Limit < end {
			end = filter.Offset + filter.Limit
		}
		return list[filter.Offset:end], nil
	}
	return list, nil
}
func (m *mockThreadStore) CountBySpace(ctx context.Context, spaceID string, filter *domainmail.ListThreadsFilter) (int, error) {
	var countFilter *domainmail.ListThreadsFilter
	if filter != nil {
		cp := *filter
		cp.Limit = 0
		cp.Offset = 0
		countFilter = &cp
	}
	list, err := m.ListBySpace(ctx, spaceID, countFilter)
	return len(list), err
}
func (m *mockThreadStore) ListProviderThreadIDs(ctx context.Context, spaceID, connectedAccountID string) ([]string, error) {
	var ids []string
	for _, th := range m.threads {
		if th.SpaceID == spaceID && th.ConnectedAccountID == connectedAccountID && th.ProviderThreadID != nil && *th.ProviderThreadID != "" {
			ids = append(ids, *th.ProviderThreadID)
		}
	}
	return ids, nil
}
func (m *mockThreadStore) Upsert(ctx context.Context, th *domainmail.Thread) error {
	m.threads[th.ID] = th
	return nil
}
func (m *mockThreadStore) PruneThreadsOlderThanWindow(ctx context.Context, olderThan time.Time) (int64, error) {
	var pruned int64
	for id, th := range m.threads {
		if th.LastMessageAt.Before(olderThan) && !th.IsStarred {
			delete(m.threads, id)
			pruned++
		}
	}
	return pruned, nil
}
func (m *mockThreadStore) DeleteByConnectedAccount(ctx context.Context, spaceID, connectedAccountID string) error {
	for id, th := range m.threads {
		if th.SpaceID == spaceID && th.ConnectedAccountID == connectedAccountID {
			delete(m.threads, id)
		}
	}
	return nil
}

type mockMessageStore struct {
	messages map[string]*domainmail.Message
	bodies   map[string]*domainmail.MessageBody
}

func newMockMessageStore() *mockMessageStore {
	return &mockMessageStore{
		messages: make(map[string]*domainmail.Message),
		bodies:   make(map[string]*domainmail.MessageBody),
	}
}
func (m *mockMessageStore) Create(ctx context.Context, msg *domainmail.Message) error {
	m.messages[msg.ID] = msg
	return nil
}
func (m *mockMessageStore) GetByID(ctx context.Context, spaceID, id string) (*domainmail.Message, error) {
	msg, ok := m.messages[id]
	if !ok || msg.SpaceID != spaceID {
		return nil, nil
	}
	return msg, nil
}
func (m *mockMessageStore) GetByProviderID(ctx context.Context, spaceID, connectedAccountID, providerMessageID string) (*domainmail.Message, error) {
	for _, msg := range m.messages {
		if msg.SpaceID == spaceID && msg.ConnectedAccountID == connectedAccountID && msg.ProviderMessageID != nil && *msg.ProviderMessageID == providerMessageID {
			return msg, nil
		}
	}
	return nil, nil
}
func (m *mockMessageStore) ListByThreadID(ctx context.Context, spaceID, threadID string) ([]*domainmail.Message, error) {
	var list []*domainmail.Message
	for _, msg := range m.messages {
		if msg.SpaceID == spaceID && msg.ThreadID == threadID {
			list = append(list, msg)
		}
	}
	sort.Slice(list, func(i, j int) bool {
		return list[i].EffectiveTime().Before(list[j].EffectiveTime())
	})
	return list, nil
}
func (m *mockMessageStore) Update(ctx context.Context, msg *domainmail.Message) error {
	m.messages[msg.ID] = msg
	return nil
}
func (m *mockMessageStore) Delete(ctx context.Context, spaceID, id string) error {
	delete(m.messages, id)
	return nil
}
func (m *mockMessageStore) Upsert(ctx context.Context, msg *domainmail.Message) error {
	m.messages[msg.ID] = msg
	return nil
}
func (m *mockMessageStore) SaveBody(ctx context.Context, body *domainmail.MessageBody) error {
	m.bodies[body.MessageID] = body
	return nil
}
func (m *mockMessageStore) GetBody(ctx context.Context, spaceID, messageID string) (*domainmail.MessageBody, error) {
	body, ok := m.bodies[messageID]
	if !ok || body.SpaceID != spaceID {
		return nil, nil
	}
	return body, nil
}
func (m *mockMessageStore) DeleteExpiredBodies(ctx context.Context, now time.Time) (int64, error) {
	var evicted int64
	for id, body := range m.bodies {
		if body.ExpiresAt.Before(now) {
			delete(m.bodies, id)
			evicted++
		}
	}
	return evicted, nil
}
func (m *mockMessageStore) DeleteByConnectedAccount(ctx context.Context, spaceID, connectedAccountID string) error {
	for id, msg := range m.messages {
		if msg.SpaceID == spaceID && msg.ConnectedAccountID == connectedAccountID {
			delete(m.messages, id)
			delete(m.bodies, id)
		}
	}
	return nil
}

type mockDraftStore struct {
	drafts map[string]*domainmail.Draft
}

func newMockDraftStore() *mockDraftStore {
	return &mockDraftStore{drafts: make(map[string]*domainmail.Draft)}
}
func (m *mockDraftStore) Create(ctx context.Context, draft *domainmail.Draft) error {
	m.drafts[draft.ID] = draft
	return nil
}
func (m *mockDraftStore) GetByID(ctx context.Context, spaceID, id string) (*domainmail.Draft, error) {
	d, ok := m.drafts[id]
	if !ok || d.SpaceID != spaceID {
		return nil, nil
	}
	return d, nil
}
func (m *mockDraftStore) GetByProviderID(ctx context.Context, spaceID, connectedAccountID, providerDraftID string) (*domainmail.Draft, error) {
	for _, d := range m.drafts {
		if d.SpaceID == spaceID && d.ConnectedAccountID == connectedAccountID && d.ProviderDraftID != nil && *d.ProviderDraftID == providerDraftID {
			return d, nil
		}
	}
	return nil, nil
}
func (m *mockDraftStore) Update(ctx context.Context, draft *domainmail.Draft) error {
	m.drafts[draft.ID] = draft
	return nil
}
func (m *mockDraftStore) Delete(ctx context.Context, spaceID, id string) error {
	delete(m.drafts, id)
	return nil
}
func (m *mockDraftStore) ListBySpace(ctx context.Context, spaceID string, filter *domainmail.ListDraftsFilter) ([]*domainmail.Draft, error) {
	var list []*domainmail.Draft
	for _, d := range m.drafts {
		if d.SpaceID == spaceID {
			list = append(list, d)
		}
	}
	return list, nil
}
func (m *mockDraftStore) DeleteByConnectedAccount(ctx context.Context, spaceID, connectedAccountID string) error {
	for id, d := range m.drafts {
		if d.SpaceID == spaceID && d.ConnectedAccountID == connectedAccountID {
			delete(m.drafts, id)
		}
	}
	return nil
}

type mockSyncStateStore struct {
	states map[string]*domainmail.SyncState
}

func newMockSyncStateStore() *mockSyncStateStore {
	return &mockSyncStateStore{states: make(map[string]*domainmail.SyncState)}
}
func (m *mockSyncStateStore) Get(ctx context.Context, spaceID, connectedAccountID string) (*domainmail.SyncState, error) {
	key := spaceID + ":" + connectedAccountID
	return m.states[key], nil
}
func (m *mockSyncStateStore) Upsert(ctx context.Context, state *domainmail.SyncState) error {
	key := state.SpaceID + ":" + state.ConnectedAccountID
	m.states[key] = state
	return nil
}
func (m *mockSyncStateStore) Delete(ctx context.Context, spaceID, connectedAccountID string) error {
	key := spaceID + ":" + connectedAccountID
	delete(m.states, key)
	return nil
}

type mockExternalMailProvider struct {
	syncThreadsFunc       func(ctx context.Context, accessToken string, req *domainmail.SyncThreadsRequest) (*domainmail.SyncThreadsResult, error)
	fetchOlderThreadsFunc func(ctx context.Context, accessToken string, req *domainmail.FetchOlderThreadsRequest) (*domainmail.FetchOlderThreadsResult, error)
}

func (m *mockExternalMailProvider) Provider() string { return "google" }
func (m *mockExternalMailProvider) ListMailboxes(ctx context.Context, accessToken string) ([]*domainmail.Mailbox, error) {
	return []*domainmail.Mailbox{}, nil
}
func (m *mockExternalMailProvider) SyncThreads(ctx context.Context, accessToken string, req *domainmail.SyncThreadsRequest) (*domainmail.SyncThreadsResult, error) {
	if m.syncThreadsFunc != nil {
		return m.syncThreadsFunc(ctx, accessToken, req)
	}
	return &domainmail.SyncThreadsResult{}, nil
}
func (m *mockExternalMailProvider) FetchOlderThreads(ctx context.Context, accessToken string, req *domainmail.FetchOlderThreadsRequest) (*domainmail.FetchOlderThreadsResult, error) {
	if m.fetchOlderThreadsFunc != nil {
		return m.fetchOlderThreadsFunc(ctx, accessToken, req)
	}
	return &domainmail.FetchOlderThreadsResult{}, nil
}
func (m *mockExternalMailProvider) FetchThread(ctx context.Context, accessToken, providerThreadID string) (*domainmail.Thread, []*domainmail.Message, error) {
	return nil, nil, nil
}
func (m *mockExternalMailProvider) FetchMessageBody(ctx context.Context, accessToken, providerMessageID string) (*domainmail.MessageBody, error) {
	return nil, nil
}
func (m *mockExternalMailProvider) SearchThreads(ctx context.Context, accessToken, query string, limit int) ([]*domainmail.Thread, error) {
	return []*domainmail.Thread{}, nil
}
func (m *mockExternalMailProvider) ModifyThread(ctx context.Context, accessToken, providerThreadID string, addLabelIDs, removeLabelIDs []string) error {
	return nil
}
func (m *mockExternalMailProvider) BatchModifyThreads(ctx context.Context, accessToken string, providerThreadIDs []string, addLabelIDs, removeLabelIDs []string) error {
	return nil
}
func (m *mockExternalMailProvider) CreateDraft(ctx context.Context, accessToken string, draft *domainmail.Draft) (*domainmail.Draft, error) {
	return draft, nil
}
func (m *mockExternalMailProvider) UpdateDraft(ctx context.Context, accessToken string, draft *domainmail.Draft) (*domainmail.Draft, error) {
	return draft, nil
}
func (m *mockExternalMailProvider) DeleteDraft(ctx context.Context, accessToken, providerDraftID string) error {
	return nil
}
func (m *mockExternalMailProvider) SendDraft(ctx context.Context, accessToken, providerDraftID string) (*domainmail.Message, error) {
	now := time.Now().UTC()
	return &domainmail.Message{
		Subject:    "Sent Draft",
		SentAt:     &now,
		ReceivedAt: now,
	}, nil
}
func (m *mockExternalMailProvider) OpenAttachmentStream(ctx context.Context, accessToken, providerMessageID, attachmentID string) (io.ReadCloser, string, int64, error) {
	return io.NopCloser(strings.NewReader("attachment binary content")), "application/octet-stream", 25, nil
}
func (m *mockExternalMailProvider) UploadDraftAttachment(ctx context.Context, accessToken, providerDraftID, filename, contentType string, r io.Reader) (*domainmail.AttachmentMeta, error) {
	return &domainmail.AttachmentMeta{
		ID:          "mat_uploaded",
		Filename:    filename,
		ContentType: contentType,
		Size:        100,
	}, nil
}

type mockThreadSummaryStore struct {
	summaries map[string]*domainmail.ThreadSummary
	upserts   []*domainmail.ThreadSummary
}

func newMockThreadSummaryStore() *mockThreadSummaryStore {
	return &mockThreadSummaryStore{summaries: make(map[string]*domainmail.ThreadSummary)}
}
func (m *mockThreadSummaryStore) Get(ctx context.Context, spaceID, threadID, language string) (*domainmail.ThreadSummary, error) {
	return m.summaries[spaceID+":"+threadID+":"+language], nil
}
func (m *mockThreadSummaryStore) Upsert(ctx context.Context, summary *domainmail.ThreadSummary) error {
	m.upserts = append(m.upserts, summary)
	m.summaries[summary.SpaceID+":"+summary.ThreadID+":"+summary.Language] = summary
	return nil
}

type mockSummaryFlowExecutor struct {
	calls     []appmail.SummarizeThreadFlowInput
	flowRunID string
	err       error
	saveInto  *mockThreadSummaryStore
	threadFn  func(spaceID, threadID string) *domainmail.Thread
}

var _ appmail.SummarizeFlowClient = (*mockSummaryFlowExecutor)(nil)

func (m *mockSummaryFlowExecutor) Execute(ctx context.Context, input appmail.SummarizeThreadFlowInput) (*platformworkflow.FlowRun, error) {
	m.calls = append(m.calls, input)
	if m.err != nil {
		return nil, m.err
	}
	if m.saveInto != nil && m.threadFn != nil {
		if th := m.threadFn("spc_1", input.ThreadID); th != nil {
			_ = m.saveInto.Upsert(ctx, &domainmail.ThreadSummary{
				ThreadID:      input.ThreadID,
				SpaceID:       "spc_1",
				Language:      input.Language,
				TLDR:          "flow summary",
				KeyPoints:     []string{"kp"},
				LastMessageID: "msg_last",
				LastMessageAt: th.LastMessageAt,
				MessageCount:  th.MessageCount,
			})
		}
	}
	return &platformworkflow.FlowRun{ID: m.flowRunID, Status: platformworkflow.RunCompleted}, nil
}

func newTestCoordinator(t *testing.T) (appmail.Coordinator, *mockMailboxStore, *mockThreadStore, *mockMessageStore, *mockDraftStore, *mockSyncStateStore) {
	mbxStore := newMockMailboxStore()
	thStore := newMockThreadStore()
	msgStore := newMockMessageStore()
	dftStore := newMockDraftStore()
	syncStore := newMockSyncStateStore()
	sumStore := newMockThreadSummaryStore()
	extProv := &mockExternalMailProvider{}

	domainService := domainmail.NewService(domainmail.Dependencies{
		MailboxStore:   mbxStore,
		ThreadStore:    thStore,
		MessageStore:   msgStore,
		DraftStore:     dftStore,
		SyncStateStore: syncStore,
	})

	coord := appmail.NewCoordinator(appmail.Dependencies{
		DomainService:  domainService,
		MailboxStore:   mbxStore,
		ThreadStore:    thStore,
		MessageStore:   msgStore,
		DraftStore:     dftStore,
		SyncStateStore: syncStore,
		SummaryStore:   sumStore,
		ExternalProviders: map[string]domainmail.ExternalMailProvider{
			"google": extProv,
		},
		Events: eventbus.NoopPublisher{},
		SummarizeFlow: &appmail.SummarizeFlowClientMock{
			ExecuteFunc: func(_ context.Context, _ appmail.SummarizeThreadFlowInput) (*platformworkflow.FlowRun, error) {
				return &platformworkflow.FlowRun{ID: "wfr_stub", Status: platformworkflow.RunCompleted}, nil
			},
		},
		HMACSecret: []byte("test-super-secret-hmac-key-32bytes"),
	})

	return coord, mbxStore, thStore, msgStore, dftStore, syncStore
}

func contextWithAuth(spaceID, role string) context.Context {
	ctx := context.Background()
	ctx = auth.WithSpaceID(ctx, spaceID)
	ctx = auth.WithSpaceRole(ctx, role)
	return ctx
}

func TestCoordinator_ViewerRole_Denial(t *testing.T) {
	coord, _, _, _, _, _ := newTestCoordinator(t)
	ctx := contextWithAuth("spc_1", string(space.RoleViewer))

	t.Run("CreateMailbox denied for viewer", func(t *testing.T) {
		_, err := coord.CreateMailbox(ctx, &appmail.CreateMailboxRequest{
			Mailbox: &domainmail.Mailbox{Name: "Forbidden"},
		})
		require.Error(t, err)
		assert.True(t, errors.Is(err, errors.Permission))
	})

	t.Run("ModifyThread denied for viewer", func(t *testing.T) {
		inbox := true
		_, err := coord.ModifyThread(ctx, &appmail.ModifyThreadRequest{
			ID:      "mth_1",
			InInbox: &inbox,
		})
		require.Error(t, err)
		assert.True(t, errors.Is(err, errors.Permission))
	})

	t.Run("CreateDraft denied for viewer", func(t *testing.T) {
		_, err := coord.CreateDraft(ctx, &appmail.CreateDraftRequest{
			Draft: &domainmail.Draft{Subject: "Test"},
		})
		require.Error(t, err)
		assert.True(t, errors.Is(err, errors.Permission))
	})

	t.Run("DeleteDraft denied for viewer", func(t *testing.T) {
		err := coord.DeleteDraft(ctx, &appmail.DeleteDraftRequest{ID: "mdf_1"})
		require.Error(t, err)
		assert.True(t, errors.Is(err, errors.Permission))
	})

	t.Run("SendDraft denied for viewer", func(t *testing.T) {
		_, err := coord.SendDraft(ctx, &appmail.SendDraftRequest{ID: "mdf_1"})
		require.Error(t, err)
		assert.True(t, errors.Is(err, errors.Permission))
	})

	t.Run("UploadDraftAttachment denied for viewer", func(t *testing.T) {
		_, err := coord.UploadDraftAttachment(ctx, &appmail.UploadDraftAttachmentRequest{
			DraftID: "mdf_1",
			Body:    bytes.NewReader([]byte("test")),
		})
		require.Error(t, err)
		assert.True(t, errors.Is(err, errors.Permission))
	})
}

func TestCoordinator_ModifyThread(t *testing.T) {
	coord, _, thStore, _, _, _ := newTestCoordinator(t)
	ctx := contextWithAuth("spc_1", string(space.RoleOwner))

	thID, err := domainmail.GenerateThreadID()
	require.NoError(t, err)

	provThreadID := "gm_th_100"
	thread := &domainmail.Thread{
		ID:                 thID,
		SpaceID:            "spc_1",
		ConnectedAccountID: "acc_1",
		ProviderThreadID:   &provThreadID,
		Subject:            "Important Discussion",
		InInbox:            true,
		IsStarred:          false,
		IsUnread:           true,
		LastMessageAt:      time.Now().UTC(),
	}
	require.NoError(t, thStore.Create(ctx, thread))

	starred := true
	unread := false
	inbox := false
	modified, err := coord.ModifyThread(ctx, &appmail.ModifyThreadRequest{
		ID:        thID,
		IsStarred: &starred,
		IsUnread:  &unread,
		InInbox:   &inbox,
	})
	require.NoError(t, err)
	assert.True(t, modified.IsStarred)
	assert.False(t, modified.IsUnread)
	assert.False(t, modified.InInbox)
}

func TestCoordinator_DraftLifecycle(t *testing.T) {
	coord, _, _, msgStore, dftStore, _ := newTestCoordinator(t)
	ctx := contextWithAuth("spc_1", string(space.RoleMember))

	// 1. Create Draft
	draft := &domainmail.Draft{
		ConnectedAccountID: "acc_1",
		Mode:               domainmail.DraftModeNew,
		From:               "me@example.com",
		To:                 []domainmail.Participant{{Name: "Boss", Email: "boss@example.com"}},
		Subject:            "Status Report",
		BodyHTML:           "<p>All systems operational.</p>",
	}
	created, err := coord.CreateDraft(ctx, &appmail.CreateDraftRequest{Draft: draft})
	require.NoError(t, err)
	assert.NotEmpty(t, created.ID)
	assert.Equal(t, "spc_1", created.SpaceID)

	// 2. Update Draft
	created.Subject = "Status Report - Q3 Final"
	updated, err := coord.UpdateDraft(ctx, &appmail.UpdateDraftRequest{
		ID:    created.ID,
		Draft: created,
	})
	require.NoError(t, err)
	assert.Equal(t, "Status Report - Q3 Final", updated.Subject)

	// 3. Send Draft
	sent, err := coord.SendDraft(ctx, &appmail.SendDraftRequest{ID: created.ID})
	require.NoError(t, err)
	assert.NotNil(t, sent)
	assert.Equal(t, "Status Report - Q3 Final", sent.Subject)

	// Verify draft is removed and message persisted
	d, err := dftStore.GetByID(ctx, "spc_1", created.ID)
	require.NoError(t, err)
	assert.Nil(t, d, "Draft should be deleted after sending")

	msg, err := msgStore.GetByID(ctx, "spc_1", sent.ID)
	require.NoError(t, err)
	assert.NotNil(t, msg, "Sent message should be persisted")
}

func TestAttachmentHMAC_TokenMintAndVerify(t *testing.T) {
	secret := []byte("secret-key-for-test-32-bytes-long!")

	claims := appmail.AttachmentTokenClaims{
		SpaceID:      "spc_123",
		MessageID:    "msg_456",
		AttachmentID: "att_789",
		Disposition:  "attachment",
		ExpiresAt:    time.Now().Add(5 * time.Minute).Unix(),
	}

	tokenStr, err := appmail.MintAttachmentToken(claims, secret)
	require.NoError(t, err)
	require.NotEmpty(t, tokenStr)

	// Verify valid token
	verified, err := appmail.VerifyAttachmentToken(tokenStr, secret)
	require.NoError(t, err)
	assert.Equal(t, "spc_123", verified.SpaceID)
	assert.Equal(t, "msg_456", verified.MessageID)
	assert.Equal(t, "att_789", verified.AttachmentID)
	assert.Equal(t, "attachment", verified.Disposition)

	// Verify expired token rejected
	expiredClaims := claims
	expiredClaims.ExpiresAt = time.Now().Add(-1 * time.Minute).Unix()
	expiredToken, err := appmail.MintAttachmentToken(expiredClaims, secret)
	require.NoError(t, err)

	_, err = appmail.VerifyAttachmentToken(expiredToken, secret)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "expired")

	// Verify tampered token rejected
	tamperedToken := tokenStr + "tampered"
	_, err = appmail.VerifyAttachmentToken(tamperedToken, secret)
	assert.Error(t, err)

	// Verify wrong secret rejected
	wrongSecret := []byte("different-secret-key-32-bytes-long!")
	_, err = appmail.VerifyAttachmentToken(tokenStr, wrongSecret)
	assert.Error(t, err)
}

func TestCoordinator_PruneWindowAndBodies(t *testing.T) {
	coord, _, thStore, msgStore, _, _ := newTestCoordinator(t)
	ctx := contextWithAuth("spc_1", string(space.RoleOwner))

	oldTime := time.Now().AddDate(0, 0, -100)
	thread := &domainmail.Thread{
		ID:            "mth_old",
		SpaceID:       "spc_1",
		LastMessageAt: oldTime,
		IsStarred:     false,
	}
	require.NoError(t, thStore.Create(ctx, thread))

	body := &domainmail.MessageBody{
		MessageID:     "msg_old",
		SpaceID:       "spc_1",
		SanitizedHTML: "<p>Old</p>",
		FetchedAt:     oldTime,
		ExpiresAt:     time.Now().Add(-1 * time.Hour),
	}
	require.NoError(t, msgStore.SaveBody(ctx, body))

	err := coord.PruneWindowAndBodies(ctx, &appmail.PruneWindowAndBodiesRequest{Now: time.Now().UTC()})
	require.NoError(t, err)

	// Verify thread metadata preserved while expired body evicted
	th, err := thStore.GetByID(ctx, "spc_1", "mth_old")
	require.NoError(t, err)
	assert.NotNil(t, th)

	// Verify expired body evicted
	b, err := msgStore.GetBody(ctx, "spc_1", "msg_old")
	require.NoError(t, err)
	assert.Nil(t, b)
}

func TestCoordinator_DeleteDraft_SyncedMessages(t *testing.T) {
	tests := []struct {
		name               string
		seedMessages       []*domainmail.Message
		deleteID           string
		wantErr            bool
		wantThreadDeleted  bool
		wantThreadInDrafts bool
		wantMsgCount       int
	}{
		{
			name: "deletes standalone synced draft message and removes empty thread",
			seedMessages: []*domainmail.Message{
				{
					ID:                 "msg_draft_solo",
					SpaceID:            "spc_1",
					ConnectedAccountID: "acc_1",
					ThreadID:           "mth_solo",
					ProviderMessageID:  new("gmail_msg_1"),
					IsDraft:            true,
					Subject:            "Solo Draft",
				},
			},
			deleteID:          "msg_draft_solo",
			wantErr:           false,
			wantThreadDeleted: true,
		},
		{
			name: "deletes reply draft in multi-message thread and clears InDrafts",
			seedMessages: []*domainmail.Message{
				{
					ID:                 "msg_orig",
					SpaceID:            "spc_1",
					ConnectedAccountID: "acc_1",
					ThreadID:           "mth_multi",
					IsDraft:            false,
					Subject:            "Original",
					Snippet:            "Hi",
				},
				{
					ID:                 "msg_draft_reply",
					SpaceID:            "spc_1",
					ConnectedAccountID: "acc_1",
					ThreadID:           "mth_multi",
					ProviderMessageID:  new("gmail_msg_2"),
					IsDraft:            true,
					Subject:            "Re: Original",
				},
			},
			deleteID:           "msg_draft_reply",
			wantErr:            false,
			wantThreadDeleted:  false,
			wantThreadInDrafts: false,
			wantMsgCount:       1,
		},
		{
			name: "rejects deleting non-draft message via DeleteDraft",
			seedMessages: []*domainmail.Message{
				{
					ID:                 "msg_sent",
					SpaceID:            "spc_1",
					ConnectedAccountID: "acc_1",
					ThreadID:           "mth_sent",
					IsDraft:            false,
				},
			},
			deleteID: "msg_sent",
			wantErr:  true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			coord, _, thStore, msgStore, _, _ := newTestCoordinator(t)
			ctx := contextWithAuth("spc_1", string(space.RoleMember))

			for _, m := range tc.seedMessages {
				require.NoError(t, msgStore.Create(ctx, m))
				existingTh, _ := thStore.GetByID(ctx, "spc_1", m.ThreadID)
				if existingTh == nil {
					require.NoError(t, thStore.Create(ctx, &domainmail.Thread{
						ID:                 m.ThreadID,
						SpaceID:            "spc_1",
						ConnectedAccountID: "acc_1",
						InDrafts:           m.IsDraft,
						MailboxIDs:         []string{"INBOX", "DRAFT"},
						MessageCount:       len(tc.seedMessages),
					}))
				} else if m.IsDraft {
					existingTh.InDrafts = true
					require.NoError(t, thStore.Update(ctx, existingTh))
				}
			}

			err := coord.DeleteDraft(ctx, &appmail.DeleteDraftRequest{ID: tc.deleteID})
			if tc.wantErr {
				require.Error(t, err)
				kept, _ := msgStore.GetByID(ctx, "spc_1", tc.deleteID)
				assert.NotNil(t, kept)
				return
			}

			require.NoError(t, err)
			deletedMsg, _ := msgStore.GetByID(ctx, "spc_1", tc.deleteID)
			assert.Nil(t, deletedMsg)

			threadID := tc.seedMessages[0].ThreadID
			th, _ := thStore.GetByID(ctx, "spc_1", threadID)
			if tc.wantThreadDeleted {
				assert.Nil(t, th)
			} else {
				require.NotNil(t, th)
				assert.Equal(t, tc.wantThreadInDrafts, th.InDrafts)
				assert.Equal(t, tc.wantMsgCount, th.MessageCount)
				assert.NotContains(t, th.MailboxIDs, "DRAFT")
			}
		})
	}
}

type mockAccountStore struct {
	connector.Store
	accounts map[string]*connector.ConnectedAccount
}

func (m *mockAccountStore) GetAccount(ctx context.Context, spaceID, accountID string) (*connector.ConnectedAccount, error) {
	acc, ok := m.accounts[accountID]
	if !ok || acc.SpaceID != spaceID {
		return nil, nil
	}
	return acc, nil
}

func (m *mockAccountStore) ListAccounts(ctx context.Context, spaceID string) ([]*connector.ConnectedAccount, error) {
	var list []*connector.ConnectedAccount
	for _, acc := range m.accounts {
		if acc.SpaceID == spaceID {
			list = append(list, acc)
		}
	}
	return list, nil
}

func TestCoordinator_SyncOlderThreads(t *testing.T) {
	cipher, err := crypto.NewCipher("12345678901234567890123456789012")
	require.NoError(t, err)
	encAccess, err := cipher.Encrypt("access-token-123")
	require.NoError(t, err)
	encRefresh, err := cipher.Encrypt("refresh-token-123")
	require.NoError(t, err)

	now := time.Now().UTC()
	cachedTime := now.Add(-10 * 24 * time.Hour)
	olderTime := now.Add(-120 * 24 * time.Hour)

	tests := []struct {
		name               string
		ctx                context.Context
		hasAccount         bool
		initialExhausted   []string
		providerResult     *domainmail.FetchOlderThreadsResult
		wantErr            bool
		wantProviderCalled bool
		wantSyncedCount    int
		wantHasMore        bool
		wantExhausted      bool
		wantBeforeTime     *time.Time
		wantOldestSaved    *time.Time
	}{
		{
			name:    "rejects missing space context",
			ctx:     context.Background(),
			wantErr: true,
		},
		{
			name:            "returns zero when no mail accounts exist",
			ctx:             contextWithAuth("spc_1", string(space.RoleMember)),
			hasAccount:      false,
			wantSyncedCount: 0,
			wantHasMore:     false,
		},
		{
			name:               "skips provider when bucket is already marked exhausted",
			ctx:                contextWithAuth("spc_1", string(space.RoleMember)),
			hasAccount:         true,
			initialExhausted:   []string{"inbox"},
			wantProviderCalled: false,
			wantSyncedCount:    0,
			wantHasMore:        false,
			wantExhausted:      true,
		},
		{
			name:               "backfills older threads beyond rolling window and updates oldest_synced_time",
			ctx:                contextWithAuth("spc_1", string(space.RoleMember)),
			hasAccount:         true,
			wantProviderCalled: true,
			providerResult: &domainmail.FetchOlderThreadsResult{
				Threads: []*domainmail.Thread{
					{
						ID:               "mth_temp_older",
						ProviderThreadID: new("gmail_th_older_1"),
						Subject:          "Older Email",
						InInbox:          true,
						LastMessageAt:    olderTime,
					},
				},
				Messages: []*domainmail.Message{
					{
						ID:                "msg_temp_older",
						ThreadID:          "mth_temp_older",
						ProviderMessageID: new("gmail_msg_older_1"),
						Subject:           "Older Email",
					},
				},
				HasMore:          false,
				OldestSyncedTime: &olderTime,
			},
			wantSyncedCount: 1,
			wantHasMore:     false,
			wantExhausted:   true,
			wantBeforeTime:  &cachedTime,
			wantOldestSaved: &olderTime,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			mbxStore := newMockMailboxStore()
			thStore := newMockThreadStore()
			msgStore := newMockMessageStore()
			dftStore := newMockDraftStore()
			syncStore := newMockSyncStateStore()
			accStore := &mockAccountStore{accounts: make(map[string]*connector.ConnectedAccount)}

			var capturedReq *domainmail.FetchOlderThreadsRequest
			providerCalled := false
			extProv := &mockExternalMailProvider{
				fetchOlderThreadsFunc: func(ctx context.Context, accessToken string, req *domainmail.FetchOlderThreadsRequest) (*domainmail.FetchOlderThreadsResult, error) {
					providerCalled = true
					capturedReq = req
					if tc.providerResult != nil {
						return tc.providerResult, nil
					}
					return &domainmail.FetchOlderThreadsResult{}, nil
				},
			}

			if tc.hasAccount {
				accStore.accounts["acc_1"] = &connector.ConnectedAccount{
					ID:                  "acc_1",
					SpaceID:             "spc_1",
					Provider:            "google",
					Status:              connector.AccountStatusHealthy,
					EnabledCapabilities: []string{string(connector.CapabilityMail)},
					AccessTokenEnc:      encAccess,
					RefreshTokenEnc:     encRefresh,
					TokenExpiry:         now.Add(1 * time.Hour),
				}
				require.NoError(t, thStore.Create(context.Background(), &domainmail.Thread{
					ID:                 "mth_existing",
					SpaceID:            "spc_1",
					ConnectedAccountID: "acc_1",
					ProviderThreadID:   new("gmail_th_existing"),
					InInbox:            true,
					LastMessageAt:      cachedTime,
				}))
				if len(tc.initialExhausted) > 0 {
					require.NoError(t, syncStore.Upsert(context.Background(), &domainmail.SyncState{
						ConnectedAccountID: "acc_1",
						SpaceID:            "spc_1",
						WindowDays:         90,
						ExhaustedBuckets:   tc.initialExhausted,
					}))
				}
			}

			tokenMgr := connector.NewTokenManager(accStore, cipher, connector.NewProviderRegistry(), nil)
			domainService := domainmail.NewService(domainmail.Dependencies{
				MailboxStore:   mbxStore,
				ThreadStore:    thStore,
				MessageStore:   msgStore,
				DraftStore:     dftStore,
				SyncStateStore: syncStore,
			})

			coord := appmail.NewCoordinator(appmail.Dependencies{
				DomainService:  domainService,
				MailboxStore:   mbxStore,
				ThreadStore:    thStore,
				MessageStore:   msgStore,
				DraftStore:     dftStore,
				SyncStateStore: syncStore,
				AccountStore:   accStore,
				TokenManager:   tokenMgr,
				ExternalProviders: map[string]domainmail.ExternalMailProvider{
					"google": extProv,
				},
				Events:     eventbus.NoopPublisher{},
				HMACSecret: []byte("test-super-secret-hmac-key-32bytes"),
			})

			bucket := domainmail.SystemBucketInbox
			res, callErr := coord.SyncOlderThreads(tc.ctx, &appmail.SyncOlderThreadsRequest{
				SystemBucket: &bucket,
				PageSize:     50,
			})
			if tc.wantErr {
				require.Error(t, callErr)
				return
			}
			require.NoError(t, callErr)
			assert.Equal(t, tc.wantProviderCalled, providerCalled)
			assert.Equal(t, tc.wantSyncedCount, res.SyncedCount)
			assert.Equal(t, tc.wantHasMore, res.HasMore)

			if tc.wantBeforeTime != nil {
				require.NotNil(t, capturedReq)
				require.NotNil(t, capturedReq.Before)
				assert.Equal(t, tc.wantBeforeTime.Unix(), capturedReq.Before.Unix())
				assert.Contains(t, capturedReq.ExcludeProviderIDs, "gmail_th_existing")
			}
			if tc.wantOldestSaved != nil {
				st, getErr := syncStore.Get(context.Background(), "spc_1", "acc_1")
				require.NoError(t, getErr)
				require.NotNil(t, st)
				require.NotNil(t, st.OldestSyncedTime)
				assert.Equal(t, tc.wantOldestSaved.Unix(), st.OldestSyncedTime.Unix())
			}
			if tc.wantExhausted {
				st, getErr := syncStore.Get(context.Background(), "spc_1", "acc_1")
				require.NoError(t, getErr)
				require.NotNil(t, st)
				assert.Contains(t, st.ExhaustedBuckets, "inbox")
			}
		})
	}
}

type mockAttachmentProvider struct {
	*mockExternalMailProvider
	createDraftFn func(ctx context.Context, accessToken string, draft *domainmail.Draft) (*domainmail.Draft, error)
	uploadFn      func(ctx context.Context, accessToken, providerDraftID, filename, contentType string, r io.Reader) (*domainmail.AttachmentMeta, error)
}

func (m *mockAttachmentProvider) CreateDraft(ctx context.Context, accessToken string, draft *domainmail.Draft) (*domainmail.Draft, error) {
	if m.createDraftFn != nil {
		return m.createDraftFn(ctx, accessToken, draft)
	}
	return m.mockExternalMailProvider.CreateDraft(ctx, accessToken, draft)
}

func (m *mockAttachmentProvider) UploadDraftAttachment(ctx context.Context, accessToken, providerDraftID, filename, contentType string, r io.Reader) (*domainmail.AttachmentMeta, error) {
	if m.uploadFn != nil {
		return m.uploadFn(ctx, accessToken, providerDraftID, filename, contentType, r)
	}
	return m.mockExternalMailProvider.UploadDraftAttachment(ctx, accessToken, providerDraftID, filename, contentType, r)
}

func TestCoordinator_UploadDraftAttachment(t *testing.T) {
	cipher, err := crypto.NewCipher("test-master-encryption-key-32b!!")
	require.NoError(t, err)
	encAccess, _ := cipher.Encrypt("access-token-1")
	encRefresh, _ := cipher.Encrypt("refresh-token-1")

	dftID1, err := domainmail.GenerateDraftID()
	require.NoError(t, err)
	dftID2, err := domainmail.GenerateDraftID()
	require.NoError(t, err)
	dftID3, err := domainmail.GenerateDraftID()
	require.NoError(t, err)

	tests := []struct {
		name               string
		initialDraft       *domainmail.Draft
		createDraftFn      func(ctx context.Context, accessToken string, draft *domainmail.Draft) (*domainmail.Draft, error)
		uploadFn           func(ctx context.Context, accessToken, providerDraftID, filename, contentType string, r io.Reader) (*domainmail.AttachmentMeta, error)
		wantErr            bool
		wantProviderDraft  string
		wantCreateDraftHit bool
	}{
		{
			name: "creates unsynced provider draft before uploading attachment",
			initialDraft: &domainmail.Draft{
				ID:                 dftID1,
				SpaceID:            "spc_1",
				ConnectedAccountID: "acc_1",
				ProviderDraftID:    nil,
				Mode:               domainmail.DraftModeNew,
				Subject:            "With Attachment",
			},
			createDraftFn: func(_ context.Context, _ string, draft *domainmail.Draft) (*domainmail.Draft, error) {
				copyDraft := *draft
				copyDraft.ProviderDraftID = new("gm_dft_created")
				copyDraft.ProviderMessageID = new("gm_msg_created")
				return &copyDraft, nil
			},
			uploadFn: func(_ context.Context, _ string, providerDraftID, filename, contentType string, r io.Reader) (*domainmail.AttachmentMeta, error) {
				if providerDraftID != "gm_dft_created" {
					t.Fatalf("expected created provider draft id, got %q", providerDraftID)
				}
				attID, err := domainmail.GenerateAttachmentID()
				if err != nil {
					t.Fatalf("GenerateAttachmentID failed: %v", err)
				}
				return &domainmail.AttachmentMeta{
					ID:          attID,
					Filename:    filename,
					ContentType: contentType,
					Size:        5,
				}, nil
			},
			wantProviderDraft:  "gm_dft_created",
			wantCreateDraftHit: true,
		},
		{
			name: "propagates provider UploadDraftAttachment error",
			initialDraft: &domainmail.Draft{
				ID:                 dftID2,
				SpaceID:            "spc_1",
				ConnectedAccountID: "acc_1",
				ProviderDraftID:    new("gm_dft_existing"),
				Mode:               domainmail.DraftModeNew,
				Subject:            "Synced",
			},
			uploadFn: func(_ context.Context, _ string, _ string, _ string, _ string, _ io.Reader) (*domainmail.AttachmentMeta, error) {
				return nil, errors.E(errors.Internal, "upstream upload failed")
			},
			wantErr: true,
		},
		{
			name: "propagates provider CreateDraft error for unsynced draft",
			initialDraft: &domainmail.Draft{
				ID:                 dftID3,
				SpaceID:            "spc_1",
				ConnectedAccountID: "acc_1",
				Mode:               domainmail.DraftModeNew,
				Subject:            "Unsynced",
			},
			createDraftFn: func(_ context.Context, _ string, _ *domainmail.Draft) (*domainmail.Draft, error) {
				return nil, errors.E(errors.Internal, "upstream create draft failed")
			},
			wantErr:            true,
			wantCreateDraftHit: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			mbxStore := newMockMailboxStore()
			thStore := newMockThreadStore()
			msgStore := newMockMessageStore()
			dftStore := newMockDraftStore()
			syncStore := newMockSyncStateStore()
			accStore := &mockAccountStore{accounts: make(map[string]*connector.ConnectedAccount)}

			accStore.accounts["acc_1"] = &connector.ConnectedAccount{
				ID:                  "acc_1",
				SpaceID:             "spc_1",
				Provider:            "google",
				Status:              connector.AccountStatusHealthy,
				EnabledCapabilities: []string{string(connector.CapabilityMail)},
				AccessTokenEnc:      encAccess,
				RefreshTokenEnc:     encRefresh,
				TokenExpiry:         time.Now().Add(1 * time.Hour),
			}

			require.NoError(t, dftStore.Create(context.Background(), tc.initialDraft))

			createHit := false
			extProv := &mockAttachmentProvider{
				mockExternalMailProvider: &mockExternalMailProvider{},
				createDraftFn: func(ctx context.Context, accessToken string, draft *domainmail.Draft) (*domainmail.Draft, error) {
					createHit = true
					return tc.createDraftFn(ctx, accessToken, draft)
				},
				uploadFn: tc.uploadFn,
			}

			tokenMgr := connector.NewTokenManager(accStore, cipher, connector.NewProviderRegistry(), nil)
			domainService := domainmail.NewService(domainmail.Dependencies{
				MailboxStore:   mbxStore,
				ThreadStore:    thStore,
				MessageStore:   msgStore,
				DraftStore:     dftStore,
				SyncStateStore: syncStore,
			})

			coord := appmail.NewCoordinator(appmail.Dependencies{
				DomainService:  domainService,
				MailboxStore:   mbxStore,
				ThreadStore:    thStore,
				MessageStore:   msgStore,
				DraftStore:     dftStore,
				SyncStateStore: syncStore,
				AccountStore:   accStore,
				TokenManager:   tokenMgr,
				ExternalProviders: map[string]domainmail.ExternalMailProvider{
					"google": extProv,
				},
				Events:     eventbus.NoopPublisher{},
				HMACSecret: []byte("test-super-secret-hmac-key-32bytes"),
			})

			ctx := contextWithAuth("spc_1", string(space.RoleMember))
			meta, uploadErr := coord.UploadDraftAttachment(ctx, &appmail.UploadDraftAttachmentRequest{
				DraftID:     tc.initialDraft.ID,
				Filename:    "hello.txt",
				ContentType: "text/plain",
				Body:        strings.NewReader("hello"),
			})
			assert.Equal(t, tc.wantCreateDraftHit, createHit)
			if tc.wantErr {
				require.Error(t, uploadErr)
				return
			}
			require.NoError(t, uploadErr)
			require.NotNil(t, meta)

			saved, err := dftStore.GetByID(context.Background(), "spc_1", tc.initialDraft.ID)
			require.NoError(t, err)
			require.NotNil(t, saved.ProviderDraftID)
			assert.Equal(t, tc.wantProviderDraft, *saved.ProviderDraftID)
			assert.Len(t, saved.Attachments, 1)
		})
	}
}

type mockModifyProvider struct {
	*mockExternalMailProvider
	capturedAdd    []string
	capturedRemove []string
}

func (m *mockModifyProvider) ModifyThread(ctx context.Context, accessToken, providerThreadID string, addLabelIDs, removeLabelIDs []string) error {
	m.capturedAdd = append([]string(nil), addLabelIDs...)
	m.capturedRemove = append([]string(nil), removeLabelIDs...)
	return nil
}

func TestCoordinator_ModifyThread_SpamAndMailboxIDMapping(t *testing.T) {
	cipher, err := crypto.NewCipher("test-master-encryption-key-32b!!")
	require.NoError(t, err)
	encAccess, _ := cipher.Encrypt("access-token-1")
	encRefresh, _ := cipher.Encrypt("refresh-token-1")

	mbxStore := newMockMailboxStore()
	thStore := newMockThreadStore()
	msgStore := newMockMessageStore()
	dftStore := newMockDraftStore()
	syncStore := newMockSyncStateStore()
	accStore := &mockAccountStore{accounts: make(map[string]*connector.ConnectedAccount)}

	accStore.accounts["acc_1"] = &connector.ConnectedAccount{
		ID:                  "acc_1",
		SpaceID:             "spc_1",
		Provider:            "google",
		Status:              connector.AccountStatusHealthy,
		EnabledCapabilities: []string{string(connector.CapabilityMail)},
		AccessTokenEnc:      encAccess,
		RefreshTokenEnc:     encRefresh,
		TokenExpiry:         time.Now().Add(1 * time.Hour),
	}

	require.NoError(t, mbxStore.Create(context.Background(), &domainmail.Mailbox{
		ID:                 "mbx_add_1",
		SpaceID:            "spc_1",
		ConnectedAccountID: "acc_1",
		ProviderMailboxID:  new("Label_Add"),
		Name:               "Receipts",
	}))
	require.NoError(t, mbxStore.Create(context.Background(), &domainmail.Mailbox{
		ID:                 "mbx_rm_1",
		SpaceID:            "spc_1",
		ConnectedAccountID: "acc_1",
		ProviderMailboxID:  new("Label_Rm"),
		Name:               "Todo",
	}))

	thID, err := domainmail.GenerateThreadID()
	require.NoError(t, err)

	require.NoError(t, thStore.Create(context.Background(), &domainmail.Thread{
		ID:                 thID,
		SpaceID:            "spc_1",
		ConnectedAccountID: "acc_1",
		ProviderThreadID:   new("gm_th_spam"),
		InInbox:            true,
		MailboxIDs:         []string{"mbx_rm_1"},
		LastMessageAt:      time.Now().UTC(),
	}))

	prov := &mockModifyProvider{mockExternalMailProvider: &mockExternalMailProvider{}}
	tokenMgr := connector.NewTokenManager(accStore, cipher, connector.NewProviderRegistry(), nil)
	domainService := domainmail.NewService(domainmail.Dependencies{
		MailboxStore:   mbxStore,
		ThreadStore:    thStore,
		MessageStore:   msgStore,
		DraftStore:     dftStore,
		SyncStateStore: syncStore,
	})
	coord := appmail.NewCoordinator(appmail.Dependencies{
		DomainService:  domainService,
		MailboxStore:   mbxStore,
		ThreadStore:    thStore,
		MessageStore:   msgStore,
		DraftStore:     dftStore,
		SyncStateStore: syncStore,
		AccountStore:   accStore,
		TokenManager:   tokenMgr,
		ExternalProviders: map[string]domainmail.ExternalMailProvider{
			"google": prov,
		},
		Events:     eventbus.NoopPublisher{},
		HMACSecret: []byte("test-super-secret-hmac-key-32bytes"),
	})

	ctx := contextWithAuth("spc_1", string(space.RoleMember))
	modified, err := coord.ModifyThread(ctx, &appmail.ModifyThreadRequest{
		ID:               thID,
		InSpam:           new(true),
		AddMailboxIDs:    []string{"mbx_add_1"},
		RemoveMailboxIDs: []string{"mbx_rm_1"},
	})
	require.NoError(t, err)
	assert.True(t, modified.InSpam)
	assert.False(t, modified.InInbox)
	assert.ElementsMatch(t, []string{"SPAM", "Label_Add"}, prov.capturedAdd)
	assert.ElementsMatch(t, []string{"INBOX", "Label_Rm"}, prov.capturedRemove)
}

func TestCoordinator_SaveThreadSummary(t *testing.T) {
	validSumID, err := domainmail.GenerateThreadID()
	require.NoError(t, err)

	tests := []struct {
		name    string
		ctx     context.Context
		req     *appmail.SaveThreadSummaryRequest
		wantErr bool
	}{
		{
			name:    "unauthenticated without space context",
			ctx:     context.Background(),
			req:     &appmail.SaveThreadSummaryRequest{Summary: &domainmail.ThreadSummary{ThreadID: "mth_1"}},
			wantErr: true,
		},
		{
			name:    "nil request rejected",
			ctx:     contextWithAuth("spc_1", string(space.RoleMember)),
			req:     nil,
			wantErr: true,
		},
		{
			name:    "nil summary rejected",
			ctx:     contextWithAuth("spc_1", string(space.RoleMember)),
			req:     &appmail.SaveThreadSummaryRequest{Summary: nil},
			wantErr: true,
		},
		{
			name: "invalid thread id rejected",
			ctx:  contextWithAuth("spc_1", string(space.RoleMember)),
			req: &appmail.SaveThreadSummaryRequest{Summary: &domainmail.ThreadSummary{
				ThreadID:      "bad_id",
				Language:      "en",
				LastMessageAt: time.Now().UTC(),
			}},
			wantErr: true,
		},
		{
			name: "valid summary persisted for viewer too",
			ctx:  contextWithAuth("spc_1", string(space.RoleViewer)),
			req: &appmail.SaveThreadSummaryRequest{Summary: &domainmail.ThreadSummary{
				ThreadID:      validSumID,
				Language:      "es",
				TLDR:          "Resumen",
				KeyPoints:     []string{"punto"},
				LastMessageAt: time.Now().UTC(),
				MessageCount:  1,
			}},
			wantErr: false,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			coord, _, _, _, _, _ := newTestCoordinator(t)

			got, err := coord.SaveThreadSummary(tc.ctx, tc.req)
			if tc.wantErr {
				assert.Error(t, err)
				return
			}
			require.NoError(t, err)
			require.NotNil(t, got)
			assert.Equal(t, "spc_1", got.SpaceID)
			assert.False(t, got.UpdateTime.IsZero())
		})
	}
}

func TestCoordinator_SummarizeThread(t *testing.T) {
	thSumID, err := domainmail.GenerateThreadID()
	require.NoError(t, err)

	tests := []struct {
		name          string
		ctx           context.Context
		req           *appmail.SummarizeThreadRequest
		setup         func(*mockThreadStore, *mockThreadSummaryStore, *mockSummaryFlowExecutor)
		wantErr       bool
		wantNotFound  bool
		wantFlowCalls int
		wantTLDR      string
	}{
		{
			name:    "missing thread id rejected",
			ctx:     contextWithAuth("spc_1", string(space.RoleViewer)),
			req:     &appmail.SummarizeThreadRequest{ID: "  "},
			wantErr: true,
		},
		{
			name:         "unknown thread returns not found",
			ctx:          contextWithAuth("spc_1", string(space.RoleMember)),
			req:          &appmail.SummarizeThreadRequest{ID: thSumID},
			setup:        func(_ *mockThreadStore, _ *mockThreadSummaryStore, _ *mockSummaryFlowExecutor) {},
			wantErr:      true,
			wantNotFound: true,
		},
		{
			name: "viewer can summarize cached fresh summary without flow run",
			ctx:  contextWithAuth("spc_1", string(space.RoleViewer)),
			req:  &appmail.SummarizeThreadRequest{ID: thSumID},
			setup: func(th *mockThreadStore, sum *mockThreadSummaryStore, _ *mockSummaryFlowExecutor) {
				now := time.Now().UTC()
				th.threads[thSumID] = &domainmail.Thread{ID: thSumID, SpaceID: "spc_1", LastMessageAt: now, MessageCount: 2}
				sum.summaries["spc_1:"+thSumID+":en"] = &domainmail.ThreadSummary{
					ThreadID: thSumID, SpaceID: "spc_1", Language: "en",
					TLDR: "cached", LastMessageAt: now, MessageCount: 2,
				}
			},
			wantErr:       false,
			wantFlowCalls: 0,
			wantTLDR:      "cached",
		},
		{
			name: "stale summary triggers flow and returns fresh summary",
			ctx:  contextWithAuth("spc_1", string(space.RoleMember)),
			req:  &appmail.SummarizeThreadRequest{ID: thSumID, Language: "es"},
			setup: func(th *mockThreadStore, sum *mockThreadSummaryStore, flow *mockSummaryFlowExecutor) {
				old := time.Now().UTC().Add(-2 * time.Hour)
				th.threads[thSumID] = &domainmail.Thread{ID: thSumID, SpaceID: "spc_1", LastMessageAt: time.Now().UTC(), MessageCount: 4}
				sum.summaries["spc_1:"+thSumID+":es"] = &domainmail.ThreadSummary{
					ThreadID: thSumID, SpaceID: "spc_1", Language: "es",
					TLDR: "old", LastMessageAt: old, MessageCount: 1,
				}
				flow.saveInto = sum
				flow.flowRunID = "frw_1"
				flow.threadFn = func(_, _ string) *domainmail.Thread {
					return &domainmail.Thread{ID: thSumID, SpaceID: "spc_1", LastMessageAt: old, MessageCount: 1}
				}
			},
			wantErr:       false,
			wantFlowCalls: 1,
			wantTLDR:      "flow summary",
		},
		{
			name: "force regenerate bypasses fresh cache",
			ctx:  contextWithAuth("spc_1", string(space.RoleOwner)),
			req:  &appmail.SummarizeThreadRequest{ID: thSumID, ForceRegenerate: true},
			setup: func(th *mockThreadStore, sum *mockThreadSummaryStore, flow *mockSummaryFlowExecutor) {
				now := time.Now().UTC()
				th.threads[thSumID] = &domainmail.Thread{ID: thSumID, SpaceID: "spc_1", LastMessageAt: now, MessageCount: 2}
				sum.summaries["spc_1:"+thSumID+":en"] = &domainmail.ThreadSummary{
					ThreadID: thSumID, SpaceID: "spc_1", Language: "en",
					TLDR: "cached", LastMessageAt: now, MessageCount: 2,
				}
				flow.saveInto = sum
				flow.flowRunID = "frw_2"
				flow.threadFn = func(_, _ string) *domainmail.Thread {
					return &domainmail.Thread{ID: thSumID, SpaceID: "spc_1", LastMessageAt: now, MessageCount: 2}
				}
			},
			wantErr:       false,
			wantFlowCalls: 1,
			wantTLDR:      "flow summary",
		},
		{
			name: "flow failure propagates",
			ctx:  contextWithAuth("spc_1", string(space.RoleMember)),
			req:  &appmail.SummarizeThreadRequest{ID: thSumID},
			setup: func(th *mockThreadStore, _ *mockThreadSummaryStore, flow *mockSummaryFlowExecutor) {
				th.threads[thSumID] = &domainmail.Thread{ID: thSumID, SpaceID: "spc_1", LastMessageAt: time.Now().UTC(), MessageCount: 1}
				flow.err = errors.E(errors.Internal, "llm unavailable")
			},
			wantErr: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			_, _, thStore, _, _, _ := newTestCoordinator(t)

			// Rebuild coordinator with instrumented summary flow executor.
			sumStore := newMockThreadSummaryStore()
			flowExec := &mockSummaryFlowExecutor{}
			domainService := domainmail.NewService(domainmail.Dependencies{
				ThreadStore: thStore,
			})
			instr := appmail.NewCoordinator(appmail.Dependencies{
				DomainService: domainService,
				ThreadStore:   thStore,
				SummaryStore:  sumStore,
				Events:        eventbus.NoopPublisher{},
				SummarizeFlow: flowExec,
				HMACSecret:    []byte("test-super-secret-hmac-key-32bytes"),
			})

			if tc.setup != nil {
				tc.setup(thStore, sumStore, flowExec)
			}

			got, err := instr.SummarizeThread(tc.ctx, tc.req)
			if tc.wantErr {
				require.Error(t, err)
				if tc.wantNotFound {
					assert.True(t, errors.Is(err, errors.NotExist))
				}
				return
			}
			require.NoError(t, err)
			require.NotNil(t, got)
			assert.Equal(t, tc.wantTLDR, got.TLDR)
			assert.Len(t, flowExec.calls, tc.wantFlowCalls)
		})
	}
}
