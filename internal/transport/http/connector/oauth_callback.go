package connector

import (
	"fmt"
	"net/http"
	"net/url"
	"strings"

	connectorapp "github.com/masterkeysrd/saturn/internal/application/connector"
	"github.com/masterkeysrd/saturn/internal/platform/connector"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

// OAuthCallbackHandler handles public OAuth provider redirects for Web and Mobile PKCE flows.
type OAuthCallbackHandler struct {
	coordinator  connectorapp.Coordinator
	oauthManager *connector.OAuthManager
}

// NewOAuthCallbackHandler creates a new OAuthCallbackHandler.
func NewOAuthCallbackHandler(coord connectorapp.Coordinator, mgr *connector.OAuthManager) *OAuthCallbackHandler {
	return &OAuthCallbackHandler{
		coordinator:  coord,
		oauthManager: mgr,
	}
}

// ServeHTTP processes the OAuth redirect callback.
func (h *OAuthCallbackHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	provider := extractProvider(r)
	if provider == "" {
		http.Error(w, "missing or invalid provider in url path", http.StatusBadRequest)
		return
	}

	state := r.URL.Query().Get("state")
	if state == "" {
		http.Error(w, "missing state query parameter", http.StatusBadRequest)
		return
	}

	errParam := r.URL.Query().Get("error")
	if errParam != "" {
		// Consume state session to retrieve return_url
		stateRecord, _, err := h.oauthManager.ConsumeSession(r.Context(), state)
		if err != nil || stateRecord == nil {
			http.Error(w, "invalid or expired oauth state", http.StatusBadRequest)
			return
		}

		sanitizedErr := sanitizeOAuthError(errParam)
		redirectURL, err := appendQueryParam(stateRecord.ReturnURL, "oauth_error", sanitizedErr)
		if err != nil {
			http.Error(w, "invalid return_url", http.StatusBadRequest)
			return
		}

		http.Redirect(w, r, redirectURL, http.StatusFound)
		return
	}

	code := r.URL.Query().Get("code")
	if code == "" {
		http.Error(w, "missing code query parameter", http.StatusBadRequest)
		return
	}

	res, err := h.coordinator.CompleteOAuth(r.Context(), &connectorapp.CompleteOAuthRequest{
		Provider: provider,
		Code:     code,
		State:    state,
	})
	if err != nil {
		if platErr, ok := errors.AsType[*errors.Error](err); ok && platErr.Code == connectorapp.ErrInvalidState {
			http.Error(w, "invalid or expired oauth state", http.StatusBadRequest)
			return
		}
		http.Error(w, fmt.Sprintf("oauth callback failed: %v", err), http.StatusBadRequest)
		return
	}

	redirectURL, err := appendQueryParam(res.ReturnURL, "connected_account_id", res.Account.ID)
	if err != nil {
		http.Error(w, "invalid return_url", http.StatusBadRequest)
		return
	}

	http.Redirect(w, r, redirectURL, http.StatusFound)
}

func extractProvider(r *http.Request) string {
	if p := r.PathValue("provider"); p != "" {
		return p
	}
	path := strings.Trim(r.URL.Path, "/")
	parts := strings.Split(path, "/")
	for i, part := range parts {
		if part == "oauth" && i+2 < len(parts) && parts[i+2] == "callback" {
			return parts[i+1]
		}
	}
	return ""
}

func appendQueryParam(rawURL, key, val string) (string, error) {
	u, err := url.Parse(rawURL)
	if err != nil {
		return "", err
	}
	q := u.Query()
	q.Set(key, val)
	u.RawQuery = q.Encode()
	return u.String(), nil
}

func sanitizeOAuthError(errStr string) string {
	errStr = strings.TrimSpace(errStr)
	switch errStr {
	case "access_denied", "consent_required", "interaction_required",
		"invalid_request", "unauthorized_client", "unsupported_response_type",
		"invalid_scope", "server_error", "temporarily_unavailable":
		return errStr
	default:
		var b strings.Builder
		for _, r := range errStr {
			if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '_' || r == '-' {
				b.WriteRune(r)
			}
		}
		res := b.String()
		if res == "" {
			return "oauth_error"
		}
		return res
	}
}
