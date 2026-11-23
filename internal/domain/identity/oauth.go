package identity

import (
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"fmt"
	"net/url"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/hash"
	"github.com/masterkeysrd/saturn/internal/platform/id"
	"github.com/masterkeysrd/saturn/internal/platform/patch"
	"github.com/masterkeysrd/saturn/internal/platform/token"
)

const (
	oauthClientIDPrefix      = "oac_"
	oauthGrantIDPrefix       = "oag_"
	oauthAuthCodeIDPrefix    = "oaz_"
	oauthAccessTokenIDPrefix = "oat_"

	OAuthClientSecretPrefix = "sat_ocs_"
	OAuthAccessTokenPrefix  = "sat_oat_"
	OAuthRefreshTokenPrefix = "sat_ort_"

	oauthClientSecretDisplayPrefixLen = 16
	oauthTokenRandomBytes             = 32

	OAuthRefreshGraceWindow = 30 * time.Second
	OAuthAuthCodeTTL        = 5 * time.Minute
	OAuthHandoffTTL         = 60 * time.Second
)

// OAuthClientID represents an OAuth 2.1 client identifier (`oac_<ksuid>` or canonical `https://...` CIMD URL).
type OAuthClientID string

// NewOAuthClientID generates a new unique OAuthClientID (`oac_<ksuid>`).
func NewOAuthClientID() (OAuthClientID, error) {
	raw, err := id.Generate(oauthClientIDPrefix)
	if err != nil {
		return "", err
	}
	return OAuthClientID(raw), nil
}

// ParseOAuthClientID parses and validates an OAuthClientID (either `oac_<ksuid>` or `https://...` CIMD URL).
func ParseOAuthClientID(s string) (OAuthClientID, error) {
	trimmed := strings.TrimSpace(s)
	if trimmed == "" {
		return "", errors.E(errors.Invalid, InvalidOAuthClientID, "oauth client id is required")
	}
	if strings.HasPrefix(trimmed, "https://") {
		u, err := url.Parse(trimmed)
		if err != nil || !strings.EqualFold(u.Scheme, "https") || u.Hostname() == "" || u.User != nil || u.Fragment != "" {
			return "", errors.E(errors.Invalid, InvalidOAuthClientID, "invalid CIMD client_id URL")
		}
		return OAuthClientID(trimmed), nil
	}
	if err := id.Validate(trimmed, oauthClientIDPrefix); err != nil {
		return "", errors.E(errors.Invalid, InvalidOAuthClientID, fmt.Sprintf("invalid oauth client id: %v", err))
	}
	return OAuthClientID(trimmed), nil
}

// IsCIMDURL reports whether this client ID is an HTTPS Client ID Metadata Document URL.
func (c OAuthClientID) IsCIMDURL() bool {
	return strings.HasPrefix(strings.ToLower(string(c)), "https://")
}

// OAuthGrantID represents a user's OAuth 2.1 workspace grant (`oag_<ksuid>`).
type OAuthGrantID string

// NewOAuthGrantID generates a new unique OAuthGrantID (`oag_<ksuid>`).
func NewOAuthGrantID() (OAuthGrantID, error) {
	raw, err := id.Generate(oauthGrantIDPrefix)
	if err != nil {
		return "", err
	}
	return OAuthGrantID(raw), nil
}

// ParseOAuthGrantID parses and validates an OAuthGrantID (`oag_<ksuid>`).
func ParseOAuthGrantID(s string) (OAuthGrantID, error) {
	if err := id.Validate(strings.TrimSpace(s), oauthGrantIDPrefix); err != nil {
		return "", errors.E(errors.Invalid, fmt.Sprintf("invalid oauth grant id: %v", err))
	}
	return OAuthGrantID(strings.TrimSpace(s)), nil
}

// OAuthAuthCodeID represents a single-use authorization code record (`oaz_<ksuid>`).
type OAuthAuthCodeID string

// NewOAuthAuthCodeID generates a new unique OAuthAuthCodeID (`oaz_<ksuid>`).
func NewOAuthAuthCodeID() (OAuthAuthCodeID, error) {
	raw, err := id.Generate(oauthAuthCodeIDPrefix)
	if err != nil {
		return "", err
	}
	return OAuthAuthCodeID(raw), nil
}

// OAuthAccessTokenID represents an issued OAuth access token record (`oat_<ksuid>`).
type OAuthAccessTokenID string

// NewOAuthAccessTokenID generates a new unique OAuthAccessTokenID (`oat_<ksuid>`).
func NewOAuthAccessTokenID() (OAuthAccessTokenID, error) {
	raw, err := id.Generate(oauthAccessTokenIDPrefix)
	if err != nil {
		return "", err
	}
	return OAuthAccessTokenID(raw), nil
}

// TokenEndpointAuthMethod defines how a client authenticates at `/oauth/token` and `/oauth/revoke`.
type TokenEndpointAuthMethod string

const (
	TokenAuthMethodClientSecretBasic TokenEndpointAuthMethod = "client_secret_basic"
	TokenAuthMethodClientSecretPost  TokenEndpointAuthMethod = "client_secret_post"
	TokenAuthMethodNone              TokenEndpointAuthMethod = "none"
)

// IsValid reports whether m is a supported token endpoint authentication method.
func (m TokenEndpointAuthMethod) IsValid() bool {
	switch m {
	case TokenAuthMethodClientSecretBasic, TokenAuthMethodClientSecretPost, TokenAuthMethodNone:
		return true
	default:
		return false
	}
}

// RefreshTokenPolicy defines refresh token rotation vs persistent reuse behavior per client.
type RefreshTokenPolicy string

const (
	RefreshTokenPolicyRotate     RefreshTokenPolicy = "rotate"
	RefreshTokenPolicyPersistent RefreshTokenPolicy = "persistent"
)

// IsValid reports whether p is a supported refresh token policy.
func (p RefreshTokenPolicy) IsValid() bool {
	switch p {
	case RefreshTokenPolicyRotate, RefreshTokenPolicyPersistent:
		return true
	default:
		return false
	}
}

// RegistrationSource tracks how an OAuth client was registered.
type RegistrationSource string

const (
	RegistrationSourceAdmin RegistrationSource = "admin"
	RegistrationSourceSpace RegistrationSource = "space"
	RegistrationSourceDCR   RegistrationSource = "dcr"
	RegistrationSourceCIMD  RegistrationSource = "cimd"
)

// IsValid reports whether r is a supported registration source.
func (r RegistrationSource) IsValid() bool {
	switch r {
	case RegistrationSourceAdmin, RegistrationSourceSpace, RegistrationSourceDCR, RegistrationSourceCIMD:
		return true
	default:
		return false
	}
}

// AllAPIKeyScopeStrings returns all valid v1 scope strings in canonical order.
func AllAPIKeyScopeStrings() []string {
	out := make([]string, len(AllAPIKeyScopes))
	for i, s := range AllAPIKeyScopes {
		out[i] = string(s)
	}
	return out
}

// GenerateOAuthClientSecret generates a raw `sat_ocs_...` client secret, display prefix, and SHA-256 hex digest.
func GenerateOAuthClientSecret() (rawSecret, prefix, secretHash string, err error) {
	entropy, err := token.GenerateRandomBytes(oauthTokenRandomBytes)
	if err != nil {
		return "", "", "", fmt.Errorf("generate oauth client secret: %w", err)
	}
	rawSecret = OAuthClientSecretPrefix + base64.RawURLEncoding.EncodeToString(entropy)
	prefix = rawSecret[:min(oauthClientSecretDisplayPrefixLen, len(rawSecret))]
	secretHash = HashOAuthToken(rawSecret)
	return rawSecret, prefix, secretHash, nil
}

// GenerateOAuthAccessToken generates a raw `sat_oat_...` access token and its SHA-256 hex digest.
func GenerateOAuthAccessToken() (rawToken, tokenHash string, err error) {
	return generatePrefixedOAuthToken(OAuthAccessTokenPrefix)
}

// GenerateOAuthRefreshToken generates a raw `sat_ort_...` refresh token and its SHA-256 hex digest.
func GenerateOAuthRefreshToken() (rawToken, tokenHash string, err error) {
	return generatePrefixedOAuthToken(OAuthRefreshTokenPrefix)
}

// GenerateOAuthAuthCode generates a random single-use authorization code and its SHA-256 hex digest.
func GenerateOAuthAuthCode() (rawCode, codeHash string, err error) {
	return generatePrefixedOAuthToken("")
}

// GenerateOAuthHandoffToken generates a random browser handoff nonce and its SHA-256 hex digest.
func GenerateOAuthHandoffToken() (rawHandoff, handoffHash string, err error) {
	return generatePrefixedOAuthToken("")
}

func generatePrefixedOAuthToken(prefix string) (string, string, error) {
	entropy, err := token.GenerateRandomBytes(oauthTokenRandomBytes)
	if err != nil {
		return "", "", fmt.Errorf("generate oauth token entropy: %w", err)
	}
	raw := prefix + base64.RawURLEncoding.EncodeToString(entropy)
	return raw, HashOAuthToken(raw), nil
}

// HashOAuthToken computes the SHA-256 hex digest of an OAuth token, code, or secret.
func HashOAuthToken(raw string) string {
	return hash.SHA256Hex(raw)
}

// VerifyOAuthSecret compares a stored SHA-256 hex digest with a raw secret in constant time.
func VerifyOAuthSecret(encodedHash, rawSecret string) bool {
	if encodedHash == "" || rawSecret == "" {
		return false
	}
	candidate := HashOAuthToken(rawSecret)
	return subtle.ConstantTimeCompare([]byte(encodedHash), []byte(candidate)) == 1
}

// VerifyPKCES256 verifies an RFC 7636 PKCE S256 code_verifier against code_challenge in constant time.
func VerifyPKCES256(verifier, challenge string) bool {
	if len(verifier) < 43 || len(verifier) > 128 || challenge == "" {
		return false
	}
	for i := range len(verifier) {
		ch := verifier[i]
		isValidChar := (ch >= 'A' && ch <= 'Z') ||
			(ch >= 'a' && ch <= 'z') ||
			(ch >= '0' && ch <= '9') ||
			ch == '-' || ch == '.' || ch == '_' || ch == '~'
		if !isValidChar {
			return false
		}
	}
	sum := sha256.Sum256([]byte(verifier))
	computed := base64.RawURLEncoding.EncodeToString(sum[:])
	return subtle.ConstantTimeCompare([]byte(computed), []byte(challenge)) == 1
}

// OAuthClient represents either an Instance-wide (`SpaceID == nil`) or Workspace-scoped (`SpaceID != nil`) OAuth 2.1 client.
type OAuthClient struct {
	ID                      OAuthClientID
	SpaceID                 *string
	Name                    string
	Description             string
	SecretPrefix            string
	SecretHash              string
	RawSecret               string
	RedirectURIs            []string
	AllowedScopes           []string
	TokenEndpointAuthMethod TokenEndpointAuthMethod
	RefreshTokenPolicy      RefreshTokenPolicy
	RegistrationSource      RegistrationSource
	MetadataETag            string
	MetadataFetchedAt       *time.Time
	CreateTime              time.Time
	UpdateTime              time.Time
}

// Validate normalizes and enforces all OAuthClient invariants.
func (c *OAuthClient) Validate() error {
	if c == nil {
		return errors.E(errors.Invalid, OAuthInvalidClient, "oauth client payload is required")
	}

	c.Name = strings.TrimSpace(c.Name)
	c.Description = strings.TrimSpace(c.Description)
	if c.Name == "" {
		return errors.E(errors.Invalid, OAuthInvalidClient, "oauth client name is required")
	}
	if len(c.Name) > 255 {
		return errors.E(errors.Invalid, OAuthInvalidClient, "oauth client name must not exceed 255 characters")
	}

	if c.TokenEndpointAuthMethod == "" {
		c.TokenEndpointAuthMethod = TokenAuthMethodClientSecretBasic
	}
	if !c.TokenEndpointAuthMethod.IsValid() {
		return errors.E(errors.Invalid, OAuthInvalidClient, fmt.Sprintf("unsupported token_endpoint_auth_method: %q", c.TokenEndpointAuthMethod))
	}

	if c.RefreshTokenPolicy == "" {
		c.RefreshTokenPolicy = RefreshTokenPolicyRotate
	}
	if !c.RefreshTokenPolicy.IsValid() {
		return errors.E(errors.Invalid, OAuthInvalidClient, fmt.Sprintf("unsupported refresh_token_policy: %q", c.RefreshTokenPolicy))
	}

	if !c.RegistrationSource.IsValid() {
		return errors.E(errors.Invalid, OAuthInvalidClient, fmt.Sprintf("unsupported registration_source: %q", c.RegistrationSource))
	}

	if c.SpaceID != nil {
		trimmedSpace := strings.TrimSpace(*c.SpaceID)
		if trimmedSpace == "" {
			c.SpaceID = nil
		} else {
			if err := id.Validate(trimmedSpace, "spc_"); err != nil {
				return errors.E(errors.Invalid, OAuthInvalidClient, fmt.Sprintf("invalid space_id: %v", err))
			}
			c.SpaceID = new(trimmedSpace)
		}
	}

	if len(c.RedirectURIs) == 0 {
		return errors.E(errors.Invalid, OAuthInvalidRedirectURI, "at least one redirect_uri is required")
	}
	normalizedURIs := make([]string, 0, len(c.RedirectURIs))
	seenURIs := make(map[string]struct{}, len(c.RedirectURIs))
	for _, rawURI := range c.RedirectURIs {
		norm, err := ValidateOAuthRedirectURI(rawURI)
		if err != nil {
			return err
		}
		if _, dup := seenURIs[norm]; !dup {
			seenURIs[norm] = struct{}{}
			normalizedURIs = append(normalizedURIs, norm)
		}
	}
	c.RedirectURIs = normalizedURIs

	normalizedScopes, err := ValidateAPIKeyScopes(c.AllowedScopes)
	if err != nil {
		return errors.E(errors.Invalid, OAuthInvalidScope, err)
	}
	c.AllowedScopes = normalizedScopes

	return nil
}

// ValidateOAuthRedirectURI validates a registered redirect URI rule.
// Supports:
//  1. Concrete https:// redirect URIs (no fragments, no userinfo, no wildcard hosts)
//  2. Explicit HTTPS subpath prefix rules (`https://example.com/callback/*` — concrete HTTPS host + non-root path prefix)
//  3. RFC 8252 §7.3 loopback HTTP (`http://127.0.0.1...`, `http://[::1]...`, `http://localhost...`)
func ValidateOAuthRedirectURI(raw string) (string, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return "", errors.E(errors.Invalid, OAuthInvalidRedirectURI, "redirect_uri cannot be empty")
	}
	if strings.Contains(trimmed, "#") {
		return "", errors.E(errors.Invalid, OAuthInvalidRedirectURI, "redirect_uri must not contain a fragment")
	}
	u, err := url.Parse(trimmed)
	if err != nil {
		return "", errors.E(errors.Invalid, OAuthInvalidRedirectURI, fmt.Sprintf("invalid redirect_uri %q: %v", raw, err))
	}
	if u.User != nil {
		return "", errors.E(errors.Invalid, OAuthInvalidRedirectURI, "redirect_uri must not contain userinfo")
	}

	scheme := strings.ToLower(u.Scheme)
	hostname := strings.ToLower(u.Hostname())
	if hostname == "" {
		return "", errors.E(errors.Invalid, OAuthInvalidRedirectURI, "redirect_uri host is required")
	}
	if strings.Contains(hostname, "*") {
		return "", errors.E(errors.Invalid, OAuthInvalidRedirectURI, "wildcard hosts are not permitted in redirect_uri")
	}

	if portStr := u.Port(); portStr != "" {
		p, err := strconv.Atoi(portStr)
		if err != nil || p < 1 || p > 65535 {
			return "", errors.E(errors.Invalid, OAuthInvalidRedirectURI, "invalid redirect_uri port")
		}
	}

	switch scheme {
	case "http":
		if !isLoopbackHostname(hostname) {
			return "", errors.E(errors.Invalid, OAuthInvalidRedirectURI, "http redirect_uri is only allowed for RFC 8252 loopback hosts (127.0.0.1, ::1, localhost)")
		}
		if strings.Contains(u.Path, "*") || strings.Contains(u.RawQuery, "*") {
			return "", errors.E(errors.Invalid, OAuthInvalidRedirectURI, "wildcards are not permitted in loopback redirect_uri")
		}
	case "https":
		if strings.HasSuffix(u.Path, "/*") {
			prefix := strings.TrimSuffix(u.Path, "*")
			if prefix == "/" || !strings.HasPrefix(prefix, "/") || len(prefix) <= 1 {
				return "", errors.E(errors.Invalid, OAuthInvalidRedirectURI, "https subpath prefix redirect_uri must have a non-root path prefix before /*")
			}
			if strings.Contains(prefix, "*") {
				return "", errors.E(errors.Invalid, OAuthInvalidRedirectURI, "multiple wildcards are not permitted in redirect_uri")
			}
			if u.RawQuery != "" {
				return "", errors.E(errors.Invalid, OAuthInvalidRedirectURI, "query string is not permitted on subpath prefix redirect_uri")
			}
		} else if strings.Contains(u.Path, "*") || strings.Contains(u.RawQuery, "*") {
			return "", errors.E(errors.Invalid, OAuthInvalidRedirectURI, "wildcards are only permitted as a trailing /* subpath prefix on https redirect_uris")
		}
	default:
		return "", errors.E(errors.Invalid, OAuthInvalidRedirectURI, "redirect_uri scheme must be https or RFC 8252 loopback http")
	}

	return trimmed, nil
}

// ValidateCandidateRedirectURI validates a concrete redirect_uri sent at authorization or token time.
func ValidateCandidateRedirectURI(raw string) (*url.URL, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" || strings.Contains(trimmed, "*") || strings.Contains(trimmed, "#") {
		return nil, errors.E(errors.Invalid, OAuthInvalidRedirectURI, "invalid redirect_uri")
	}
	u, err := url.Parse(trimmed)
	if err != nil || u.User != nil || u.Hostname() == "" {
		return nil, errors.E(errors.Invalid, OAuthInvalidRedirectURI, "invalid redirect_uri")
	}
	scheme := strings.ToLower(u.Scheme)
	if scheme == "http" {
		if !isLoopbackHostname(strings.ToLower(u.Hostname())) {
			return nil, errors.E(errors.Invalid, OAuthInvalidRedirectURI, "http redirect_uri must use loopback host")
		}
	} else if scheme != "https" {
		return nil, errors.E(errors.Invalid, OAuthInvalidRedirectURI, "redirect_uri scheme must be https or loopback http")
	}
	return u, nil
}

// MatchesRedirectURI evaluates whether candidate matches one of the client's registered redirect URIs.
func (c *OAuthClient) MatchesRedirectURI(candidate string) bool {
	if c == nil {
		return false
	}
	candURL, err := ValidateCandidateRedirectURI(candidate)
	if err != nil {
		return false
	}
	candScheme := strings.ToLower(candURL.Scheme)
	candHost := strings.ToLower(candURL.Host)
	candHostname := strings.ToLower(candURL.Hostname())

	for _, rawRule := range c.RedirectURIs {
		ruleURL, err := url.Parse(rawRule)
		if err != nil {
			continue
		}
		ruleScheme := strings.ToLower(ruleURL.Scheme)
		if candScheme != ruleScheme {
			continue
		}

		// RFC 8252 §7.3 loopback HTTP: port-insensitive matching for loopback hosts.
		if ruleScheme == "http" {
			ruleHostname := strings.ToLower(ruleURL.Hostname())
			if !isLoopbackHostname(ruleHostname) || candHostname != ruleHostname {
				continue
			}
			if normalizeLoopbackPath(candURL.Path) == normalizeLoopbackPath(ruleURL.Path) && candURL.RawQuery == ruleURL.RawQuery {
				return true
			}
			continue
		}

		// HTTPS host + port must match exactly.
		if candHost != strings.ToLower(ruleURL.Host) {
			continue
		}

		// Explicit HTTPS subpath prefix rule (`https://example.com/callback/*`)
		if strings.HasSuffix(ruleURL.Path, "/*") && ruleURL.RawQuery == "" {
			prefix := strings.TrimSuffix(ruleURL.Path, "*")
			if prefix != "/" && strings.HasPrefix(candURL.Path, prefix) && !strings.Contains(candURL.Path, "..") {
				return true
			}
			continue
		}

		// Exact HTTPS URI match
		if candURL.Path == ruleURL.Path && candURL.RawQuery == ruleURL.RawQuery {
			return true
		}
	}

	return false
}

func isLoopbackHostname(hostname string) bool {
	return hostname == "127.0.0.1" || hostname == "::1" || hostname == "localhost"
}

func normalizeLoopbackPath(p string) string {
	if p == "" {
		return "/"
	}
	return p
}

// OAuthClientPatchSchema defines patchable fields for updating an OAuthClient.
var OAuthClientPatchSchema = patch.NewSchema[OAuthClient]().
	Field("name", func(c *OAuthClient) *string { return &c.Name }).
	Field("description", func(c *OAuthClient) *string { return &c.Description }).
	Field("redirect_uris", func(c *OAuthClient) *[]string { return &c.RedirectURIs }).
	Field("allowed_scopes", func(c *OAuthClient) *[]string { return &c.AllowedScopes }).
	Field("token_endpoint_auth_method", func(c *OAuthClient) *TokenEndpointAuthMethod { return &c.TokenEndpointAuthMethod }).
	Field("refresh_token_policy", func(c *OAuthClient) *RefreshTokenPolicy { return &c.RefreshTokenPolicy })

// ApplyPatch applies partial updates to an OAuthClient and re-validates invariants.
func (c *OAuthClient) ApplyPatch(incoming *OAuthClient, mask []string) error {
	if incoming == nil {
		return errors.E(errors.Invalid, OAuthInvalidClient, "oauth client payload is required")
	}
	if err := OAuthClientPatchSchema.Apply(c, incoming, mask); err != nil {
		return errors.E(errors.Invalid, OAuthInvalidClient, err)
	}
	c.UpdateTime = time.Now().UTC()
	return c.Validate()
}

// ResolveRequestedOAuthScopes resolves requested OAuth scopes against clientAllowed and memberRole.
// It ignores standard OIDC identity hints (`openid`, `profile`, `email`, `address`, `phone`),
// tracks `offline_access`, defaults omitted requests to the read-only subset of `clientAllowed`,
// intersects explicit requests against `clientAllowed`, and restricts `viewer` roles to `:read` scopes.
func ResolveRequestedOAuthScopes(requested []string, clientAllowed []string, memberRole string) (granted []string, offlineAccess bool, err error) {
	allowedSet := make(map[string]struct{}, len(clientAllowed))
	normalizedAllowed := make([]string, 0, len(clientAllowed))
	for _, s := range clientAllowed {
		trimmed := strings.TrimSpace(s)
		if trimmed == "" {
			continue
		}
		if _, dup := allowedSet[trimmed]; !dup {
			allowedSet[trimmed] = struct{}{}
			normalizedAllowed = append(normalizedAllowed, trimmed)
		}
	}

	var nonOIDC []string
	seenReq := make(map[string]struct{}, len(requested))
	for _, raw := range requested {
		for part := range strings.FieldsSeq(raw) {
			switch part {
			case "openid", "profile", "email", "address", "phone":
				continue
			case "offline_access":
				offlineAccess = true
				continue
			default:
				if _, dup := seenReq[part]; !dup {
					seenReq[part] = struct{}{}
					nonOIDC = append(nonOIDC, part)
				}
			}
		}
	}

	var resolved []string
	if len(nonOIDC) == 0 {
		for _, s := range normalizedAllowed {
			if strings.HasSuffix(s, ":read") {
				resolved = append(resolved, s)
			}
		}
		if len(resolved) == 0 && !strings.EqualFold(memberRole, "viewer") {
			resolved = slices.Clone(normalizedAllowed)
		}
	} else {
		for _, s := range nonOIDC {
			if _, ok := allowedSet[s]; ok {
				resolved = append(resolved, s)
			}
		}
		if len(resolved) == 0 {
			return nil, offlineAccess, errors.E(errors.Invalid, OAuthInvalidScope, "requested scopes are not permitted for this client")
		}
	}

	if strings.EqualFold(memberRole, "viewer") {
		readOnly := make([]string, 0, len(resolved))
		for _, s := range resolved {
			if strings.HasSuffix(s, ":read") {
				readOnly = append(readOnly, s)
			}
		}
		resolved = readOnly
	}

	if len(resolved) == 0 {
		return nil, offlineAccess, errors.E(errors.Permission, OAuthInvalidScope, "no permitted scopes available for this user and client")
	}

	return resolved, offlineAccess, nil
}

// OAuthGrant represents an authorized user + workspace OAuth 2.1 grant.
type OAuthGrant struct {
	ID                        OAuthGrantID
	ClientID                  OAuthClientID
	UserID                    UserID
	SpaceID                   string
	Scopes                    []string
	RefreshTokenHash          string
	PreviousRefreshTokenHash  string
	PreviousRefreshGraceUntil *time.Time
	RefreshExpiresAt          *time.Time
	LastUsedAt                *time.Time
	RevokedAt                 *time.Time
	CreateTime                time.Time
	UpdateTime                time.Time
}

// IsRevoked reports whether the grant has been revoked.
func (g *OAuthGrant) IsRevoked() bool {
	return g == nil || g.RevokedAt != nil
}

// IsRefreshExpired reports whether the refresh token has expired at now.
func (g *OAuthGrant) IsRefreshExpired(now time.Time) bool {
	return g.RefreshExpiresAt != nil && !now.Before(*g.RefreshExpiresAt)
}

// MatchesPreviousRefreshToken reports whether tokenHash matches the rotated-out refresh token within its grace window.
func (g *OAuthGrant) MatchesPreviousRefreshToken(tokenHash string, now time.Time) bool {
	if g == nil || g.PreviousRefreshTokenHash == "" || tokenHash == "" {
		return false
	}
	if subtle.ConstantTimeCompare([]byte(g.PreviousRefreshTokenHash), []byte(tokenHash)) != 1 {
		return false
	}
	return g.PreviousRefreshGraceUntil != nil && now.Before(*g.PreviousRefreshGraceUntil)
}

// OAuthAuthCode represents a single-use OAuth 2.1 authorization code and browser handoff nonce.
type OAuthAuthCode struct {
	ID                  OAuthAuthCodeID
	CodeHash            string
	HandoffHash         string
	Approved            bool
	ClientID            OAuthClientID
	UserID              UserID
	SpaceID             string
	RedirectURI         string
	State               string
	Resource            string
	Scopes              []string
	CodeChallenge       string
	CodeChallengeMethod string
	ExpiresAt           time.Time
	ConsumedAt          *time.Time
	HandoffConsumedAt   *time.Time
	CreateTime          time.Time
}

// OAuthAccessToken represents a persisted opaque `sat_oat_...` access token bound to a grant.
type OAuthAccessToken struct {
	ID         OAuthAccessTokenID
	GrantID    OAuthGrantID
	TokenHash  string
	ExpiresAt  time.Time
	RevokedAt  *time.Time
	CreateTime time.Time
}

// IsActive reports whether the access token is unrevoked and unexpired at now.
func (t *OAuthAccessToken) IsActive(now time.Time) bool {
	return t != nil && t.RevokedAt == nil && now.Before(t.ExpiresAt)
}
