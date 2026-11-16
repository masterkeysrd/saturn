package aiapp

import (
	"context"
	"strings"

	"github.com/masterkeysrd/saturn/internal/platform/ai"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

// CreateThread creates a private multi-turn chat thread owned by the authenticated caller,
// lazily seeding system AI defaults if needed.
func (c *coordinator) CreateThread(ctx context.Context, req *CreateThreadRequest) (*ai.Thread, error) {
	const op errors.Op = "application/ai.CreateThread"

	spaceID, userID, err := requireUserAndSpace(ctx, op)
	if err != nil {
		return nil, err
	}
	if req == nil {
		req = &CreateThreadRequest{}
	}

	_, assistant, err := c.ensureSystemRecords(ctx, spaceID)
	if err != nil {
		return nil, errors.E(op, err)
	}

	agentID := new(assistant.ID)
	if req.AgentID != nil && strings.TrimSpace(*req.AgentID) != "" {
		resolved, err := c.resolveAgentForSpace(ctx, spaceID, strings.TrimSpace(*req.AgentID))
		if err != nil {
			return nil, errors.E(op, err)
		}
		agentID = new(resolved.ID)
	}

	var modelID *string
	if req.ModelID != nil && strings.TrimSpace(*req.ModelID) != "" {
		m, err := c.store.Models().Get(ctx, spaceID, strings.TrimSpace(*req.ModelID))
		if err != nil {
			return nil, errors.E(op, err)
		}
		modelID = new(m.ID)
	}

	th := &ai.Thread{
		SpaceID: spaceID,
		UserID:  userID,
		AgentID: agentID,
		ModelID: modelID,
		Title:   req.Title,
		Status:  ai.ThreadIdle,
		Config:  req.Config,
	}
	if err := th.Validate(); err != nil {
		return nil, errors.E(op, err)
	}

	if err := c.store.Threads().Create(ctx, th); err != nil {
		return nil, errors.E(op, err)
	}
	return th, nil
}

// UpdateThread applies masked updates to a private chat thread owned by the caller.
func (c *coordinator) UpdateThread(ctx context.Context, req *UpdateThreadRequest) (*ai.Thread, error) {
	const op errors.Op = "application/ai.UpdateThread"

	spaceID, userID, err := requireUserAndSpace(ctx, op)
	if err != nil {
		return nil, err
	}
	if req == nil || strings.TrimSpace(req.ID) == "" || req.Thread == nil {
		return nil, errors.E(op, errors.Invalid, "thread id and payload are required")
	}

	existing, err := c.store.Threads().Get(ctx, spaceID, userID, req.ID)
	if err != nil {
		return nil, errors.E(op, err)
	}

	if err := existing.ApplyPatch(req.Thread, req.UpdateMask); err != nil {
		return nil, errors.E(op, err)
	}

	if existing.AgentID != nil && strings.TrimSpace(*existing.AgentID) != "" {
		resolved, err := c.resolveAgentForSpace(ctx, spaceID, strings.TrimSpace(*existing.AgentID))
		if err != nil {
			return nil, errors.E(op, err)
		}
		existing.AgentID = new(resolved.ID)
	}
	if existing.ModelID != nil && strings.TrimSpace(*existing.ModelID) != "" {
		m, err := c.store.Models().Get(ctx, spaceID, strings.TrimSpace(*existing.ModelID))
		if err != nil {
			return nil, errors.E(op, err)
		}
		existing.ModelID = new(m.ID)
	}

	if err := c.store.Threads().Update(ctx, existing); err != nil {
		return nil, errors.E(op, err)
	}
	return existing, nil
}

// DeleteThread deletes a private chat thread owned by the authenticated caller.
func (c *coordinator) DeleteThread(ctx context.Context, id string) error {
	const op errors.Op = "application/ai.DeleteThread"

	spaceID, userID, err := requireUserAndSpace(ctx, op)
	if err != nil {
		return err
	}
	if strings.TrimSpace(id) == "" {
		return errors.E(op, errors.Invalid, "thread id is required")
	}

	if err := c.store.Threads().Delete(ctx, spaceID, userID, id); err != nil {
		return errors.E(op, err)
	}
	return nil
}

// CancelThreadTurn cancels an active streaming turn on a private thread owned by the caller.
func (c *coordinator) CancelThreadTurn(ctx context.Context, id string) (*ai.Thread, error) {
	const op errors.Op = "application/ai.CancelThreadTurn"

	spaceID, userID, err := requireUserAndSpace(ctx, op)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(id) == "" {
		return nil, errors.E(op, errors.Invalid, "thread id is required")
	}

	th, err := c.threadRuntime.CancelTurn(ctx, spaceID, userID, id)
	if err != nil {
		return nil, errors.E(op, err)
	}
	return th, nil
}

// StreamThreadTurn executes a streaming conversational turn on a private thread owned by the caller.
// Deliberately NOT @transactional so long-lived SSE/gRPC streams do not hold DB transactions open.
func (c *coordinator) StreamThreadTurn(ctx context.Context, req *StreamThreadTurnRequest, emit ai.StreamEventEmitter) error {
	const op errors.Op = "application/ai.StreamThreadTurn"

	spaceID, userID, err := requireUserAndSpace(ctx, op)
	if err != nil {
		return err
	}
	if req == nil || strings.TrimSpace(req.ThreadID) == "" {
		return errors.E(op, errors.Invalid, "thread_id is required")
	}

	if _, _, err := c.ensureSystemRecords(ctx, spaceID); err != nil {
		return errors.E(op, err)
	}

	err = c.threadRuntime.StreamTurn(ctx, ai.StreamTurnRequest{
		SpaceID:     spaceID,
		UserID:      userID,
		ThreadID:    req.ThreadID,
		Content:     req.Content,
		Attachments: req.Attachments,
		AgentID:     req.AgentID,
		ModelID:     req.ModelID,
		ContextHint: req.ContextHint,
	}, emit)
	if err != nil {
		return errors.E(op, err)
	}
	return nil
}

// ResolveToolApprovals resolves paused write-tool approvals on a private thread and resumes streaming.
// Deliberately NOT @transactional so long-lived SSE/gRPC streams do not hold DB transactions open.
func (c *coordinator) ResolveToolApprovals(ctx context.Context, req *ResolveToolApprovalsRequest, emit ai.StreamEventEmitter) error {
	const op errors.Op = "application/ai.ResolveToolApprovals"

	spaceID, userID, err := requireUserAndSpace(ctx, op)
	if err != nil {
		return err
	}
	if req == nil || strings.TrimSpace(req.ThreadID) == "" {
		return errors.E(op, errors.Invalid, "thread_id is required")
	}

	err = c.threadRuntime.ResolveApprovals(ctx, ai.ResolveApprovalsRequest{
		SpaceID:   spaceID,
		UserID:    userID,
		ThreadID:  req.ThreadID,
		Decisions: req.Decisions,
	}, emit)
	if err != nil {
		return errors.E(op, err)
	}
	return nil
}
