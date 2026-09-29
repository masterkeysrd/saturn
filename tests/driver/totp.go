//go:build integration

package driver

import (
	"crypto/hmac"
	"crypto/sha1"
	"encoding/base32"
	"encoding/binary"
	"fmt"
	"strings"
	"testing"
	"time"
)

// GenerateTestTOTP computes the 6-digit RFC 6238 time-based one-time password (TOTP)
// for a Base32 shared secret at the current timestamp using standard library primitives only.
func GenerateTestTOTP(tb testing.TB, secret string) string {
	tb.Helper()

	cleanSecret := strings.ToUpper(strings.TrimSpace(secret))
	key, err := base32.StdEncoding.WithPadding(base32.NoPadding).DecodeString(cleanSecret)
	if err != nil {
		key, err = base32.StdEncoding.DecodeString(cleanSecret)
		if err != nil {
			tb.Fatalf("failed to decode base32 TOTP secret: %v", err)
		}
	}

	counter := uint64(time.Now().Unix() / 30)
	counterBuf := make([]byte, 8)
	binary.BigEndian.PutUint64(counterBuf, counter)

	mac := hmac.New(sha1.New, key)
	mac.Write(counterBuf)
	h := mac.Sum(nil)

	offset := h[len(h)-1] & 0x0f
	binaryCode := (binary.BigEndian.Uint32(h[offset:offset+4]) & 0x7fffffff) % 1000000

	return fmt.Sprintf("%06d", binaryCode)
}
