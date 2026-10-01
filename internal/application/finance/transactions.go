package financeapp

import (
	"context"
	"time"

	"github.com/masterkeysrd/saturn/internal/domain/finance"
)

type CreateExpenseRequest struct {
	BudgetID        finance.BudgetID
	Amount          int64
	Currency        finance.Currency
	Description     string
	TransactionDate time.Time
	EffectiveDate   time.Time
	AccountID       *finance.AccountID
}

func (c *coordinator) CreateExpense(ctx context.Context, req *CreateExpenseRequest) (*finance.Transaction, error) {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, err
	}

	if req.EffectiveDate.IsZero() {
		req.EffectiveDate = req.TransactionDate
	}

	txn := &finance.Transaction{
		BudgetID:        &req.BudgetID,
		Amount:          req.Amount,
		Currency:        req.Currency,
		Description:     req.Description,
		TransactionDate: rCtx.Date(req.TransactionDate),
		EffectiveDate:   rCtx.Date(req.EffectiveDate),
		AccountID:       req.AccountID,
	}

	return c.financeService.CreateExpense(ctx, rCtx, txn)
}

type CreateIncomeRequest struct {
	Amount          int64
	Currency        finance.Currency
	Description     string
	TransactionDate time.Time
	EffectiveDate   time.Time
	AccountID       *finance.AccountID
}

func (c *coordinator) CreateIncome(ctx context.Context, req *CreateIncomeRequest) (*finance.Transaction, error) {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, err
	}

	if req.EffectiveDate.IsZero() {
		req.EffectiveDate = req.TransactionDate
	}

	txn := &finance.Transaction{
		Amount:          req.Amount,
		Currency:        req.Currency,
		Description:     req.Description,
		TransactionDate: rCtx.Date(req.TransactionDate),
		EffectiveDate:   rCtx.Date(req.EffectiveDate),
		AccountID:       req.AccountID,
	}

	return c.financeService.CreateIncome(ctx, rCtx, txn)
}

func (c *coordinator) DeleteTransaction(ctx context.Context, id finance.TransactionID) error {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return err
	}
	return c.financeService.DeleteTransaction(ctx, rCtx, id)
}

type UpdateExpenseRequest struct {
	TransactionID   finance.TransactionID
	BudgetID        finance.BudgetID
	Amount          int64
	Currency        finance.Currency
	Description     string
	TransactionDate time.Time
	EffectiveDate   time.Time
	AccountID       *finance.AccountID
}

func (c *coordinator) UpdateExpense(ctx context.Context, req *UpdateExpenseRequest) (*finance.Transaction, error) {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, err
	}

	if req.EffectiveDate.IsZero() {
		req.EffectiveDate = req.TransactionDate
	}

	txn := &finance.Transaction{
		ID:              req.TransactionID,
		BudgetID:        &req.BudgetID,
		Amount:          req.Amount,
		Currency:        req.Currency,
		Description:     req.Description,
		TransactionDate: rCtx.Date(req.TransactionDate),
		EffectiveDate:   rCtx.Date(req.EffectiveDate),
		AccountID:       req.AccountID,
	}

	return c.financeService.UpdateExpense(ctx, rCtx, txn)
}

type UpdateIncomeRequest struct {
	TransactionID   finance.TransactionID
	Amount          int64
	Currency        finance.Currency
	Description     string
	TransactionDate time.Time
	EffectiveDate   time.Time
	AccountID       *finance.AccountID
}

func (c *coordinator) UpdateIncome(ctx context.Context, req *UpdateIncomeRequest) (*finance.Transaction, error) {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, err
	}

	if req.EffectiveDate.IsZero() {
		req.EffectiveDate = req.TransactionDate
	}

	txn := &finance.Transaction{
		ID:              req.TransactionID,
		Amount:          req.Amount,
		Currency:        req.Currency,
		Description:     req.Description,
		TransactionDate: rCtx.Date(req.TransactionDate),
		EffectiveDate:   rCtx.Date(req.EffectiveDate),
		AccountID:       req.AccountID,
	}

	return c.financeService.UpdateIncome(ctx, rCtx, txn)
}

type ListTransactionEventsRequest struct {
	TransactionID finance.TransactionID
}

func (c *coordinator) ListTransactionEvents(ctx context.Context, req *ListTransactionEventsRequest) ([]*finance.TransactionEvent, error) {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, err
	}
	return c.financeService.ListTransactionEvents(ctx, rCtx, req.TransactionID)
}
