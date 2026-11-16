package workflow

import (
	"encoding/json/v2"
	"fmt"
	"maps"
	"math"
	"reflect"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"cel.dev/cel-go/cel"
	"cel.dev/cel-go/common/ast"
	"cel.dev/cel-go/common/types"
	"cel.dev/cel-go/common/types/ref"
	"cel.dev/cel-go/ext"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

var validStepIDRegex = regexp.MustCompile(`^[a-zA-Z_][a-zA-Z0-9_]*$`)

// CELEvaluator compiles, validates, and evaluates Saturn CEL expressions and `{{ ... }}` templates.
type CELEvaluator struct {
	env      *cel.Env
	mu       sync.RWMutex
	asts     map[string]*cel.Ast
	programs map[string]cel.Program
}

// NewCELEvaluator initializes the Saturn CEL environment with all namespaces and helper functions.
func NewCELEvaluator() (*CELEvaluator, error) {
	dynMap := cel.MapType(cel.StringType, cel.DynType)

	env, err := cel.NewEnv(
		cel.OptionalTypes(),
		ext.Strings(),
		ext.Math(),
		ext.Lists(),
		ext.Encoders(),
		cel.Variable("space", dynMap),
		cel.Variable("run", dynMap),
		cel.Variable("input", cel.DynType),
		cel.Variable("trigger", dynMap),
		cel.Variable("steps", dynMap),
		cel.Variable(loopInternalVar, dynMap),
		cel.Variable("sources", dynMap),

		cel.Function("toCents",
			cel.Overload("toCents_double", []*cel.Type{cel.DoubleType}, cel.IntType,
				cel.UnaryBinding(func(v ref.Val) ref.Val {
					return types.Int(math.Round(float64(v.(types.Double)) * 100))
				}),
			),
			cel.Overload("toCents_int", []*cel.Type{cel.IntType}, cel.IntType,
				cel.UnaryBinding(func(v ref.Val) ref.Val {
					return types.Int(int64(v.(types.Int)) * 100)
				}),
			),
		),

		cel.Function("fromCents",
			cel.Overload("fromCents_int", []*cel.Type{cel.IntType}, cel.DoubleType,
				cel.UnaryBinding(func(v ref.Val) ref.Val {
					return types.Double(float64(int64(v.(types.Int))) / 100.0)
				}),
			),
			cel.Overload("fromCents_double", []*cel.Type{cel.DoubleType}, cel.DoubleType,
				cel.UnaryBinding(func(v ref.Val) ref.Val {
					return types.Double(float64(v.(types.Double)) / 100.0)
				}),
			),
		),

		cel.Function("formatMoney",
			cel.Overload("formatMoney_int_string", []*cel.Type{cel.IntType, cel.StringType}, cel.StringType,
				cel.BinaryBinding(func(centsVal, curVal ref.Val) ref.Val {
					cents := int64(centsVal.(types.Int))
					cur := strings.ToUpper(strings.TrimSpace(string(curVal.(types.String))))
					if cur == "" {
						return types.String(fmt.Sprintf("%.2f", float64(cents)/100.0))
					}
					return types.String(fmt.Sprintf("%.2f %s", float64(cents)/100.0, cur))
				}),
			),
		),

		cel.Function("inSpaceTz",
			cel.Overload("inSpaceTz_dyn", []*cel.Type{cel.DynType}, cel.TimestampType,
				cel.LateFunctionBinding(),
			),
		),

		cel.Function("localTime",
			cel.Overload("localTime_dyn_string", []*cel.Type{cel.DynType, cel.StringType}, cel.StringType,
				cel.LateFunctionBinding(),
			),
		),

		cel.Function("addDays",
			cel.Overload("addDays_string_int", []*cel.Type{cel.StringType, cel.IntType}, cel.StringType,
				cel.BinaryBinding(func(dateVal, daysVal ref.Val) ref.Val {
					raw := string(dateVal.(types.String))
					days := int(int64(daysVal.(types.Int)))
					res, err := addDaysToString(raw, days)
					if err != nil {
						return types.NewErr("%v", err)
					}
					return types.String(res)
				}),
			),
			cel.Overload("addDays_timestamp_int", []*cel.Type{cel.TimestampType, cel.IntType}, cel.StringType,
				cel.BinaryBinding(func(tsVal, daysVal ref.Val) ref.Val {
					ts := tsVal.(types.Timestamp).Time
					days := int(int64(daysVal.(types.Int)))
					return types.String(ts.AddDate(0, 0, days).Format(time.RFC3339))
				}),
			),
		),

		cel.Function("toJSON",
			cel.Overload("toJSON_any", []*cel.Type{cel.DynType}, cel.StringType,
				cel.UnaryBinding(func(v ref.Val) ref.Val {
					native := refValToGo(v)
					b, err := json.Marshal(native, json.Deterministic(true))
					if err != nil {
						return types.NewErr("toJSON: %v", err)
					}
					return types.String(string(b))
				}),
			),
		),

		cel.Function("coalesce",
			cel.Overload("coalesce_2", []*cel.Type{cel.DynType, cel.DynType}, cel.DynType,
				cel.BinaryBinding(func(a, b ref.Val) ref.Val {
					if !isNullOrEmpty(a) {
						return a
					}
					return b
				}),
			),
			cel.Overload("coalesce_3", []*cel.Type{cel.DynType, cel.DynType, cel.DynType}, cel.DynType,
				cel.FunctionBinding(func(args ...ref.Val) ref.Val {
					for _, arg := range args {
						if !isNullOrEmpty(arg) {
							return arg
						}
					}
					return types.NullValue
				}),
			),
		),
	)
	if err != nil {
		return nil, fmt.Errorf("create CEL environment: %w", err)
	}

	return &CELEvaluator{
		env:      env,
		asts:     make(map[string]*cel.Ast),
		programs: make(map[string]cel.Program),
	}, nil
}

// Compile compiles and type-checks a CEL expression, caching the checked AST and Program.
func (c *CELEvaluator) Compile(expr string) (*cel.Ast, error) {
	c.mu.RLock()
	checked, ok := c.asts[expr]
	c.mu.RUnlock()
	if ok {
		return checked, nil
	}

	normalized := rewriteLoopIdentifier(expr)
	parsed, issues := c.env.Parse(normalized)
	if issues != nil && issues.Err() != nil {
		return nil, fmt.Errorf("parse CEL %q: %w", expr, issues.Err())
	}
	checked, issues = c.env.Check(parsed)
	if issues != nil && issues.Err() != nil {
		return nil, fmt.Errorf("check CEL %q: %w", expr, issues.Err())
	}
	prog, err := c.env.Program(checked)
	if err != nil {
		return nil, fmt.Errorf("program CEL %q: %w", expr, err)
	}

	c.mu.Lock()
	c.asts[expr] = checked
	c.programs[expr] = prog
	c.mu.Unlock()
	return checked, nil
}

// Eval evaluates a raw CEL expression against FlowState and optional step-local sources.
func (c *CELEvaluator) Eval(expr string, state *FlowState, sources map[string]any) (any, error) {
	if _, err := c.Compile(expr); err != nil {
		return nil, err
	}

	c.mu.RLock()
	prog := c.programs[expr]
	c.mu.RUnlock()

	loc := resolveLocation(state)
	act, err := cel.FunctionVars(state.ToActivation(sources), tzLateBoundFunctions(loc))
	if err != nil {
		return nil, fmt.Errorf("bind CEL %q: %w", expr, err)
	}

	out, _, err := prog.Eval(act)
	if err != nil {
		return nil, fmt.Errorf("eval CEL %q: %w", expr, err)
	}
	return refValToGo(out), nil
}

// EvalCondition evaluates a boolean CEL condition (stripping optional single-block `{{ ... }}`).
func (c *CELEvaluator) EvalCondition(expr string, state *FlowState, sources map[string]any) (bool, error) {
	clean := unwrapSingleBlock(expr)
	val, err := c.Eval(clean, state, sources)
	if err != nil {
		return false, err
	}
	b, ok := val.(bool)
	if !ok {
		return false, fmt.Errorf("condition %q returned %T, expected bool", expr, val)
	}
	return b, nil
}

// EvalList evaluates a CEL list expression or literal slice into []any.
func (c *CELEvaluator) EvalList(raw any, state *FlowState, sources map[string]any) ([]any, error) {
	switch v := raw.(type) {
	case string:
		clean := unwrapSingleBlock(v)
		res, err := c.Eval(clean, state, sources)
		if err != nil {
			return nil, err
		}
		return toAnySlice(res)
	case []any:
		resolved, err := c.ResolveValue(v, state, sources)
		if err != nil {
			return nil, err
		}
		return toAnySlice(resolved)
	default:
		return toAnySlice(v)
	}
}

// ResolveValue recursively resolves literal values, single-block `{{ expr }}` native values, and interpolated strings.
func (c *CELEvaluator) ResolveValue(val any, state *FlowState, sources map[string]any) (any, error) {
	switch v := val.(type) {
	case string:
		tokens, err := parseTemplateTokens(v)
		if err != nil {
			return nil, err
		}
		if len(tokens) == 0 {
			return v, nil
		}
		if len(tokens) == 1 && tokens[0].isExpr && strings.TrimSpace(v) == tokens[0].raw {
			return c.Eval(tokens[0].expr, state, sources)
		}
		var sb strings.Builder
		for _, tok := range tokens {
			if !tok.isExpr {
				sb.WriteString(tok.raw)
				continue
			}
			res, err := c.Eval(tok.expr, state, sources)
			if err != nil {
				return nil, err
			}
			sb.WriteString(stringifyValue(res))
		}
		return sb.String(), nil

	case map[string]any:
		out := make(map[string]any, len(v))
		for k, item := range v {
			resolved, err := c.ResolveValue(item, state, sources)
			if err != nil {
				return nil, fmt.Errorf("field %q: %w", k, err)
			}
			out[k] = resolved
		}
		return out, nil

	case []any:
		out := make([]any, len(v))
		for i, item := range v {
			resolved, err := c.ResolveValue(item, state, sources)
			if err != nil {
				return nil, fmt.Errorf("index %d: %w", i, err)
			}
			out[i] = resolved
		}
		return out, nil

	default:
		return val, nil
	}
}

// ResolveMap resolves all values inside a map[string]any.
func (c *CELEvaluator) ResolveMap(m map[string]any, state *FlowState, sources map[string]any) (map[string]any, error) {
	if len(m) == 0 {
		return map[string]any{}, nil
	}
	res, err := c.ResolveValue(m, state, sources)
	if err != nil {
		return nil, err
	}
	out, ok := res.(map[string]any)
	if !ok {
		return map[string]any{}, nil
	}
	return out, nil
}

// ValidateFlow validates flow invariants, registered steps/loaders, CEL compilation, lexical scope, and schema compatibility.
func (c *CELEvaluator) ValidateFlow(flow *Flow, reg *Registry) error {
	const op errors.Op = "platform/workflow.ValidateFlow"

	if err := flow.ValidateBasic(); err != nil {
		return errors.E(op, err)
	}

	for i := range flow.Triggers {
		trig := flow.Triggers[i]
		trigScope := validationScope{
			inputSchema:   flow.InputSchema,
			triggerSchema: triggerSchemaFor(&trig, reg),
		}
		if trig.Config.Filter != nil && strings.TrimSpace(*trig.Config.Filter) != "" {
			if err := c.validateConditionWithScope(*trig.Config.Filter, trigScope); err != nil {
				return errors.E(op, errors.Invalid, fmt.Errorf("trigger %q filter: %w", trig.Name, err))
			}
		}
		if trig.Config.InputMapping != nil {
			if err := c.validateAnyTemplatesWithScope(trig.Config.InputMapping, trigScope); err != nil {
				return errors.E(op, errors.Invalid, fmt.Errorf("trigger %q input_mapping: %w", trig.Name, err))
			}
		}
	}

	seenIDs := make(map[string]struct{})
	scope := validationScope{
		inputSchema:   flow.InputSchema,
		triggerSchema: flowTriggerSchema(flow, reg),
		visibleSteps:  make(map[string]struct{}),
		stepSchemas:   make(map[string]map[string]any),
		loopAliases:   make(map[string]struct{}),
		loopSchemas:   make(map[string]map[string]any),
	}

	if err := c.validateStepSequence(flow.Steps, reg, seenIDs, scope); err != nil {
		return errors.E(op, errors.Invalid, err)
	}
	return nil
}

func (c *CELEvaluator) validateStepSequence(
	steps []StepNode,
	reg *Registry,
	seenIDs map[string]struct{},
	scope validationScope,
) error {
	for i := range steps {
		step := steps[i]
		if !validStepIDRegex.MatchString(step.ID) {
			return fmt.Errorf("invalid step id %q: must match [a-zA-Z_][a-zA-Z0-9_]*", step.ID)
		}
		if _, dup := seenIDs[step.ID]; dup {
			return fmt.Errorf("duplicate step id %q", step.ID)
		}
		seenIDs[step.ID] = struct{}{}

		if step.Model != nil {
			if err := step.Model.Validate(); err != nil {
				return fmt.Errorf("step %q model: %w", step.ID, err)
			}
		}

		stepDesc, _, ok := reg.GetStep(step.Type)
		if !ok {
			return fmt.Errorf("step %q references unknown step type %q", step.ID, step.Type)
		}

		if pol := strings.TrimSpace(step.OnError); pol != "" && pol != OnErrorFail && pol != OnErrorContinue {
			return fmt.Errorf("step %q has invalid on_error policy %q", step.ID, pol)
		}

		sourceSchemas := make(map[string]map[string]any, len(step.Sources))
		paramScope := scope
		paramScope.allowSources = false
		paramScope.sourceSchemas = nil

		for alias, binding := range step.Sources {
			if strings.TrimSpace(binding.Loader) == "" {
				return fmt.Errorf("step %q source %q missing loader name", step.ID, alias)
			}
			loaderDesc, _, ok := reg.GetLoader(binding.Loader)
			if !ok {
				return fmt.Errorf("step %q source %q references unknown loader %q", step.ID, alias, binding.Loader)
			}
			if err := validateMapKeysAgainstSchema(binding.Params, loaderDesc.ParamsSchema); err != nil {
				return fmt.Errorf("step %q source %q params: %w", step.ID, alias, err)
			}
			sourceSchemas[alias] = loaderDesc.OutputSchema
			if binding.Params != nil {
				if err := c.validateAnyTemplatesWithScope(binding.Params, paramScope); err != nil {
					return fmt.Errorf("step %q source %q params: %w", step.ID, alias, err)
				}
			}
		}

		stepScope := scope
		stepScope.allowSources = true
		stepScope.sourceSchemas = sourceSchemas

		if step.Type != StepTransform && step.Type != StepOutput && step.Type != StepStop {
			if err := validateMapKeysAgainstSchema(step.Inputs, stepDesc.InputsSchema); err != nil {
				return fmt.Errorf("step %q inputs: %w", step.ID, err)
			}
		}

		if step.Inputs != nil {
			if err := c.validateAnyTemplatesWithScope(step.Inputs, stepScope); err != nil {
				return fmt.Errorf("step %q inputs: %w", step.ID, err)
			}
		}

		switch step.Type {
		case StepFilter:
			cond, _ := step.Inputs["condition"].(string)
			if strings.TrimSpace(cond) == "" {
				return fmt.Errorf("filter step %q requires inputs.condition", step.ID)
			}
			if err := c.validateConditionWithScope(cond, stepScope); err != nil {
				return fmt.Errorf("filter step %q condition: %w", step.ID, err)
			}

		case StepSwitch:
			if len(step.Cases) == 0 {
				return fmt.Errorf("switch step %q requires at least one case", step.ID)
			}
			caseNames := make(map[string]struct{}, len(step.Cases))
			for ci := range step.Cases {
				sc := step.Cases[ci]
				if strings.TrimSpace(sc.Name) == "" {
					return fmt.Errorf("switch step %q case %d requires name", step.ID, ci)
				}
				if _, dup := caseNames[sc.Name]; dup {
					return fmt.Errorf("switch step %q duplicate case name %q", step.ID, sc.Name)
				}
				caseNames[sc.Name] = struct{}{}
				if strings.TrimSpace(sc.Condition) == "" {
					return fmt.Errorf("switch step %q case %q requires condition", step.ID, sc.Name)
				}
				if err := c.validateConditionWithScope(sc.Condition, stepScope); err != nil {
					return fmt.Errorf("switch step %q case %q: %w", step.ID, sc.Name, err)
				}
				branchScope := scope.clone()
				branchScope.visibleSteps[step.ID] = struct{}{}
				if stepDesc.OutputSchema != nil {
					branchScope.stepSchemas[step.ID] = stepDesc.OutputSchema
				}
				if err := c.validateStepSequence(sc.Steps, reg, seenIDs, branchScope); err != nil {
					return err
				}
			}
			if len(step.Default) > 0 {
				defaultScope := scope.clone()
				defaultScope.visibleSteps[step.ID] = struct{}{}
				if stepDesc.OutputSchema != nil {
					defaultScope.stepSchemas[step.ID] = stepDesc.OutputSchema
				}
				if err := c.validateStepSequence(step.Default, reg, seenIDs, defaultScope); err != nil {
					return err
				}
			}

		case StepForEach:
			alias, _ := step.Inputs["item_alias"].(string)
			if !validStepIDRegex.MatchString(alias) {
				return fmt.Errorf("for_each step %q requires valid inputs.item_alias", step.ID)
			}
			itemsExpr, hasItems := step.Inputs["items"]
			if !hasItems {
				return fmt.Errorf("for_each step %q requires inputs.items", step.ID)
			}
			var itemSchema map[string]any
			if str, ok := itemsExpr.(string); ok {
				resolvedItemsSchema, err := c.validateExprWithScope(unwrapSingleBlock(str), stepScope)
				if err != nil {
					return fmt.Errorf("for_each step %q items: %w", step.ID, err)
				}
				itemSchema = extractArrayItemsSchema(resolvedItemsSchema)
			}
			innerScope := scope.clone()
			innerScope.loopAliases[alias] = struct{}{}
			innerScope.loopSchemas[alias] = map[string]any{
				"type": "object",
				"properties": map[string]any{
					"item":  nonNilSchema(itemSchema),
					"index": map[string]any{"type": "integer"},
				},
			}
			if err := c.validateStepSequence(step.Steps, reg, seenIDs, innerScope); err != nil {
				return err
			}
		}

		scope.visibleSteps[step.ID] = struct{}{}
		scope.stepSchemas[step.ID] = c.inferStepOutputSchema(step, stepDesc, stepScope)
	}
	return nil
}

type validationScope struct {
	inputSchema   map[string]any
	triggerSchema map[string]any
	visibleSteps  map[string]struct{}
	stepSchemas   map[string]map[string]any
	sourceSchemas map[string]map[string]any
	allowSources  bool
	loopAliases   map[string]struct{}
	loopSchemas   map[string]map[string]any
	localVars     map[string]map[string]any
}

func (s validationScope) clone() validationScope {
	return validationScope{
		inputSchema:   s.inputSchema,
		triggerSchema: s.triggerSchema,
		visibleSteps:  maps.Clone(s.visibleSteps),
		stepSchemas:   maps.Clone(s.stepSchemas),
		sourceSchemas: maps.Clone(s.sourceSchemas),
		allowSources:  s.allowSources,
		loopAliases:   maps.Clone(s.loopAliases),
		loopSchemas:   maps.Clone(s.loopSchemas),
		localVars:     maps.Clone(s.localVars),
	}
}

var (
	staticSpaceSchema = map[string]any{
		"type": "object",
		"properties": map[string]any{
			"id":               map[string]any{"type": "string"},
			"name":             map[string]any{"type": "string"},
			"timezone":         map[string]any{"type": "string"},
			"default_currency": map[string]any{"type": "string"},
		},
	}
	staticRunSchema = map[string]any{
		"type": "object",
		"properties": map[string]any{
			"id":      map[string]any{"type": "string"},
			"flow_id": map[string]any{"type": "string"},
			"mode":    map[string]any{"type": "string"},
			"now":     map[string]any{"type": "string", "format": "date-time"},
		},
	}
)

func triggerSchemaFor(trig *Trigger, reg *Registry) map[string]any {
	dataSchema := map[string]any{"type": "object"}
	if trig != nil && trig.Config.Topic != nil {
		if desc, ok := reg.GetTriggerTopic(strings.TrimSpace(*trig.Config.Topic)); ok && desc.PayloadSchema != nil {
			dataSchema = desc.PayloadSchema
		}
	}
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"id":    map[string]any{"type": "string"},
			"type":  map[string]any{"type": "string"},
			"topic": map[string]any{"type": "string"},
			"data":  dataSchema,
		},
	}
}

func flowTriggerSchema(flow *Flow, reg *Registry) map[string]any {
	if flow == nil {
		return triggerSchemaFor(nil, reg)
	}
	var matchedTopic string
	for i := range flow.Triggers {
		t := flow.Triggers[i]
		if t.Type != TriggerEvent || t.Config.Topic == nil || strings.TrimSpace(*t.Config.Topic) == "" {
			continue
		}
		top := strings.TrimSpace(*t.Config.Topic)
		if matchedTopic == "" {
			matchedTopic = top
		} else if matchedTopic != top {
			return triggerSchemaFor(nil, reg)
		}
	}
	if matchedTopic != "" {
		if desc, ok := reg.GetTriggerTopic(matchedTopic); ok && desc.PayloadSchema != nil {
			return triggerSchemaFor(&Trigger{Config: TriggerConfig{Topic: &matchedTopic}}, reg)
		}
	}
	return triggerSchemaFor(nil, reg)
}

func (c *CELEvaluator) inferStepOutputSchema(
	step StepNode,
	desc StepDescriptor,
	scope validationScope,
) map[string]any {
	switch step.Type {
	case StepLLMGenerate, StepAIAgentRun:
		if outSchema, ok := step.Inputs["output_schema"].(map[string]any); ok && len(outSchema) > 0 {
			return outSchema
		}
		return map[string]any{
			"type": "object",
			"properties": map[string]any{
				"text": map[string]any{"type": "string"},
			},
		}
	case StepTransform:
		return c.inferTransformSchema(step.Inputs, scope)
	default:
		return desc.OutputSchema
	}
}

func (c *CELEvaluator) inferTransformSchema(val any, scope validationScope) map[string]any {
	switch v := val.(type) {
	case map[string]any:
		props := make(map[string]any, len(v))
		for k, item := range v {
			props[k] = c.inferTransformSchema(item, scope)
		}
		return map[string]any{
			"type":       "object",
			"properties": props,
		}
	case []any:
		return map[string]any{"type": "array"}
	case string:
		tokens, err := parseTemplateTokens(v)
		if err != nil || len(tokens) == 0 {
			return map[string]any{"type": "string"}
		}
		if len(tokens) == 1 && tokens[0].isExpr && strings.TrimSpace(v) == tokens[0].raw {
			if s, sErr := c.validateExprWithScope(tokens[0].expr, scope); sErr == nil && s != nil {
				return s
			}
			return map[string]any{}
		}
		return map[string]any{"type": "string"}
	case bool:
		return map[string]any{"type": "boolean"}
	case int, int32, int64:
		return map[string]any{"type": "integer"}
	case float32, float64:
		return map[string]any{"type": "number"}
	default:
		return map[string]any{}
	}
}

func (c *CELEvaluator) validateConditionWithScope(expr string, scope validationScope) error {
	clean := unwrapSingleBlock(expr)
	checked, err := c.Compile(clean)
	if err != nil {
		return err
	}
	outType := checked.OutputType()
	if outType != cel.BoolType && outType != cel.DynType {
		return fmt.Errorf("condition %q must evaluate to bool, got %s", expr, cel.FormatCELType(outType))
	}
	return checkASTWithScope(checked, scope)
}

func (c *CELEvaluator) validateExprWithScope(expr string, scope validationScope) (map[string]any, error) {
	checked, err := c.Compile(expr)
	if err != nil {
		return nil, err
	}
	if err := checkASTWithScope(checked, scope); err != nil {
		return nil, err
	}
	if checked.NativeRep() == nil || checked.NativeRep().Expr() == nil {
		return nil, nil
	}
	return resolveASTSchema(checked.NativeRep().Expr(), scope)
}

func (c *CELEvaluator) validateAnyTemplatesWithScope(val any, scope validationScope) error {
	switch v := val.(type) {
	case string:
		tokens, err := parseTemplateTokens(v)
		if err != nil {
			return err
		}
		for _, tok := range tokens {
			if tok.isExpr {
				if _, err := c.validateExprWithScope(tok.expr, scope); err != nil {
					return err
				}
			}
		}
		return nil
	case map[string]any:
		for k, item := range v {
			if err := c.validateAnyTemplatesWithScope(item, scope); err != nil {
				return fmt.Errorf("field %q: %w", k, err)
			}
		}
		return nil
	case []any:
		for i, item := range v {
			if err := c.validateAnyTemplatesWithScope(item, scope); err != nil {
				return fmt.Errorf("index %d: %w", i, err)
			}
		}
		return nil
	default:
		return nil
	}
}

func checkASTWithScope(checked *cel.Ast, scope validationScope) error {
	if checked == nil {
		return nil
	}
	nativeAST := checked.NativeRep()
	if nativeAST == nil || nativeAST.Expr() == nil {
		return nil
	}
	_, err := resolveASTSchema(nativeAST.Expr(), scope)
	return err
}

func resolveASTSchema(e ast.Expr, scope validationScope) (map[string]any, error) {
	if e == nil {
		return nil, nil
	}
	switch e.Kind() {
	case ast.LiteralKind:
		val := e.AsLiteral().Value()
		switch val.(type) {
		case string:
			return map[string]any{"type": "string"}, nil
		case bool:
			return map[string]any{"type": "boolean"}, nil
		case int64, uint64:
			return map[string]any{"type": "integer"}, nil
		case float64:
			return map[string]any{"type": "number"}, nil
		default:
			return nil, nil
		}

	case ast.IdentKind:
		name := e.AsIdent()
		switch name {
		case "space":
			return staticSpaceSchema, nil
		case "run":
			return staticRunSchema, nil
		case "trigger":
			return scope.triggerSchema, nil
		case "input":
			return scope.inputSchema, nil
		case "sources":
			if !scope.allowSources {
				return nil, fmt.Errorf("sources cannot be referenced in this expression")
			}
			return nil, nil
		default:
			if s, ok := scope.localVars[name]; ok {
				return s, nil
			}
			return nil, nil
		}

	case ast.SelectKind:
		sel := e.AsSelect()
		op := sel.Operand()
		field := sel.FieldName()
		if op != nil && op.Kind() == ast.IdentKind {
			switch op.AsIdent() {
			case "steps":
				if _, ok := scope.visibleSteps[field]; !ok {
					return nil, fmt.Errorf("references step %q which is not in upstream lexical scope", field)
				}
				return scope.stepSchemas[field], nil
			case "sources":
				if !scope.allowSources {
					return nil, fmt.Errorf("sources cannot be referenced in this expression")
				}
				srcSchema, ok := scope.sourceSchemas[field]
				if !ok {
					return nil, fmt.Errorf("references source %q which is not declared in step.sources", field)
				}
				return srcSchema, nil
			case loopInternalVar:
				if _, ok := scope.loopAliases[field]; !ok {
					return nil, fmt.Errorf("references loop alias %q which is not active", field)
				}
				return scope.loopSchemas[field], nil
			}
		}
		parentSchema, err := resolveASTSchema(op, scope)
		if err != nil {
			return nil, err
		}
		return resolvePropertySchema(parentSchema, field)

	case ast.CallKind:
		call := e.AsCall()
		fn := call.FunctionName()
		var targetSchema map[string]any
		if call.Target() != nil {
			var err error
			targetSchema, err = resolveASTSchema(call.Target(), scope)
			if err != nil {
				return nil, err
			}
		}
		argSchemas := make([]map[string]any, len(call.Args()))
		for i, arg := range call.Args() {
			s, err := resolveASTSchema(arg, scope)
			if err != nil {
				return nil, err
			}
			argSchemas[i] = s
		}

		switch fn {
		case "_?._":
			if len(call.Args()) == 2 {
				if fieldName, ok := literalString(call.Args()[1]); ok {
					return resolvePropertySchema(argSchemas[0], fieldName)
				}
			}
			return nil, nil
		case "_[_]":
			if len(argSchemas) == 2 && argSchemas[0] != nil {
				if items := extractArrayItemsSchema(argSchemas[0]); items != nil {
					return items, nil
				}
				if addProps, ok := argSchemas[0]["additionalProperties"].(map[string]any); ok {
					return addProps, nil
				}
			}
			return nil, nil
		case "orValue":
			if len(targetSchema) > 0 {
				return targetSchema, nil
			}
			if len(argSchemas) > 0 {
				return argSchemas[0], nil
			}
			return nil, nil
		case "_?_:_":
			if len(argSchemas) == 3 {
				if len(argSchemas[1]) > 0 {
					return argSchemas[1], nil
				}
				return argSchemas[2], nil
			}
			return nil, nil
		case "toCents":
			if len(argSchemas) == 1 {
				if err := assertNumericSchema("toCents", argSchemas[0]); err != nil {
					return nil, err
				}
			}
			return map[string]any{"type": "integer"}, nil
		case "fromCents":
			if len(argSchemas) == 1 {
				if err := assertNumericSchema("fromCents", argSchemas[0]); err != nil {
					return nil, err
				}
			}
			return map[string]any{"type": "number"}, nil
		case "formatMoney":
			if len(argSchemas) == 2 {
				if err := assertNumericSchema("formatMoney", argSchemas[0]); err != nil {
					return nil, err
				}
				if err := assertStringSchema("formatMoney", argSchemas[1]); err != nil {
					return nil, err
				}
			}
			return map[string]any{"type": "string"}, nil
		case "inSpaceTz":
			return map[string]any{"type": "string", "format": "date-time"}, nil
		case "localTime", "addDays", "toJSON":
			return map[string]any{"type": "string"}, nil
		}
		return nil, nil

	case ast.ListKind:
		for _, elem := range e.AsList().Elements() {
			if _, err := resolveASTSchema(elem, scope); err != nil {
				return nil, err
			}
		}
		return map[string]any{"type": "array"}, nil

	case ast.MapKind:
		props := make(map[string]any)
		allLiteralKeys := true
		for _, entry := range e.AsMap().Entries() {
			me := entry.AsMapEntry()
			if _, err := resolveASTSchema(me.Key(), scope); err != nil {
				return nil, err
			}
			valSchema, err := resolveASTSchema(me.Value(), scope)
			if err != nil {
				return nil, err
			}
			if k, ok := literalString(me.Key()); ok {
				props[k] = nonNilSchema(valSchema)
			} else {
				allLiteralKeys = false
			}
		}
		if allLiteralKeys && len(props) > 0 {
			return map[string]any{"type": "object", "properties": props}, nil
		}
		return map[string]any{"type": "object"}, nil

	case ast.StructKind:
		for _, field := range e.AsStruct().Fields() {
			if _, err := resolveASTSchema(field.AsStructField().Value(), scope); err != nil {
				return nil, err
			}
		}
		return map[string]any{"type": "object"}, nil

	case ast.ComprehensionKind:
		comp := e.AsComprehension()
		rangeSchema, err := resolveASTSchema(comp.IterRange(), scope)
		if err != nil {
			return nil, err
		}
		if _, err := resolveASTSchema(comp.AccuInit(), scope); err != nil {
			return nil, err
		}

		innerScope := scope
		if iterVar := comp.IterVar(); iterVar != "" && !strings.HasPrefix(iterVar, "__") {
			if itemSchema := extractArrayItemsSchema(rangeSchema); itemSchema != nil {
				innerScope = scope.clone()
				if innerScope.localVars == nil {
					innerScope.localVars = make(map[string]map[string]any)
				}
				innerScope.localVars[iterVar] = itemSchema
			}
		}

		if _, err := resolveASTSchema(comp.LoopCondition(), innerScope); err != nil {
			return nil, err
		}
		if _, err := resolveASTSchema(comp.LoopStep(), innerScope); err != nil {
			return nil, err
		}
		return resolveASTSchema(comp.Result(), innerScope)
	}
	return nil, nil
}

func resolvePropertySchema(parent map[string]any, field string) (map[string]any, error) {
	if len(parent) == 0 {
		return nil, nil
	}
	parent = unwrapObjectSchema(parent)
	props, hasProps := parent["properties"].(map[string]any)
	if !hasProps || len(props) == 0 {
		if addProps, ok := parent["additionalProperties"].(map[string]any); ok {
			return addProps, nil
		}
		return nil, nil
	}
	propRaw, ok := props[field]
	if ok {
		if m, ok := propRaw.(map[string]any); ok {
			return m, nil
		}
		return nil, nil
	}
	if addProps, hasAdd := parent["additionalProperties"]; hasAdd {
		if allowed, isBool := addProps.(bool); isBool && allowed {
			return nil, nil
		}
		if m, isMap := addProps.(map[string]any); isMap {
			return m, nil
		}
	}
	return nil, fmt.Errorf("unknown field %q on schema", field)
}

func unwrapObjectSchema(s map[string]any) map[string]any {
	if s == nil {
		return nil
	}
	if _, ok := s["properties"]; ok {
		return s
	}
	for _, key := range []string{"anyOf", "oneOf"} {
		if variants, ok := s[key].([]any); ok {
			for _, v := range variants {
				if m, ok := v.(map[string]any); ok {
					if _, hasProps := m["properties"]; hasProps {
						return m
					}
				}
			}
		}
	}
	return s
}

func extractArrayItemsSchema(s map[string]any) map[string]any {
	if s == nil {
		return nil
	}
	if items, ok := s["items"].(map[string]any); ok {
		return items
	}
	for _, key := range []string{"anyOf", "oneOf"} {
		if variants, ok := s[key].([]any); ok {
			for _, v := range variants {
				if m, ok := v.(map[string]any); ok {
					if items, ok := m["items"].(map[string]any); ok {
						return items
					}
				}
			}
		}
	}
	return nil
}

func validateMapKeysAgainstSchema(m map[string]any, schema map[string]any) error {
	if len(m) == 0 || len(schema) == 0 {
		return nil
	}
	schema = unwrapObjectSchema(schema)
	props, hasProps := schema["properties"].(map[string]any)
	if !hasProps || len(props) == 0 {
		return nil
	}
	if allowed, isBool := schema["additionalProperties"].(bool); isBool && allowed {
		return nil
	}
	for k := range m {
		if _, ok := props[k]; !ok {
			return fmt.Errorf("unknown parameter %q", k)
		}
	}
	return nil
}

func assertNumericSchema(fnName string, s map[string]any) error {
	t := primarySchemaType(s)
	if t == "" {
		return nil
	}
	switch t {
	case "integer", "number":
		return nil
	default:
		return fmt.Errorf("%s expects numeric argument, got %s", fnName, t)
	}
}

func assertStringSchema(fnName string, s map[string]any) error {
	t := primarySchemaType(s)
	if t == "" || t == "string" {
		return nil
	}
	return fmt.Errorf("%s expects string argument, got %s", fnName, t)
}

func primarySchemaType(s map[string]any) string {
	if len(s) == 0 {
		return ""
	}
	if t, ok := s["type"].(string); ok {
		return t
	}
	if arr, ok := s["type"].([]any); ok {
		for _, item := range arr {
			if str, ok := item.(string); ok && str != "null" {
				return str
			}
		}
	}
	if arr, ok := s["type"].([]string); ok {
		for _, str := range arr {
			if str != "null" {
				return str
			}
		}
	}
	return ""
}

func literalString(e ast.Expr) (string, bool) {
	if e == nil || e.Kind() != ast.LiteralKind {
		return "", false
	}
	s, ok := e.AsLiteral().Value().(string)
	return s, ok
}

func nonNilSchema(s map[string]any) map[string]any {
	if s == nil {
		return map[string]any{}
	}
	return s
}

type templateToken struct {
	raw    string
	expr   string
	isExpr bool
}

func parseTemplateTokens(s string) ([]templateToken, error) {
	if !strings.Contains(s, "{{") {
		return nil, nil
	}
	var tokens []templateToken
	rest := s
	for len(rest) > 0 {
		idx := strings.Index(rest, "{{")
		if idx < 0 {
			tokens = append(tokens, templateToken{raw: rest})
			break
		}
		if idx > 0 {
			tokens = append(tokens, templateToken{raw: rest[:idx]})
		}
		afterOpen := rest[idx+2:]
		endIdx := findClosingBraces(afterOpen)
		if endIdx < 0 {
			return nil, fmt.Errorf("unclosed template expression in %q", s)
		}
		expr := strings.TrimSpace(afterOpen[:endIdx])
		if expr == "" {
			return nil, fmt.Errorf("empty template expression in %q", s)
		}
		tokens = append(tokens, templateToken{
			raw:    rest[idx : idx+2+endIdx+2],
			expr:   expr,
			isExpr: true,
		})
		rest = afterOpen[endIdx+2:]
	}
	return tokens, nil
}

func findClosingBraces(s string) int {
	inSingle := false
	inDouble := false
	escaped := false
	for i := 0; i < len(s); i++ {
		ch := s[i]
		if escaped {
			escaped = false
			continue
		}
		if (inSingle || inDouble) && ch == '\\' {
			escaped = true
			continue
		}
		if ch == '\'' && !inDouble {
			inSingle = !inSingle
			continue
		}
		if ch == '"' && !inSingle {
			inDouble = !inDouble
			continue
		}
		if !inSingle && !inDouble && ch == '}' && i+1 < len(s) && s[i+1] == '}' {
			return i
		}
	}
	return -1
}

func unwrapSingleBlock(s string) string {
	trimmed := strings.TrimSpace(s)
	tokens, err := parseTemplateTokens(trimmed)
	if err == nil && len(tokens) == 1 && tokens[0].isExpr && tokens[0].raw == trimmed {
		return tokens[0].expr
	}
	return s
}

func resolveLocation(state *FlowState) *time.Location {
	if state != nil && state.Space.Timezone != "" {
		if loc, err := time.LoadLocation(state.Space.Timezone); err == nil {
			return loc
		}
	}
	return time.UTC
}

func tzLateBoundFunctions(loc *time.Location) map[string]cel.LateBoundFunction {
	inSpaceTzFn := func(_ string, args ...ref.Val) ref.Val {
		switch x := args[0].(type) {
		case types.String:
			ts, err := parseDateOrTimestamp(string(x), loc)
			if err != nil {
				return types.NewErr("%v", err)
			}
			return types.Timestamp{Time: ts.In(loc)}
		case types.Timestamp:
			return types.Timestamp{Time: x.In(loc)}
		default:
			return types.NewErr("inSpaceTz expects string or timestamp, got %T", args[0].Value())
		}
	}

	localTimeFn := func(_ string, args ...ref.Val) ref.Val {
		var ts time.Time
		switch x := args[0].(type) {
		case types.String:
			parsed, err := parseDateOrTimestamp(string(x), loc)
			if err != nil {
				return types.NewErr("%v", err)
			}
			ts = parsed
		case types.Timestamp:
			ts = x.Time
		default:
			return types.NewErr("localTime expects string or timestamp, got %T", args[0].Value())
		}
		formatted, err := applyLocalHHMM(ts, string(args[1].(types.String)), loc)
		if err != nil {
			return types.NewErr("%v", err)
		}
		return types.String(formatted)
	}

	return map[string]cel.LateBoundFunction{
		"inSpaceTz": inSpaceTzFn,
		"localTime": localTimeFn,
	}
}

const loopInternalVar = "__saturn_loop__"

func rewriteLoopIdentifier(expr string) string {
	if !strings.Contains(expr, "loop") {
		return expr
	}
	var out strings.Builder
	out.Grow(len(expr) + 16)

	inSingle := false
	inDouble := false
	escaped := false

	for i := 0; i < len(expr); i++ {
		ch := expr[i]
		if escaped {
			out.WriteByte(ch)
			escaped = false
			continue
		}
		if (inSingle || inDouble) && ch == '\\' {
			out.WriteByte(ch)
			escaped = true
			continue
		}
		if ch == '\'' && !inDouble {
			inSingle = !inSingle
			out.WriteByte(ch)
			continue
		}
		if ch == '"' && !inSingle {
			inDouble = !inDouble
			out.WriteByte(ch)
			continue
		}
		if !inSingle && !inDouble && strings.HasPrefix(expr[i:], "loop") {
			prevOK := i == 0 || (!isIdentChar(expr[i-1]) && expr[i-1] != '.')
			afterIdx := i + 4
			nextOK := afterIdx == len(expr) || !isIdentChar(expr[afterIdx])
			if prevOK && nextOK {
				out.WriteString(loopInternalVar)
				i += 3
				continue
			}
		}
		out.WriteByte(ch)
	}
	return out.String()
}

func isIdentChar(b byte) bool {
	return (b >= 'a' && b <= 'z') || (b >= 'A' && b <= 'Z') || (b >= '0' && b <= '9') || b == '_'
}

func parseDateOrTimestamp(raw string, loc *time.Location) (time.Time, error) {
	s := strings.TrimSpace(raw)
	if s == "" {
		return time.Time{}, fmt.Errorf("empty date/timestamp")
	}
	if t, err := time.Parse(time.RFC3339Nano, s); err == nil {
		return t, nil
	}
	if t, err := time.Parse(time.RFC3339, s); err == nil {
		return t, nil
	}
	if t, err := time.ParseInLocation("2006-01-02", s, loc); err == nil {
		return t, nil
	}
	return time.Time{}, fmt.Errorf("invalid date or RFC3339 timestamp %q", raw)
}

func applyLocalHHMM(base time.Time, hhmm string, loc *time.Location) (string, error) {
	hStr, mStr, ok := strings.Cut(strings.TrimSpace(hhmm), ":")
	if !ok {
		return "", fmt.Errorf("expected HH:MM format, got %q", hhmm)
	}
	hour, err := strconv.Atoi(hStr)
	if err != nil || hour < 0 || hour > 23 {
		return "", fmt.Errorf("invalid hour in %q", hhmm)
	}
	minute, err := strconv.Atoi(mStr)
	if err != nil || minute < 0 || minute > 59 {
		return "", fmt.Errorf("invalid minute in %q", hhmm)
	}
	localBase := base.In(loc)
	combined := time.Date(localBase.Year(), localBase.Month(), localBase.Day(), hour, minute, 0, 0, loc)
	return combined.Format(time.RFC3339), nil
}

func addDaysToString(raw string, days int) (string, error) {
	s := strings.TrimSpace(raw)
	if t, err := time.Parse("2006-01-02", s); err == nil {
		return t.AddDate(0, 0, days).Format("2006-01-02"), nil
	}
	if t, err := time.Parse(time.RFC3339Nano, s); err == nil {
		return t.AddDate(0, 0, days).Format(time.RFC3339), nil
	}
	if t, err := time.Parse(time.RFC3339, s); err == nil {
		return t.AddDate(0, 0, days).Format(time.RFC3339), nil
	}
	return "", fmt.Errorf("invalid date or timestamp %q", raw)
}

func isNullOrEmpty(v ref.Val) bool {
	if v == nil || v == types.NullValue {
		return true
	}
	if _, ok := v.(types.Null); ok {
		return true
	}
	if s, ok := v.(types.String); ok && string(s) == "" {
		return true
	}
	return false
}

func refValToGo(v ref.Val) any {
	if v == nil || v == types.NullValue {
		return nil
	}
	if _, ok := v.(types.Null); ok {
		return nil
	}
	if opt, ok := v.(*types.Optional); ok {
		if !opt.HasValue() {
			return nil
		}
		return refValToGo(opt.GetValue())
	}
	if ts, ok := v.(types.Timestamp); ok {
		return ts.Time.UTC().Format(time.RFC3339)
	}
	native := v.Value()
	return normalizeNative(native)
}

func normalizeNative(val any) any {
	if val == nil {
		return nil
	}
	switch x := val.(type) {
	case ref.Val:
		return refValToGo(x)
	case []ref.Val:
		out := make([]any, len(x))
		for i, elem := range x {
			out[i] = refValToGo(elem)
		}
		return out
	case map[ref.Val]ref.Val:
		out := make(map[string]any, len(x))
		for k, item := range x {
			out[fmt.Sprint(refValToGo(k))] = refValToGo(item)
		}
		return out
	case map[string]any:
		out := make(map[string]any, len(x))
		for k, item := range x {
			out[k] = normalizeNative(item)
		}
		return out
	case []any:
		out := make([]any, len(x))
		for i, item := range x {
			out[i] = normalizeNative(item)
		}
		return out
	default:
		rv := reflect.ValueOf(val)
		if rv.Kind() == reflect.Slice {
			n := rv.Len()
			out := make([]any, n)
			for i := range n {
				out[i] = normalizeNative(rv.Index(i).Interface())
			}
			return out
		}
		if rv.Kind() == reflect.Map {
			out := make(map[string]any, rv.Len())
			for _, key := range rv.MapKeys() {
				out[fmt.Sprint(key.Interface())] = normalizeNative(rv.MapIndex(key).Interface())
			}
			return out
		}
		return val
	}
}

func stringifyValue(v any) string {
	if v == nil {
		return ""
	}
	switch x := v.(type) {
	case string:
		return x
	case bool:
		return strconv.FormatBool(x)
	case int:
		return strconv.Itoa(x)
	case int64:
		return strconv.FormatInt(x, 10)
	case float64:
		return strconv.FormatFloat(x, 'f', -1, 64)
	case time.Time:
		return x.UTC().Format(time.RFC3339)
	default:
		if b, err := json.Marshal(x, json.Deterministic(true)); err == nil {
			return string(b)
		}
		return fmt.Sprint(x)
	}
}

func toAnySlice(v any) ([]any, error) {
	if v == nil {
		return []any{}, nil
	}
	if s, ok := v.([]any); ok {
		return s, nil
	}
	rv := reflect.ValueOf(v)
	if rv.Kind() != reflect.Slice && rv.Kind() != reflect.Array {
		return nil, fmt.Errorf("expected list value, got %T", v)
	}
	out := make([]any, rv.Len())
	for i := range rv.Len() {
		out[i] = normalizeNative(rv.Index(i).Interface())
	}
	return out, nil
}
