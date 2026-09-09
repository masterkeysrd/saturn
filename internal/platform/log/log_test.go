package log_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/log"
)

func TestLogger_JSONOutput(t *testing.T) {
	buf := &bytes.Buffer{}
	logger := log.New(
		log.WithLevel(log.LevelInfo),
		log.WithJSON(),
		log.WithOutput(buf),
		log.WithSource(false),
	)

	ctx := context.Background()
	logger.Info(ctx, "test message",
		log.String("component", "space"),
		log.Int("attempts", 3),
		log.Bool("active", true),
	)

	var payload map[string]any
	if err := json.Unmarshal(buf.Bytes(), &payload); err != nil {
		t.Fatalf("failed to unmarshal JSON log: %v\nOutput was: %s", err, buf.String())
	}

	if payload["msg"] != "test message" {
		t.Errorf("expected msg 'test message', got %v", payload["msg"])
	}
	if payload["level"] != "INFO" {
		t.Errorf("expected level 'INFO', got %v", payload["level"])
	}
	if payload["component"] != "space" {
		t.Errorf("expected component 'space', got %v", payload["component"])
	}
	if payload["attempts"] != float64(3) {
		t.Errorf("expected attempts 3, got %v", payload["attempts"])
	}
	if payload["active"] != true {
		t.Errorf("expected active true, got %v", payload["active"])
	}
}

func TestLogger_TextOutput(t *testing.T) {
	buf := &bytes.Buffer{}
	logger := log.New(
		log.WithLevel(log.LevelInfo),
		log.WithText(),
		log.WithOutput(buf),
		log.WithSource(false),
	)

	ctx := context.Background()
	logger.Warn(ctx, "warning event", log.String("key", "val"))

	out := buf.String()
	if !strings.Contains(out, "level=WARN") {
		t.Errorf("expected output to contain level=WARN, got %s", out)
	}
	if !strings.Contains(out, `msg="warning event"`) && !strings.Contains(out, "msg=warning event") {
		t.Errorf("expected output to contain msg, got %s", out)
	}
	if !strings.Contains(out, "key=val") {
		t.Errorf("expected output to contain key=val, got %s", out)
	}
}

func TestLogger_LevelFiltering(t *testing.T) {
	buf := &bytes.Buffer{}
	logger := log.New(
		log.WithLevel(log.LevelWarn),
		log.WithJSON(),
		log.WithOutput(buf),
	)

	ctx := context.Background()
	logger.Debug(ctx, "debug message")
	logger.Info(ctx, "info message")

	if buf.Len() > 0 {
		t.Fatalf("expected no output for debug/info when level is Warn, got: %s", buf.String())
	}

	logger.Warn(ctx, "warn message")
	if !strings.Contains(buf.String(), "warn message") {
		t.Errorf("expected warn message to be recorded, got: %s", buf.String())
	}
}

func TestLogger_Middleware_ContextEnricher(t *testing.T) {
	type ctxKey string
	const reqKey ctxKey = "req_id"

	reqExtractor := func(ctx context.Context) []log.Field {
		if id, ok := ctx.Value(reqKey).(string); ok && id != "" {
			return []log.Field{log.String("request_id", id)}
		}
		return nil
	}

	buf := &bytes.Buffer{}
	logger := log.New(
		log.WithLevel(log.LevelInfo),
		log.WithJSON(),
		log.WithOutput(buf),
		log.WithSource(false),
		log.WithMiddleware(log.ContextEnricher(reqExtractor)),
	)

	ctx := context.WithValue(context.Background(), reqKey, "req_12345")
	logger.Info(ctx, "request handled", log.String("status", "ok"))

	var payload map[string]any
	if err := json.Unmarshal(buf.Bytes(), &payload); err != nil {
		t.Fatalf("failed to parse JSON log: %v", err)
	}

	if payload["request_id"] != "req_12345" {
		t.Errorf("expected request_id req_12345, got %v", payload["request_id"])
	}
	if payload["status"] != "ok" {
		t.Errorf("expected status ok, got %v", payload["status"])
	}
}

func TestLogger_Middleware_Redaction(t *testing.T) {
	buf := &bytes.Buffer{}
	logger := log.New(
		log.WithLevel(log.LevelInfo),
		log.WithJSON(),
		log.WithOutput(buf),
		log.WithSource(false),
		log.WithMiddleware(log.Redaction("password", "token")),
	)

	ctx := context.Background()
	logger.Info(ctx, "login attempt",
		log.String("username", "alice"),
		log.String("password", "super-secret-pass"),
		log.String("token", "bearer-token-123"),
	)

	var payload map[string]any
	if err := json.Unmarshal(buf.Bytes(), &payload); err != nil {
		t.Fatalf("failed to parse JSON log: %v", err)
	}

	if payload["password"] != "[REDACTED]" {
		t.Errorf("expected password to be redacted, got %v", payload["password"])
	}
	if payload["token"] != "[REDACTED]" {
		t.Errorf("expected token to be redacted, got %v", payload["token"])
	}
	if payload["username"] != "alice" {
		t.Errorf("expected username to remain alice, got %v", payload["username"])
	}
}

func TestLogger_Err_PlatformErrorUnpacking(t *testing.T) {
	buf := &bytes.Buffer{}
	logger := log.New(
		log.WithLevel(log.LevelError),
		log.WithJSON(),
		log.WithOutput(buf),
		log.WithSource(false),
	)

	ctx := context.Background()
	platErr := errors.E(errors.Op("domain/space.CreateSpace"), errors.Exist, errors.Code("SPACE_EXISTS"), "space already exists")

	logger.Error(ctx, "failed to create space", log.Err(platErr))

	var payload map[string]any
	if err := json.Unmarshal(buf.Bytes(), &payload); err != nil {
		t.Fatalf("failed to parse JSON log: %v", err)
	}

	errObj, ok := payload["error"].(map[string]any)
	if !ok {
		t.Fatalf("expected error to be a JSON object, got: %T", payload["error"])
	}

	if errObj["code"] != "SPACE_EXISTS" {
		t.Errorf("expected code SPACE_EXISTS, got %v", errObj["code"])
	}
	if errObj["kind"] != "already_exists" {
		t.Errorf("expected kind already_exists, got %v", errObj["kind"])
	}
	if !strings.Contains(fmt.Sprint(errObj["op_trace"]), "domain/space.CreateSpace") {
		t.Errorf("expected op_trace to contain domain/space.CreateSpace, got %v", errObj["op_trace"])
	}
}

func TestLogger_With_And_WithGroup(t *testing.T) {
	buf := &bytes.Buffer{}
	base := log.New(
		log.WithLevel(log.LevelInfo),
		log.WithJSON(),
		log.WithOutput(buf),
		log.WithSource(false),
	)

	subLogger := base.With(log.String("service", "billing")).WithGroup("metadata")

	ctx := context.Background()
	subLogger.Info(ctx, "invoice paid", log.Int64("amount_cents", 1500))

	var payload map[string]any
	if err := json.Unmarshal(buf.Bytes(), &payload); err != nil {
		t.Fatalf("failed to parse JSON log: %v", err)
	}

	if payload["service"] != "billing" {
		t.Errorf("expected service billing, got %v", payload["service"])
	}

	metaObj, ok := payload["metadata"].(map[string]any)
	if !ok {
		t.Fatalf("expected metadata group object, got: %T", payload["metadata"])
	}
	if metaObj["amount_cents"] != float64(1500) {
		t.Errorf("expected amount_cents 1500, got %v", metaObj["amount_cents"])
	}
}

func TestLogger_GroupField(t *testing.T) {
	buf := &bytes.Buffer{}
	logger := log.New(
		log.WithLevel(log.LevelInfo),
		log.WithJSON(),
		log.WithOutput(buf),
		log.WithSource(false),
	)

	ctx := context.Background()
	logger.Info(ctx, "user action",
		log.Group("user",
			log.String("id", "usr_1"),
			log.String("role", "admin"),
		),
	)

	var payload map[string]any
	if err := json.Unmarshal(buf.Bytes(), &payload); err != nil {
		t.Fatalf("failed to unmarshal JSON: %v", err)
	}

	userObj, ok := payload["user"].(map[string]any)
	if !ok {
		t.Fatalf("expected user to be an object, got %T", payload["user"])
	}

	if userObj["id"] != "usr_1" {
		t.Errorf("expected user.id usr_1, got %v", userObj["id"])
	}
	if userObj["role"] != "admin" {
		t.Errorf("expected user.role admin, got %v", userObj["role"])
	}
}

func TestParseLevel(t *testing.T) {
	tests := []struct {
		input string
		want  log.Level
	}{
		{"debug", log.LevelDebug},
		{"DEBUG", log.LevelDebug},
		{"info", log.LevelInfo},
		{"warn", log.LevelWarn},
		{"warning", log.LevelWarn},
		{"error", log.LevelError},
	}

	for _, tt := range tests {
		got, err := log.ParseLevel(tt.input)
		if err != nil {
			t.Errorf("ParseLevel(%q) unexpected error: %v", tt.input, err)
		}
		if got != tt.want {
			t.Errorf("ParseLevel(%q) = %v, want %v", tt.input, got, tt.want)
		}
	}

	if _, err := log.ParseLevel("invalid"); err == nil {
		t.Errorf("expected error for invalid level string")
	}
}

func TestLogger_SourceCaller(t *testing.T) {
	buf := &bytes.Buffer{}
	logger := log.New(
		log.WithLevel(log.LevelInfo),
		log.WithJSON(),
		log.WithOutput(buf),
		log.WithSource(true),
	)

	ctx := context.Background()
	logger.Info(ctx, "caller test")

	var payload map[string]any
	if err := json.Unmarshal(buf.Bytes(), &payload); err != nil {
		t.Fatalf("failed to parse JSON: %v", err)
	}

	src, ok := payload["source"].(map[string]any)
	if !ok {
		t.Fatalf("expected source map in log payload, got %v", payload["source"])
	}

	file, _ := src["file"].(string)
	if !strings.HasSuffix(file, "log_test.go") {
		t.Errorf("expected source file to end with log_test.go, got %v", file)
	}
}

func BenchmarkLogger(b *testing.B) {
	buf := &bytes.Buffer{}
	logger := log.New(
		log.WithLevel(log.LevelInfo),
		log.WithJSON(),
		log.WithOutput(buf),
		log.WithSource(false),
		log.WithMiddleware(
			log.MiddlewareFunc(func(ctx context.Context, level log.Level, msg string, fields []log.Field) []log.Field {
				return append(fields, log.String("mw_key", "mw_val"))
			}),
		),
	)

	ctx := context.Background()
	b.ResetTimer()
	b.ReportAllocs()

	for i := 0; i < b.N; i++ {
		buf.Reset()
		logger.Info(ctx, "bench log",
			log.String("k1", "v1"),
			log.Int64("k2", 12345),
			log.Duration("k3", time.Millisecond),
		)
	}
}
