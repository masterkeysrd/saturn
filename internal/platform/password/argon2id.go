package password

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"

	"golang.org/x/crypto/argon2"
)

// Params defines the Argon2id hashing parameters.
type Params struct {
	Memory      uint32
	Iterations  uint32
	Parallelism uint8
	SaltLength  uint32
	KeyLength   uint32
}

// DefaultParams returns the default hashing parameters.
// Memory: 64 MiB, Iterations: 3, Parallelism: 1, SaltLength: 16, KeyLength: 32.
func DefaultParams() Params {
	return Params{
		Memory:      64 * 1024,
		Iterations:  3,
		Parallelism: 1,
		SaltLength:  16,
		KeyLength:   32,
	}
}

// maxMemory is a hard upper bound to prevent configuration mistakes.
const maxMemory uint32 = 1024 * 1024 // 1 GiB

// maxIterations is a hard upper bound.
const maxIterations uint32 = 100

// maxSaltLength is a safe upper bound for salt bytes.
const maxSaltLength uint32 = 256

// maxKeyLength is a safe upper bound for derived key bytes.
const maxKeyLength uint32 = 1024

// Argon2id implements the Hasher interface using Argon2id.
type Argon2id struct {
	params Params
}

// NewArgon2id creates a new Argon2id hasher with the given parameters.
// It returns an error for invalid or unsafe configuration.
func NewArgon2id(params Params) (*Argon2id, error) {
	if params.Memory == 0 {
		return nil, errors.New("params: Memory must be non-zero")
	}
	if params.Memory > maxMemory {
		return nil, fmt.Errorf("params: Memory %d exceeds maximum %d", params.Memory, maxMemory)
	}
	if params.Iterations == 0 {
		return nil, errors.New("params: Iterations must be non-zero")
	}
	if params.Iterations > maxIterations {
		return nil, fmt.Errorf("params: Iterations %d exceeds maximum %d", params.Iterations, maxIterations)
	}
	if params.Parallelism == 0 {
		return nil, errors.New("params: Parallelism must be non-zero")
	}
	if params.SaltLength < 16 {
		return nil, errors.New("params: SaltLength must be at least 16")
	}
	if params.SaltLength > maxSaltLength {
		return nil, fmt.Errorf("params: SaltLength %d exceeds maximum %d", params.SaltLength, maxSaltLength)
	}
	if params.KeyLength < 16 {
		return nil, errors.New("params: KeyLength must be at least 16")
	}
	if params.KeyLength > maxKeyLength {
		return nil, fmt.Errorf("params: KeyLength %d exceeds maximum %d", params.KeyLength, maxKeyLength)
	}

	return &Argon2id{params: params}, nil
}

// validateRaw checks the length of the raw password.
// It rejects passwords shorter than 12 bytes or longer than 1024 bytes.
// It does not trim, lower-case, normalize, or enforce composition rules.
func validateRaw(raw string) error {
	n := len(raw)
	if n < 12 {
		return ErrInvalidPassword
	}
	if n > 1024 {
		return ErrInvalidPassword
	}
	return nil
}

// Hash derives an encoded Argon2id hash from the given plaintext password.
func (a *Argon2id) Hash(raw string) (string, error) {
	if err := validateRaw(raw); err != nil {
		return "", err
	}

	salt, err := generateSalt(a.params.SaltLength)
	if err != nil {
		return "", fmt.Errorf("generate salt: %w", err)
	}

	key := deriveKey(raw, salt, &a.params)

	return encodeHash(&a.params, salt, key), nil
}

// Verify verifies a plaintext password against an encoded hash.
func (a *Argon2id) Verify(encodedHash, raw string) (bool, error) {
	if err := validateRaw(raw); err != nil {
		return false, err
	}

	params, salt, derivedKey, err := parseHash(encodedHash)
	if err != nil {
		return false, err
	}

	computedKey := argon2.IDKey([]byte(raw), salt,
		params.Iterations,
		params.Memory,
		params.Parallelism,
		params.KeyLength)

	if subtle.ConstantTimeCompare(derivedKey, computedKey) == 1 {
		// Password matched — check if rehash is needed.
		needsRehash := needsRehash(params, &a.params)
		return needsRehash, nil
	}

	return false, ErrPasswordMismatch
}

// generateSalt creates a cryptographically random salt.
func generateSalt(length uint32) ([]byte, error) {
	salt := make([]byte, length)
	if _, err := rand.Read(salt); err != nil {
		return nil, err
	}
	return salt, nil
}

// encodeHash encodes the hash in the self-describing Argon2id format.
// Format: $argon2id$v=19$m=<mem>,t=<iter>,p=<par>$<base64-salt>$<base64-key>
func encodeHash(params *Params, salt, key []byte) string {
	version := argon2.Version
	return fmt.Sprintf(
		"$argon2id$v=%d$m=%d,t=%d,p=%d$%s$%s",
		version,
		params.Memory,
		params.Iterations,
		params.Parallelism,
		base64.RawStdEncoding.EncodeToString(salt),
		base64.RawStdEncoding.EncodeToString(key),
	)
}

// parseHash strictly parses the encoded Argon2id hash and returns the parameters,
// salt bytes, and the stored derived key.
func parseHash(encodedHash string) (*Params, []byte, []byte, error) {
	// Require exactly 6 segments separated by $: "" "argon2id" "v=19" "m=...t=...p=..." "salt" "key"
	parts := strings.Split(encodedHash, "$")
	if len(parts) != 6 {
		return nil, nil, nil, ErrInvalidHash
	}

	// parts[0] should be empty
	if parts[0] != "" {
		return nil, nil, nil, ErrInvalidHash
	}

	// parts[1] must be "argon2id"
	if parts[1] != "argon2id" {
		return nil, nil, nil, ErrInvalidHash
	}

	// parts[2] must be "v=19"
	if parts[2] != "v=19" {
		return nil, nil, nil, ErrInvalidHash
	}

	// parts[3] must contain m, t, p parameters
	params, err := parseParamsField(parts[3])
	if err != nil {
		return nil, nil, nil, err
	}

	// Decode salt
	salt, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil || len(salt) == 0 {
		return nil, nil, nil, ErrInvalidHash
	}
	if uint32(len(salt)) < params.SaltLength {
		return nil, nil, nil, ErrInvalidHash
	}

	// Decode key
	key, err := base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil || len(key) == 0 {
		return nil, nil, nil, ErrInvalidHash
	}
	if uint32(len(key)) < params.KeyLength {
		return nil, nil, nil, ErrInvalidHash
	}

	return params, salt, key, nil
}

// deriveKey derives an Argon2id key from the raw password and salt.
func deriveKey(raw string, salt []byte, params *Params) []byte {
	return argon2.IDKey([]byte(raw), salt,
		params.Iterations,
		params.Memory,
		params.Parallelism,
		params.KeyLength)
}

// parseParamsField parses the "m=<mem>,t=<iter>,p=<par>" field.
func parseParamsField(field string) (*Params, error) {
	// Split by comma to get individual parameter segments
	segments := strings.Split(field, ",")
	if len(segments) != 3 {
		return nil, ErrInvalidHash
	}

	var m, t, p uint32

	for _, seg := range segments {
		seg = strings.TrimSpace(seg)
		switch {
		case strings.HasPrefix(seg, "m="):
			_, err := fmt.Sscanf(seg, "m=%d", &m)
			if err != nil {
				return nil, ErrInvalidHash
			}
		case strings.HasPrefix(seg, "t="):
			_, err := fmt.Sscanf(seg, "t=%d", &t)
			if err != nil {
				return nil, ErrInvalidHash
			}
		case strings.HasPrefix(seg, "p="):
			_, err := fmt.Sscanf(seg, "p=%d", &p)
			if err != nil {
				return nil, ErrInvalidHash
			}
		default:
			return nil, ErrInvalidHash
		}
	}

	if m == 0 || t == 0 || p == 0 {
		return nil, ErrInvalidHash
	}

	return &Params{
		Memory:      m,
		Iterations:  t,
		Parallelism: uint8(p),
		SaltLength:  16, // validated against actual decoded length
		KeyLength:   32, // validated against actual decoded length
	}, nil
}

// needsRehash returns true when stored parameters are weaker than the active target.
// A stored parameter is weaker if its value is strictly less than the target.
// Downgrades are never triggered: if target values are lower than stored, no rehash.
func needsRehash(stored, target *Params) bool {
	if stored.Memory < target.Memory {
		return true
	}
	if stored.Iterations < target.Iterations {
		return true
	}
	if stored.Parallelism < target.Parallelism {
		return true
	}
	return false
}
