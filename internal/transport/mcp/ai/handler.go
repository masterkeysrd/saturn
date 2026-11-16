package mcpai

//go:generate go run github.com/masterkeysrd/saturn/tools/mockgen .

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"strings"

	aiaggregator "github.com/masterkeysrd/saturn/internal/aggregator/ai"
	aiapp "github.com/masterkeysrd/saturn/internal/application/ai"
	"github.com/masterkeysrd/saturn/internal/domain/identity"
	"github.com/masterkeysrd/saturn/internal/platform/ai"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	mcptransport "github.com/masterkeysrd/saturn/internal/transport/mcp"
)

// AgentAggregator defines read-only workspace agent listing for external MCP tool exposure.
// @Mock
type AgentAggregator interface {
	ListAgents(ctx context.Context) ([]*aiaggregator.AgentView, error)
}

// AgentCoordinator defines agent execution and lazy system seeding operations.
// @Mock
type AgentCoordinator interface {
	EnsureSystemMCPAndAssistant(ctx context.Context) error
	ExecuteAgent(ctx context.Context, req *aiapp.ExecuteAgentRequest) (*ai.Run, error)
}

// Dependencies groups collaborators required by the AI MCP handler.
type Dependencies struct {
	Aggregator  AgentAggregator
	Coordinator AgentCoordinator
}

// Handler exposes enabled workspace AI agents as external-only `agent__<slug>` MCP tools.
type Handler struct {
	agg   AgentAggregator
	coord AgentCoordinator
}

// NewHandler constructs a new AI MCP Handler.
func NewHandler(deps Dependencies) *Handler {
	return &Handler{
		agg:   deps.Aggregator,
		coord: deps.Coordinator,
	}
}

// Register registers the dynamic external-only `agent__<slug>` provider onto the MCP registry.
func (h *Handler) Register(reg *mcptransport.Registry) {
	reg.RegisterDynamicProvider(h.registerExternalAgents)
}

// ExecuteAgentInput defines parameters accepted by external `agent__<slug>` MCP tools.
type ExecuteAgentInput struct {
	Prompt string         `json:"prompt" jsonschema:"Prompt instruction passed to the agent"`
	Input  map[string]any `json:"input,omitempty" jsonschema:"Optional JSON context object serialized into the agent prompt"`
}

// ExecuteAgentOutput summarizes the completed headless agent run.
type ExecuteAgentOutput struct {
	RunID  string         `json:"run_id"`
	Status string         `json:"status"`
	Text   string         `json:"text,omitempty"`
	Data   map[string]any `json:"data,omitempty"`
	Error  string         `json:"error,omitempty"`
}

func (h *Handler) registerExternalAgents(ctx context.Context, binder *mcptransport.DynamicToolBinder) {
	if _, err := mcptransport.RequireSpaceID(ctx); err != nil {
		return
	}

	if err := h.coord.EnsureSystemMCPAndAssistant(ctx); err != nil {
		return
	}

	agents, err := h.agg.ListAgents(ctx)
	if err != nil {
		return
	}

	for _, av := range agents {
		if av == nil || av.Agent == nil || !av.IsEnabled {
			continue
		}
		agentID := av.ID
		agentName := av.Name
		desc := strings.TrimSpace(av.Description)
		if desc == "" {
			desc = fmt.Sprintf("Execute workspace AI agent %q (%s).", agentName, av.Slug)
		}
		toolName := FormatAgentToolName(av.Slug)

		binder.RegisterTool(mcptransport.ToolSpec{
			Name:          toolName,
			Domain:        "ai",
			Title:         agentName,
			Description:   desc,
			RequiredScope: identity.ScopeAIExecute,
			ReadOnly:      false,
			Destructive:   false,
			ExternalOnly:  true,
		}, func(callCtx context.Context, in ExecuteAgentInput) (ExecuteAgentOutput, error) {
			if strings.TrimSpace(in.Prompt) == "" && len(in.Input) == 0 {
				return ExecuteAgentOutput{}, errors.E(errors.Invalid, "prompt or input is required")
			}

			run, execErr := h.coord.ExecuteAgent(callCtx, &aiapp.ExecuteAgentRequest{
				ID:     agentID,
				Source: ai.RunSourceMCP,
				Prompt: in.Prompt,
				Input:  in.Input,
			})
			if execErr != nil {
				return ExecuteAgentOutput{}, execErr
			}

			out := ExecuteAgentOutput{
				RunID:  run.ID,
				Status: string(run.Status),
			}
			if run.Output != nil {
				if run.Output.Text != nil {
					out.Text = *run.Output.Text
				}
				out.Data = run.Output.Data
			}
			if run.Error != nil {
				out.Error = run.Error.Message
			}
			return out, nil
		})
	}
}

// FormatAgentToolName formats an agent slug as `agent__<slug>` bounded to 64 characters.
func FormatAgentToolName(slug string) string {
	clean := strings.TrimSpace(strings.ToLower(slug))
	var b strings.Builder
	b.Grow(len(clean))
	for _, r := range clean {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '_' || r == '-' {
			b.WriteRune(r)
		} else {
			b.WriteByte('_')
		}
	}
	part := b.String()
	if part == "" {
		part = "agent"
	}
	full := "agent__" + part
	if len(full) <= 64 {
		return full
	}
	sum := sha256.Sum256([]byte(slug))
	suffix := "_" + hex.EncodeToString(sum[:3])
	return full[:64-len(suffix)] + suffix
}
