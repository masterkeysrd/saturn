package mail

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestThreadSummaryValidation(t *testing.T) {
	validID, err := GenerateThreadID()
	require.NoError(t, err)

	now := time.Now().UTC()

	tests := []struct {
		name    string
		summary *ThreadSummary
		wantErr bool
	}{
		{
			name:    "nil summary",
			summary: nil,
			wantErr: true,
		},
		{
			name: "missing thread id",
			summary: &ThreadSummary{
				ThreadID:      "",
				SpaceID:       "spc_1",
				Language:      "en",
				LastMessageAt: now,
			},
			wantErr: true,
		},
		{
			name: "invalid thread id prefix",
			summary: &ThreadSummary{
				ThreadID:      "cal_invalid",
				SpaceID:       "spc_1",
				Language:      "en",
				LastMessageAt: now,
			},
			wantErr: true,
		},
		{
			name: "missing space id",
			summary: &ThreadSummary{
				ThreadID:      validID,
				SpaceID:       "",
				Language:      "en",
				LastMessageAt: now,
			},
			wantErr: true,
		},
		{
			name: "missing last message at",
			summary: &ThreadSummary{
				ThreadID:      validID,
				SpaceID:       "spc_1",
				Language:      "en",
				LastMessageAt: time.Time{},
			},
			wantErr: true,
		},
		{
			name: "valid summary",
			summary: &ThreadSummary{
				ThreadID:      validID,
				SpaceID:       "spc_1",
				Language:      "en",
				TLDR:          "Short summary",
				KeyPoints:     []string{"point"},
				ActionItems:   []string{"item"},
				LastMessageAt: now,
				MessageCount:  2,
			},
			wantErr: false,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			err := tc.summary.Validate()
			if tc.wantErr {
				assert.Error(t, err)
				return
			}
			require.NoError(t, err)
			assert.NotNil(t, tc.summary.KeyPoints)
			assert.NotNil(t, tc.summary.ActionItems)
		})
	}
}

func TestThreadSummaryValidateNormalizes(t *testing.T) {
	validID, err := GenerateThreadID()
	require.NoError(t, err)

	summary := &ThreadSummary{
		ThreadID:      validID,
		SpaceID:       "spc_1",
		Language:      "es",
		LastMessageAt: time.Now().UTC(),
		MessageCount:  -3,
	}

	require.NoError(t, summary.Validate())
	assert.Equal(t, 0, summary.MessageCount)
	assert.Equal(t, []string{}, summary.KeyPoints)
	assert.Equal(t, []string{}, summary.ActionItems)
}

func TestThreadSummaryIsStale(t *testing.T) {
	base := time.Date(2026, 1, 10, 12, 0, 0, 0, time.UTC)

	summary := &ThreadSummary{
		Language:      "en",
		LastMessageAt: base,
		MessageCount:  3,
	}

	tests := []struct {
		name   string
		target *ThreadSummary
		thread *Thread
		want   bool
	}{
		{
			name:   "nil summary is stale",
			target: nil,
			thread: &Thread{LastMessageAt: base, MessageCount: 3},
			want:   true,
		},
		{
			name:   "nil thread is stale",
			target: summary,
			thread: nil,
			want:   true,
		},
		{
			name:   "fresh thread matching summary",
			target: summary,
			thread: &Thread{LastMessageAt: base, MessageCount: 3},
			want:   false,
		},
		{
			name:   "newer message timestamp",
			target: summary,
			thread: &Thread{LastMessageAt: base.Add(time.Minute), MessageCount: 3},
			want:   true,
		},
		{
			name:   "higher message count",
			target: summary,
			thread: &Thread{LastMessageAt: base, MessageCount: 4},
			want:   true,
		},
		{
			name:   "older thread timestamp is not stale",
			target: summary,
			thread: &Thread{LastMessageAt: base.Add(-time.Hour), MessageCount: 1},
			want:   false,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			assert.Equal(t, tc.want, tc.target.IsStale(tc.thread))
		})
	}
}
