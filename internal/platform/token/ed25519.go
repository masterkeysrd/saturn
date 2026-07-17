package token

import (
	"crypto/ed25519"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"crypto/x509"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"os"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

var (
	ErrInvalidToken = errors.New("invalid token")
	ErrExpiredToken = errors.New("expired token")
)

// Config holds JWT configuration parameters.
type Config struct {
	Issuer      string
	Audience    string
	AccessTTL   time.Duration
	ClockSkew   time.Duration
	ActiveKeyID string
}

func (c *Config) Validate() error {
	var errs []string
	if c.Issuer == "" {
		errs = append(errs, "issuer must not be empty")
	}
	if c.Audience == "" {
		errs = append(errs, "audience must not be empty")
	}
	if c.AccessTTL <= 0 {
		errs = append(errs, "access TTL must be positive")
	}
	if c.ClockSkew < 0 {
		errs = append(errs, "clock skew must be non-negative")
	}
	if c.ActiveKeyID == "" {
		errs = append(errs, "active key ID must not be empty")
	}
	if len(errs) > 0 {
		return fmt.Errorf("invalid config: %s", strings.Join(errs, "; "))
	}
	return nil
}

// Ed25519Service provides JWT token signing and verification using Ed25519.
type Ed25519Service struct {
	activeKeyID string
	activePriv  ed25519.PrivateKey
	publicKeys  map[string]ed25519.PublicKey
	config      Config
}

// NewEd25519Service creates a new Ed25519Service with the given configuration and keys.
func NewEd25519Service(cfg Config, activePrivateKey ed25519.PrivateKey, publicKeys map[string]ed25519.PublicKey) (*Ed25519Service, error) {
	if err := cfg.Validate(); err != nil {
		return nil, err
	}
	if len(activePrivateKey) != ed25519.PrivateKeySize {
		return nil, fmt.Errorf("active private key must be %d bytes", ed25519.PrivateKeySize)
	}

	// If no public keys provided, derive from the active private key
	if publicKeys == nil || len(publicKeys) == 0 {
		pub := activePrivateKey.Public().(ed25519.PublicKey)
		publicKeys = map[string]ed25519.PublicKey{
			cfg.ActiveKeyID: pub,
		}
	}

	return &Ed25519Service{
		activeKeyID: cfg.ActiveKeyID,
		activePriv:  activePrivateKey,
		publicKeys:  publicKeys,
		config:      cfg,
	}, nil
}

// IssueAccessToken creates a signed JWT access token with the given subject, role, and auth version.
func (s *Ed25519Service) IssueAccessToken(input IssueInput, now time.Time) (string, time.Time, error) {
	jti, err := generateJTI()
	if err != nil {
		return "", time.Time{}, fmt.Errorf("generate jti: %w", err)
	}

	expiresAt := now.Add(s.config.AccessTTL)

	claims := &Claims{
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    s.config.Issuer,
			Subject:   input.Subject,
			Audience:  []string{s.config.Audience},
			ExpiresAt: jwt.NewNumericDate(expiresAt),
			IssuedAt:  jwt.NewNumericDate(now),
			NotBefore: jwt.NewNumericDate(now),
			ID:        jti,
		},
		AccessLevel: input.AccessLevel,
		TokenUse:    "access",
		AuthVersion: input.AuthVersion,
	}

	token := jwt.NewWithClaims(jwt.SigningMethodEdDSA, claims)
	token.Header["kid"] = s.activeKeyID

	raw, err := token.SignedString(s.activePriv)
	if err != nil {
		return "", time.Time{}, fmt.Errorf("sign token: %w", err)
	}

	return raw, expiresAt, nil
}

// IssueRefreshToken creates a signed JWT refresh token with the given absolute expiry.
func (s *Ed25519Service) IssueRefreshToken(input IssueInput, now time.Time, absoluteExpiry time.Time) (string, time.Time, error) {
	jti, err := generateJTI()
	if err != nil {
		return "", time.Time{}, fmt.Errorf("generate jti: %w", err)
	}

	claims := &Claims{
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    s.config.Issuer,
			Subject:   input.Subject,
			Audience:  []string{s.config.Audience},
			ExpiresAt: jwt.NewNumericDate(absoluteExpiry),
			IssuedAt:  jwt.NewNumericDate(now),
			NotBefore: jwt.NewNumericDate(now),
			ID:        jti,
		},
		AccessLevel: input.AccessLevel,
		TokenUse:    "refresh",
		AuthVersion: input.AuthVersion,
	}

	token := jwt.NewWithClaims(jwt.SigningMethodEdDSA, claims)
	token.Header["kid"] = s.activeKeyID

	raw, err := token.SignedString(s.activePriv)
	if err != nil {
		return "", time.Time{}, fmt.Errorf("sign refresh token: %w", err)
	}

	return raw, absoluteExpiry, nil
}

// ValidateAccessToken validates a JWT access token and returns its claims.
func (s *Ed25519Service) ValidateAccessToken(raw string, now time.Time) (*Claims, error) {
	if strings.TrimSpace(raw) == "" {
		return nil, ErrInvalidToken
	}

	claims := &Claims{}
	parser := jwt.NewParser(
		jwt.WithExpirationRequired(),
		jwt.WithIssuedAt(),
		jwt.WithNotBeforeRequired(),
		jwt.WithLeeway(s.config.ClockSkew),
	)

	_, err := parser.ParseWithClaims(raw, claims, func(token *jwt.Token) (any, error) {
		if _, ok := token.Method.(*jwt.SigningMethodEd25519); !ok {
			return nil, fmt.Errorf("unexpected signing method")
		}
		kid, _ := token.Header["kid"].(string)
		kid = strings.TrimSpace(kid)
		if kid == "" {
			return nil, fmt.Errorf("missing kid")
		}
		pub, ok := s.publicKeys[kid]
		if !ok {
			return nil, fmt.Errorf("unknown key ID: %s", kid)
		}
		return pub, nil
	})
	if err != nil {
		return nil, ErrInvalidToken
	}
	if claims.RegisteredClaims.ID == "" {
		return nil, ErrInvalidToken
	}

	if err := claims.ValidateBasic(); err != nil {
		return nil, ErrInvalidToken
	}

	if claims.TokenUse != "access" {
		return nil, ErrInvalidToken
	}

	nowUnix := now.Unix()
	clockSkew := int64(s.config.ClockSkew.Seconds())

	exp, _ := claims.GetExpirationTime()
	if exp != nil && exp.Unix() <= nowUnix {
		return nil, ErrExpiredToken
	}

	nbf, _ := claims.GetNotBefore()
	if nbf != nil && nbf.Unix() > nowUnix+clockSkew {
		return nil, ErrExpiredToken
	}

	iat, _ := claims.GetIssuedAt()
	if iat != nil && iat.Unix() > nowUnix+clockSkew {
		return nil, ErrExpiredToken
	}

	if claims.AuthVersion < 0 {
		return nil, ErrInvalidToken
	}

	return claims, nil
}

// ValidateRefreshToken validates a JWT refresh token and returns its claims.
func (s *Ed25519Service) ValidateRefreshToken(raw string, now time.Time) (*Claims, error) {
	if strings.TrimSpace(raw) == "" {
		return nil, ErrInvalidToken
	}

	claims := &Claims{}
	parser := jwt.NewParser(
		jwt.WithExpirationRequired(),
		jwt.WithIssuedAt(),
		jwt.WithNotBeforeRequired(),
		jwt.WithLeeway(s.config.ClockSkew),
	)

	_, err := parser.ParseWithClaims(raw, claims, func(token *jwt.Token) (any, error) {
		if _, ok := token.Method.(*jwt.SigningMethodEd25519); !ok {
			return nil, fmt.Errorf("unexpected signing method")
		}
		kid, _ := token.Header["kid"].(string)
		kid = strings.TrimSpace(kid)
		if kid == "" {
			return nil, fmt.Errorf("missing kid")
		}
		pub, ok := s.publicKeys[kid]
		if !ok {
			return nil, fmt.Errorf("unknown key ID: %s", kid)
		}
		return pub, nil
	})
	if err != nil {
		return nil, ErrInvalidToken
	}
	if claims.RegisteredClaims.ID == "" {
		return nil, ErrInvalidToken
	}

	if err := claims.ValidateBasic(); err != nil {
		return nil, ErrInvalidToken
	}

	if claims.TokenUse != "refresh" {
		return nil, ErrInvalidToken
	}

	nowUnix := now.Unix()
	clockSkew := int64(s.config.ClockSkew.Seconds())

	exp, _ := claims.GetExpirationTime()
	if exp != nil && exp.Unix() <= nowUnix {
		return nil, ErrExpiredToken
	}

	nbf, _ := claims.GetNotBefore()
	if nbf != nil && nbf.Unix() > nowUnix+clockSkew {
		return nil, ErrExpiredToken
	}

	iat, _ := claims.GetIssuedAt()
	if iat != nil && iat.Unix() > nowUnix+clockSkew {
		return nil, ErrExpiredToken
	}

	if claims.AuthVersion < 0 {
		return nil, ErrInvalidToken
	}

	return claims, nil
}

// IssueInput holds the parameters for issuing a new JWT.
type IssueInput struct {
	Subject     string
	AccessLevel string
	AuthVersion int64
}

// Service provides JWT token issuance and validation.
type Service interface {
	IssueAccessToken(input IssueInput, now time.Time) (string, time.Time, error)
	IssueRefreshToken(input IssueInput, now time.Time, absoluteExpiry time.Time) (string, time.Time, error)
	ValidateAccessToken(raw string, now time.Time) (*Claims, error)
	ValidateRefreshToken(raw string, now time.Time) (*Claims, error)
}

// generateJTI creates a cryptographically random token identifier.
func generateJTI() (string, error) {
	b := make([]byte, 16)
	if _, err := io.ReadFull(rand.Reader, b); err != nil {
		return "", err
	}
	return fmt.Sprintf("%x", b), nil
}

// LoadPrivateKey reads an Ed25519 private key from a PKCS8-encoded file.
func LoadPrivateKey(path string) (ed25519.PrivateKey, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read private key %s: %w", path, err)
	}
	priv, err := x509.ParsePKCS8PrivateKey(data)
	if err != nil {
		return nil, fmt.Errorf("invalid private key format in %s: %w", path, err)
	}
	key, ok := priv.(ed25519.PrivateKey)
	if !ok {
		return nil, fmt.Errorf("private key in %s is not Ed25519", path)
	}
	return key, nil
}

// loadPublicKey reads an Ed25519 public key from a PKIX-encoded file.
func loadPublicKey(path string) (ed25519.PublicKey, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read public key %s: %w", path, err)
	}
	pub, err := x509.ParsePKIXPublicKey(data)
	if err != nil {
		return nil, fmt.Errorf("invalid public key format in %s: %w", path, err)
	}
	key, ok := pub.(ed25519.PublicKey)
	if !ok {
		return nil, fmt.Errorf("public key in %s is not Ed25519", path)
	}
	return key, nil
}

// LoadPublicKeys loads multiple public keys from file paths keyed by ID.
func LoadPublicKeys(paths map[string]string) (map[string]ed25519.PublicKey, error) {
	keys := make(map[string]ed25519.PublicKey)
	for keyID, path := range paths {
		pub, err := loadPublicKey(path)
		if err != nil {
			return nil, err
		}
		keys[keyID] = pub
	}
	return keys, nil
}

// digestRefreshToken computes an HMAC-SHA256 digest of a refresh token using the given pepper.
func digestRefreshToken(pepper []byte, token string) []byte {
	mac := hmac.New(sha256.New, pepper)
	_, _ = mac.Write([]byte(token))
	return mac.Sum(nil)
}

// compareRefreshTokenDigest compares a stored digest with a computed one using constant-time comparison.
func compareRefreshTokenDigest(stored, computed []byte) bool {
	return subtle.ConstantTimeCompare(stored, computed) == 1
}

// generateRefreshToken generates a cryptographically random opaque refresh token.
func generateRefreshToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

// NewTestService creates an Ed25519Service configured for testing.
func NewTestService() (*Ed25519Service, error) {
	pub, priv, err := ed25519.GenerateKey(nil)
	if err != nil {
		return nil, err
	}
	cfg := Config{
		Issuer:      "saturn-test",
		Audience:    "saturn-test-api",
		AccessTTL:   15 * time.Minute,
		ClockSkew:   30 * time.Second,
		ActiveKeyID: "test-key-1",
	}
	publicKeys := map[string]ed25519.PublicKey{
		"test-key-1": pub,
	}
	return NewEd25519Service(cfg, priv, publicKeys)
}

// NewTestServiceWithKeys creates an Ed25519Service with explicit test keys and config.
func NewTestServiceWithKeys(cfg Config, priv ed25519.PrivateKey, pubs map[string]ed25519.PublicKey) (*Ed25519Service, error) {
	return NewEd25519Service(cfg, priv, pubs)
}
