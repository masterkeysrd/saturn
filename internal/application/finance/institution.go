package financeapp

import (
	"context"

	"github.com/masterkeysrd/saturn/internal/domain/finance"
)

// CreateInstitution creates a new financial institution in the resolved space context.
func (c *coordinator) CreateInstitution(ctx context.Context, inst *finance.Institution) (*finance.Institution, error) {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, err
	}
	return c.financeService.CreateInstitution(ctx, rCtx, inst)
}

// UpdateInstitution updates an existing financial institution.
func (c *coordinator) UpdateInstitution(ctx context.Context, inst *finance.Institution, mask []string) (*finance.Institution, error) {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, err
	}
	return c.financeService.UpdateInstitution(ctx, rCtx, inst, mask)
}

// DeleteInstitution soft-deletes a financial institution.
func (c *coordinator) DeleteInstitution(ctx context.Context, id finance.InstitutionID, opts finance.DeleteOptions) error {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return err
	}
	return c.financeService.DeleteInstitution(ctx, rCtx, id, opts)
}

// ResolveInstitution resolves web domain and color details for a named institution.
func (c *coordinator) ResolveInstitution(ctx context.Context, name string) (*finance.ResolveInstitutionResult, error) {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, err
	}
	return c.financeService.ResolveInstitution(ctx, rCtx, name)
}
