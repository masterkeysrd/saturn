package mail_test

import (
	"bytes"
	"context"
	"io"
	"strings"
	"testing"
	"time"

	appmail "github.com/masterkeysrd/saturn/internal/application/mail"
	domainmail "github.com/masterkeysrd/saturn/internal/domain/mail"
	"github.com/masterkeysrd/saturn/internal/domain/space"
	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
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
		if th.SpaceID == spaceID {
			list = append(list, th)
		}
	}
	return list, nil
}
func (m *mockThreadStore) CountBySpace(ctx context.Context, spaceID string, filter *domainmail.ListThreadsFilter) (int, error) {
	list, err := m.ListBySpace(ctx, spaceID, filter)
	return len(list), err
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

type mockExternalMailProvider struct{}

func (m *mockExternalMailProvider) Provider() string { return "google" }
func (m *mockExternalMailProvider) ListMailboxes(ctx context.Context, accessToken string) ([]*domainmail.Mailbox, error) {
	return []*domainmail.Mailbox{}, nil
}
func (m *mockExternalMailProvider) SyncThreads(ctx context.Context, accessToken string, req *domainmail.SyncThreadsRequest) (*domainmail.SyncThreadsResult, error) {
	return &domainmail.SyncThreadsResult{}, nil
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

func newTestCoordinator(t *testing.T) (appmail.Coordinator, *mockMailboxStore, *mockThreadStore, *mockMessageStore, *mockDraftStore, *mockSyncStateStore) {
	mbxStore := newMockMailboxStore()
	thStore := newMockThreadStore()
	msgStore := newMockMessageStore()
	dftStore := newMockDraftStore()
	syncStore := newMockSyncStateStore()
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
		ExternalProviders: map[string]domainmail.ExternalMailProvider{
			"google": extProv,
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

	// Verify old thread pruned
	th, err := thStore.GetByID(ctx, "spc_1", "mth_old")
	require.NoError(t, err)
	assert.Nil(t, th)

	// Verify expired body evicted
	b, err := msgStore.GetBody(ctx, "spc_1", "msg_old")
	require.NoError(t, err)
	assert.Nil(t, b)
}
