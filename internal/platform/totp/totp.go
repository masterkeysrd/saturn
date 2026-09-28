package totp

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha1"
	"crypto/subtle"
	"encoding/base32"
	"encoding/binary"
	"fmt"
	"net/url"
	"strings"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/hash"
)

// Provider implements the domain TOTPProvider interface using RFC 6238 TOTP math and SHA-256 backup codes.
type Provider struct{}

// NewProvider constructs a new Provider.
func NewProvider() *Provider {
	return &Provider{}
}

// GenerateSecret produces a cryptographically secure 160-bit (20-byte) secret, Base32 unpadded.
func (p *Provider) GenerateSecret() (string, error) {
	secretBytes := make([]byte, 20)
	if _, err := rand.Read(secretBytes); err != nil {
		return "", fmt.Errorf("generate random secret: %w", err)
	}
	return base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(secretBytes), nil
}

// GenerateCode computes the 6-digit TOTP code for a base32 secret at timestamp t (RFC 6238).
func (p *Provider) GenerateCode(secret string, t time.Time) (string, error) {
	cleanSecret := strings.ToUpper(strings.TrimSpace(secret))
	key, err := base32.StdEncoding.WithPadding(base32.NoPadding).DecodeString(cleanSecret)
	if err != nil {
		// Fallback with standard padding if present
		key, err = base32.StdEncoding.DecodeString(cleanSecret)
		if err != nil {
			return "", fmt.Errorf("decode base32 secret: %w", err)
		}
	}

	counter := uint64(t.Unix() / 30)
	counterBuf := make([]byte, 8)
	binary.BigEndian.PutUint64(counterBuf, counter)

	mac := hmac.New(sha1.New, key)
	mac.Write(counterBuf)
	h := mac.Sum(nil)

	offset := h[len(h)-1] & 0x0f
	binaryCode := (binary.BigEndian.Uint32(h[offset:offset+4]) & 0x7fffffff) % 1000000

	return fmt.Sprintf("%06d", binaryCode), nil
}

// ValidateCode validates a 6-digit code against a secret with a +-1 step (30s) tolerance window.
func (p *Provider) ValidateCode(secret, code string, t time.Time) bool {
	cleanCode := strings.TrimSpace(code)
	if len(cleanCode) != 6 {
		return false
	}

	for _, stepOffset := range []int64{-1, 0, 1} {
		stepTime := t.Add(time.Duration(stepOffset*30) * time.Second)
		expected, err := p.GenerateCode(secret, stepTime)
		if err == nil && subtle.ConstantTimeCompare([]byte(cleanCode), []byte(expected)) == 1 {
			return true
		}
	}

	return false
}

// BuildURI constructs the standard `otpauth://totp/...` URI for authenticator applications.
func BuildURI(secret, accountName, issuer string) string {
	escapedIssuer := url.QueryEscape(issuer)
	escapedAccount := url.QueryEscape(accountName)
	return fmt.Sprintf("otpauth://totp/%s:%s?secret=%s&issuer=%s&algorithm=SHA1&digits=6&period=30",
		escapedIssuer, escapedAccount, secret, escapedIssuer)
}

// BuildURI constructs the standard `otpauth://totp/...` URI on Provider.
func (p *Provider) BuildURI(secret, accountName, issuer string) string {
	return BuildURI(secret, accountName, issuer)
}

const backupCodeCharset = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ" // 32 unambiguous characters

// GenerateBackupCodes produces 8 single-use codes formatted as XXXX-XXXX along with their secure hashes.
func (p *Provider) GenerateBackupCodes() (plainCodes []string, hashedCodes []string, err error) {
	plainCodes = make([]string, 8)
	hashedCodes = make([]string, 8)

	for i := 0; i < 8; i++ {
		raw := make([]byte, 8)
		if _, err := rand.Read(raw); err != nil {
			return nil, nil, fmt.Errorf("generate random backup code: %w", err)
		}
		var sb strings.Builder
		for j, b := range raw {
			if j == 4 {
				sb.WriteByte('-')
			}
			sb.WriteByte(backupCodeCharset[int(b)%len(backupCodeCharset)])
		}
		code := sb.String()
		plainCodes[i] = code
		hashedCodes[i] = hashBackupCode(code)
	}

	return plainCodes, hashedCodes, nil
}

// ValidateAndConsumeBackupCode verifies if rawCode matches any stored hash and returns remaining hashes.
func (p *Provider) ValidateAndConsumeBackupCode(rawCode string, storedHashes []string) (remaining []string, valid bool) {
	targetHash := hashBackupCode(rawCode)
	for i, h := range storedHashes {
		if subtle.ConstantTimeCompare([]byte(h), []byte(targetHash)) == 1 {
			remaining = make([]string, 0, len(storedHashes)-1)
			remaining = append(remaining, storedHashes[:i]...)
			remaining = append(remaining, storedHashes[i+1:]...)
			return remaining, true
		}
	}
	return storedHashes, false
}

func hashBackupCode(code string) string {
	clean := strings.ToUpper(strings.TrimSpace(code))
	clean = strings.ReplaceAll(clean, "-", "")
	clean = strings.ReplaceAll(clean, " ", "")
	return fmt.Sprintf("%x", hash.SHA256String(clean))
}
