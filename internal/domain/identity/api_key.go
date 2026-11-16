package identity

import (
	"encoding/base64"
	"fmt"
	"slices"
	"strings"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/hash"
	"github.com/masterkeysrd/saturn/internal/platform/id"
	"github.com/masterkeysrd/saturn/internal/platform/patch"
	"github.com/masterkeysrd/saturn/internal/platform/token"
)

const (
	apiKeyPrefix       = "apk_"
	APIKeyTokenPrefix  = "sat_"
	apiKeyPrefixLength = 12
	apiKeyRandomBytes  = 32
)

// APIKeyID represents a unique identifier for a user-owned API key.
type APIKeyID string

// NewAPIKeyID generates a new unique APIKeyID (`apk_<ksuid>`).
func NewAPIKeyID() (APIKeyID, error) {
	raw, err := id.Generate(apiKeyPrefix)
	if err != nil {
		return "", err
	}
	return APIKeyID(raw), nil
}

// ParseAPIKeyID parses and validates a string as an APIKeyID.
func ParseAPIKeyID(s string) (APIKeyID, error) {
	if err := id.Validate(s, apiKeyPrefix); err != nil {
		return "", fmt.Errorf("invalid API key ID: %w", err)
	}
	return APIKeyID(s), nil
}

// APIKeyScope represents a declarative permission scope assigned to an API key.
type APIKeyScope string

const (
	ScopeSpacesRead       APIKeyScope = "spaces:read"
	ScopeFinanceRead      APIKeyScope = "finance:read"
	ScopeFinanceWrite     APIKeyScope = "finance:write"
	ScopeCalendarRead     APIKeyScope = "calendar:read"
	ScopeCalendarWrite    APIKeyScope = "calendar:write"
	ScopeMailRead         APIKeyScope = "mail:read"
	ScopeMailWrite        APIKeyScope = "mail:write"
	ScopeAIRead           APIKeyScope = "ai:read"
	ScopeAIExecute        APIKeyScope = "ai:execute"
	ScopeAIWrite          APIKeyScope = "ai:write"
	ScopeWorkflowsRead    APIKeyScope = "workflows:read"
	ScopeWorkflowsExecute APIKeyScope = "workflows:execute"
	ScopeWorkflowsWrite   APIKeyScope = "workflows:write"
)

// AllAPIKeyScopes lists all valid v1 API key scopes in canonical order.
var AllAPIKeyScopes = []APIKeyScope{
	ScopeSpacesRead,
	ScopeFinanceRead,
	ScopeFinanceWrite,
	ScopeCalendarRead,
	ScopeCalendarWrite,
	ScopeMailRead,
	ScopeMailWrite,
	ScopeAIRead,
	ScopeAIExecute,
	ScopeAIWrite,
	ScopeWorkflowsRead,
	ScopeWorkflowsExecute,
	ScopeWorkflowsWrite,
}

// IsValid reports whether s is a recognized v1 API key scope.
func (s APIKeyScope) IsValid() bool {
	return slices.Contains(AllAPIKeyScopes, s)
}

// ValidateAPIKeyScopes validates and deduplicates a non-empty slice of scope strings.
func ValidateAPIKeyScopes(scopes []string) ([]string, error) {
	if len(scopes) == 0 {
		return nil, errors.E(errors.Invalid, InvalidAPIKeyScope, "at least one API key scope is required")
	}
	seen := make(map[string]struct{}, len(scopes))
	normalized := make([]string, 0, len(scopes))
	for _, raw := range scopes {
		trimmed := strings.TrimSpace(raw)
		scope := APIKeyScope(trimmed)
		if !scope.IsValid() {
			return nil, errors.E(errors.Invalid, InvalidAPIKeyScope, fmt.Sprintf("invalid API key scope: %q", raw))
		}
		if _, dup := seen[trimmed]; !dup {
			seen[trimmed] = struct{}{}
			normalized = append(normalized, trimmed)
		}
	}
	return normalized, nil
}

// GenerateAPIKeyToken generates a new 256-bit raw `sat_...` token, its 12-char display prefix, and SHA-256 hex digest.
func GenerateAPIKeyToken() (rawKey, keyPrefix, keyHash string, err error) {
	entropy, err := token.GenerateRandomBytes(apiKeyRandomBytes)
	if err != nil {
		return "", "", "", fmt.Errorf("generate api key entropy: %w", err)
	}
	rawKey = APIKeyTokenPrefix + base64.RawURLEncoding.EncodeToString(entropy)
	keyPrefix = rawKey[:min(apiKeyPrefixLength, len(rawKey))]
	keyHash = HashAPIKeyToken(rawKey)
	return rawKey, keyPrefix, keyHash, nil
}

// HashAPIKeyToken computes the hex-encoded SHA-256 digest of a raw API key token.
func HashAPIKeyToken(rawKey string) string {
	return hash.SHA256Hex(rawKey)
}

// APIKey represents a user-owned fine-grained personal access token.
type APIKey struct {
	ID          APIKeyID
	UserID      UserID
	Name        string
	Description string
	KeyPrefix   string
	KeyHash     string
	RawKey      string
	Scopes      []string
	SpaceIDs    []string
	ExpiresAt   *time.Time
	LastUsedAt  *time.Time
	CreateTime  time.Time
	UpdateTime  time.Time
}

// IsExpired reports whether the API key is expired at the given instant.
func (k *APIKey) IsExpired(now time.Time) bool {
	return k.ExpiresAt != nil && !now.Before(*k.ExpiresAt)
}

// Validate checks API key invariants and normalizes fields.
func (k *APIKey) Validate() error {
	if k == nil {
		return errors.E(errors.Invalid, "api key payload is required")
	}
	k.Name = strings.TrimSpace(k.Name)
	k.Description = strings.TrimSpace(k.Description)
	if k.Name == "" {
		return errors.E(errors.Invalid, "api key name is required")
	}
	if len(k.Name) > 255 {
		return errors.E(errors.Invalid, "api key name must not exceed 255 characters")
	}
	normalizedScopes, err := ValidateAPIKeyScopes(k.Scopes)
	if err != nil {
		return err
	}
	k.Scopes = normalizedScopes
	return nil
}

// APIKeyPatchSchema defines patchable fields for an APIKey entity.
var APIKeyPatchSchema = patch.NewSchema[APIKey]().
	Field("name", func(k *APIKey) *string { return &k.Name }).
	Field("description", func(k *APIKey) *string { return &k.Description }).
	Field("scopes", func(k *APIKey) *[]string { return &k.Scopes })

// ApplyPatch applies partial updates from an incoming APIKey based on the provided field mask.
// Note that space_ids are synchronized separately via space.APIKeyGrantStore.
func (k *APIKey) ApplyPatch(incoming *APIKey, mask []string) error {
	if incoming == nil {
		return errors.E(errors.Invalid, "api key payload is required")
	}
	filteredMask := make([]string, 0, len(mask))
	for _, field := range mask {
		if field == "space_ids" {
			continue
		}
		filteredMask = append(filteredMask, field)
	}
	if len(filteredMask) > 0 || len(mask) == 0 {
		if err := APIKeyPatchSchema.Apply(k, incoming, filteredMask); err != nil {
			return errors.E(errors.Invalid, err)
		}
	}
	k.UpdateTime = time.Now().UTC()
	return k.Validate()
}
