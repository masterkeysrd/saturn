package identity

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	"github.com/masterkeysrd/saturn/internal/foundation/id"
)

const (
	MinPasswordLength = 8  // Minimum length for user passwords
	MaxPasswordLength = 64 // Maximum length for user passwords
)

// UserStore defines the interface for user persistence.
type UserStore interface {
	// Store saves a new user to the store.
	Store(context.Context, *User) error

	// ExistsBy checks if a user exists based on the given criteria.
	ExistsBy(context.Context, UserExistCriteria) (bool, error)
}

// UserExistCriteria represents criteria to check for user existence.
type UserExistCriteria interface {
	isUserExistCriteria()
}

// PasswordHasher defines the interface for password hashing and comparison.
type PasswordHasher interface {
	Hash(password string) (string, error)
	Compare(hashedPassword, password string) bool
}

// UserID represents a unique identifier for a user.
type UserID string

func (uid UserID) String() string {
	return string(uid)
}

// User represents a user in the identity system.
type User struct {
	ID             UserID
	Username       string
	Email          string
	Role           auth.Role
	HashedPassword string
	Status         UserStatus
	CreatedAt      time.Time
	UpdatedAt      time.Time
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
	u.Status = UserStatusActive
	u.CreatedAt = now
	u.UpdatedAt = now

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

	// Validate Username
	if u.Username == "" {
		return fmt.Errorf("username cannot be empty")
	}
	if len(u.Username) < 3 {
		return fmt.Errorf("username must be at least 3 characters long")
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

	// Validate HashedPassword
	if u.HashedPassword == "" {
		return fmt.Errorf("hashed password cannot be empty")
	}
	return nil
}

// Sanitize trims whitespace from user fields.
func (u *User) Sanitize() {
	u.Username = strings.TrimSpace(u.Username)
	u.Email = strings.TrimSpace(u.Email)
}

// SetPassword hashes and sets the user's password.
func (u *User) SetPassword(password string, hasher PasswordHasher) error {
	password = strings.TrimSpace(password)
	if password == "" {
		return fmt.Errorf("password cannot be empty")
	}

	if len(password) < MinPasswordLength {
		return fmt.Errorf("password must be at least %d characters long", MinPasswordLength)
	}

	if len(password) > MaxPasswordLength {
		return fmt.Errorf("password cannot be longer than %d characters", MaxPasswordLength)
	}

	hashed, err := hasher.Hash(password)
	if err != nil {
		return fmt.Errorf("failed to hash password: %w", err)
	}
	u.HashedPassword = hashed
	return nil
}

// VerifyPassword checks if the provided password matches the stored hashed password.
func (u *User) VerifyPassword(password string, hasher PasswordHasher) bool {
	password = strings.TrimSpace(password)
	return hasher.Compare(u.HashedPassword, password)
}

// UserStatus represents the status of a user.
type UserStatus string

const (
	UserStatusActive UserStatus = "active" // Active user
)

// CreateUserInput represents the input data required to create a new user.
type CreateUserInput struct {
	Username string
	Email    string
	Password string
}
