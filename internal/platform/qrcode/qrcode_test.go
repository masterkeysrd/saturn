package qrcode_test

import (
	"testing"

	"github.com/masterkeysrd/saturn/internal/platform/qrcode"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGenerateSVG(t *testing.T) {
	svg, err := qrcode.GenerateSVG("otpauth://totp/Saturn:user?secret=JBSWY3DPEHPK3PXP")
	require.NoError(t, err)
	assert.Contains(t, svg, "<svg")
	assert.Contains(t, svg, "</svg>")
	assert.Contains(t, svg, "viewBox=")
}
