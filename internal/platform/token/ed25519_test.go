package token

import (
	"crypto/ed25519"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

func validTestConfig() Config {
	return Config{
		Issuer:      "saturn-test",
		Audience:    "saturn-api",
		AccessTTL:   15 * time.Minute,
		ClockSkew:   30 * time.Second,
		ActiveKeyID: "key-1",
	}
}

func TestConfig_Validate(t *testing.T) {
	valid := validTestConfig()
	if err := valid.Validate(); err != nil {
		t.Fatalf("expected valid config to pass, got: %v", err)
	}

	tests := []struct {
		name        string
		modify      func(c *Config)
		errContains string
	}{
		{
			name:        "empty issuer",
			modify:      func(c *Config) { c.Issuer = "" },
			errContains: "issuer must not be empty",
		},
		{
			name:        "empty audience",
			modify:      func(c *Config) { c.Audience = "" },
			errContains: "audience must not be empty",
		},
		{
			name:        "zero access TTL",
			modify:      func(c *Config) { c.AccessTTL = 0 },
			errContains: "access TTL must be positive",
		},
		{
			name:        "negative access TTL",
			modify:      func(c *Config) { c.AccessTTL = -time.Minute },
			errContains: "access TTL must be positive",
		},
		{
			name:        "negative clock skew",
			modify:      func(c *Config) { c.ClockSkew = -time.Second },
			errContains: "clock skew must be non-negative",
		},
		{
			name:        "empty active key ID",
			modify:      func(c *Config) { c.ActiveKeyID = "" },
			errContains: "active key ID must not be empty",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cfg := validTestConfig()
			tt.modify(&cfg)
			err := cfg.Validate()
			if err == nil {
				t.Fatalf("expected error for %s, got nil", tt.name)
			}
			if !strings.Contains(err.Error(), tt.errContains) {
				t.Errorf("expected error to contain %q, got %q", tt.errContains, err.Error())
			}
		})
	}
}

func TestNewEd25519Service(t *testing.T) {
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatalf("failed to generate key: %v", err)
	}

	// Invalid config
	invalidCfg := validTestConfig()
	invalidCfg.Issuer = ""
	if _, err := NewEd25519Service(invalidCfg, priv, nil); err == nil {
		t.Fatal("expected error with invalid config, got nil")
	}

	// Invalid private key size
	validCfg := validTestConfig()
	if _, err := NewEd25519Service(validCfg, priv[:32], nil); err == nil {
		t.Fatal("expected error with invalid private key size, got nil")
	}

	// Auto-derive public key when publicKeys map is empty
	svc, err := NewEd25519Service(validCfg, priv, nil)
	if err != nil {
		t.Fatalf("failed to create service with nil publicKeys: %v", err)
	}
	if len(svc.publicKeys) != 1 || !svc.publicKeys[validCfg.ActiveKeyID].Equal(pub) {
		t.Errorf("expected derived public key for %s", validCfg.ActiveKeyID)
	}

	// Explicit public keys map
	pubs := map[string]ed25519.PublicKey{
		validCfg.ActiveKeyID: pub,
	}
	svc2, err := NewEd25519Service(validCfg, priv, pubs)
	if err != nil {
		t.Fatalf("failed to create service with explicit publicKeys: %v", err)
	}
	if len(svc2.publicKeys) != 1 {
		t.Errorf("expected 1 public key, got %d", len(svc2.publicKeys))
	}
}

func TestIssueAndValidateAccessToken(t *testing.T) {
	svc, err := NewTestService()
	if err != nil {
		t.Fatalf("failed to create test service: %v", err)
	}

	now := time.Now().Truncate(time.Second)
	input := IssueInput{
		Subject:     "usr_12345",
		AccessLevel: "admin",
		AuthVersion: 1,
	}

	raw, expiresAt, err := svc.IssueAccessToken(input, now)
	if err != nil {
		t.Fatalf("IssueAccessToken failed: %v", err)
	}
	if raw == "" {
		t.Fatal("expected non-empty token")
	}
	expectedExpiry := now.Add(svc.config.AccessTTL)
	if !expiresAt.Equal(expectedExpiry) {
		t.Errorf("expected expiresAt %v, got %v", expectedExpiry, expiresAt)
	}

	// Validate valid token
	claims, err := svc.ValidateAccessToken(raw, now)
	if err != nil {
		t.Fatalf("ValidateAccessToken failed: %v", err)
	}
	if claims.Subject != input.Subject {
		t.Errorf("expected subject %s, got %s", input.Subject, claims.Subject)
	}
	if claims.AccessLevel != input.AccessLevel {
		t.Errorf("expected access level %s, got %s", input.AccessLevel, claims.AccessLevel)
	}
	if claims.AuthVersion != input.AuthVersion {
		t.Errorf("expected auth version %d, got %d", input.AuthVersion, claims.AuthVersion)
	}
	if claims.TokenUse != "access" {
		t.Errorf("expected token_use 'access', got %s", claims.TokenUse)
	}
	if claims.ID == "" {
		t.Error("expected non-empty JTI ID")
	}
}

func TestValidateAccessToken_Errors(t *testing.T) {
	svc, err := NewTestService()
	if err != nil {
		t.Fatalf("failed to create test service: %v", err)
	}

	now := time.Now().Truncate(time.Second)
	input := IssueInput{
		Subject:     "usr_12345",
		AccessLevel: "member",
		AuthVersion: 1,
	}

	// Empty string
	if _, err := svc.ValidateAccessToken("", now); err != ErrInvalidToken {
		t.Errorf("expected ErrInvalidToken for empty string, got: %v", err)
	}
	if _, err := svc.ValidateAccessToken("   ", now); err != ErrInvalidToken {
		t.Errorf("expected ErrInvalidToken for whitespace string, got: %v", err)
	}

	// Tampered raw token
	validRaw, _, _ := svc.IssueAccessToken(input, now)
	tampered := validRaw[:len(validRaw)-4] + "AAAA"
	if _, err := svc.ValidateAccessToken(tampered, now); err != ErrInvalidToken {
		t.Errorf("expected ErrInvalidToken for tampered token, got: %v", err)
	}

	// Refresh token passed as access token
	refreshRaw, _, _ := svc.IssueRefreshToken(input, now, now.Add(24*time.Hour))
	if _, err := svc.ValidateAccessToken(refreshRaw, now); err != ErrInvalidToken {
		t.Errorf("expected ErrInvalidToken for refresh token passed as access token, got: %v", err)
	}

	// Expired access token
	pastNow := now.Add(20 * time.Minute)
	if _, err := svc.ValidateAccessToken(validRaw, pastNow); err != ErrExpiredToken {
		t.Errorf("expected ErrExpiredToken for expired token, got: %v", err)
	}

	// Negative AuthVersion
	negToken := jwt.NewWithClaims(jwt.SigningMethodEdDSA, &Claims{
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    svc.config.Issuer,
			Subject:   "usr_neg",
			Audience:  []string{svc.config.Audience},
			ExpiresAt: jwt.NewNumericDate(now.Add(svc.config.AccessTTL)),
			IssuedAt:  jwt.NewNumericDate(now),
			NotBefore: jwt.NewNumericDate(now),
			ID:        "jti_neg",
		},
		TokenUse:    "access",
		AuthVersion: -1,
	})
	negToken.Header["kid"] = svc.activeKeyID
	negRaw, err := negToken.SignedString(svc.activePriv)
	if err != nil {
		t.Fatalf("failed to sign token: %v", err)
	}
	if _, err := svc.ValidateAccessToken(negRaw, now); err != ErrInvalidToken {
		t.Errorf("expected ErrInvalidToken for negative auth version, got: %v", err)
	}

	// Missing kid
	noKidToken := jwt.NewWithClaims(jwt.SigningMethodEdDSA, &Claims{
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    svc.config.Issuer,
			Subject:   "usr_nokid",
			Audience:  []string{svc.config.Audience},
			ExpiresAt: jwt.NewNumericDate(now.Add(svc.config.AccessTTL)),
			IssuedAt:  jwt.NewNumericDate(now),
			NotBefore: jwt.NewNumericDate(now),
			ID:        "jti_nokid",
		},
		TokenUse: "access",
	})
	noKidRaw, err := noKidToken.SignedString(svc.activePriv)
	if err != nil {
		t.Fatalf("failed to sign token: %v", err)
	}
	if _, err := svc.ValidateAccessToken(noKidRaw, now); err != ErrInvalidToken {
		t.Errorf("expected ErrInvalidToken for missing kid, got: %v", err)
	}

	// Unknown kid
	unknownKidToken := jwt.NewWithClaims(jwt.SigningMethodEdDSA, &Claims{
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    svc.config.Issuer,
			Subject:   "usr_unk",
			Audience:  []string{svc.config.Audience},
			ExpiresAt: jwt.NewNumericDate(now.Add(svc.config.AccessTTL)),
			IssuedAt:  jwt.NewNumericDate(now),
			NotBefore: jwt.NewNumericDate(now),
			ID:        "jti_unk",
		},
		TokenUse: "access",
	})
	unknownKidToken.Header["kid"] = "unknown-key-999"
	unkRaw, err := unknownKidToken.SignedString(svc.activePriv)
	if err != nil {
		t.Fatalf("failed to sign token: %v", err)
	}
	if _, err := svc.ValidateAccessToken(unkRaw, now); err != ErrInvalidToken {
		t.Errorf("expected ErrInvalidToken for unknown kid, got: %v", err)
	}

	// Wrong signing method (HMAC)
	hsToken := jwt.NewWithClaims(jwt.SigningMethodHS256, &Claims{
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    svc.config.Issuer,
			Subject:   "usr_hs",
			Audience:  []string{svc.config.Audience},
			ExpiresAt: jwt.NewNumericDate(now.Add(svc.config.AccessTTL)),
			IssuedAt:  jwt.NewNumericDate(now),
			NotBefore: jwt.NewNumericDate(now),
			ID:        "jti_hs",
		},
		TokenUse: "access",
	})
	hsToken.Header["kid"] = svc.activeKeyID
	hsRaw, err := hsToken.SignedString([]byte("secret"))
	if err != nil {
		t.Fatalf("failed to sign hs token: %v", err)
	}
	if _, err := svc.ValidateAccessToken(hsRaw, now); err != ErrInvalidToken {
		t.Errorf("expected ErrInvalidToken for HMAC signing method, got: %v", err)
	}

	// Missing basic claims (missing subject)
	missingSubToken := jwt.NewWithClaims(jwt.SigningMethodEdDSA, &Claims{
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    svc.config.Issuer,
			Audience:  []string{svc.config.Audience},
			ExpiresAt: jwt.NewNumericDate(now.Add(svc.config.AccessTTL)),
			IssuedAt:  jwt.NewNumericDate(now),
			NotBefore: jwt.NewNumericDate(now),
			ID:        "jti_nosub",
		},
		TokenUse: "access",
	})
	missingSubToken.Header["kid"] = svc.activeKeyID
	missingSubRaw, err := missingSubToken.SignedString(svc.activePriv)
	if err != nil {
		t.Fatalf("failed to sign token: %v", err)
	}
	if _, err := svc.ValidateAccessToken(missingSubRaw, now); err != ErrInvalidToken {
		t.Errorf("expected ErrInvalidToken for missing subject claim, got: %v", err)
	}

	// Missing JTI ID
	missingIDToken := jwt.NewWithClaims(jwt.SigningMethodEdDSA, &Claims{
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    svc.config.Issuer,
			Subject:   "usr_noid",
			Audience:  []string{svc.config.Audience},
			ExpiresAt: jwt.NewNumericDate(now.Add(svc.config.AccessTTL)),
			IssuedAt:  jwt.NewNumericDate(now),
			NotBefore: jwt.NewNumericDate(now),
		},
		TokenUse: "access",
	})
	missingIDToken.Header["kid"] = svc.activeKeyID
	missingIDRaw, err := missingIDToken.SignedString(svc.activePriv)
	if err != nil {
		t.Fatalf("failed to sign token: %v", err)
	}
	if _, err := svc.ValidateAccessToken(missingIDRaw, now); err != ErrInvalidToken {
		t.Errorf("expected ErrInvalidToken for missing JTI claim, got: %v", err)
	}

	// Token with future NotBefore rejected by parser as invalid token
	futureNbfToken := jwt.NewWithClaims(jwt.SigningMethodEdDSA, &Claims{
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    svc.config.Issuer,
			Subject:   "usr_nbf",
			Audience:  []string{svc.config.Audience},
			ExpiresAt: jwt.NewNumericDate(now.Add(svc.config.AccessTTL)),
			IssuedAt:  jwt.NewNumericDate(now),
			NotBefore: jwt.NewNumericDate(now.Add(2 * time.Minute)), // beyond 30s clock skew
			ID:        "jti_nbf",
		},
		TokenUse: "access",
	})
	futureNbfToken.Header["kid"] = svc.activeKeyID
	futureNbfRaw, err := futureNbfToken.SignedString(svc.activePriv)
	if err != nil {
		t.Fatalf("failed to sign token: %v", err)
	}
	if _, err := svc.ValidateAccessToken(futureNbfRaw, now); err != ErrInvalidToken {
		t.Errorf("expected ErrInvalidToken from parser for future NotBefore, got: %v", err)
	}

	// Valid token validated at a past time (simulating token not yet valid at that time)
	pastEvaluationTime := now.Add(-time.Minute)
	if _, err := svc.ValidateAccessToken(validRaw, pastEvaluationTime); err != ErrExpiredToken {
		t.Errorf("expected ErrExpiredToken when evaluated before NotBefore/IssuedAt, got: %v", err)
	}
}

func TestIssueAndValidateRefreshToken(t *testing.T) {
	svc, err := NewTestService()
	if err != nil {
		t.Fatalf("failed to create test service: %v", err)
	}

	now := time.Now().Truncate(time.Second)
	expiry := now.Add(30 * 24 * time.Hour)
	input := IssueInput{
		Subject:     "usr_refresh_1",
		AccessLevel: "member",
		AuthVersion: 2,
	}

	raw, returnedExpiry, err := svc.IssueRefreshToken(input, now, expiry)
	if err != nil {
		t.Fatalf("IssueRefreshToken failed: %v", err)
	}
	if !returnedExpiry.Equal(expiry) {
		t.Errorf("expected expiry %v, got %v", expiry, returnedExpiry)
	}

	// Validate valid refresh token
	claims, err := svc.ValidateRefreshToken(raw, now)
	if err != nil {
		t.Fatalf("ValidateRefreshToken failed: %v", err)
	}
	if claims.Subject != input.Subject {
		t.Errorf("expected subject %s, got %s", input.Subject, claims.Subject)
	}
	if claims.TokenUse != "refresh" {
		t.Errorf("expected token_use 'refresh', got %s", claims.TokenUse)
	}
	if claims.AuthVersion != input.AuthVersion {
		t.Errorf("expected auth version %d, got %d", input.AuthVersion, claims.AuthVersion)
	}
}

func TestValidateRefreshToken_Errors(t *testing.T) {
	svc, err := NewTestService()
	if err != nil {
		t.Fatalf("failed to create test service: %v", err)
	}

	now := time.Now().Truncate(time.Second)
	input := IssueInput{
		Subject:     "usr_refresh_err",
		AccessLevel: "member",
		AuthVersion: 1,
	}

	// Empty string
	if _, err := svc.ValidateRefreshToken("", now); err != ErrInvalidToken {
		t.Errorf("expected ErrInvalidToken for empty string, got: %v", err)
	}
	if _, err := svc.ValidateRefreshToken("   ", now); err != ErrInvalidToken {
		t.Errorf("expected ErrInvalidToken for whitespace string, got: %v", err)
	}

	// Malformed token
	if _, err := svc.ValidateRefreshToken("not.a.valid.jwt", now); err != ErrInvalidToken {
		t.Errorf("expected ErrInvalidToken for malformed token, got: %v", err)
	}

	// Access token passed as refresh token
	accessRaw, _, _ := svc.IssueAccessToken(input, now)
	if _, err := svc.ValidateRefreshToken(accessRaw, now); err != ErrInvalidToken {
		t.Errorf("expected ErrInvalidToken for access token passed to ValidateRefreshToken, got: %v", err)
	}

	// Expired refresh token (tested by validating at a future time past absolute expiry)
	refreshRaw, _, _ := svc.IssueRefreshToken(input, now, now.Add(time.Hour))
	if _, err := svc.ValidateRefreshToken(refreshRaw, now.Add(2*time.Hour)); err != ErrExpiredToken {
		t.Errorf("expected ErrExpiredToken for expired refresh token, got: %v", err)
	}

	// Negative AuthVersion
	negToken := jwt.NewWithClaims(jwt.SigningMethodEdDSA, &Claims{
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    svc.config.Issuer,
			Subject:   "usr_neg",
			Audience:  []string{svc.config.Audience},
			ExpiresAt: jwt.NewNumericDate(now.Add(time.Hour)),
			IssuedAt:  jwt.NewNumericDate(now),
			NotBefore: jwt.NewNumericDate(now),
			ID:        "jti_neg",
		},
		TokenUse:    "refresh",
		AuthVersion: -1,
	})
	negToken.Header["kid"] = svc.activeKeyID
	negRaw, err := negToken.SignedString(svc.activePriv)
	if err != nil {
		t.Fatalf("failed to sign token: %v", err)
	}
	if _, err := svc.ValidateRefreshToken(negRaw, now); err != ErrInvalidToken {
		t.Errorf("expected ErrInvalidToken for negative auth version, got: %v", err)
	}

	// Missing kid
	noKidToken := jwt.NewWithClaims(jwt.SigningMethodEdDSA, &Claims{
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    svc.config.Issuer,
			Subject:   "usr_nokid",
			Audience:  []string{svc.config.Audience},
			ExpiresAt: jwt.NewNumericDate(now.Add(time.Hour)),
			IssuedAt:  jwt.NewNumericDate(now),
			NotBefore: jwt.NewNumericDate(now),
			ID:        "jti_nokid",
		},
		TokenUse: "refresh",
	})
	noKidRaw, err := noKidToken.SignedString(svc.activePriv)
	if err != nil {
		t.Fatalf("failed to sign token: %v", err)
	}
	if _, err := svc.ValidateRefreshToken(noKidRaw, now); err != ErrInvalidToken {
		t.Errorf("expected ErrInvalidToken for missing kid, got: %v", err)
	}

	// Unknown kid
	unkKidToken := jwt.NewWithClaims(jwt.SigningMethodEdDSA, &Claims{
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    svc.config.Issuer,
			Subject:   "usr_unk",
			Audience:  []string{svc.config.Audience},
			ExpiresAt: jwt.NewNumericDate(now.Add(time.Hour)),
			IssuedAt:  jwt.NewNumericDate(now),
			NotBefore: jwt.NewNumericDate(now),
			ID:        "jti_unk",
		},
		TokenUse: "refresh",
	})
	unkKidToken.Header["kid"] = "unknown-id"
	unkRaw, err := unkKidToken.SignedString(svc.activePriv)
	if err != nil {
		t.Fatalf("failed to sign token: %v", err)
	}
	if _, err := svc.ValidateRefreshToken(unkRaw, now); err != ErrInvalidToken {
		t.Errorf("expected ErrInvalidToken for unknown kid, got: %v", err)
	}

	// Wrong signing method (HMAC)
	hsToken := jwt.NewWithClaims(jwt.SigningMethodHS256, &Claims{
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    svc.config.Issuer,
			Subject:   "usr_hs",
			Audience:  []string{svc.config.Audience},
			ExpiresAt: jwt.NewNumericDate(now.Add(time.Hour)),
			IssuedAt:  jwt.NewNumericDate(now),
			NotBefore: jwt.NewNumericDate(now),
			ID:        "jti_hs",
		},
		TokenUse: "refresh",
	})
	hsToken.Header["kid"] = svc.activeKeyID
	hsRaw, err := hsToken.SignedString([]byte("secret"))
	if err != nil {
		t.Fatalf("failed to sign hs token: %v", err)
	}
	if _, err := svc.ValidateRefreshToken(hsRaw, now); err != ErrInvalidToken {
		t.Errorf("expected ErrInvalidToken for HMAC signing method, got: %v", err)
	}

	// Missing basic claims (missing issuer)
	missingIssToken := jwt.NewWithClaims(jwt.SigningMethodEdDSA, &Claims{
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   "usr_noiss",
			Audience:  []string{svc.config.Audience},
			ExpiresAt: jwt.NewNumericDate(now.Add(time.Hour)),
			IssuedAt:  jwt.NewNumericDate(now),
			NotBefore: jwt.NewNumericDate(now),
			ID:        "jti_noiss",
		},
		TokenUse: "refresh",
	})
	missingIssToken.Header["kid"] = svc.activeKeyID
	missingIssRaw, err := missingIssToken.SignedString(svc.activePriv)
	if err != nil {
		t.Fatalf("failed to sign token: %v", err)
	}
	if _, err := svc.ValidateRefreshToken(missingIssRaw, now); err != ErrInvalidToken {
		t.Errorf("expected ErrInvalidToken for missing issuer, got: %v", err)
	}

	// Missing JTI ID
	missingIDToken := jwt.NewWithClaims(jwt.SigningMethodEdDSA, &Claims{
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    svc.config.Issuer,
			Subject:   "usr_noid",
			Audience:  []string{svc.config.Audience},
			ExpiresAt: jwt.NewNumericDate(now.Add(time.Hour)),
			IssuedAt:  jwt.NewNumericDate(now),
			NotBefore: jwt.NewNumericDate(now),
		},
		TokenUse: "refresh",
	})
	missingIDToken.Header["kid"] = svc.activeKeyID
	missingIDRaw, err := missingIDToken.SignedString(svc.activePriv)
	if err != nil {
		t.Fatalf("failed to sign token: %v", err)
	}
	if _, err := svc.ValidateRefreshToken(missingIDRaw, now); err != ErrInvalidToken {
		t.Errorf("expected ErrInvalidToken for missing JTI claim, got: %v", err)
	}

	// Future NotBefore rejected by parser
	futureNbfToken := jwt.NewWithClaims(jwt.SigningMethodEdDSA, &Claims{
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    svc.config.Issuer,
			Subject:   "usr_nbf",
			Audience:  []string{svc.config.Audience},
			ExpiresAt: jwt.NewNumericDate(now.Add(time.Hour)),
			IssuedAt:  jwt.NewNumericDate(now),
			NotBefore: jwt.NewNumericDate(now.Add(2 * time.Minute)),
			ID:        "jti_nbf",
		},
		TokenUse: "refresh",
	})
	futureNbfToken.Header["kid"] = svc.activeKeyID
	futureNbfRaw, err := futureNbfToken.SignedString(svc.activePriv)
	if err != nil {
		t.Fatalf("failed to sign token: %v", err)
	}
	if _, err := svc.ValidateRefreshToken(futureNbfRaw, now); err != ErrInvalidToken {
		t.Errorf("expected ErrInvalidToken for future NotBefore, got: %v", err)
	}

	// Valid refresh token validated at a past time before NotBefore/IssuedAt
	if _, err := svc.ValidateRefreshToken(refreshRaw, now.Add(-time.Minute)); err != ErrExpiredToken {
		t.Errorf("expected ErrExpiredToken when evaluated before NotBefore, got: %v", err)
	}
}

func TestNewTestServiceWithKeys(t *testing.T) {
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatalf("failed to generate key: %v", err)
	}
	cfg := validTestConfig()
	pubs := map[string]ed25519.PublicKey{
		cfg.ActiveKeyID: pub,
	}

	svc, err := NewTestServiceWithKeys(cfg, priv, pubs)
	if err != nil {
		t.Fatalf("NewTestServiceWithKeys failed: %v", err)
	}

	now := time.Now()
	tokenStr, _, err := svc.IssueAccessToken(IssueInput{Subject: "test-user"}, now)
	if err != nil {
		t.Fatalf("IssueAccessToken failed: %v", err)
	}
	claims, err := svc.ValidateAccessToken(tokenStr, now)
	if err != nil {
		t.Fatalf("ValidateAccessToken failed: %v", err)
	}
	if claims.Subject != "test-user" {
		t.Errorf("expected subject 'test-user', got %s", claims.Subject)
	}
}

func TestKeyLoadingAndGeneration(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "token_keys_*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	keyPath := filepath.Join(tmpDir, "sub", "test_priv.key")

	// 1. LoadOrGeneratePrivateKey: generates key when not present
	priv1, err := LoadOrGeneratePrivateKey(keyPath)
	if err != nil {
		t.Fatalf("LoadOrGeneratePrivateKey (generate) failed: %v", err)
	}
	if len(priv1) != ed25519.PrivateKeySize {
		t.Fatalf("generated key has invalid size: %d", len(priv1))
	}

	// Verify file was written
	if _, err := os.Stat(keyPath); err != nil {
		t.Fatalf("private key file does not exist: %v", err)
	}

	// 2. LoadOrGeneratePrivateKey: loads existing key on subsequent call
	priv2, err := LoadOrGeneratePrivateKey(keyPath)
	if err != nil {
		t.Fatalf("LoadOrGeneratePrivateKey (load existing) failed: %v", err)
	}
	if !priv1.Equal(priv2) {
		t.Error("LoadOrGeneratePrivateKey did not return identical key when file already exists")
	}

	// 3. LoadPrivateKey: loads existing key
	priv3, err := LoadPrivateKey(keyPath)
	if err != nil {
		t.Fatalf("LoadPrivateKey failed: %v", err)
	}
	if !priv1.Equal(priv3) {
		t.Error("LoadPrivateKey did not match generated key")
	}

	// 4. Save corresponding public key to file and load it
	pubKey := priv1.Public().(ed25519.PublicKey)
	pubDer, err := x509.MarshalPKIXPublicKey(pubKey)
	if err != nil {
		t.Fatalf("failed to marshal public key: %v", err)
	}
	pubPath := filepath.Join(tmpDir, "test_pub.key")
	if err := os.WriteFile(pubPath, pubDer, 0644); err != nil {
		t.Fatalf("failed to write public key file: %v", err)
	}

	loadedPub, err := loadPublicKey(pubPath)
	if err != nil {
		t.Fatalf("loadPublicKey failed: %v", err)
	}
	if !loadedPub.Equal(pubKey) {
		t.Error("loadPublicKey did not match original public key")
	}

	// 5. LoadPublicKeys with map
	keysMap, err := LoadPublicKeys(map[string]string{"key-1": pubPath})
	if err != nil {
		t.Fatalf("LoadPublicKeys failed: %v", err)
	}
	if len(keysMap) != 1 || !keysMap["key-1"].Equal(pubKey) {
		t.Errorf("LoadPublicKeys returned unexpected map: %v", keysMap)
	}
}

func TestKeyLoading_Errors(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "token_errors_*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	// Non-existent private key
	if _, err := LoadPrivateKey(filepath.Join(tmpDir, "non_existent.key")); err == nil {
		t.Error("expected error for non-existent private key file, got nil")
	}

	// Corrupt private key
	corruptPath := filepath.Join(tmpDir, "corrupt.key")
	if err := os.WriteFile(corruptPath, []byte("invalid-pkcs8-content"), 0600); err != nil {
		t.Fatalf("failed to write corrupt file: %v", err)
	}
	if _, err := LoadPrivateKey(corruptPath); err == nil {
		t.Error("expected error for corrupt private key file, got nil")
	}

	// Non-Ed25519 private key (RSA)
	rsaPriv, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("failed to generate RSA key: %v", err)
	}
	rsaPKCS8, err := x509.MarshalPKCS8PrivateKey(rsaPriv)
	if err != nil {
		t.Fatalf("failed to marshal RSA key: %v", err)
	}
	rsaPath := filepath.Join(tmpDir, "rsa_priv.key")
	if err := os.WriteFile(rsaPath, rsaPKCS8, 0600); err != nil {
		t.Fatalf("failed to write RSA private key file: %v", err)
	}
	if _, err := LoadPrivateKey(rsaPath); err == nil || !strings.Contains(err.Error(), "not Ed25519") {
		t.Errorf("expected 'not Ed25519' error for RSA key, got: %v", err)
	}

	// Non-existent public key
	if _, err := loadPublicKey(filepath.Join(tmpDir, "non_existent.pub")); err == nil {
		t.Error("expected error for non-existent public key, got nil")
	}

	// Corrupt public key
	if _, err := loadPublicKey(corruptPath); err == nil {
		t.Error("expected error for corrupt public key, got nil")
	}

	// Non-Ed25519 public key (RSA)
	rsaPubPKIX, err := x509.MarshalPKIXPublicKey(&rsaPriv.PublicKey)
	if err != nil {
		t.Fatalf("failed to marshal RSA public key: %v", err)
	}
	rsaPubPath := filepath.Join(tmpDir, "rsa_pub.key")
	if err := os.WriteFile(rsaPubPath, rsaPubPKIX, 0644); err != nil {
		t.Fatalf("failed to write RSA public key file: %v", err)
	}
	if _, err := loadPublicKey(rsaPubPath); err == nil || !strings.Contains(err.Error(), "not Ed25519") {
		t.Errorf("expected 'not Ed25519' error for RSA public key, got: %v", err)
	}

	// LoadPublicKeys error propagation
	if _, err := LoadPublicKeys(map[string]string{"bad": corruptPath}); err == nil {
		t.Error("expected LoadPublicKeys to propagate error for bad path, got nil")
	}
}

func TestGenerateJTI(t *testing.T) {
	jti1, err := generateJTI()
	if err != nil {
		t.Fatalf("generateJTI failed: %v", err)
	}
	if len(jti1) != 32 { // 16 bytes encoded as hex = 32 chars
		t.Errorf("expected 32 character hex string, got %d chars: %s", len(jti1), jti1)
	}

	jti2, err := generateJTI()
	if err != nil {
		t.Fatalf("generateJTI failed: %v", err)
	}
	if jti1 == jti2 {
		t.Error("consecutive generateJTI calls returned identical JTIs")
	}
}
