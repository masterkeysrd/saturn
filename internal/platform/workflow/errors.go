package workflow

import (
	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

var (
	// ErrFlowNotFound indicates the requested flow does not exist in the workspace.
	ErrFlowNotFound = errors.E(errors.NotExist, errors.Code("FLOW_NOT_FOUND"), "workflow not found")

	// ErrTriggerNotFound indicates the requested trigger does not exist.
	ErrTriggerNotFound = errors.E(errors.NotExist, errors.Code("TRIGGER_NOT_FOUND"), "workflow trigger not found")

	// ErrFlowRunNotFound indicates the requested flow run does not exist.
	ErrFlowRunNotFound = errors.E(errors.NotExist, errors.Code("FLOW_RUN_NOT_FOUND"), "workflow run not found")

	// ErrCannotDeleteSystemFlow indicates an attempt to delete a built-in system flow.
	ErrCannotDeleteSystemFlow = errors.E(errors.Precondition, errors.Code("CANNOT_DELETE_SYSTEM_FLOW"), "system workflows cannot be deleted")

	// ErrNotSystemFlow indicates an attempt to reset a non-system flow.
	ErrNotSystemFlow = errors.E(errors.Precondition, errors.Code("NOT_SYSTEM_FLOW"), "only system workflows can be reset")

	// ErrFlowDisabled indicates an attempt to execute or invoke a disabled flow.
	ErrFlowDisabled = errors.E(errors.Precondition, errors.Code("FLOW_DISABLED"), "workflow is disabled")

	// ErrTriggerDisabled indicates an attempt to invoke a disabled trigger.
	ErrTriggerDisabled = errors.E(errors.Precondition, errors.Code("TRIGGER_DISABLED"), "workflow trigger is disabled")

	// ErrValidationFailed indicates invalid flow, trigger, or CEL expression definitions.
	ErrValidationFailed = errors.E(errors.Invalid, errors.Code("WORKFLOW_VALIDATION_FAILED"), "workflow validation failed")
)

// FlowError captures structured failure details recorded on FlowRun or StepRun.
type FlowError struct {
	StepID  *string `json:"step_id,omitempty"`
	Code    *string `json:"code,omitempty"`
	Message string  `json:"message"`
}

func newStepFlowError(stepID, code, message string) *FlowError {
	fe := &FlowError{
		Message: message,
	}
	if stepID != "" {
		fe.StepID = new(stepID)
	}
	if code != "" {
		fe.Code = new(code)
	}
	return fe
}
