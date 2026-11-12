package mail

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestDraftValidationAndPatch(t *testing.T) {
	validID, err := GenerateDraftID()
	require.NoError(t, err)

	t.Run("validation", func(t *testing.T) {
		tests := []struct {
			name    string
			draft   *Draft
			wantErr bool
		}{
			{name: "nil draft", draft: nil, wantErr: true},
			{name: "invalid id", draft: &Draft{ID: "cal_123", SpaceID: "spc_1", ConnectedAccountID: "acc_1"}, wantErr: true},
			{name: "missing space id", draft: &Draft{ID: validID, SpaceID: "", ConnectedAccountID: "acc_1"}, wantErr: true},
			{name: "missing connected account id", draft: &Draft{ID: validID, SpaceID: "spc_1", ConnectedAccountID: ""}, wantErr: true},
			{name: "invalid mode", draft: &Draft{ID: validID, SpaceID: "spc_1", ConnectedAccountID: "acc_1", Mode: "unknown"}, wantErr: true},
			{
				name: "valid draft",
				draft: &Draft{
					ID:                 validID,
					SpaceID:            "spc_1",
					ConnectedAccountID: "acc_1",
					Mode:               DraftModeNew,
					Subject:            "Hello",
				},
				wantErr: false,
			},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				err := tt.draft.Validate()
				if tt.wantErr {
					assert.Error(t, err)
				} else {
					assert.NoError(t, err)
				}
			})
		}
	})

	t.Run("apply patch", func(t *testing.T) {
		draft := &Draft{
			ID:                 validID,
			SpaceID:            "spc_1",
			ConnectedAccountID: "acc_1",
			Mode:               DraftModeNew,
			Subject:            "Old Subject",
			BodyHTML:           "<p>Old</p>",
			BodyText:           "Old",
		}

		incoming := &Draft{
			Subject:  "New Subject",
			BodyHTML: "<p>New</p>",
			BodyText: "New",
			To:       []Participant{{Name: "Bob", Email: "bob@example.com"}},
		}

		err := draft.ApplyPatch(incoming, []string{"subject", "body_html", "to"})
		require.NoError(t, err)

		assert.Equal(t, "New Subject", draft.Subject)
		assert.Equal(t, "<p>New</p>", draft.BodyHTML)
		assert.Equal(t, "Old", draft.BodyText, "body_text was not in mask and should remain Old")
		require.Len(t, draft.To, 1)
		assert.Equal(t, "bob@example.com", draft.To[0].Email)
	})
}
