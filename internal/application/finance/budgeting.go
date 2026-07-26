package financeapp

import (
	"context"
	"time"

	"github.com/masterkeysrd/saturn/internal/domain/finance"
)

// Request & Response structures
type CreateBudgetRequest struct {
	Name             string
	LimitAmount      int64
	Currency         finance.Currency
	Interval         finance.RecurrenceInterval
	Icon             string
	Color            string
	DefaultAccountID *finance.AccountID
}

type UpdateBudgetRequest struct {
	ID               finance.BudgetID
	Name             string
	LimitAmount      int64
	Currency         finance.Currency
	Interval         finance.RecurrenceInterval
	IsActive         bool
	Propagation      finance.LimitPropagation
	Icon             string
	Color            string
	DefaultAccountID *finance.AccountID
}

// CreateBudget orchestrates budget template creation.
func (c *Coordinator) CreateBudget(ctx context.Context, req *CreateBudgetRequest) (*finance.Budget, error) {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, err
	}

	budget := &finance.Budget{
		SpaceID:          rCtx.SpaceID,
		Name:             req.Name,
		LimitAmount:      req.LimitAmount,
		Currency:         req.Currency,
		Interval:         req.Interval,
		Icon:             req.Icon,
		Color:            req.Color,
		DefaultAccountID: req.DefaultAccountID,
	}

	return c.financeService.CreateBudget(ctx, budget)
}

// UpdateBudget orchestrates budget template updates.
func (c *Coordinator) UpdateBudget(ctx context.Context, req *UpdateBudgetRequest) (*finance.Budget, error) {
	_, err := c.resolveContext(ctx)
	if err != nil {
		return nil, err
	}

	budget := &finance.Budget{
		ID:               req.ID,
		Name:             req.Name,
		LimitAmount:      req.LimitAmount,
		Currency:         req.Currency,
		Interval:         req.Interval,
		IsActive:         req.IsActive,
		Icon:             req.Icon,
		Color:            req.Color,
		DefaultAccountID: req.DefaultAccountID,
	}

	updated, err := c.financeService.UpdateBudget(ctx, budget)
	if err != nil {
		return nil, err
	}

	// Handle limit propagation to the current active period if requested
	if req.Propagation == finance.PropagationCurrentPeriod && req.LimitAmount > 0 {
		period, err := c.financeService.GetOrCreatePeriod(ctx, updated.ID, time.Now())
		if err == nil {
			// Update the current period's limit in the database
			_ = c.financeService.UpdatePeriodLimit(ctx, period.ID, req.LimitAmount)
		}
	}

	return updated, nil
}

// GetBudget orchestrates fetching a single budget template.
func (c *Coordinator) GetBudget(ctx context.Context, id finance.BudgetID) (*finance.Budget, error) {
	_, err := c.resolveContext(ctx)
	if err != nil {
		return nil, err
	}

	return c.financeService.GetBudget(ctx, id)
}

// DeleteBudget orchestrates budget template deletion.
func (c *Coordinator) DeleteBudget(ctx context.Context, id finance.BudgetID) error {
	_, err := c.resolveContext(ctx)
	if err != nil {
		return err
	}

	return c.financeService.DeleteBudget(ctx, id)
}
