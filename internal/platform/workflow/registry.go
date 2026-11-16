package workflow

import (
	"cmp"
	"context"
	"slices"
	"sync"
)

// StepContext provides strongly-typed runtime inputs, pre-resolved sources, and execution metadata to a step handler.
type StepContext[I any] struct {
	SpaceID   string
	FlowRunID string
	StepRunID string
	Step      StepNode
	Inputs    I
	RawInputs map[string]any
	Sources   map[string]any
	State     *FlowState
	Artifacts ArtifactResolver
}

// StepExecutionContext provides untyped runtime inputs, pre-resolved sources, and execution metadata to a StepHandler.
type StepExecutionContext struct {
	SpaceID   string
	FlowRunID string
	StepRunID string
	Step      StepNode
	Inputs    map[string]any
	Sources   map[string]any
	State     *FlowState
	Artifacts ArtifactResolver
}

// ArtifactResolver loads binary content from ephemeral or domain-registered ArtifactRefs.
type ArtifactResolver interface {
	Resolve(ctx context.Context, spaceID string, ref string) (ResolvedArtifact, error)
}

// StepHandler executes a non-control workflow step.
type StepHandler interface {
	Execute(ctx context.Context, execCtx *StepExecutionContext) (map[string]any, error)
}

// StepHandlerFunc adapts a function to StepHandler.
type StepHandlerFunc func(ctx context.Context, execCtx *StepExecutionContext) (map[string]any, error)

// Execute invokes the underlying function.
func (f StepHandlerFunc) Execute(ctx context.Context, execCtx *StepExecutionContext) (map[string]any, error) {
	return f(ctx, execCtx)
}

// DataLoader provides read-only data fetched concurrently for step `sources`.
type DataLoader interface {
	Load(ctx context.Context, spaceID string, params map[string]any) (any, error)
}

// DataLoaderFunc adapts a function to DataLoader.
type DataLoaderFunc func(ctx context.Context, spaceID string, params map[string]any) (any, error)

// Load invokes the underlying function.
func (f DataLoaderFunc) Load(ctx context.Context, spaceID string, params map[string]any) (any, error) {
	return f(ctx, spaceID, params)
}

// TriggerTopicDescriptor documents a domain event topic available for `event` triggers.
type TriggerTopicDescriptor struct {
	Topic         string         `json:"topic"`
	Domain        string         `json:"domain"`
	DisplayName   string         `json:"display_name"`
	Description   string         `json:"description"`
	PayloadSchema map[string]any `json:"payload_schema,omitempty"`
}

// StepDescriptor documents a registered step type and its invalidation rules.
type StepDescriptor struct {
	Type                string         `json:"type"`
	Owner               string         `json:"owner"`
	Category            string         `json:"category"` // "control", "ai", "document", "action"
	DisplayName         string         `json:"display_name"`
	Description         string         `json:"description"`
	InputsSchema        map[string]any `json:"inputs_schema,omitempty"`
	OutputSchema        map[string]any `json:"output_schema,omitempty"`
	InvalidatesPrefixes []string       `json:"-"`
}

// LoaderDescriptor documents a registered read-only DataLoader.
type LoaderDescriptor struct {
	Name         string         `json:"name"`
	Owner        string         `json:"owner"`
	DisplayName  string         `json:"display_name"`
	Description  string         `json:"description"`
	ParamsSchema map[string]any `json:"params_schema,omitempty"`
	OutputSchema map[string]any `json:"output_schema,omitempty"`
}

// CelHelperDescriptor documents a Saturn CEL helper function.
type CelHelperDescriptor struct {
	Name        string `json:"name"`
	Signature   string `json:"signature"`
	Description string `json:"description"`
	Example     string `json:"example"`
}

// Catalog holds all registered workflow capabilities.
type Catalog struct {
	TriggerTopics []TriggerTopicDescriptor `json:"trigger_topics"`
	Steps         []StepDescriptor         `json:"steps"`
	Loaders       []LoaderDescriptor       `json:"loaders"`
	CelHelpers    []CelHelperDescriptor    `json:"cel_helpers"`
}

// SystemFlowBlueprint defines a built-in system workflow materialized per Space.
type SystemFlowBlueprint struct {
	SystemKey string
	Build     func(spaceID string) (*Flow, []Trigger)
}

type registeredStep struct {
	desc    StepDescriptor
	handler StepHandler
}

type registeredLoader struct {
	desc   LoaderDescriptor
	loader DataLoader
}

// Registry stores all registered step handlers, data loaders, system flows, trigger topics, and artifact readers.
type Registry struct {
	mu              sync.RWMutex
	steps           map[string]registeredStep
	loaders         map[string]registeredLoader
	systemFlows     map[string]SystemFlowBlueprint
	triggerTopics   map[string]TriggerTopicDescriptor
	artifactReaders map[string]ArtifactReader
}

// NewRegistry initializes a Registry pre-populated with core platform step descriptors.
func NewRegistry() *Registry {
	r := &Registry{
		steps:           make(map[string]registeredStep),
		loaders:         make(map[string]registeredLoader),
		systemFlows:     make(map[string]SystemFlowBlueprint),
		triggerTopics:   make(map[string]TriggerTopicDescriptor),
		artifactReaders: make(map[string]ArtifactReader),
	}
	r.registerBuiltinDescriptors()
	return r
}

func (r *Registry) registerBuiltinDescriptors() {
	builtins := []StepDescriptor{
		{
			Type:        StepLLMGenerate,
			Owner:       "platform",
			Category:    "ai",
			DisplayName: "LLM Generate",
			Description: "Prompts a configured model or semantic role with optional structured JSON output schema and document attachments.",
			InputsSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"system":        map[string]any{"type": "string"},
					"prompt":        map[string]any{"type": "string"},
					"output_schema": map[string]any{"type": "object"},
					"documents":     map[string]any{"type": "array"},
				},
				"required": []string{"prompt"},
			},
		},
		{
			Type:        StepAIAgentRun,
			Owner:       "platform",
			Category:    "ai",
			DisplayName: "AI Agent Run",
			Description: "Executes a workspace AI agent headlessly in a multi-step MCP-enabled run.",
			InputsSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"agent_id":      map[string]any{"type": "string"},
					"prompt":        map[string]any{"type": "string"},
					"input":         map[string]any{"type": "object"},
					"output_schema": map[string]any{"type": "object"},
				},
				"required": []string{"agent_id"},
			},
		},
		{
			Type:        StepFilter,
			Owner:       "platform",
			Category:    "control",
			DisplayName: "Filter",
			Description: "Evaluates a CEL boolean condition; halts the run cleanly with status 'filtered' if false.",
			InputsSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"condition": map[string]any{"type": "string"},
					"reason":    map[string]any{"type": "string"},
				},
				"required": []string{"condition"},
			},
			OutputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"passed": map[string]any{"type": "boolean"},
				},
			},
		},
		{
			Type:        StepSwitch,
			Owner:       "platform",
			Category:    "control",
			DisplayName: "Switch",
			Description: "Evaluates ordered CEL case conditions and executes the first matching branch before rejoining.",
			OutputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"matched_case": map[string]any{"type": []string{"string", "null"}},
				},
			},
		},
		{
			Type:        StepForEach,
			Owner:       "platform",
			Category:    "control",
			DisplayName: "For Each",
			Description: "Iterates sequentially over a CEL list, binding loop.<alias>.item and loop.<alias>.index.",
			InputsSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"items":      map[string]any{"type": "string"},
					"item_alias": map[string]any{"type": "string"},
				},
				"required": []string{"items", "item_alias"},
			},
			OutputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"count":   map[string]any{"type": "integer"},
					"results": map[string]any{"type": "array"},
				},
			},
		},
		{
			Type:        StepTransform,
			Owner:       "platform",
			Category:    "control",
			DisplayName: "Transform",
			Description: "Evaluates arbitrary CEL expressions in inputs and binds the resulting object to steps.<id>.",
		},
		{
			Type:        StepOutput,
			Owner:       "platform",
			Category:    "control",
			DisplayName: "Output",
			Description: "Terminates the current path and sets FlowRun.output for synchronous callers.",
			InputsSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"value": map[string]any{},
				},
			},
		},
		{
			Type:        StepStop,
			Owner:       "platform",
			Category:    "control",
			DisplayName: "Stop",
			Description: "Terminates the current branch or run cleanly with status 'stopped'.",
			InputsSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"reason": map[string]any{"type": "string"},
				},
			},
		},
		{
			Type:        StepDocumentExtractText,
			Owner:       "platform",
			Category:    "document",
			DisplayName: "Extract Document Text",
			Description: "Extracts plain text from PDF, CSV, or text artifacts with optional password decryption.",
			InputsSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"artifact_ref": map[string]any{"type": "string"},
					"filename":     map[string]any{"type": "string"},
					"content_type": map[string]any{"type": "string"},
					"passwords":    map[string]any{"type": "array", "items": map[string]any{"type": "string"}},
				},
				"required": []string{"artifact_ref"},
			},
			OutputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"text":           map[string]any{"type": "string"},
					"is_encrypted":   map[string]any{"type": "boolean"},
					"decrypted":      map[string]any{"type": "boolean"},
					"needs_password": map[string]any{"type": "boolean"},
					"error":          map[string]any{"type": "string"},
				},
			},
		},
	}

	for _, desc := range builtins {
		r.steps[desc.Type] = registeredStep{desc: desc}
	}
}

// RegisterStep registers or overrides a strongly-typed step descriptor and handler,
// deriving omitted InputsSchema and OutputSchema from I and O via JSON Schema generation.
func (r *Registry) RegisterStep[I, O any](
	desc StepDescriptor,
	fn func(ctx context.Context, execCtx *StepContext[I]) (O, error),
) {
	if desc.InputsSchema == nil {
		desc.InputsSchema = SchemaFor[I]()
	}
	if desc.OutputSchema == nil {
		desc.OutputSchema = SchemaFor[O]()
	}
	handler := StepHandlerFunc(func(ctx context.Context, execCtx *StepExecutionContext) (map[string]any, error) {
		typedInputs, err := decodeTypedInputs[I](execCtx.Inputs)
		if err != nil {
			return nil, err
		}
		out, err := fn(ctx, &StepContext[I]{
			SpaceID:   execCtx.SpaceID,
			FlowRunID: execCtx.FlowRunID,
			StepRunID: execCtx.StepRunID,
			Step:      execCtx.Step,
			Inputs:    typedInputs,
			RawInputs: execCtx.Inputs,
			Sources:   execCtx.Sources,
			State:     execCtx.State,
			Artifacts: execCtx.Artifacts,
		})
		if err != nil {
			return nil, err
		}
		return normalizeMapOutputForCEL(out)
	})
	r.mu.Lock()
	defer r.mu.Unlock()
	r.steps[desc.Type] = registeredStep{desc: desc, handler: handler}
}

// GetStep looks up a registered step descriptor and handler by type.
func (r *Registry) GetStep(stepType string) (StepDescriptor, StepHandler, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	entry, ok := r.steps[stepType]
	return entry.desc, entry.handler, ok
}

// HasStep reports whether stepType is registered.
func (r *Registry) HasStep(stepType string) bool {
	r.mu.RLock()
	defer r.mu.RUnlock()
	_, ok := r.steps[stepType]
	return ok
}

// RegisterLoader registers a strongly-typed read-only DataLoader,
// deriving omitted ParamsSchema and OutputSchema from P and R via JSON Schema generation.
func (r *Registry) RegisterLoader[P, R any](
	desc LoaderDescriptor,
	fn func(ctx context.Context, spaceID string, params P) (R, error),
) {
	if desc.ParamsSchema == nil {
		desc.ParamsSchema = SchemaFor[P]()
	}
	if desc.OutputSchema == nil {
		desc.OutputSchema = SchemaFor[R]()
	}
	loader := DataLoaderFunc(func(ctx context.Context, spaceID string, params map[string]any) (any, error) {
		typedParams, err := decodeTypedInputs[P](params)
		if err != nil {
			return nil, err
		}
		out, err := fn(ctx, spaceID, typedParams)
		if err != nil {
			return nil, err
		}
		return normalizeOutputForCEL(out)
	})
	r.mu.Lock()
	defer r.mu.Unlock()
	r.loaders[desc.Name] = registeredLoader{desc: desc, loader: loader}
}

// GetLoader retrieves a registered DataLoader by name.
func (r *Registry) GetLoader(name string) (LoaderDescriptor, DataLoader, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	entry, ok := r.loaders[name]
	return entry.desc, entry.loader, ok
}

// HasLoader reports whether a DataLoader is registered.
func (r *Registry) HasLoader(name string) bool {
	r.mu.RLock()
	defer r.mu.RUnlock()
	_, ok := r.loaders[name]
	return ok
}

// RegisterSystemFlow registers a built-in system flow blueprint.
func (r *Registry) RegisterSystemFlow(bp SystemFlowBlueprint) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.systemFlows[bp.SystemKey] = bp
}

// GetSystemFlow retrieves a registered system flow blueprint by key.
func (r *Registry) GetSystemFlow(systemKey string) (SystemFlowBlueprint, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	bp, ok := r.systemFlows[systemKey]
	return bp, ok
}

// ListSystemFlows returns all registered system flow blueprints sorted by key.
func (r *Registry) ListSystemFlows() []SystemFlowBlueprint {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := make([]SystemFlowBlueprint, 0, len(r.systemFlows))
	for _, bp := range r.systemFlows {
		out = append(out, bp)
	}
	slices.SortFunc(out, func(a, b SystemFlowBlueprint) int {
		return cmp.Compare(a.SystemKey, b.SystemKey)
	})
	return out
}

// RegisterTriggerTopic registers a domain event trigger topic descriptor.
func (r *Registry) RegisterTriggerTopic(desc TriggerTopicDescriptor) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.triggerTopics[desc.Topic] = desc
}

// GetTriggerTopic retrieves a registered trigger topic descriptor by topic name.
func (r *Registry) GetTriggerTopic(topic string) (TriggerTopicDescriptor, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	desc, ok := r.triggerTopics[topic]
	return desc, ok
}

// RegisterArtifactReader registers an ArtifactReader for its URI scheme.
func (r *Registry) RegisterArtifactReader(reader ArtifactReader) {
	if reader == nil {
		return
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	r.artifactReaders[reader.Scheme()] = reader
}

// GetArtifactReader looks up an ArtifactReader by URI scheme.
func (r *Registry) GetArtifactReader(scheme string) (ArtifactReader, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	reader, ok := r.artifactReaders[scheme]
	return reader, ok
}

// Catalog returns a deterministically sorted snapshot of all registered topics, steps, loaders, and CEL helpers.
func (r *Registry) Catalog() Catalog {
	r.mu.RLock()
	defer r.mu.RUnlock()

	topics := make([]TriggerTopicDescriptor, 0, len(r.triggerTopics))
	for _, t := range r.triggerTopics {
		topics = append(topics, t)
	}
	slices.SortFunc(topics, func(a, b TriggerTopicDescriptor) int {
		return cmp.Compare(a.Topic, b.Topic)
	})

	steps := make([]StepDescriptor, 0, len(r.steps))
	for _, s := range r.steps {
		steps = append(steps, s.desc)
	}
	slices.SortFunc(steps, func(a, b StepDescriptor) int {
		return cmp.Compare(a.Type, b.Type)
	})

	loaders := make([]LoaderDescriptor, 0, len(r.loaders))
	for _, l := range r.loaders {
		loaders = append(loaders, l.desc)
	}
	slices.SortFunc(loaders, func(a, b LoaderDescriptor) int {
		return cmp.Compare(a.Name, b.Name)
	})

	return Catalog{
		TriggerTopics: topics,
		Steps:         steps,
		Loaders:       loaders,
		CelHelpers:    BuiltinCelHelpers(),
	}
}

// BuiltinCelHelpers returns documentation metadata for all Saturn CEL helper functions.
func BuiltinCelHelpers() []CelHelperDescriptor {
	return []CelHelperDescriptor{
		{
			Name:        "toCents",
			Signature:   "toCents(number) -> int",
			Description: "Converts a decimal currency amount into rounded minor units (cents).",
			Example:     "toCents(steps.extract_tx.amount)",
		},
		{
			Name:        "fromCents",
			Signature:   "fromCents(int) -> double",
			Description: "Converts integer cents into a decimal currency number.",
			Example:     "fromCents(input.amount_cents)",
		},
		{
			Name:        "formatMoney",
			Signature:   "formatMoney(cents: int, currency: string) -> string",
			Description: "Formats cents and ISO currency code into a display string.",
			Example:     `formatMoney(input.amount, input.currency)`,
		},
		{
			Name:        "inSpaceTz",
			Signature:   "inSpaceTz(tsOrDate) -> timestamp",
			Description: "Parses an RFC3339 timestamp or YYYY-MM-DD date in the workspace timezone.",
			Example:     "inSpaceTz(trigger.data.due_date)",
		},
		{
			Name:        "localTime",
			Signature:   "localTime(dateOrTs, hhmm: string) -> string",
			Description: "Combines a date or timestamp with HH:MM in the workspace timezone and returns RFC3339.",
			Example:     `localTime(trigger.data.due_date, "09:00")`,
		},
		{
			Name:        "addDays",
			Signature:   "addDays(dateOrTs, days: int) -> string",
			Description: "Adds signed days to a YYYY-MM-DD date or RFC3339 timestamp.",
			Example:     "addDays(trigger.data.due_date, 1)",
		},
		{
			Name:        "toJSON",
			Signature:   "toJSON(any) -> string",
			Description: "Serializes any value to deterministic JSON.",
			Example:     "toJSON(steps.extract_tx)",
		},
		{
			Name:        "coalesce",
			Signature:   "coalesce(a, b, ...) -> any",
			Description: "Returns the first non-null argument.",
			Example:     "coalesce(steps.resolve.account_id, input.account_id)",
		},
	}
}
