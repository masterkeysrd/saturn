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
}

type ListTransactionsRequest struct {
	BudgetID      *finance.BudgetID
	Type          *finance.TransactionType
	PageSize      int32
	NextPageToken string
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
	}

	return c.financeService.CreateExpense(ctx, txn)
}

func (c *Coordinator) DeleteTransaction(ctx context.Context, id finance.TransactionID) error {
	_, err := c.resolveContext(ctx)
	if err != nil {
		return err
	}
	return c.financeService.DeleteTransaction(ctx, id)
}

func (c *Coordinator) ListTransactions(ctx context.Context, req *ListTransactionsRequest) ([]*finance.Transaction, string, error) {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, "", err
	}

	filter := &finance.ListTransactionsFilter{
		BudgetID:      req.BudgetID,
		Type:          req.Type,
		PageSize:      req.PageSize,
		NextPageToken: req.NextPageToken,
	}

	return c.financeService.ListTransactions(ctx, rCtx.SpaceID, filter)
}

type UpdateExpenseRequest struct {
	TransactionID   finance.TransactionID
	BudgetID        finance.BudgetID
	Amount          int64
	Currency        finance.Currency
	Description     string
	TransactionDate time.Time
	EffectiveDate   time.Time
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
	}

	return c.financeService.UpdateExpense(ctx, txn)
}
