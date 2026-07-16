package iam

import (
	"context"

	"github.com/masterkeysrd/saturn/internal/domain/identity"
	"github.com/masterkeysrd/saturn/internal/platform/password"
)

// Coordinator orchestrates identity operations across multiple services.
type Coordinator struct {
	identityService IdentityService
	passwordHasher  password.Hasher
}

// NewCoordinator creates a new Coordinator.
func NewCoordinator(identityService IdentityService, passwordHasher password.Hasher) *Coordinator {
	return &Coordinator{
		identityService: identityService,
		passwordHasher:  passwordHasher,
	}
}

// IdentityService defines the interface for identity domain operations.
type IdentityService interface {
	CreateUser(ctx context.Context, user *identity.User) error
	CreateCredential(ctx context.Context, credential *identity.Credential) error
	UpdateCredential(ctx context.Context, credential *identity.Credential) error
	GetUserByID(ctx context.Context, id identity.UserID) (*identity.User, error)
	UpdateUser(ctx context.Context, user *identity.User) error
	ListUsers(ctx context.Context, filter *identity.ListUsersFilter) ([]*identity.User, string, error)
	ApproveUser(ctx context.Context, userID identity.UserID) (*identity.User, error)
	RejectUser(ctx context.Context, userID identity.UserID) (*identity.User, error)
	UpdateUserRole(ctx context.Context, userID identity.UserID, accessLevel identity.AccessLevel) (*identity.User, error)
}
