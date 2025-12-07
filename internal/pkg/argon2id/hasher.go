// Package argon2id provides functionality to hash and verify passwords using the Argon2id algorithm.
package argon2id

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"fmt"
	"strconv"
	"strings"

	"golang.org/x/crypto/argon2"
)

const (
	// DefaultMemory is the default memory cost for Argon2id hashing.
	DefaultMemory = 64 * 1024 // 64 MB

	// DefaultTime is the default time cost for Argon2id hashing.
	DefaultIterations = 1

	// DefaultParallelism is the default parallelism for Argon2id hashing.
	DefaultParallelism = 4

	// DefaultSaltLength is the default length of the salt for Argon2id hashing.
	DefaultSaltLen = 16

	// DefaultKeyLen is the default length of the generated key for Argon2id hashing.
	DefaultKeyLen = 32
)

// Hasher represents an Argon2id password hasher with configurable parameters.
type Hasher struct {
	memory      uint32
	iterations  uint32
	parallelism uint8
	saltLen     uint32
	keyLen      uint32
}

// New creates a new Argon2id Hasher with default parameters.
func New() *Hasher {
	return &Hasher{
		memory:      DefaultMemory,
		iterations:  DefaultIterations,
		parallelism: DefaultParallelism,
		saltLen:     DefaultSaltLen,
		keyLen:      DefaultKeyLen,
	}
}

// Hash generates a hashed password using Argon2id algorithm.
func (h *Hasher) Hash(password string) (string, error) {
	salt, err := genRandomBytes(h.saltLen)
	if err != nil {
		return "", fmt.Errorf("failed to generate salt: %w", err)
	}

	hash := argon2.IDKey([]byte(password), salt, h.iterations, h.memory, h.parallelism, h.keyLen)

	b64Salt := base64.RawStdEncoding.EncodeToString(salt)
	b64Hash := base64.RawStdEncoding.EncodeToString(hash)

	encodedHash := encodeHash(params{
		memory:      h.memory,
		iterations:  h.iterations,
		parallelism: h.parallelism,
		version:     argon2.Version,
	}, b64Salt, b64Hash)

	return encodedHash, nil
}

// Compare verifies a password against the given encoded Argon2id hash.
func (h *Hasher) Compare(encodedHash, password string) bool {
	params, salt, hash, err := decodeHash(encodedHash)
	if err != nil {
		return false
	}

	decodedSalt, err := base64.RawStdEncoding.DecodeString(salt)
	if err != nil {
		return false
	}

	decodedHash, err := base64.RawStdEncoding.DecodeString(hash)
	if err != nil {
		return false
	}

	keyLen := uint32(len(decodedHash))
	computedHash := argon2.IDKey([]byte(password), decodedSalt, params.iterations, params.memory, params.parallelism, keyLen)

	return subtle.ConstantTimeCompare(decodedHash, computedHash) == 1
}

// genRandomBytes generates a slice of random bytes of the specified length.
func genRandomBytes(n uint32) ([]byte, error) {
	b := make([]byte, n)
	_, err := rand.Read(b)
	if err != nil {
		return nil, fmt.Errorf("failed to generate random bytes: %w", err)
	}
	return b, nil
}

// encodeHash encodes the parameters, salt, and hash into a single string.
func encodeHash(p params, salt, hash string) string {
	var sb strings.Builder

	sb.WriteString("$argon2id")

	// Version
	sb.WriteString("$v=")
	sb.WriteString(strconv.Itoa(int(p.version)))

	// Parameters
	sb.WriteString("$m=")
	sb.WriteString(strconv.Itoa(int(p.memory)))
	sb.WriteString(",t=")
	sb.WriteString(strconv.Itoa(int(p.iterations)))
	sb.WriteString(",p=")
	sb.WriteString(strconv.Itoa(int(p.parallelism)))

	// Salt and hash
	sb.WriteString("$")
	sb.WriteString(salt)
	sb.WriteString("$")
	sb.WriteString(hash)

	return sb.String()
}

// decodeHash decodes the encoded hash string into its parameters, salt, and hash components.
func decodeHash(encodedHash string) (params, string, string, error) {
	parts := strings.Split(encodedHash, "$")
	if len(parts) != 6 {
		return params{}, "", "", fmt.Errorf("invalid hash format")
	}

	var p params
	var err error

	// Algorithm
	if parts[1] != "argon2id" {
		return params{}, "", "", fmt.Errorf("unsupported algorithm: %s", parts[1])
	}

	// Version
	_, err = fmt.Sscanf(parts[2], "v=%d", &p.version)
	if err != nil {
		return params{}, "", "", fmt.Errorf("invalid version format: %w", err)
	}

	// Parameters
	_, err = fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &p.memory, &p.iterations, &p.parallelism)
	if err != nil {
		return params{}, "", "", fmt.Errorf("invalid parameters format: %w", err)
	}

	salt := parts[4]
	hash := parts[5]

	return p, salt, hash, nil
}

type params struct {
	memory      uint32
	iterations  uint32
	parallelism uint8
	version     uint8
}
