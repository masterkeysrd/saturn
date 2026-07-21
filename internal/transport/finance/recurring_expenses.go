package finance

import (
	"context"
	"time"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/emptypb"
	"google.golang.org/protobuf/types/known/timestamppb"

	financev1 "github.com/masterkeysrd/saturn/apis/saturn/finance/v1"
	financeapp "github.com/masterkeysrd/saturn/internal/application/finance"
	"github.com/masterkeysrd/saturn/internal/domain/finance"
)

func (h *Handler) CreateRecurringExpense(ctx context.Context, req *financev1.CreateRecurringExpenseRequest) (*financev1.RecurringExpense, error) {
	var nextDueDate time.Time
	if req.GetNextDueDate() != nil {
		nextDueDate = req.GetNextDueDate().AsTime()
	}

	currency, err := finance.ParseCurrency(req.GetCurrency())
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}

	appReq := &financeapp.CreateRecurringExpenseRequest{
		BudgetID:        finance.BudgetID(req.GetBudgetId()),
		Name:            req.GetName(),
		Amount:          req.GetAmount(),
		Currency:        currency,
		Interval:        req.GetInterval(),
		DueDate:         nextDueDate,
		IsVariable:      req.GetIsVariable(),
		GracePeriodDays: req.GetGracePeriodDays(),
	}

	expense, err := h.Coordinator.CreateRecurringExpense(ctx, appReq)
	if err != nil {
		return nil, h.mapError(err)
	}

	return toProtoRecurringExpense(expense), nil
}

func (h *Handler) UpdateRecurringExpense(ctx context.Context, req *financev1.UpdateRecurringExpenseRequest) (*financev1.RecurringExpense, error) {
	var nextDueDate time.Time
	if req.GetNextDueDate() != nil {
		nextDueDate = req.GetNextDueDate().AsTime()
	}

	currency, err := finance.ParseCurrency(req.GetCurrency())
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}

	id, err := finance.ParseRecurringExpenseID(req.GetId())
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}

	appReq := &financeapp.UpdateRecurringExpenseRequest{
		ID:              id,
		BudgetID:        finance.BudgetID(req.GetBudgetId()),
		Name:            req.GetName(),
		Amount:          req.GetAmount(),
		Currency:        currency,
		Interval:        req.GetInterval(),
		DueDate:         nextDueDate,
		IsVariable:      req.GetIsVariable(),
		Status:          req.GetStatus(),
		GracePeriodDays: req.GetGracePeriodDays(),
	}

	expense, err := h.Coordinator.UpdateRecurringExpense(ctx, appReq)
	if err != nil {
		return nil, h.mapError(err)
	}

	return toProtoRecurringExpense(expense), nil
}

func (h *Handler) DeleteRecurringExpense(ctx context.Context, req *financev1.DeleteRecurringExpenseRequest) (*emptypb.Empty, error) {
	id, err := finance.ParseRecurringExpenseID(req.GetId())
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}

	if err := h.Coordinator.DeleteRecurringExpense(ctx, id); err != nil {
		return nil, h.mapError(err)
	}

	return &emptypb.Empty{}, nil
}

func (h *Handler) ListRecurringExpenses(ctx context.Context, req *financev1.ListRecurringExpensesRequest) (*financev1.ListRecurringExpensesResponse, error) {
	var statusFilter *string
	if req.GetStatus() != "" {
		st := req.GetStatus()
		statusFilter = &st
	}

	appReq := &financeapp.ListRecurringExpensesRequest{
		Status:        statusFilter,
		PageSize:      req.GetPageSize(),
		NextPageToken: req.GetPageToken(),
	}

	expenses, nextToken, err := h.Coordinator.ListRecurringExpenses(ctx, appReq)
	if err != nil {
		return nil, h.mapError(err)
	}

	protoExpenses := make([]*financev1.RecurringExpense, 0, len(expenses))
	for _, e := range expenses {
		protoExpenses = append(protoExpenses, toProtoRecurringExpense(e))
	}

	return &financev1.ListRecurringExpensesResponse{
		RecurringExpenses: protoExpenses,
		NextPageToken:     nextToken,
	}, nil
}

func (h *Handler) ListScheduledPayments(ctx context.Context, req *financev1.ListScheduledPaymentsRequest) (*financev1.ListScheduledPaymentsResponse, error) {
	var statusFilter *string
	if req.GetStatus() != "" {
		st := req.GetStatus()
		statusFilter = &st
	}

	var startDate, endDate *time.Time
	if req.GetStartDate() != nil {
		st := req.GetStartDate().AsTime()
		startDate = &st
	}
	if req.GetEndDate() != nil {
		et := req.GetEndDate().AsTime()
		endDate = &et
	}

	appReq := &financeapp.ListScheduledPaymentsRequest{
		Status:        statusFilter,
		StartDate:     startDate,
		EndDate:       endDate,
		PageSize:      req.GetPageSize(),
		NextPageToken: req.GetPageToken(),
	}

	payments, nextToken, err := h.Coordinator.ListScheduledPayments(ctx, appReq)
	if err != nil {
		return nil, h.mapError(err)
	}

	protoPayments := make([]*financev1.ScheduledPayment, 0, len(payments))
	for _, p := range payments {
		protoPayments = append(protoPayments, toProtoScheduledPayment(p))
	}

	return &financev1.ListScheduledPaymentsResponse{
		ScheduledPayments: protoPayments,
		NextPageToken:     nextToken,
	}, nil
}

func (h *Handler) ConfirmScheduledPayment(ctx context.Context, req *financev1.ConfirmScheduledPaymentRequest) (*financev1.Transaction, error) {
	paymentID, err := finance.ParseScheduledPaymentID(req.GetPaymentId())
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}

	var transactionDate time.Time
	if req.GetTransactionDate() != nil {
		transactionDate = req.GetTransactionDate().AsTime()
	}

	var effectiveDate time.Time
	if req.GetEffectiveDate() != nil {
		effectiveDate = req.GetEffectiveDate().AsTime()
	}

	appReq := &financeapp.ConfirmScheduledPaymentRequest{
		PaymentID:       paymentID,
		TransactionDate: transactionDate,
		EffectiveDate:   effectiveDate,
		ActualAmount:    req.GetActualAmount(),
	}

	txn, err := h.Coordinator.ConfirmScheduledPayment(ctx, appReq)
	if err != nil {
		return nil, h.mapError(err)
	}

	return toProtoTransaction(txn), nil
}

// --- Mappers ---

func toProtoRecurringExpense(e *finance.RecurringExpense) *financev1.RecurringExpense {
	if e == nil {
		return nil
	}
	return &financev1.RecurringExpense{
		Id:              string(e.ID),
		SpaceId:         string(e.SpaceID),
		BudgetId:        string(e.BudgetID),
		Name:            e.Name,
		Amount:          e.Amount,
		Currency:        string(e.Currency),
		Interval:        e.Interval,
		NextDueDate:     timestamppb.New(e.NextDueDate),
		IsVariable:      e.IsVariable,
		Status:          string(e.Status),
		GracePeriodDays: e.GracePeriodDays,
		CreateTime:      timestamppb.New(e.CreateTime),
		UpdateTime:      timestamppb.New(e.UpdateTime),
	}
}

func toProtoScheduledPayment(p *finance.ScheduledPayment) *financev1.ScheduledPayment {
	if p == nil {
		return nil
	}
	return &financev1.ScheduledPayment{
		Id:         string(p.ID),
		SpaceId:    string(p.SpaceID),
		BudgetId:   string(p.BudgetID),
		SourceType: p.SourceType,
		SourceId:   p.SourceID,
		Amount:     p.Amount,
		Currency:   string(p.Currency),
		DueDate:    timestamppb.New(p.DueDate),
		Status:     string(p.Status),
		Metadata:   p.Metadata,
		CreateTime: timestamppb.New(p.CreateTime),
		UpdateTime: timestamppb.New(p.UpdateTime),
	}
}
