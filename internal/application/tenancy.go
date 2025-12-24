package application

import (
	"context"
	"errors"
	"fmt"

	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/domain/tenancy"
	"github.com/masterkeysrd/saturn/internal/foundation/access"
	"github.com/masterkeysrd/saturn/internal/pkg/deps"
)

// TenancyService defines the interface for tenancy-related operations.
type TenancyService interface {
	CreateSpace(context.Context, access.Principal, *tenancy.Space) error
	ListSpaces(context.Context, tenancy.UserID) ([]*tenancy.Space, error)
	GetMembership(context.Context, tenancy.MembershipID) (*tenancy.Membership, error)
}

// TenancyApp provides methods to manage tenancy operations.
type TenancyApp struct {
	tenancyService TenancyService
	financeService FinanceService
}

type TenancyAppParams struct {
	deps.In

	TenancyService TenancyService
	FinanceService FinanceService
}

// NewTenancyApplication creates a new instance of TenancyApplication.
func NewTenancyApplication(params TenancyAppParams) *TenancyApp {
	return &TenancyApp{
		tenancyService: params.TenancyService,
		financeService: params.FinanceService,
	}
}

// CreateSpace creates a new space based on the provided request.
func (app *TenancyApp) CreateSpace(ctx context.Context, req *CreateSpaceRequest) (*tenancy.Space, error) {
	principal, ok := access.GetPrincipal(ctx)
	if !ok {
		return nil, errors.New("unauthenticated: principal not found in context")
	}

	space := &tenancy.Space{
		Name:        req.Name,
		Alias:       req.Alias,
		Description: req.Description,
	}
	if err := app.tenancyService.CreateSpace(ctx, principal, space); err != nil {
		return nil, fmt.Errorf("failed to create space: %w", err)
	}

	// Initialize default finance settings for the new space
	defaultSettings := &finance.Settings{
		SpaceID:      space.ID,
		BaseCurrency: finance.DefaultBaseCurrency,
	}
	if err := app.financeService.CreateSettings(ctx, principal, defaultSettings); err != nil {
		return nil, fmt.Errorf("failed to create default finance settings for space: %w", err)
	}

	return space, nil
}

func (app *TenancyApp) ListSpaces(ctx context.Context) ([]*tenancy.Space, error) {
	principal, ok := access.GetPrincipal(ctx)
	if !ok {
		return nil, errors.New("unauthenticated: principal not found in context")
	}

	spaces, err := app.tenancyService.ListSpaces(ctx, principal.ActorID())
	if err != nil {
		return nil, fmt.Errorf("failed to list spaces: %w", err)
	}

	return spaces, nil
}

// GetMembership retrieves a membership by its ID.
//
// This method is primarily intended for internal use within middleware components.
func (app *TenancyApp) GetMembership(ctx context.Context, membershipID tenancy.MembershipID) (*tenancy.Membership, error) {
	membership, err := app.tenancyService.GetMembership(ctx, membershipID)
	if err != nil {
		return nil, fmt.Errorf("failed to get membership: %w", err)
	}

	return membership, nil
}

// CreateSpaceRequest represents the request to create a new space.
type CreateSpaceRequest struct {
	Name        string  // The name of the space
	Alias       *string // An optional short alias for the space
	Description *string // An optional description of the space
}
