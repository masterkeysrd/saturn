package ai

import (
	"slices"
	"strings"

	"github.com/masterkeysrd/loom/llm"
	"github.com/masterkeysrd/loom/profile"
	loomanthropic "github.com/masterkeysrd/loom/providers/anthropic"
	loomgenai "github.com/masterkeysrd/loom/providers/genai"
	loomopenai "github.com/masterkeysrd/loom/providers/openai"
)

// ProviderDescriptor describes a supported LLM provider driver blueprint.
type ProviderDescriptor struct {
	Driver            Driver
	DisplayName       string
	Description       string
	DefaultBaseURL    string
	APIKeyRequired    bool
	SupportsDiscovery bool
	LogoIcon          string
}

// GetProviderCatalog returns all supported workspace LLM provider blueprints.
func GetProviderCatalog() []ProviderDescriptor {
	return []ProviderDescriptor{
		{
			Driver:            DriverGemini,
			DisplayName:       "Google Gemini",
			Description:       "Connect natively to Google Gemini models via the Gemini API.",
			DefaultBaseURL:    "https://generativelanguage.googleapis.com",
			APIKeyRequired:    true,
			SupportsDiscovery: true,
			LogoIcon:          "sparkles",
		},
		{
			Driver:            DriverOpenAI,
			DisplayName:       "OpenAI",
			Description:       "Connect natively to OpenAI GPT and reasoning models.",
			DefaultBaseURL:    "https://api.openai.com/v1",
			APIKeyRequired:    true,
			SupportsDiscovery: true,
			LogoIcon:          "bot",
		},
		{
			Driver:            DriverAnthropic,
			DisplayName:       "Anthropic Claude",
			Description:       "Connect natively to Anthropic Claude models.",
			DefaultBaseURL:    "https://api.anthropic.com/v1",
			APIKeyRequired:    true,
			SupportsDiscovery: true,
			LogoIcon:          "brain",
		},
		{
			Driver:            DriverOpenRouter,
			DisplayName:       "OpenRouter",
			Description:       "Access models from multiple providers through a unified OpenAI-compatible router.",
			DefaultBaseURL:    "https://openrouter.ai/api/v1",
			APIKeyRequired:    true,
			SupportsDiscovery: true,
			LogoIcon:          "globe",
		},
		{
			Driver:            DriverOllama,
			DisplayName:       "Ollama (Local)",
			Description:       "Connect to a local or self-hosted Ollama instance without requiring an API key.",
			DefaultBaseURL:    "http://localhost:11434",
			APIKeyRequired:    false,
			SupportsDiscovery: true,
			LogoIcon:          "terminal",
		},
		{
			Driver:            DriverOpenAICompatible,
			DisplayName:       "OpenAI-Compatible",
			Description:       "Connect to any custom OpenAI-compatible inference server (vLLM, LM Studio, LiteLLM).",
			DefaultBaseURL:    "",
			APIKeyRequired:    false,
			SupportsDiscovery: true,
			LogoIcon:          "cpu",
		},
	}
}

// CatalogModelSpec describes a curated default model entry seeded on provider creation.
type CatalogModelSpec struct {
	ModelID     string
	DisplayName string
	Profile     ModelProfile
	DefaultRole ModelRole
}

// InferReasoningCapability reports whether a model ID belongs to a known reasoning-capable model family
// when upstream discovery metadata omits explicit capability flags (such as custom or local Ollama tags).
func InferReasoningCapability(modelID string) bool {
	lower := strings.ToLower(strings.TrimSpace(modelID))
	if lower == "" {
		return false
	}
	for _, token := range []string{
		"qwen3",
		"deepseek-r1",
		"deepseek-reasoner",
		"qwq",
		"gemini-2.5",
		"gemini-3",
		"gemini-4",
		"claude-3-7",
		"claude-sonnet-4",
		"claude-opus-4",
		"magistral",
		"gpt-oss",
		"thinking",
	} {
		if strings.Contains(lower, token) {
			return true
		}
	}
	base := lower
	if idx := strings.LastIndex(base, "/"); idx >= 0 {
		base = base[idx+1:]
	}
	return strings.HasPrefix(base, "o1") || strings.HasPrefix(base, "o3") || strings.HasPrefix(base, "o4")
}

// FromLoomProfile maps a loom/profile.Profile to Saturn's ModelProfile.
func FromLoomProfile(lp profile.Profile) ModelProfile {
	return ModelProfile{
		Capabilities: ModelCapabilities{
			ToolCalling:      lp.Capabilities.ToolCall,
			Vision:           slices.Contains(lp.Modalities.Inputs, profile.ModalityImage),
			Document:         slices.Contains(lp.Modalities.Inputs, profile.ModalityPDF),
			Audio:            slices.Contains(lp.Modalities.Inputs, profile.ModalityAudio),
			Reasoning:        lp.Capabilities.Reasoning || InferReasoningCapability(lp.ID),
			StructuredOutput: lp.Capabilities.ToolCall,
			Streaming:        true,
		},
		Limits: ModelLimits{
			ContextWindow:   int32(lp.Limits.Context),
			MaxOutputTokens: int32(lp.Limits.Output),
		},
		Pricing: ModelPricing{
			InputPerMillionUSD:       lp.Pricing.Input,
			OutputPerMillionUSD:      lp.Pricing.Output,
			CachedInputPerMillionUSD: lp.Pricing.CacheRead,
		},
	}
}

var (
	staticGenaiProvider     = &loomgenai.Provider{}
	staticOpenAIProvider    = &loomopenai.Provider{}
	staticAnthropicProvider = &loomanthropic.Provider{}
)

// LookupLoomProfile resolves static profile metadata for (driver, modelID) from loom's embedded catalogs.
func LookupLoomProfile(driver Driver, modelID string) (ModelProfile, string, bool) {
	id := strings.TrimSpace(modelID)
	if id == "" {
		return ModelProfile{}, "", false
	}

	var p llm.Provider
	lookupID := id

	switch driver {
	case DriverGemini:
		p = staticGenaiProvider
	case DriverOpenAI:
		p = staticOpenAIProvider
	case DriverAnthropic:
		p = staticAnthropicProvider
	case DriverOpenRouter:
		if prefix, rest, ok := strings.Cut(id, "/"); ok {
			lookupID = rest
			switch prefix {
			case "google":
				p = staticGenaiProvider
			case "openai":
				p = staticOpenAIProvider
			case "anthropic":
				p = staticAnthropicProvider
			}
		}
	default:
		return ModelProfile{}, "", false
	}

	if p == nil {
		return ModelProfile{}, "", false
	}
	lp, ok := p.GetProfile(lookupID)
	if !ok {
		return ModelProfile{}, "", false
	}
	name := lp.Name
	if name == "" {
		name = id
	}
	return FromLoomProfile(lp), name, true
}

// DefaultSeedModelsForDriver returns curated default models to auto-seed when a Provider is created.
func DefaultSeedModelsForDriver(driver Driver) []CatalogModelSpec {
	type seedDef struct {
		id          string
		fallback    string
		defaultRole ModelRole
	}

	var defs []seedDef
	switch driver {
	case DriverGemini:
		defs = []seedDef{
			{id: "gemini-2.5-flash", fallback: "Gemini 2.5 Flash", defaultRole: ModelRoleDefault},
			{id: "gemini-2.5-flash-lite", fallback: "Gemini 2.5 Flash-Lite", defaultRole: ModelRoleFast},
			{id: "gemini-2.5-pro", fallback: "Gemini 2.5 Pro", defaultRole: ModelRoleReasoning},
		}
	case DriverOpenAI:
		defs = []seedDef{
			{id: "gpt-4.1", fallback: "GPT-4.1", defaultRole: ModelRoleDefault},
			{id: "gpt-4.1-mini", fallback: "GPT-4.1 mini", defaultRole: ModelRoleFast},
			{id: "o4-mini", fallback: "o4-mini", defaultRole: ModelRoleReasoning},
		}
	case DriverAnthropic:
		defs = []seedDef{
			{id: "claude-sonnet-4-6", fallback: "Claude Sonnet 4.6", defaultRole: ModelRoleDefault},
			{id: "claude-haiku-4-5", fallback: "Claude Haiku 4.5", defaultRole: ModelRoleFast},
			{id: "claude-opus-4-6", fallback: "Claude Opus 4.6", defaultRole: ModelRoleReasoning},
		}
	case DriverOpenRouter:
		defs = []seedDef{
			{id: "google/gemini-2.5-flash", fallback: "Gemini 2.5 Flash (OpenRouter)", defaultRole: ModelRoleDefault},
			{id: "openai/gpt-4.1-mini", fallback: "GPT-4.1 mini (OpenRouter)", defaultRole: ModelRoleFast},
			{id: "anthropic/claude-sonnet-4-6", fallback: "Claude Sonnet 4.6 (OpenRouter)", defaultRole: ModelRoleReasoning},
		}
	default:
		return nil
	}

	out := make([]CatalogModelSpec, 0, len(defs))
	for _, d := range defs {
		prof, displayName, ok := LookupLoomProfile(driver, d.id)
		if !ok {
			displayName = d.fallback
			prof = ModelProfile{
				Capabilities: ModelCapabilities{
					ToolCalling:      true,
					StructuredOutput: true,
					Streaming:        true,
				},
			}
		}
		out = append(out, CatalogModelSpec{
			ModelID:     d.id,
			DisplayName: displayName,
			Profile:     prof,
			DefaultRole: d.defaultRole,
		})
	}
	return out
}

// RoleDefaultsForSeededModels picks DefaultModelID, FastModelID, and ReasoningModelID from newly seeded models.
func RoleDefaultsForSeededModels(driver Driver, seeded []*Model) ModelRoleSettings {
	var roles ModelRoleSettings
	if len(seeded) == 0 {
		return roles
	}

	specs := DefaultSeedModelsForDriver(driver)
	roleByModelID := make(map[string]ModelRole, len(specs))
	for _, sp := range specs {
		if sp.DefaultRole != "" {
			roleByModelID[sp.ModelID] = sp.DefaultRole
		}
	}

	for _, m := range seeded {
		if !m.IsEnabled {
			continue
		}
		switch roleByModelID[m.ModelID] {
		case ModelRoleDefault:
			if roles.DefaultModelID == nil {
				roles.DefaultModelID = new(m.ID)
			}
		case ModelRoleFast:
			if roles.FastModelID == nil {
				roles.FastModelID = new(m.ID)
			}
		case ModelRoleReasoning:
			if roles.ReasoningModelID == nil {
				roles.ReasoningModelID = new(m.ID)
			}
		}
	}

	if roles.DefaultModelID == nil {
		roles.DefaultModelID = new(seeded[0].ID)
	}
	if roles.FastModelID == nil {
		roles.FastModelID = new(*roles.DefaultModelID)
	}
	if roles.ReasoningModelID == nil {
		roles.ReasoningModelID = new(*roles.DefaultModelID)
	}
	return roles
}

// SystemSaturnMCPBlueprint returns the factory definition for the built-in `system.saturn.mcp` server.
func SystemSaturnMCPBlueprint(spaceID string) *MCPServer {
	return &MCPServer{
		SpaceID:     spaceID,
		SystemKey:   new(SystemSaturnMCPKey),
		IsSystem:    true,
		Slug:        "saturn",
		Name:        "Saturn Workspace",
		Description: "Built-in Saturn MCP server providing curated access to Space, Finance, Calendar, Mail, and Workflows.",
		Transport:   TransportInMemory,
		Config: MCPServerConfig{
			URL:            "in-memory://saturn",
			AuthType:       MCPAuthNone,
			TrustReadHints: true,
			TimeoutSeconds: 30,
		},
		Discovery: MCPDiscoveryState{
			HealthStatus: MCPHealthHealthy,
		},
		IsEnabled: true,
	}
}

// SystemAssistantBlueprint returns the factory definition for the built-in `system.saturn.assistant` agent.
func SystemAssistantBlueprint(spaceID, saturnMCPID string) *Agent {
	const systemPrompt = `You are Saturn Assistant, a helpful personal AI copilot inside the user's Saturn workspace.
You have access to the user's workspace tools (Space context, Finance, Calendar, Mail, and Workflows) via MCP.
- Always check space context or read relevant records before answering questions about budgets, accounts, calendar events, emails, or workflows.
- Respect workspace timezone and currency conventions when summarizing dates and monetary values.
- Be concise, accurate, and transparent when tool calls fail or require confirmation.`

	var bindings []MCPBinding
	if strings.TrimSpace(saturnMCPID) != "" {
		bindings = []MCPBinding{{
			MCPServerID:  saturnMCPID,
			AllowedTools: []string{"*"},
		}}
	}

	return &Agent{
		SpaceID:     spaceID,
		SystemKey:   new(SystemSaturnAssistantKey),
		IsSystem:    true,
		Slug:        "saturn-assistant",
		Name:        "Saturn Assistant",
		Description: "Default workspace assistant with curated access to your Space, Finance, Calendar, Mail, and Workflows.",
		Tags:        []string{"system", "assistant"},
		ModelID:     nil,
		Config: AgentConfig{
			Icon:              "sparkles",
			SystemInstruction: new(systemPrompt),
			Execution: ExecutionConfig{
				ApprovalPolicy: ApprovalConfirmWrites,
				MaxSteps:       10,
				TimeoutSeconds: DefaultExecutionTimeoutSeconds,
			},
			MCPBindings: bindings,
		},
		IsEnabled: true,
		Version:   1,
	}
}
