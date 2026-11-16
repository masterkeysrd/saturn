package ai

import (
	"slices"
	"testing"

	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

func TestThread_ValidateAndApplyPatch(t *testing.T) {
	th := &Thread{
		ID:      "thr_1",
		SpaceID: "spc_1",
		UserID:  "usr_1",
	}
	if err := th.Validate(); err != nil {
		t.Fatalf("Validate failed: %v", err)
	}
	if th.Title != "New Chat" || th.Status != ThreadIdle {
		t.Errorf("unexpected defaults: title=%q status=%q", th.Title, th.Status)
	}

	err := th.ApplyPatch(&Thread{
		Title:    "April Budget Review",
		IsPinned: true,
		Config: ThreadConfig{
			ApprovalPolicy: new(ApprovalAuto),
			Generation:     GenerationConfig{Temperature: new(0.3)},
		},
	}, []string{"title", "is_pinned", "config.approval_policy", "config.generation.temperature"})
	if err != nil {
		t.Fatalf("ApplyPatch failed: %v", err)
	}
	if th.Title != "April Budget Review" || !th.IsPinned || *th.Config.ApprovalPolicy != ApprovalAuto || *th.Config.Generation.Temperature != 0.3 {
		t.Errorf("unexpected thread after patch: %+v", th)
	}

	bad := &Thread{SpaceID: "", UserID: "usr_1"}
	if err := bad.Validate(); !errors.Is(err, errors.Invalid) {
		t.Errorf("expected Invalid error for missing space_id, got %v", err)
	}
}

func TestContentBlocks_LosslessJSONB(t *testing.T) {
	blocks := []ContentBlock{
		{
			Type: BlockThinking,
			Text: new("Let me check your accounts."),
		},
		{
			Type:        BlockToolCall,
			ToolCallID:  new("tc_1"),
			MCPServerID: new("mcp_saturn"),
			ToolName:    new("finance_list_accounts"),
			Arguments:   map[string]any{"active_only": true, "limit": float64(20)},
		},
		{
			Type:        BlockToolResult,
			ToolCallID:  new("tc_1"),
			MCPServerID: new("mcp_saturn"),
			ToolName:    new("finance_list_accounts"),
			Result:      map[string]any{"count": float64(2)},
			IsError:     new(false),
		},
		{
			Type: BlockAttachment,
			Attachment: &AttachmentSummary{
				Filename:      "statement.pdf",
				ContentType:   "application/pdf",
				SizeBytes:     2048,
				ExtractedText: new("Statement summary"),
			},
		},
		{
			Type: BlockText,
			Text: new("You have 2 active accounts."),
		},
	}

	encoded, err := MarshalContentBlocks(blocks)
	if err != nil {
		t.Fatalf("MarshalContentBlocks failed: %v", err)
	}

	decoded, err := UnmarshalContentBlocks(encoded)
	if err != nil {
		t.Fatalf("UnmarshalContentBlocks failed: %v", err)
	}
	if len(decoded) != len(blocks) {
		t.Fatalf("decoded len = %d, want %d", len(decoded), len(blocks))
	}
	if *decoded[1].ToolCallID != "tc_1" || decoded[1].Arguments["active_only"] != true {
		t.Errorf("tool_call block not preserved: %+v", decoded[1])
	}
	if *decoded[2].IsError || decoded[2].Result["count"] != float64(2) {
		t.Errorf("tool_result block not preserved: %+v", decoded[2])
	}
	if decoded[3].Attachment == nil || decoded[3].Attachment.Filename != "statement.pdf" || *decoded[3].Attachment.ExtractedText != "Statement summary" {
		t.Errorf("attachment block not preserved: %+v", decoded[3])
	}
	if !slices.Equal([]ContentBlockType{decoded[0].Type, decoded[4].Type}, []ContentBlockType{BlockThinking, BlockText}) {
		t.Errorf("unexpected block types: %+v", decoded)
	}
}
