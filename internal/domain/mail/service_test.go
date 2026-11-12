package mail

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestMailService(t *testing.T) {
	ctx := context.Background()

	t.Run("CreateMailbox", func(t *testing.T) {
		var createdMailbox *Mailbox
		mockMbxStore := &MailboxStoreMock{
			CreateFunc: func(ctx context.Context, mailbox *Mailbox) error {
				createdMailbox = mailbox
				return nil
			},
		}

		svc := NewService(Dependencies{
			MailboxStore: mockMbxStore,
		})

		mbx := &Mailbox{
			SpaceID:            "spc_1",
			ConnectedAccountID: "acc_1",
			Name:               "Custom Label",
			SystemRole:         SystemBucketCustom,
		}

		err := svc.CreateMailbox(ctx, mbx)
		require.NoError(t, err)
		assert.NotEmpty(t, mbx.ID)
		assert.Equal(t, "Custom Label", createdMailbox.Name)
	})

	t.Run("RecomputeThread aggregates messages and updates thread", func(t *testing.T) {
		threadID, _ := GenerateThreadID()
		existingThread := &Thread{
			ID:                 threadID,
			SpaceID:            "spc_1",
			ConnectedAccountID: "acc_1",
			LastMessageAt:      time.Now().Add(-1 * time.Hour),
		}

		var updatedThread *Thread
		mockThreadStore := &ThreadStoreMock{
			GetByIDFunc: func(ctx context.Context, spaceID, id string) (*Thread, error) {
				return existingThread, nil
			},
			UpdateFunc: func(ctx context.Context, thread *Thread) error {
				updatedThread = thread
				return nil
			},
		}

		now := time.Now().UTC()
		mockMsgStore := &MessageStoreMock{
			ListByThreadIDFunc: func(ctx context.Context, spaceID, threadID string) ([]*Message, error) {
				return []*Message{
					{
						ID:         "msg_1",
						Subject:    "Thread Subject",
						Snippet:    "Latest text",
						ReceivedAt: now,
						From:       Participant{Name: "Alice", Email: "alice@example.com"},
						IsUnread:   true,
					},
				}, nil
			},
		}

		svc := NewService(Dependencies{
			ThreadStore:  mockThreadStore,
			MessageStore: mockMsgStore,
		})

		recomputed, err := svc.RecomputeThread(ctx, "spc_1", threadID)
		require.NoError(t, err)
		assert.True(t, recomputed.IsUnread)
		assert.Equal(t, "Thread Subject", recomputed.Subject)
		assert.Equal(t, "Latest text", recomputed.Snippet)
		assert.Equal(t, 1, recomputed.MessageCount)
		assert.NotNil(t, updatedThread)
	})

	t.Run("PurgeConnectedAccountData purges all data across stores", func(t *testing.T) {
		var draftsPurged, msgsPurged, threadsPurged, mbxPurged, syncPurged bool

		mockDraftStore := &DraftStoreMock{
			DeleteByConnectedAccountFunc: func(ctx context.Context, spaceID, connectedAccountID string) error {
				draftsPurged = true
				return nil
			},
		}
		mockMsgStore := &MessageStoreMock{
			DeleteByConnectedAccountFunc: func(ctx context.Context, spaceID, connectedAccountID string) error {
				msgsPurged = true
				return nil
			},
		}
		mockThreadStore := &ThreadStoreMock{
			DeleteByConnectedAccountFunc: func(ctx context.Context, spaceID, connectedAccountID string) error {
				threadsPurged = true
				return nil
			},
		}
		mockMbxStore := &MailboxStoreMock{
			DeleteByConnectedAccountFunc: func(ctx context.Context, spaceID, connectedAccountID string) error {
				mbxPurged = true
				return nil
			},
		}
		mockSyncStore := &SyncStateStoreMock{
			DeleteFunc: func(ctx context.Context, spaceID, connectedAccountID string) error {
				syncPurged = true
				return nil
			},
		}

		svc := NewService(Dependencies{
			MailboxStore:   mockMbxStore,
			ThreadStore:    mockThreadStore,
			MessageStore:   mockMsgStore,
			DraftStore:     mockDraftStore,
			SyncStateStore: mockSyncStore,
		})

		err := svc.PurgeConnectedAccountData(ctx, "spc_1", "acc_1")
		require.NoError(t, err)
		assert.True(t, draftsPurged)
		assert.True(t, msgsPurged)
		assert.True(t, threadsPurged)
		assert.True(t, mbxPurged)
		assert.True(t, syncPurged)
	})
}
