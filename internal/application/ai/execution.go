package aiapp

import (
	"context"
	"strings"

	"github.com/masterkeysrd/saturn/internal/platform/ai"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

// ExecuteAgent executes a workspace AI agent headlessly via the AI Runtime.
func (c *coordinator) ExecuteAgent(ctx context.Context, req *ExecuteAgentRequest) (*ai.Run, error) {
	const op errors.Op = "application/ai.ExecuteAgent"

	spaceID, err := requireMemberWrite(ctx, op)
	if err != nil {
		return nil, err
	}
	if req == nil || strings.TrimSpace(req.ID) == "" {
		return nil, errors.E(op, errors.Invalid, "agent id is required")
	}

	agent, err := c.resolveAgentForSpace(ctx, spaceID, req.ID)
	if err != nil {
		return nil, errors.E(op, err)
	}

	source := req.Source
	if source == "" {
		source = ai.RunSourceAPI
	}

	run, err := c.runtime.RunAgent(ctx, ai.RunAgentRequest{
		SpaceID:      spaceID,
		AgentID:      agent.ID,
		Source:       source,
		Prompt:       req.Prompt,
		Input:        req.Input,
		ModelID:      req.ModelID,
		OutputSchema: req.OutputSchema,
	})
	if err != nil {
		return nil, errors.E(op, err)
	}
	return run, nil
}

// Generate executes a single-turn blocking generation via the AI Runtime.
func (c *coordinator) Generate(ctx context.Context, req *GenerateRequest) (*ai.Run, error) {
	const op errors.Op = "application/ai.Generate"

	spaceID, err := requireMemberWrite(ctx, op)
	if err != nil {
		return nil, err
	}
	if req == nil {
		return nil, errors.E(op, errors.Invalid, "generate request is required")
	}

	source := req.Source
	if source == "" {
		source = ai.RunSourceAPI
	}

	run, err := c.runtime.Generate(ctx, ai.GenerateRequest{
		SpaceID:           spaceID,
		Source:            source,
		Prompt:            req.Prompt,
		SystemInstruction: req.SystemInstruction,
		ModelID:           req.ModelID,
		Role:              req.Role,
		Generation:        req.Generation,
		OutputSchema:      req.OutputSchema,
		Attachments:       req.Attachments,
	})
	if err != nil {
		return nil, errors.E(op, err)
	}
	return run, nil
}
