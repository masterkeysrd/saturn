package password

import (
	"strings"
	"testing"
)

// testParams are reduced-cost parameters for fast unit tests.
var testParams = Params{
	Memory:      8,
	Iterations:  1,
	Parallelism: 1,
	SaltLength:  16,
	KeyLength:   32,
}

func TestArgon2idHashValid(t *testing.T) {
	h, err := NewArgon2id(testParams)
	if err != nil {
		t.Fatalf("NewArgon2id: %v", err)
	}

	encoded, err := h.Hash("testpassword123")
	if err != nil {
		t.Fatalf("Hash: %v", err)
	}

	if !strings.HasPrefix(encoded, "$argon2id$v=19$") {
		t.Errorf("expected encoded hash to start with $argon2id$v=19$, got: %s", encoded)
	}
}

func TestArgon2idVerifySuccess(t *testing.T) {
	h, err := NewArgon2id(testParams)
	if err != nil {
		t.Fatalf("NewArgon2id: %v", err)
	}

	encoded, err := h.Hash("testpassword123")
	if err != nil {
		t.Fatalf("Hash: %v", err)
	}

	needsRehash, err := h.Verify(encoded, "testpassword123")
	if err != nil {
		t.Fatalf("Verify: %v", err)
	}
	_ = needsRehash
}

func TestArgon2idVerifyMismatch(t *testing.T) {
	h, err := NewArgon2id(testParams)
	if err != nil {
		t.Fatalf("NewArgon2id: %v", err)
	}

	encoded, err := h.Hash("correctpassword1")
	if err != nil {
		t.Fatalf("Hash: %v", err)
	}

	_, err = h.Verify(encoded, "wrongpassword1")
	if err != ErrPasswordMismatch {
		t.Fatalf("expected ErrPasswordMismatch, got: %v", err)
	}
}

func TestArgon2idDifferentSalts(t *testing.T) {
	h, err := NewArgon2id(testParams)
	if err != nil {
		t.Fatalf("NewArgon2id: %v", err)
	}

	encoded1, err := h.Hash("testpassword123")
	if err != nil {
		t.Fatalf("Hash 1: %v", err)
	}

	encoded2, err := h.Hash("testpassword123")
	if err != nil {
		t.Fatalf("Hash 2: %v", err)
	}

	if encoded1 == encoded2 {
		t.Fatal("expected two different hashes for the same password")
	}
}

func TestArgon2idPasswordTooShort(t *testing.T) {
	h, err := NewArgon2id(testParams)
	if err != nil {
		t.Fatalf("NewArgon2id: %v", err)
	}

	_, err = h.Hash("short")
	if err != ErrInvalidPassword {
		t.Fatalf("expected ErrInvalidPassword for short password, got: %v", err)
	}
}

func TestArgon2idPasswordTooLong(t *testing.T) {
	h, err := NewArgon2id(testParams)
	if err != nil {
		t.Fatalf("NewArgon2id: %v", err)
	}

	long := make([]byte, 1025)
	for i := range long {
		long[i] = 'a'
	}

	_, err = h.Hash(string(long))
	if err != ErrInvalidPassword {
		t.Fatalf("expected ErrInvalidPassword for long password, got: %v", err)
	}
}

func TestArgon2idPasswordExactly12Bytes(t *testing.T) {
	h, err := NewArgon2id(testParams)
	if err != nil {
		t.Fatalf("NewArgon2id: %v", err)
	}

	encoded, err := h.Hash("123456789012")
	if err != nil {
		t.Fatalf("Hash: %v", err)
	}

	_, err = h.Verify(encoded, "123456789012")
	if err != nil {
		t.Fatalf("Verify: %v", err)
	}
}

func TestArgon2idWhitespacePreserved(t *testing.T) {
	h, err := NewArgon2id(testParams)
	if err != nil {
		t.Fatalf("NewArgon2id: %v", err)
	}

	encoded, err := h.Hash("  spaced password    ")
	if err != nil {
		t.Fatalf("Hash: %v", err)
	}

	// Must verify with exact bytes
	_, err = h.Verify(encoded, "  spaced password    ")
	if err != nil {
		t.Fatalf("Verify with exact bytes: %v", err)
	}

	_, err = h.Verify(encoded, "spaced password")
	if err != ErrPasswordMismatch {
		t.Fatalf("expected ErrPasswordMismatch for different whitespace, got: %v", err)
	}
}

func TestArgon2idMalformedHash(t *testing.T) {
	h, err := NewArgon2id(testParams)
	if err != nil {
		t.Fatalf("NewArgon2id: %v", err)
	}

	_, err = h.Verify("not-a-valid-hash", "testpassword123")
	if err != ErrInvalidHash {
		t.Fatalf("expected ErrInvalidHash, got: %v", err)
	}
}

func TestArgon2idUnsupportedAlgorithm(t *testing.T) {
	h, err := NewArgon2id(testParams)
	if err != nil {
		t.Fatalf("NewArgon2id: %v", err)
	}

	// Create a fake hash with argon2i algorithm
	fakeHash := "$argon2i$v=19$m=65536,t=3,p=1$abcdefghijklmnop$ABCDEFGHIJKLMNOPQRSTUVWXYZ012345"
	_, err = h.Verify(fakeHash, "testpassword123")
	if err != ErrInvalidHash {
		t.Fatalf("expected ErrInvalidHash for argon2i, got: %v", err)
	}
}

func TestArgon2idInvalidBase64(t *testing.T) {
	h, err := NewArgon2id(testParams)
	if err != nil {
		t.Fatalf("NewArgon2id: %v", err)
	}

	// Valid structure but invalid base64 in salt field
	fakeHash := "$argon2id$v=19$m=65536,t=3,p=1$!!!invalid!!!$ABCDEFGHIJKLMNOPQRSTUVWXYZ012345"
	_, err = h.Verify(fakeHash, "testpassword123")
	if err != ErrInvalidHash {
		t.Fatalf("expected ErrInvalidHash for invalid base64, got: %v", err)
	}
}

func TestArgon2idInvalidParams(t *testing.T) {
	// Memory == 0
	_, err := NewArgon2id(Params{Memory: 0, Iterations: 1, Parallelism: 1, SaltLength: 16, KeyLength: 32})
	if err == nil {
		t.Fatal("expected error for Memory == 0")
	}

	// Iterations == 0
	_, err = NewArgon2id(Params{Memory: 64, Iterations: 0, Parallelism: 1, SaltLength: 16, KeyLength: 32})
	if err == nil {
		t.Fatal("expected error for Iterations == 0")
	}

	// Parallelism == 0
	_, err = NewArgon2id(Params{Memory: 64, Iterations: 1, Parallelism: 0, SaltLength: 16, KeyLength: 32})
	if err == nil {
		t.Fatal("expected error for Parallelism == 0")
	}

	// SaltLength < 16
	_, err = NewArgon2id(Params{Memory: 64, Iterations: 1, Parallelism: 1, SaltLength: 8, KeyLength: 32})
	if err == nil {
		t.Fatal("expected error for SaltLength < 16")
	}

	// KeyLength < 16
	_, err = NewArgon2id(Params{Memory: 64, Iterations: 1, Parallelism: 1, SaltLength: 16, KeyLength: 8})
	if err == nil {
		t.Fatal("expected error for KeyLength < 16")
	}
}

func TestArgon2idCurrentParamsNoRehash(t *testing.T) {
	h, err := NewArgon2id(testParams)
	if err != nil {
		t.Fatalf("NewArgon2id: %v", err)
	}

	encoded, err := h.Hash("testpassword123")
	if err != nil {
		t.Fatalf("Hash: %v", err)
	}

	needsRehash, err := h.Verify(encoded, "testpassword123")
	if err != nil {
		t.Fatalf("Verify: %v", err)
	}
	if needsRehash {
		t.Fatal("expected needsRehash == false for matching parameters")
	}
}

func TestArgon2idWeakerParamsRehash(t *testing.T) {
	// Hash with weaker params (testParams: 8, 1)
	weakHasher, err := NewArgon2id(testParams)
	if err != nil {
		t.Fatalf("NewArgon2id: %v", err)
	}

	encoded, err := weakHasher.Hash("testpassword123")
	if err != nil {
		t.Fatalf("Hash: %v", err)
	}

	// Verify with a stronger hasher (64*1024, 3)
	// Stored params (8, 1) are weaker than target (65536, 3) → needsRehash == true
	strongParams := Params{
		Memory:      64 * 1024,
		Iterations:  3,
		Parallelism: 1,
		SaltLength:  16,
		KeyLength:   32,
	}

	strongHasher, err := NewArgon2id(strongParams)
	if err != nil {
		t.Fatalf("NewArgon2id: %v", err)
	}

	needsRehash, err := strongHasher.Verify(encoded, "testpassword123")
	if err != nil {
		t.Fatalf("Verify: %v", err)
	}
	if !needsRehash {
		t.Fatal("expected needsRehash == true for weaker stored parameters")
	}
}

func TestArgon2idStrongerParamsNoRehash(t *testing.T) {
	// Hash with stronger params (64*1024, 3)
	strongParams := Params{
		Memory:      64 * 1024,
		Iterations:  3,
		Parallelism: 1,
		SaltLength:  16,
		KeyLength:   32,
	}

	strongHasher, err := NewArgon2id(strongParams)
	if err != nil {
		t.Fatalf("NewArgon2id: %v", err)
	}

	encoded, err := strongHasher.Hash("testpassword123")
	if err != nil {
		t.Fatalf("Hash: %v", err)
	}

	// Verify with a weaker hasher (testParams: 8, 1)
	// Stored params (65536, 3) are stronger than target (8, 1) → needsRehash == false
	weakHasher, err := NewArgon2id(testParams)
	if err != nil {
		t.Fatalf("NewArgon2id: %v", err)
	}

	needsRehash, err := weakHasher.Verify(encoded, "testpassword123")
	if err != nil {
		t.Fatalf("Verify: %v", err)
	}
	if needsRehash {
		t.Fatal("expected needsRehash == false for stronger stored parameters")
	}
}

func BenchmarkArgon2idHash(b *testing.B) {
	params := DefaultParams()
	h, err := NewArgon2id(params)
	if err != nil {
		b.Fatalf("NewArgon2id: %v", err)
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, err := h.Hash("benchmark-password-1234567890")
		if err != nil {
			b.Fatalf("Hash: %v", err)
		}
	}
}
