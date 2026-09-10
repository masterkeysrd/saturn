package integration

import (
	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

// Typed error codes for the integration domain.
const (
	IntegrationNotFound       errors.Code = "INTEGRATION_NOT_FOUND"
	ProviderNotFound          errors.Code = "INTEGRATION_PROVIDER_NOT_FOUND"
	TokenNotFound             errors.Code = "INTEGRATION_TOKEN_NOT_FOUND"
	SimulationNotSupported    errors.Code = "SIMULATION_NOT_SUPPORTED"
	InvalidWebhookSecret      errors.Code = "INVALID_WEBHOOK_SECRET"
	WebhookVerificationFailed errors.Code = "WEBHOOK_VERIFICATION_FAILED"
	WebhookProcessingFailed   errors.Code = "WEBHOOK_PROCESSING_FAILED"
)
