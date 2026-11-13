package mailaggregator_test

import (
	"context"
	"strings"
	"testing"
	"time"

	mailaggregator "github.com/masterkeysrd/saturn/internal/aggregator/mail"
	appmail "github.com/masterkeysrd/saturn/internal/application/mail"
	domainmail "github.com/masterkeysrd/saturn/internal/domain/mail"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type mockMailboxReader struct {
	mailboxes map[string]*domainmail.Mailbox
}

func (m *mockMailboxReader) GetByID(ctx context.Context, spaceID, id string) (*domainmail.Mailbox, error) {
	return m.mailboxes[id], nil
}

func (m *mockMailboxReader) ListBySpace(ctx context.Context, spaceID string, filter *domainmail.ListMailboxesFilter) ([]*domainmail.Mailbox, error) {
	var list []*domainmail.Mailbox
	for _, mbx := range m.mailboxes {
		list = append(list, mbx)
	}
	return list, nil
}

type mockThreadReader struct {
	threads map[string]*domainmail.Thread
}

func (m *mockThreadReader) GetByID(ctx context.Context, spaceID, id string) (*domainmail.Thread, error) {
	return m.threads[id], nil
}

func (m *mockThreadReader) GetByProviderID(ctx context.Context, spaceID, connectedAccountID, providerThreadID string) (*domainmail.Thread, error) {
	for _, th := range m.threads {
		if th.SpaceID == spaceID && th.ConnectedAccountID == connectedAccountID && th.ProviderThreadID != nil && *th.ProviderThreadID == providerThreadID {
			return th, nil
		}
	}
	return nil, nil
}

func (m *mockThreadReader) ListBySpace(ctx context.Context, spaceID string, filter *domainmail.ListThreadsFilter) ([]*domainmail.Thread, error) {
	var list []*domainmail.Thread
	for _, th := range m.threads {
		if filter != nil && filter.Query != "" && !strings.Contains(strings.ToLower(th.Subject), strings.ToLower(filter.Query)) {
			continue
		}
		list = append(list, th)
	}
	return list, nil
}

func (m *mockThreadReader) CountBySpace(ctx context.Context, spaceID string, filter *domainmail.ListThreadsFilter) (int, error) {
	l, _ := m.ListBySpace(ctx, spaceID, filter)
	return len(l), nil
}

func (m *mockThreadReader) Upsert(ctx context.Context, thread *domainmail.Thread) error {
	m.threads[thread.ID] = thread
	return nil
}

type mockMessageReader struct {
	messages map[string]*domainmail.Message
	bodies   map[string]*domainmail.MessageBody
}

func (m *mockMessageReader) GetByID(ctx context.Context, spaceID, id string) (*domainmail.Message, error) {
	return m.messages[id], nil
}

func (m *mockMessageReader) ListByThreadID(ctx context.Context, spaceID, threadID string) ([]*domainmail.Message, error) {
	var list []*domainmail.Message
	for _, msg := range m.messages {
		if msg.ThreadID == threadID {
			list = append(list, msg)
		}
	}
	return list, nil
}

func (m *mockMessageReader) GetBody(ctx context.Context, spaceID, messageID string) (*domainmail.MessageBody, error) {
	return m.bodies[messageID], nil
}

func (m *mockMessageReader) SaveBody(ctx context.Context, body *domainmail.MessageBody) error {
	m.bodies[body.MessageID] = body
	return nil
}

func (m *mockMessageReader) Upsert(ctx context.Context, msg *domainmail.Message) error {
	m.messages[msg.ID] = msg
	return nil
}

type mockDraftReader struct {
	drafts map[string]*domainmail.Draft
}

func (m *mockDraftReader) GetByID(ctx context.Context, spaceID, id string) (*domainmail.Draft, error) {
	return m.drafts[id], nil
}

func (m *mockDraftReader) ListBySpace(ctx context.Context, spaceID string, filter *domainmail.ListDraftsFilter) ([]*domainmail.Draft, error) {
	var list []*domainmail.Draft
	for _, d := range m.drafts {
		list = append(list, d)
	}
	return list, nil
}

func TestAggregator_GetThread_Hydration(t *testing.T) {
	thReader := &mockThreadReader{threads: make(map[string]*domainmail.Thread)}
	msgReader := &mockMessageReader{
		messages: make(map[string]*domainmail.Message),
		bodies:   make(map[string]*domainmail.MessageBody),
	}
	mbxReader := &mockMailboxReader{mailboxes: make(map[string]*domainmail.Mailbox)}
	dftReader := &mockDraftReader{drafts: make(map[string]*domainmail.Draft)}

	secret := []byte("secret-key-32-bytes-long-for-testing")
	service := mailaggregator.NewService(
		mbxReader,
		thReader,
		msgReader,
		dftReader,
		nil,
		nil,
		nil,
		secret,
	)

	ctx := context.Background()
	spaceID := "spc_1"
	threadID := "mth_100"

	thread := &domainmail.Thread{
		ID:            threadID,
		SpaceID:       spaceID,
		Subject:       "Hydration Test",
		LastMessageAt: time.Now().UTC(),
	}
	thReader.threads[threadID] = thread

	msgID := "msg_100"
	msg := &domainmail.Message{
		ID:       msgID,
		SpaceID:  spaceID,
		ThreadID: threadID,
		Subject:  "Hydration Test",
		Attachments: []domainmail.AttachmentMeta{
			{
				ID:          "mat_1",
				Filename:    "report.pdf",
				ContentType: "application/pdf",
				Size:        1024,
			},
		},
	}
	msgReader.messages[msgID] = msg

	// Cached body
	msgReader.bodies[msgID] = &domainmail.MessageBody{
		MessageID:     msgID,
		SpaceID:       spaceID,
		SanitizedHTML: "<p>Safe email content</p>",
		PlainText:     "Safe email content",
		ExpiresAt:     time.Now().Add(1 * time.Hour),
	}

	projection, err := service.GetThread(ctx, spaceID, threadID)
	require.NoError(t, err)
	assert.Equal(t, threadID, projection.Thread.ID)
	require.Len(t, projection.Messages, 1)

	hydratedMsg := projection.Messages[0]
	assert.Equal(t, "<p>Safe email content</p>", hydratedMsg.BodyHTML)
	assert.Equal(t, "Safe email content", hydratedMsg.BodyPlain)

	require.Len(t, hydratedMsg.Attachments, 1)
	attProj := hydratedMsg.Attachments[0]
	assert.Equal(t, "report.pdf", attProj.Meta.Filename)
	assert.True(t, strings.HasPrefix(attProj.DownloadURL, "/api/v1/mail/attachments/") || strings.HasPrefix(attProj.DownloadURL, "/v1/mail/attachments/"))

	// Verify the minted HMAC download URL
	tokenStr := strings.TrimPrefix(strings.TrimPrefix(attProj.DownloadURL, "/api"), "/v1/mail/attachments/")
	claims, err := appmail.VerifyAttachmentToken(tokenStr, secret)
	require.NoError(t, err)
	assert.Equal(t, spaceID, claims.SpaceID)
	assert.Equal(t, msgID, claims.MessageID)
	assert.Equal(t, "mat_1", claims.AttachmentID)
}

func TestAggregator_ListThreads_LocalAndHybrid(t *testing.T) {
	thReader := &mockThreadReader{threads: make(map[string]*domainmail.Thread)}
	msgReader := &mockMessageReader{
		messages: make(map[string]*domainmail.Message),
		bodies:   make(map[string]*domainmail.MessageBody),
	}
	mbxReader := &mockMailboxReader{mailboxes: make(map[string]*domainmail.Mailbox)}
	dftReader := &mockDraftReader{drafts: make(map[string]*domainmail.Draft)}

	secret := []byte("secret-key-32-bytes-long-for-testing")
	service := mailaggregator.NewService(
		mbxReader,
		thReader,
		msgReader,
		dftReader,
		nil,
		nil,
		nil,
		secret,
	)

	ctx := context.Background()
	spaceID := "spc_1"

	th1 := &domainmail.Thread{
		ID:            "mth_1",
		SpaceID:       spaceID,
		Subject:       "Quarterly Budget",
		LastMessageAt: time.Now().Add(-1 * time.Hour),
	}
	th2 := &domainmail.Thread{
		ID:            "mth_2",
		SpaceID:       spaceID,
		Subject:       "Weekly Sync",
		LastMessageAt: time.Now().Add(-2 * time.Hour),
	}
	thReader.threads["mth_1"] = th1
	thReader.threads["mth_2"] = th2

	// Normal list (query empty)
	threads, total, err := service.ListThreads(ctx, spaceID, &domainmail.ListThreadsFilter{Limit: 10})
	require.NoError(t, err)
	assert.Equal(t, 2, total)
	assert.Len(t, threads, 2)

	// Filter with query matching "Budget"
	threads, total, err = service.ListThreads(ctx, spaceID, &domainmail.ListThreadsFilter{Query: "Budget", Limit: 10})
	require.NoError(t, err)
	assert.Equal(t, 1, total)
	require.Len(t, threads, 1)
	assert.Equal(t, "Quarterly Budget", threads[0].Subject)
}
