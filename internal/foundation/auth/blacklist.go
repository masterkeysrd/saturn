package auth

import (
	"context"
	"time"
)

// TokenBlacklist defines the behavior for revoking access tokens.
type TokenBlacklist interface {
	// Revoke adds a token string to the blacklist for a specific duration.
	// The duration usually matches the remaining TTL of the token.
	Revoke(ctx context.Context, token Token, ttl time.Duration) error

	// IsRevoked checks if a token is currently blacklisted.
	IsRevoked(ctx context.Context, token Token) (bool, error)
}
