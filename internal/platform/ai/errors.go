package ai

import "github.com/masterkeysrd/saturn/internal/platform/errors"

const (
	CodeProviderNotFound       errors.Code = "AI_PROVIDER_NOT_FOUND"
	CodeProviderDisabled       errors.Code = "AI_PROVIDER_DISABLED"
	CodeProviderVerifyFailed   errors.Code = "AI_PROVIDER_VERIFY_FAILED"
	CodeModelNotFound          errors.Code = "AI_MODEL_NOT_FOUND"
	CodeModelDisabled          errors.Code = "AI_MODEL_DISABLED"
	CodeModelNotConfigured     errors.Code = "AI_MODEL_NOT_CONFIGURED"
	CodeMCPServerNotFound      errors.Code = "AI_MCP_SERVER_NOT_FOUND"
	CodeMCPServerProtected     errors.Code = "AI_MCP_SERVER_PROTECTED"
	CodeMCPInvalidURL          errors.Code = "AI_MCP_INVALID_URL"
	CodeMCPSSRFBlocked         errors.Code = "AI_MCP_SSRF_BLOCKED"
	CodeMCPConnectionFailed    errors.Code = "AI_MCP_CONNECTION_FAILED"
	CodeAgentNotFound          errors.Code = "AI_AGENT_NOT_FOUND"
	CodeAgentProtected         errors.Code = "AI_AGENT_PROTECTED"
	CodeAgentDisabled          errors.Code = "AI_AGENT_DISABLED"
	CodeThreadNotFound         errors.Code = "AI_THREAD_NOT_FOUND"
	CodeThreadBusy             errors.Code = "AI_THREAD_BUSY"
	CodeThreadAwaitingApproval errors.Code = "AI_THREAD_AWAITING_APPROVAL"
	CodeInvalidAttachment      errors.Code = "AI_INVALID_ATTACHMENT"
	CodeRunNotFound            errors.Code = "AI_RUN_NOT_FOUND"
	CodeMonthlyBudgetExceeded  errors.Code = "AI_MONTHLY_BUDGET_EXCEEDED"
	CodeMaxStepsExceeded       errors.Code = "AI_MAX_STEPS_EXCEEDED"
	CodeExecutionTimedOut      errors.Code = "AI_EXECUTION_TIMEOUT"
	CodeRunInterrupted         errors.Code = "AI_RUN_INTERRUPTED"
)

var (
	ErrProviderNotFound      = errors.E(errors.NotExist, CodeProviderNotFound, "AI provider not found")
	ErrModelNotFound         = errors.E(errors.NotExist, CodeModelNotFound, "AI model not found")
	ErrModelNotConfigured    = errors.E(errors.Precondition, CodeModelNotConfigured, "no AI model is configured for this workspace")
	ErrMCPServerNotFound     = errors.E(errors.NotExist, CodeMCPServerNotFound, "MCP server not found")
	ErrMCPServerProtected    = errors.E(errors.Permission, CodeMCPServerProtected, "built-in system MCP server cannot be deleted")
	ErrAgentNotFound         = errors.E(errors.NotExist, CodeAgentNotFound, "AI agent not found")
	ErrAgentProtected        = errors.E(errors.Permission, CodeAgentProtected, "built-in system agent cannot be deleted")
	ErrThreadNotFound        = errors.E(errors.NotExist, CodeThreadNotFound, "chat thread not found")
	ErrRunNotFound           = errors.E(errors.NotExist, CodeRunNotFound, "AI run not found")
	ErrMonthlyBudgetExceeded = errors.E(errors.ResourceExhausted, CodeMonthlyBudgetExceeded, "monthly workspace AI budget exceeded")
	ErrInvalidMCPURL         = errors.E(errors.Invalid, CodeMCPInvalidURL, "invalid MCP server URL")
	ErrSSRFBlocked           = errors.E(errors.Invalid, CodeMCPSSRFBlocked, "MCP server URL targets a blocked network address")
)
