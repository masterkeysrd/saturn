package financeapp

import (
	"context"
	"time"

	"github.com/masterkeysrd/saturn/internal/domain/finance"
)

type CreateRecurringTransactionRequest struct {
	BudgetID        *finance.BudgetID
	Name            string
	Amount          int64
	Currency        finance.Currency
	Interval        string
	DueDate         time.Time
	IsVariable      bool
	GracePeriodDays int32
	Type            string
	AccountID       *finance.AccountID
}

type UpdateRecurringTransactionRequest struct {
	ID              finance.RecurringTransactionID
	BudgetID        *finance.BudgetID
	Name            string
	Amount          int64
	Currency        finance.Currency
	Interval        string
	DueDate         time.Time
	IsVariable      bool
	Status          string
	GracePeriodDays int32
	Type            string
	AccountID       *finance.AccountID
	Version         int64
	UpdateMask      []string
}

type ConfirmScheduledTransactionRequest struct {
	TransactionID   finance.ScheduledTransactionID
	TransactionDate time.Time
	EffectiveDate   time.Time
	ActualAmount    int64
	Description     string
	AccountID       *finance.AccountID
	BudgetID        *finance.BudgetID
	Currency        *finance.Currency
}

func (c *coordinator) CreateRecurringTransaction(ctx context.Context, req *CreateRecurringTransactionRequest) (*finance.RecurringTransaction, error) {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, err
	}

	expense := &finance.RecurringTransaction{
		BudgetID:        req.BudgetID,
		Name:            req.Name,
		Amount:          req.Amount,
		Currency:        req.Currency,
		Interval:        finance.RecurrenceInterval(req.Interval),
		NextDueDate:     rCtx.Date(req.DueDate),
		IsVariable:      req.IsVariable,
		GracePeriodDays: req.GracePeriodDays,
		Type:            finance.TransactionType(req.Type),
		AccountID:       req.AccountID,
	}

	res, err := c.financeService.CreateRecurringTransaction(ctx, rCtx, expense)
	if err != nil {
		return nil, err
	}

	_ = c.financeService.GenerateScheduledTransactions(ctx)
	return res, nil
}

func (c *coordinator) UpdateRecurringTransaction(ctx context.Context, req *UpdateRecurringTransactionRequest) (*finance.RecurringTransaction, error) {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, err
	}

	nextDueDate := req.DueDate
	if !nextDueDate.IsZero() {
		nextDueDate = rCtx.Date(nextDueDate)
	}

	expense := &finance.RecurringTransaction{
		ID:              req.ID,
		BudgetID:        req.BudgetID,
		Name:            req.Name,
		Amount:          req.Amount,
		Currency:        req.Currency,
		Interval:        finance.RecurrenceInterval(req.Interval),
		NextDueDate:     nextDueDate,
		IsVariable:      req.IsVariable,
		Status:          finance.RecurringTransactionStatus(req.Status),
		GracePeriodDays: req.GracePeriodDays,
		Type:            finance.TransactionType(req.Type),
		AccountID:       req.AccountID,
		Version:         req.Version,
	}

	return c.financeService.UpdateRecurringTransaction(ctx, rCtx, expense, req.UpdateMask)
}

func (c *coordinator) DeleteRecurringTransaction(ctx context.Context, id finance.RecurringTransactionID, opts finance.DeleteOptions) error {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return err
	}
	return c.financeService.DeleteRecurringTransaction(ctx, rCtx, id, opts)
}

func (c *coordinator) ConfirmScheduledTransaction(ctx context.Context, req *ConfirmScheduledTransactionRequest) (*finance.Transaction, error) {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, err
	}

	if req.EffectiveDate.IsZero() {
		req.EffectiveDate = req.TransactionDate
	}

	return c.financeService.ConfirmScheduledTransaction(ctx, rCtx, finance.ConfirmScheduledTransactionRequest{
		TransactionID:   req.TransactionID,
		TransactionDate: rCtx.Date(req.TransactionDate),
		EffectiveDate:   rCtx.Date(req.EffectiveDate),
		ActualAmount:    req.ActualAmount,
		Description:     req.Description,
		AccountID:       req.AccountID,
		BudgetID:        req.BudgetID,
		Currency:        req.Currency,
	})
}

type MatchScheduledTransactionRequest struct {
	TransactionID finance.ScheduledTransactionID
	MatchedID     finance.TransactionID
}

func (c *coordinator) MatchScheduledTransaction(ctx context.Context, req *MatchScheduledTransactionRequest) (*finance.Transaction, error) {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, err
	}

	return c.financeService.MatchScheduledTransaction(ctx, rCtx, finance.MatchScheduledTransactionRequest{
		TransactionID: req.TransactionID,
		MatchedID:     req.MatchedID,
	})
}

func (c *coordinator) SkipScheduledTransaction(ctx context.Context, id finance.ScheduledTransactionID) (*finance.ScheduledTransaction, error) {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, err
	}

	return c.financeService.SkipScheduledTransaction(ctx, rCtx, id)
}

func (c *coordinator) GetScheduledTransaction(ctx context.Context, id finance.ScheduledTransactionID) (*finance.ScheduledTransaction, error) {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, err
	}

	return c.financeService.GetScheduledTransaction(ctx, rCtx, id)
}

func (c *coordinator) GenerateScheduledTransactions(ctx context.Context) error {
	return c.financeService.GenerateScheduledTransactions(ctx)
}
