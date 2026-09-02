package shutdown

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestRegisterAndExecute(t *testing.T) {
	m := New()

	var order []string
	mu := sync.Mutex{}

	m.Register(func(ctx context.Context) error {
		mu.Lock()
		defer mu.Unlock()
		order = append(order, "cb2")
		return nil
	})
	m.Register(func(ctx context.Context) error {
		mu.Lock()
		defer mu.Unlock()
		order = append(order, "cb1")
		return nil
	})

	err := m.Execute()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	mu.Lock()
	defer mu.Unlock()

	// LIFO: cb1 was registered after cb2, so cb1 runs first
	if len(order) != 2 || order[0] != "cb1" || order[1] != "cb2" {
		t.Errorf("expected LIFO order [cb1, cb2], got %v", order)
	}
}

func TestExecuteReturnsError(t *testing.T) {
	m := New()

	expected := errors.New("fail")
	m.Register(func(ctx context.Context) error {
		return expected
	})

	err := m.Execute()
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !errors.Is(err, expected) {
		t.Errorf("expected error to be %v, got %v", expected, err)
	}
}

func TestDeferCatchesPanic(t *testing.T) {
	m := New()

	var recovered atomic.Bool
	m.Register(func(ctx context.Context) error {
		recovered.Store(true)
		return nil
	})

	// Defer() should not panic even if a callback panics
	m.Register(func(ctx context.Context) error {
		panic("test panic")
	})

	// Recover from any panic from Execute
	func() {
		defer func() {
			if r := recover(); r != nil {
				t.Errorf("Execute panicked unexpectedly: %v", r)
			}
		}()
		_ = m.Execute()
	}()

	if !recovered.Load() {
		t.Error("expected callback to run before panic")
	}
}

func TestDeferReturnsFunc(t *testing.T) {
	m := New()
	cb := m.Defer()
	if cb == nil {
		t.Fatal("Defer returned nil")
	}
	// Should be callable without error
	cb()
}

func TestTimeout(t *testing.T) {
	m := New(WithTimeout(50 * time.Millisecond))

	done := make(chan struct{})
	m.Register(func(ctx context.Context) error {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-done:
			return nil
		}
	})

	start := time.Now()
	err := m.Execute()
	elapsed := time.Since(start)

	if err == nil {
		t.Fatal("expected timeout error, got nil")
	}
	if elapsed > 150*time.Millisecond {
		t.Errorf("expected timeout around 50ms, got %v", elapsed)
	}
}

func TestDefaultTimeout(t *testing.T) {
	m := New()
	if m.timeout != 30*time.Second {
		t.Errorf("expected default timeout 30s, got %v", m.timeout)
	}
}

func TestExecuteEmpty(t *testing.T) {
	m := New()
	err := m.Execute()
	if err != nil {
		t.Errorf("expected nil error for empty callbacks, got %v", err)
	}
}

func TestInitReturnsContext(t *testing.T) {
	m := New()
	ctx, cancel := m.Init()
	defer cancel()

	if ctx == nil {
		t.Fatal("Init returned nil context")
	}

	cancel()
	select {
	case <-ctx.Done():
		// expected
	case <-time.After(100 * time.Millisecond):
		t.Fatal("context should be done after cancel")
	}
}
