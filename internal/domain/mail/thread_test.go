package mail

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestThreadValidation(t *testing.T) {
	validID, err := GenerateThreadID()
	require.NoError(t, err)

	now := time.Now().UTC()

	tests := []struct {
		name    string
		thread  *Thread
		wantErr bool
	}{
		{
			name:    "nil thread",
			thread:  nil,
			wantErr: true,
		},
		{
			name: "missing id",
			thread: &Thread{
				ID:                 "",
				SpaceID:            "spc_1",
				ConnectedAccountID: "acc_1",
				LastMessageAt:      now,
			},
			wantErr: true,
		},
		{
			name: "invalid id prefix",
			thread: &Thread{
				ID:                 "cal_invalid",
				SpaceID:            "spc_1",
				ConnectedAccountID: "acc_1",
				LastMessageAt:      now,
			},
			wantErr: true,
		},
		{
			name: "missing space_id",
			thread: &Thread{
				ID:                 validID,
				SpaceID:            "",
				ConnectedAccountID: "acc_1",
				LastMessageAt:      now,
			},
			wantErr: true,
		},
		{
			name: "missing connected_account_id",
			thread: &Thread{
				ID:                 validID,
				SpaceID:            "spc_1",
				ConnectedAccountID: "",
				LastMessageAt:      now,
			},
			wantErr: true,
		},
		{
			name: "missing last_message_at",
			thread: &Thread{
				ID:                 validID,
				SpaceID:            "spc_1",
				ConnectedAccountID: "acc_1",
				LastMessageAt:      time.Time{},
			},
			wantErr: true,
		},
		{
			name: "valid thread",
			thread: &Thread{
				ID:                 validID,
				SpaceID:            "spc_1",
				ConnectedAccountID: "acc_1",
				Subject:            "Test Conversation",
				Snippet:            "Hello there",
				LastMessageAt:      now,
			},
			wantErr: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.thread.Validate()
			if tt.wantErr {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
			}
		})
	}
}

func TestThreadAggregation(t *testing.T) {
	t0 := time.Date(2025, 2, 10, 10, 0, 0, 0, time.UTC)
	t1 := t0.Add(1 * time.Hour)
	t2 := t0.Add(2 * time.Hour)

	t.Run("empty messages", func(t *testing.T) {
		thread := &Thread{}
		thread.AggregateFromMessages(nil)
		assert.Equal(t, 0, thread.MessageCount)
		assert.False(t, thread.IsUnread)
		assert.False(t, thread.IsStarred)
		assert.False(t, thread.HasAttachments)
	})

	t.Run("aggregates flags, snippet, subject and participants correctly", func(t *testing.T) {
		msg1 := &Message{
			ID:         "msg_1",
			Subject:    "Initial Subject",
			Snippet:    "Snippet one",
			ReceivedAt: t0,
			From:       Participant{Name: "", Email: "alice@example.com"},
			To:         []Participant{{Name: "Bob", Email: "bob@example.com"}},
			IsUnread:   false,
			IsStarred:  false,
		}

		msg2 := &Message{
			ID:         "msg_2",
			Subject:    "Re: Initial Subject",
			Snippet:    "Snippet two with attachments",
			ReceivedAt: t1,
			From:       Participant{Name: "Bob", Email: "bob@example.com"},
			To:         []Participant{{Name: "Alice Wonderland", Email: "alice@example.com"}},
			Cc:         []Participant{{Name: "Carol", Email: "carol@example.com"}},
			IsUnread:   true,
			IsStarred:  true,
			Attachments: []AttachmentMeta{
				{ID: "mat_1", Filename: "doc.pdf", Size: 1024},
			},
		}

		msg3 := &Message{
			ID:         "msg_3",
			Subject:    "Re: Initial Subject",
			Snippet:    "Final snippet",
			ReceivedAt: t2,
			From:       Participant{Name: "Alice Wonderland", Email: "alice@example.com"},
			To:         []Participant{{Name: "Bob", Email: "bob@example.com"}},
			IsUnread:   false,
			IsStarred:  false,
		}

		thread := &Thread{}
		// Pass out of order to verify sorting
		thread.AggregateFromMessages([]*Message{msg3, msg1, msg2})

		assert.Equal(t, 3, thread.MessageCount)
		assert.True(t, thread.IsUnread, "is_unread should be true since msg2 is unread")
		assert.True(t, thread.IsStarred, "is_starred should be true since msg2 is starred")
		assert.True(t, thread.HasAttachments, "has_attachments should be true since msg2 has attachments")
		assert.Equal(t, t2, thread.LastMessageAt, "last_message_at should be latest message time")
		assert.Equal(t, "Final snippet", thread.Snippet, "snippet should be latest message's snippet")
		assert.Equal(t, "Initial Subject", thread.Subject, "subject should be the first message's subject")

		// Verify participant deduplication: alice had empty name in msg1 but updated to "Alice Wonderland" in msg2
		require.Len(t, thread.Participants, 3)
		assert.Equal(t, Participant{Name: "Alice Wonderland", Email: "alice@example.com"}, thread.Participants[0])
		assert.Equal(t, Participant{Name: "Bob", Email: "bob@example.com"}, thread.Participants[1])
		assert.Equal(t, Participant{Name: "Carol", Email: "carol@example.com"}, thread.Participants[2])
	})

	t.Run("draft unread does not make thread unread", func(t *testing.T) {
		msg := &Message{
			ID:         "msg_draft",
			Subject:    "Draft Message",
			Snippet:    "Draft body",
			ReceivedAt: t0,
			From:       Participant{Email: "me@example.com"},
			IsUnread:   true,
			IsDraft:    true,
		}

		thread := &Thread{}
		thread.AggregateFromMessages([]*Message{msg})

		assert.False(t, thread.IsUnread, "draft message should not mark thread unread")
	})
}
