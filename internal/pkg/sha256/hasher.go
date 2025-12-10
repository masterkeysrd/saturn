// Package sha256 provides functionality to hash and compare strings using the SHA-256 algorithm.
package sha256

import (
	"crypto/sha256"
	"encoding/hex"
)

type Hasher struct{}

func New() *Hasher {
	return &Hasher{}
}

func (h *Hasher) Hash(input string) (string, error) {
	hash := sha256.Sum256([]byte(input))
	return hex.EncodeToString(hash[:]), nil
}

func (h *Hasher) Compare(hash string, input string) bool {
	computedHash, err := h.Hash(input)
	if err != nil {
		return false
	}
	return computedHash == hash
}
