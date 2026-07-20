package space

import (
	"context"
)

// SpaceStore defines the interface for space persistence operations.
type SpaceStore interface {
	// Create inserts a new space and returns the created record.
	Create(ctx context.Context, space *Space) error

	// GetByID retrieves a space by its unique ID.
	GetByID(ctx context.Context, id SpaceID) (*Space, error)

	// Update modifies an existing space with optimistic locking.
	Update(ctx context.Context, space *Space) error

	// Delete removes a space by its unique ID.
	Delete(ctx context.Context, id SpaceID) error

	// ListByUser returns spaces owned or joined by the user.
	ListByUser(ctx context.Context, userID SpaceID, filter *ListSpacesFilter) ([]*Space, string, error)

	// ListByUserOwned returns spaces owned by the user.
	ListByUserOwned(ctx context.Context, ownerID SpaceID, filter *ListSpacesFilter) ([]*Space, string, error)
}

// MemberStore defines the interface for member persistence operations.
type MemberStore interface {
	// Create inserts a new membership record.
	Create(ctx context.Context, member *Member) error

	// GetByID retrieves a membership by space ID and user ID.
	GetByID(ctx context.Context, spaceID SpaceID, userID SpaceID) (*Member, error)

	// Update modifies an existing membership.
	Update(ctx context.Context, member *Member) error

	// Delete removes a membership.
	Delete(ctx context.Context, spaceID SpaceID, userID SpaceID) error

	// ListBySpace returns all members of a space.
	ListBySpace(ctx context.Context, spaceID SpaceID, filter *ListMembersFilter) ([]*Member, string, error)

	// ListByUser returns all spaces where the user is a member.
	ListByUser(ctx context.Context, userID SpaceID) ([]*Member, error)

	// Exists checks if a membership exists.
	Exists(ctx context.Context, spaceID SpaceID, userID SpaceID) (bool, error)
}

// ListSpacesFilter encapsulates filtering parameters for listing spaces.
type ListSpacesFilter struct {
	PageSize      int32
	NextPageToken string
}

// ListMembersFilter encapsulates filtering parameters for listing members.
type ListMembersFilter struct {
	PageSize      int32
	NextPageToken string
}
