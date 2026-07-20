package space

import (
	"fmt"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/id"
)

// SpaceID is a custom string type representing a space's unique identifier (KSUID).
type SpaceID string

// NewSpaceID creates a new SpaceID using the default ID generator.
func NewSpaceID() (SpaceID, error) {
	raw, err := id.Generate(spacePrefix)
	if err != nil {
		return "", err
	}
	return SpaceID(raw), nil
}

// ParseSpaceID parses a string into a SpaceID and validates it.
func ParseSpaceID(s string) (SpaceID, error) {
	if err := id.Validate(s, spacePrefix); err != nil {
		return "", fmt.Errorf("invalid space ID: %w", err)
	}
	return SpaceID(s), nil
}

// MustSpaceID panics if the string is not a valid SpaceID.
func MustSpaceID(s string) SpaceID {
	spaceID, err := ParseSpaceID(s)
	if err != nil {
		panic(err)
	}
	return spaceID
}

// String returns the string representation of the SpaceID.
func (sid SpaceID) String() string {
	return string(sid)
}

// IsValid checks if the SpaceID is non-empty.
func (sid SpaceID) IsValid() bool {
	return sid != ""
}

// Validate checks if the SpaceID is valid against the default generator.
func (sid SpaceID) Validate() error {
	return id.Validate(string(sid), spacePrefix)
}

const spacePrefix = "spc_"

// SpaceRole defines the role of a user within a space.
type SpaceRole string

// IsValid checks if the role is a valid predefined SpaceRole.
func (r SpaceRole) IsValid() bool {
	switch r {
	case RoleOwner, RoleAdmin, RoleMember, RoleViewer:
		return true
	}
	return false
}

// Session represents the active user session context in a workspace.
type Session struct {
	SpaceID SpaceID
	UserID  SpaceID
}

const (
	RoleOwner  SpaceRole = "owner"
	RoleAdmin  SpaceRole = "admin"
	RoleMember SpaceRole = "member"
	RoleViewer SpaceRole = "viewer"
)

// Space represents a workspace.
type Space struct {
	ID          SpaceID   `json:"id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	OwnerID     SpaceID   `json:"owner_id"`
	Version     int64     `json:"version"`
	CreateTime  time.Time `json:"create_time"`
	UpdateTime  time.Time `json:"update_time"`
}

// Validate checks the space for business rule violations and sanitizes inputs.
func (s *Space) Validate() error {
	s.Name = trimSpace(s.Name)
	if s.Name == "" {
		return fmt.Errorf("space name is required")
	}
	if len(s.Name) > 255 {
		return fmt.Errorf("space name must not exceed 255 characters")
	}
	return nil
}

// trimSpace strips all whitespace characters from a string.
func trimSpace(s string) string {
	result := make([]byte, 0, len(s))
	for i := 0; i < len(s); i++ {
		if s[i] == ' ' || s[i] == '\t' || s[i] == '\n' || s[i] == '\r' {
			continue
		}
		result = append(result, s[i])
	}
	return string(result)
}
