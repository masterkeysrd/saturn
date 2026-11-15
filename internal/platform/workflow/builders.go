package workflow

import (
	"encoding/json/v2"
	"fmt"
)

// SourceConfig configures a typed SourceBinding whose Params struct is encoded to map[string]any.
type SourceConfig[P any] struct {
	Loader   string
	Params   P
	Required bool
}

// Source builds a SourceBinding from a strongly-typed parameter template struct P.
func Source[P any](cfg SourceConfig[P]) SourceBinding {
	return SourceBinding{
		Loader:   cfg.Loader,
		Params:   StructToMap(cfg.Params),
		Required: cfg.Required,
	}
}

// LLMStepConfig configures an `llm.generate` StepNode.
type LLMStepConfig struct {
	ID           string
	Name         string
	OnError      string
	Model        *ModelConfig
	Sources      map[string]SourceBinding
	System       string
	Prompt       string
	OutputSchema map[string]any
	Documents    any
}

// LLMStep builds an `llm.generate` StepNode.
func LLMStep(cfg LLMStepConfig) StepNode {
	inputs := map[string]any{
		"prompt": cfg.Prompt,
	}
	if cfg.System != "" {
		inputs["system"] = cfg.System
	}
	if cfg.OutputSchema != nil {
		inputs["output_schema"] = cfg.OutputSchema
	}
	if cfg.Documents != nil {
		inputs["documents"] = cfg.Documents
	}
	return StepNode{
		ID:      cfg.ID,
		Name:    optName(cfg.Name),
		Type:    StepLLMGenerate,
		OnError: cfg.OnError,
		Model:   cfg.Model,
		Sources: cfg.Sources,
		Inputs:  inputs,
	}
}

// FilterStepConfig configures a `filter` StepNode.
type FilterStepConfig struct {
	ID        string
	Name      string
	OnError   string
	Sources   map[string]SourceBinding
	Condition string
	Reason    string
}

// FilterStep builds a `filter` StepNode.
func FilterStep(cfg FilterStepConfig) StepNode {
	inputs := map[string]any{
		"condition": cfg.Condition,
	}
	if cfg.Reason != "" {
		inputs["reason"] = cfg.Reason
	}
	return StepNode{
		ID:      cfg.ID,
		Name:    optName(cfg.Name),
		Type:    StepFilter,
		OnError: cfg.OnError,
		Sources: cfg.Sources,
		Inputs:  inputs,
	}
}

// SwitchStepConfig configures a `switch` StepNode.
type SwitchStepConfig struct {
	ID      string
	Name    string
	OnError string
	Sources map[string]SourceBinding
	Cases   []SwitchCase
	Default []StepNode
}

// SwitchStep builds a `switch` StepNode.
func SwitchStep(cfg SwitchStepConfig) StepNode {
	return StepNode{
		ID:      cfg.ID,
		Name:    optName(cfg.Name),
		Type:    StepSwitch,
		OnError: cfg.OnError,
		Sources: cfg.Sources,
		Cases:   cfg.Cases,
		Default: cfg.Default,
	}
}

// ForEachStepConfig configures a `for_each` StepNode.
type ForEachStepConfig struct {
	ID        string
	Name      string
	OnError   string
	Sources   map[string]SourceBinding
	Items     string
	ItemAlias string
	Steps     []StepNode
}

// ForEachStep builds a `for_each` StepNode.
func ForEachStep(cfg ForEachStepConfig) StepNode {
	return StepNode{
		ID:      cfg.ID,
		Name:    optName(cfg.Name),
		Type:    StepForEach,
		OnError: cfg.OnError,
		Sources: cfg.Sources,
		Inputs: map[string]any{
			"items":      cfg.Items,
			"item_alias": cfg.ItemAlias,
		},
		Steps: cfg.Steps,
	}
}

// DocumentExtractTextStepConfig configures a `document.extract_text` StepNode.
type DocumentExtractTextStepConfig struct {
	ID          string
	Name        string
	OnError     string
	Sources     map[string]SourceBinding
	ArtifactRef string
	Filename    string
	ContentType string
	Passwords   any
}

// DocumentExtractTextStep builds a `document.extract_text` StepNode.
func DocumentExtractTextStep(cfg DocumentExtractTextStepConfig) StepNode {
	inputs := map[string]any{
		"artifact_ref": cfg.ArtifactRef,
	}
	if cfg.Filename != "" {
		inputs["filename"] = cfg.Filename
	}
	if cfg.ContentType != "" {
		inputs["content_type"] = cfg.ContentType
	}
	if cfg.Passwords != nil {
		inputs["passwords"] = cfg.Passwords
	}
	return StepNode{
		ID:      cfg.ID,
		Name:    optName(cfg.Name),
		Type:    StepDocumentExtractText,
		OnError: cfg.OnError,
		Sources: cfg.Sources,
		Inputs:  inputs,
	}
}

// TransformStepConfig configures a `transform` StepNode.
type TransformStepConfig struct {
	ID      string
	Name    string
	OnError string
	Sources map[string]SourceBinding
	Inputs  any
}

// TransformStep builds a `transform` StepNode from a typed template struct or map.
func TransformStep(cfg TransformStepConfig) StepNode {
	return StepNode{
		ID:      cfg.ID,
		Name:    optName(cfg.Name),
		Type:    StepTransform,
		OnError: cfg.OnError,
		Sources: cfg.Sources,
		Inputs:  StructToMap(cfg.Inputs),
	}
}

// OutputStepConfig configures an `output` StepNode.
type OutputStepConfig struct {
	ID      string
	Name    string
	Sources map[string]SourceBinding
	Value   any
}

// OutputStep builds an `output` StepNode.
func OutputStep(cfg OutputStepConfig) StepNode {
	val := cfg.Value
	if val != nil {
		if normalized, err := normalizeOutputForCEL(val); err == nil {
			val = normalized
		}
	}
	return StepNode{
		ID:      cfg.ID,
		Name:    optName(cfg.Name),
		Type:    StepOutput,
		Sources: cfg.Sources,
		Inputs: map[string]any{
			"value": val,
		},
	}
}

// StopStepConfig configures a `stop` StepNode.
type StopStepConfig struct {
	ID      string
	Name    string
	Sources map[string]SourceBinding
	Reason  string
}

// StopStep builds a `stop` StepNode.
func StopStep(cfg StopStepConfig) StepNode {
	inputs := map[string]any{}
	if cfg.Reason != "" {
		inputs["reason"] = cfg.Reason
	}
	return StepNode{
		ID:      cfg.ID,
		Name:    optName(cfg.Name),
		Type:    StepStop,
		Sources: cfg.Sources,
		Inputs:  inputs,
	}
}

// ActionStepConfig configures a domain-registered action StepNode using typed input templates T.
type ActionStepConfig[T any] struct {
	ID      string
	Name    string
	Type    string
	OnError string
	Sources map[string]SourceBinding
	Inputs  T
}

// ActionStep builds a domain action StepNode from a strongly-typed input template struct T.
func ActionStep[T any](cfg ActionStepConfig[T]) StepNode {
	return StepNode{
		ID:      cfg.ID,
		Name:    optName(cfg.Name),
		Type:    cfg.Type,
		OnError: cfg.OnError,
		Sources: cfg.Sources,
		Inputs:  StructToMap(cfg.Inputs),
	}
}

func optName(name string) *string {
	if name == "" {
		return nil
	}
	return new(name)
}

// StructToMap converts a typed template struct (or existing map[string]any) to a JSON-keyed map[string]any, preserving int64 values.
func StructToMap(v any) map[string]any {
	if v == nil {
		return nil
	}
	if m, ok := v.(map[string]any); ok {
		return m
	}
	data, err := json.Marshal(v)
	if err != nil {
		panic(fmt.Sprintf("workflow builder marshal %T: %v", v, err))
	}
	norm, err := decodeJSONPreserveInts(data)
	if err != nil {
		panic(fmt.Sprintf("workflow builder decode %T: %v", v, err))
	}
	m, ok := norm.(map[string]any)
	if !ok {
		panic(fmt.Sprintf("workflow builder expected object for %T, got %T", v, norm))
	}
	return m
}
