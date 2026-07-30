package financeapp

import (
	"context"
	"errors"
	"time"

	"github.com/masterkeysrd/saturn/internal/domain/finance"
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
func (c *Coordinator) CreateBudget(ctx context.Context, req *CreateBudgetRequest) (*finance.Budget, error) {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, err
	}
	if req.Budget == nil {
		return nil, errors.New("budget payload is required")
	}

	req.Budget.SpaceID = rCtx.SpaceID
	return c.financeService.CreateBudget(ctx, req.Budget)
}

// UpdateBudget orchestrates budget template updates.
func (c *Coordinator) UpdateBudget(ctx context.Context, req *UpdateBudgetRequest) (*finance.Budget, error) {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, err
	}
	if req.Budget == nil {
		return nil, errors.New("budget payload is required")
	}

	req.Budget.SpaceID = rCtx.SpaceID
	updated, err := c.financeService.UpdateBudget(ctx, req.Budget, req.UpdateMask)
	if err != nil {
		return nil, err
	}

	// Handle limit propagation to the current active period if requested
	if req.Propagation == finance.PropagationCurrentPeriod && req.Budget.LimitAmount > 0 {
		period, err := c.financeService.GetOrCreatePeriod(ctx, updated.SpaceID, updated.ID, time.Now())
		if err == nil {
			// Update the current period's limit in the database
			_ = c.financeService.UpdatePeriodLimit(ctx, period.ID, req.Budget.LimitAmount)
		}
	}

	return updated, nil
}

// GetBudget orchestrates fetching a single budget template.
func (c *Coordinator) GetBudget(ctx context.Context, id finance.BudgetID) (*finance.Budget, error) {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, err
	}

	return c.financeService.GetBudget(ctx, rCtx.SpaceID, id)
}

type DeleteBudgetRequest struct {
	ID      finance.BudgetID
	Version int64
}

// DeleteBudget orchestrates budget template deletion.
func (c *Coordinator) DeleteBudget(ctx context.Context, req *DeleteBudgetRequest) error {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return err
	}
	if req == nil {
		return errors.New("delete request is required")
	}

	return c.financeService.DeleteBudget(ctx, rCtx.SpaceID, req.ID, finance.DeleteOptions{
		Version: req.Version,
	})
}
