package connector

import "github.com/masterkeysrd/saturn/internal/platform/errors"

// Error codes for connector application coordinator operations.
const (
	ErrMissingOAuthScopes errors.Code = "MISSING_OAUTH_SCOPES"
	ErrCooldownActive     errors.Code = "COOLDOWN_ACTIVE"
	ErrUnauthorizedRole   errors.Code = "UNAUTHORIZED_ROLE"
	ErrInvalidState       errors.Code = "INVALID_STATE"
	ErrAccountNotFound    errors.Code = "ACCOUNT_NOT_FOUND"
)
