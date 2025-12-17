package auth

import (
	"context"
	"fmt"
	"time"

	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	"github.com/masterkeysrd/saturn/internal/pkg/mnemo"
)

// MnemoTokenBlacklist implements auth.TokenBlacklist using in-memory cache.
type MnemoTokenBlacklist struct {
	cache *mnemo.Cache
}

func NewMnemoTokenBlacklist(cache *mnemo.Cache) *MnemoTokenBlacklist {
	return &MnemoTokenBlacklist{cache: cache}
}

func (b *MnemoTokenBlacklist) Revoke(ctx context.Context, token auth.Token, ttl time.Duration) error {
	// We store "revoked" as a marker. The value doesn't matter.
	// We use SetStringEx to enforce the specific TTL (remaining lifetime of the token).
	return b.cache.SetStringEx(token.String(), "revoked", ttl)
}

func (b *MnemoTokenBlacklist) IsRevoked(ctx context.Context, token auth.Token) (bool, error) {
	// We check if the key exists.
	_, found, err := b.cache.GetString(token.String())
	if err != nil {
		// If there's a type mismatch or other error, fail safe (assume not revoked or log error)
		// For a blacklist, usually we return the error.
		return false, fmt.Errorf("failed to check blacklist: %w", err)
	}
	return found, nil
}
