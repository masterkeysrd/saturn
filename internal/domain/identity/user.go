package identity

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	"github.com/masterkeysrd/saturn/internal/foundation/id"
)

type (
	UserID = auth.UserID
	Role   = auth.Role
)

const (
	MinPasswordLength = 8  // Minimum length for user passwords
	MaxPasswordLength = 64 // Maximum length for user passwords
)

// UserStore defines the interface for user persistence.
type UserStore interface {
	// Get retrieves a user by their unique ID.
	Get(context.Context, UserID) (*User, error)

	// Store saves a new user to the store.
	Store(context.Context, *User) error

	// GetBy retrieves a user based on the given criteria.
	GetBy(context.Context, GetUserCriteria) (*User, error)

	// ExistsBy checks if a user exists based on the given criteria.
	ExistsBy(context.Context, UserExistCriteria) (bool, error)
}

// GetUserCriteria represents criteria to retrieve a user.
type GetUserCriteria interface {
	isGetUserCriteria()
}

// UserExistCriteria represents criteria to check for user existence.
type UserExistCriteria interface {
	isUserExistCriteria()
}

// User represents a user in the identity system.
type User struct {
	ID         UserID
	Name       string
	AvatarURL  *string
	Email      string
	Username   string
	Role       Role
	Status     UserStatus
	CreateTime time.Time
	UpdateTime time.Time
	DeleteTime *time.Time
}

// Initialize sets up the user with a new ID, timestamps, and default values.
func (u *User) Initialize() error {
	if u == nil {
		return fmt.Errorf("user is nil")
	}

	uid, err := id.New[UserID]()
	if err != nil {
		return fmt.Errorf("failed to generate user ID: %w", err)
	}

	now := time.Now().UTC()

	u.ID = uid
	u.Name = strings.TrimSpace(u.Name)
	u.Username = strings.TrimSpace(u.Username)
	u.Email = strings.TrimSpace(u.Email)
	u.CreateTime = now
	u.UpdateTime = now

	if u.Role == "" {
		u.Role = auth.RoleUser
	}

	return nil
}

// Validate checks if the user data is valid.
func (u *User) Validate() error {
	if u == nil {
		return fmt.Errorf("user is nil")
	}

	// Validate ID
	if err := id.Validate(u.ID); err != nil {
		return fmt.Errorf("invalid user ID: %w", err)
	}

	if u.Name == "" {
		return fmt.Errorf("name cannot be empty")
	}

	if len(u.Name) < 2 {
		return fmt.Errorf("name must be at least 2 characters long")
	}
	if len(u.Name) > 100 {
		return fmt.Errorf("name cannot be longer than 100 characters")
	}

	// Validate Username
	if u.Username == "" {
		return fmt.Errorf("username cannot be empty")
	}
	if len(u.Username) < 4 {
		return fmt.Errorf("username must be at least 4 characters long")
	}
	if len(u.Username) > 30 {
		return fmt.Errorf("username cannot be longer than 30 characters")
	}

	// Validate Email
	if u.Email == "" {
		return fmt.Errorf("email cannot be empty")
	}
	if len(u.Email) < 5 {
		return fmt.Errorf("email must be at least 5 characters long")
	}
	if !strings.Contains(u.Email, "@") {
		return fmt.Errorf("invalid email format")
	}
	if len(u.Email) > 254 {
		return fmt.Errorf("email cannot be longer than 254 characters")
	}

	// Validate Role
	if !u.Role.IsValid() {
		return fmt.Errorf("invalid user role: %q", u.Role)
	}

	return nil
}

// Sanitize trims whitespace from user fields.
func (u *User) Sanitize() {
	u.Username = strings.TrimSpace(u.Username)
	u.Email = strings.TrimSpace(u.Email)
}

// UserStatus represents the status of a user.
type UserStatus string

const (
	UserStatusPending UserStatus = "pending" // User pending activation.
	UserStatusActive  UserStatus = "active"  // Active user
)

func (s UserStatus) IsValid() bool {
	switch s {
	case UserStatusPending, UserStatusActive:
		return true
	default:
		return false
	}
}

func (s UserStatus) String() string {
	return string(s)
}
