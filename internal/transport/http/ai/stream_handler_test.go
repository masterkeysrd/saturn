package aihttp

import (
	"bytes"
	"context"
	"encoding/json/v2"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	aiapp "github.com/masterkeysrd/saturn/internal/application/ai"
	"github.com/masterkeysrd/saturn/internal/domain/identity"
	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	"github.com/masterkeysrd/saturn/internal/platform/ai"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	transportauth "github.com/masterkeysrd/saturn/internal/transport/auth"
)

type stubAuth struct {
	authFn  func(ctx context.Context, raw string) (transportauth.AuthResult, error)
	spaceFn func(ctx context.Context, p auth.Principal, spaceID string) (auth.SpaceContext, error)
}

func (s *stubAuth) AuthenticateToken(ctx context.Context, raw string) (transportauth.AuthResult, error) {
	return s.authFn(ctx, raw)
}
func (s *stubAuth) ResolveSpace(ctx context.Context, p auth.Principal, spaceID string) (auth.SpaceContext, error) {
	return s.spaceFn(ctx, p, spaceID)
}

type stubStreamCoord struct {
	streamFn  func(ctx context.Context, req *aiapp.StreamThreadTurnRequest, emit ai.StreamEventEmitter) error
	resolveFn func(ctx context.Context, req *aiapp.ResolveToolApprovalsRequest, emit ai.StreamEventEmitter) error
}

func (s *stubStreamCoord) StreamThreadTurn(ctx context.Context, req *aiapp.StreamThreadTurnRequest, emit ai.StreamEventEmitter) error {
	return s.streamFn(ctx, req, emit)
}
func (s *stubStreamCoord) ResolveToolApprovals(ctx context.Context, req *aiapp.ResolveToolApprovalsRequest, emit ai.StreamEventEmitter) error {
	return s.resolveFn(ctx, req, emit)
}

func defaultTestAuth() *stubAuth {
	return &stubAuth{
		authFn: func(_ context.Context, raw string) (transportauth.AuthResult, error) {
			if raw == "" {
				return transportauth.AuthResult{}, errors.E(errors.Unauthenticated, "missing token")
			}
			if raw == "sat_readonly" {
				return transportauth.AuthResult{
					Principal: auth.Principal{
						Subject:  "usr_1",
						APIKeyID: "apk_1",
						Scopes:   []string{string(identity.ScopeAIRead)},
					},
				}, nil
			}
			return transportauth.AuthResult{
				Principal: auth.Principal{Subject: "usr_1"},
			}, nil
		},
		spaceFn: func(_ context.Context, _ auth.Principal, spaceID string) (auth.SpaceContext, error) {
			if spaceID == "" {
				return auth.SpaceContext{}, errors.E(errors.Invalid, "missing space-id")
			}
			return auth.SpaceContext{SpaceID: spaceID, Role: "member"}, nil
		},
	}
}

func TestStreamHandler_AuthAndSSE(t *testing.T) {
	tests := []struct {
		name       string
		method     string
		path       string
		authHeader string
		cookie     *http.Cookie
		spaceID    string
		body       string
		wantStatus int
		wantSSE    []string
	}{
		{
			name:       "unauthenticated rejected with 401",
			method:     http.MethodPost,
			path:       "/api/v1/platform/ai/threads/thr_1:stream",
			spaceID:    "spc_1",
			body:       `{"content":"hello"}`,
			wantStatus: http.StatusUnauthorized,
		},
		{
			name:       "API key without ai:execute rejected with 403",
			method:     http.MethodPost,
			path:       "/api/v1/platform/ai/threads/thr_1:stream",
			authHeader: "Bearer sat_readonly",
			spaceID:    "spc_1",
			body:       `{"content":"hello"}`,
			wantStatus: http.StatusForbidden,
		},
		{
			name:       "streams SSE events via Bearer token",
			method:     http.MethodPost,
			path:       "/api/v1/platform/ai/threads/thr_1:stream",
			authHeader: "Bearer jwt_ok",
			spaceID:    "spc_1",
			body:       `{"content":"hello","contextHint":"/finance"}`,
			wantStatus: http.StatusOK,
			wantSSE:    []string{"event: run.started", "event: message.delta", `"delta":"Hi!"`, "event: run.completed"},
		},
		{
			name:       "streams resolveApprovals via access_token cookie",
			method:     http.MethodPost,
			path:       "/v1/platform/ai/threads/thr_1:resolveApprovals",
			cookie:     &http.Cookie{Name: "access_token", Value: "jwt_cookie"},
			spaceID:    "spc_1",
			body:       `{"decisions":[{"toolCallId":"tc_1","approved":true}]}`,
			wantStatus: http.StatusOK,
			wantSSE:    []string{"event: tool.call.completed", "event: run.completed"},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			coord := &stubStreamCoord{
				streamFn: func(ctx context.Context, req *aiapp.StreamThreadTurnRequest, emit ai.StreamEventEmitter) error {
					if sid, _ := auth.SpaceIDFromContext(ctx); sid != "spc_1" {
						t.Fatalf("expected SpaceID spc_1 in ctx, got %q", sid)
					}
					if req.ContextHint == nil || *req.ContextHint != "/finance" {
						t.Fatalf("expected contextHint /finance, got %v", req.ContextHint)
					}
					emit(ai.ThreadStreamEvent{Type: ai.EventRunStarted, ThreadID: new(req.ThreadID), RunID: new("air_1")})
					emit(ai.ThreadStreamEvent{Type: ai.EventMessageDelta, ThreadID: new(req.ThreadID), Delta: new("Hi!")})
					emit(ai.ThreadStreamEvent{Type: ai.EventRunCompleted, ThreadID: new(req.ThreadID)})
					return nil
				},
				resolveFn: func(_ context.Context, req *aiapp.ResolveToolApprovalsRequest, emit ai.StreamEventEmitter) error {
					if len(req.Decisions) != 1 || req.Decisions[0].ToolCallID != "tc_1" || !req.Decisions[0].Approved {
						t.Fatalf("unexpected decisions: %+v", req.Decisions)
					}
					emit(ai.ThreadStreamEvent{Type: ai.EventToolCallCompleted, ThreadID: new(req.ThreadID), ToolCallID: new("tc_1")})
					emit(ai.ThreadStreamEvent{Type: ai.EventRunCompleted, ThreadID: new(req.ThreadID)})
					return nil
				},
			}

			h := NewStreamHandler(coord, defaultTestAuth())
			req := httptest.NewRequest(tc.method, tc.path, strings.NewReader(tc.body))
			req.Header.Set("Content-Type", "application/json")
			if tc.authHeader != "" {
				req.Header.Set("Authorization", tc.authHeader)
			}
			if tc.cookie != nil {
				req.AddCookie(tc.cookie)
			}
			if tc.spaceID != "" {
				req.Header.Set("Space-Id", tc.spaceID)
			}

			rec := httptest.NewRecorder()
			h.ServeHTTP(rec, req)

			if rec.Code != tc.wantStatus {
				t.Fatalf("expected status %d, got %d (body=%s)", tc.wantStatus, rec.Code, rec.Body.String())
			}
			if tc.wantStatus == http.StatusOK {
				if ct := rec.Header().Get("Content-Type"); !strings.HasPrefix(ct, "text/event-stream") {
					t.Fatalf("expected text/event-stream content-type, got %q", ct)
				}
				bodyStr := rec.Body.String()
				for _, needle := range tc.wantSSE {
					if !strings.Contains(bodyStr, needle) {
						t.Fatalf("expected SSE body to contain %q, got:\n%s", needle, bodyStr)
					}
				}
			}
		})
	}
}

func TestStreamHandler_MultipartAttachmentAndRunErrorFallback(t *testing.T) {
	var bodyBuf bytes.Buffer
	mw := multipart.NewWriter(&bodyBuf)
	_ = mw.WriteField("content", "Analyze CSV")
	fw, err := mw.CreateFormFile("attachments", "data.csv")
	if err != nil {
		t.Fatalf("CreateFormFile: %v", err)
	}
	_, _ = fw.Write([]byte("a,b\n1,2\n"))
	_ = mw.Close()

	coord := &stubStreamCoord{
		streamFn: func(_ context.Context, req *aiapp.StreamThreadTurnRequest, emit ai.StreamEventEmitter) error {
			if len(req.Attachments) != 1 || req.Attachments[0].Filename != "data.csv" {
				t.Fatalf("expected 1 CSV attachment, got %+v", req.Attachments)
			}
			return errors.E(errors.ResourceExhausted, ai.CodeMonthlyBudgetExceeded, "monthly budget reached")
		},
	}

	h := NewStreamHandler(coord, defaultTestAuth())
	req := httptest.NewRequest(http.MethodPost, "/api/v1/platform/ai/threads/thr_1:stream", &bodyBuf)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	req.Header.Set("Authorization", "Bearer jwt_ok")
	req.Header.Set("Space-Id", "spc_1")

	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 SSE stream, got %d", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "event: run.error") {
		t.Fatalf("expected run.error SSE fallback event, got:\n%s", rec.Body.String())
	}

	var parsed map[string]any
	lines := strings.SplitSeq(rec.Body.String(), "\n")
	for line := range lines {
		if after, ok := strings.CutPrefix(line, "data: "); ok {
			_ = json.Unmarshal([]byte(after), &parsed)
		}
	}
	if parsed["type"] != "run.error" {
		t.Fatalf("expected parsed run.error payload, got %+v", parsed)
	}
}
