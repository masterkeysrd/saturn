package crypto_test

import (
	"strings"
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

	if !strings.HasPrefix(enc, crypto.Prefix) {
		t.Errorf("encrypted string missing prefix enc:v1:, got %s", enc)
	}

	if !strings.Contains(strings.TrimPrefix(enc, crypto.Prefix), ":") {
		t.Errorf("encrypted string missing salt:payload colon delimiter, got %s", enc)
	}

	dec, err := cipher.Decrypt(enc)
	if err != nil {
		t.Fatalf("decryption failed: %v", err)
	}

	if dec != rawKey {
		t.Errorf("expected %s, got %s", rawKey, dec)
	}
}

func TestCipher_UniqueRandomSaltsPerEncryption(t *testing.T) {
	cipher, err := crypto.NewCipher("test-master-secret-key")
	if err != nil {
		t.Fatalf("failed to create cipher: %v", err)
	}

	plaintext := "sensitive-llm-api-token-123"

	enc1, err := cipher.Encrypt(plaintext)
	if err != nil {
		t.Fatalf("enc1 failed: %v", err)
	}

	enc2, err := cipher.Encrypt(plaintext)
	if err != nil {
		t.Fatalf("enc2 failed: %v", err)
	}

	if enc1 == enc2 {
		t.Errorf("enc1 and enc2 should have distinct random salts, but were identical: %s", enc1)
	}

	dec1, err := cipher.Decrypt(enc1)
	if err != nil || dec1 != plaintext {
		t.Errorf("dec1 failed: got %s, err: %v", dec1, err)
	}

	dec2, err := cipher.Decrypt(enc2)
	if err != nil || dec2 != plaintext {
		t.Errorf("dec2 failed: got %s, err: %v", dec2, err)
	}
}

func TestCipher_UnencryptedPassthrough(t *testing.T) {
	cipher, err := crypto.NewCipher("test-master-secret-key")
	if err != nil {
		t.Fatalf("failed to create cipher: %v", err)
	}

	unencryptedRow := "sk-legacy-unencrypted-key"
	dec, err := cipher.Decrypt(unencryptedRow)
	if err != nil {
		t.Fatalf("decryption of legacy key failed: %v", err)
	}

	if dec != unencryptedRow {
		t.Errorf("expected legacy plaintext %s, got %s", unencryptedRow, dec)
	}
}

func TestCipher_InvalidCiphertextFormat(t *testing.T) {
	cipher, err := crypto.NewCipher("test-master-secret-key")
	if err != nil {
		t.Fatalf("failed to create cipher: %v", err)
	}

	invalidPayload := "enc:v1:nocolonpayload"
	_, err = cipher.Decrypt(invalidPayload)
	if err == nil {
		t.Errorf("expected error when decrypting payload without salt:payload delimiter, got nil")
	}
}
