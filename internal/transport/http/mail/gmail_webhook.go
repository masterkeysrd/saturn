package mail

import (
	"context"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json/v2"
	stderrors "errors"
	"io"
	"net/http"
	"strings"

	"github.com/masterkeysrd/saturn/internal/platform/connector"
	"github.com/masterkeysrd/saturn/internal/platform/log"
	"github.com/masterkeysrd/saturn/internal/platform/scheduler"
)

const maxGmailWebhookBodyBytes = 64 * 1024

// ActiveAccountLister abstracts active connected account lookup for Gmail webhooks.
type ActiveAccountLister interface {
	ListActiveAccounts(ctx context.Context) ([]*connector.ConnectedAccount, error)
}

// GmailWebhookHandler processes incoming Google Cloud Pub/Sub push notifications for Gmail changes.
type GmailWebhookHandler struct {
	scheduler     scheduler.Scheduler
	accounts      ActiveAccountLister
	webhookSecret string
}

// NewGmailWebhookHandler creates a new Gmail push webhook handler.
func NewGmailWebhookHandler(sched scheduler.Scheduler, accounts ActiveAccountLister, webhookSecret ...string) *GmailWebhookHandler {
	var secret string
	if len(webhookSecret) > 0 {
		secret = strings.TrimSpace(webhookSecret[0])
	}
	return &GmailWebhookHandler{
		scheduler:     sched,
		accounts:      accounts,
		webhookSecret: secret,
	}
}

type pubsubPushRequest struct {
	Message      pubsubMessage `json:"message"`
	Subscription string        `json:"subscription"`
}

type pubsubMessage struct {
	Data        string `json:"data"`
	MessageID   string `json:"messageId"`
	PublishTime string `json:"publishTime"`
}

type gmailPushData struct {
	EmailAddress string `json:"emailAddress"`
	HistoryID    string `json:"historyId"`
}

// ServeHTTP handles incoming Pub/Sub webhook pings.
func (h *GmailWebhookHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	if h.webhookSecret != "" && !h.isAuthorized(r) {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxGmailWebhookBodyBytes)
	body, err := io.ReadAll(r.Body)
	if err != nil {
		if _, ok := stderrors.AsType[*http.MaxBytesError](err); ok {
			http.Error(w, "request entity too large", http.StatusRequestEntityTooLarge)
			return
		}
		http.Error(w, "read body failed", http.StatusBadRequest)
		return
	}

	var pushReq pubsubPushRequest
	if err := json.Unmarshal(body, &pushReq); err != nil {
		// Accept empty ping / ping confirmation
		w.WriteHeader(http.StatusOK)
		return
	}

	var data gmailPushData
	if pushReq.Message.Data != "" {
		decoded, err := base64.StdEncoding.DecodeString(pushReq.Message.Data)
		if err != nil {
			decoded, err = base64.RawStdEncoding.DecodeString(pushReq.Message.Data)
		}
		if err == nil {
			_ = json.Unmarshal(decoded, &data)
		}
	}

	email := strings.TrimSpace(data.EmailAddress)
	if email == "" || h.accounts == nil || h.scheduler == nil {
		w.WriteHeader(http.StatusOK)
		return
	}

	accounts, err := h.accounts.ListActiveAccounts(r.Context())
	if err != nil {
		log.Error(r.Context(), "failed to list active accounts for gmail webhook", log.Err(err))
		http.Error(w, "failed to resolve connected accounts", http.StatusInternalServerError)
		return
	}

	for _, acc := range accounts {
		if acc == nil || !acc.HasCapability(connector.CapabilityMail) {
			continue
		}
		if !strings.EqualFold(strings.TrimSpace(acc.Email), email) {
			continue
		}
		if err := h.scheduler.Enqueue(r.Context(), scheduler.Job{
			JobType: "connector.sync_mail",
			Payload: map[string]string{
				"space_id":   acc.SpaceID,
				"account_id": acc.ID,
			},
			MaxAttempts: 1,
		}); err != nil {
			log.Error(r.Context(), "failed to enqueue gmail push sync job",
				log.Err(err),
				log.String("space_id", acc.SpaceID),
				log.String("account_id", acc.ID),
			)
		}
	}

	w.WriteHeader(http.StatusOK)
}

func (h *GmailWebhookHandler) isAuthorized(r *http.Request) bool {
	if qTok := r.URL.Query().Get("token"); subtle.ConstantTimeCompare([]byte(qTok), []byte(h.webhookSecret)) == 1 {
		return true
	}
	if hdr := r.Header.Get("X-Webhook-Secret"); subtle.ConstantTimeCompare([]byte(hdr), []byte(h.webhookSecret)) == 1 {
		return true
	}
	if tok := extractRequestToken(r); tok != "" && subtle.ConstantTimeCompare([]byte(tok), []byte(h.webhookSecret)) == 1 {
		return true
	}
	return false
}
