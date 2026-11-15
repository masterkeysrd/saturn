package workflow

import (
	"context"
	"strings"
	"testing"
)

type testAccountParams struct {
	Currency string `json:"currency,omitempty" jsonschema:"Optional ISO-4217 currency filter"`
	Limit    int    `json:"limit,omitempty" jsonschema:"Maximum number of records"`
}

type testAccountSummary struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	BalanceCents int64  `json:"balance_cents"`
}

type testActionInputs struct {
	AccountID   string  `json:"account_id"`
	AmountCents int64   `json:"amount_cents"`
	Rate        float64 `json:"rate,omitempty"`
}

type testActionOutput struct {
	CreatedID string `json:"created_id"`
	Total     int64  `json:"total"`
}

func TestSchemaFor(t *testing.T) {
	t.Run("StructGeneratesPropertiesAndDescriptions", func(t *testing.T) {
		s := SchemaFor[testAccountParams]()
		if s["type"] != "object" {
			t.Fatalf("expected object schema, got %+v", s)
		}
		props, ok := s["properties"].(map[string]any)
		if !ok || props["currency"] == nil || props["limit"] == nil {
			t.Fatalf("expected currency and limit properties, got %+v", s)
		}
		cur := props["currency"].(map[string]any)
		if cur["type"] != "string" || cur["description"] == "" {
			t.Errorf("unexpected currency schema: %+v", cur)
		}
	})

	t.Run("SliceAndNullablePointer", func(t *testing.T) {
		sliceSchema := SchemaFor[[]testAccountSummary]()
		if primarySchemaType(sliceSchema) != "array" {
			t.Fatalf("expected array schema, got %+v", sliceSchema)
		}
		items := sliceSchema["items"].(map[string]any)
		if items["type"] != "object" {
			t.Fatalf("expected object items, got %+v", items)
		}

		ptrSchema := SchemaFor[*testAccountSummary]()
		props := unwrapObjectSchema(ptrSchema)["properties"].(map[string]any)
		if props["balance_cents"] == nil {
			t.Fatalf("expected balance_cents on pointer schema, got %+v", ptrSchema)
		}
	})

	t.Run("AnyAndUntypedMap", func(t *testing.T) {
		if SchemaFor[any]() != nil {
			t.Fatal("expected nil schema for any")
		}
		m := SchemaFor[map[string]any]()
		if m["type"] != "object" {
			t.Fatalf("expected object schema for map[string]any, got %+v", m)
		}
	})
}

func TestRegistry_TypedLoaderAndStepNormalization(t *testing.T) {
	reg := NewRegistry()

	reg.RegisterLoader(LoaderDescriptor{
		Name:  "test.accounts",
		Owner: "test",
	}, func(_ context.Context, _ string, params testAccountParams) ([]testAccountSummary, error) {
		if params.Currency == "EMPTY" {
			return []testAccountSummary{}, nil
		}
		return []testAccountSummary{
			{ID: "acc_1", Name: "Primary", BalanceCents: 12345},
		}, nil
	})

	reg.RegisterLoader(LoaderDescriptor{
		Name:  "test.account",
		Owner: "test",
	}, func(_ context.Context, _ string, params testAccountParams) (*testAccountSummary, error) {
		if params.Currency == "MISSING" {
			return nil, nil
		}
		return &testAccountSummary{ID: "acc_1", Name: "Primary", BalanceCents: 12345}, nil
	})

	reg.RegisterStep(StepDescriptor{
		Type:     "test.action",
		Owner:    "test",
		Category: "action",
	}, func(_ context.Context, execCtx *StepContext[testActionInputs]) (testActionOutput, error) {
		return testActionOutput{
			CreatedID: execCtx.Inputs.AccountID,
			Total:     execCtx.Inputs.AmountCents + 100,
		}, nil
	})

	desc, loader, ok := reg.GetLoader("test.accounts")
	if !ok || desc.ParamsSchema == nil || desc.OutputSchema == nil {
		t.Fatalf("expected auto-generated loader schemas, got %+v", desc)
	}
	res, err := loader.Load(t.Context(), "spc_1", map[string]any{"currency": "USD", "limit": int64(10)})
	if err != nil {
		t.Fatalf("loader error = %v", err)
	}
	items := res.([]any)
	if items[0].(map[string]any)["balance_cents"] != int64(12345) {
		t.Errorf("expected int64(12345) preserved, got %#v (%T)", items[0], items[0].(map[string]any)["balance_cents"])
	}

	emptyRes, err := loader.Load(t.Context(), "spc_1", map[string]any{"currency": "EMPTY"})
	if err != nil {
		t.Fatalf("empty loader error = %v", err)
	}
	if slice, ok := emptyRes.([]any); !ok || len(slice) != 0 {
		t.Errorf("expected empty []any{}, got %#v", emptyRes)
	}

	_, ptrLoader, _ := reg.GetLoader("test.account")
	nilRes, err := ptrLoader.Load(t.Context(), "spc_1", map[string]any{"currency": "MISSING"})
	if err != nil || nilRes != nil {
		t.Errorf("expected nil for nil pointer loader result, got %#v, err=%v", nilRes, err)
	}

	stepDesc, handler, ok := reg.GetStep("test.action")
	if !ok || stepDesc.InputsSchema == nil || stepDesc.OutputSchema == nil {
		t.Fatalf("expected auto-generated step schemas, got %+v", stepDesc)
	}
	out, err := handler.Execute(t.Context(), &StepExecutionContext{
		Inputs: map[string]any{"account_id": "acc_1", "amount_cents": int64(500), "rate": 1.25},
	})
	if err != nil {
		t.Fatalf("step error = %v", err)
	}
	if out["created_id"] != "acc_1" || out["total"] != int64(600) {
		t.Errorf("unexpected step output: %+v", out)
	}
}

func TestCELEvaluator_SchemaValidation(t *testing.T) {
	eval, err := NewCELEvaluator()
	if err != nil {
		t.Fatalf("NewCELEvaluator error = %v", err)
	}

	reg := NewRegistry()
	reg.RegisterTriggerTopic(TriggerTopicDescriptor{
		Topic:  "mail.message.received",
		Domain: "mail",
		PayloadSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"message": map[string]any{
					"type": "object",
					"properties": map[string]any{
						"id":      map[string]any{"type": "string"},
						"subject": map[string]any{"type": "string"},
						"attachments": map[string]any{
							"type": "array",
							"items": map[string]any{
								"type": "object",
								"properties": map[string]any{
									"id":       map[string]any{"type": "string"},
									"filename": map[string]any{"type": "string"},
								},
							},
						},
					},
				},
			},
		},
	})
	reg.RegisterLoader(LoaderDescriptor{Name: "test.account", Owner: "test"}, func(_ context.Context, _ string, _ testAccountParams) (*testAccountSummary, error) {
		return nil, nil
	})
	reg.RegisterLoader(LoaderDescriptor{Name: "test.accounts", Owner: "test"}, func(_ context.Context, _ string, _ testAccountParams) ([]testAccountSummary, error) {
		return nil, nil
	})
	reg.RegisterStep(StepDescriptor{Type: "test.action", Owner: "test", Category: "action"}, func(_ context.Context, _ *StepContext[testActionInputs]) (testActionOutput, error) {
		return testActionOutput{}, nil
	})

	tests := []struct {
		name        string
		flow        *Flow
		wantErrText string
	}{
		{
			name: "ValidTypedFlowWithTriggerSourcesTransformAndForEach",
			flow: &Flow{
				ID:      "flw_ok",
				Name:    "Valid Typed Flow",
				Version: 1,
				InputSchema: map[string]any{
					"type": "object",
					"properties": map[string]any{
						"text": map[string]any{"type": "string"},
					},
				},
				Triggers: []Trigger{
					{
						Name:      "Mail",
						Type:      TriggerEvent,
						IsEnabled: true,
						Config: TriggerConfig{
							Topic:  new("mail.message.received"),
							Filter: new("trigger.data.message.subject != ''"),
							InputMapping: map[string]any{
								"text": "{{ trigger.data.message.attachments.map(a, a.filename)[0] }}",
							},
						},
					},
				},
				Steps: []StepNode{
					{
						ID:   "extract",
						Type: StepLLMGenerate,
						Sources: map[string]SourceBinding{
							"acc":      {Loader: "test.account", Params: map[string]any{"currency": "USD"}},
							"accounts": {Loader: "test.accounts"},
						},
						Inputs: map[string]any{
							"prompt": "{{ space.timezone + ' ' + string(run.now) + ' ' + input.text + ' ' + sources.acc.name }}",
							"output_schema": map[string]any{
								"type": "object",
								"properties": map[string]any{
									"vendor": map[string]any{"type": "string"},
									"amount": map[string]any{"type": "number"},
								},
							},
						},
					},
					{
						ID:   "prep",
						Type: StepTransform,
						Sources: map[string]SourceBinding{
							"acc": {Loader: "test.account"},
						},
						Inputs: map[string]any{
							"account_id":   "{{ sources.acc != null ? sources.acc.id : '' }}",
							"amount_cents": "{{ toCents(steps.extract.amount) }}",
						},
					},
					{
						ID:   "act",
						Type: "test.action",
						Inputs: map[string]any{
							"account_id":   "{{ steps.prep.account_id }}",
							"amount_cents": "{{ steps.prep.amount_cents }}",
						},
					},
					{
						ID:   "loop_accounts",
						Type: StepForEach,
						Sources: map[string]SourceBinding{
							"accounts": {Loader: "test.accounts"},
						},
						Inputs: map[string]any{
							"items":      "{{ sources.accounts }}",
							"item_alias": "acc",
						},
						Steps: []StepNode{
							{
								ID:   "fmt",
								Type: StepTransform,
								Inputs: map[string]any{
									"label": "{{ formatMoney(loop.acc.item.balance_cents, 'USD') }}",
								},
							},
						},
					},
				},
			},
		},
		{
			name: "RejectsUnknownFieldOnTriggerData",
			flow: &Flow{
				ID:      "flw_bad_trig",
				Name:    "Bad Trigger Field",
				Version: 1,
				Triggers: []Trigger{
					{
						Name:      "Mail",
						Type:      TriggerEvent,
						IsEnabled: true,
						Config: TriggerConfig{
							Topic:  new("mail.message.received"),
							Filter: new("trigger.data.message.nonexistent != ''"),
						},
					},
				},
				Steps: []StepNode{{ID: "s1", Type: StepTransform}},
			},
			wantErrText: `unknown field "nonexistent"`,
		},
		{
			name: "RejectsUnknownComprehensionItemField",
			flow: &Flow{
				ID:      "flw_bad_comp",
				Name:    "Bad Comprehension Field",
				Version: 1,
				Triggers: []Trigger{
					{
						Name:      "Mail",
						Type:      TriggerEvent,
						IsEnabled: true,
						Config: TriggerConfig{
							Topic: new("mail.message.received"),
							InputMapping: map[string]any{
								"names": "{{ trigger.data.message.attachments.map(a, a.bad_prop) }}",
							},
						},
					},
				},
				Steps: []StepNode{{ID: "s1", Type: StepTransform}},
			},
			wantErrText: `unknown field "bad_prop"`,
		},
		{
			name: "RejectsUndeclaredSourceAlias",
			flow: &Flow{
				ID:      "flw_bad_src",
				Name:    "Bad Source Alias",
				Version: 1,
				Steps: []StepNode{
					{
						ID:     "s1",
						Type:   StepTransform,
						Inputs: map[string]any{"x": "{{ sources.missing_src.id }}"},
					},
				},
			},
			wantErrText: `references source "missing_src" which is not declared in step.sources`,
		},
		{
			name: "RejectsUnknownLoaderOutputField",
			flow: &Flow{
				ID:      "flw_bad_src_field",
				Name:    "Bad Source Field",
				Version: 1,
				Steps: []StepNode{
					{
						ID:      "s1",
						Type:    StepTransform,
						Sources: map[string]SourceBinding{"acc": {Loader: "test.account"}},
						Inputs:  map[string]any{"x": "{{ sources.acc.typo }}"},
					},
				},
			},
			wantErrText: `unknown field "typo"`,
		},
		{
			name: "RejectsUnknownLoaderParamKey",
			flow: &Flow{
				ID:      "flw_bad_param",
				Name:    "Bad Param Key",
				Version: 1,
				Steps: []StepNode{
					{
						ID:   "s1",
						Type: StepTransform,
						Sources: map[string]SourceBinding{
							"acc": {Loader: "test.account", Params: map[string]any{"curr": "USD"}},
						},
					},
				},
			},
			wantErrText: `unknown parameter "curr"`,
		},
		{
			name: "RejectsUnknownStepInputKey",
			flow: &Flow{
				ID:      "flw_bad_step_input",
				Name:    "Bad Step Input",
				Version: 1,
				Steps: []StepNode{
					{
						ID:     "s1",
						Type:   "test.action",
						Inputs: map[string]any{"acc_id": "1"},
					},
				},
			},
			wantErrText: `unknown parameter "acc_id"`,
		},
		{
			name: "RejectsTypeMismatchOnToCents",
			flow: &Flow{
				ID:      "flw_bad_tocents",
				Name:    "Bad toCents arg",
				Version: 1,
				InputSchema: map[string]any{
					"type": "object",
					"properties": map[string]any{
						"vendor": map[string]any{"type": "string"},
					},
				},
				Steps: []StepNode{
					{
						ID:     "s1",
						Type:   StepTransform,
						Inputs: map[string]any{"cents": "{{ toCents(input.vendor) }}"},
					},
				},
			},
			wantErrText: `toCents expects numeric argument`,
		},
		{
			name: "RejectsUnknownForEachItemField",
			flow: &Flow{
				ID:      "flw_bad_loop_item",
				Name:    "Bad Loop Item Field",
				Version: 1,
				Steps: []StepNode{
					{
						ID:   "loop_accounts",
						Type: StepForEach,
						Sources: map[string]SourceBinding{
							"accounts": {Loader: "test.accounts"},
						},
						Inputs: map[string]any{
							"items":      "{{ sources.accounts }}",
							"item_alias": "acc",
						},
						Steps: []StepNode{
							{
								ID:     "inner",
								Type:   StepTransform,
								Inputs: map[string]any{"bad": "{{ loop.acc.item.unknown_col }}"},
							},
						},
					},
				},
			},
			wantErrText: `unknown field "unknown_col"`,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			err := eval.ValidateFlow(tc.flow, reg)
			if tc.wantErrText == "" {
				if err != nil {
					t.Fatalf("unexpected ValidateFlow error: %v", err)
				}
				return
			}
			if err == nil {
				t.Fatalf("expected error containing %q, got nil", tc.wantErrText)
			}
			if !strings.Contains(err.Error(), tc.wantErrText) {
				t.Fatalf("expected error containing %q, got %v", tc.wantErrText, err)
			}
		})
	}
}

func TestStepBuilders(t *testing.T) {
	src := Source(SourceConfig[testAccountParams]{
		Loader:   "test.accounts",
		Params:   testAccountParams{Currency: "USD"},
		Required: true,
	})
	if src.Loader != "test.accounts" || !src.Required || src.Params["currency"] != "USD" {
		t.Fatalf("unexpected SourceBinding: %+v", src)
	}

	loopStep := ForEachStep(ForEachStepConfig{
		ID:        "each",
		Name:      "Loop Accounts",
		Items:     "{{ sources.accounts }}",
		ItemAlias: "acc",
		Sources:   map[string]SourceBinding{"accounts": src},
		Steps: []StepNode{
			StopStep(StopStepConfig{
				ID:     "halt",
				Name:   "Stop Early",
				Reason: "done",
			}),
		},
	})
	if loopStep.Type != StepForEach || loopStep.Inputs["item_alias"] != "acc" || len(loopStep.Steps) != 1 || loopStep.Steps[0].Type != StepStop {
		t.Fatalf("unexpected ForEachStep/StopStep: %+v", loopStep)
	}
}
