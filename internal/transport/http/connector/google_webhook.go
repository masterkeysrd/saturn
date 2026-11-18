package connector

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json/v2"
	stderrors "errors"
	"io"
	"net/http"
	"strings"

	"github.com/masterkeysrd/saturn/internal/platform/log"
	"github.com/masterkeysrd/saturn/internal/platform/scheduler"
)

const maxGoogleWebhookBodyBytes = 64 * 1024

// GoogleWebhookHandler processes incoming Google push notifications (e.g. for calendar/gmail changes).
type GoogleWebhookHandler struct {
	scheduler     scheduler.Scheduler
	webhookSecret string
}

// NewGoogleWebhookHandler creates a new Google push notification webhook handler.
func NewGoogleWebhookHandler(sched scheduler.Scheduler, webhookSecret ...string) *GoogleWebhookHandler {
	var secret string
	if len(webhookSecret) > 0 {
		secret = strings.TrimSpace(webhookSecret[0])
	}
	return &GoogleWebhookHandler{
		scheduler:     sched,
		webhookSecret: secret,
	}
}

// ChannelToken models the payload stored in the X-Goog-Channel-Token header.
type ChannelToken struct {
	SpaceID   string `json:"space_id"`
	AccountID string `json:"account_id"`
	Resource  string `json:"resource"` // "calendar" or "mail"
	Signature string `json:"sig,omitempty"`
}

// SignChannelToken computes the HMAC-SHA256 hex signature for a ChannelToken payload.
func SignChannelToken(spaceID, accountID, resource, secret string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(spaceID + ":" + accountID + ":" + resource))
	return hex.EncodeToString(mac.Sum(nil))
}

// ServeHTTP handles incoming Google push notification pings.
func (h *GoogleWebhookHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxGoogleWebhookBodyBytes)
	if _, err := io.ReadAll(r.Body); err != nil {
		if _, ok := stderrors.AsType[*http.MaxBytesError](err); ok {
			http.Error(w, "request entity too large", http.StatusRequestEntityTooLarge)
			return
		}
		http.Error(w, "read body failed", http.StatusBadRequest)
		return
	}

	state := r.Header.Get("X-Goog-Resource-State")
	channelID := r.Header.Get("X-Goog-Channel-ID")
	tokenHeader := r.Header.Get("X-Goog-Channel-Token")

	if h.webhookSecret != "" && !h.hasValidRequestSecret(r) && state == "sync" {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

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
		// Attempt parsing as colon-delimited: "space_id:account_id:resource[:sig]"
		parts := strings.Split(tokenHeader, ":")
		if len(parts) >= 2 {
			token.SpaceID = parts[0]
			token.AccountID = parts[1]
			if len(parts) >= 3 {
				token.Resource = parts[2]
			}
			if len(parts) >= 4 {
				token.Signature = parts[3]
			}
		} else {
			http.Error(w, "invalid channel token", http.StatusBadRequest)
			return
		}
	}

	if h.webhookSecret != "" && !h.hasValidRequestSecret(r) {
		expectedSig := SignChannelToken(token.SpaceID, token.AccountID, token.Resource, h.webhookSecret)
		if subtle.ConstantTimeCompare([]byte(strings.ToLower(token.Signature)), []byte(expectedSig)) != 1 {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
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

func (h *GoogleWebhookHandler) hasValidRequestSecret(r *http.Request) bool {
	if h.webhookSecret == "" {
		return true
	}
	if qTok := r.URL.Query().Get("token"); subtle.ConstantTimeCompare([]byte(qTok), []byte(h.webhookSecret)) == 1 {
		return true
	}
	if hdr := r.Header.Get("X-Webhook-Secret"); subtle.ConstantTimeCompare([]byte(hdr), []byte(h.webhookSecret)) == 1 {
		return true
	}
	return false
}
