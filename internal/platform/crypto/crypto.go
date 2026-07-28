package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"os"
	"strings"
)

// Prefix identifies AES-256-GCM encrypted strings in Saturn storage.
const Prefix = "enc:v1:"

const defaultDevSecret = "saturn-dev-master-encryption-key-fallback"

// Cipher provides AES-256-GCM encryption and decryption.
type Cipher struct {
	key []byte
}

// NewCipher creates a Cipher using secretKey. If secretKey is empty,
// it checks the SATURN_ENCRYPTION_KEY env var, falling back to a default dev seed.
func NewCipher(secretKey string) (*Cipher, error) {
	if secretKey == "" {
		secretKey = os.Getenv("SATURN_ENCRYPTION_KEY")
	}
	if secretKey == "" {
		secretKey = defaultDevSecret
	}

	hash := sha256.Sum256([]byte(secretKey))
	return &Cipher{key: hash[:]}, nil
}

// Encrypt encrypts a plaintext string using AES-256-GCM.
// Returns enc:v1:<base64(nonce + ciphertext + tag)>.
func (c *Cipher) Encrypt(plaintext string) (string, error) {
	if plaintext == "" {
		return "", nil
	}
	// If already encrypted, return as-is
	if strings.HasPrefix(plaintext, Prefix) {
		return plaintext, nil
	}

	block, err := aes.NewCipher(c.key)
	if err != nil {
		return "", fmt.Errorf("create aes cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("create gcm: %w", err)
	}

	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", fmt.Errorf("generate nonce: %w", err)
	}

	ciphertext := gcm.Seal(nonce, nonce, []byte(plaintext), nil)
	return Prefix + base64.StdEncoding.EncodeToString(ciphertext), nil
}

// Decrypt decrypts an enc:v1:<base64> string.
// If the string does not have the enc:v1: prefix, it is returned as-is for backward compatibility.
func (c *Cipher) Decrypt(ciphertext string) (string, error) {
	if ciphertext == "" {
		return "", nil
	}
	if !strings.HasPrefix(ciphertext, Prefix) {
		// Passthrough for legacy unencrypted database rows
		return ciphertext, nil
	}

	raw := strings.TrimPrefix(ciphertext, Prefix)
	data, err := base64.StdEncoding.DecodeString(raw)
	if err != nil {
		return "", fmt.Errorf("decode base64: %w", err)
	}

	block, err := aes.NewCipher(c.key)
	if err != nil {
		return "", fmt.Errorf("create aes cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("create gcm: %w", err)
	}

	nonceSize := gcm.NonceSize()
	if len(data) < nonceSize {
		return "", errors.New("ciphertext payload too short")
	}

	nonce, ciphertextBytes := data[:nonceSize], data[nonceSize:]
	plaintext, err := gcm.Open(nil, nonce, ciphertextBytes, nil)
	if err != nil {
		return "", fmt.Errorf("decrypt failed: %w", err)
	}

	return string(plaintext), nil
}
