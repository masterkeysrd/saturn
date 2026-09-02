// Package shutdown provides a mechanism to register shutdown callbacks,
// execute them in LIFO order with a global timeout, and integrate with
// OS signals via os/signal.NotifyContext.
package shutdown

import (
	"context"
	"fmt"
	"log/slog"
	"os/signal"
	"sync"
	"syscall"
	"time"
)

// Callback is the signature for shutdown callbacks.
type Callback func(context.Context) error

// Manager coordinates shutdown callbacks with a global timeout.
// Callbacks are executed in LIFO (stack) order.
type Manager struct {
	mu        sync.Mutex
	callbacks []Callback
	timeout   time.Duration
}

// Option configures a Manager.
type Option func(*Manager)

// WithTimeout sets the maximum duration for the entire shutdown sequence.
func WithTimeout(d time.Duration) Option {
	return func(m *Manager) {
		m.timeout = d
	}
}

// New creates a Manager with the given options.
func New(opts ...Option) *Manager {
	m := &Manager{
		callbacks: make([]Callback, 0),
		timeout:   30 * time.Second, // default timeout
	}
	for _, opt := range opts {
		opt(m)
	}
	return m
}

// Register adds a shutdown callback. Callbacks are executed in LIFO order.
func (m *Manager) Register(cb Callback) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.callbacks = append(m.callbacks, cb)
}

// Defer returns a zero-argument function suitable for use with defer.
// It executes all registered shutdown callbacks and recovers from any panic,
// logging it as an error so the panic does not crash the program.
func (m *Manager) Defer() func() {
	return func() {
		if err := m.Execute(); err != nil {
			slog.Error("shutdown failed", "err", err)
		}
	}
}

// Execute runs all registered callbacks in LIFO order with the configured timeout.
// Returns an error if any callback fails or the timeout is exceeded.
func (m *Manager) Execute() error {
	m.mu.Lock()
	cbSlice := make([]Callback, len(m.callbacks))
	copy(cbSlice, m.callbacks)
	m.mu.Unlock()

	ctx, cancel := context.WithTimeout(context.Background(), m.timeout)
	defer cancel()

	var firstErr error

	// Execute in LIFO (stack) order: reverse iteration
	for i := len(cbSlice) - 1; i >= 0; i-- {
		slog.Info("executing shutdown callback", "index", i)

		// Recover from panics to ensure all callbacks are attempted
		var err error
		func() {
			defer func() {
				if r := recover(); r != nil {
					slog.Error("shutdown callback panicked", "index", i, "panic", r)
					err = fmt.Errorf("callback %d panicked: %v", i, r)
				}
			}()
			err = cbSlice[i](ctx)
		}()

		if err != nil {
			slog.Error("shutdown callback error", "index", i, "err", err)
			if firstErr == nil {
				firstErr = fmt.Errorf("callback %d: %w", i, err)
			}
		}
	}

	if ctx.Err() == context.DeadlineExceeded {
		if firstErr != nil {
			return fmt.Errorf("timeout and callbacks failed: %w", firstErr)
		}
		return fmt.Errorf("shutdown timeout exceeded")
	}

	return firstErr
}

// Init starts a goroutine that listens for SIGINT/SIGTERM and cancels
// the returned context when a signal is received. It also executes all
// registered shutdown callbacks.
func (m *Manager) Init() (context.Context, func()) {
	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)

	go func() {
		<-ctx.Done()
		slog.Info("shutdown signal received", "reason", ctx.Err())
		_ = m.Execute()
	}()

	return ctx, cancel
}
