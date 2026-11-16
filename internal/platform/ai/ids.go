package ai

import "github.com/masterkeysrd/saturn/internal/platform/id"

const (
	ProviderPrefix  = "prv_"
	ModelPrefix     = "mdl_"
	MCPServerPrefix = "mcp_"
	AgentPrefix     = "agt_"
	ThreadPrefix    = "thr_"
	MessagePrefix   = "aim_"
	RunPrefix       = "air_"
	RunStepPrefix   = "ais_"
)

var (
	ProviderIDGenerator  = id.NewPrefixGenerator(ProviderPrefix)
	ModelIDGenerator     = id.NewPrefixGenerator(ModelPrefix)
	MCPServerIDGenerator = id.NewPrefixGenerator(MCPServerPrefix)
	AgentIDGenerator     = id.NewPrefixGenerator(AgentPrefix)
	ThreadIDGenerator    = id.NewPrefixGenerator(ThreadPrefix)
	MessageIDGenerator   = id.NewPrefixGenerator(MessagePrefix)
	RunIDGenerator       = id.NewPrefixGenerator(RunPrefix, "run_")
	RunStepIDGenerator   = id.NewPrefixGenerator(RunStepPrefix)
)

func GenerateProviderID() (string, error)  { return ProviderIDGenerator.Generate() }
func ValidateProviderID(s string) error    { return ProviderIDGenerator.Validate(s) }
func GenerateModelID() (string, error)     { return ModelIDGenerator.Generate() }
func ValidateModelID(s string) error       { return ModelIDGenerator.Validate(s) }
func GenerateMCPServerID() (string, error) { return MCPServerIDGenerator.Generate() }
func ValidateMCPServerID(s string) error   { return MCPServerIDGenerator.Validate(s) }
func GenerateAgentID() (string, error)     { return AgentIDGenerator.Generate() }
func ValidateAgentID(s string) error       { return AgentIDGenerator.Validate(s) }
func GenerateThreadID() (string, error)    { return ThreadIDGenerator.Generate() }
func ValidateThreadID(s string) error      { return ThreadIDGenerator.Validate(s) }
func GenerateMessageID() (string, error)   { return MessageIDGenerator.Generate() }
func ValidateMessageID(s string) error     { return MessageIDGenerator.Validate(s) }
func GenerateRunID() (string, error)       { return RunIDGenerator.Generate() }
func ValidateRunID(s string) error         { return RunIDGenerator.Validate(s) }
func GenerateRunStepID() (string, error)   { return RunStepIDGenerator.Generate() }
func ValidateRunStepID(s string) error     { return RunStepIDGenerator.Validate(s) }
