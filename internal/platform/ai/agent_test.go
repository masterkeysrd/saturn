package ai

import (
	"testing"

	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

func TestAgent_ValidateEnsureDeletableAndPatch(t *testing.T) {
	sys := &Agent{
		ID:        "agt_sys",
		SystemKey: new(SystemSaturnAssistantKey),
		IsSystem:  true,
		Slug:      "saturn-assistant",
		Name:      "Saturn Assistant",
	}
	if err := sys.EnsureDeletable(); !errors.Is(err, errors.Permission) || errors.CodeOf(err) != CodeAgentProtected {
		t.Fatalf("expected CodeAgentProtected, got %v", err)
	}
	if err := sys.ApplyPatch(&Agent{Slug: "custom"}, []string{"slug"}); !errors.Is(err, errors.Permission) {
		t.Fatalf("expected permission error mutating system agent slug, got %v", err)
	}

	agent := &Agent{
		ID:   "agt_1",
		Slug: "analyst",
		Name: "Budget Analyst",
	}
	if err := agent.EnsureDeletable(); err != nil {
		t.Fatalf("expected non-system agent deletable, got %v", err)
	}
	if err := agent.Validate(); err != nil {
		t.Fatalf("Validate failed: %v", err)
	}
	if agent.Config.Execution.TimeoutSeconds != DefaultExecutionTimeoutSeconds {
		t.Errorf("expected default timeout_seconds %d, got %d", DefaultExecutionTimeoutSeconds, agent.Config.Execution.TimeoutSeconds)
	}

	err := agent.ApplyPatch(&Agent{
		Config: AgentConfig{
			SystemInstruction: new("Analyze budgets"),
			Generation:        GenerationConfig{Temperature: new(0.2)},
			Execution:         ExecutionConfig{ApprovalPolicy: ApprovalAuto, MaxSteps: 15},
			MCPBindings:       []MCPBinding{{MCPServerID: "mcp_1", AllowedTools: []string{"finance_list_budgets"}}},
		},
	}, []string{
		"config.system_instruction",
		"config.generation.temperature",
		"config.execution.approval_policy",
		"config.execution.max_steps",
		"config.mcp_bindings",
	})
	if err != nil {
		t.Fatalf("ApplyPatch failed: %v", err)
	}
	if agent.Config.Execution.MaxSteps != 15 || agent.Config.Execution.ApprovalPolicy != ApprovalAuto {
		t.Errorf("unexpected execution config: %+v", agent.Config.Execution)
	}
	if len(agent.Config.MCPBindings) != 1 || !agent.Config.MCPBindings[0].AllowsTool("finance_list_budgets") {
		t.Errorf("unexpected mcp bindings: %+v", agent.Config.MCPBindings)
	}
	if agent.Config.MCPBindings[0].AllowsTool("finance_create_transaction") {
		t.Error("expected finance_create_transaction disallowed")
	}

	// Invalid max_steps rejected
	if err := agent.ApplyPatch(&Agent{Config: AgentConfig{Execution: ExecutionConfig{MaxSteps: 100}}}, []string{"config.execution.max_steps"}); !errors.Is(err, errors.Invalid) {
		t.Errorf("expected Invalid error for max_steps > 50, got %v", err)
	}
	// Invalid timeout_seconds > 1800 rejected
	if err := agent.ApplyPatch(&Agent{Config: AgentConfig{Execution: ExecutionConfig{TimeoutSeconds: 1801}}}, []string{"config.execution.timeout_seconds"}); !errors.Is(err, errors.Invalid) {
		t.Errorf("expected Invalid error for timeout_seconds > 1800, got %v", err)
	}
}
