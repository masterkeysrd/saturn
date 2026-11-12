package mail

import (
	"encoding/base64"
	"encoding/json/v2"
	"io"
	"net/http"

	"github.com/masterkeysrd/saturn/internal/platform/scheduler"
)

// GmailWebhookHandler processes incoming Google Cloud Pub/Sub push notifications for Gmail changes.
type GmailWebhookHandler struct {
	scheduler scheduler.Scheduler
}

// NewGmailWebhookHandler creates a new Gmail push webhook handler.
func NewGmailWebhookHandler(sched scheduler.Scheduler) *GmailWebhookHandler {
	return &GmailWebhookHandler{
		scheduler: sched,
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

	body, err := io.ReadAll(r.Body)
	if err != nil {
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
		if err == nil {
			_ = json.Unmarshal(decoded, &data)
		}
	}

	if h.scheduler != nil {
		_ = h.scheduler.Enqueue(r.Context(), scheduler.Job{
			JobType: "connector.sync_mail",
			Payload: map[string]string{
				"email":      data.EmailAddress,
				"history_id": data.HistoryID,
			},
		})
	}

	w.WriteHeader(http.StatusOK)
}
