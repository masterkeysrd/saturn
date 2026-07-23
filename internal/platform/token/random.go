package token

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
)

// GenerateRandomHex generates a cryptographically secure random string of specified byte length, encoded as hex.
func GenerateRandomHex(length int) (string, error) {
	bytes, err := GenerateRandomBytes(length)
	if err != nil {
		return "", err
	}
	return hex.EncodeToString(bytes), nil
}

// GenerateRandomBytes returns a cryptographically secure random byte slice of specified size.
func GenerateRandomBytes(size int) ([]byte, error) {
	bytes := make([]byte, size)
	if _, err := rand.Read(bytes); err != nil {
		return nil, fmt.Errorf("generate random bytes: %w", err)
	}
	return bytes, nil
}
