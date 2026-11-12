package connector

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"net/url"
	"sort"
	"strings"
	"time"

	"github.com/lib/pq"
	"github.com/masterkeysrd/saturn/internal/platform/crypto"
)

var (
	// ErrInvalidState indicates that the provided OAuth state was not found, was already consumed, or has expired.
	ErrInvalidState = errors.New("invalid or expired oauth state")

	// ErrInvalidReturnURL indicates that the return URL violates open-redirect security rules.
	ErrInvalidReturnURL = errors.New("invalid return_url: must be a safe relative application path")
)

// OAuthState represents a single-use PKCE authorization session stored in platform.oauth_states.
type OAuthState struct {
	StateHash          string         `db:"state_hash" json:"state_hash"`
	SpaceID            string         `db:"space_id" json:"space_id"`
	UserID             string         `db:"user_id" json:"user_id"`
	Provider           string         `db:"provider" json:"provider"`
	Capabilities       pq.StringArray `db:"capabilities" json:"capabilities"`
	ConnectedAccountID *string        `db:"connected_account_id" json:"connected_account_id"`
	CodeVerifierEnc    string         `db:"code_verifier_enc" json:"-"`
	ReturnURL          string         `db:"return_url" json:"return_url"`
	ExpiresAt          time.Time      `db:"expires_at" json:"expires_at"`
	CreateTime         time.Time      `db:"create_time" json:"create_time"`
}

// GeneratePKCE generates a cryptographically random PKCE code_verifier (43 URL-safe chars)
// and derives its S256 code_challenge.
func GeneratePKCE() (verifier, challenge string, err error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", "", fmt.Errorf("generate random pkce bytes: %w", err)
	}
	verifier = base64.RawURLEncoding.EncodeToString(b)
	challenge = DerivePKCEChallenge(verifier)
	return verifier, challenge, nil
}

// DerivePKCEChallenge derives the RFC 7636 S256 code_challenge from a code_verifier.
func DerivePKCEChallenge(verifier string) string {
	h := sha256.Sum256([]byte(verifier))
	return base64.RawURLEncoding.EncodeToString(h[:])
}

// GenerateStateToken creates a cryptographically secure random state string and its SHA-256 hex digest.
func GenerateStateToken() (rawState, stateHash string, err error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", "", fmt.Errorf("generate random state bytes: %w", err)
	}
	rawState = base64.RawURLEncoding.EncodeToString(b)
	stateHash = HashState(rawState)
	return rawState, stateHash, nil
}

// HashState computes the SHA-256 hex digest of a raw OAuth state token.
func HashState(rawState string) string {
	h := sha256.Sum256([]byte(rawState))
	return hex.EncodeToString(h[:])
}

// ValidateReturnURL validates that a redirect target is a safe relative application path,
// a valid HTTPS web URL, or a saturn:// mobile deep-link URL, and prevents open-redirect vulnerabilities.
func ValidateReturnURL(returnURL string) error {
	if returnURL == "" {
		return fmt.Errorf("%w: return_url cannot be empty", ErrInvalidReturnURL)
	}
	if strings.HasPrefix(returnURL, "//") || strings.HasPrefix(returnURL, "/\\") || strings.Contains(returnURL, "\\") {
		return fmt.Errorf("%w: protocol-relative or backslash paths are forbidden", ErrInvalidReturnURL)
	}
	u, err := url.Parse(returnURL)
	if err != nil {
		return fmt.Errorf("%w: parse error: %s", ErrInvalidReturnURL, err)
	}
	// Allow safe relative paths
	if u.Scheme == "" && u.Host == "" {
		if !strings.HasPrefix(u.Path, "/") {
			return fmt.Errorf("%w: return_url must start with leading slash", ErrInvalidReturnURL)
		}
		return nil
	}
	// Allow HTTPS web URLs and saturn:// mobile deep links (and localhost HTTP in tests/dev)
	if u.Scheme == "https" || u.Scheme == "saturn" || (u.Scheme == "http" && (u.Hostname() == "localhost" || u.Hostname() == "127.0.0.1")) {
		return nil
	}
	return fmt.Errorf("%w: scheme %q is not permitted", ErrInvalidReturnURL, u.Scheme)
}

// CalculateIncrementalScopes diffs required scopes against already granted scopes.
// It returns only the scopes that have not yet been granted, sorted alphabetically.
func CalculateIncrementalScopes(grantedScopes, requiredScopes []string) []string {
	grantedMap := make(map[string]struct{}, len(grantedScopes))
	for _, s := range grantedScopes {
		grantedMap[s] = struct{}{}
	}

	missingMap := make(map[string]struct{})
	for _, req := range requiredScopes {
		trimmed := strings.TrimSpace(req)
		if trimmed == "" {
			continue
		}
		if _, ok := grantedMap[trimmed]; !ok {
			missingMap[trimmed] = struct{}{}
		}
	}

	missing := make([]string, 0, len(missingMap))
	for s := range missingMap {
		missing = append(missing, s)
	}
	sort.Strings(missing)
	return missing
}

// MergeScopes merges and deduplicates granted scopes with newly granted scopes.
func MergeScopes(existingScopes, newScopes []string) []string {
	set := make(map[string]struct{}, len(existingScopes)+len(newScopes))
	for _, s := range existingScopes {
		if trimmed := strings.TrimSpace(s); trimmed != "" {
			set[trimmed] = struct{}{}
		}
	}
	for _, s := range newScopes {
		if trimmed := strings.TrimSpace(s); trimmed != "" {
			set[trimmed] = struct{}{}
		}
	}
	out := make([]string, 0, len(set))
	for s := range set {
		out = append(out, s)
	}
	sort.Strings(out)
	return out
}

// CreateStateRequest contains parameters needed to initiate an OAuth state session.
type CreateStateRequest struct {
	SpaceID            string
	UserID             string
	Provider           string
	Capabilities       []Capability
	ConnectedAccountID *string
	ReturnURL          string
	TTL                time.Duration
}

// InitiatedOAuthState contains the result of an initiated OAuth PKCE session.
type InitiatedOAuthState struct {
	RawState      string
	StateHash     string
	CodeVerifier  string
	CodeChallenge string
	ExpiresAt     time.Time
}

// OAuthManager coordinates PKCE generation, state encryption, and state verification.
type OAuthManager struct {
	store  Store
	cipher *crypto.Cipher
}

// NewOAuthManager creates a new OAuthManager.
func NewOAuthManager(store Store, cipher *crypto.Cipher) *OAuthManager {
	return &OAuthManager{
		store:  store,
		cipher: cipher,
	}
}

// InitiateSession creates a new PKCE verifier, hashes the state token, encrypts the verifier,
// and persists the session in the store.
func (m *OAuthManager) InitiateSession(ctx context.Context, req CreateStateRequest) (*InitiatedOAuthState, error) {
	if err := ValidateReturnURL(req.ReturnURL); err != nil {
		return nil, err
	}

	verifier, challenge, err := GeneratePKCE()
	if err != nil {
		return nil, err
	}

	rawState, stateHash, err := GenerateStateToken()
	if err != nil {
		return nil, err
	}

	verifierEnc, err := m.cipher.Encrypt(verifier)
	if err != nil {
		return nil, fmt.Errorf("encrypt code verifier: %w", err)
	}

	ttl := req.TTL
	if ttl <= 0 {
		ttl = 15 * time.Minute
	}
	expiresAt := time.Now().Add(ttl)

	caps := make([]string, len(req.Capabilities))
	for i, c := range req.Capabilities {
		caps[i] = string(c)
	}

	stateRecord := &OAuthState{
		StateHash:          stateHash,
		SpaceID:            req.SpaceID,
		UserID:             req.UserID,
		Provider:           req.Provider,
		Capabilities:       caps,
		ConnectedAccountID: req.ConnectedAccountID,
		CodeVerifierEnc:    verifierEnc,
		ReturnURL:          req.ReturnURL,
		ExpiresAt:          expiresAt,
		CreateTime:         time.Now(),
	}

	if err := m.store.CreateOAuthState(ctx, stateRecord); err != nil {
		return nil, fmt.Errorf("persist oauth state: %w", err)
	}

	return &InitiatedOAuthState{
		RawState:      rawState,
		StateHash:     stateHash,
		CodeVerifier:  verifier,
		CodeChallenge: challenge,
		ExpiresAt:     expiresAt,
	}, nil
}

// ConsumeSession atomically consumes and deletes an OAuth state by raw state token,
// verifying expiration and decrypting the PKCE code_verifier.
func (m *OAuthManager) ConsumeSession(ctx context.Context, rawState string) (*OAuthState, string, error) {
	if rawState == "" {
		return nil, "", ErrInvalidState
	}

	stateHash := HashState(rawState)
	stateRecord, err := m.store.ConsumeOAuthState(ctx, stateHash)
	if err != nil {
		return nil, "", fmt.Errorf("consume oauth state: %w", err)
	}
	if stateRecord == nil {
		return nil, "", ErrInvalidState
	}

	// Verify expiration
	if time.Now().After(stateRecord.ExpiresAt) {
		return nil, "", ErrInvalidState
	}

	codeVerifier, err := m.cipher.Decrypt(stateRecord.CodeVerifierEnc)
	if err != nil {
		return nil, "", fmt.Errorf("decrypt code verifier: %w", err)
	}

	return stateRecord, codeVerifier, nil
}
