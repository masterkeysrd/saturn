package aihttp

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	aiv1 "github.com/masterkeysrd/saturn/apis/saturn/platform/ai/v1"
	aiapp "github.com/masterkeysrd/saturn/internal/application/ai"
	"github.com/masterkeysrd/saturn/internal/domain/identity"
	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	"github.com/masterkeysrd/saturn/internal/platform/ai"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	transportauth "github.com/masterkeysrd/saturn/internal/transport/auth"
	aigrpc "github.com/masterkeysrd/saturn/internal/transport/grpc/ai"
	"github.com/masterkeysrd/saturn/internal/transport/http/middleware"
	"google.golang.org/protobuf/encoding/protojson"
)

const (
	maxSSEBodyBytes      = 2 * 1024 * 1024  // 2 MB for JSON requests
	maxMultipartFormSize = 55 * 1024 * 1024 // 5 files * 10 MB + overhead
	maxSingleFileBytes   = 10 * 1024 * 1024
)

// Authenticator authenticates bearer/cookie tokens and resolves space membership.
type Authenticator interface {
	AuthenticateToken(ctx context.Context, rawToken string) (transportauth.AuthResult, error)
	ResolveSpace(ctx context.Context, principal auth.Principal, explicitSpaceID string) (auth.SpaceContext, error)
}

// StreamCoordinator defines the application operations used by the HTTP SSE stream handler.
type StreamCoordinator interface {
	StreamThreadTurn(ctx context.Context, req *aiapp.StreamThreadTurnRequest, emit ai.StreamEventEmitter) error
	ResolveToolApprovals(ctx context.Context, req *aiapp.ResolveToolApprovalsRequest, emit ai.StreamEventEmitter) error
}

// StreamHandler serves dedicated HTTP SSE endpoints for AI thread streaming and tool approval resolution.
type StreamHandler struct {
	coordinator StreamCoordinator
	auth        Authenticator
}

// NewStreamHandler constructs a new HTTP SSE StreamHandler.
func NewStreamHandler(coordinator StreamCoordinator, authenticator Authenticator) *StreamHandler {
	return &StreamHandler{
		coordinator: coordinator,
		auth:        authenticator,
	}
}

// ServeHTTP dispatches `/[api/]v1/platform/ai/threads/{id}:stream` and `:resolveApprovals`.
func (h *StreamHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	path := r.URL.Path
	path = strings.TrimPrefix(path, "/api")
	const prefix = "/v1/platform/ai/threads/"
	if !strings.HasPrefix(path, prefix) {
		http.NotFound(w, r)
		return
	}
	rest := strings.TrimPrefix(path, prefix)
	if threadID, ok := strings.CutSuffix(rest, ":stream"); ok && threadID != "" && !strings.Contains(threadID, "/") {
		h.ServeStreamTurn(w, r, threadID)
		return
	}
	if threadID, ok := strings.CutSuffix(rest, ":resolveApprovals"); ok && threadID != "" && !strings.Contains(threadID, "/") {
		h.ServeResolveApprovals(w, r, threadID)
		return
	}
	http.NotFound(w, r)
}

// ServeStreamTurn handles `POST /[api/]v1/platform/ai/threads/{id}:stream`.
func (h *StreamHandler) ServeStreamTurn(w http.ResponseWriter, r *http.Request, threadID string) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	ctx, err := h.authenticateAndScope(r)
	if err != nil {
		middleware.WriteHTTP(w, err)
		return
	}

	req, err := parseStreamTurnRequest(w, r, threadID)
	if err != nil {
		middleware.WriteHTTP(w, err)
		return
	}

	h.serveSSE(w, ctx, threadID, func(emit ai.StreamEventEmitter) error {
		return h.coordinator.StreamThreadTurn(ctx, req, emit)
	})
}

// ServeResolveApprovals handles `POST /[api/]v1/platform/ai/threads/{id}:resolveApprovals`.
func (h *StreamHandler) ServeResolveApprovals(w http.ResponseWriter, r *http.Request, threadID string) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	ctx, err := h.authenticateAndScope(r)
	if err != nil {
		middleware.WriteHTTP(w, err)
		return
	}

	req, err := parseResolveApprovalsRequest(w, r, threadID)
	if err != nil {
		middleware.WriteHTTP(w, err)
		return
	}

	h.serveSSE(w, ctx, threadID, func(emit ai.StreamEventEmitter) error {
		return h.coordinator.ResolveToolApprovals(ctx, req, emit)
	})
}

func (h *StreamHandler) serveSSE(
	w http.ResponseWriter,
	ctx context.Context,
	threadID string,
	runFn func(emit ai.StreamEventEmitter) error,
) {
	_ = http.NewResponseController(w).SetWriteDeadline(time.Time{})

	w.Header().Set("Content-Type", "text/event-stream; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache, no-transform")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)

	flusher, canFlush := w.(http.Flusher)
	if canFlush {
		flusher.Flush()
	}

	var (
		mu          sync.Mutex
		sawRunError bool
	)
	writeEvent := func(ev ai.ThreadStreamEvent) {
		mu.Lock()
		defer mu.Unlock()
		if ev.Type == ai.EventRunError {
			sawRunError = true
		}
		pbEv, err := aigrpc.ToProtoStreamEvent(ev)
		if err != nil {
			return
		}
		data, err := protojson.MarshalOptions{EmitUnpopulated: false}.Marshal(pbEv)
		if err != nil {
			return
		}
		_, _ = fmt.Fprintf(w, "event: %s\ndata: %s\n\n", ev.Type, data)
		if canFlush {
			flusher.Flush()
		}
	}

	if err := runFn(writeEvent); err != nil && !sawRunError && ctx.Err() == nil {
		var codePtr *string
		if code := errors.CodeOf(err); code != "" {
			codePtr = new(string(code))
		}
		writeEvent(ai.ThreadStreamEvent{
			Type:     ai.EventRunError,
			ThreadID: new(threadID),
			Error: &ai.ErrorDetail{
				Code:    codePtr,
				Message: errors.UserMessage(err),
			},
		})
	}
}

func (h *StreamHandler) authenticateAndScope(r *http.Request) (context.Context, error) {
	const op errors.Op = "http/ai.authenticateAndScope"

	rawToken := extractBearerOrCookie(r)
	res, err := h.auth.AuthenticateToken(r.Context(), rawToken)
	if err != nil {
		return nil, errors.E(op, err)
	}

	if res.Principal.IsScopedGrant() && !res.Principal.HasScope(string(identity.ScopeAIExecute), string(identity.ScopeAIWrite)) {
		return nil, errors.E(op, errors.Permission, "credential lacks required ai:execute or ai:write scope")
	}

	spaceIDHeader := strings.TrimSpace(r.Header.Get("Space-Id"))
	if spaceIDHeader == "" {
		spaceIDHeader = strings.TrimSpace(r.Header.Get("space-id"))
	}

	sc, err := h.auth.ResolveSpace(r.Context(), res.Principal, spaceIDHeader)
	if err != nil {
		return nil, errors.E(op, err)
	}

	ctx := auth.WithPrincipal(r.Context(), res.Principal)
	return auth.WithSpaceScope(ctx, sc.SpaceID, sc.Role), nil
}

func extractBearerOrCookie(r *http.Request) string {
	authHeader := strings.TrimSpace(r.Header.Get("Authorization"))
	if after, ok := strings.CutPrefix(authHeader, "Bearer "); ok {
		if tok := strings.TrimSpace(after); tok != "" {
			return tok
		}
	}
	if cookie, err := r.Cookie("access_token"); err == nil && strings.TrimSpace(cookie.Value) != "" {
		return strings.TrimSpace(cookie.Value)
	}
	return ""
}

func parseStreamTurnRequest(w http.ResponseWriter, r *http.Request, threadID string) (*aiapp.StreamThreadTurnRequest, error) {
	const op errors.Op = "http/ai.parseStreamTurnRequest"

	ct := strings.ToLower(r.Header.Get("Content-Type"))
	if strings.HasPrefix(ct, "multipart/form-data") {
		r.Body = http.MaxBytesReader(w, r.Body, maxMultipartFormSize)
		if err := r.ParseMultipartForm(maxMultipartFormSize); err != nil {
			return nil, errors.E(op, errors.Invalid, fmt.Sprintf("invalid multipart request: %v", err))
		}
		defer func() {
			if r.MultipartForm != nil {
				_ = r.MultipartForm.RemoveAll()
			}
		}()

		req := &aiapp.StreamThreadTurnRequest{
			ThreadID: threadID,
			Content:  r.FormValue("content"),
		}
		if v := strings.TrimSpace(r.FormValue("agent_id")); v != "" {
			req.AgentID = new(v)
		} else if v := strings.TrimSpace(r.FormValue("agentId")); v != "" {
			req.AgentID = new(v)
		}
		if v := strings.TrimSpace(r.FormValue("model_id")); v != "" {
			req.ModelID = new(v)
		} else if v := strings.TrimSpace(r.FormValue("modelId")); v != "" {
			req.ModelID = new(v)
		}
		if v := strings.TrimSpace(r.FormValue("context_hint")); v != "" {
			req.ContextHint = new(v)
		} else if v := strings.TrimSpace(r.FormValue("contextHint")); v != "" {
			req.ContextHint = new(v)
		}

		for _, field := range []string{"attachments", "file", "files"} {
			for _, fh := range r.MultipartForm.File[field] {
				if fh.Size > maxSingleFileBytes {
					return nil, errors.E(op, errors.Invalid, ai.CodeInvalidAttachment, fmt.Sprintf("attachment %q exceeds 10 MB limit", fh.Filename))
				}
				f, err := fh.Open()
				if err != nil {
					return nil, errors.E(op, errors.Invalid, err)
				}
				data, rErr := io.ReadAll(io.LimitReader(f, maxSingleFileBytes+1))
				_ = f.Close()
				if rErr != nil {
					return nil, errors.E(op, errors.Invalid, rErr)
				}
				if len(data) > maxSingleFileBytes {
					return nil, errors.E(op, errors.Invalid, ai.CodeInvalidAttachment, fmt.Sprintf("attachment %q exceeds 10 MB limit", fh.Filename))
				}
				mime := fh.Header.Get("Content-Type")
				if mime == "" {
					mime = http.DetectContentType(data)
				}
				req.Attachments = append(req.Attachments, ai.TurnAttachment{
					Filename:    fh.Filename,
					ContentType: mime,
					Data:        data,
				})
			}
		}
		return req, nil
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxSSEBodyBytes)
	body, err := io.ReadAll(r.Body)
	if err != nil {
		return nil, errors.E(op, errors.Invalid, fmt.Sprintf("read request body: %v", err))
	}

	var pbReq aiv1.StreamThreadTurnRequest
	if len(strings.TrimSpace(string(body))) > 0 {
		if err := (protojson.UnmarshalOptions{DiscardUnknown: true}).Unmarshal(body, &pbReq); err != nil {
			return nil, errors.E(op, errors.Invalid, fmt.Sprintf("invalid JSON payload: %v", err))
		}
	}

	atts := make([]ai.TurnAttachment, 0, len(pbReq.Attachments))
	for _, a := range pbReq.Attachments {
		if a == nil {
			continue
		}
		atts = append(atts, ai.TurnAttachment{
			Filename:    a.Filename,
			ContentType: a.ContentType,
			Data:        a.Data,
		})
	}
	return &aiapp.StreamThreadTurnRequest{
		ThreadID:    threadID,
		Content:     pbReq.Content,
		Attachments: atts,
		AgentID:     pbReq.AgentId,
		ModelID:     pbReq.ModelId,
		ContextHint: pbReq.ContextHint,
	}, nil
}

func parseResolveApprovalsRequest(w http.ResponseWriter, r *http.Request, threadID string) (*aiapp.ResolveToolApprovalsRequest, error) {
	const op errors.Op = "http/ai.parseResolveApprovalsRequest"

	r.Body = http.MaxBytesReader(w, r.Body, maxSSEBodyBytes)
	body, err := io.ReadAll(r.Body)
	if err != nil {
		return nil, errors.E(op, errors.Invalid, fmt.Sprintf("read request body: %v", err))
	}

	var pbReq aiv1.StreamResolveToolApprovalsRequest
	if len(strings.TrimSpace(string(body))) > 0 {
		if err := (protojson.UnmarshalOptions{DiscardUnknown: true}).Unmarshal(body, &pbReq); err != nil {
			return nil, errors.E(op, errors.Invalid, fmt.Sprintf("invalid JSON payload: %v", err))
		}
	}

	decisions := make([]ai.ToolApprovalDecision, 0, len(pbReq.Decisions))
	for _, d := range pbReq.Decisions {
		if d == nil {
			continue
		}
		decisions = append(decisions, ai.ToolApprovalDecision{
			ToolCallID: d.ToolCallId,
			Approved:   d.Approved,
		})
	}
	return &aiapp.ResolveToolApprovalsRequest{
		ThreadID:  threadID,
		Decisions: decisions,
	}, nil
}
