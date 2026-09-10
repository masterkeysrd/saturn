package agentapp

import (
	"context"
	"strings"

	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

// Typed error codes for the agent domain.
const (
	ProviderNotFound            errors.Code = "LLM_PROVIDER_NOT_FOUND"
	ProviderExists              errors.Code = "LLM_PROVIDER_EXISTS"
	AgentNotFound               errors.Code = "AGENT_NOT_FOUND"
	AgentExists                 errors.Code = "AGENT_EXISTS"
	RunNotFound                 errors.Code = "AGENT_RUN_NOT_FOUND"
	InvalidAgentPurpose         errors.Code = "INVALID_AGENT_PURPOSE"
	InvalidTemplate             errors.Code = "INVALID_TEMPLATE"
	ModelExecutionFailed        errors.Code = "MODEL_EXECUTION_FAILED"
	ModelUnavailable            errors.Code = "MODEL_UNAVAILABLE"
	SuggestionProcessorNotFound errors.Code = "SUGGESTION_PROCESSOR_NOT_FOUND"
)

// MapExecutionError translates low-level model or network failures into platform errors
// with appropriate Kind (Unavailable vs Internal) and canonical Op.
func MapExecutionError(op errors.Op, err error) error {
	if err == nil {
		return nil
	}

	if errors.Is(err, context.DeadlineExceeded) || errors.Is(err, context.Canceled) {
		return errors.E(op, errors.Unavailable, ModelUnavailable, err)
	}

	errStr := strings.ToLower(err.Error())
	if strings.Contains(errStr, "rate limit") ||
		strings.Contains(errStr, "429") ||
		strings.Contains(errStr, "503") ||
		strings.Contains(errStr, "unavailable") ||
		strings.Contains(errStr, "timeout") ||
		strings.Contains(errStr, "connection refused") ||
		strings.Contains(errStr, "connection reset") ||
		strings.Contains(errStr, "overloaded") {
		return errors.E(op, errors.Unavailable, ModelUnavailable, err)
	}

	return errors.E(op, errors.Internal, ModelExecutionFailed, err)
}
