package totp_test

import (
	"testing"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/totp"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestTOTPGenerationAndValidation(t *testing.T) {
	p := totp.NewProvider()
	secret, err := p.GenerateSecret()
	require.NoError(t, err)
	assert.NotEmpty(t, secret)

	now := time.Now()
	code, err := p.GenerateCode(secret, now)
	require.NoError(t, err)
	assert.Len(t, code, 6)

	assert.True(t, p.ValidateCode(secret, code, now))
	assert.True(t, p.ValidateCode(secret, code, now.Add(25*time.Second)))
	assert.True(t, p.ValidateCode(secret, code, now.Add(-25*time.Second)))
	assert.False(t, p.ValidateCode(secret, code, now.Add(120*time.Second)))
	assert.False(t, p.ValidateCode(secret, "000000", now))
}

func TestBuildURI(t *testing.T) {
	uri := totp.BuildURI("JBSWY3DPEHPK3PXP", "user@example.com", "Saturn App")
	assert.Contains(t, uri, "otpauth://totp/Saturn+App:user%40example.com")
	assert.Contains(t, uri, "secret=JBSWY3DPEHPK3PXP")
}

func TestBackupCodes(t *testing.T) {
	p := totp.NewProvider()
	plain, hashed, err := p.GenerateBackupCodes()
	require.NoError(t, err)
	assert.Len(t, plain, 8)
	assert.Len(t, hashed, 8)

	for _, c := range plain {
		assert.Len(t, c, 9) // XXXX-XXXX
		assert.Equal(t, byte('-'), c[4])
	}

	remaining, ok := p.ValidateAndConsumeBackupCode(plain[0], hashed)
	assert.True(t, ok)
	assert.Len(t, remaining, 7)

	// Consumed code should no longer validate
	_, ok = p.ValidateAndConsumeBackupCode(plain[0], remaining)
	assert.False(t, ok)

	// Normalization allows case-insensitivity and dash omission
	cleaned := plain[1][:4] + plain[1][5:]
	remaining2, ok := p.ValidateAndConsumeBackupCode(cleaned, remaining)
	assert.True(t, ok)
	assert.Len(t, remaining2, 6)
}
