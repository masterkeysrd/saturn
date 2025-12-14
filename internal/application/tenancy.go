package application

import (
	"context"
	"errors"
	"fmt"

	"github.com/masterkeysrd/saturn/internal/domain/tenancy"
	"github.com/masterkeysrd/saturn/internal/foundation/access"
)

// TenancyService defines the interface for tenancy-related operations.
type TenancyService interface {
	CreateSpace(context.Context, access.Principal, *tenancy.Space) error
}

// TenancyApplication provides methods to manage tenancy operations.
type TenancyApplication struct {
	service TenancyService
}

// NewTenancyApplication creates a new instance of TenancyApplication.
func NewTenancyApplication(service TenancyService) *TenancyApplication {
	return &TenancyApplication{
		service: service,
	}
}

// CreateSpace creates a new space based on the provided request.
func (app *TenancyApplication) CreateSpace(ctx context.Context, req *CreateSpaceRequest) (*tenancy.Space, error) {
	principal, ok := access.GetPrincipal(ctx)
	if !ok {
		return nil, errors.New("unauthenticated: principal not found in context")
	}

	space := &tenancy.Space{
		Name:        req.Name,
		Alias:       req.Alias,
		Description: req.Description,
	}
	if err := app.service.CreateSpace(ctx, principal, space); err != nil {
		return nil, fmt.Errorf("failed to create space: %w", err)
	}

	return space, nil
}

// CreateSpaceRequest represents the request to create a new space.
type CreateSpaceRequest struct {
	Name        string  // The name of the space
	Alias       *string // An optional short alias for the space
	Description *string // An optional description of the space
}
