package mail_test

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json/v2"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/masterkeysrd/saturn/internal/platform/connector"
	"github.com/masterkeysrd/saturn/internal/platform/scheduler"
	httpmail "github.com/masterkeysrd/saturn/internal/transport/http/mail"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type mockActiveAccountLister struct {
	accounts []*connector.ConnectedAccount
	err      error
}

func (m *mockActiveAccountLister) ListActiveAccounts(ctx context.Context) ([]*connector.ConnectedAccount, error) {
	return m.accounts, m.err
}

type mockWebhookScheduler struct {
	enqueued []scheduler.Job
}

func (m *mockWebhookScheduler) Enqueue(ctx context.Context, job scheduler.Job) error {
	m.enqueued = append(m.enqueued, job)
	return nil
}

func (m *mockWebhookScheduler) RegisterSchedule(ctx context.Context, s scheduler.Schedule) error {
	return nil
}

func TestGmailWebhookHandler(t *testing.T) {
	t.Parallel()

	makePushBody := func(email, historyID string) []byte {
		inner, _ := json.Marshal(map[string]string{
			"emailAddress": email,
			"historyId":    historyID,
		})
		outer, _ := json.Marshal(map[string]any{
			"message": map[string]string{
				"data": base64.StdEncoding.EncodeToString(inner),
			},
		})
		return outer
	}

	t.Run("enqueues sync_mail with space_id and account_id for matching mail-capable accounts", func(t *testing.T) {
		t.Parallel()

		sched := &mockWebhookScheduler{}
		lister := &mockActiveAccountLister{
			accounts: []*connector.ConnectedAccount{
				{
					ID:                  "cac_mail_1",
					SpaceID:             "spc_1",
					Email:               "Alice@Example.com",
					EnabledCapabilities: []string{string(connector.CapabilityMail)},
				},
				{
					ID:                  "cac_cal_only",
					SpaceID:             "spc_2",
					Email:               "alice@example.com",
					EnabledCapabilities: []string{string(connector.CapabilityCalendar)},
				},
				{
					ID:                  "cac_other",
					SpaceID:             "spc_3",
					Email:               "bob@example.com",
					EnabledCapabilities: []string{string(connector.CapabilityMail)},
				},
			},
		}

		handler := httpmail.NewGmailWebhookHandler(sched, lister)
		req := httptest.NewRequest(http.MethodPost, "/v1/platform/connectors/webhooks/gmail", bytes.NewReader(makePushBody("alice@example.com", "999")))
		rec := httptest.NewRecorder()

		handler.ServeHTTP(rec, req)

		require.Equal(t, http.StatusOK, rec.Code)
		require.Len(t, sched.enqueued, 1)
		assert.Equal(t, "connector.sync_mail", sched.enqueued[0].JobType)
		assert.Equal(t, map[string]string{
			"space_id":   "spc_1",
			"account_id": "cac_mail_1",
		}, sched.enqueued[0].Payload)
	})

	t.Run("rejects oversized request body with 413", func(t *testing.T) {
		t.Parallel()

		sched := &mockWebhookScheduler{}
		handler := httpmail.NewGmailWebhookHandler(sched, &mockActiveAccountLister{})
		oversized := bytes.Repeat([]byte("A"), 64*1024+10)
		req := httptest.NewRequest(http.MethodPost, "/v1/platform/connectors/webhooks/gmail", bytes.NewReader(oversized))
		rec := httptest.NewRecorder()

		handler.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusRequestEntityTooLarge, rec.Code)
		assert.Empty(t, sched.enqueued)
	})

	t.Run("enforces webhook secret when configured", func(t *testing.T) {
		t.Parallel()

		const secret = "pubsub-shared-secret"
		sched := &mockWebhookScheduler{}
		lister := &mockActiveAccountLister{
			accounts: []*connector.ConnectedAccount{
				{
					ID:                  "cac_1",
					SpaceID:             "spc_1",
					Email:               "alice@example.com",
					EnabledCapabilities: []string{string(connector.CapabilityMail)},
				},
			},
		}
		handler := httpmail.NewGmailWebhookHandler(sched, lister, secret)

		reqUnauth := httptest.NewRequest(http.MethodPost, "/v1/platform/connectors/webhooks/gmail", bytes.NewReader(makePushBody("alice@example.com", "10")))
		recUnauth := httptest.NewRecorder()
		handler.ServeHTTP(recUnauth, reqUnauth)
		assert.Equal(t, http.StatusUnauthorized, recUnauth.Code)
		assert.Empty(t, sched.enqueued)

		reqAuth := httptest.NewRequest(http.MethodPost, "/v1/platform/connectors/webhooks/gmail?token="+secret, bytes.NewReader(makePushBody("alice@example.com", "10")))
		recAuth := httptest.NewRecorder()
		handler.ServeHTTP(recAuth, reqAuth)
		assert.Equal(t, http.StatusOK, recAuth.Code)
		require.Len(t, sched.enqueued, 1)
	})
}
