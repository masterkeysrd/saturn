package connector_test

import (
	"bytes"
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

	t.Run("rejects oversized request body with 413", func(t *testing.T) {
		t.Parallel()

		sched := &mockScheduler{}
		handler := httpconnector.NewGoogleWebhookHandler(sched)

		oversized := bytes.Repeat([]byte("A"), 64*1024+10)
		req := httptest.NewRequest(http.MethodPost, "/v1/platform/connectors/webhooks/google", bytes.NewReader(oversized))
		req.Header.Set("X-Goog-Resource-State", "exists")
		req.Header.Set("X-Goog-Channel-Token", "spc_2:cac_2:calendar")

		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusRequestEntityTooLarge, rec.Code)
		assert.Empty(t, sched.enqueued)
	})

	t.Run("enforces webhook secret or signed channel token when configured", func(t *testing.T) {
		t.Parallel()

		const secret = "webhook-hmac-secret"
		sched := &mockScheduler{}
		handler := httpconnector.NewGoogleWebhookHandler(sched, secret)

		// Unsigned token rejected with 401
		reqBad := httptest.NewRequest(http.MethodPost, "/v1/platform/connectors/webhooks/google", nil)
		reqBad.Header.Set("X-Goog-Resource-State", "exists")
		reqBad.Header.Set("X-Goog-Channel-Token", `{"space_id":"spc_1","account_id":"cac_1","resource":"calendar"}`)
		recBad := httptest.NewRecorder()
		handler.ServeHTTP(recBad, reqBad)
		assert.Equal(t, http.StatusUnauthorized, recBad.Code)
		assert.Empty(t, sched.enqueued)

		// HMAC-signed channel token succeeds
		sig := httpconnector.SignChannelToken("spc_1", "cac_1", "calendar", secret)
		reqSigned := httptest.NewRequest(http.MethodPost, "/v1/platform/connectors/webhooks/google", nil)
		reqSigned.Header.Set("X-Goog-Resource-State", "exists")
		reqSigned.Header.Set("X-Goog-Channel-Token", `{"space_id":"spc_1","account_id":"cac_1","resource":"calendar","sig":"`+sig+`"}`)
		recSigned := httptest.NewRecorder()
		handler.ServeHTTP(recSigned, reqSigned)
		assert.Equal(t, http.StatusOK, recSigned.Code)
		require.Len(t, sched.enqueued, 1)

		// Shared header secret also succeeds
		reqHdr := httptest.NewRequest(http.MethodPost, "/v1/platform/connectors/webhooks/google", nil)
		reqHdr.Header.Set("X-Goog-Resource-State", "exists")
		reqHdr.Header.Set("X-Webhook-Secret", secret)
		reqHdr.Header.Set("X-Goog-Channel-Token", "spc_2:cac_2:mail")
		recHdr := httptest.NewRecorder()
		handler.ServeHTTP(recHdr, reqHdr)
		assert.Equal(t, http.StatusOK, recHdr.Code)
		require.Len(t, sched.enqueued, 2)
		assert.Equal(t, "connector.sync_mail", sched.enqueued[1].JobType)
	})
}
