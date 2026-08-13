package finance

import (
	"context"
	"time"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/emptypb"
	"google.golang.org/protobuf/types/known/timestamppb"

	financev1 "github.com/masterkeysrd/saturn/apis/saturn/finance/v1"
	financeaggregator "github.com/masterkeysrd/saturn/internal/aggregator/finance"
	financeapp "github.com/masterkeysrd/saturn/internal/application/finance"
	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	"github.com/masterkeysrd/saturn/internal/platform/sorting"
)

func (h *Handler) CreateRecurringExpense(ctx context.Context, req *financev1.CreateRecurringExpenseRequest) (*financev1.RecurringExpense, error) {
	exp := req.GetRecurringExpense()
	if exp == nil {
		return nil, status.Error(codes.InvalidArgument, "recurring_expense is required")
	}

	var nextDueDate time.Time
	if exp.GetExecutionState() != nil && exp.GetExecutionState().GetNextDueDate() != nil {
		nextDueDate = exp.GetExecutionState().GetNextDueDate().AsTime()
	}

	currency, err := finance.ParseCurrency(exp.GetCurrency())
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}

	interval, err := mapProtoIntervalToDomain(exp.GetInterval())
	if err != nil {
		return nil, err
	}

	appReq := &financeapp.CreateRecurringExpenseRequest{
		BudgetID:        finance.BudgetID(exp.GetBudgetId()),
		Name:            exp.GetName(),
		Amount:          exp.GetAmount(),
		Currency:        currency,
		Interval:        interval,
		DueDate:         nextDueDate,
		IsVariable:      exp.GetIsVariable(),
		GracePeriodDays: exp.GetGracePeriodDays(),
	}

	expense, err := h.Coordinator.CreateRecurringExpense(ctx, appReq)
	if err != nil {
		return nil, h.mapError(err)
	}

	return toProtoRecurringExpense(expense), nil
}

func (h *Handler) UpdateRecurringExpense(ctx context.Context, req *financev1.UpdateRecurringExpenseRequest) (*financev1.RecurringExpense, error) {
	exp := req.GetRecurringExpense()
	if exp == nil {
		return nil, status.Error(codes.InvalidArgument, "recurring_expense is required")
	}

	var nextDueDate time.Time
	if exp.GetExecutionState() != nil && exp.GetExecutionState().GetNextDueDate() != nil {
		nextDueDate = exp.GetExecutionState().GetNextDueDate().AsTime()
	}

	currency, err := finance.ParseCurrency(exp.GetCurrency())
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}

	id, err := finance.ParseRecurringExpenseID(exp.GetId())
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}

	interval, err := mapProtoIntervalToDomain(exp.GetInterval())
	if err != nil {
		return nil, err
	}

	statusVal, err := mapProtoStatusToDomain(exp.GetStatus())
	if err != nil {
		return nil, err
	}

	appReq := &financeapp.UpdateRecurringExpenseRequest{
		ID:              id,
		BudgetID:        finance.BudgetID(exp.GetBudgetId()),
		Name:            exp.GetName(),
		Amount:          exp.GetAmount(),
		Currency:        currency,
		Interval:        interval,
		DueDate:         nextDueDate,
		IsVariable:      exp.GetIsVariable(),
		Status:          string(statusVal),
		GracePeriodDays: exp.GetGracePeriodDays(),
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
	spaceIDStr, ok := auth.SpaceIDFromContext(ctx)
	if !ok {
		return nil, status.Error(codes.Unauthenticated, "missing space-id context")
	}
	spaceID := finance.SpaceID(spaceIDStr)

	var statusFilter *string
	if req.GetStatus() != financev1.RecurringExpense_STATUS_UNSPECIFIED {
		domainStatus, err := mapProtoStatusToDomain(req.GetStatus())
		if err != nil {
			return nil, err
		}
		st := string(domainStatus)
		statusFilter = &st
	}

	filter := finance.ListRecurringExpensesFilter{
		Status:        (*finance.RecurringExpenseStatus)(statusFilter),
		PageSize:      req.GetPageSize(),
		NextPageToken: req.GetPageToken(),
		SearchQuery:   req.SearchQuery,
		Sort:          sorting.Parse(req.GetSort()),
	}

	viewType := financeaggregator.ViewBasic
	if req.GetView() == financev1.RecurringExpense_FULL {
		viewType = financeaggregator.ViewFull
	}

	page, err := h.Aggregator.ListRecurringExpenses(ctx, spaceID, viewType, filter)
	if err != nil {
		return nil, h.mapError(err)
	}

	protoExpenses := make([]*financev1.RecurringExpense, 0, len(page.Items))
	for _, e := range page.Items {
		protoExpenses = append(protoExpenses, toProtoAggregatedRecurringExpense(e))
	}

	return &financev1.ListRecurringExpensesResponse{
		RecurringExpenses: protoExpenses,
		NextPageToken:     page.NextPageToken,
	}, nil
}

func (h *Handler) ListScheduledPayments(ctx context.Context, req *financev1.ListScheduledPaymentsRequest) (*financev1.ListScheduledPaymentsResponse, error) {
	spaceIDStr, ok := auth.SpaceIDFromContext(ctx)
	if !ok {
		return nil, status.Error(codes.Unauthenticated, "missing space-id context")
	}
	spaceID := finance.SpaceID(spaceIDStr)

	var statusFilter *string
	if req.GetStatus() != financev1.ScheduledPayment_STATUS_UNSPECIFIED {
		domainStatus, err := mapProtoPaymentStatusToDomain(req.GetStatus())
		if err != nil {
			return nil, err
		}
		st := string(domainStatus)
		statusFilter = &st
	} else {
		st := string(finance.ScheduledPaymentPending)
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

	filter := finance.ListScheduledPaymentsFilter{
		Status:        (*finance.ScheduledPaymentStatus)(statusFilter),
		StartDate:     startDate,
		EndDate:       endDate,
		PageSize:      req.GetPageSize(),
		NextPageToken: req.GetPageToken(),
		SearchQuery:   req.SearchQuery,
		Sort:          sorting.Parse(req.GetSort()),
	}

	viewType := financeaggregator.ViewBasic
	if req.GetView() == financev1.ScheduledPayment_FULL {
		viewType = financeaggregator.ViewFull
	}

	page, err := h.Aggregator.ListScheduledPayments(ctx, spaceID, viewType, filter)
	if err != nil {
		return nil, h.mapError(err)
	}

	protoPayments := make([]*financev1.ScheduledPayment, 0, len(page.Items))
	for _, p := range page.Items {
		protoPayments = append(protoPayments, toProtoAggregatedScheduledPayment(p))
	}

	return &financev1.ListScheduledPaymentsResponse{
		ScheduledPayments: protoPayments,
		NextPageToken:     page.NextPageToken,
	}, nil
}

func (h *Handler) GetScheduledPayment(ctx context.Context, req *financev1.GetScheduledPaymentRequest) (*financev1.ScheduledPayment, error) {
	spID, err := finance.ParseScheduledPaymentID(req.GetId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid scheduled payment id: %v", err)
	}

	sp, err := h.Coordinator.GetScheduledPayment(ctx, spID)
	if err != nil {
		return nil, h.mapError(err)
	}

	return toProtoScheduledPayment(sp), nil
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

	var accountID *finance.AccountID
	if req.AccountId != nil && *req.AccountId != "" {
		parsed, err := finance.ParseAccountID(*req.AccountId)
		if err != nil {
			return nil, status.Error(codes.InvalidArgument, err.Error())
		}
		accountID = &parsed
	}

	var budgetID *finance.BudgetID
	if req.BudgetId != nil && *req.BudgetId != "" {
		parsed, err := finance.ParseBudgetID(*req.BudgetId)
		if err != nil {
			return nil, status.Error(codes.InvalidArgument, err.Error())
		}
		budgetID = &parsed
	}

	var currency *finance.Currency
	if req.Currency != nil && *req.Currency != "" {
		parsed := finance.Currency(*req.Currency)
		currency = &parsed
	}

	appReq := &financeapp.ConfirmScheduledPaymentRequest{
		PaymentID:       paymentID,
		TransactionDate: transactionDate,
		EffectiveDate:   effectiveDate,
		ActualAmount:    req.GetActualAmount(),
		Description:     req.GetDescription(),
		AccountID:       accountID,
		BudgetID:        budgetID,
		Currency:        currency,
	}

	txn, err := h.Coordinator.ConfirmScheduledPayment(ctx, appReq)
	if err != nil {
		return nil, h.mapError(err)
	}

	return toProtoTransaction(txn), nil
}

func (h *Handler) MatchScheduledPayment(ctx context.Context, req *financev1.MatchScheduledPaymentRequest) (*financev1.Transaction, error) {
	paymentID, err := finance.ParseScheduledPaymentID(req.GetPaymentId())
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}

	txnID, err := finance.ParseTransactionID(req.GetTransactionId())
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}

	appReq := &financeapp.MatchScheduledPaymentRequest{
		PaymentID:     paymentID,
		TransactionID: txnID,
	}

	txn, err := h.Coordinator.MatchScheduledPayment(ctx, appReq)
	if err != nil {
		return nil, h.mapError(err)
	}

	return toProtoTransaction(txn), nil
}

func (h *Handler) SkipScheduledPayment(ctx context.Context, req *financev1.SkipScheduledPaymentRequest) (*financev1.ScheduledPayment, error) {
	id, err := finance.ParseScheduledPaymentID(req.GetId())
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}

	sp, err := h.Coordinator.SkipScheduledPayment(ctx, id)
	if err != nil {
		return nil, h.mapError(err)
	}

	return toProtoScheduledPayment(sp), nil
}

// --- Mappers ---

func mapProtoIntervalToDomain(interval financev1.RecurringExpense_Interval) (string, error) {
	switch interval {
	case financev1.RecurringExpense_WEEKLY:
		return "weekly", nil
	case financev1.RecurringExpense_MONTHLY:
		return "monthly", nil
	case financev1.RecurringExpense_YEARLY:
		return "yearly", nil
	default:
		return "", status.Error(codes.InvalidArgument, "invalid recurring expense interval")
	}
}

func mapDomainIntervalToProto(interval string) financev1.RecurringExpense_Interval {
	switch interval {
	case "weekly":
		return financev1.RecurringExpense_WEEKLY
	case "monthly":
		return financev1.RecurringExpense_MONTHLY
	case "yearly":
		return financev1.RecurringExpense_YEARLY
	default:
		return financev1.RecurringExpense_INTERVAL_UNSPECIFIED
	}
}

func mapProtoStatusToDomain(st financev1.RecurringExpense_Status) (finance.RecurringExpenseStatus, error) {
	switch st {
	case financev1.RecurringExpense_ACTIVE:
		return finance.RecurringExpenseActive, nil
	case financev1.RecurringExpense_PAUSED:
		return finance.RecurringExpensePaused, nil
	case financev1.RecurringExpense_ENDED:
		return finance.RecurringExpenseEnded, nil
	default:
		return "", status.Error(codes.InvalidArgument, "invalid recurring expense status")
	}
}

func mapDomainStatusToProto(st finance.RecurringExpenseStatus) financev1.RecurringExpense_Status {
	switch st {
	case finance.RecurringExpenseActive:
		return financev1.RecurringExpense_ACTIVE
	case finance.RecurringExpensePaused:
		return financev1.RecurringExpense_PAUSED
	case finance.RecurringExpenseEnded:
		return financev1.RecurringExpense_ENDED
	default:
		return financev1.RecurringExpense_STATUS_UNSPECIFIED
	}
}
func mapDomainSourceTypeToProto(st string) financev1.ScheduledPayment_SourceType {
	switch st {
	case "recurrent_expense":
		return financev1.ScheduledPayment_RECURRENT_EXPENSE
	case "loan":
		return financev1.ScheduledPayment_LOAN
	case "tax":
		return financev1.ScheduledPayment_TAX
	default:
		return financev1.ScheduledPayment_SOURCE_TYPE_UNSPECIFIED
	}
}

func mapProtoPaymentStatusToDomain(st financev1.ScheduledPayment_Status) (finance.ScheduledPaymentStatus, error) {
	switch st {
	case financev1.ScheduledPayment_PENDING:
		return finance.ScheduledPaymentPending, nil
	case financev1.ScheduledPayment_PROCESSING:
		return finance.ScheduledPaymentProcessing, nil
	case financev1.ScheduledPayment_SKIPPED:
		return finance.ScheduledPaymentSkipped, nil
	case financev1.ScheduledPayment_PAID:
		return finance.ScheduledPaymentPaid, nil
	default:
		return "", status.Error(codes.InvalidArgument, "invalid scheduled payment status")
	}
}

func mapDomainPaymentStatusToProto(st finance.ScheduledPaymentStatus) financev1.ScheduledPayment_Status {
	switch st {
	case finance.ScheduledPaymentPending:
		return financev1.ScheduledPayment_PENDING
	case finance.ScheduledPaymentProcessing:
		return financev1.ScheduledPayment_PROCESSING
	case finance.ScheduledPaymentSkipped:
		return financev1.ScheduledPayment_SKIPPED
	case finance.ScheduledPaymentPaid:
		return financev1.ScheduledPayment_PAID
	default:
		return financev1.ScheduledPayment_STATUS_UNSPECIFIED
	}
}

func toProtoRecurringExpense(e *finance.RecurringExpense) *financev1.RecurringExpense {
	if e == nil {
		return nil
	}
	return &financev1.RecurringExpense{
		Id:       string(e.ID),
		SpaceId:  string(e.SpaceID),
		BudgetId: string(e.BudgetID),
		Name:     e.Name,
		Amount:   e.Amount,
		Currency: string(e.Currency),
		Interval: mapDomainIntervalToProto(string(e.Interval)),
		ExecutionState: &financev1.RecurringExpense_ExecutionState{
			NextDueDate: timestamppb.New(e.NextDueDate),
		},
		IsVariable:      e.IsVariable,
		Status:          mapDomainStatusToProto(e.Status),
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
		SourceType: mapDomainSourceTypeToProto(p.SourceType),
		SourceId:   p.SourceID,
		Amount:     p.Amount,
		Currency:   string(p.Currency),
		DueDate:    timestamppb.New(p.DueDate),
		Status:     mapDomainPaymentStatusToProto(p.Status),
		Metadata: &financev1.ScheduledPayment_Metadata{
			Name:        p.Metadata.Name,
			DueDate:     p.Metadata.DueDate,
			Description: p.Metadata.Description,
			VendorName:  p.Metadata.VendorName,
			InvoiceId:   p.Metadata.InvoiceID,
			Notes:       p.Metadata.Notes,
		},
		CreateTime: timestamppb.New(p.CreateTime),
		UpdateTime: timestamppb.New(p.UpdateTime),
	}
}

func toProtoAggregatedRecurringExpense(at *financeaggregator.AggregatedRecurringExpense) *financev1.RecurringExpense {
	if at == nil {
		return nil
	}
	protoVal := toProtoRecurringExpense(at.RecurringExpense)
	if at.Budget != nil {
		protoVal.Budget = &financev1.RecurringExpense_BudgetInfo{
			Id:    string(at.Budget.ID),
			Name:  at.Budget.Name,
			Color: at.Budget.Color,
			Icon:  at.Budget.Icon,
		}
	}
	return protoVal
}

func toProtoAggregatedScheduledPayment(ap *financeaggregator.AggregatedScheduledPayment) *financev1.ScheduledPayment {
	if ap == nil {
		return nil
	}
	protoVal := toProtoScheduledPayment(ap.ScheduledPayment)
	if ap.Budget != nil {
		protoVal.Budget = &financev1.ScheduledPayment_BudgetInfo{
			Id:    string(ap.Budget.ID),
			Name:  ap.Budget.Name,
			Color: ap.Budget.Color,
			Icon:  ap.Budget.Icon,
		}
	}
	if ap.RecurringExpense != nil {
		protoVal.RecurringExpense = &financev1.ScheduledPayment_RecurringExpenseInfo{
			Id:       string(ap.RecurringExpense.ID),
			Name:     ap.RecurringExpense.Name,
			Interval: mapDomainIntervalToProto(string(ap.RecurringExpense.Interval)),
		}
	}
	return protoVal
}
