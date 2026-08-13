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

func (c *Coordinator) CreateRecurringTransaction(ctx context.Context, req *CreateRecurringTransactionRequest) (*finance.RecurringTransaction, error) {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, err
	}

	dueDate := req.DueDate
	if dueDate.IsZero() {
		dueDate = time.Now().UTC()
	}

	expense := &finance.RecurringTransaction{
		SpaceID:         rCtx.SpaceID,
		BudgetID:        req.BudgetID,
		Name:            req.Name,
		Amount:          req.Amount,
		Currency:        req.Currency,
		Interval:        finance.RecurrenceInterval(req.Interval),
		NextDueDate:     dueDate,
		IsVariable:      req.IsVariable,
		GracePeriodDays: req.GracePeriodDays,
		Type:            finance.TransactionType(req.Type),
		AccountID:       req.AccountID,
	}

	res, err := c.financeService.CreateRecurringTransaction(ctx, expense)
	if err != nil {
		return nil, err
	}

	_ = c.financeService.GenerateScheduledTransactions(ctx)
	return res, nil
}

func (c *Coordinator) UpdateRecurringTransaction(ctx context.Context, req *UpdateRecurringTransactionRequest) (*finance.RecurringTransaction, error) {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, err
	}

	expense := &finance.RecurringTransaction{
		ID:              req.ID,
		SpaceID:         rCtx.SpaceID,
		BudgetID:        req.BudgetID,
		Name:            req.Name,
		Amount:          req.Amount,
		Currency:        req.Currency,
		Interval:        finance.RecurrenceInterval(req.Interval),
		NextDueDate:     req.DueDate,
		IsVariable:      req.IsVariable,
		Status:          finance.RecurringTransactionStatus(req.Status),
		GracePeriodDays: req.GracePeriodDays,
		Type:            finance.TransactionType(req.Type),
		AccountID:       req.AccountID,
		Version:         req.Version,
	}

	return c.financeService.UpdateRecurringTransaction(ctx, expense, req.UpdateMask)
}

func (c *Coordinator) DeleteRecurringTransaction(ctx context.Context, id finance.RecurringTransactionID, opts finance.DeleteOptions) error {
	_, err := c.resolveContext(ctx)
	if err != nil {
		return err
	}
	return c.financeService.DeleteRecurringTransaction(ctx, id, opts)
}

func (c *Coordinator) ConfirmScheduledTransaction(ctx context.Context, req *ConfirmScheduledTransactionRequest) (*finance.Transaction, error) {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, err
	}

	return c.financeService.ConfirmScheduledTransaction(ctx, finance.ConfirmScheduledTransactionRequest{
		SpaceID:         rCtx.SpaceID,
		TransactionID:   req.TransactionID,
		TransactionDate: req.TransactionDate,
		EffectiveDate:   req.EffectiveDate,
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

func (c *Coordinator) MatchScheduledTransaction(ctx context.Context, req *MatchScheduledTransactionRequest) (*finance.Transaction, error) {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, err
	}

	return c.financeService.MatchScheduledTransaction(ctx, finance.MatchScheduledTransactionRequest{
		SpaceID:       rCtx.SpaceID,
		TransactionID: req.TransactionID,
		MatchedID:     req.MatchedID,
	})
}

func (c *Coordinator) SkipScheduledTransaction(ctx context.Context, id finance.ScheduledTransactionID) (*finance.ScheduledTransaction, error) {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, err
	}

	return c.financeService.SkipScheduledTransaction(ctx, rCtx.SpaceID, id)
}

func (c *Coordinator) GetScheduledTransaction(ctx context.Context, id finance.ScheduledTransactionID) (*finance.ScheduledTransaction, error) {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, err
	}

	return c.financeService.GetScheduledTransaction(ctx, rCtx.SpaceID, id)
}

func (c *Coordinator) GenerateScheduledTransactions(ctx context.Context) error {
	return c.financeService.GenerateScheduledTransactions(ctx)
}
