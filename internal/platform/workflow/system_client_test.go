package workflow

import (
	"context"
	"strings"
	"testing"

	platformerrors "github.com/masterkeysrd/saturn/internal/platform/errors"
)

type summarizeInput struct {
	ThreadID string `json:"thread_id"`
	Language string `json:"language,omitempty"`
}

type summarizeOutput struct {
	ThreadID string `json:"thread_id"`
	Summary  string `json:"summary"`
}

type recordingSystemFlowRunner struct {
	systemKey string
	input     map[string]any
	run       *FlowRun
	err       error
	calls     int
}

func (r *recordingSystemFlowRunner) ExecuteSystemFlowRaw(_ context.Context, systemKey string, input map[string]any) (*FlowRun, error) {
	r.calls++
	r.systemKey = systemKey
	r.input = input
	return r.run, r.err
}

func TestNewSystemFlowKey(t *testing.T) {
	key := NewSystemFlowKey[summarizeInput]("system.mail.summarize_thread")
	if key.Key() != "system.mail.summarize_thread" {
		t.Errorf("Key() = %q, want %q", key.Key(), "system.mail.summarize_thread")
	}
}

func TestSystemFlowClient_Execute(t *testing.T) {
	tests := []struct {
		name        string
		runner      *recordingSystemFlowRunner
		wantErr     any
		wantRunID   string
		wantKey     string
		wantInput   map[string]any
		wantMessage string
	}{
		{
			name: "typed input marshals to snake_case map and returns run",
			runner: &recordingSystemFlowRunner{
				run: &FlowRun{ID: "wfr_1", Status: RunCompleted, Output: map[string]any{"thread_id": "mth_1"}},
			},
			wantRunID: "wfr_1",
			wantKey:   "system.mail.summarize_thread",
			wantInput: map[string]any{"thread_id": "mth_1"},
		},
		{
			name:      "runner error propagates",
			runner:    &recordingSystemFlowRunner{err: platformerrors.E(platformerrors.Internal, "llm unavailable")},
			wantErr:   platformerrors.Internal,
			wantKey:   "system.mail.summarize_thread",
			wantInput: map[string]any{"thread_id": "mth_1"},
		},
		{
			name: "failed run surfaces internal error with message",
			runner: &recordingSystemFlowRunner{
				run: &FlowRun{ID: "wfr_2", Status: RunFailed, Error: &FlowError{Message: "step exploded"}},
			},
			wantErr:     platformerrors.Internal,
			wantRunID:   "wfr_2",
			wantKey:     "system.mail.summarize_thread",
			wantInput:   map[string]any{"thread_id": "mth_1"},
			wantMessage: "step exploded",
		},
		{
			name:        "nil run surfaces internal error",
			runner:      &recordingSystemFlowRunner{},
			wantErr:     platformerrors.Internal,
			wantKey:     "system.mail.summarize_thread",
			wantInput:   map[string]any{"thread_id": "mth_1"},
			wantMessage: "returned no run",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			client := BindSystemFlow(tc.runner, NewSystemFlowKey[summarizeInput]("system.mail.summarize_thread"))

			run, err := client.Execute(t.Context(), summarizeInput{ThreadID: "mth_1"})

			if tc.wantErr != nil {
				if !platformerrors.Is(err, tc.wantErr) {
					t.Fatalf("Execute() error = %v, want errors.Is %v", err, tc.wantErr)
				}
			} else if err != nil {
				t.Fatalf("Execute() unexpected error = %v", err)
			}
			if tc.runner.calls != 1 {
				t.Errorf("runner calls = %d, want 1", tc.runner.calls)
			}
			if tc.wantKey != "" && tc.runner.systemKey != tc.wantKey {
				t.Errorf("systemKey = %q, want %q", tc.runner.systemKey, tc.wantKey)
			}
			if tc.wantInput != nil {
				if len(tc.runner.input) != len(tc.wantInput) {
					t.Fatalf("input = %+v, want %+v", tc.runner.input, tc.wantInput)
				}
				for k, v := range tc.wantInput {
					if tc.runner.input[k] != v {
						t.Errorf("input[%q] = %v, want %v", k, tc.runner.input[k], v)
					}
				}
			}
			if tc.wantRunID != "" {
				if run == nil {
					t.Fatalf("expected run with id %q, got nil", tc.wantRunID)
				}
				if run.ID != tc.wantRunID {
					t.Errorf("run.ID = %q, want %q", run.ID, tc.wantRunID)
				}
			} else if run != nil {
				t.Errorf("expected nil run, got %+v", run)
			}
			if tc.wantMessage != "" {
				if err == nil {
					t.Fatalf("expected error containing %q, got nil", tc.wantMessage)
				}
				if !strings.Contains(err.Error(), tc.wantMessage) {
					t.Errorf("error = %q, want it to contain %q", err.Error(), tc.wantMessage)
				}
			}
		})
	}
}

func TestSystemFlowClient_ExecuteDecode(t *testing.T) {
	tests := []struct {
		name    string
		runner  *recordingSystemFlowRunner
		wantErr bool
		wantOut *summarizeOutput
	}{
		{
			name: "decodes typed output from completed run",
			runner: &recordingSystemFlowRunner{
				run: &FlowRun{
					ID:     "wfr_1",
					Status: RunCompleted,
					Output: map[string]any{"thread_id": "mth_1", "summary": "ok"},
				},
			},
			wantOut: &summarizeOutput{ThreadID: "mth_1", Summary: "ok"},
		},
		{
			name:    "failed run propagates error",
			runner:  &recordingSystemFlowRunner{run: &FlowRun{ID: "wfr_2", Status: RunFailed, Error: &FlowError{Message: "boom"}}},
			wantErr: true,
		},
		{
			name: "incompatible output fails decode",
			runner: &recordingSystemFlowRunner{
				run: &FlowRun{ID: "wfr_3", Status: RunCompleted, Output: map[string]any{"thread_id": 42}},
			},
			wantErr: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			client := BindSystemFlow(tc.runner, NewSystemFlowKey[summarizeInput]("system.mail.summarize_thread"))

			out, err := client.ExecuteDecode[summarizeOutput](t.Context(), summarizeInput{ThreadID: "mth_1"})
			if tc.wantErr {
				if err == nil {
					t.Fatalf("ExecuteDecode() expected error, got %+v", out)
				}
				return
			}
			if err != nil {
				t.Fatalf("ExecuteDecode() unexpected error = %v", err)
			}
			if out == nil || *out != *tc.wantOut {
				t.Fatalf("ExecuteDecode() = %+v, want %+v", out, tc.wantOut)
			}
		})
	}
}
