package identity

import "errors"

// Sentinel errors for session operations.
var (
	ErrSessionNotFound = errors.New("session not found")
	ErrSessionExpired  = errors.New("session expired")
	ErrSessionRevoked  = errors.New("session revoked")
	ErrSessionReused   = errors.New("session reused")
)
