package connector

import (
	"slices"
	"time"

	"github.com/lib/pq"
	"github.com/masterkeysrd/saturn/internal/platform/id"
)

// ConnectedAccountPrefix is the prefix for connected account IDs.
const ConnectedAccountPrefix = "cac_"

// AccountContactPrefix is the prefix for account contact IDs.
const AccountContactPrefix = "cnt_"

var (
	// ConnectedAccountIDGenerator generates and validates ConnectedAccount IDs.
	ConnectedAccountIDGenerator = id.NewPrefixGenerator(ConnectedAccountPrefix)

	// AccountContactIDGenerator generates and validates AccountContact IDs.
	AccountContactIDGenerator = id.NewPrefixGenerator(AccountContactPrefix)
)

// GenerateConnectedAccountID generates a new ConnectedAccount ID with the cac_ prefix.
func GenerateConnectedAccountID() (string, error) {
	return ConnectedAccountIDGenerator.Generate()
}

// ValidateConnectedAccountID checks that id is a valid ConnectedAccount ID.
func ValidateConnectedAccountID(idStr string) error {
	return ConnectedAccountIDGenerator.Validate(idStr)
}

// GenerateAccountContactID generates a new AccountContact ID with the cnt_ prefix.
func GenerateAccountContactID() (string, error) {
	return AccountContactIDGenerator.Generate()
}

// ValidateAccountContactID checks that id is a valid AccountContact ID.
func ValidateAccountContactID(idStr string) error {
	return AccountContactIDGenerator.Validate(idStr)
}

// AccountStatus represents the operational health status of a connected account.
type AccountStatus string

const (
	// AccountStatusHealthy indicates the connected account is fully functional with valid tokens.
	AccountStatusHealthy AccountStatus = "healthy"

	// AccountStatusReauthRequired indicates tokens are invalid or revoked and user re-authentication is needed.
	AccountStatusReauthRequired AccountStatus = "reauth_required"

	// AccountStatusRateLimited indicates the provider returned 429 and subsequent requests must back off.
	AccountStatusRateLimited AccountStatus = "rate_limited"

	// AccountStatusRevoked indicates the account was disconnected or revoked.
	AccountStatusRevoked AccountStatus = "revoked"

	// AccountStatusError indicates an unrecoverable or unexpected error state.
	AccountStatusError AccountStatus = "error"
)

// Capability defines a platform feature backed by a connected account.
type Capability string

const (
	// CapabilityCalendar enables calendar events synchronization.
	CapabilityCalendar Capability = "calendar"

	// CapabilityMail enables email ingestion, sync, and sending.
	CapabilityMail Capability = "mail"

	// CapabilityContacts enables address book and contact search.
	CapabilityContacts Capability = "contacts"
)

// ConnectedAccount represents a space-owned external identity connection (e.g. Google, Microsoft).
type ConnectedAccount struct {
	ID                  string         `db:"id" json:"id"`
	SpaceID             string         `db:"space_id" json:"space_id"`
	CreatedByUserID     string         `db:"created_by_user_id" json:"created_by_user_id"`
	Provider            string         `db:"provider" json:"provider"`
	ProviderAccountID   string         `db:"provider_account_id" json:"provider_account_id"`
	Email               string         `db:"email" json:"email"`
	DisplayName         *string        `db:"display_name" json:"display_name"`
	AvatarURL           *string        `db:"avatar_url" json:"avatar_url"`
	Color               *string        `db:"color" json:"color"`
	AccessTokenEnc      string         `db:"access_token_enc" json:"-"`
	RefreshTokenEnc     string         `db:"refresh_token_enc" json:"-"`
	TokenExpiry         time.Time      `db:"token_expiry" json:"token_expiry"`
	GrantedScopes       pq.StringArray `db:"granted_scopes" json:"granted_scopes"`
	EnabledCapabilities pq.StringArray `db:"enabled_capabilities" json:"enabled_capabilities"`
	Status              AccountStatus  `db:"status" json:"status"`
	StatusReason        *string        `db:"status_reason" json:"status_reason"`
	BackoffUntil        *time.Time     `db:"backoff_until" json:"backoff_until"`
	LastSyncTime        *time.Time     `db:"last_sync_time" json:"last_sync_time"`
	Version             int64          `db:"version" json:"version"`
	CreateTime          time.Time      `db:"create_time" json:"create_time"`
	UpdateTime          time.Time      `db:"update_time" json:"update_time"`
}

// HasCapability returns true if the connected account has the given capability enabled.
func (a *ConnectedAccount) HasCapability(cap Capability) bool {
	if a == nil {
		return false
	}
	return slices.Contains(a.EnabledCapabilities, string(cap))
}

// HasScope returns true if the connected account has been granted the given scope.
func (a *ConnectedAccount) HasScope(scope string) bool {
	if a == nil {
		return false
	}
	return slices.Contains(a.GrantedScopes, scope)
}

// IsHealthy returns true if the account status is healthy.
func (a *ConnectedAccount) IsHealthy() bool {
	return a != nil && a.Status == AccountStatusHealthy
}

// IsRateLimited returns true if the account is marked rate limited and backoff is still active.
func (a *ConnectedAccount) IsRateLimited(now time.Time) bool {
	if a == nil || a.Status != AccountStatusRateLimited {
		return false
	}
	if a.BackoffUntil == nil {
		return true
	}
	return a.BackoffUntil.After(now)
}

// RequiresReauth returns true if the account requires user re-authentication.
func (a *ConnectedAccount) RequiresReauth() bool {
	return a != nil && a.Status == AccountStatusReauthRequired
}

// AccountContact represents a cached address book contact associated with a connected account.
type AccountContact struct {
	ID                 string    `db:"id" json:"id"`
	SpaceID            string    `db:"space_id" json:"space_id"`
	ConnectedAccountID string    `db:"connected_account_id" json:"connected_account_id"`
	ProviderContactID  string    `db:"provider_contact_id" json:"provider_contact_id"`
	Email              *string   `db:"email" json:"email"`
	DisplayName        *string   `db:"display_name" json:"display_name"`
	AvatarURL          *string   `db:"avatar_url" json:"avatar_url"`
	UpdateTime         time.Time `db:"update_time" json:"update_time"`
}
