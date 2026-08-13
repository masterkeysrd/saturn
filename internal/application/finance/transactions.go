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

func (c *Coordinator) CreateExpense(ctx context.Context, req *CreateExpenseRequest) (*finance.Transaction, error) {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, err
	}

	date := req.TransactionDate
	if date.IsZero() {
		date = time.Now().UTC()
	}

	effectiveDate := req.EffectiveDate
	if effectiveDate.IsZero() {
		effectiveDate = date
	}

	txn := &finance.Transaction{
		SpaceID:         rCtx.SpaceID,
		BudgetID:        &req.BudgetID,
		Amount:          req.Amount,
		Currency:        req.Currency,
		Description:     req.Description,
		TransactionDate: date.UTC(),
		EffectiveDate:   effectiveDate.UTC(),
		AccountID:       req.AccountID,
	}

	return c.financeService.CreateExpense(ctx, txn)
}

type CreateIncomeRequest struct {
	Amount          int64
	Currency        finance.Currency
	Description     string
	TransactionDate time.Time
	EffectiveDate   time.Time
	AccountID       *finance.AccountID
}

func (c *Coordinator) CreateIncome(ctx context.Context, req *CreateIncomeRequest) (*finance.Transaction, error) {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, err
	}

	date := req.TransactionDate
	if date.IsZero() {
		date = time.Now().UTC()
	}

	effectiveDate := req.EffectiveDate
	if effectiveDate.IsZero() {
		effectiveDate = date
	}

	txn := &finance.Transaction{
		SpaceID:         rCtx.SpaceID,
		Amount:          req.Amount,
		Currency:        req.Currency,
		Description:     req.Description,
		TransactionDate: date.UTC(),
		EffectiveDate:   effectiveDate.UTC(),
		AccountID:       req.AccountID,
	}

	return c.financeService.CreateIncome(ctx, txn)
}

func (c *Coordinator) DeleteTransaction(ctx context.Context, id finance.TransactionID) error {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return err
	}
	return c.financeService.DeleteTransaction(ctx, rCtx.SpaceID, id)
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

func (c *Coordinator) UpdateExpense(ctx context.Context, req *UpdateExpenseRequest) (*finance.Transaction, error) {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, err
	}

	date := req.TransactionDate
	if date.IsZero() {
		date = time.Now().UTC()
	}

	effectiveDate := req.EffectiveDate
	if effectiveDate.IsZero() {
		effectiveDate = date
	}

	txn := &finance.Transaction{
		ID:              req.TransactionID,
		SpaceID:         rCtx.SpaceID,
		BudgetID:        &req.BudgetID,
		Amount:          req.Amount,
		Currency:        req.Currency,
		Description:     req.Description,
		TransactionDate: date.UTC(),
		EffectiveDate:   effectiveDate.UTC(),
		AccountID:       req.AccountID,
	}

	return c.financeService.UpdateExpense(ctx, txn)
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

func (c *Coordinator) UpdateIncome(ctx context.Context, req *UpdateIncomeRequest) (*finance.Transaction, error) {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, err
	}

	date := req.TransactionDate
	if date.IsZero() {
		date = time.Now().UTC()
	}

	effectiveDate := req.EffectiveDate
	if effectiveDate.IsZero() {
		effectiveDate = date
	}

	txn := &finance.Transaction{
		ID:              req.TransactionID,
		SpaceID:         rCtx.SpaceID,
		Amount:          req.Amount,
		Currency:        req.Currency,
		Description:     req.Description,
		TransactionDate: date.UTC(),
		EffectiveDate:   effectiveDate.UTC(),
		AccountID:       req.AccountID,
	}

	return c.financeService.UpdateIncome(ctx, txn)
}

type ListTransactionEventsRequest struct {
	TransactionID finance.TransactionID
}

func (c *Coordinator) ListTransactionEvents(ctx context.Context, req *ListTransactionEventsRequest) ([]*finance.TransactionEvent, error) {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, err
	}
	return c.financeService.ListTransactionEvents(ctx, rCtx.SpaceID, req.TransactionID)
}
