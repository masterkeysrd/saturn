package spaceaggregator

import (
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
