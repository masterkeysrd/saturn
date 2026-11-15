package workflow

import (
	"context"
	"encoding/json/v2"
	"fmt"
	"reflect"
	"strings"
	"sync"
	"time"

	"golang.org/x/sync/errgroup"
)

type cachedLoaderEntry struct {
	value any
}

type inflightLoaderCall struct {
	done  chan struct{}
	value any
	err   error
}

// LoaderCache memoizes read-only DataLoader results for the duration of a single FlowRun
// and supports domain-prefix invalidation after Action Steps execute.
type LoaderCache struct {
	registry *Registry
	cel      *CELEvaluator
	mu       sync.Mutex
	entries  map[string]cachedLoaderEntry
	inflight map[string]*inflightLoaderCall
}

// NewLoaderCache creates a per-run LoaderCache backed by registry and cel.
func NewLoaderCache(registry *Registry, cel *CELEvaluator) *LoaderCache {
	return &LoaderCache{
		registry: registry,
		cel:      cel,
		entries:  make(map[string]cachedLoaderEntry),
		inflight: make(map[string]*inflightLoaderCall),
	}
}

// ResolveStepSources evaluates params via CEL and fetches all step source bindings concurrently.
func (lc *LoaderCache) ResolveStepSources(
	ctx context.Context,
	spaceID string,
	bindings map[string]SourceBinding,
	state *FlowState,
) (map[string]any, map[string]any, error) {
	if len(bindings) == 0 {
		return map[string]any{}, map[string]any{}, nil
	}

	type resolvedBinding struct {
		alias   string
		binding SourceBinding
		params  map[string]any
	}

	resolvedBindings := make([]resolvedBinding, 0, len(bindings))
	for alias, b := range bindings {
		params, err := lc.cel.ResolveMap(b.Params, state, nil)
		if err != nil {
			return nil, nil, fmt.Errorf("resolve params for source %q: %w", alias, err)
		}
		resolvedBindings = append(resolvedBindings, resolvedBinding{
			alias:   alias,
			binding: b,
			params:  params,
		})
	}

	var outMu sync.Mutex
	resolved := make(map[string]any, len(resolvedBindings))
	telemetry := make(map[string]any, len(resolvedBindings))

	g, gCtx := errgroup.WithContext(ctx)
	for _, rb := range resolvedBindings {
		g.Go(func() error {
			start := time.Now()
			val, cacheHit, err := lc.getOrLoad(gCtx, spaceID, rb.binding.Loader, rb.params)
			durationMs := time.Since(start).Milliseconds()

			meta := map[string]any{
				"loader":      rb.binding.Loader,
				"hit":         cacheHit,
				"duration_ms": durationMs,
			}
			if count, hasCount := countValue(val); hasCount {
				meta["count"] = count
			}

			if err != nil {
				meta["error"] = err.Error()
				outMu.Lock()
				telemetry[rb.alias] = meta
				resolved[rb.alias] = nil
				outMu.Unlock()
				if rb.binding.Required {
					return fmt.Errorf("required source %q (%s): %w", rb.alias, rb.binding.Loader, err)
				}
				return nil
			}

			outMu.Lock()
			telemetry[rb.alias] = meta
			resolved[rb.alias] = val
			outMu.Unlock()
			return nil
		})
	}

	if err := g.Wait(); err != nil {
		return nil, telemetry, err
	}
	return resolved, telemetry, nil
}

// InvalidatePrefix evicts all cached loader results whose loader name starts with prefix (e.g. "finance.").
func (lc *LoaderCache) InvalidatePrefix(prefix string) {
	if lc == nil || prefix == "" {
		return
	}
	lc.mu.Lock()
	defer lc.mu.Unlock()
	keyPrefix := prefix
	for k := range lc.entries {
		loaderName, _, _ := strings.Cut(k, "|")
		if strings.HasPrefix(loaderName, keyPrefix) {
			delete(lc.entries, k)
		}
	}
}

func (lc *LoaderCache) getOrLoad(
	ctx context.Context,
	spaceID string,
	loaderName string,
	params map[string]any,
) (any, bool, error) {
	_, loader, ok := lc.registry.GetLoader(loaderName)
	if !ok || loader == nil {
		return nil, false, fmt.Errorf("unknown loader %q", loaderName)
	}

	paramKey := "{}"
	if len(params) > 0 {
		if b, err := json.Marshal(params, json.Deterministic(true)); err == nil {
			paramKey = string(b)
		}
	}
	cacheKey := loaderName + "|" + paramKey

	lc.mu.Lock()
	if entry, found := lc.entries[cacheKey]; found {
		lc.mu.Unlock()
		return entry.value, true, nil
	}
	if call, running := lc.inflight[cacheKey]; running {
		lc.mu.Unlock()
		select {
		case <-call.done:
			return call.value, true, call.err
		case <-ctx.Done():
			return nil, false, ctx.Err()
		}
	}
	call := &inflightLoaderCall{done: make(chan struct{})}
	lc.inflight[cacheKey] = call
	lc.mu.Unlock()

	val, err := loader.Load(ctx, spaceID, params)

	lc.mu.Lock()
	delete(lc.inflight, cacheKey)
	if err == nil {
		lc.entries[cacheKey] = cachedLoaderEntry{value: val}
	}
	call.value = val
	call.err = err
	close(call.done)
	lc.mu.Unlock()

	return val, false, err
}

func countValue(v any) (int, bool) {
	if v == nil {
		return 0, false
	}
	rv := reflect.ValueOf(v)
	switch rv.Kind() {
	case reflect.Slice, reflect.Array, reflect.Map:
		return rv.Len(), true
	default:
		return 0, false
	}
}
