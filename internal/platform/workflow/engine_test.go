package workflow

import (
	"bytes"
	"context"
	"errors"
	"reflect"
	"sync/atomic"
	"testing"
	"time"

	pdfcpuapi "github.com/pdfcpu/pdfcpu/pkg/api"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/model"
)

const testMinimalPDF = `%PDF-1.4
1 0 obj <</Type /Catalog /Pages 2 0 R>> endobj
2 0 obj <</Type /Pages /Kids [3 0 R] /Count 1>> endobj
3 0 obj <</Type /Page /Parent 2 0 R /MediaBox [0 0 100 100]>> endobj
xref
0 4
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
trailer <</Size 4 /Root 1 0 R>>
startxref
190
%%EOF`

func TestEngine_Execute(t *testing.T) {
	celEval, err := NewCELEvaluator()
	if err != nil {
		t.Fatalf("NewCELEvaluator failed: %v", err)
	}

	space := SpaceContext{
		ID:              "spc_1",
		Name:            "Personal",
		Timezone:        "America/New_York",
		DefaultCurrency: "USD",
	}

	tests := []struct {
		name       string
		setup      func(t *testing.T, reg *Registry) (ExecuteOptions, *int32)
		wantStatus FlowRunStatus
		wantOutput map[string]any
		wantErr    bool
		assertRun  func(t *testing.T, run *FlowRun, calls int32)
	}{
		{
			name: "Filter halts non-matching flow cleanly",
			setup: func(t *testing.T, reg *Registry) (ExecuteOptions, *int32) {
				var afterCalls int32
				reg.RegisterStep(StepDescriptor{Type: "test.record", Owner: "test"}, func(_ context.Context, _ *StepContext[map[string]any]) (map[string]any, error) {
					atomic.AddInt32(&afterCalls, 1)
					return map[string]any{"done": true}, nil
				})
				return ExecuteOptions{
					Flow: &Flow{
						ID:      "flw_1",
						Name:    "Filter Flow",
						Version: 1,
						Steps: []StepNode{
							{ID: "prep", Type: StepTransform, Inputs: map[string]any{"category": "ignore"}},
							{ID: "guard", Type: StepFilter, Inputs: map[string]any{"condition": "steps.prep.category != 'ignore'", "reason": "not financial"}},
							{ID: "after", Type: "test.record"},
						},
					},
					Space: space,
				}, &afterCalls
			},
			wantStatus: RunFiltered,
			assertRun: func(t *testing.T, run *FlowRun, calls int32) {
				if calls != 0 {
					t.Fatalf("expected downstream step not to run when filtered, got %d calls", calls)
				}
				if run.Metadata["filter_reason"] != "not financial" {
					t.Fatalf("expected filter_reason metadata, got %#v", run.Metadata)
				}
			},
		},
		{
			name: "Switch branch rejoins next step via fan-in edge",
			setup: func(t *testing.T, _ *Registry) (ExecuteOptions, *int32) {
				return ExecuteOptions{
					Flow: &Flow{
						ID:      "flw_sw",
						Name:    "Switch Rejoin",
						Version: 1,
						Steps: []StepNode{
							{
								ID:   "sw",
								Type: StepSwitch,
								Cases: []SwitchCase{
									{
										Name:      "high",
										Condition: "input.amount >= 100",
										Steps: []StepNode{
											{ID: "tag_high", Type: StepTransform, Inputs: map[string]any{"tier": "VIP"}},
										},
									},
								},
								Default: []StepNode{
									{ID: "tag_low", Type: StepTransform, Inputs: map[string]any{"tier": "STD"}},
								},
							},
							{
								ID:   "out",
								Type: StepOutput,
								Inputs: map[string]any{
									"value": map[string]any{
										"matched": "{{ steps.sw.matched_case }}",
										"tier":    "{{ coalesce(steps.?tag_high.?tier.orValue(null), steps.?tag_low.?tier.orValue(null)) }}",
									},
								},
							},
						},
					},
					Space: space,
					Input: map[string]any{"amount": int64(250)},
				}, new(int32)
			},
			wantStatus: RunCompleted,
			wantOutput: map[string]any{"matched": "high", "tier": "VIP"},
		},
		{
			name: "Switch branch ending in stop terminates without running rejoin step",
			setup: func(t *testing.T, reg *Registry) (ExecuteOptions, *int32) {
				var afterCalls int32
				reg.RegisterStep(StepDescriptor{Type: "test.after", Owner: "test"}, func(_ context.Context, _ *StepContext[map[string]any]) (map[string]any, error) {
					atomic.AddInt32(&afterCalls, 1)
					return map[string]any{}, nil
				})
				return ExecuteOptions{
					Flow: &Flow{
						ID:      "flw_stop",
						Name:    "Switch Stop",
						Version: 1,
						Steps: []StepNode{
							{
								ID:   "sw",
								Type: StepSwitch,
								Cases: []SwitchCase{
									{
										Name:      "halt",
										Condition: "true",
										Steps:     []StepNode{{ID: "s1", Type: StepStop, Inputs: map[string]any{"reason": "halted"}}},
									},
								},
							},
							{ID: "after", Type: "test.after"},
						},
					},
					Space: space,
				}, &afterCalls
			},
			wantStatus: RunStopped,
			assertRun: func(t *testing.T, run *FlowRun, calls int32) {
				if calls != 0 {
					t.Fatalf("expected rejoin step not to execute after stop, got %d calls", calls)
				}
				if run.Metadata["stop_reason"] != "halted" {
					t.Fatalf("expected stop_reason, got %#v", run.Metadata)
				}
			},
		},
		{
			name: "ForEach executes sequential loop iterations and binds results",
			setup: func(t *testing.T, _ *Registry) (ExecuteOptions, *int32) {
				return ExecuteOptions{
					Flow: &Flow{
						ID:      "flw_each",
						Name:    "ForEach Flow",
						Version: 1,
						Steps: []StepNode{
							{
								ID:   "each_num",
								Type: StepForEach,
								Inputs: map[string]any{
									"items":      "input.nums",
									"item_alias": "n",
								},
								Steps: []StepNode{
									{
										ID:   "double",
										Type: StepTransform,
										Inputs: map[string]any{
											"idx":     "{{ loop.n.index }}",
											"doubled": "{{ loop.n.item * 2 }}",
										},
									},
								},
							},
							{
								ID:   "final",
								Type: StepOutput,
								Inputs: map[string]any{
									"value": map[string]any{
										"count":   "{{ steps.each_num.count }}",
										"results": "{{ steps.each_num.results }}",
									},
								},
							},
						},
					},
					Space: space,
					Input: map[string]any{"nums": []any{int64(3), int64(5)}},
				}, new(int32)
			},
			wantStatus: RunCompleted,
			wantOutput: map[string]any{
				"count": int64(2),
				"results": []any{
					map[string]any{"idx": int64(0), "doubled": int64(6)},
					map[string]any{"idx": int64(1), "doubled": int64(10)},
				},
			},
		},
		{
			name: "on_error continue binds null and continues flow",
			setup: func(t *testing.T, reg *Registry) (ExecuteOptions, *int32) {
				reg.RegisterStep(StepDescriptor{Type: "test.boom", Owner: "test"}, func(_ context.Context, _ *StepContext[map[string]any]) (map[string]any, error) {
					return nil, errors.New("dedup timeout")
				})
				return ExecuteOptions{
					Flow: &Flow{
						ID:      "flw_cont",
						Name:    "Continue Error",
						Version: 1,
						Steps: []StepNode{
							{ID: "dedup", Type: "test.boom", OnError: OnErrorContinue},
							{ID: "out", Type: StepOutput, Inputs: map[string]any{"value": map[string]any{"dup": "{{ coalesce(steps.dedup, 'none') }}"}}},
						},
					},
					Space: space,
				}, new(int32)
			},
			wantStatus: RunCompleted,
			wantOutput: map[string]any{"dup": "none"},
			assertRun: func(t *testing.T, run *FlowRun, _ int32) {
				if len(run.StepRuns) != 2 {
					t.Fatalf("expected 2 step runs, got %d", len(run.StepRuns))
				}
				if run.StepRuns[0].Status != StepFailedContinued || run.StepRuns[0].Error == nil {
					t.Fatalf("expected first step to be failed_continued with error, got %+v", run.StepRuns[0])
				}
			},
		},
		{
			name: "on_error fail marks flow failed and halts execution",
			setup: func(t *testing.T, reg *Registry) (ExecuteOptions, *int32) {
				reg.RegisterStep(StepDescriptor{Type: "test.boom", Owner: "test"}, func(_ context.Context, _ *StepContext[map[string]any]) (map[string]any, error) {
					return nil, errors.New("fatal action failure")
				})
				return ExecuteOptions{
					Flow: &Flow{
						ID:      "flw_fail",
						Name:    "Fail Error",
						Version: 1,
						Steps: []StepNode{
							{ID: "act", Type: "test.boom"},
							{ID: "out", Type: StepOutput, Inputs: map[string]any{"value": map[string]any{"ok": true}}},
						},
					},
					Space: space,
				}, new(int32)
			},
			wantStatus: RunFailed,
			wantErr:    true,
			assertRun: func(t *testing.T, run *FlowRun, _ int32) {
				if run.Error == nil || run.Error.StepID == nil || *run.Error.StepID != "act" {
					t.Fatalf("expected FlowRun.Error referencing step 'act', got %+v", run.Error)
				}
			},
		},
		{
			name: "Action step invalidates matching domain LoaderCache prefix",
			setup: func(t *testing.T, reg *Registry) (ExecuteOptions, *int32) {
				var loadCount int32
				reg.RegisterLoader(LoaderDescriptor{Name: "finance.accounts", Owner: "finance"}, func(_ context.Context, _ string, _ map[string]any) (any, error) {
					n := atomic.AddInt32(&loadCount, 1)
					return []any{map[string]any{"version": int64(n)}}, nil
				})
				reg.RegisterStep(StepDescriptor{Type: "finance.mutate", Owner: "finance", Category: "action"}, func(_ context.Context, _ *StepContext[map[string]any]) (map[string]any, error) {
					return map[string]any{"mutated": true}, nil
				})
				return ExecuteOptions{
					Flow: &Flow{
						ID:      "flw_inv",
						Name:    "Invalidate Cache",
						Version: 1,
						Steps: []StepNode{
							{
								ID:      "read1",
								Type:    StepTransform,
								Sources: map[string]SourceBinding{"acc": {Loader: "finance.accounts"}},
								Inputs:  map[string]any{"v": "{{ sources.acc[0].version }}"},
							},
							{
								ID:   "act",
								Type: "finance.mutate",
							},
							{
								ID:      "read2",
								Type:    StepOutput,
								Sources: map[string]SourceBinding{"acc": {Loader: "finance.accounts"}},
								Inputs:  map[string]any{"value": map[string]any{"v1": "{{ steps.read1.v }}", "v2": "{{ sources.acc[0].version }}"}},
							},
						},
					},
					Space: space,
				}, &loadCount
			},
			wantStatus: RunCompleted,
			wantOutput: map[string]any{"v1": int64(1), "v2": int64(2)},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			reg := NewRegistry()
			opts, counter := tc.setup(t, reg)

			engine, err := NewEngine(Dependencies{Registry: reg, CEL: celEval})
			if err != nil {
				t.Fatalf("NewEngine failed: %v", err)
			}

			run, err := engine.Execute(t.Context(), opts)
			if tc.wantErr {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
			} else if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}

			if run == nil {
				t.Fatal("expected non-nil FlowRun")
			}
			if run.Status != tc.wantStatus {
				t.Fatalf("expected status %q, got %q (err=%+v)", tc.wantStatus, run.Status, run.Error)
			}
			if tc.wantOutput != nil && !reflect.DeepEqual(run.Output, tc.wantOutput) {
				t.Fatalf("expected output %#v, got %#v", tc.wantOutput, run.Output)
			}
			if tc.assertRun != nil {
				tc.assertRun(t, run, atomic.LoadInt32(counter))
			}
		})
	}
}

func TestEngine_LLMGenerateAndDocuments(t *testing.T) {
	celEval, err := NewCELEvaluator()
	if err != nil {
		t.Fatalf("NewCELEvaluator failed: %v", err)
	}

	space := SpaceContext{ID: "spc_1", Timezone: "UTC"}

	t.Run("LLM step resolves model hierarchy, artifacts, and structured JSON", func(t *testing.T) {
		reg := NewRegistry()
		reg.RegisterArtifactReader(&ArtifactReaderMock{
			SchemeFunc: func() string { return "mail" },
			ReadFunc: func(_ context.Context, _ string, ref string) (ResolvedArtifact, error) {
				return ResolvedArtifact{
					Ref:         ref,
					Filename:    "receipt.txt",
					ContentType: "text/plain",
					Data:        []byte("Starbucks $5.50"),
				}, nil
			},
		})

		var captured LLMRequest
		agentMock := &AgentExecutorMock{
			ExecuteFunc: func(_ context.Context, req LLMRequest) (*LLMResponse, error) {
				captured = req
				return &LLMResponse{
					Text:       "```json\n{\"vendor\":\"Starbucks\",\"amount_cents\":550}\n```",
					TokensUsed: 120,
					AIRunID:    "air_1",
					ModelName:  "gemini-2.5-flash",
				}, nil
			},
		}

		engine, err := NewEngine(Dependencies{Registry: reg, CEL: celEval, AgentExecutor: agentMock})
		if err != nil {
			t.Fatalf("NewEngine failed: %v", err)
		}

		flow := &Flow{
			ID:      "flw_llm",
			Name:    "LLM Flow",
			Version: 1,
			Config: FlowConfig{
				DefaultModel: &ModelConfig{Role: new("fast")},
			},
			Steps: []StepNode{
				{
					ID:   "extract",
					Type: StepLLMGenerate,
					Model: &ModelConfig{
						ModelID:    new("mdl_pro"),
						Generation: &GenerationConfig{Temperature: new(0.2)},
					},
					Inputs: map[string]any{
						"system": "Extract receipt",
						"prompt": "Analyze {{ input.text }}",
						"output_schema": map[string]any{
							"type": "object",
						},
						"documents": []any{"mail://msg_1/att_1"},
					},
				},
				{
					ID:     "out",
					Type:   StepOutput,
					Inputs: map[string]any{"value": "{{ steps.extract }}"},
				},
			},
		}

		run, err := engine.Execute(t.Context(), ExecuteOptions{
			Flow:  flow,
			Space: space,
			Input: map[string]any{"text": "coffee"},
		})
		if err != nil {
			t.Fatalf("Execute failed: %v", err)
		}
		if run.Status != RunCompleted {
			t.Fatalf("expected completed, got %s", run.Status)
		}
		if captured.Model == nil || captured.Model.ModelID == nil || *captured.Model.ModelID != "mdl_pro" {
			t.Fatalf("expected step model override mdl_pro, got %+v", captured.Model)
		}
		if len(captured.Documents) != 1 || string(captured.Documents[0].Data) != "Starbucks $5.50" {
			t.Fatalf("expected resolved mail:// document, got %+v", captured.Documents)
		}
		if run.Metadata["tokens_used"] != 120 {
			t.Fatalf("expected 120 tokens_used, got %#v", run.Metadata["tokens_used"])
		}
		if run.StepRuns[0].AIRunID == nil || *run.StepRuns[0].AIRunID != "air_1" {
			t.Fatalf("expected AIRunID air_1, got %v", run.StepRuns[0].AIRunID)
		}
		if run.Output["vendor"] != "Starbucks" {
			t.Fatalf("expected parsed vendor Starbucks, got %#v", run.Output)
		}
	})

	t.Run("ai.agent_run executes agent step with structured output", func(t *testing.T) {
		var captured AgentRunRequest
		agentMock := &AgentExecutorMock{
			ExecuteAgentFunc: func(_ context.Context, req AgentRunRequest) (*LLMResponse, error) {
				captured = req
				return &LLMResponse{
					ParsedJSON: map[string]any{"summary": "All good"},
					TokensUsed: 80,
					AIRunID:    "air_agent_1",
					ModelName:  "gemini-2.5-flash",
				}, nil
			},
		}
		reg := NewRegistry()
		engine, err := NewEngine(Dependencies{Registry: reg, CEL: celEval, AgentExecutor: agentMock})
		if err != nil {
			t.Fatalf("NewEngine failed: %v", err)
		}

		flow := &Flow{
			ID:      "flw_agt",
			Name:    "Agent Flow",
			Version: 1,
			Steps: []StepNode{
				{
					ID:   "run_bot",
					Type: StepAIAgentRun,
					Inputs: map[string]any{
						"agent_id": "system.saturn.assistant",
						"prompt":   "Summarize {{ input.topic }}",
						"output_schema": map[string]any{
							"type": "object",
						},
					},
				},
				{
					ID:     "out",
					Type:   StepOutput,
					Inputs: map[string]any{"value": "{{ steps.run_bot }}"},
				},
			},
		}

		run, err := engine.Execute(t.Context(), ExecuteOptions{
			Flow:  flow,
			Space: space,
			Input: map[string]any{"topic": "budget"},
		})
		if err != nil {
			t.Fatalf("Execute failed: %v", err)
		}
		if captured.AgentID != "system.saturn.assistant" || captured.Prompt != "Summarize budget" {
			t.Fatalf("unexpected AgentRunRequest: %+v", captured)
		}
		if run.StepRuns[0].AIRunID == nil || *run.StepRuns[0].AIRunID != "air_agent_1" {
			t.Fatalf("expected AIRunID air_agent_1, got %v", run.StepRuns[0].AIRunID)
		}
		if run.Output["summary"] != "All good" {
			t.Fatalf("expected structured summary output, got %#v", run.Output)
		}
	})

	t.Run("document.extract_text handles encrypted PDF password prompt and decryption", func(t *testing.T) {
		conf := model.NewAESConfiguration("secret123", "owner123", 256)
		var encBuf bytes.Buffer
		if err := pdfcpuapi.Encrypt(t.Context(), bytes.NewReader([]byte(testMinimalPDF)), &encBuf, conf); err != nil {
			t.Fatalf("Encrypt PDF failed: %v", err)
		}

		reg := NewRegistry()
		engine, err := NewEngine(Dependencies{Registry: reg, CEL: celEval})
		if err != nil {
			t.Fatalf("NewEngine failed: %v", err)
		}

		flow := &Flow{
			ID:      "flw_doc",
			Name:    "Doc Flow",
			Version: 1,
			Steps: []StepNode{
				{
					ID:   "doc",
					Type: StepDocumentExtractText,
					Inputs: map[string]any{
						"artifact_ref": "ephemeral://stmt.pdf",
						"filename":     "stmt.pdf",
						"content_type": "application/pdf",
						"passwords":    []any{"{{ input.password }}"},
					},
				},
				{
					ID:     "out",
					Type:   StepOutput,
					Inputs: map[string]any{"value": "{{ steps.doc }}"},
				},
			},
		}

		ephemeral := map[string]ResolvedArtifact{
			"ephemeral://stmt.pdf": {
				Ref:         "ephemeral://stmt.pdf",
				Filename:    "stmt.pdf",
				ContentType: "application/pdf",
				Data:        encBuf.Bytes(),
			},
		}

		// Without password -> needs_password = true
		runNoPW, err := engine.Execute(t.Context(), ExecuteOptions{
			Flow:               flow,
			Space:              space,
			Input:              map[string]any{"password": ""},
			EphemeralArtifacts: ephemeral,
		})
		if err != nil {
			t.Fatalf("Execute without password failed: %v", err)
		}
		if runNoPW.Output["needs_password"] != true || runNoPW.Output["is_encrypted"] != true {
			t.Fatalf("expected needs_password=true & is_encrypted=true, got %#v", runNoPW.Output)
		}

		// With valid password -> decrypted = true, needs_password = false
		runWithPW, err := engine.Execute(t.Context(), ExecuteOptions{
			Flow:               flow,
			Space:              space,
			Input:              map[string]any{"password": "secret123"},
			EphemeralArtifacts: ephemeral,
		})
		if err != nil {
			t.Fatalf("Execute with password failed: %v", err)
		}
		if runWithPW.Output["decrypted"] != true || runWithPW.Output["needs_password"] != false {
			t.Fatalf("expected decrypted=true & needs_password=false, got %#v", runWithPW.Output)
		}
	})
}

func TestEngine_StepRunCheckpointReplay(t *testing.T) {
	celEval, err := NewCELEvaluator()
	if err != nil {
		t.Fatalf("NewCELEvaluator failed: %v", err)
	}

	var step1Calls atomic.Int32
	var step2Calls atomic.Int32

	reg := NewRegistry()
	reg.RegisterStep(StepDescriptor{Type: "test.step1", Owner: "test"}, func(_ context.Context, _ *StepContext[map[string]any]) (map[string]any, error) {
		step1Calls.Add(1)
		return map[string]any{"val": "fresh"}, nil
	})
	reg.RegisterStep(StepDescriptor{Type: "test.step2", Owner: "test"}, func(_ context.Context, execCtx *StepContext[map[string]any]) (map[string]any, error) {
		step2Calls.Add(1)
		prev, _ := execCtx.State.Steps["s1"].(map[string]any)
		return map[string]any{"from_s1": prev["val"]}, nil
	})

	var updatedRun *FlowRun
	flowRunMock := &FlowRunStoreMock{
		CreateOrResumeFunc: func(_ context.Context, run *FlowRun) (*FlowRun, bool, error) {
			return &FlowRun{
				ID:          "wfr_resumed",
				SpaceID:     run.SpaceID,
				FlowID:      run.FlowID,
				FlowVersion: run.FlowVersion,
				Status:      RunFailed,
				Attempts:    2,
				CreateTime:  time.Now().UTC(),
				UpdateTime:  time.Now().UTC(),
				StepRuns: []StepRun{
					{
						ID:           "wsr_1",
						FlowRunID:    "wfr_resumed",
						SpaceID:      run.SpaceID,
						StepID:       "s1",
						StepType:     "test.step1",
						ExecutionKey: "s1",
						Status:       StepCompleted,
						Output:       map[string]any{"val": "replayed_from_db"},
					},
				},
			}, true, nil
		},
		UpdateFunc: func(_ context.Context, run *FlowRun) error {
			cp := *run
			updatedRun = &cp
			return nil
		},
	}
	stepRunMock := &StepRunStoreMock{
		UpsertFunc: func(_ context.Context, _ *StepRun) error {
			return nil
		},
	}

	engine, err := NewEngine(Dependencies{
		FlowRuns: flowRunMock,
		StepRuns: stepRunMock,
		Registry: reg,
		CEL:      celEval,
	})
	if err != nil {
		t.Fatalf("NewEngine failed: %v", err)
	}

	flow := &Flow{
		ID:      "flw_replay",
		Name:    "Replay Flow",
		Version: 1,
		Steps: []StepNode{
			{ID: "s1", Type: "test.step1"},
			{ID: "s2", Type: "test.step2"},
			{ID: "out", Type: StepOutput, Inputs: map[string]any{"value": "{{ steps.s2 }}"}},
		},
	}

	run, err := engine.Execute(t.Context(), ExecuteOptions{
		Flow:           flow,
		Space:          SpaceContext{ID: "spc_1", Timezone: "UTC"},
		IdempotencyKey: new("evt_123"),
		Persist:        true,
	})
	if err != nil {
		t.Fatalf("Execute failed: %v", err)
	}
	if step1Calls.Load() != 0 {
		t.Fatalf("expected s1 to replay from checkpoint without executing, got %d calls", step1Calls.Load())
	}
	if step2Calls.Load() != 1 {
		t.Fatalf("expected s2 to execute once, got %d calls", step2Calls.Load())
	}
	if run.Output["from_s1"] != "replayed_from_db" {
		t.Fatalf("expected replayed s1 output, got %#v", run.Output)
	}
	if updatedRun == nil || updatedRun.Status != RunCompleted {
		t.Fatalf("expected persisted FlowRun status completed, got %+v", updatedRun)
	}
}

func TestEngine_TriggerFilterAndInputMapping(t *testing.T) {
	celEval, err := NewCELEvaluator()
	if err != nil {
		t.Fatalf("NewCELEvaluator failed: %v", err)
	}
	engine, err := NewEngine(Dependencies{Registry: NewRegistry(), CEL: celEval})
	if err != nil {
		t.Fatalf("NewEngine failed: %v", err)
	}

	space := SpaceContext{ID: "spc_1", Timezone: "UTC"}
	trig := &Trigger{
		ID:   "trg_1",
		Name: "Mail",
		Type: TriggerEvent,
		Config: TriggerConfig{
			Topic:  new("mail.message.received"),
			Filter: new("trigger.data.body_plain != ''"),
			InputMapping: map[string]any{
				"text":    "{{ trigger.data.body_plain }}",
				"subject": "{{ trigger.data.subject }}",
			},
		},
	}

	ok, err := engine.EvaluateTriggerFilter(trig, space, map[string]any{"body_plain": "hello", "subject": "Receipt"})
	if err != nil || !ok {
		t.Fatalf("expected filter pass, got ok=%v err=%v", ok, err)
	}

	ok, err = engine.EvaluateTriggerFilter(trig, space, map[string]any{"body_plain": "", "subject": "Empty"})
	if err != nil || ok {
		t.Fatalf("expected filter reject, got ok=%v err=%v", ok, err)
	}

	if _, err := engine.EvaluateTriggerFilter(nil, space, map[string]any{}); err == nil {
		t.Fatal("expected error for nil trigger, got nil")
	}

	ok, err = engine.EvaluateTriggerFilter(&Trigger{ID: "trg_2", Name: "Webhook", Type: TriggerWebhook}, space, map[string]any{"raw": 42})
	if err != nil || !ok {
		t.Fatalf("expected trigger without filter to pass, got ok=%v err=%v", ok, err)
	}

	mapped, err := engine.MapTriggerInput(trig, space, map[string]any{"body_plain": "hello", "subject": "Receipt"})
	if err != nil {
		t.Fatalf("MapTriggerInput failed: %v", err)
	}
	if mapped["text"] != "hello" || mapped["subject"] != "Receipt" {
		t.Fatalf("unexpected mapped input: %#v", mapped)
	}

	// Zero-boilerplate default when input_mapping is omitted
	passthru, err := engine.MapTriggerInput(&Trigger{ID: "trg_2", Name: "Webhook", Type: TriggerWebhook}, space, map[string]any{"raw": 42})
	if err != nil {
		t.Fatalf("MapTriggerInput passthrough failed: %v", err)
	}
	if passthru["raw"] != 42 {
		t.Fatalf("expected passthrough trigger data, got %#v", passthru)
	}
}
