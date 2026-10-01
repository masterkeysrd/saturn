package financeapp

import (
	"context"

	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

// Request & Response structures
type CreateBudgetRequest struct {
	Budget *finance.Budget
}

type UpdateBudgetRequest struct {
	Budget      *finance.Budget
	Propagation finance.LimitPropagation
	UpdateMask  []string
}

// CreateBudget orchestrates budget template creation.
func (c *coordinator) CreateBudget(ctx context.Context, req *CreateBudgetRequest) (*finance.Budget, error) {
	const op errors.Op = "application/finance.CreateBudget"
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, err
	}
	if req == nil || req.Budget == nil {
		return nil, errors.E(op, errors.Invalid, "budget payload is required")
	}

	return c.financeService.CreateBudget(ctx, rCtx, req.Budget)
}

// UpdateBudget orchestrates budget template updates.
func (c *coordinator) UpdateBudget(ctx context.Context, req *UpdateBudgetRequest) (*finance.Budget, error) {
	const op errors.Op = "application/finance.UpdateBudget"
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, err
	}
	if req == nil || req.Budget == nil {
		return nil, errors.E(op, errors.Invalid, "budget payload is required")
	}

	updated, err := c.financeService.UpdateBudget(ctx, rCtx, req.Budget, req.UpdateMask)
	if err != nil {
		return nil, err
	}

	// Handle limit propagation to the current active period if requested
	if req.Propagation == finance.PropagationCurrentPeriod && req.Budget.LimitAmount > 0 {
		period, err := c.financeService.GetOrCreatePeriod(ctx, rCtx, updated.ID, rCtx.Now())
		if err == nil {
			// Update the current period's limit in the database
			_ = c.financeService.UpdatePeriodLimit(ctx, rCtx, period.ID, req.Budget.LimitAmount)
		}
	}

	return updated, nil
}

// GetBudget orchestrates fetching a single budget template.
func (c *coordinator) GetBudget(ctx context.Context, id finance.BudgetID) (*finance.Budget, error) {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, err
	}

	return c.financeService.GetBudget(ctx, rCtx, id)
}

type DeleteBudgetRequest struct {
	ID      finance.BudgetID
	Version int64
}

// DeleteBudget orchestrates budget template deletion.
func (c *coordinator) DeleteBudget(ctx context.Context, req *DeleteBudgetRequest) error {
	const op errors.Op = "application/finance.DeleteBudget"
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return err
	}
	if req == nil {
		return errors.E(op, errors.Invalid, "delete request is required")
	}

	return c.financeService.DeleteBudget(ctx, rCtx, req.ID, finance.DeleteOptions{
		Version: req.Version,
	})
}
