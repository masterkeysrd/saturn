package iam

import (
	"context"

	"github.com/masterkeysrd/saturn/internal/domain/identity"
)

// Coordinator orchestrates identity operations across multiple services.
type Coordinator struct {
	identityService IdentityService
}

// NewCoordinator creates a new Coordinator.
func NewCoordinator(identityService IdentityService) *Coordinator {
	return &Coordinator{
		identityService: identityService,
	}
}

// IdentityService defines the interface for identity domain operations.
type IdentityService interface {
	CreateUser(ctx context.Context, user *identity.User) error
	CreateCredential(ctx context.Context, credential *identity.Credential) error
}
