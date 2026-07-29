package app

import (
	"os"
	"testing"
)

func TestConfig_EncryptionKeyBinding(t *testing.T) {
	os.Setenv("SATURN_SECURITY_ENCRYPTION_KEY", "prod-secret-key-1234567890123456")
	defer os.Unsetenv("SATURN_SECURITY_ENCRYPTION_KEY")

	v := NewViper()
	cfg := LoadConfig(v)

	if cfg.Security.EncryptionKey != "prod-secret-key-1234567890123456" {
		t.Errorf("expected Security.EncryptionKey to be 'prod-secret-key-1234567890123456', got %q", cfg.Security.EncryptionKey)
	}
}
