package identity

import (
	"fmt"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/id"
)

// UserStatus represents the status of a user account.
type UserStatus string

const (
	UserStatusActive          UserStatus = "active"
	UserStatusPendingApproval UserStatus = "pending_approval"
	UserStatusInactive        UserStatus = "inactive"
	UserStatusSuspended       UserStatus = "suspended"
)

// AccessLevel defines the level of access a user has within the system.
type AccessLevel string

const (
	AccessLevelAdmin AccessLevel = "admin"
	AccessLevelUser  AccessLevel = "user"
)

// User represents a registered user in the system.
type User struct {
	ID          UserID      `json:"id"`
	Email       string      `json:"email"`
	Username    string      `json:"username"`
	Name        string      `json:"name"`
	AvatarURL   string      `json:"avatar_url,omitempty"`
	Status      UserStatus  `json:"status"`
	AccessLevel AccessLevel `json:"access_level"`
	Version     int64       `json:"version"`
	AuthVersion int64       `json:"auth_version"`
	CreateTime  time.Time   `json:"create_time"`
	UpdateTime  time.Time   `json:"update_time"`
}

const userIDPrefix = "usr_"

// ErrInvalidUserID is returned when a UserID does not conform to the expected format.
var ErrInvalidUserID = fmt.Errorf("invalid user ID: must be a valid KSUID with prefix %q", userIDPrefix)

// UserID is a custom string type representing a user's unique identifier (KSUID).
type UserID string

// NewUserID creates a new UserID using the default ID generator.
func NewUserID() (UserID, error) {
	raw, err := id.Generate(userIDPrefix)
	if err != nil {
		return "", err
	}
	return UserID(raw), nil
}

// ParseUserID parses a string into a UserID and validates it.
func ParseUserID(s string) (UserID, error) {
	if err := id.Validate(s, userIDPrefix); err != nil {
		return "", fmt.Errorf("%w: %v", ErrInvalidUserID, err)
	}
	return UserID(s), nil
}

// MustUserID panics if the string is not a valid UserID.
func MustUserID(s string) UserID {
	userID, err := ParseUserID(s)
	if err != nil {
		panic(err)
	}
	return userID
}

// String returns the string representation of the UserID.
func (uid UserID) String() string {
	return string(uid)
}

// IsValid checks if the UserID is non-empty.
func (uid UserID) IsValid() bool {
	return uid != ""
}

// Validate checks if the UserID is valid against the default generator.
func (uid UserID) Validate() error {
	return id.Validate(string(uid), userIDPrefix)
}
