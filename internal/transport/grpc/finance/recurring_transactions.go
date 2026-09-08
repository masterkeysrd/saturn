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

func (h *Handler) CreateRecurringTransaction(ctx context.Context, req *financev1.CreateRecurringTransactionRequest) (*financev1.RecurringTransaction, error) {
	exp := req.GetRecurringTransaction()
	if exp == nil {
		return nil, status.Error(codes.InvalidArgument, "recurring_transaction is required")
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

	var budgetID *finance.BudgetID
	if exp.BudgetId != nil && *exp.BudgetId != "" {
		parsed := finance.BudgetID(*exp.BudgetId)
		budgetID = &parsed
	}

	var accountID *finance.AccountID
	if exp.AccountId != nil && *exp.AccountId != "" {
		parsed := finance.AccountID(*exp.AccountId)
		accountID = &parsed
	}

	appReq := &financeapp.CreateRecurringTransactionRequest{
		BudgetID:        budgetID,
		Name:            exp.GetName(),
		Amount:          exp.GetAmount(),
		Currency:        currency,
		Interval:        interval,
		DueDate:         nextDueDate,
		IsVariable:      exp.GetIsVariable(),
		GracePeriodDays: exp.GetGracePeriodDays(),
		Type:            exp.GetType().String(),
		AccountID:       accountID,
	}

	expense, err := h.Coordinator.CreateRecurringTransaction(ctx, appReq)
	if err != nil {
		return nil, h.mapError(err)
	}

	return toProtoRecurringTransaction(expense), nil
}

func (h *Handler) UpdateRecurringTransaction(ctx context.Context, req *financev1.UpdateRecurringTransactionRequest) (*financev1.RecurringTransaction, error) {
	exp := req.GetRecurringTransaction()
	if exp == nil {
		return nil, status.Error(codes.InvalidArgument, "recurring_transaction is required")
	}

	idStr := req.GetId()
	if idStr == "" {
		idStr = exp.GetId()
	}
	id, err := finance.ParseRecurringTransactionID(idStr)
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

	var nextDueDate time.Time
	if exp.GetExecutionState() != nil && exp.GetExecutionState().GetNextDueDate() != nil {
		nextDueDate = exp.GetExecutionState().GetNextDueDate().AsTime()
	}

	var mask []string
	if req.UpdateMask != nil {
		mask = req.UpdateMask.Paths
	}

	var budgetID *finance.BudgetID
	if exp.BudgetId != nil && *exp.BudgetId != "" {
		parsed := finance.BudgetID(*exp.BudgetId)
		budgetID = &parsed
	}

	var accountID *finance.AccountID
	if exp.AccountId != nil && *exp.AccountId != "" {
		parsed := finance.AccountID(*exp.AccountId)
		accountID = &parsed
	}

	appReq := &financeapp.UpdateRecurringTransactionRequest{
		ID:              id,
		BudgetID:        budgetID,
		Name:            exp.GetName(),
		Amount:          exp.GetAmount(),
		Currency:        finance.Currency(exp.GetCurrency()),
		Interval:        interval,
		DueDate:         nextDueDate,
		IsVariable:      exp.GetIsVariable(),
		Status:          string(statusVal),
		GracePeriodDays: exp.GetGracePeriodDays(),
		Type:            exp.GetType().String(),
		AccountID:       accountID,
		Version:         req.GetVersion(),
		UpdateMask:      mask,
	}

	expense, err := h.Coordinator.UpdateRecurringTransaction(ctx, appReq)
	if err != nil {
		return nil, h.mapError(err)
	}

	return toProtoRecurringTransaction(expense), nil
}

func (h *Handler) DeleteRecurringTransaction(ctx context.Context, req *financev1.DeleteRecurringTransactionRequest) (*emptypb.Empty, error) {
	id, err := finance.ParseRecurringTransactionID(req.GetId())
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}

	var opts finance.DeleteOptions
	if req.GetVersion() != 0 {
		opts.Version = req.GetVersion()
	}

	if err := h.Coordinator.DeleteRecurringTransaction(ctx, id, opts); err != nil {
		return nil, h.mapError(err)
	}

	return &emptypb.Empty{}, nil
}

func (h *Handler) ListRecurringTransactions(ctx context.Context, req *financev1.ListRecurringTransactionsRequest) (*financev1.ListRecurringTransactionsResponse, error) {
	spaceIDStr, ok := auth.SpaceIDFromContext(ctx)
	if !ok {
		return nil, status.Error(codes.Unauthenticated, "missing space-id context")
	}
	spaceID := finance.SpaceID(spaceIDStr)

	var statusFilter *finance.RecurringTransactionStatus
	if req.GetStatus() != financev1.RecurringTransaction_STATUS_UNSPECIFIED {
		domainStatus, err := mapProtoStatusToDomain(req.GetStatus())
		if err != nil {
			return nil, err
		}
		statusFilter = new(domainStatus)
	}

	filter := finance.ListRecurringTransactionsFilter{
		Status:        statusFilter,
		PageSize:      req.GetPageSize(),
		NextPageToken: req.GetPageToken(),
		SearchQuery:   req.SearchQuery,
		Sort:          sorting.Parse(req.GetSort()),
	}

	viewType := financeaggregator.ViewBasic
	if req.GetView() == financev1.RecurringTransaction_FULL {
		viewType = financeaggregator.ViewFull
	}

	page, err := h.Aggregator.ListRecurringTransactions(ctx, spaceID, viewType, filter)
	if err != nil {
		return nil, h.mapError(err)
	}

	protoExpenses := make([]*financev1.RecurringTransaction, 0, len(page.Items))
	for _, e := range page.Items {
		protoExpenses = append(protoExpenses, toProtoAggregatedRecurringTransaction(e))
	}

	return &financev1.ListRecurringTransactionsResponse{
		RecurringTransactions: protoExpenses,
		NextPageToken:         page.NextPageToken,
	}, nil
}

func (h *Handler) ListScheduledTransactions(ctx context.Context, req *financev1.ListScheduledTransactionsRequest) (*financev1.ListScheduledTransactionsResponse, error) {
	spaceIDStr, ok := auth.SpaceIDFromContext(ctx)
	if !ok {
		return nil, status.Error(codes.Unauthenticated, "missing space-id context")
	}
	spaceID := finance.SpaceID(spaceIDStr)

	var statusFilter *finance.ScheduledTransactionStatus
	if req.GetStatus() != financev1.ScheduledTransaction_STATUS_UNSPECIFIED {
		domainStatus, err := mapProtoPaymentStatusToDomain(req.GetStatus())
		if err != nil {
			return nil, err
		}
		statusFilter = new(domainStatus)
	} else {
		statusFilter = new(finance.ScheduledTransactionPending)
	}

	var startDate, endDate *time.Time
	if req.GetStartDate() != nil {
		startDate = new(req.GetStartDate().AsTime())
	}
	if req.GetEndDate() != nil {
		endDate = new(req.GetEndDate().AsTime())
	}

	filter := finance.ListScheduledTransactionsFilter{
		Status:        statusFilter,
		StartDate:     startDate,
		EndDate:       endDate,
		PageSize:      req.GetPageSize(),
		NextPageToken: req.GetPageToken(),
		SearchQuery:   req.SearchQuery,
		Sort:          sorting.Parse(req.GetSort()),
	}

	viewType := financeaggregator.ViewBasic
	if req.GetView() == financev1.ScheduledTransaction_FULL {
		viewType = financeaggregator.ViewFull
	}

	page, err := h.Aggregator.ListScheduledTransactions(ctx, spaceID, viewType, filter)
	if err != nil {
		return nil, h.mapError(err)
	}

	protoPayments := make([]*financev1.ScheduledTransaction, 0, len(page.Items))
	for _, p := range page.Items {
		protoPayments = append(protoPayments, toProtoAggregatedScheduledTransaction(p))
	}

	return &financev1.ListScheduledTransactionsResponse{
		ScheduledTransactions: protoPayments,
		NextPageToken:         page.NextPageToken,
	}, nil
}

func (h *Handler) GetScheduledTransaction(ctx context.Context, req *financev1.GetScheduledTransactionRequest) (*financev1.ScheduledTransaction, error) {
	spID, err := finance.ParseScheduledTransactionID(req.GetId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid scheduled transaction id: %v", err)
	}

	sp, err := h.Coordinator.GetScheduledTransaction(ctx, spID)
	if err != nil {
		return nil, h.mapError(err)
	}

	return toProtoScheduledTransaction(sp), nil
}

func (h *Handler) ConfirmScheduledTransaction(ctx context.Context, req *financev1.ConfirmScheduledTransactionRequest) (*financev1.Transaction, error) {
	paymentID, err := finance.ParseScheduledTransactionID(req.GetTransactionId())
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
		accountID = new(parsed)
	}

	var budgetID *finance.BudgetID
	if req.BudgetId != nil && *req.BudgetId != "" {
		parsed, err := finance.ParseBudgetID(*req.BudgetId)
		if err != nil {
			return nil, status.Error(codes.InvalidArgument, err.Error())
		}
		budgetID = new(parsed)
	}

	var currency *finance.Currency
	if req.Currency != nil && *req.Currency != "" {
		currency = new(finance.Currency(*req.Currency))
	}

	appReq := &financeapp.ConfirmScheduledTransactionRequest{
		TransactionID:   paymentID,
		TransactionDate: transactionDate,
		EffectiveDate:   effectiveDate,
		ActualAmount:    req.GetActualAmount(),
		Description:     req.GetDescription(),
		AccountID:       accountID,
		BudgetID:        budgetID,
		Currency:        currency,
	}

	txn, err := h.Coordinator.ConfirmScheduledTransaction(ctx, appReq)
	if err != nil {
		return nil, h.mapError(err)
	}

	return toProtoTransaction(txn), nil
}

func (h *Handler) MatchScheduledTransaction(ctx context.Context, req *financev1.MatchScheduledTransactionRequest) (*financev1.Transaction, error) {
	paymentID, err := finance.ParseScheduledTransactionID(req.GetTransactionId())
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}

	txnID, err := finance.ParseTransactionID(req.GetMatchedTransactionId())
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}

	appReq := &financeapp.MatchScheduledTransactionRequest{
		TransactionID: paymentID,
		MatchedID:     txnID,
	}

	txn, err := h.Coordinator.MatchScheduledTransaction(ctx, appReq)
	if err != nil {
		return nil, h.mapError(err)
	}

	return toProtoTransaction(txn), nil
}

func (h *Handler) SkipScheduledTransaction(ctx context.Context, req *financev1.SkipScheduledTransactionRequest) (*financev1.ScheduledTransaction, error) {
	id, err := finance.ParseScheduledTransactionID(req.GetId())
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}

	sp, err := h.Coordinator.SkipScheduledTransaction(ctx, id)
	if err != nil {
		return nil, h.mapError(err)
	}

	return toProtoScheduledTransaction(sp), nil
}

// --- Mappers ---

func mapProtoIntervalToDomain(interval financev1.RecurringTransaction_Interval) (string, error) {
	switch interval {
	case financev1.RecurringTransaction_WEEKLY:
		return "weekly", nil
	case financev1.RecurringTransaction_MONTHLY:
		return "monthly", nil
	case financev1.RecurringTransaction_YEARLY:
		return "yearly", nil
	case financev1.RecurringTransaction_INTERVAL_UNSPECIFIED:
		return "", nil
	default:
		return "", status.Error(codes.InvalidArgument, "invalid recurring transaction interval")
	}
}

func mapDomainIntervalToProto(interval string) financev1.RecurringTransaction_Interval {
	switch interval {
	case "weekly":
		return financev1.RecurringTransaction_WEEKLY
	case "monthly":
		return financev1.RecurringTransaction_MONTHLY
	case "yearly":
		return financev1.RecurringTransaction_YEARLY
	default:
		return financev1.RecurringTransaction_INTERVAL_UNSPECIFIED
	}
}

func mapProtoStatusToDomain(st financev1.RecurringTransaction_Status) (finance.RecurringTransactionStatus, error) {
	switch st {
	case financev1.RecurringTransaction_ACTIVE:
		return finance.RecurringTransactionActive, nil
	case financev1.RecurringTransaction_PAUSED:
		return finance.RecurringTransactionPaused, nil
	case financev1.RecurringTransaction_ENDED:
		return finance.RecurringTransactionEnded, nil
	case financev1.RecurringTransaction_STATUS_UNSPECIFIED:
		return "", nil
	default:
		return "", status.Error(codes.InvalidArgument, "invalid recurring transaction status")
	}
}

func mapDomainStatusToProto(st finance.RecurringTransactionStatus) financev1.RecurringTransaction_Status {
	switch st {
	case finance.RecurringTransactionActive:
		return financev1.RecurringTransaction_ACTIVE
	case finance.RecurringTransactionPaused:
		return financev1.RecurringTransaction_PAUSED
	case finance.RecurringTransactionEnded:
		return financev1.RecurringTransaction_ENDED
	default:
		return financev1.RecurringTransaction_STATUS_UNSPECIFIED
	}
}

func mapDomainSourceTypeToProto(st string) financev1.ScheduledTransaction_SourceType {
	switch st {
	case "recurrent_transaction":
		return financev1.ScheduledTransaction_RECURRENT_TRANSACTION
	case "loan":
		return financev1.ScheduledTransaction_LOAN
	case "tax":
		return financev1.ScheduledTransaction_TAX
	default:
		return financev1.ScheduledTransaction_SOURCE_TYPE_UNSPECIFIED
	}
}

func mapProtoPaymentStatusToDomain(st financev1.ScheduledTransaction_Status) (finance.ScheduledTransactionStatus, error) {
	switch st {
	case financev1.ScheduledTransaction_PENDING:
		return finance.ScheduledTransactionPending, nil
	case financev1.ScheduledTransaction_PROCESSING:
		return finance.ScheduledTransactionProcessing, nil
	case financev1.ScheduledTransaction_SKIPPED:
		return finance.ScheduledTransactionSkipped, nil
	case financev1.ScheduledTransaction_PAID:
		return finance.ScheduledTransactionPaid, nil
	default:
		return "", status.Error(codes.InvalidArgument, "invalid scheduled transaction status")
	}
}

func mapDomainPaymentStatusToProto(st finance.ScheduledTransactionStatus) financev1.ScheduledTransaction_Status {
	switch st {
	case finance.ScheduledTransactionPending:
		return financev1.ScheduledTransaction_PENDING
	case finance.ScheduledTransactionProcessing:
		return financev1.ScheduledTransaction_PROCESSING
	case finance.ScheduledTransactionSkipped:
		return financev1.ScheduledTransaction_SKIPPED
	case finance.ScheduledTransactionPaid:
		return financev1.ScheduledTransaction_PAID
	default:
		return financev1.ScheduledTransaction_STATUS_UNSPECIFIED
	}
}

func toProtoRecurringTransaction(e *finance.RecurringTransaction) *financev1.RecurringTransaction {
	if e == nil {
		return nil
	}
	var budgetID *string
	if e.BudgetID != nil {
		s := string(*e.BudgetID)
		budgetID = &s
	}
	var accountID *string
	if e.AccountID != nil {
		s := string(*e.AccountID)
		accountID = &s
	}
	t := financev1.RecurringType_value[string(e.Type)]

	return &financev1.RecurringTransaction{
		Id:       string(e.ID),
		SpaceId:  string(e.SpaceID),
		BudgetId: budgetID,
		Name:     e.Name,
		Amount:   e.Amount,
		Currency: string(e.Currency),
		Interval: mapDomainIntervalToProto(string(e.Interval)),
		ExecutionState: &financev1.RecurringTransaction_ExecutionState{
			NextDueDate: timestamppb.New(e.NextDueDate),
		},
		IsVariable:      e.IsVariable,
		Status:          mapDomainStatusToProto(e.Status),
		GracePeriodDays: e.GracePeriodDays,
		Type:            financev1.RecurringType(t),
		AccountId:       accountID,
		Version:         e.Version,
		CreateTime:      timestamppb.New(e.CreateTime),
		UpdateTime:      timestamppb.New(e.UpdateTime),
	}
}

func toProtoScheduledTransaction(p *finance.ScheduledTransaction) *financev1.ScheduledTransaction {
	if p == nil {
		return nil
	}
	var budgetID *string
	if p.BudgetID != nil {
		s := string(*p.BudgetID)
		budgetID = &s
	}
	var accountID *string
	if p.AccountID != nil {
		s := string(*p.AccountID)
		accountID = &s
	}
	t := financev1.RecurringType_value[string(p.Type)]

	return &financev1.ScheduledTransaction{
		Id:         string(p.ID),
		SpaceId:    string(p.SpaceID),
		BudgetId:   budgetID,
		SourceType: mapDomainSourceTypeToProto(p.SourceType),
		SourceId:   p.SourceID,
		Amount:     p.Amount,
		Currency:   string(p.Currency),
		DueDate:    timestamppb.New(p.DueDate),
		Status:     mapDomainPaymentStatusToProto(p.Status),
		Metadata: &financev1.ScheduledTransaction_Metadata{
			Name:        p.Metadata.Name,
			DueDate:     p.Metadata.DueDate,
			Description: p.Metadata.Description,
			VendorName:  p.Metadata.VendorName,
			InvoiceId:   p.Metadata.InvoiceID,
			Notes:       p.Metadata.Notes,
		},
		Type:       financev1.RecurringType(t),
		AccountId:  accountID,
		CreateTime: timestamppb.New(p.CreateTime),
		UpdateTime: timestamppb.New(p.UpdateTime),
	}
}

func toProtoAggregatedRecurringTransaction(at *financeaggregator.AggregatedRecurringTransaction) *financev1.RecurringTransaction {
	if at == nil {
		return nil
	}
	protoVal := toProtoRecurringTransaction(at.RecurringTransaction)
	if at.Budget != nil {
		protoVal.Budget = &financev1.RecurringTransaction_BudgetInfo{
			Id:    string(at.Budget.ID),
			Name:  at.Budget.Name,
			Color: at.Budget.Color,
			Icon:  at.Budget.Icon,
		}
	}
	return protoVal
}

func toProtoAggregatedScheduledTransaction(ap *financeaggregator.AggregatedScheduledTransaction) *financev1.ScheduledTransaction {
	if ap == nil {
		return nil
	}
	protoVal := toProtoScheduledTransaction(ap.ScheduledTransaction)
	if ap.Budget != nil {
		protoVal.Budget = &financev1.ScheduledTransaction_BudgetInfo{
			Id:    string(ap.Budget.ID),
			Name:  ap.Budget.Name,
			Color: ap.Budget.Color,
			Icon:  ap.Budget.Icon,
		}
	}
	if ap.RecurringTransaction != nil {
		protoVal.RecurringTransaction = &financev1.ScheduledTransaction_RecurringTransactionInfo{
			Id:       string(ap.RecurringTransaction.ID),
			Name:     ap.RecurringTransaction.Name,
			Interval: mapDomainIntervalToProto(string(ap.RecurringTransaction.Interval)),
		}
	}
	return protoVal
}
