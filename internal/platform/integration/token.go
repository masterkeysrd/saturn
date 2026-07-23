package integration

import (
	"encoding/hex"

	"github.com/masterkeysrd/saturn/internal/platform/hash"
	"github.com/masterkeysrd/saturn/internal/platform/token"
)

// GenerateToken generates a cryptographically secure random token prefixed with saturn_int_.
func GenerateToken() (string, error) {
	hexStr, err := token.GenerateRandomHex(20)
	if err != nil {
		return "", err
	}
	return "saturn_int_" + hexStr, nil
}

// HashToken hashes a raw token using SHA-256, returning a 64-character hex string.
func HashToken(tokenStr string) string {
	return hex.EncodeToString(hash.SHA256String(tokenStr))
}
