package mail

import (
	"context"
	"encoding/json/v2"
	"fmt"
	"io"
	"net/http"
	"strings"

	appmail "github.com/masterkeysrd/saturn/internal/application/mail"
	domainmail "github.com/masterkeysrd/saturn/internal/domain/mail"
	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	"github.com/masterkeysrd/saturn/internal/platform/connector"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

const maxUploadBytes = 25 * 1024 * 1024

// MessageStoreReader abstracts message lookup for attachment streaming.
type MessageStoreReader interface {
	GetByID(ctx context.Context, spaceID, id string) (*domainmail.Message, error)
}

// AccountStoreReader abstracts account lookup for attachment streaming.
type AccountStoreReader interface {
	GetAccount(ctx context.Context, spaceID, id string) (*connector.ConnectedAccount, error)
}

// TokenSource abstracts token acquisition for attachment streaming.
type TokenSource interface {
	TokenSource(ctx context.Context, spaceID, accountID string) (string, error)
}

// AttachmentHandler serves streaming attachment downloads and draft uploads.
type AttachmentHandler struct {
	messageReader     MessageStoreReader
	accountReader     AccountStoreReader
	tokenSource       TokenSource
	externalProviders map[string]domainmail.ExternalMailProvider
	coordinator       appmail.Coordinator
	hmacSecret        []byte
}

// NewAttachmentHandler creates a new HTTP attachment streaming and upload handler.
func NewAttachmentHandler(
	messageReader MessageStoreReader,
	accountReader AccountStoreReader,
	tokenSource TokenSource,
	externalProviders map[string]domainmail.ExternalMailProvider,
	coordinator appmail.Coordinator,
	hmacSecret []byte,
) *AttachmentHandler {
	return &AttachmentHandler{
		messageReader:     messageReader,
		accountReader:     accountReader,
		tokenSource:       tokenSource,
		externalProviders: externalProviders,
		coordinator:       coordinator,
		hmacSecret:        hmacSecret,
	}
}

// ServeDownload handles GET /v1/mail/attachments/{token}.
func (h *AttachmentHandler) ServeDownload(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	token := r.PathValue("token")
	if token == "" {
		// Fallback for path prefix matching /v1/mail/attachments/{token}
		parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
		if len(parts) > 0 {
			token = parts[len(parts)-1]
		}
	}
	if token == "" {
		http.Error(w, "missing attachment token", http.StatusBadRequest)
		return
	}

	claims, err := appmail.VerifyAttachmentToken(token, h.hmacSecret)
	if err != nil {
		if errors.Is(err, errors.Permission) {
			http.Error(w, "forbidden: invalid signature", http.StatusForbidden)
			return
		}
		http.Error(w, "unauthorized: invalid or expired token", http.StatusUnauthorized)
		return
	}

	ctx := r.Context()
	msg, err := h.messageReader.GetByID(ctx, claims.SpaceID, claims.MessageID)
	if err != nil || msg == nil {
		http.Error(w, "message not found", http.StatusNotFound)
		return
	}

	var targetAtt *domainmail.AttachmentMeta
	for _, att := range msg.Attachments {
		if att.ID == claims.AttachmentID {
			targetAtt = &att
			break
		}
	}

	if msg.ConnectedAccountID == "" || msg.ProviderMessageID == nil || h.tokenSource == nil {
		http.Error(w, "provider attachment not available", http.StatusNotFound)
		return
	}

	acc, err := h.accountReader.GetAccount(ctx, claims.SpaceID, msg.ConnectedAccountID)
	if err != nil || acc == nil {
		http.Error(w, "connected account not found", http.StatusNotFound)
		return
	}

	prov, ok := h.externalProviders[acc.Provider]
	if !ok {
		http.Error(w, "provider not supported", http.StatusBadGateway)
		return
	}

	accessToken, err := h.tokenSource.TokenSource(ctx, claims.SpaceID, msg.ConnectedAccountID)
	if err != nil || accessToken == "" {
		http.Error(w, "unable to acquire provider access token", http.StatusBadGateway)
		return
	}

	stream, contentType, size, err := prov.OpenAttachmentStream(ctx, accessToken, *msg.ProviderMessageID, claims.AttachmentID)
	if err != nil {
		http.Error(w, "failed to stream attachment from provider", http.StatusBadGateway)
		return
	}
	defer stream.Close()

	// Enforce strict security headers per specification
	w.Header().Set("Content-Security-Policy", "default-src 'none'")
	w.Header().Set("X-Content-Type-Options", "nosniff")

	if targetAtt != nil && targetAtt.ContentType != "" {
		contentType = targetAtt.ContentType
	}
	if contentType != "" {
		w.Header().Set("Content-Type", contentType)
	}

	filename := "attachment"
	if targetAtt != nil && targetAtt.Filename != "" {
		filename = targetAtt.Filename
	}

	disposition := "attachment"
	if claims.Disposition == "inline" {
		disposition = "inline"
	}
	w.Header().Set("Content-Disposition", fmt.Sprintf("%s; filename=%q", disposition, filename))

	if size > 0 {
		w.Header().Set("Content-Length", fmt.Sprintf("%d", size))
	}

	w.WriteHeader(http.StatusOK)
	_, _ = io.Copy(w, stream)
}

// ServeUpload handles POST /v1/mail/drafts/{draft_id}/attachments.
func (h *AttachmentHandler) ServeUpload(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	draftID := r.PathValue("draft_id")
	if draftID == "" {
		// Fallback for /v1/mail/drafts/{draft_id}/attachments
		parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
		for i, p := range parts {
			if p == "drafts" && i+1 < len(parts) {
				draftID = parts[i+1]
				break
			}
		}
	}
	if draftID == "" {
		http.Error(w, "missing draft id", http.StatusBadRequest)
		return
	}

	// Enforce 25 MB maximum request entity size
	r.Body = http.MaxBytesReader(w, r.Body, maxUploadBytes)
	if err := r.ParseMultipartForm(maxUploadBytes); err != nil {
		http.Error(w, "request entity too large", http.StatusRequestEntityTooLarge)
		return
	}
	defer func() {
		if r.MultipartForm != nil {
			_ = r.MultipartForm.RemoveAll()
		}
	}()

	file, header, err := r.FormFile("file")
	if err != nil {
		http.Error(w, "missing form file 'file'", http.StatusBadRequest)
		return
	}
	defer file.Close()

	contentType := header.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	ctx := r.Context()
	spaceID := r.Header.Get("Space-Id")
	if spaceID != "" {
		ctx = auth.WithSpaceID(ctx, spaceID)
	}

	meta, err := h.coordinator.UploadDraftAttachment(ctx, &appmail.UploadDraftAttachmentRequest{
		DraftID:     draftID,
		Filename:    header.Filename,
		ContentType: contentType,
		Body:        file,
	})
	if err != nil {
		if errors.Is(err, errors.Permission) {
			http.Error(w, "forbidden: viewer role", http.StatusForbidden)
			return
		}
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.MarshalWrite(w, meta)
}
