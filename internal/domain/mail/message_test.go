package mail

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestMessageValidation(t *testing.T) {
	validID, err := GenerateMessageID()
	require.NoError(t, err)

	now := time.Now().UTC()

	tests := []struct {
		name    string
		msg     *Message
		wantErr bool
	}{
		{name: "nil message", msg: nil, wantErr: true},
		{name: "invalid id prefix", msg: &Message{ID: "cal_123", SpaceID: "spc_1", ConnectedAccountID: "acc_1", ThreadID: "mth_1", ReceivedAt: now}, wantErr: true},
		{name: "missing space id", msg: &Message{ID: validID, SpaceID: "", ConnectedAccountID: "acc_1", ThreadID: "mth_1", ReceivedAt: now}, wantErr: true},
		{name: "missing connected account id", msg: &Message{ID: validID, SpaceID: "spc_1", ConnectedAccountID: "", ThreadID: "mth_1", ReceivedAt: now}, wantErr: true},
		{name: "missing thread id", msg: &Message{ID: validID, SpaceID: "spc_1", ConnectedAccountID: "acc_1", ThreadID: "", ReceivedAt: now}, wantErr: true},
		{name: "missing received_at and sent_at", msg: &Message{ID: validID, SpaceID: "spc_1", ConnectedAccountID: "acc_1", ThreadID: "mth_1"}, wantErr: true},
		{
			name: "valid message",
			msg: &Message{
				ID:                 validID,
				SpaceID:            "spc_1",
				ConnectedAccountID: "acc_1",
				ThreadID:           "mth_1",
				ReceivedAt:         now,
				Subject:            "Test Subject",
			},
			wantErr: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.msg.Validate()
			if tt.wantErr {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
			}
		})
	}
}

func TestMessageBodyValidation(t *testing.T) {
	validMsgID, err := GenerateMessageID()
	require.NoError(t, err)

	body := &MessageBody{
		MessageID:     validMsgID,
		SpaceID:       "spc_1",
		SanitizedHTML: "<p>Hello</p>",
		PlainText:     "Hello",
		ExpiresAt:     time.Now().Add(30 * 24 * time.Hour),
	}

	assert.NoError(t, body.Validate())

	body.ExpiresAt = time.Time{}
	assert.Error(t, body.Validate(), "missing expires_at should fail")
}

func TestAttachmentMetaValidation(t *testing.T) {
	meta := &AttachmentMeta{
		Filename:    "doc.pdf",
		ContentType: "application/pdf",
		Size:        500,
	}

	assert.NoError(t, meta.Validate())
	assert.True(t, len(meta.ID) > 0)
	assert.True(t, meta.ID[:4] == "mat_")

	metaNegative := &AttachmentMeta{
		ID:   "mat_invalid",
		Size: -1,
	}
	assert.Error(t, metaNegative.Validate())
}
