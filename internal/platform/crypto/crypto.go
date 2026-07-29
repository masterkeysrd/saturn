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
	"strings"

	"golang.org/x/crypto/hkdf"
)

// Prefix identifies AES-256-GCM encrypted strings in Saturn storage.
const Prefix = "enc:v1:"

const defaultDevSecret = "saturn-dev-master-encryption-key-fallback"

const (
	saltSize   = 16
	infoString = "saturn-aes-256-gcm-key"
)

// Cipher provides AES-256-GCM encryption and decryption with per-field random HKDF salt derivation.
type Cipher struct {
	secretKey string
}

// NewCipher creates a Cipher using secretKey. If secretKey is empty,
// it falls back to a default dev seed for local development.
func NewCipher(secretKey string) (*Cipher, error) {
	if secretKey == "" {
		secretKey = defaultDevSecret
	}

	return &Cipher{secretKey: secretKey}, nil
}

func (c *Cipher) deriveKey(salt []byte) ([]byte, error) {
	hkdfReader := hkdf.New(sha256.New, []byte(c.secretKey), salt, []byte(infoString))
	key := make([]byte, 32)
	if _, err := io.ReadFull(hkdfReader, key); err != nil {
		return nil, fmt.Errorf("derive key via hkdf: %w", err)
	}
	return key, nil
}

// Encrypt encrypts a plaintext string using AES-256-GCM with a random per-field HKDF salt.
// Returns enc:v1:<base64(salt)>:<base64(nonce + ciphertext + tag)>.
func (c *Cipher) Encrypt(plaintext string) (string, error) {
	if plaintext == "" {
		return "", nil
	}
	// If already encrypted, return as-is
	if strings.HasPrefix(plaintext, Prefix) {
		return plaintext, nil
	}

	salt := make([]byte, saltSize)
	if _, err := io.ReadFull(rand.Reader, salt); err != nil {
		return "", fmt.Errorf("generate random salt: %w", err)
	}

	key, err := c.deriveKey(salt)
	if err != nil {
		return "", err
	}

	block, err := aes.NewCipher(key)
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
	return Prefix + base64.StdEncoding.EncodeToString(salt) + ":" + base64.StdEncoding.EncodeToString(ciphertext), nil
}

// Decrypt decrypts an enc:v1:<salt_b64>:<payload_b64> string.
// If the string does not have the enc:v1: prefix, it is returned as-is for backward compatibility with unencrypted rows.
func (c *Cipher) Decrypt(ciphertext string) (string, error) {
	if ciphertext == "" {
		return "", nil
	}
	if !strings.HasPrefix(ciphertext, Prefix) {
		// Passthrough for legacy unencrypted database rows
		return ciphertext, nil
	}

	raw := strings.TrimPrefix(ciphertext, Prefix)
	parts := strings.SplitN(raw, ":", 2)
	if len(parts) < 2 {
		return "", errors.New("invalid ciphertext format")
	}

	salt, err := base64.StdEncoding.DecodeString(parts[0])
	if err != nil {
		return "", fmt.Errorf("decode salt base64: %w", err)
	}

	data, err := base64.StdEncoding.DecodeString(parts[1])
	if err != nil {
		return "", fmt.Errorf("decode payload base64: %w", err)
	}

	key, err := c.deriveKey(salt)
	if err != nil {
		return "", err
	}

	block, err := aes.NewCipher(key)
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
