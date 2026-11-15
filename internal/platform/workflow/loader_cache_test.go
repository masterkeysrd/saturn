package workflow

import (
	"context"
	"errors"
	"sync/atomic"
	"testing"
)

func TestLoaderCache_MemoizationConcurrencyAndInvalidation(t *testing.T) {
	celEval, err := NewCELEvaluator()
	if err != nil {
		t.Fatalf("NewCELEvaluator failed: %v", err)
	}

	var financeCalls atomic.Int32
	var calendarCalls atomic.Int32

	reg := NewRegistry()
	reg.RegisterLoader(LoaderDescriptor{Name: "finance.accounts", Owner: "finance"}, func(_ context.Context, spaceID string, params map[string]any) (any, error) {
		financeCalls.Add(1)
		return []string{"acc_" + spaceID + "_" + stringifyValue(params["currency"])}, nil
	})
	reg.RegisterLoader(LoaderDescriptor{Name: "calendar.calendars", Owner: "calendar"}, func(_ context.Context, _ string, _ map[string]any) (any, error) {
		calendarCalls.Add(1)
		return []string{"cal_primary"}, nil
	})
	reg.RegisterLoader(LoaderDescriptor{Name: "finance.failing", Owner: "finance"}, func(_ context.Context, _ string, _ map[string]any) (any, error) {
		return nil, errors.New("loader timeout")
	})

	state := &FlowState{
		Space: SpaceContext{ID: "spc_1", Timezone: "UTC"},
		Input: map[string]any{"cur": "USD"},
	}

	t.Run("Parallel prefetch, cache hit, and prefix invalidation", func(t *testing.T) {
		financeCalls.Store(0)
		calendarCalls.Store(0)

		lc := NewLoaderCache(reg, celEval)
		bindings := map[string]SourceBinding{
			"acc1": {Loader: "finance.accounts", Params: map[string]any{"currency": "{{ input.cur }}"}},
			"acc2": {Loader: "finance.accounts", Params: map[string]any{"currency": "USD"}},
			"cals": {Loader: "calendar.calendars"},
		}

		res, meta, err := lc.ResolveStepSources(t.Context(), "spc_1", bindings, state)
		if err != nil {
			t.Fatalf("ResolveStepSources failed: %v", err)
		}
		if res["acc1"] == nil || res["acc2"] == nil || res["cals"] == nil {
			t.Fatalf("expected all resolved sources, got %#v", res)
		}
		if got := financeCalls.Load(); got != 1 {
			t.Fatalf("expected singleflight deduplication to call finance.accounts once, got %d", got)
		}
		if got := calendarCalls.Load(); got != 1 {
			t.Fatalf("expected 1 calendar.calendars call, got %d", got)
		}
		if meta["acc1"] == nil {
			t.Fatalf("expected source telemetry for acc1")
		}

		// Second call hits cache for both
		_, _, err = lc.ResolveStepSources(t.Context(), "spc_1", bindings, state)
		if err != nil {
			t.Fatalf("second ResolveStepSources failed: %v", err)
		}
		if financeCalls.Load() != 1 || calendarCalls.Load() != 1 {
			t.Fatalf("expected cache hits; finance=%d calendar=%d", financeCalls.Load(), calendarCalls.Load())
		}

		// Invalidate finance.* only
		lc.InvalidatePrefix("finance.")
		_, _, err = lc.ResolveStepSources(t.Context(), "spc_1", bindings, state)
		if err != nil {
			t.Fatalf("third ResolveStepSources failed: %v", err)
		}
		if got := financeCalls.Load(); got != 2 {
			t.Fatalf("expected finance.accounts to re-run after invalidation, got %d", got)
		}
		if got := calendarCalls.Load(); got != 1 {
			t.Fatalf("expected calendar.calendars to stay cached, got %d", got)
		}
	})

	t.Run("Optional vs required failing loader", func(t *testing.T) {
		lc := NewLoaderCache(reg, celEval)

		res, meta, err := lc.ResolveStepSources(t.Context(), "spc_1", map[string]SourceBinding{
			"opt": {Loader: "finance.failing", Required: false},
		}, state)
		if err != nil {
			t.Fatalf("optional failing loader should not fail step: %v", err)
		}
		if res["opt"] != nil {
			t.Fatalf("expected nil output for failed optional loader, got %v", res["opt"])
		}
		if m, ok := meta["opt"].(map[string]any); !ok || m["error"] == nil {
			t.Fatalf("expected error recorded in telemetry, got %#v", meta["opt"])
		}

		_, _, err = lc.ResolveStepSources(t.Context(), "spc_1", map[string]SourceBinding{
			"req": {Loader: "finance.failing", Required: true},
		}, state)
		if err == nil {
			t.Fatal("expected error for required failing loader, got nil")
		}
	})
}
