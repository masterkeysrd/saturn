package hash

import (
	"crypto/sha256"
)

// SHA256 returns the SHA-256 checksum of the given byte slice.
func SHA256(data []byte) []byte {
	h := sha256.New()
	h.Write(data)
	return h.Sum(nil)
}

// SHA256String returns the SHA-256 checksum of the given string.
func SHA256String(data string) []byte {
	return SHA256([]byte(data))
}
