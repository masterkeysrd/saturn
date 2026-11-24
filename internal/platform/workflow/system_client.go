package workflow

import (
	"context"
	"encoding/json/v2"
	"fmt"

	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

// SystemFlowRunner is the narrow port backing a bound SystemFlowClient,
// implemented by the workflow application Coordinator. It accepts the
// already-serialized flow input so callers never handle map[string]any directly.
//
// @Mock
type SystemFlowRunner interface {
	// ExecuteSystemFlowRaw executes a built-in system flow (system.* key) for the active space.
	ExecuteSystemFlowRaw(ctx context.Context, systemKey string, input map[string]any) (*FlowRun, error)
}

// SystemFlowKey binds a built-in system flow key to its strongly-typed input struct I.
type SystemFlowKey[I any] struct {
	systemKey string
}

// NewSystemFlowKey creates a typed SystemFlowKey descriptor.
func NewSystemFlowKey[I any](systemKey string) SystemFlowKey[I] {
	return SystemFlowKey[I]{systemKey: systemKey}
}

// Key returns the underlying system flow key string.
func (k SystemFlowKey[I]) Key() string {
	return k.systemKey
}

// SystemFlowClient executes a bound built-in system flow with strongly-typed
// inputs I, keeping JSON marshaling and failure surfacing out of domain
// callers (Go 1.27 generic receiver methods per AGENTS.md Rule #9).
type SystemFlowClient[I any] struct {
	runner SystemFlowRunner
	key    SystemFlowKey[I]
}

// BindSystemFlow binds a SystemFlowRunner to a typed SystemFlowKey[I].
func BindSystemFlow[I any](runner SystemFlowRunner, key SystemFlowKey[I]) *SystemFlowClient[I] {
	return &SystemFlowClient[I]{runner: runner, key: key}
}

// Execute invokes the bound system flow with input and returns the completed
// FlowRun, surfacing failed runs as errors.Internal.
func (c *SystemFlowClient[I]) Execute(ctx context.Context, input I) (*FlowRun, error) {
	const op errors.Op = "platform/workflow.SystemFlowClient.Execute"

	systemKey := c.key.Key()
	run, err := c.runner.ExecuteSystemFlowRaw(ctx, systemKey, StructToMap(input))
	if err != nil {
		return nil, errors.E(op, err)
	}
	if run == nil {
		return nil, errors.E(op, errors.Internal, fmt.Sprintf("system flow %q returned no run", systemKey))
	}
	if run.Status == RunFailed {
		failure := "unknown workflow failure"
		if run.Error != nil && run.Error.Message != "" {
			failure = run.Error.Message
		}
		return run, errors.E(op, errors.Internal, fmt.Sprintf("system flow %q run failed: %s", systemKey, failure))
	}
	return run, nil
}

// ExecuteDecode invokes the bound system flow and decodes the completed run's
// output into the typed output struct O.
func (c *SystemFlowClient[I]) ExecuteDecode[O any](ctx context.Context, input I) (*O, error) {
	const op errors.Op = "platform/workflow.SystemFlowClient.ExecuteDecode"

	run, err := c.Execute(ctx, input)
	if err != nil {
		return nil, err
	}
	data, err := json.Marshal(run.Output)
	if err != nil {
		return nil, errors.E(op, err)
	}
	var out O
	if err := json.Unmarshal(data, &out); err != nil {
		return nil, errors.E(op, err)
	}
	return &out, nil
}
