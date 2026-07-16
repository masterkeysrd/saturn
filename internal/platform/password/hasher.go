package password

import "errors"

var (
	ErrInvalidPassword  = errors.New("invalid password")
	ErrInvalidHash      = errors.New("invalid password hash")
	ErrPasswordMismatch = errors.New("password mismatch")
)

// Hasher computes password hashes and verifies passwords against stored hashes.
type Hasher interface {
	// Hash derives an encoded Argon2id hash from the given plaintext password.
	Hash(raw string) (string, error)

	// Verify verifies a plaintext password against an encoded hash.
	// It returns ErrPasswordMismatch when the password does not match.
	// It returns ErrInvalidHash when the encoded hash is malformed, unsupported, or unsafe.
	// needsRehash is true when the stored parameters are weaker than the active target.
	Verify(encodedHash, raw string) (needsRehash bool, err error)
}
