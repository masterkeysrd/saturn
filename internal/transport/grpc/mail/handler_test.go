package mail_test

import (
	"context"
	"testing"
	"time"

	mailv1 "github.com/masterkeysrd/saturn/apis/saturn/mail/v1"
	mailaggregator "github.com/masterkeysrd/saturn/internal/aggregator/mail"
	appmail "github.com/masterkeysrd/saturn/internal/application/mail"
	domainmail "github.com/masterkeysrd/saturn/internal/domain/mail"
	"github.com/masterkeysrd/saturn/internal/domain/space"
	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	grpcmail "github.com/masterkeysrd/saturn/internal/transport/grpc/mail"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type mockCoordinator struct {
	appmail.Coordinator
	createdMailbox      *domainmail.Mailbox
	updatedMailbox      *domainmail.Mailbox
	modifiedThread      *domainmail.Thread
	syncOlderThreadsRes *appmail.SyncOlderThreadsResult
	syncOlderThreadsReq *appmail.SyncOlderThreadsRequest
	syncOlderThreadsFn  func(ctx context.Context, req *appmail.SyncOlderThreadsRequest) (*appmail.SyncOlderThreadsResult, error)
	createdDraft        *domainmail.Draft
	updatedDraft        *domainmail.Draft
	sentMessage         *domainmail.Message
}

func (m *mockCoordinator) CreateMailbox(ctx context.Context, req *appmail.CreateMailboxRequest) (*domainmail.Mailbox, error) {
	return m.createdMailbox, nil
}
func (m *mockCoordinator) UpdateMailbox(ctx context.Context, req *appmail.UpdateMailboxRequest) (*domainmail.Mailbox, error) {
	return m.updatedMailbox, nil
}
func (m *mockCoordinator) DeleteMailbox(ctx context.Context, req *appmail.DeleteMailboxRequest) error {
	return nil
}
func (m *mockCoordinator) ModifyThread(ctx context.Context, req *appmail.ModifyThreadRequest) (*domainmail.Thread, error) {
	return m.modifiedThread, nil
}
func (m *mockCoordinator) BatchModifyThreads(ctx context.Context, req *appmail.BatchModifyThreadsRequest) error {
	return nil
}
func (m *mockCoordinator) SyncOlderThreads(ctx context.Context, req *appmail.SyncOlderThreadsRequest) (*appmail.SyncOlderThreadsResult, error) {
	m.syncOlderThreadsReq = req
	if m.syncOlderThreadsFn != nil {
		return m.syncOlderThreadsFn(ctx, req)
	}
	if m.syncOlderThreadsRes != nil {
		return m.syncOlderThreadsRes, nil
	}
	return &appmail.SyncOlderThreadsResult{}, nil
}
func (m *mockCoordinator) CreateDraft(ctx context.Context, req *appmail.CreateDraftRequest) (*domainmail.Draft, error) {
	return m.createdDraft, nil
}
func (m *mockCoordinator) UpdateDraft(ctx context.Context, req *appmail.UpdateDraftRequest) (*domainmail.Draft, error) {
	return m.updatedDraft, nil
}
func (m *mockCoordinator) DeleteDraft(ctx context.Context, req *appmail.DeleteDraftRequest) error {
	return nil
}
func (m *mockCoordinator) SendDraft(ctx context.Context, req *appmail.SendDraftRequest) (*domainmail.Message, error) {
	return m.sentMessage, nil
}

type mockMailboxReader struct{}

func (m *mockMailboxReader) GetByID(ctx context.Context, spaceID, id string) (*domainmail.Mailbox, error) {
	return &domainmail.Mailbox{ID: id, SpaceID: spaceID, Name: "Test Box", SystemRole: domainmail.SystemBucketCustom}, nil
}
func (m *mockMailboxReader) ListBySpace(ctx context.Context, spaceID string, filter *domainmail.ListMailboxesFilter) ([]*domainmail.Mailbox, error) {
	return []*domainmail.Mailbox{
		{ID: "mbx_1", SpaceID: spaceID, Name: "Inbox", SystemRole: domainmail.SystemBucketInbox},
	}, nil
}

type mockThreadReader struct {
	threads []*domainmail.Thread
}

func (m *mockThreadReader) GetByID(ctx context.Context, spaceID, id string) (*domainmail.Thread, error) {
	now := time.Now().UTC()
	return &domainmail.Thread{ID: id, SpaceID: spaceID, Subject: "Thread 1", LastMessageAt: now}, nil
}
func (m *mockThreadReader) GetByProviderID(ctx context.Context, spaceID, connectedAccountID, providerThreadID string) (*domainmail.Thread, error) {
	now := time.Now().UTC()
	return &domainmail.Thread{ID: "mth_1", SpaceID: spaceID, Subject: "Thread 1", LastMessageAt: now}, nil
}
func (m *mockThreadReader) ListBySpace(ctx context.Context, spaceID string, filter *domainmail.ListThreadsFilter) ([]*domainmail.Thread, error) {
	if len(m.threads) > 0 {
		start := min(filter.Offset, len(m.threads))
		end := min(start+filter.Limit, len(m.threads))
		return m.threads[start:end], nil
	}
	now := time.Now().UTC()
	return []*domainmail.Thread{
		{ID: "mth_1", SpaceID: spaceID, Subject: "Thread 1", LastMessageAt: now},
	}, nil
}
func (m *mockThreadReader) CountBySpace(ctx context.Context, spaceID string, filter *domainmail.ListThreadsFilter) (int, error) {
	if len(m.threads) > 0 {
		return len(m.threads), nil
	}
	return 1, nil
}
func (m *mockThreadReader) Upsert(ctx context.Context, thread *domainmail.Thread) error {
	return nil
}

type mockMessageReader struct{}

func (m *mockMessageReader) GetByID(ctx context.Context, spaceID, id string) (*domainmail.Message, error) {
	return &domainmail.Message{ID: id, SpaceID: spaceID, Subject: "Msg"}, nil
}
func (m *mockMessageReader) ListByThreadID(ctx context.Context, spaceID, threadID string) ([]*domainmail.Message, error) {
	return []*domainmail.Message{
		{ID: "msg_1", SpaceID: spaceID, ThreadID: threadID, Subject: "Msg 1"},
	}, nil
}
func (m *mockMessageReader) GetBody(ctx context.Context, spaceID, messageID string) (*domainmail.MessageBody, error) {
	return &domainmail.MessageBody{MessageID: messageID, SpaceID: spaceID, SanitizedHTML: "<p>body</p>"}, nil
}
func (m *mockMessageReader) SaveBody(ctx context.Context, body *domainmail.MessageBody) error {
	return nil
}
func (m *mockMessageReader) Upsert(ctx context.Context, msg *domainmail.Message) error {
	return nil
}

type mockDraftReader struct{}

func (m *mockDraftReader) GetByID(ctx context.Context, spaceID, id string) (*domainmail.Draft, error) {
	return &domainmail.Draft{ID: id, SpaceID: spaceID, Subject: "Draft 1"}, nil
}
func (m *mockDraftReader) ListBySpace(ctx context.Context, spaceID string, filter *domainmail.ListDraftsFilter) ([]*domainmail.Draft, error) {
	return []*domainmail.Draft{
		{ID: "mdf_1", SpaceID: spaceID, Subject: "Draft 1"},
	}, nil
}

func contextWithAuth(spaceID string) context.Context {
	ctx := context.Background()
	ctx = auth.WithSpaceID(ctx, spaceID)
	ctx = auth.WithSpaceRole(ctx, string(space.RoleOwner))
	return ctx
}

func TestHandler_MailboxOperations(t *testing.T) {
	coord := &mockCoordinator{
		createdMailbox: &domainmail.Mailbox{ID: "mbx_created", Name: "Projects", SystemRole: domainmail.SystemBucketCustom},
		updatedMailbox: &domainmail.Mailbox{ID: "mbx_updated", Name: "Projects Updated", SystemRole: domainmail.SystemBucketCustom},
	}
	agg := mailaggregator.NewService(
		&mockMailboxReader{},
		&mockThreadReader{},
		&mockMessageReader{},
		&mockDraftReader{},
		nil,
		nil,
		nil,
		[]byte("secret"),
	)

	handler := grpcmail.NewHandler(coord, agg)
	ctx := contextWithAuth("spc_1")

	// ListMailboxes
	listResp, err := handler.ListMailboxes(ctx, &mailv1.ListMailboxesRequest{})
	require.NoError(t, err)
	require.Len(t, listResp.Mailboxes, 1)
	assert.Equal(t, "mbx_1", listResp.Mailboxes[0].Id)

	// CreateMailbox
	created, err := handler.CreateMailbox(ctx, &mailv1.CreateMailboxRequest{
		Mailbox: &mailv1.Mailbox{Name: "Projects"},
	})
	require.NoError(t, err)
	assert.Equal(t, "mbx_created", created.Id)

	// UpdateMailbox
	updated, err := handler.UpdateMailbox(ctx, &mailv1.UpdateMailboxRequest{
		Id:      "mbx_created",
		Mailbox: &mailv1.Mailbox{Name: "Projects Updated"},
	})
	require.NoError(t, err)
	assert.Equal(t, "mbx_updated", updated.Id)

	// DeleteMailbox
	_, err = handler.DeleteMailbox(ctx, &mailv1.DeleteMailboxRequest{Id: "mbx_created"})
	require.NoError(t, err)
}

func TestHandler_ThreadOperations(t *testing.T) {
	now := time.Now().UTC()
	coord := &mockCoordinator{
		modifiedThread: &domainmail.Thread{ID: "mth_1", Subject: "Thread 1", InInbox: false, LastMessageAt: now},
	}
	agg := mailaggregator.NewService(
		&mockMailboxReader{},
		&mockThreadReader{},
		&mockMessageReader{},
		&mockDraftReader{},
		nil,
		nil,
		nil,
		[]byte("secret"),
	)

	handler := grpcmail.NewHandler(coord, agg)
	ctx := contextWithAuth("spc_1")

	// ListThreads
	listResp, err := handler.ListThreads(ctx, &mailv1.ListThreadsRequest{PageSize: 10})
	require.NoError(t, err)
	require.Len(t, listResp.Threads, 1)

	// GetThread
	th, err := handler.GetThread(ctx, &mailv1.GetThreadRequest{Id: "mth_1"})
	require.NoError(t, err)
	assert.Equal(t, "mth_1", th.Id)
	require.Len(t, th.Messages, 1)
	assert.Equal(t, "<p>body</p>", th.Messages[0].BodyHtml)

	// ModifyThread
	inbox := false
	modified, err := handler.ModifyThread(ctx, &mailv1.ModifyThreadRequest{
		Id:      "mth_1",
		InInbox: &inbox,
	})
	require.NoError(t, err)
	assert.False(t, modified.InInbox)

	// BatchModifyThreads
	_, err = handler.BatchModifyThreads(ctx, &mailv1.BatchModifyThreadsRequest{
		Ids:     []string{"mth_1"},
		InInbox: &inbox,
	})
	require.NoError(t, err)
}

func TestHandler_DraftOperations(t *testing.T) {
	now := time.Now().UTC()
	coord := &mockCoordinator{
		createdDraft: &domainmail.Draft{ID: "mdf_1", Subject: "New Draft"},
		updatedDraft: &domainmail.Draft{ID: "mdf_1", Subject: "Updated Draft"},
		sentMessage:  &domainmail.Message{ID: "msg_sent", Subject: "Sent", SentAt: &now, ReceivedAt: now},
	}
	agg := mailaggregator.NewService(
		&mockMailboxReader{},
		&mockThreadReader{},
		&mockMessageReader{},
		&mockDraftReader{},
		nil,
		nil,
		nil,
		[]byte("secret"),
	)

	handler := grpcmail.NewHandler(coord, agg)
	ctx := contextWithAuth("spc_1")

	// ListDrafts
	listResp, err := handler.ListDrafts(ctx, &mailv1.ListDraftsRequest{})
	require.NoError(t, err)
	require.Len(t, listResp.Drafts, 1)

	// GetDraft
	d, err := handler.GetDraft(ctx, &mailv1.GetDraftRequest{Id: "mdf_1"})
	require.NoError(t, err)
	assert.Equal(t, "mdf_1", d.Id)

	// CreateDraft
	created, err := handler.CreateDraft(ctx, &mailv1.CreateDraftRequest{
		Draft: &mailv1.Draft{Subject: "New Draft"},
	})
	require.NoError(t, err)
	assert.Equal(t, "mdf_1", created.Id)

	// UpdateDraft
	updated, err := handler.UpdateDraft(ctx, &mailv1.UpdateDraftRequest{
		Id:    "mdf_1",
		Draft: &mailv1.Draft{Subject: "Updated Draft"},
	})
	require.NoError(t, err)
	assert.Equal(t, "mdf_1", updated.Id)

	// SendDraft
	sent, err := handler.SendDraft(ctx, &mailv1.SendDraftRequest{Id: "mdf_1"})
	require.NoError(t, err)
	assert.Equal(t, "msg_sent", sent.Id)

	// DeleteDraft
	_, err = handler.DeleteDraft(ctx, &mailv1.DeleteDraftRequest{Id: "mdf_1"})
	require.NoError(t, err)
}

func TestHandler_ListThreadsPagination(t *testing.T) {
	now := time.Now().UTC()
	allThreads := []*domainmail.Thread{
		{ID: "mth_1", SpaceID: "spc_1", Subject: "T1", LastMessageAt: now},
		{ID: "mth_2", SpaceID: "spc_1", Subject: "T2", LastMessageAt: now},
		{ID: "mth_3", SpaceID: "spc_1", Subject: "T3", LastMessageAt: now},
	}

	agg := mailaggregator.NewService(
		&mockMailboxReader{},
		&mockThreadReader{threads: allThreads},
		&mockMessageReader{},
		&mockDraftReader{},
		nil,
		nil,
		nil,
		[]byte("secret"),
	)
	handler := grpcmail.NewHandler(&mockCoordinator{}, agg)
	ctx := contextWithAuth("spc_1")

	tests := []struct {
		name          string
		pageSize      int32
		pageToken     string
		wantIDs       []string
		wantNextToken string
		wantTotal     int32
	}{
		{
			name:          "first page returns next_page_token",
			pageSize:      2,
			pageToken:     "",
			wantIDs:       []string{"mth_1", "mth_2"},
			wantNextToken: "2",
			wantTotal:     3,
		},
		{
			name:          "second page using page_token returns remaining thread and empty next_page_token",
			pageSize:      2,
			pageToken:     "2",
			wantIDs:       []string{"mth_3"},
			wantNextToken: "",
			wantTotal:     3,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			resp, err := handler.ListThreads(ctx, &mailv1.ListThreadsRequest{
				PageSize:  tc.pageSize,
				PageToken: tc.pageToken,
			})
			require.NoError(t, err)
			assert.Equal(t, tc.wantTotal, resp.TotalSize)
			assert.Equal(t, tc.wantNextToken, resp.NextPageToken)

			gotIDs := make([]string, len(resp.Threads))
			for i, th := range resp.Threads {
				gotIDs[i] = th.Id
			}
			assert.Equal(t, tc.wantIDs, gotIDs)
		})
	}
}

func TestHandler_ListThreadsReadThroughBackfill(t *testing.T) {
	now := time.Now().UTC()
	thReader := &mockThreadReader{
		threads: []*domainmail.Thread{
			{ID: "mth_1", SpaceID: "spc_1", Subject: "T1", LastMessageAt: now},
			{ID: "mth_2", SpaceID: "spc_1", Subject: "T2", LastMessageAt: now.Add(-time.Minute)},
		},
	}

	coord := &mockCoordinator{
		syncOlderThreadsFn: func(ctx context.Context, req *appmail.SyncOlderThreadsRequest) (*appmail.SyncOlderThreadsResult, error) {
			thReader.threads = append(thReader.threads, &domainmail.Thread{
				ID:            "mth_3",
				SpaceID:       "spc_1",
				Subject:       "T3 (Backfilled)",
				LastMessageAt: now.Add(-2 * time.Minute),
			})
			return &appmail.SyncOlderThreadsResult{
				SyncedCount: 1,
				HasMore:     true,
			}, nil
		},
	}

	agg := mailaggregator.NewService(&mockMailboxReader{}, thReader, &mockMessageReader{}, &mockDraftReader{}, nil, nil, nil, []byte("secret"))
	handler := grpcmail.NewHandler(coord, agg)
	ctx := contextWithAuth("spc_1")

	// Page 1 (limit=1, offset=0 < total 2): should NOT trigger backfill
	resp1, err := handler.ListThreads(ctx, &mailv1.ListThreadsRequest{
		SystemBucket: mailv1.MailboxRole_MAILBOX_ROLE_INBOX,
		PageSize:     1,
	})
	require.NoError(t, err)
	assert.Nil(t, coord.syncOlderThreadsReq)
	assert.Equal(t, "1", resp1.NextPageToken)

	// Page 2 (limit=2, offset=1 -> reaches end of cached 2 rows): should backfill mth_3 and return nextPageToken="3"
	resp2, err := handler.ListThreads(ctx, &mailv1.ListThreadsRequest{
		SystemBucket: mailv1.MailboxRole_MAILBOX_ROLE_INBOX,
		PageSize:     2,
		PageToken:    "1",
	})
	require.NoError(t, err)
	require.NotNil(t, coord.syncOlderThreadsReq)
	assert.Equal(t, domainmail.SystemBucketInbox, *coord.syncOlderThreadsReq.SystemBucket)
	require.Len(t, resp2.Threads, 2)
	assert.Equal(t, "mth_2", resp2.Threads[0].Id)
	assert.Equal(t, "mth_3", resp2.Threads[1].Id)
	assert.Equal(t, "3", resp2.NextPageToken)
}
