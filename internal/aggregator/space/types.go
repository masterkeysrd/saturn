package spaceaggregator

import (
	"time"

	"github.com/masterkeysrd/saturn/internal/domain/space"
)

// MemberProfile represents user details enriched in the workspace membership.
type MemberProfile struct {
	Name      string
	Username  string
	AvatarURL string
}

// SpaceMember wraps the domain member with profile details.
type SpaceMember struct {
	*space.Member
	Profile *MemberProfile
}

// APIKeyGrant represents an active workspace API key grant hydrated with key metadata and owner profile.
type APIKeyGrant struct {
	APIKeyID        string
	SpaceID         space.SpaceID
	UserID          space.UserID
	UserName        string
	UserEmail       string
	KeyName         string
	KeyPrefix       string
	Scopes          []string
	ExpiresAt       *time.Time
	LastUsedAt      *time.Time
	GrantCreateTime time.Time
}

// SpaceOAuthGrant represents an active OAuth 2.1 grant in a workspace hydrated with client metadata and user profile.
type SpaceOAuthGrant struct {
	GrantID    string
	ClientID   string
	ClientName string
	SpaceID    space.SpaceID
	UserID     space.UserID
	UserName   string
	UserEmail  string
	Scopes     []string
	LastUsedAt *time.Time
	CreateTime time.Time
}
