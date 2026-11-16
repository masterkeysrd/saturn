package workflow

import (
	"testing"

	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

func TestIDGenerators(t *testing.T) {
	tests := []struct {
		name     string
		generate func() (string, error)
		validate func(string) error
		prefix   string
	}{
		{
			name:     "Flow ID",
			generate: GenerateFlowID,
			validate: ValidateFlowID,
			prefix:   FlowPrefix,
		},
		{
			name:     "Trigger ID",
			generate: GenerateTriggerID,
			validate: ValidateTriggerID,
			prefix:   TriggerPrefix,
		},
		{
			name:     "FlowRun ID",
			generate: GenerateFlowRunID,
			validate: ValidateFlowRunID,
			prefix:   FlowRunPrefix,
		},
		{
			name:     "StepRun ID",
			generate: GenerateStepRunID,
			validate: ValidateStepRunID,
			prefix:   StepRunPrefix,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			idStr, err := tc.generate()
			if err != nil {
				t.Fatalf("generate failed: %v", err)
			}
			if len(idStr) <= len(tc.prefix) || idStr[:len(tc.prefix)] != tc.prefix {
				t.Fatalf("expected prefix %q, got %q", tc.prefix, idStr)
			}
			if err := tc.validate(idStr); err != nil {
				t.Fatalf("validate failed for %q: %v", idStr, err)
			}
			if err := tc.validate("bad_123"); err == nil {
				t.Fatal("expected error for invalid prefix, got nil")
			}
		})
	}
}

func TestFlow_EnsureDeletable(t *testing.T) {
	tests := []struct {
		name      string
		flow      *Flow
		wantErr   bool
		wantKind  errors.Kind
		wantError error
	}{
		{
			name: "User flow is deletable",
			flow: &Flow{ID: "flw_1", IsSystem: false},
		},
		{
			name:      "System flow cannot be deleted",
			flow:      &Flow{ID: "flw_2", IsSystem: true},
			wantErr:   true,
			wantKind:  errors.Precondition,
			wantError: ErrCannotDeleteSystemFlow,
		},
		{
			name:      "Nil flow returns not found",
			flow:      nil,
			wantErr:   true,
			wantKind:  errors.NotExist,
			wantError: ErrFlowNotFound,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			err := tc.flow.EnsureDeletable()
			if tc.wantErr {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				if domErr, ok := errors.AsType[*errors.Error](err); ok {
					if domErr.Kind != tc.wantKind {
						t.Fatalf("expected kind %v, got %v", tc.wantKind, domErr.Kind)
					}
				} else {
					t.Fatalf("expected *errors.Error, got %T", err)
				}
				if tc.wantError != nil && !errors.Is(err, tc.wantError) {
					t.Fatalf("expected %v, got %v", tc.wantError, err)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
		})
	}
}

func TestFlowAndTriggerValidation(t *testing.T) {
	tests := []struct {
		name    string
		flow    *Flow
		wantErr bool
	}{
		{
			name:    "Nil flow",
			flow:    nil,
			wantErr: true,
		},
		{
			name: "Missing name",
			flow: &Flow{
				Steps: []StepNode{{ID: "s1", Type: StepTransform}},
			},
			wantErr: true,
		},
		{
			name: "Empty steps",
			flow: &Flow{
				Name: "My Flow",
			},
			wantErr: true,
		},
		{
			name: "Negative timeout",
			flow: &Flow{
				Name:   "My Flow",
				Config: FlowConfig{TimeoutSeconds: new(int32(-1))},
				Steps:  []StepNode{{ID: "s1", Type: StepTransform}},
			},
			wantErr: true,
		},
		{
			name: "Event trigger missing topic",
			flow: &Flow{
				Name:     "My Flow",
				Steps:    []StepNode{{ID: "s1", Type: StepTransform}},
				Triggers: []Trigger{{Name: "Evt", Type: TriggerEvent}},
			},
			wantErr: true,
		},
		{
			name: "Schedule trigger missing cron",
			flow: &Flow{
				Name:     "My Flow",
				Steps:    []StepNode{{ID: "s1", Type: StepTransform}},
				Triggers: []Trigger{{Name: "Sched", Type: TriggerSchedule}},
			},
			wantErr: true,
		},
		{
			name: "Invalid trigger type",
			flow: &Flow{
				Name:     "My Flow",
				Steps:    []StepNode{{ID: "s1", Type: StepTransform}},
				Triggers: []Trigger{{Name: "Bad", Type: TriggerType("sms")}},
			},
			wantErr: true,
		},
		{
			name: "Valid flow with event and manual triggers",
			flow: &Flow{
				Name: "Valid Flow",
				Steps: []StepNode{
					{ID: "s1", Type: StepTransform},
				},
				Triggers: []Trigger{
					{Name: "Mail", Type: TriggerEvent, Config: TriggerConfig{Topic: new("mail.message.received")}},
					{Name: "Manual", Type: TriggerManual},
				},
			},
			wantErr: false,
		},
		{
			name: "Invalid model role",
			flow: &Flow{
				Name:   "Bad Model",
				Config: FlowConfig{DefaultModel: &ModelConfig{Role: new("turbo")}},
				Steps:  []StepNode{{ID: "s1", Type: StepTransform}},
			},
			wantErr: true,
		},
		{
			name: "Valid model role and generation config",
			flow: &Flow{
				Name: "Good Model",
				Config: FlowConfig{
					DefaultModel: &ModelConfig{
						Role:       new("reasoning"),
						Generation: &GenerationConfig{Temperature: new(0.3), Thinking: &ThinkingConfig{Enabled: true, Effort: new("medium")}},
					},
				},
				Steps: []StepNode{{ID: "s1", Type: StepTransform}},
			},
			wantErr: false,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			err := tc.flow.ValidateBasic()
			if tc.wantErr && err == nil {
				t.Fatal("expected error, got nil")
			}
			if !tc.wantErr && err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
		})
	}
}

func TestStepNode_EffectiveOnError(t *testing.T) {
	tests := []struct {
		name     string
		onError  string
		expected string
	}{
		{name: "Default empty", onError: "", expected: OnErrorFail},
		{name: "Explicit fail", onError: "fail", expected: OnErrorFail},
		{name: "Continue", onError: "continue", expected: OnErrorContinue},
		{name: "Continue case-insensitive", onError: "CONTINUE", expected: OnErrorContinue},
		{name: "Unknown falls back to fail", onError: "retry", expected: OnErrorFail},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			s := StepNode{OnError: tc.onError}
			if got := s.EffectiveOnError(); got != tc.expected {
				t.Errorf("expected %q, got %q", tc.expected, got)
			}
		})
	}
}
