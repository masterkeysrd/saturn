package connector_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/masterkeysrd/saturn/internal/platform/scheduler"
	httpconnector "github.com/masterkeysrd/saturn/internal/transport/http/connector"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type mockScheduler struct {
	enqueued []scheduler.Job
}

func (m *mockScheduler) Enqueue(ctx context.Context, job scheduler.Job) error {
	m.enqueued = append(m.enqueued, job)
	return nil
}

func (m *mockScheduler) RegisterSchedule(ctx context.Context, s scheduler.Schedule) error {
	return nil
}

func TestGoogleWebhookHandler(t *testing.T) {
	t.Parallel()

	t.Run("acknowledges sync handshake without enqueuing", func(t *testing.T) {
		t.Parallel()

		sched := &mockScheduler{}
		handler := httpconnector.NewGoogleWebhookHandler(sched)

		req := httptest.NewRequest(http.MethodPost, "/v1/platform/connectors/webhooks/google", nil)
		req.Header.Set("X-Goog-Resource-State", "sync")
		req.Header.Set("X-Goog-Channel-ID", "chan_123")

		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusOK, rec.Code)
		assert.Empty(t, sched.enqueued)
	})

	t.Run("enqueues sync_calendar job on exists notification", func(t *testing.T) {
		t.Parallel()

		sched := &mockScheduler{}
		handler := httpconnector.NewGoogleWebhookHandler(sched)

		req := httptest.NewRequest(http.MethodPost, "/v1/platform/connectors/webhooks/google", nil)
		req.Header.Set("X-Goog-Resource-State", "exists")
		req.Header.Set("X-Goog-Channel-ID", "chan_456")
		req.Header.Set("X-Goog-Channel-Token", `{"space_id":"spc_1","account_id":"cac_1","resource":"calendar"}`)

		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusOK, rec.Code)
		require.Len(t, sched.enqueued, 1)
		assert.Equal(t, "connector.sync_calendar", sched.enqueued[0].JobType)
		assert.Contains(t, string(sched.enqueued[0].Payload.([]byte)), "spc_1")
		assert.Contains(t, string(sched.enqueued[0].Payload.([]byte)), "cac_1")
	})

	t.Run("supports colon-delimited channel token", func(t *testing.T) {
		t.Parallel()

		sched := &mockScheduler{}
		handler := httpconnector.NewGoogleWebhookHandler(sched)

		req := httptest.NewRequest(http.MethodPost, "/v1/platform/connectors/webhooks/google", nil)
		req.Header.Set("X-Goog-Resource-State", "exists")
		req.Header.Set("X-Goog-Channel-Token", "spc_2:cac_2:calendar")

		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusOK, rec.Code)
		require.Len(t, sched.enqueued, 1)
		assert.Equal(t, "connector.sync_calendar", sched.enqueued[0].JobType)
	})
}
