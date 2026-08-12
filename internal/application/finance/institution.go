package financeapp

import (
	"context"

	"github.com/masterkeysrd/saturn/internal/domain/finance"
)

// CreateInstitution creates a new financial institution in the resolved space context.
func (c *Coordinator) CreateInstitution(ctx context.Context, inst *finance.Institution) (*finance.Institution, error) {
	reqCtx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, err
	}
	inst.SpaceID = reqCtx.SpaceID
	return c.financeService.CreateInstitution(ctx, inst)
}

// UpdateInstitution updates an existing financial institution.
func (c *Coordinator) UpdateInstitution(ctx context.Context, inst *finance.Institution, mask []string) (*finance.Institution, error) {
	reqCtx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, err
	}
	inst.SpaceID = reqCtx.SpaceID
	return c.financeService.UpdateInstitution(ctx, inst, mask)
}

// DeleteInstitution soft-deletes a financial institution.
func (c *Coordinator) DeleteInstitution(ctx context.Context, id finance.InstitutionID, opts finance.DeleteOptions) error {
	reqCtx, err := c.resolveContext(ctx)
	if err != nil {
		return err
	}
	return c.financeService.DeleteInstitution(ctx, reqCtx.SpaceID, id, opts)
}

// ResolveInstitution resolves web domain and color details for a named institution.
func (c *Coordinator) ResolveInstitution(ctx context.Context, name string) (*finance.ResolveInstitutionResult, error) {
	reqCtx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, err
	}
	return c.financeService.ResolveInstitution(ctx, reqCtx.SpaceID, name)
}
