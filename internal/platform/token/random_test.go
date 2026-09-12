package token

import (
	"encoding/hex"
	"testing"
)

func TestGenerateRandomBytes(t *testing.T) {
	tests := []int{0, 16, 32, 64}
	for _, size := range tests {
		b, err := GenerateRandomBytes(size)
		if err != nil {
			t.Fatalf("GenerateRandomBytes(%d) error: %v", size, err)
		}
		if len(b) != size {
			t.Errorf("GenerateRandomBytes(%d) returned %d bytes, expected %d", size, len(b), size)
		}
	}

	// Verify randomness across invocations
	b1, err := GenerateRandomBytes(32)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	b2, err := GenerateRandomBytes(32)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if string(b1) == string(b2) {
		t.Error("consecutive GenerateRandomBytes calls returned identical bytes")
	}
}

func TestGenerateRandomHex(t *testing.T) {
	tests := []int{0, 8, 16, 32}
	for _, length := range tests {
		s, err := GenerateRandomHex(length)
		if err != nil {
			t.Fatalf("GenerateRandomHex(%d) error: %v", length, err)
		}
		if len(s) != length*2 {
			t.Errorf("GenerateRandomHex(%d) returned string of length %d, expected %d", length, len(s), length*2)
		}
		decoded, err := hex.DecodeString(s)
		if err != nil {
			t.Errorf("GenerateRandomHex(%d) returned invalid hex: %v", length, err)
		}
		if len(decoded) != length {
			t.Errorf("decoded length = %d, expected %d", len(decoded), length)
		}
	}

	// Verify randomness across invocations
	s1, err := GenerateRandomHex(16)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	s2, err := GenerateRandomHex(16)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if s1 == s2 {
		t.Error("consecutive GenerateRandomHex calls returned identical strings")
	}
}
