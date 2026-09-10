package identity

import "github.com/masterkeysrd/saturn/internal/platform/errors"

// Error codes for the identity domain.
const (
	NotFound           errors.Code = "USER_NOT_FOUND"
	UserExists         errors.Code = "USER_EXISTS"
	CredentialNotFound errors.Code = "CREDENTIAL_NOT_FOUND"
	CredentialExists   errors.Code = "CREDENTIAL_EXISTS"
	InvalidCredentials errors.Code = "INVALID_CREDENTIALS"
	AccountLocked      errors.Code = "ACCOUNT_LOCKED"
	AccountPending     errors.Code = "ACCOUNT_PENDING"
	AccountSuspended   errors.Code = "ACCOUNT_SUSPENDED"
	AccountInactive    errors.Code = "ACCOUNT_INACTIVE"
	SessionNotFound    errors.Code = "SESSION_NOT_FOUND"
	SessionExpired     errors.Code = "SESSION_EXPIRED"
	SessionRevoked     errors.Code = "SESSION_REVOKED"
	SessionReused      errors.Code = "SESSION_REUSED"
	VersionMismatch    errors.Code = "USER_VERSION_MISMATCH"
	InvalidUserID      errors.Code = "INVALID_USER_ID"
)
