package connector

import (
	"encoding/json/v2"
	"net/http"
	"strings"

	"github.com/masterkeysrd/saturn/internal/platform/log"
	"github.com/masterkeysrd/saturn/internal/platform/scheduler"
)

// GoogleWebhookHandler processes incoming Google push notifications (e.g. for calendar/gmail changes).
type GoogleWebhookHandler struct {
	scheduler scheduler.Scheduler
}

// NewGoogleWebhookHandler creates a new Google push notification webhook handler.
func NewGoogleWebhookHandler(sched scheduler.Scheduler) *GoogleWebhookHandler {
	return &GoogleWebhookHandler{
		scheduler: sched,
	}
}

// ChannelToken models the payload stored in the X-Goog-Channel-Token header.
type ChannelToken struct {
	SpaceID   string `json:"space_id"`
	AccountID string `json:"account_id"`
	Resource  string `json:"resource"` // "calendar" or "mail"
}

// ServeHTTP handles incoming Google push notification pings.
func (h *GoogleWebhookHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	state := r.Header.Get("X-Goog-Resource-State")
	channelID := r.Header.Get("X-Goog-Channel-ID")
	tokenHeader := r.Header.Get("X-Goog-Channel-Token")

	// Handshake / sync confirmation from Google
	if state == "sync" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if tokenHeader == "" {
		http.Error(w, "missing channel token", http.StatusBadRequest)
		return
	}

	var token ChannelToken
	if err := json.Unmarshal([]byte(tokenHeader), &token); err != nil {
		// Attempt parsing as colon-delimited: "space_id:account_id:resource"
		parts := strings.Split(tokenHeader, ":")
		if len(parts) >= 2 {
			token.SpaceID = parts[0]
			token.AccountID = parts[1]
			if len(parts) >= 3 {
				token.Resource = parts[2]
			}
		} else {
			http.Error(w, "invalid channel token", http.StatusBadRequest)
			return
		}
	}

	jobType := "connector.sync_calendar"
	if token.Resource == "mail" {
		jobType = "connector.sync_mail"
	}

	payload, _ := json.Marshal(map[string]string{
		"space_id":   token.SpaceID,
		"account_id": token.AccountID,
	})

	if h.scheduler != nil {
		if err := h.scheduler.Enqueue(r.Context(), scheduler.Job{
			JobType:     jobType,
			Payload:     payload,
			MaxAttempts: 1,
		}); err != nil {
			log.Error(r.Context(), "failed to enqueue push sync job",
				log.Err(err),
				log.String("channel_id", channelID),
			)
		}
	}

	w.WriteHeader(http.StatusOK)
}
