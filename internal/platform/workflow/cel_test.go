package workflow

import (
	"context"
	"reflect"
	"testing"
	"time"
)

func TestCELEvaluator_ResolveValueAndHelpers(t *testing.T) {
	eval, err := NewCELEvaluator()
	if err != nil {
		t.Fatalf("NewCELEvaluator failed: %v", err)
	}

	state := &FlowState{
		Space: SpaceContext{
			ID:              "spc_1",
			Name:            "Personal",
			Timezone:        "America/New_York",
			DefaultCurrency: "USD",
		},
		Run: RunContext{
			ID:     "wfr_1",
			FlowID: "flw_1",
			Mode:   "live",
			Now:    time.Date(2026, 5, 1, 12, 0, 0, 0, time.UTC),
		},
		Input: map[string]any{
			"vendor":   "Acme Coffee",
			"amount":   12.34,
			"cents":    int64(4550),
			"currency": "usd",
			"date":     "2026-01-15",
			"items":    []any{"a", "b"},
			"nullable": nil,
		},
		Steps: map[string]any{
			"classify": map[string]any{
				"category": "receipt",
				"score":    0.95,
			},
		},
	}

	tests := []struct {
		name    string
		input   any
		want    any
		wantErr bool
	}{
		{
			name:  "Literal string unchanged",
			input: "plain text",
			want:  "plain text",
		},
		{
			name:  "Single block preserves int64 via toCents",
			input: "{{ toCents(input.amount) }}",
			want:  int64(1234),
		},
		{
			name:  "Single block preserves float64 via fromCents",
			input: "{{ fromCents(input.cents) }}",
			want:  45.5,
		},
		{
			name:  "Single block preserves bool",
			input: "{{ steps.classify.category == 'receipt' && steps.classify.score >= 0.9 }}",
			want:  true,
		},
		{
			name:  "Single block preserves slice",
			input: "{{ input.items }}",
			want:  []any{"a", "b"},
		},
		{
			name:  "Single block preserves null",
			input: "{{ input.nullable }}",
			want:  nil,
		},
		{
			name:  "Mixed string interpolation",
			input: "Paid {{ input.vendor }}: {{ formatMoney(input.cents, input.currency) }}",
			want:  "Paid Acme Coffee: 45.50 USD",
		},
		{
			name:  "localTime converts date in America/New_York (EST -05:00 in Jan)",
			input: `{{ localTime(input.date, "09:30") }}`,
			want:  "2026-01-15T09:30:00-05:00",
		},
		{
			name:  "addDays on YYYY-MM-DD",
			input: "{{ addDays(input.date, 20) }}",
			want:  "2026-02-04",
		},
		{
			name:  "inSpaceTz produces RFC3339 timestamp string in space timezone",
			input: `{{ string(inSpaceTz("2026-01-15")) }}`,
			want:  "2026-01-15T00:00:00-05:00",
		},
		{
			name:  "toJSON deterministic ordering",
			input: `{{ toJSON({"b": 2, "a": 1}) }}`,
			want:  `{"a":1,"b":2}`,
		},
		{
			name:  "coalesce falls back when null",
			input: `{{ coalesce(input.nullable, "fallback") }}`,
			want:  "fallback",
		},
		{
			name:  "optional chaining on missing map key",
			input: `{{ input.?missing_key.orValue("default_val") }}`,
			want:  "default_val",
		},
		{
			name:    "Unclosed template returns error",
			input:   "hello {{ input.vendor",
			wantErr: true,
		},
		{
			name:    "Empty template returns error",
			input:   "{{   }}",
			wantErr: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, err := eval.ResolveValue(tc.input, state, nil)
			if tc.wantErr {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if !reflect.DeepEqual(got, tc.want) {
				t.Fatalf("expected %#v (%T), got %#v (%T)", tc.want, tc.want, got, got)
			}
		})
	}
}

func TestCELEvaluator_ValidateFlow(t *testing.T) {
	eval, err := NewCELEvaluator()
	if err != nil {
		t.Fatalf("NewCELEvaluator failed: %v", err)
	}

	reg := NewRegistry()
	reg.RegisterLoader(LoaderDescriptor{Name: "finance.accounts", Owner: "finance"}, func(_ context.Context, _ string, _ map[string]any) (any, error) {
		return nil, nil
	})

	tests := []struct {
		name    string
		flow    *Flow
		wantErr bool
	}{
		{
			name: "Valid flat + switch + for_each flow",
			flow: &Flow{
				Name: "Receipt Flow",
				Triggers: []Trigger{
					{
						Name: "Mail",
						Type: TriggerEvent,
						Config: TriggerConfig{
							Topic:  new("mail.message.received"),
							Filter: new("trigger.data.subject != ''"),
							InputMapping: map[string]any{
								"text": "{{ trigger.data.body_plain }}",
							},
						},
					},
				},
				Steps: []StepNode{
					{
						ID:   "classify",
						Type: StepTransform,
						Sources: map[string]SourceBinding{
							"accounts": {Loader: "finance.accounts"},
						},
						Inputs: map[string]any{
							"category": "receipt",
							"items":    []any{"x", "y"},
						},
					},
					{
						ID:   "only_receipt",
						Type: StepFilter,
						Inputs: map[string]any{
							"condition": "steps.classify.category != 'ignore'",
						},
					},
					{
						ID:   "route",
						Type: StepSwitch,
						Cases: []SwitchCase{
							{
								Name:      "is_receipt",
								Condition: "steps.classify.category == 'receipt'",
								Steps: []StepNode{
									{
										ID:   "branch_tx",
										Type: StepTransform,
										Inputs: map[string]any{
											"ok": true,
										},
									},
								},
							},
						},
					},
					{
						ID:   "each_item",
						Type: StepForEach,
						Inputs: map[string]any{
							"items":      "steps.classify.items",
							"item_alias": "cur",
						},
						Steps: []StepNode{
							{
								ID:   "fmt_item",
								Type: StepTransform,
								Inputs: map[string]any{
									"val": "{{ loop.cur.item }}",
								},
							},
						},
					},
				},
			},
			wantErr: false,
		},
		{
			name: "Rejects forward reference to later step",
			flow: &Flow{
				Name: "Bad Order",
				Steps: []StepNode{
					{
						ID:     "first",
						Type:   StepTransform,
						Inputs: map[string]any{"x": "{{ steps.second.val }}"},
					},
					{
						ID:     "second",
						Type:   StepTransform,
						Inputs: map[string]any{"val": 1},
					},
				},
			},
			wantErr: true,
		},
		{
			name: "Rejects cross-branch reference between switch cases",
			flow: &Flow{
				Name: "Cross Branch",
				Steps: []StepNode{
					{
						ID:   "sw",
						Type: StepSwitch,
						Cases: []SwitchCase{
							{
								Name:      "c1",
								Condition: "true",
								Steps:     []StepNode{{ID: "b1", Type: StepTransform, Inputs: map[string]any{"v": 1}}},
							},
							{
								Name:      "c2",
								Condition: "false",
								Steps:     []StepNode{{ID: "b2", Type: StepTransform, Inputs: map[string]any{"v": "{{ steps.b1.v }}"}}},
							},
						},
					},
				},
			},
			wantErr: true,
		},
		{
			name: "Rejects unknown step type",
			flow: &Flow{
				Name:  "Unknown Step",
				Steps: []StepNode{{ID: "s1", Type: "unknown.step"}},
			},
			wantErr: true,
		},
		{
			name: "Rejects unknown loader",
			flow: &Flow{
				Name: "Unknown Loader",
				Steps: []StepNode{
					{
						ID:      "s1",
						Type:    StepTransform,
						Sources: map[string]SourceBinding{"bad": {Loader: "finance.nonexistent"}},
					},
				},
			},
			wantErr: true,
		},
		{
			name: "Rejects non-boolean filter condition",
			flow: &Flow{
				Name: "Non Bool Filter",
				Steps: []StepNode{
					{
						ID:     "f1",
						Type:   StepFilter,
						Inputs: map[string]any{"condition": "'not a bool'"},
					},
				},
			},
			wantErr: true,
		},
		{
			name: "Rejects duplicate step IDs",
			flow: &Flow{
				Name: "Dup IDs",
				Steps: []StepNode{
					{ID: "dup", Type: StepTransform},
					{ID: "dup", Type: StepTransform},
				},
			},
			wantErr: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			err := eval.ValidateFlow(tc.flow, reg)
			if tc.wantErr && err == nil {
				t.Fatal("expected validation error, got nil")
			}
			if !tc.wantErr && err != nil {
				t.Fatalf("unexpected validation error: %v", err)
			}
		})
	}
}
