package workflow

import (
	"context"
	"strings"
)

// Core built-in platform step types.
const (
	StepLLMGenerate         = "llm.generate"
	StepAIAgentRun          = "ai.agent_run"
	StepFilter              = "filter"
	StepSwitch              = "switch"
	StepForEach             = "for_each"
	StepTransform           = "transform"
	StepOutput              = "output"
	StepStop                = "stop"
	StepDocumentExtractText = "document.extract_text"
)

// Error policy constants for StepNode.OnError.
const (
	OnErrorFail     = "fail"
	OnErrorContinue = "continue"
)

// SourceBinding declares a read-only DataLoader dependency evaluated before step execution.
type SourceBinding struct {
	Loader   string         `json:"loader"`
	Params   map[string]any `json:"params,omitempty"`
	Required bool           `json:"required,omitempty"`
}

// SwitchCase defines a conditional branch inside a `switch` step.
type SwitchCase struct {
	Name      string     `json:"name"`
	Condition string     `json:"condition"`
	Steps     []StepNode `json:"steps,omitempty"`
}

// StepNode defines a step in a flat-first workflow sequence or nested control branch.
type StepNode struct {
	ID      string                   `json:"id"`
	Name    *string                  `json:"name,omitempty"`
	Type    string                   `json:"type"`
	OnError string                   `json:"on_error,omitempty"`
	Model   *ModelConfig             `json:"model,omitempty"`
	Sources map[string]SourceBinding `json:"sources,omitempty"`
	Inputs  map[string]any           `json:"inputs,omitempty"`
	Cases   []SwitchCase             `json:"cases,omitempty"`
	Default []StepNode               `json:"default,omitempty"`
	Steps   []StepNode               `json:"steps,omitempty"`
}

// EffectiveOnError returns the normalized step error policy, defaulting to "fail".
func (s StepNode) EffectiveOnError() string {
	switch strings.ToLower(strings.TrimSpace(s.OnError)) {
	case OnErrorContinue:
		return OnErrorContinue
	default:
		return OnErrorFail
	}
}

// ArtifactRef points to a binary artifact stored inline/ephemerally or inside a domain store.
type ArtifactRef struct {
	Ref         string `json:"ref"`
	Filename    string `json:"filename,omitempty"`
	ContentType string `json:"content_type,omitempty"`
	Size        int64  `json:"size,omitempty"`
}

// ResolvedArtifact holds loaded bytes for an ArtifactRef.
type ResolvedArtifact struct {
	Ref         string
	Filename    string
	ContentType string
	Data        []byte
}

// ArtifactReader resolves binary payloads for URI schemes such as `ephemeral://` or `mail://`.
// @Mock
type ArtifactReader interface {
	Scheme() string
	Read(ctx context.Context, spaceID string, ref string) (ResolvedArtifact, error)
}
