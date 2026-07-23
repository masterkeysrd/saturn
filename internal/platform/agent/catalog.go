package agent

import (
	"sync"
)

// AgentDescriptor represents a system blueprint template for an AI Agent.
type AgentDescriptor struct {
	Purpose                  string   `json:"purpose"`
	DisplayName              string   `json:"display_name"`
	Description              string   `json:"description"`
	DefaultTags              []string `json:"default_tags"`
	DefaultSystemInstruction string   `json:"default_system_instruction"`
	DefaultPromptTemplate    string   `json:"default_prompt_template"`
	RequiredResponseSchema   string   `json:"required_response_schema"`
}

// ProviderDescriptor represents a connection protocol template for an LLM connection.
type ProviderDescriptor struct {
	ID                string            `json:"id"`
	DisplayName       string            `json:"display_name"`
	Description       string            `json:"description"`
	CompatibilityMode CompatibilityMode `json:"compatibility_mode"`
	DefaultAPIUrl     string            `json:"default_api_url"`
	IsAPIKeyRequired  bool              `json:"is_api_key_required"`
	LogoIcon          string            `json:"logo_icon"`
}

// GetProviderCatalog returns the system-supported LLM connection blueprints.
func GetProviderCatalog() []ProviderDescriptor {
	return []ProviderDescriptor{
		{
			ID:                "gemini",
			DisplayName:       "Google Gemini",
			Description:       "Connect natively to Google Gemini cloud models.",
			CompatibilityMode: ModeGeminiNative,
			DefaultAPIUrl:     "https://generativelanguage.googleapis.com",
			IsAPIKeyRequired:  true,
			LogoIcon:          "sparkles",
		},
		{
			ID:                "openai",
			DisplayName:       "OpenAI GPT",
			Description:       "Connect natively to OpenAI GPT-4 or compatible cloud endpoints.",
			CompatibilityMode: ModeOpenAICompatible,
			DefaultAPIUrl:     "https://api.openai.com/v1",
			IsAPIKeyRequired:  true,
			LogoIcon:          "bot",
		},
		{
			ID:                "anthropic",
			DisplayName:       "Anthropic Claude",
			Description:       "Connect natively to Anthropic Claude 3.5 Sonnet or compatible cloud endpoints.",
			CompatibilityMode: ModeAnthropicCompat,
			DefaultAPIUrl:     "https://api.anthropic.com/v1",
			IsAPIKeyRequired:  true,
			LogoIcon:          "brain",
		},
		{
			ID:                "ollama",
			DisplayName:       "Ollama (Local)",
			Description:       "Connect natively to your local Ollama instance running llama3, mistral, or other models.",
			CompatibilityMode: ModeOllamaNative,
			DefaultAPIUrl:     "http://localhost:11434",
			IsAPIKeyRequired:  false,
			LogoIcon:          "terminal",
		},
		{
			ID:                "openrouter",
			DisplayName:       "OpenRouter",
			Description:       "Access a unified routing API for hundreds of open source and proprietary models.",
			CompatibilityMode: ModeOpenAICompatible,
			DefaultAPIUrl:     "https://openrouter.ai/api/v1",
			IsAPIKeyRequired:  true,
			LogoIcon:          "globe",
		},
	}
}

var (
	catalogMu sync.RWMutex
	catalog   []AgentDescriptor
)

// RegisterAgent registers a domain-owned agent descriptor blueprint into the global catalog.
func RegisterAgent(desc AgentDescriptor) {
	catalogMu.Lock()
	defer catalogMu.Unlock()
	// Prevent duplicate registrations
	for _, a := range catalog {
		if a.Purpose == desc.Purpose {
			return
		}
	}
	catalog = append(catalog, desc)
}

// GetAgentCatalog returns the currently registered system-supported AI Agent blueprints.
func GetAgentCatalog() []AgentDescriptor {
	catalogMu.RLock()
	defer catalogMu.RUnlock()
	out := make([]AgentDescriptor, len(catalog))
	copy(out, catalog)
	return out
}
