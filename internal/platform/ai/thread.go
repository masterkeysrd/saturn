package ai

import (
	"encoding/json/v2"
	"fmt"
	"strings"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/patch"
)

// ThreadStatus represents the runtime execution state of a chat thread.
type ThreadStatus string

const (
	ThreadIdle             ThreadStatus = "idle"
	ThreadStreaming        ThreadStatus = "streaming"
	ThreadAwaitingApproval ThreadStatus = "awaiting_approval"
)

// MessageRole identifies the author role of a ThreadMessage.
type MessageRole string

const (
	RoleUser      MessageRole = "user"
	RoleAssistant MessageRole = "assistant"
	RoleTool      MessageRole = "tool"
)

// ContentBlockType identifies the variant of a ContentBlock.
type ContentBlockType string

const (
	BlockText       ContentBlockType = "text"
	BlockThinking   ContentBlockType = "thinking"
	BlockToolCall   ContentBlockType = "tool_call"
	BlockToolResult ContentBlockType = "tool_result"
	BlockAttachment ContentBlockType = "attachment"
)

// PendingToolApproval describes a mutating MCP tool call paused awaiting user confirmation.
type PendingToolApproval struct {
	ToolCallID      string         `json:"tool_call_id"`
	MCPServerID     string         `json:"mcp_server_id"`
	MCPServerName   string         `json:"mcp_server_name"`
	ToolName        string         `json:"tool_name"`
	Arguments       map[string]any `json:"arguments,omitempty"`
	DestructiveHint bool           `json:"destructive_hint"`
}

// ThreadMemory stores rolling summarized history for long threads.
type ThreadMemory struct {
	Summary string `json:"summary,omitempty"`
	UpToSeq int32  `json:"up_to_seq,omitempty"`
}

// ThreadConfig holds per-thread overrides.
type ThreadConfig struct {
	ApprovalPolicy *ApprovalPolicy  `json:"approval_policy,omitempty"`
	Generation     GenerationConfig `json:"generation,omitzero"`
}

// ThreadState holds runtime state persisted on a Thread.
type ThreadState struct {
	ActiveRunID      *string               `json:"active_run_id,omitempty"`
	PendingApprovals []PendingToolApproval `json:"pending_approvals,omitempty"`
	Memory           ThreadMemory          `json:"memory,omitzero"`
}

// Thread represents a private multi-turn chat thread (`platform.ai_threads`).
type Thread struct {
	ID            string
	SpaceID       string
	UserID        string
	AgentID       *string
	ModelID       *string
	Title         string
	Status        ThreadStatus
	Config        ThreadConfig
	State         ThreadState
	MessageCount  int32
	IsPinned      bool
	IsArchived    bool
	LastMessageAt time.Time
	CreateTime    time.Time
	UpdateTime    time.Time
}

// ListThreadsFilter filters private threads belonging to (SpaceID, UserID).
type ListThreadsFilter struct {
	SpaceID    string
	UserID     string
	IsArchived *bool
	PageSize   int32
	PageToken  string
}

// Validate checks Thread invariants and normalizes fields.
func (t *Thread) Validate() error {
	if t == nil {
		return errors.E(errors.Invalid, "thread payload is required")
	}
	if strings.TrimSpace(t.SpaceID) == "" {
		return errors.E(errors.Invalid, "space_id is required")
	}
	if strings.TrimSpace(t.UserID) == "" {
		return errors.E(errors.Invalid, "user_id is required")
	}
	t.Title = strings.TrimSpace(t.Title)
	if t.Title == "" {
		t.Title = "New Chat"
	}
	t.Title = clipRunes(t.Title, 255)
	if t.Status == "" {
		t.Status = ThreadIdle
	}
	if t.Config.ApprovalPolicy != nil && !t.Config.ApprovalPolicy.IsValid() {
		return errors.E(errors.Invalid, "unsupported approval_policy: "+string(*t.Config.ApprovalPolicy))
	}
	return t.Config.Generation.Validate()
}

// ThreadPatchSchema defines patchable fields for Thread.
var ThreadPatchSchema = patch.NewSchema[Thread]().
	Field("title", func(t *Thread) *string { return &t.Title }).
	Field("agent_id", func(t *Thread) **string { return &t.AgentID }).
	Field("model_id", func(t *Thread) **string { return &t.ModelID }).
	Field("is_pinned", func(t *Thread) *bool { return &t.IsPinned }).
	Field("is_archived", func(t *Thread) *bool { return &t.IsArchived }).
	Field("config", func(t *Thread) *ThreadConfig { return &t.Config }).
	Field("config.approval_policy", func(t *Thread) **ApprovalPolicy { return &t.Config.ApprovalPolicy }).
	Field("config.generation", func(t *Thread) *GenerationConfig { return &t.Config.Generation }).
	Field("config.generation.temperature", func(t *Thread) **float64 { return &t.Config.Generation.Temperature }).
	Field("config.generation.max_tokens", func(t *Thread) **int32 { return &t.Config.Generation.MaxTokens }).
	Field("config.generation.top_p", func(t *Thread) **float64 { return &t.Config.Generation.TopP }).
	Field("config.generation.thinking", func(t *Thread) *ThinkingConfig { return &t.Config.Generation.Thinking }).
	Field("config.generation.thinking.enabled", func(t *Thread) *bool { return &t.Config.Generation.Thinking.Enabled }).
	Field("config.generation.thinking.effort", func(t *Thread) **string { return &t.Config.Generation.Thinking.Effort }).
	Field("config.generation.thinking.budget_tokens", func(t *Thread) **int32 { return &t.Config.Generation.Thinking.BudgetTokens })

// ApplyPatch applies partial updates from incoming according to mask.
func (t *Thread) ApplyPatch(incoming *Thread, mask []string) error {
	if incoming == nil {
		return errors.E(errors.Invalid, "thread payload is required")
	}
	if err := ThreadPatchSchema.Apply(t, incoming, mask); err != nil {
		return errors.E(errors.Invalid, err)
	}
	t.UpdateTime = time.Now().UTC()
	return t.Validate()
}

// AttachmentSummary persists lightweight attachment metadata without raw binary bytes.
type AttachmentSummary struct {
	Filename      string  `json:"filename"`
	ContentType   string  `json:"content_type"`
	SizeBytes     int64   `json:"size_bytes"`
	ExtractedText *string `json:"extracted_text,omitempty"`
}

// ContentBlock represents a typed block within a ThreadMessage.
type ContentBlock struct {
	Type        ContentBlockType   `json:"type"`
	Text        *string            `json:"text,omitempty"`
	ToolCallID  *string            `json:"tool_call_id,omitempty"`
	MCPServerID *string            `json:"mcp_server_id,omitempty"`
	ToolName    *string            `json:"tool_name,omitempty"`
	Arguments   map[string]any     `json:"arguments,omitempty"`
	Result      map[string]any     `json:"result,omitempty"`
	IsError     *bool              `json:"is_error,omitempty"`
	Attachment  *AttachmentSummary `json:"attachment,omitempty"`
}

// MarshalContentBlocks serializes ContentBlock slices to JSONB deterministically via encoding/json/v2.
func MarshalContentBlocks(blocks []ContentBlock) ([]byte, error) {
	if blocks == nil {
		blocks = []ContentBlock{}
	}
	data, err := json.Marshal(blocks, json.Deterministic(true))
	if err != nil {
		return nil, fmt.Errorf("marshal content blocks: %w", err)
	}
	return data, nil
}

// UnmarshalContentBlocks deserializes ContentBlock slices losslessly from JSONB via encoding/json/v2.
func UnmarshalContentBlocks(data []byte) ([]ContentBlock, error) {
	if len(data) == 0 {
		return []ContentBlock{}, nil
	}
	var blocks []ContentBlock
	if err := json.Unmarshal(data, &blocks); err != nil {
		return nil, fmt.Errorf("unmarshal content blocks: %w", err)
	}
	if blocks == nil {
		blocks = []ContentBlock{}
	}
	return blocks, nil
}

// MessageMetadata captures model attribution and token usage on a ThreadMessage.
type MessageMetadata struct {
	ModelName *string     `json:"model_name,omitempty"`
	Tokens    *TokenUsage `json:"tokens,omitempty"`
}

// ThreadMessage represents a persisted turn message in a chat thread (`platform.ai_messages`).
type ThreadMessage struct {
	ID         string
	ThreadID   string
	SpaceID    string
	RunID      *string
	Seq        int32
	Role       MessageRole
	Blocks     []ContentBlock
	Metadata   MessageMetadata
	CreateTime time.Time
}

// ListMessagesFilter paginates messages within a private thread.
type ListMessagesFilter struct {
	SpaceID   string
	UserID    string
	ThreadID  string
	PageSize  int32
	PageToken string
}

// TurnAttachment carries an ephemeral inline upload for a single turn or Generate call.
type TurnAttachment struct {
	Filename    string
	ContentType string
	Data        []byte
}

// ToolApprovalDecision records the user's approve/reject choice for a pending tool call.
type ToolApprovalDecision struct {
	ToolCallID string
	Approved   bool
}

// StreamEventType identifies events emitted by streaming thread execution.
type StreamEventType string

const (
	EventRunStarted           StreamEventType = "run.started"
	EventThinkingDelta        StreamEventType = "thinking.delta"
	EventMessageDelta         StreamEventType = "message.delta"
	EventToolCallStarted      StreamEventType = "tool.call.started"
	EventToolCallCompleted    StreamEventType = "tool.call.completed"
	EventToolApprovalRequired StreamEventType = "tool.approval.required"
	EventMessageCompleted     StreamEventType = "message.completed"
	EventThreadUpdated        StreamEventType = "thread.updated"
	EventRunCompleted         StreamEventType = "run.completed"
	EventRunError             StreamEventType = "run.error"
)

// ThreadStreamEvent represents a real-time event pushed during a streaming thread turn.
type ThreadStreamEvent struct {
	Type        StreamEventType       `json:"type"`
	ThreadID    *string               `json:"thread_id,omitempty"`
	RunID       *string               `json:"run_id,omitempty"`
	MessageID   *string               `json:"message_id,omitempty"`
	Delta       *string               `json:"delta,omitempty"`
	ToolCallID  *string               `json:"tool_call_id,omitempty"`
	ToolName    *string               `json:"tool_name,omitempty"`
	MCPServerID *string               `json:"mcp_server_id,omitempty"`
	Arguments   map[string]any        `json:"arguments,omitempty"`
	Result      map[string]any        `json:"result,omitempty"`
	IsError     *bool                 `json:"is_error,omitempty"`
	Approvals   []PendingToolApproval `json:"approvals,omitempty"`
	Message     *ThreadMessage        `json:"message,omitempty"`
	Thread      *Thread               `json:"thread,omitempty"`
	Run         *Run                  `json:"run,omitempty"`
	Error       *ErrorDetail          `json:"error,omitempty"`
}
