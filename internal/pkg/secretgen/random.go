// Package secretgen provides functions to generate random secrets.
package secretgen

import (
	"crypto/rand"
	"encoding/base64"
	"fmt"
)

type RandomGenerator struct{}

// NewRandomGenerator creates a new instance of RandomGenerator.
func NewRandomGenerator() *RandomGenerator {
	return &RandomGenerator{}
}

// GenerateSecret generates a random secret of the specified length.
func (rg *RandomGenerator) GenerateSecret(length int) (string, error) {
	bytes := make([]byte, length)
	n, err := rand.Read(bytes)
	if err != nil {
		return "", fmt.Errorf("failed to generate random bytes: %w", err)
	}

	return base64.RawURLEncoding.EncodeToString(bytes[:n]), nil
}
