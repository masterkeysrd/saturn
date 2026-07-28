package crypto_test

import (
	"testing"

	"github.com/masterkeysrd/saturn/internal/platform/crypto"
)

func TestCipher_EncryptDecrypt(t *testing.T) {
	cipher, err := crypto.NewCipher("test-master-secret-key")
	if err != nil {
		t.Fatalf("failed to create cipher: %v", err)
	}

	rawKey := "sk-proj-1234567890abcdef"

	enc, err := cipher.Encrypt(rawKey)
	if err != nil {
		t.Fatalf("encryption failed: %v", err)
	}

	if enc == rawKey {
		t.Errorf("encrypted text should not equal plaintext")
	}

	if !testing.Short() && enc[:7] != crypto.Prefix {
		t.Errorf("encrypted string missing prefix enc:v1:, got %s", enc)
	}

	dec, err := cipher.Decrypt(enc)
	if err != nil {
		t.Fatalf("decryption failed: %v", err)
	}

	if dec != rawKey {
		t.Errorf("expected %s, got %s", rawKey, dec)
	}
}

func TestCipher_BackwardCompatibility(t *testing.T) {
	cipher, err := crypto.NewCipher("test-master-secret-key")
	if err != nil {
		t.Fatalf("failed to create cipher: %v", err)
	}

	legacyPlaintext := "sk-legacy-unencrypted-key"
	dec, err := cipher.Decrypt(legacyPlaintext)
	if err != nil {
		t.Fatalf("decryption of legacy key failed: %v", err)
	}

	if dec != legacyPlaintext {
		t.Errorf("expected legacy plaintext %s, got %s", legacyPlaintext, dec)
	}
}
