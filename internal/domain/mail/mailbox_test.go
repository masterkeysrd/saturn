package mail

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestMailboxValidation(t *testing.T) {
	validID, err := GenerateMailboxID()
	require.NoError(t, err)

	tests := []struct {
		name    string
		mailbox *Mailbox
		wantErr bool
	}{
		{name: "nil mailbox", mailbox: nil, wantErr: true},
		{name: "invalid id", mailbox: &Mailbox{ID: "cal_123", SpaceID: "spc_1", ConnectedAccountID: "acc_1", Name: "Inbox"}, wantErr: true},
		{name: "missing space id", mailbox: &Mailbox{ID: validID, SpaceID: "", ConnectedAccountID: "acc_1", Name: "Inbox"}, wantErr: true},
		{name: "missing connected account id", mailbox: &Mailbox{ID: validID, SpaceID: "spc_1", ConnectedAccountID: "", Name: "Inbox"}, wantErr: true},
		{name: "missing name", mailbox: &Mailbox{ID: validID, SpaceID: "spc_1", ConnectedAccountID: "acc_1", Name: "  "}, wantErr: true},
		{name: "invalid system role", mailbox: &Mailbox{ID: validID, SpaceID: "spc_1", ConnectedAccountID: "acc_1", Name: "Inbox", SystemRole: "invalid_role"}, wantErr: true},
		{
			name: "valid mailbox",
			mailbox: &Mailbox{
				ID:                 validID,
				SpaceID:            "spc_1",
				ConnectedAccountID: "acc_1",
				Name:               "Inbox",
				SystemRole:         SystemBucketInbox,
			},
			wantErr: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.mailbox.Validate()
			if tt.wantErr {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
			}
		})
	}
}

func TestSyncStateValidation(t *testing.T) {
	state := &SyncState{
		ConnectedAccountID: "acc_1",
		SpaceID:            "spc_1",
		WindowDays:         0,
	}
	err := state.Validate()
	assert.NoError(t, err)
	assert.Equal(t, 90, state.WindowDays, "default window days should be 90")
}
