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

type ListRecurringExpensesRequest struct {
	Status        *string
	PageSize      int32
	NextPageToken string
}

type ListScheduledPaymentsRequest struct {
	Status        *string
	StartDate     *time.Time
	EndDate       *time.Time
	PageSize      int32
	NextPageToken string
}

type ConfirmScheduledPaymentRequest struct {
	PaymentID       finance.ScheduledPaymentID
	TransactionDate time.Time
	EffectiveDate   time.Time
	ActualAmount    int64
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

func (c *Coordinator) ListRecurringExpenses(ctx context.Context, req *ListRecurringExpensesRequest) ([]*finance.RecurringExpense, string, error) {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, "", err
	}

	var statusFilter *finance.RecurringExpenseStatus
	if req.Status != nil {
		st := finance.RecurringExpenseStatus(*req.Status)
		statusFilter = &st
	}

	filter := &finance.ListRecurringExpensesFilter{
		Status:        statusFilter,
		PageSize:      req.PageSize,
		NextPageToken: req.NextPageToken,
	}

	return c.financeService.ListRecurringExpenses(ctx, rCtx.SpaceID, filter)
}

func (c *Coordinator) ListScheduledPayments(ctx context.Context, req *ListScheduledPaymentsRequest) ([]*finance.ScheduledPayment, string, error) {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, "", err
	}

	var statusFilter *finance.ScheduledPaymentStatus
	if req.Status != nil {
		st := finance.ScheduledPaymentStatus(*req.Status)
		statusFilter = &st
	}

	filter := &finance.ListScheduledPaymentsFilter{
		Status:        statusFilter,
		StartDate:     req.StartDate,
		EndDate:       req.EndDate,
		PageSize:      req.PageSize,
		NextPageToken: req.NextPageToken,
	}

	return c.financeService.ListScheduledPayments(ctx, rCtx.SpaceID, filter)
}

func (c *Coordinator) ConfirmScheduledPayment(ctx context.Context, req *ConfirmScheduledPaymentRequest) (*finance.Transaction, error) {
	_, err := c.resolveContext(ctx)
	if err != nil {
		return nil, err
	}

	return c.financeService.ConfirmScheduledPayment(ctx, finance.ConfirmScheduledPaymentRequest{
		PaymentID:       req.PaymentID,
		TransactionDate: req.TransactionDate,
		EffectiveDate:   req.EffectiveDate,
		ActualAmount:    req.ActualAmount,
	})
}

func (c *Coordinator) GenerateScheduledPayments(ctx context.Context) error {
	return c.financeService.GenerateScheduledPayments(ctx)
}
