package iam

import (
	"context"

	"github.com/masterkeysrd/saturn/internal/domain/identity"
	"github.com/masterkeysrd/saturn/internal/domain/space"
	"github.com/masterkeysrd/saturn/internal/platform/password"
)

// Dependencies defines the inputs for creating a new iam.Coordinator.
type Dependencies struct {
	IdentityService IdentityService
	PasswordHasher  password.Hasher
	SpaceService    SpaceService
}

// Coordinator orchestrates identity operations across multiple services.
type Coordinator struct {
	identityService IdentityService
	passwordHasher  password.Hasher
	spaceService    SpaceService
}

// NewCoordinator creates a new Coordinator.
func NewCoordinator(deps Dependencies) *Coordinator {
	return &Coordinator{
		identityService: deps.IdentityService,
		passwordHasher:  deps.PasswordHasher,
		spaceService:    deps.SpaceService,
	}
}

// Authenticate delegates to the identity service's Authenticate method.
func (c *Coordinator) Authenticate(ctx context.Context, identifier string, password string) (*identity.User, error) {
	return c.identityService.Authenticate(ctx, identifier, password)
}

// GetAuthVersion delegates to the identity service's GetAuthVersion method.
func (c *Coordinator) GetAuthVersion(ctx context.Context, id identity.UserID) (int64, error) {
	return c.identityService.GetAuthVersion(ctx, id)
}

// GetCurrentUser retrieves the profile of the authenticated user by ID.
func (c *Coordinator) GetCurrentUser(ctx context.Context, userID identity.UserID) (*identity.User, error) {
	return c.identityService.GetUserByID(ctx, userID)
}

// IdentityService defines the interface for identity domain operations.
type IdentityService interface {
	CreateUser(ctx context.Context, user *identity.User) error
	CreateCredential(ctx context.Context, credential *identity.Credential) error
	UpdateCredential(ctx context.Context, credential *identity.Credential) error
	GetUserByID(ctx context.Context, id identity.UserID) (*identity.User, error)
	GetUserByEmail(ctx context.Context, email string) (*identity.User, error)
	GetUserByUsername(ctx context.Context, username string) (*identity.User, error)
	GetCredentialByUserIDAndAuthType(ctx context.Context, userID identity.UserID, authType string) (*identity.Credential, error)
	UpdateUser(ctx context.Context, user *identity.User) error
	ListUsers(ctx context.Context, filter *identity.ListUsersFilter) ([]*identity.User, string, error)
	ApproveUser(ctx context.Context, userID identity.UserID) (*identity.User, error)
	RejectUser(ctx context.Context, userID identity.UserID) (*identity.User, error)
	UpdateUserRole(ctx context.Context, userID identity.UserID, accessLevel identity.AccessLevel) (*identity.User, error)
	GetAuthVersion(ctx context.Context, id identity.UserID) (int64, error)
	IncrementAuthVersion(ctx context.Context, id identity.UserID) (int64, error)
	Authenticate(ctx context.Context, identifier string, password string) (*identity.User, error)
	RevokeAllSessions(ctx context.Context, userID identity.UserID) (int64, error)
}

// SpaceService defines the interface for space operations required by IAM application.
type SpaceService interface {
	CreateSpace(ctx context.Context, space *space.Space) (*space.Space, error)
}
