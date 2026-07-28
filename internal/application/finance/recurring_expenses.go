package financeapp

import (
	"context"
	"time"

	"github.com/masterkeysrd/saturn/internal/domain/finance"
)

type CreateRecurringExpenseRequest struct {
	BudgetID        finance.BudgetID
	Name            string
	Amount          int64
	Currency        finance.Currency
	Interval        string
	DueDate         time.Time
	IsVariable      bool
	GracePeriodDays int32
}

type UpdateRecurringExpenseRequest struct {
	ID              finance.RecurringExpenseID
	BudgetID        finance.BudgetID
	Name            string
	Amount          int64
	Currency        finance.Currency
	Interval        string
	DueDate         time.Time
	IsVariable      bool
	Status          string
	GracePeriodDays int32
}

type ConfirmScheduledPaymentRequest struct {
	PaymentID       finance.ScheduledPaymentID
	TransactionDate time.Time
	EffectiveDate   time.Time
	ActualAmount    int64
	Description     string
	AccountID       *finance.AccountID
	BudgetID        *finance.BudgetID
	Currency        *finance.Currency
}

func (c *Coordinator) CreateRecurringExpense(ctx context.Context, req *CreateRecurringExpenseRequest) (*finance.RecurringExpense, error) {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, err
	}

	expense := &finance.RecurringExpense{
		SpaceID:         rCtx.SpaceID,
		BudgetID:        req.BudgetID,
		Name:            req.Name,
		Amount:          req.Amount,
		Currency:        req.Currency,
		Interval:        req.Interval,
		NextDueDate:     req.DueDate,
		IsVariable:      req.IsVariable,
		GracePeriodDays: req.GracePeriodDays,
	}

	return c.financeService.CreateRecurringExpense(ctx, expense)
}

func (c *Coordinator) UpdateRecurringExpense(ctx context.Context, req *UpdateRecurringExpenseRequest) (*finance.RecurringExpense, error) {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, err
	}

	expense := &finance.RecurringExpense{
		ID:              req.ID,
		SpaceID:         rCtx.SpaceID,
		BudgetID:        req.BudgetID,
		Name:            req.Name,
		Amount:          req.Amount,
		Currency:        req.Currency,
		Interval:        req.Interval,
		NextDueDate:     req.DueDate,
		IsVariable:      req.IsVariable,
		Status:          finance.RecurringExpenseStatus(req.Status),
		GracePeriodDays: req.GracePeriodDays,
	}

	return c.financeService.UpdateRecurringExpense(ctx, expense)
}

func (c *Coordinator) DeleteRecurringExpense(ctx context.Context, id finance.RecurringExpenseID) error {
	_, err := c.resolveContext(ctx)
	if err != nil {
		return err
	}
	return c.financeService.DeleteRecurringExpense(ctx, id)
}

func (c *Coordinator) ConfirmScheduledPayment(ctx context.Context, req *ConfirmScheduledPaymentRequest) (*finance.Transaction, error) {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, err
	}

	return c.financeService.ConfirmScheduledPayment(ctx, finance.ConfirmScheduledPaymentRequest{
		SpaceID:         rCtx.SpaceID,
		PaymentID:       req.PaymentID,
		TransactionDate: req.TransactionDate,
		EffectiveDate:   req.EffectiveDate,
		ActualAmount:    req.ActualAmount,
		Description:     req.Description,
		AccountID:       req.AccountID,
		BudgetID:        req.BudgetID,
		Currency:        req.Currency,
	})
}

type MatchScheduledPaymentRequest struct {
	PaymentID     finance.ScheduledPaymentID
	TransactionID finance.TransactionID
}

func (c *Coordinator) MatchScheduledPayment(ctx context.Context, req *MatchScheduledPaymentRequest) (*finance.Transaction, error) {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, err
	}

	return c.financeService.MatchScheduledPayment(ctx, finance.MatchScheduledPaymentRequest{
		SpaceID:       rCtx.SpaceID,
		PaymentID:     req.PaymentID,
		TransactionID: req.TransactionID,
	})
}

func (c *Coordinator) SkipScheduledPayment(ctx context.Context, id finance.ScheduledPaymentID) (*finance.ScheduledPayment, error) {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, err
	}

	return c.financeService.SkipScheduledPayment(ctx, rCtx.SpaceID, id)
}

func (c *Coordinator) GenerateScheduledPayments(ctx context.Context) error {
	return c.financeService.GenerateScheduledPayments(ctx)
}
