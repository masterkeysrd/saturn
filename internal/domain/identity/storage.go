package identity

import "context"

// UserStore defines the interface for user persistence operations.
type UserStore interface {
	// Create inserts a new user and returns the created record.
	Create(ctx context.Context, user *User) error

	// GetByID retrieves a user by their unique ID.
	GetByID(ctx context.Context, id UserID) (*User, error)

	// GetByEmail retrieves a user by their email address.
	GetByEmail(ctx context.Context, email string) (*User, error)

	// GetByUsername retrieves a user by their username.
	GetByUsername(ctx context.Context, username string) (*User, error)

	// Update modifies an existing user with optimistic locking.
	Update(ctx context.Context, user *User) error

	// Delete removes a user by their unique ID.
	Delete(ctx context.Context, id UserID) error
}

// UserCredentialStore defines the interface for user credential persistence operations.
type UserCredentialStore interface {
	// Create inserts a new credential for the given user.
	Create(ctx context.Context, credential *Credential) error

	// GetByUserID retrieves all credentials for a user.
	GetByUserID(ctx context.Context, userID UserID) ([]*Credential, error)

	// GetByUserIDAndAuthType retrieves a specific credential for a user.
	GetByUserIDAndAuthType(ctx context.Context, userID UserID, authType string) (*Credential, error)

	// Delete removes a credential for a user.
	Delete(ctx context.Context, userID UserID, authType string) error
}
