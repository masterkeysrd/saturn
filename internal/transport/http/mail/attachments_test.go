package mail_test

import (
	"bytes"
	"context"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	appmail "github.com/masterkeysrd/saturn/internal/application/mail"
	"github.com/masterkeysrd/saturn/internal/domain/identity"
	domainmail "github.com/masterkeysrd/saturn/internal/domain/mail"
	"github.com/masterkeysrd/saturn/internal/domain/space"
	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	"github.com/masterkeysrd/saturn/internal/platform/connector"
	platformerrors "github.com/masterkeysrd/saturn/internal/platform/errors"
	transportauth "github.com/masterkeysrd/saturn/internal/transport/auth"
	httpmail "github.com/masterkeysrd/saturn/internal/transport/http/mail"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type mockMsgStore struct {
	msg *domainmail.Message
}

func (m *mockMsgStore) GetByID(ctx context.Context, spaceID, id string) (*domainmail.Message, error) {
	if m.msg != nil && m.msg.SpaceID == spaceID && m.msg.ID == id {
		return m.msg, nil
	}
	return nil, nil
}

type mockAccStore struct {
	acc *connector.ConnectedAccount
}

func (m *mockAccStore) GetAccount(ctx context.Context, spaceID, id string) (*connector.ConnectedAccount, error) {
	if m.acc != nil && m.acc.SpaceID == spaceID && m.acc.ID == id {
		return m.acc, nil
	}
	return nil, nil
}

type mockExtStreamProvider struct {
	content []byte
}

func (m *mockExtStreamProvider) Provider() string { return "google" }
func (m *mockExtStreamProvider) ListMailboxes(ctx context.Context, accessToken string) ([]*domainmail.Mailbox, error) {
	return nil, nil
}
func (m *mockExtStreamProvider) SyncThreads(ctx context.Context, accessToken string, req *domainmail.SyncThreadsRequest) (*domainmail.SyncThreadsResult, error) {
	return nil, nil
}
func (m *mockExtStreamProvider) FetchOlderThreads(ctx context.Context, accessToken string, req *domainmail.FetchOlderThreadsRequest) (*domainmail.FetchOlderThreadsResult, error) {
	return nil, nil
}
func (m *mockExtStreamProvider) FetchThread(ctx context.Context, accessToken, providerThreadID string) (*domainmail.Thread, []*domainmail.Message, error) {
	return nil, nil, nil
}
func (m *mockExtStreamProvider) FetchMessageBody(ctx context.Context, accessToken, providerMessageID string) (*domainmail.MessageBody, error) {
	return nil, nil
}
func (m *mockExtStreamProvider) SearchThreads(ctx context.Context, accessToken, query string, limit int) ([]*domainmail.Thread, error) {
	return nil, nil
}
func (m *mockExtStreamProvider) ModifyThread(ctx context.Context, accessToken, providerThreadID string, addLabelIDs, removeLabelIDs []string) error {
	return nil
}
func (m *mockExtStreamProvider) BatchModifyThreads(ctx context.Context, accessToken string, providerThreadIDs []string, addLabelIDs, removeLabelIDs []string) error {
	return nil
}
func (m *mockExtStreamProvider) CreateDraft(ctx context.Context, accessToken string, draft *domainmail.Draft) (*domainmail.Draft, error) {
	return nil, nil
}
func (m *mockExtStreamProvider) UpdateDraft(ctx context.Context, accessToken string, draft *domainmail.Draft) (*domainmail.Draft, error) {
	return nil, nil
}
func (m *mockExtStreamProvider) DeleteDraft(ctx context.Context, accessToken, providerDraftID string) error {
	return nil
}
func (m *mockExtStreamProvider) SendDraft(ctx context.Context, accessToken, providerDraftID string) (*domainmail.Message, error) {
	return nil, nil
}
func (m *mockExtStreamProvider) OpenAttachmentStream(ctx context.Context, accessToken, providerMessageID, attachmentID string) (io.ReadCloser, string, int64, error) {
	return io.NopCloser(bytes.NewReader(m.content)), "application/pdf", int64(len(m.content)), nil
}
func (m *mockExtStreamProvider) UploadDraftAttachment(ctx context.Context, accessToken, providerDraftID, filename, contentType string, r io.Reader) (*domainmail.AttachmentMeta, error) {
	return nil, nil
}

type mockCoordinator struct {
	appmail.Coordinator
	uploadedMeta *domainmail.AttachmentMeta
	uploadErr    error
	lastCtx      context.Context
}

func (m *mockCoordinator) UploadDraftAttachment(ctx context.Context, req *appmail.UploadDraftAttachmentRequest) (*domainmail.AttachmentMeta, error) {
	m.lastCtx = ctx
	if m.uploadErr != nil {
		return nil, m.uploadErr
	}
	return m.uploadedMeta, nil
}

type mockAuthenticator struct {
	authFunc    func(ctx context.Context, rawToken string) (transportauth.AuthResult, error)
	resolveFunc func(ctx context.Context, principal auth.Principal, explicitSpaceID string) (auth.SpaceContext, error)
}

func (m *mockAuthenticator) AuthenticateToken(ctx context.Context, rawToken string) (transportauth.AuthResult, error) {
	if m.authFunc != nil {
		return m.authFunc(ctx, rawToken)
	}
	return transportauth.AuthResult{
		Principal: auth.Principal{Subject: "usr_1"},
	}, nil
}

func (m *mockAuthenticator) ResolveSpace(ctx context.Context, principal auth.Principal, explicitSpaceID string) (auth.SpaceContext, error) {
	if m.resolveFunc != nil {
		return m.resolveFunc(ctx, principal, explicitSpaceID)
	}
	if explicitSpaceID == "" {
		explicitSpaceID = "spc_1"
	}
	return auth.SpaceContext{SpaceID: explicitSpaceID, Role: string(space.RoleMember)}, nil
}

type mockTokenSource struct{}

func (m *mockTokenSource) TokenSource(ctx context.Context, spaceID, accountID string) (string, error) {
	return "test-token", nil
}

func TestAttachmentHandler_Download_SecurityHeadersAndStreaming(t *testing.T) {
	secret := []byte("secret-hmac-32-bytes-test-key!!")
	payloadData := []byte("PDF Binary Attachment Stream Content")

	provMsgID := "p_msg_100"
	msg := &domainmail.Message{
		ID:                 "msg_1",
		SpaceID:            "spc_1",
		ConnectedAccountID: "acc_1",
		ProviderMessageID:  &provMsgID,
		Attachments: []domainmail.AttachmentMeta{
			{
				ID:          "att_1",
				Filename:    "document.pdf",
				ContentType: "application/pdf",
				Size:        int64(len(payloadData)),
			},
		},
	}
	msgStore := &mockMsgStore{msg: msg}
	accStore := &mockAccStore{acc: &connector.ConnectedAccount{ID: "acc_1", SpaceID: "spc_1", Provider: "google"}}
	extProv := &mockExtStreamProvider{content: payloadData}

	claims := appmail.AttachmentTokenClaims{
		SpaceID:      "spc_1",
		MessageID:    "msg_1",
		AttachmentID: "att_1",
		Disposition:  "attachment",
		ExpiresAt:    time.Now().Add(5 * time.Minute).Unix(),
	}
	validToken, err := appmail.MintAttachmentToken(claims, secret)
	require.NoError(t, err)

	handler := httpmail.NewAttachmentHandler(
		msgStore,
		accStore,
		&mockTokenSource{},
		map[string]domainmail.ExternalMailProvider{"google": extProv},
		&mockCoordinator{},
		&mockAuthenticator{},
		secret,
	)

	// Sub-test 1: Valid download with security headers
	t.Run("valid token streams with CSP and nosniff headers", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/v1/mail/attachments/"+validToken, nil)
		w := httptest.NewRecorder()

		handler.ServeDownload(w, req)
		resp := w.Result()
		defer resp.Body.Close()

		assert.Equal(t, http.StatusOK, resp.StatusCode)
		assert.Equal(t, "default-src 'none'", resp.Header.Get("Content-Security-Policy"))
		assert.Equal(t, "nosniff", resp.Header.Get("X-Content-Type-Options"))
		assert.Equal(t, "application/pdf", resp.Header.Get("Content-Type"))
		assert.Contains(t, resp.Header.Get("Content-Disposition"), "attachment; filename=\"document.pdf\"")

		body, err := io.ReadAll(resp.Body)
		require.NoError(t, err)
		assert.Equal(t, payloadData, body)
	})

	// Sub-test 2: Expired token
	t.Run("expired token rejected 401", func(t *testing.T) {
		expiredClaims := claims
		expiredClaims.ExpiresAt = time.Now().Add(-1 * time.Minute).Unix()
		expiredToken, err := appmail.MintAttachmentToken(expiredClaims, secret)
		require.NoError(t, err)

		req := httptest.NewRequest(http.MethodGet, "/v1/mail/attachments/"+expiredToken, nil)
		w := httptest.NewRecorder()

		handler.ServeDownload(w, req)
		resp := w.Result()
		defer resp.Body.Close()

		assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
	})

	// Sub-test 3: Tampered token
	t.Run("tampered token rejected 403", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/v1/mail/attachments/"+validToken+"corrupted", nil)
		w := httptest.NewRecorder()

		handler.ServeDownload(w, req)
		resp := w.Result()
		defer resp.Body.Close()

		assert.Equal(t, http.StatusForbidden, resp.StatusCode)
	})

	// Sub-test 4: Wrong space token
	t.Run("wrong space token rejected 404", func(t *testing.T) {
		wrongSpaceClaims := claims
		wrongSpaceClaims.SpaceID = "different_spc_999"
		wrongSpaceToken, err := appmail.MintAttachmentToken(wrongSpaceClaims, secret)
		require.NoError(t, err)

		req := httptest.NewRequest(http.MethodGet, "/v1/mail/attachments/"+wrongSpaceToken, nil)
		w := httptest.NewRecorder()

		handler.ServeDownload(w, req)
		resp := w.Result()
		defer resp.Body.Close()

		assert.Equal(t, http.StatusNotFound, resp.StatusCode)
	})
}

func TestAttachmentHandler_Upload_SizeGuard25MB(t *testing.T) {
	secret := []byte("secret-hmac-32-bytes-test-key!!")
	coord := &mockCoordinator{
		uploadedMeta: &domainmail.AttachmentMeta{
			ID:          "mat_uploaded_1",
			Filename:    "test.txt",
			ContentType: "text/plain",
			Size:        12,
		},
	}

	handler := httpmail.NewAttachmentHandler(
		nil,
		nil,
		nil,
		nil,
		coord,
		&mockAuthenticator{},
		secret,
	)

	// Valid upload
	t.Run("valid small upload succeeds", func(t *testing.T) {
		body := new(bytes.Buffer)
		writer := multipart.NewWriter(body)
		part, err := writer.CreateFormFile("file", "test.txt")
		require.NoError(t, err)
		_, _ = part.Write([]byte("Hello world!"))
		_ = writer.Close()

		req := httptest.NewRequest(http.MethodPost, "/v1/mail/drafts/mdf_100/attachments", body)
		req.Header.Set("Content-Type", writer.FormDataContentType())
		req.Header.Set("Authorization", "Bearer valid-jwt")
		req.Header.Set("Space-Id", "spc_1")
		w := httptest.NewRecorder()

		handler.ServeUpload(w, req)
		resp := w.Result()
		defer resp.Body.Close()

		assert.Equal(t, http.StatusCreated, resp.StatusCode)
	})

	// Over 25 MB rejection (413 Request Entity Too Large)
	t.Run("upload exceeding 25 MB rejected with 413", func(t *testing.T) {
		body := new(bytes.Buffer)
		writer := multipart.NewWriter(body)
		part, err := writer.CreateFormFile("file", "huge.bin")
		require.NoError(t, err)

		// Write > 25 MB
		hugeBlob := bytes.Repeat([]byte("A"), 25*1024*1024+1024)
		_, _ = part.Write(hugeBlob)
		_ = writer.Close()

		req := httptest.NewRequest(http.MethodPost, "/v1/mail/drafts/mdf_100/attachments", body)
		req.Header.Set("Content-Type", writer.FormDataContentType())
		req.Header.Set("Authorization", "Bearer valid-jwt")
		req.Header.Set("Space-Id", "spc_1")
		w := httptest.NewRecorder()

		handler.ServeUpload(w, req)
		resp := w.Result()
		defer resp.Body.Close()

		assert.Equal(t, http.StatusRequestEntityTooLarge, resp.StatusCode)
	})
}

func TestAttachmentHandler_Upload_AuthAndRBAC(t *testing.T) {
	secret := []byte("secret-hmac-32-bytes-test-key!!")

	newUploadReq := func(authHeader string, cookie *http.Cookie, spaceID string) *http.Request {
		body := new(bytes.Buffer)
		writer := multipart.NewWriter(body)
		part, _ := writer.CreateFormFile("file", "note.txt")
		_, _ = part.Write([]byte("hello"))
		_ = writer.Close()
		req := httptest.NewRequest(http.MethodPost, "/v1/mail/drafts/mdf_1/attachments", body)
		req.Header.Set("Content-Type", writer.FormDataContentType())
		if authHeader != "" {
			req.Header.Set("Authorization", authHeader)
		}
		if cookie != nil {
			req.AddCookie(cookie)
		}
		if spaceID != "" {
			req.Header.Set("Space-Id", spaceID)
		}
		return req
	}

	tests := []struct {
		name       string
		authHeader string
		cookie     *http.Cookie
		spaceID    string
		authMock   *mockAuthenticator
		wantStatus int
		wantSpace  string
		wantRole   string
	}{
		{
			name:       "missing token returns 401",
			authMock:   &mockAuthenticator{},
			wantStatus: http.StatusUnauthorized,
		},
		{
			name:       "invalid token returns 401",
			authHeader: "Bearer bad-token",
			authMock: &mockAuthenticator{
				authFunc: func(_ context.Context, _ string) (transportauth.AuthResult, error) {
					return transportauth.AuthResult{}, platformerrors.E(platformerrors.Unauthenticated, "invalid token")
				},
			},
			wantStatus: http.StatusUnauthorized,
		},
		{
			name:       "api key missing mail:write scope returns 403",
			authHeader: "Bearer sat_readonly",
			spaceID:    "spc_1",
			authMock: &mockAuthenticator{
				authFunc: func(_ context.Context, _ string) (transportauth.AuthResult, error) {
					return transportauth.AuthResult{
						Principal: auth.Principal{
							Subject:  "usr_1",
							APIKeyID: "apk_ro",
							Scopes:   []string{string(identity.ScopeMailRead)},
						},
					}, nil
				},
			},
			wantStatus: http.StatusForbidden,
		},
		{
			name:       "viewer role returns 403",
			authHeader: "Bearer valid-jwt",
			spaceID:    "spc_1",
			authMock: &mockAuthenticator{
				resolveFunc: func(_ context.Context, _ auth.Principal, spaceID string) (auth.SpaceContext, error) {
					return auth.SpaceContext{SpaceID: spaceID, Role: string(space.RoleViewer)}, nil
				},
			},
			wantStatus: http.StatusForbidden,
		},
		{
			name:       "non-member space denied with 403",
			authHeader: "Bearer valid-jwt",
			spaceID:    "spc_other",
			authMock: &mockAuthenticator{
				resolveFunc: func(_ context.Context, _ auth.Principal, _ string) (auth.SpaceContext, error) {
					return auth.SpaceContext{}, platformerrors.E(platformerrors.Permission, "not a member")
				},
			},
			wantStatus: http.StatusForbidden,
		},
		{
			name:       "api key with mail:write scope succeeds",
			authHeader: "Bearer sat_writer",
			spaceID:    "spc_9",
			authMock: &mockAuthenticator{
				authFunc: func(_ context.Context, _ string) (transportauth.AuthResult, error) {
					return transportauth.AuthResult{
						Principal: auth.Principal{
							Subject:  "usr_1",
							APIKeyID: "apk_rw",
							Scopes:   []string{string(identity.ScopeMailWrite)},
						},
					}, nil
				},
			},
			wantStatus: http.StatusCreated,
			wantSpace:  "spc_9",
			wantRole:   string(space.RoleMember),
		},
		{
			name:       "cookie access_token auth succeeds",
			cookie:     &http.Cookie{Name: "access_token", Value: "cookie-jwt"},
			spaceID:    "spc_2",
			authMock:   &mockAuthenticator{},
			wantStatus: http.StatusCreated,
			wantSpace:  "spc_2",
			wantRole:   string(space.RoleMember),
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			coord := &mockCoordinator{
				uploadedMeta: &domainmail.AttachmentMeta{ID: "mat_1", Filename: "note.txt"},
			}
			handler := httpmail.NewAttachmentHandler(nil, nil, nil, nil, coord, tc.authMock, secret)
			req := newUploadReq(tc.authHeader, tc.cookie, tc.spaceID)
			w := httptest.NewRecorder()

			handler.ServeUpload(w, req)
			require.Equal(t, tc.wantStatus, w.Code)
			if tc.wantStatus == http.StatusCreated {
				sc, ok := auth.SpaceContextFromContext(coord.lastCtx)
				require.True(t, ok)
				assert.Equal(t, tc.wantSpace, sc.SpaceID)
				assert.Equal(t, tc.wantRole, sc.Role)
				p, ok := auth.PrincipalFromContext(coord.lastCtx)
				require.True(t, ok)
				assert.Equal(t, "usr_1", p.Subject)
			}
		})
	}
}
