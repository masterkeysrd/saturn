package finance

import (
	"context"
	"errors"
	"fmt"
	"strings"
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
	"github.com/masterkeysrd/saturn/internal/platform/conv"
	"github.com/masterkeysrd/saturn/internal/platform/sorting"
)

// Handler implements the financev1.FinanceServer interface.
type Handler struct {
	financev1.UnimplementedFinanceServer
	Coordinator *financeapp.Coordinator
	Aggregator  *financeaggregator.Service
}

// NewHandler creates a new Handler.
func NewHandler(coordinator *financeapp.Coordinator, financeAggregator *financeaggregator.Service) *Handler {
	return &Handler{
		Coordinator: coordinator,
		Aggregator:  financeAggregator,
	}
}

// --- Mappers ---

func toProtoSettings(s *finance.FinanceSettings) *financev1.FinanceSettings {
	return &financev1.FinanceSettings{
		SpaceId:      string(s.SpaceID),
		BaseCurrency: string(s.BaseCurrency),
		CreateTime:   timestamppb.New(s.CreateTime),
		UpdateTime:   timestamppb.New(s.UpdateTime),
	}
}

func toProtoInterval(interval finance.RecurrenceInterval) financev1.Budget_RecurrenceInterval {
	switch interval {
	case finance.IntervalWeekly:
		return financev1.Budget_WEEKLY
	case finance.IntervalYearly:
		return financev1.Budget_YEARLY
	case finance.IntervalMonthly:
		return financev1.Budget_MONTHLY
	case finance.IntervalOneTime:
		return financev1.Budget_ONE_TIME
	default:
		return financev1.Budget_RECURRENCE_INTERVAL_UNSPECIFIED
	}
}

func toDomainInterval(interval financev1.Budget_RecurrenceInterval) finance.RecurrenceInterval {
	switch interval {
	case financev1.Budget_WEEKLY:
		return finance.IntervalWeekly
	case financev1.Budget_YEARLY:
		return finance.IntervalYearly
	case financev1.Budget_ONE_TIME:
		return finance.IntervalOneTime
	case financev1.Budget_MONTHLY:
		fallthrough
	default:
		return finance.IntervalMonthly
	}
}

func toDomainPropagation(p financev1.LimitPropagation) finance.LimitPropagation {
	switch p {
	case financev1.LimitPropagation_LIMIT_PROPAGATION_CURRENT_PERIOD:
		return finance.PropagationCurrentPeriod
	case financev1.LimitPropagation_LIMIT_PROPAGATION_NEXT_PERIODS_ONLY:
		return finance.PropagationNextPeriodsOnly
	default:
		return ""
	}
}

func toProtoBudget(b *finance.Budget) *financev1.Budget {
	var defaultAccountID *string
	if b.DefaultAccountID != nil {
		idStr := string(*b.DefaultAccountID)
		defaultAccountID = &idStr
	}
	return &financev1.Budget{
		Id:               string(b.ID),
		SpaceId:          string(b.SpaceID),
		Name:             b.Name,
		LimitAmount:      b.LimitAmount,
		Currency:         string(b.Currency),
		Interval:         toProtoInterval(b.Interval),
		IsActive:         b.IsActive,
		CreateTime:       timestamppb.New(b.CreateTime),
		UpdateTime:       timestamppb.New(b.UpdateTime),
		Icon:             b.Icon,
		Color:            b.Color,
		DefaultAccountId: defaultAccountID,
		Version:          b.Version,
	}
}

func toDomainBudget(pb *financev1.Budget) (*finance.Budget, error) {
	if pb == nil {
		return nil, status.Error(codes.InvalidArgument, "budget payload is required")
	}

	var currency finance.Currency
	if pb.GetCurrency() != "" {
		var err error
		currency, err = finance.ParseCurrency(pb.GetCurrency())
		if err != nil {
			return nil, status.Error(codes.InvalidArgument, err.Error())
		}
	}

	var defaultAccountID *finance.AccountID
	if pb.DefaultAccountId != nil {
		idVal := finance.AccountID(*pb.DefaultAccountId)
		defaultAccountID = &idVal
	}

	return &finance.Budget{
		ID:               finance.BudgetID(pb.GetId()),
		SpaceID:          finance.SpaceID(pb.GetSpaceId()),
		Name:             pb.GetName(),
		LimitAmount:      pb.GetLimitAmount(),
		Currency:         currency,
		Interval:         toDomainInterval(pb.GetInterval()),
		IsActive:         pb.GetIsActive(),
		Icon:             pb.GetIcon(),
		Color:            pb.GetColor(),
		DefaultAccountID: defaultAccountID,
		Version:          pb.GetVersion(),
	}, nil
}

func toProtoBudgetPeriod(p *financeaggregator.AggregatedBudgetPeriod) *financev1.BudgetPeriod {
	return &financev1.BudgetPeriod{
		Id:                 string(p.ID),
		BudgetId:           string(p.BudgetID),
		SpaceId:            string(p.SpaceID),
		StartDate:          timestamppb.New(p.StartDate),
		EndDate:            timestamppb.New(p.EndDate),
		LimitAmount:        p.LimitAmount,
		Currency:           string(p.Currency),
		BaseCurrency:       string(p.BaseCurrency),
		ExchangeRateToBase: p.ExchangeRateToBase,
		CreateTime:         timestamppb.New(p.CreateTime),
		UpdateTime:         timestamppb.New(p.UpdateTime),
		SpentAmount:        p.SpentAmount,
		SpentInBase:        p.SpentInBase,
	}
}

// --- gRPC Service Methods ---

func (h *Handler) ConfigureFinance(ctx context.Context, req *financev1.ConfigureFinanceRequest) (*financev1.FinanceSettings, error) {
	baseCurrency, err := finance.ParseCurrency(req.GetBaseCurrency())
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}

	appReq := &financeapp.ConfigureFinanceRequest{
		BaseCurrency: baseCurrency,
	}

	settings, err := h.Coordinator.ConfigureFinance(ctx, appReq)
	if err != nil {
		return nil, h.mapError(err)
	}

	return toProtoSettings(settings), nil
}

func (h *Handler) GetFinanceSettings(ctx context.Context, req *financev1.GetFinanceSettingsRequest) (*financev1.FinanceSettings, error) {
	settings, err := h.Coordinator.GetFinanceSettings(ctx)
	if err != nil {
		return nil, h.mapError(err)
	}

	return toProtoSettings(settings), nil
}

func (h *Handler) ListCurrencies(ctx context.Context, req *financev1.ListCurrenciesRequest) (*financev1.ListCurrenciesResponse, error) {
	list, err := h.Coordinator.ListCurrencies(ctx)
	if err != nil {
		return nil, h.mapError(err)
	}

	currencies := make([]*financev1.CurrencyInfo, len(list))
	for i, c := range list {
		currencies[i] = &financev1.CurrencyInfo{
			Code: c.Code,
			Name: c.Name,
		}
	}

	return &financev1.ListCurrenciesResponse{
		Currencies: currencies,
	}, nil
}

func (h *Handler) CreateBudget(ctx context.Context, req *financev1.CreateBudgetRequest) (*financev1.Budget, error) {
	bInput, err := toDomainBudget(req.GetBudget())
	if err != nil {
		return nil, err
	}

	appReq := &financeapp.CreateBudgetRequest{
		Budget: bInput,
	}

	budget, err := h.Coordinator.CreateBudget(ctx, appReq)
	if err != nil {
		return nil, h.mapError(err)
	}

	return toProtoBudget(budget), nil
}

func (h *Handler) GetBudget(ctx context.Context, req *financev1.GetBudgetRequest) (*financev1.Budget, error) {
	budget, err := h.Coordinator.GetBudget(ctx, finance.BudgetID(req.GetId()))
	if err != nil {
		return nil, h.mapError(err)
	}

	return toProtoBudget(budget), nil
}

func (h *Handler) UpdateBudget(ctx context.Context, req *financev1.UpdateBudgetRequest) (*financev1.Budget, error) {
	bInput, err := toDomainBudget(req.GetBudget())
	if err != nil {
		return nil, err
	}
	if req.GetId() != "" {
		bInput.ID = finance.BudgetID(req.GetId())
	}
	if req.Version != nil {
		bInput.Version = req.GetVersion()
	}

	appReq := &financeapp.UpdateBudgetRequest{
		Budget:      bInput,
		Propagation: toDomainPropagation(req.GetPropagation()),
		UpdateMask:  req.GetUpdateMask().GetPaths(),
	}

	budget, err := h.Coordinator.UpdateBudget(ctx, appReq)
	if err != nil {
		return nil, h.mapError(err)
	}

	return toProtoBudget(budget), nil
}

func (h *Handler) DeleteBudget(ctx context.Context, req *financev1.DeleteBudgetRequest) (*emptypb.Empty, error) {
	appReq := &financeapp.DeleteBudgetRequest{
		ID:      finance.BudgetID(req.GetId()),
		Version: req.GetVersion(),
	}
	if err := h.Coordinator.DeleteBudget(ctx, appReq); err != nil {
		return nil, h.mapError(err)
	}

	return &emptypb.Empty{}, nil
}

func (h *Handler) ListBudgets(ctx context.Context, req *financev1.ListBudgetsRequest) (*financev1.ListBudgetsResponse, error) {
	spaceIDStr, ok := auth.SpaceIDFromContext(ctx)
	if !ok {
		return nil, status.Error(codes.Unauthenticated, "missing space-id context")
	}
	spaceID := finance.SpaceID(spaceIDStr)

	sortOrder := sorting.Parse(req.GetSort())

	pageSize := req.GetPageSize()

	var targetDate time.Time
	if req.GetTargetDate() != nil {
		targetDate = req.GetTargetDate().AsTime()
	} else {
		targetDate = time.Now()
	}

	var activeOnly *bool
	if req.ActiveOnly != nil {
		val := req.GetActiveOnly()
		activeOnly = &val
	}

	var searchQuery *string
	if req.SearchQuery != nil {
		val := req.GetSearchQuery()
		searchQuery = &val
	}

	viewType := financeaggregator.ViewBasic
	if req.GetView() == financev1.Budget_FULL {
		viewType = financeaggregator.ViewFull
	}

	page, err := h.Aggregator.ListBudgets(ctx, spaceID, financeaggregator.ListBudgetsFilter{
		ListBudgetsFilter: finance.ListBudgetsFilter{
			PageSize:      int32(pageSize),
			NextPageToken: req.GetPageToken(),
			ActiveOnly:    activeOnly,
			SearchQuery:   searchQuery,
			Sort:          sortOrder,
		},
		TargetDate: targetDate,
		View:       viewType,
	})
	if err != nil {
		return nil, h.mapError(err)
	}

	protoBudgets := make([]*financev1.Budget, 0, len(page.Items))
	for _, ab := range page.Items {
		pbBgt := toProtoBudget(ab.Budget)
		if ab.Period != nil {
			pbBgt.CurrentPeriod = &financev1.Budget_ActivePeriod{
				StartDate:          timestamppb.New(ab.Period.StartDate),
				EndDate:            timestamppb.New(ab.Period.EndDate),
				SpentAmount:        ab.Period.SpentAmount,
				SpentInBase:        ab.Period.SpentInBase,
				ExchangeRateToBase: ab.Period.ExchangeRateToBase,
				BaseCurrency:       string(ab.Period.BaseCurrency),
				LimitInBase:        ab.Period.LimitInBase,
			}
		}
		protoBudgets = append(protoBudgets, pbBgt)
	}

	return &financev1.ListBudgetsResponse{
		Budgets:       protoBudgets,
		NextPageToken: page.NextPageToken,
	}, nil
}

func (h *Handler) GetBudgetPeriod(ctx context.Context, req *financev1.GetBudgetPeriodRequest) (*financev1.BudgetPeriod, error) {
	spaceIDStr, ok := auth.SpaceIDFromContext(ctx)
	if !ok {
		return nil, status.Error(codes.Unauthenticated, "space ID required")
	}
	spaceID := finance.SpaceID(spaceIDStr)

	var targetDate time.Time
	if req.GetDate() != nil {
		targetDate = req.GetDate().AsTime()
	} else {
		targetDate = time.Now()
	}

	bID := finance.BudgetID(req.GetBudgetId())
	period, err := h.Aggregator.GetBudgetPeriod(ctx, spaceID, bID, targetDate)
	if err != nil {
		return nil, h.mapError(err)
	}

	return toProtoBudgetPeriod(period), nil
}

func (h *Handler) CreateExchangeRate(ctx context.Context, req *financev1.CreateExchangeRateRequest) (*financev1.ExchangeRate, error) {
	exRate := req.GetExchangeRate()
	if exRate == nil {
		return nil, status.Error(codes.InvalidArgument, "exchange_rate is required")
	}
	if exRate.GetRateDate() == nil {
		return nil, status.Error(codes.InvalidArgument, "rate date is required")
	}

	fromCurrency, err := finance.ParseCurrency(exRate.GetFromCurrency())
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}
	toCurrency, err := finance.ParseCurrency(exRate.GetToCurrency())
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}

	appReq := &financeapp.CreateExchangeRateRequest{
		FromCurrency: fromCurrency,
		ToCurrency:   toCurrency,
		Rate:         exRate.GetRate(),
		RateDate:     exRate.GetRateDate().AsTime(),
	}

	rate, err := h.Coordinator.CreateExchangeRate(ctx, appReq)
	if err != nil {
		return nil, h.mapError(err)
	}

	return toProtoExchangeRate(rate), nil
}

func (h *Handler) GetExchangeRate(ctx context.Context, req *financev1.GetExchangeRateRequest) (*financev1.ExchangeRate, error) {
	if req.GetId() == "" {
		return nil, status.Error(codes.InvalidArgument, "id is required")
	}

	spaceIDStr, ok := auth.SpaceIDFromContext(ctx)
	if !ok {
		return nil, status.Error(codes.Unauthenticated, "missing space-id context")
	}
	spaceID := finance.SpaceID(spaceIDStr)

	rate, err := h.Aggregator.GetExchangeRate(ctx, spaceID, req.GetId())
	if err != nil {
		return nil, h.mapError(err)
	}

	return toProtoExchangeRate(rate), nil
}

func (h *Handler) UpdateExchangeRate(ctx context.Context, req *financev1.UpdateExchangeRateRequest) (*financev1.ExchangeRate, error) {
	if req.GetId() == "" {
		return nil, status.Error(codes.InvalidArgument, "id is required")
	}
	exRate := req.GetExchangeRate()
	if exRate == nil {
		return nil, status.Error(codes.InvalidArgument, "exchange_rate is required")
	}

	appReq := &financeapp.UpdateExchangeRateRequest{
		ID:   req.GetId(),
		Rate: exRate.GetRate(),
	}

	rate, err := h.Coordinator.UpdateExchangeRate(ctx, appReq)
	if err != nil {
		return nil, h.mapError(err)
	}

	return toProtoExchangeRate(rate), nil
}

func (h *Handler) ListExchangeRates(ctx context.Context, req *financev1.ListExchangeRatesRequest) (*financev1.ListExchangeRatesResponse, error) {
	spaceIDStr, ok := auth.SpaceIDFromContext(ctx)
	if !ok {
		return nil, status.Error(codes.Unauthenticated, "missing space-id context")
	}
	spaceID := finance.SpaceID(spaceIDStr)

	filter := financeaggregator.ListExchangeRatesFilter{
		ListExchangeRatesFilter: finance.ListExchangeRatesFilter{
			PageSize:      req.GetPageSize(),
			NextPageToken: req.GetPageToken(),
			Sort:          sorting.Parse(req.GetOrderBy()),
		},
	}

	if req.GetFromCurrency() != "" {
		from, err := finance.ParseCurrency(req.GetFromCurrency())
		if err != nil {
			return nil, status.Error(codes.InvalidArgument, err.Error())
		}
		filter.FromCurrency = &from
	}
	if req.GetToCurrency() != "" {
		to, err := finance.ParseCurrency(req.GetToCurrency())
		if err != nil {
			return nil, status.Error(codes.InvalidArgument, err.Error())
		}
		filter.ToCurrency = &to
	}
	if req.GetStartDate() != nil {
		st := req.GetStartDate().AsTime()
		filter.StartDate = &st
	}
	if req.GetEndDate() != nil {
		et := req.GetEndDate().AsTime()
		filter.EndDate = &et
	}

	rates, nextToken, err := h.Aggregator.ListExchangeRates(ctx, spaceID, filter)
	if err != nil {
		return nil, h.mapError(err)
	}

	protoRates := make([]*financev1.ExchangeRate, 0, len(rates))
	for _, r := range rates {
		protoRates = append(protoRates, toProtoExchangeRate(r))
	}

	return &financev1.ListExchangeRatesResponse{
		ExchangeRates: protoRates,
		NextPageToken: nextToken,
	}, nil
}

func (h *Handler) DeleteExchangeRate(ctx context.Context, req *financev1.DeleteExchangeRateRequest) (*emptypb.Empty, error) {
	if req.GetId() == "" {
		return nil, status.Error(codes.InvalidArgument, "id is required")
	}

	appReq := &financeapp.DeleteExchangeRateRequest{
		ID: req.GetId(),
	}

	err := h.Coordinator.DeleteExchangeRate(ctx, appReq)
	if err != nil {
		return nil, h.mapError(err)
	}

	return &emptypb.Empty{}, nil
}

func toProtoExchangeRate(rate *finance.ExchangeRate) *financev1.ExchangeRate {
	if rate == nil {
		return nil
	}
	if rate.ID == "" {
		rate.ID = rate.ComputeID()
	}
	return &financev1.ExchangeRate{
		Id:           rate.ID,
		SpaceId:      string(rate.SpaceID),
		FromCurrency: string(rate.FromCurrency),
		ToCurrency:   string(rate.ToCurrency),
		Rate:         rate.Rate,
		RateDate:     timestamppb.New(rate.RateDate),
		CreateTime:   timestamppb.New(rate.CreateTime),
	}
}

// mapError translates domain and application errors to gRPC statuses.
func (h *Handler) mapError(err error) error {
	if err == nil {
		return nil
	}

	if strings.Contains(err.Error(), "access denied") {
		return status.Error(codes.PermissionDenied, err.Error())
	}

	switch {
	case errors.Is(err, finance.ErrSettingsNotFound):
		return status.Error(codes.NotFound, "finance settings not configured")
	case errors.Is(err, finance.ErrBudgetNotFound):
		return status.Error(codes.NotFound, "budget not found")
	case errors.Is(err, finance.ErrPeriodNotFound):
		return status.Error(codes.NotFound, "budget period not found")
	case errors.Is(err, finance.ErrExchangeRateNotFound):
		return status.Error(codes.FailedPrecondition, "exchange rate not found")
	case errors.Is(err, finance.ErrTransactionNotFound):
		return status.Error(codes.NotFound, "transaction not found")
	case errors.Is(err, finance.ErrScheduledPaymentNotFound):
		return status.Error(codes.NotFound, "scheduled payment not found")
	case errors.Is(err, finance.ErrBorrowingNotFound):
		return status.Error(codes.NotFound, "borrowing not found")
	case errors.Is(err, finance.ErrRepaymentNotFound):
		return status.Error(codes.NotFound, "borrowing repayment not found")
	}

	return status.Error(codes.InvalidArgument, err.Error())
}

func (h *Handler) CreateExpense(ctx context.Context, req *financev1.CreateExpenseRequest) (*financev1.Transaction, error) {
	expense := req.GetExpense()
	if expense == nil {
		return nil, status.Error(codes.InvalidArgument, "expense details are required")
	}

	currency, err := finance.ParseCurrency(expense.GetCurrency())
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}

	var transactionDate time.Time
	if expense.GetTransactionDate() != nil {
		transactionDate = expense.GetTransactionDate().AsTime()
	} else {
		transactionDate = time.Now().UTC()
	}

	var effectiveDate time.Time
	if expense.GetEffectiveDate() != nil {
		effectiveDate = expense.GetEffectiveDate().AsTime()
	} else {
		effectiveDate = transactionDate
	}

	var accountID *finance.AccountID
	if expense.AccountId != nil {
		idVal := finance.AccountID(*expense.AccountId)
		accountID = &idVal
	}

	appReq := &financeapp.CreateExpenseRequest{
		BudgetID:        finance.BudgetID(expense.GetBudgetId()),
		Amount:          expense.GetAmount(),
		Currency:        currency,
		Description:     expense.GetDescription(),
		TransactionDate: transactionDate,
		EffectiveDate:   effectiveDate,
		AccountID:       accountID,
	}

	txn, err := h.Coordinator.CreateExpense(ctx, appReq)
	if err != nil {
		return nil, h.mapError(err)
	}

	return toProtoTransaction(txn), nil
}

func (h *Handler) UpdateExpense(ctx context.Context, req *financev1.UpdateExpenseRequest) (*financev1.Transaction, error) {
	expense := req.GetExpense()
	if expense == nil {
		return nil, status.Error(codes.InvalidArgument, "expense details are required")
	}

	currency, err := finance.ParseCurrency(expense.GetCurrency())
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}

	var transactionDate time.Time
	if expense.GetTransactionDate() != nil {
		transactionDate = expense.GetTransactionDate().AsTime()
	}

	var effectiveDate time.Time
	if expense.GetEffectiveDate() != nil {
		effectiveDate = expense.GetEffectiveDate().AsTime()
	}

	tID, err := finance.ParseTransactionID(req.GetId())
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}

	var accountID *finance.AccountID
	if expense.AccountId != nil {
		idVal := finance.AccountID(*expense.AccountId)
		accountID = &idVal
	}

	appReq := &financeapp.UpdateExpenseRequest{
		TransactionID:   tID,
		BudgetID:        finance.BudgetID(expense.GetBudgetId()),
		Amount:          expense.GetAmount(),
		Currency:        currency,
		Description:     expense.GetDescription(),
		TransactionDate: transactionDate,
		EffectiveDate:   effectiveDate,
		AccountID:       accountID,
	}

	txn, err := h.Coordinator.UpdateExpense(ctx, appReq)
	if err != nil {
		return nil, h.mapError(err)
	}

	return toProtoTransaction(txn), nil
}

func (h *Handler) DeleteTransaction(ctx context.Context, req *financev1.DeleteTransactionRequest) (*emptypb.Empty, error) {
	tID, err := finance.ParseTransactionID(req.GetId())
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}

	err = h.Coordinator.DeleteTransaction(ctx, tID)
	if err != nil {
		return nil, h.mapError(err)
	}

	return &emptypb.Empty{}, nil
}

func (h *Handler) GetTransaction(ctx context.Context, req *financev1.GetTransactionRequest) (*financev1.Transaction, error) {
	spaceIDStr, ok := auth.SpaceIDFromContext(ctx)
	if !ok {
		return nil, status.Error(codes.Unauthenticated, "missing space-id context")
	}
	spaceID := finance.SpaceID(spaceIDStr)

	tID, err := finance.ParseTransactionID(req.GetId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid transaction id: %v", err)
	}

	view := financeaggregator.ViewBasic
	if req.GetView() == financev1.Transaction_FULL {
		view = financeaggregator.ViewFull
	}
	aggTxn, err := h.Aggregator.GetTransaction(ctx, spaceID, view, tID)
	if err != nil {
		return nil, h.mapError(err)
	}

	return toProtoAggregatedTransaction(aggTxn), nil
}

func (h *Handler) ListTransactions(ctx context.Context, req *financev1.ListTransactionsRequest) (*financev1.ListTransactionsResponse, error) {
	spaceIDStr, ok := auth.SpaceIDFromContext(ctx)
	if !ok {
		return nil, status.Error(codes.Unauthenticated, "missing space-id context")
	}
	spaceID := finance.SpaceID(spaceIDStr)

	var budgetID *finance.BudgetID
	if req.GetBudgetId() != "" {
		bID := finance.BudgetID(req.GetBudgetId())
		budgetID = &bID
	}

	var txnType *finance.TransactionType
	if req.GetType() != financev1.Transaction_TYPE_UNSPECIFIED {
		var t finance.TransactionType
		switch req.GetType() {
		case financev1.Transaction_EXPENSE:
			t = finance.TransactionTypeExpense
		case financev1.Transaction_INCOME:
			t = finance.TransactionTypeIncome
		case financev1.Transaction_TRANSFER_OUT:
			t = finance.TransactionTypeTransferOut
		case financev1.Transaction_TRANSFER_IN:
			t = finance.TransactionTypeTransferIn
		case financev1.Transaction_BALANCE_ADJUSTMENT:
			t = finance.TransactionTypeBalanceAdjustment
		}
		txnType = &t
	}

	var accountID *finance.AccountID
	if req.AccountId != nil {
		idVal := finance.AccountID(*req.AccountId)
		accountID = &idVal
	}

	var searchQuery *string
	if req.SearchQuery != nil {
		val := req.GetSearchQuery()
		searchQuery = &val
	}

	var transferID *finance.TransferID
	if req.TransferId != nil {
		idVal := finance.TransferID(*req.TransferId)
		transferID = &idVal
	}

	var scheduledPaymentID *string
	if req.ScheduledPaymentId != nil && *req.ScheduledPaymentId != "" {
		val := *req.ScheduledPaymentId
		scheduledPaymentID = &val
	}

	var borrowingID *string
	if req.BorrowingId != nil && *req.BorrowingId != "" {
		val := *req.BorrowingId
		borrowingID = &val
	}

	filter := finance.TransactionFilter{
		BudgetID:           budgetID,
		Type:               txnType,
		AccountID:          accountID,
		TransferID:         transferID,
		ScheduledPaymentID: scheduledPaymentID,
		BorrowingID:        borrowingID,
		PageSize:           req.GetPageSize(),
		NextPageToken:      req.GetPageToken(),
		Sort:               sorting.Parse(req.GetSort()),
		SearchQuery:        searchQuery,
	}

	view := financeaggregator.ViewBasic
	if req.GetView() == financev1.Transaction_FULL {
		view = financeaggregator.ViewFull
	}

	page, err := h.Aggregator.ListTransactions(ctx, spaceID, view, filter)
	if err != nil {
		return nil, h.mapError(err)
	}

	protoTxns := make([]*financev1.Transaction, 0, len(page.Items))
	for _, at := range page.Items {
		protoTxns = append(protoTxns, toProtoAggregatedTransaction(at))
	}

	return &financev1.ListTransactionsResponse{
		Transactions:  protoTxns,
		NextPageToken: page.NextPageToken,
	}, nil
}

func toProtoTransaction(t *finance.Transaction) *financev1.Transaction {
	if t == nil {
		return nil
	}
	var protoType financev1.Transaction_Type
	switch t.Type {
	case finance.TransactionTypeExpense:
		protoType = financev1.Transaction_EXPENSE
	case finance.TransactionTypeIncome:
		protoType = financev1.Transaction_INCOME
	case finance.TransactionTypeTransferOut:
		protoType = financev1.Transaction_TRANSFER_OUT
	case finance.TransactionTypeTransferIn:
		protoType = financev1.Transaction_TRANSFER_IN
	case finance.TransactionTypeBalanceAdjustment:
		protoType = financev1.Transaction_BALANCE_ADJUSTMENT
	default:
		protoType = financev1.Transaction_TYPE_UNSPECIFIED
	}

	var budgetID, periodID, accountID string
	if t.BudgetID != nil {
		budgetID = string(*t.BudgetID)
	}
	if t.PeriodID != nil {
		periodID = string(*t.PeriodID)
	}
	if t.AccountID != nil {
		accountID = string(*t.AccountID)
	}
	var accountIDPtr *string
	if accountID != "" {
		accountIDPtr = &accountID
	}

	metaMap := make(map[string]string)
	if t.Metadata.ScheduledPaymentID != nil {
		metaMap["scheduled_payment_id"] = string(*t.Metadata.ScheduledPaymentID)
	}
	if t.Metadata.RecurringExpenseID != nil {
		metaMap["recurring_expense_id"] = string(*t.Metadata.RecurringExpenseID)
	}
	if t.Metadata.BorrowingID != nil {
		metaMap["borrowing_id"] = string(*t.Metadata.BorrowingID)
	}
	if t.Metadata.BorrowingRole != "" {
		metaMap["borrowing_role"] = t.Metadata.BorrowingRole
	}
	if t.Metadata.TransferID != nil {
		metaMap["transfer_id"] = string(*t.Metadata.TransferID)
	}
	if t.Metadata.CounterpartAccountID != nil {
		metaMap["counterpart_account_id"] = string(*t.Metadata.CounterpartAccountID)
	}
	if t.Metadata.Notes != "" {
		metaMap["notes"] = t.Metadata.Notes
	}

	return &financev1.Transaction{
		Id:              string(t.ID),
		SpaceId:         string(t.SpaceID),
		Type:            protoType,
		BudgetId:        budgetID,
		PeriodId:        periodID,
		Amount:          t.Amount,
		Currency:        string(t.Currency),
		AmountInBase:    t.AmountInBase,
		Description:     t.Description,
		TransactionDate: timestamppb.New(t.TransactionDate),
		EffectiveDate:   timestamppb.New(t.EffectiveDate),
		AccountId:       accountIDPtr,
		Metadata:        metaMap,
		CreateTime:      timestamppb.New(t.CreateTime),
		UpdateTime:      timestamppb.New(t.UpdateTime),
	}
}

func toProtoAggregatedTransaction(at *financeaggregator.AggregatedTransaction) *financev1.Transaction {
	if at == nil {
		return nil
	}
	pb := toProtoTransaction(at.Transaction)

	if at.Account != nil {
		pb.Account = &financev1.Transaction_AccountInfo{
			Id:    string(at.Account.ID),
			Name:  at.Account.Name,
			Color: at.Account.Color,
			Type:  string(at.Account.Type),
		}
	}

	if at.Budget != nil {
		pb.Budget = &financev1.Transaction_BudgetInfo{
			Id:   string(at.Budget.ID),
			Name: at.Budget.Name,
		}
	}

	return pb
}

func (h *Handler) ListTransactionEvents(ctx context.Context, req *financev1.ListTransactionEventsRequest) (*financev1.ListTransactionEventsResponse, error) {
	txnID, err := finance.ParseTransactionID(req.GetTxnId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid transaction ID: %v", err)
	}

	appReq := &financeapp.ListTransactionEventsRequest{
		TransactionID: txnID,
	}

	events, err := h.Coordinator.ListTransactionEvents(ctx, appReq)
	if err != nil {
		return nil, h.mapError(err)
	}

	protoEvents := make([]*financev1.TransactionEvent, 0, len(events))
	for _, e := range events {
		protoEvents = append(protoEvents, toProtoTransactionEvent(e))
	}

	return &financev1.ListTransactionEventsResponse{
		Events: protoEvents,
	}, nil
}

func toProtoTransactionEvent(e *finance.TransactionEvent) *financev1.TransactionEvent {
	if e == nil {
		return nil
	}
	metadataBytes, _ := e.MetadataJSON()
	return &financev1.TransactionEvent{
		Id:         string(e.ID),
		SpaceId:    string(e.SpaceID),
		TxnId:      string(e.TransactionID),
		EventType:  e.EventType,
		Metadata:   string(metadataBytes),
		CreateTime: timestamppb.New(e.CreateTime),
	}
}

func (h *Handler) GetInsights(ctx context.Context, req *financev1.GetInsightsRequest) (*financev1.GetInsightsResponse, error) {
	var start, end time.Time
	if req.GetStartDate() != nil {
		start = req.GetStartDate().AsTime()
	}
	if req.GetEndDate() != nil {
		end = req.GetEndDate().AsTime()
	}

	appReq := &financeapp.GetInsightsRequest{
		Granularity: mapGranularity(req.GetGranularity()),
		StartDate:   start,
		EndDate:     end,
	}

	insights, err := h.Coordinator.GetInsights(ctx, appReq)
	if err != nil {
		return nil, h.mapError(err)
	}

	return toProtoInsightsResponse(insights), nil
}

func mapGranularity(g financev1.InsightGranularity) string {
	switch g {
	case financev1.InsightGranularity_DAILY:
		return "daily"
	case financev1.InsightGranularity_WEEKLY:
		return "weekly"
	case financev1.InsightGranularity_MONTHLY:
		return "monthly"
	case financev1.InsightGranularity_YEARLY:
		return "yearly"
	default:
		return "monthly"
	}
}

func toProtoInsightsResponse(in *finance.SpentInsights) *financev1.GetInsightsResponse {
	if in == nil {
		return &financev1.GetInsightsResponse{}
	}

	trendPoints := make([]*financev1.SpentInsights_TrendDataPoint, 0, len(in.Trend))
	for _, pt := range in.Trend {
		contribs := make([]*financev1.SpentInsights_BudgetContribution, 0, len(pt.Contributions))
		for _, c := range pt.Contributions {
			contribs = append(contribs, &financev1.SpentInsights_BudgetContribution{
				BudgetId:               c.BudgetID,
				BudgetName:             c.BudgetName,
				BudgetColor:            c.BudgetColor,
				AmountInBase:           c.AmountInBase,
				AmountInLocal:          c.AmountInLocal,
				LocalCurrency:          c.LocalCurrency,
				ContributionPercentage: c.ContributionPercentage,
			})
		}
		trendPoints = append(trendPoints, &financev1.SpentInsights_TrendDataPoint{
			Label:            pt.Label,
			StartDate:        pt.StartDate,
			AmountInBase:     pt.AmountInBase,
			TransactionCount: pt.TransactionCount,
			Contributions:    contribs,
		})
	}

	dists := make([]*financev1.SpentInsights_BudgetUsage, 0, len(in.Distributions))
	for _, d := range in.Distributions {
		dists = append(dists, &financev1.SpentInsights_BudgetUsage{
			BudgetId:        d.BudgetID,
			BudgetName:      d.BudgetName,
			BudgetColor:     d.BudgetColor,
			BudgetIcon:      d.BudgetIcon,
			Limit:           d.Limit,
			Spent:           d.Spent,
			SpentInBase:     d.SpentInBase,
			UsagePercentage: d.UsagePercentage,
		})
	}

	tops := make([]*financev1.SpentInsights_HighValueExpense, 0, len(in.TopExpenses))
	for _, t := range in.TopExpenses {
		tops = append(tops, &financev1.SpentInsights_HighValueExpense{
			TransactionId:   t.TransactionID,
			Description:     t.Description,
			Amount:          t.Amount,
			Currency:        t.Currency,
			AmountInBase:    t.AmountInBase,
			BudgetName:      t.BudgetName,
			TransactionDate: timestamppb.New(t.TransactionDate),
			EffectiveDate:   timestamppb.New(t.EffectiveDate),
		})
	}

	return &financev1.GetInsightsResponse{
		Spent: &financev1.SpentInsights{
			TotalLimit:      in.TotalLimit,
			TotalSpent:      in.TotalSpent,
			RemainingBudget: in.RemainingBudget,
			BurnRate:        in.BurnRate,
			Trend:           trendPoints,
			Distributions:   dists,
			TopExpenses:     tops,
		},
	}
}

func toProtoAccountType(t finance.AccountType) financev1.Account_Type {
	switch t {
	case finance.AccountTypeBank:
		return financev1.Account_BANK
	case finance.AccountTypeCreditCard:
		return financev1.Account_CREDIT_CARD
	case finance.AccountTypeCash:
		return financev1.Account_CASH
	case finance.AccountTypeDigitalAccount:
		return financev1.Account_DIGITAL_ACCOUNT
	default:
		return financev1.Account_TYPE_UNSPECIFIED
	}
}

func toDomainAccountType(t financev1.Account_Type) finance.AccountType {
	switch t {
	case financev1.Account_BANK:
		return finance.AccountTypeBank
	case financev1.Account_CREDIT_CARD:
		return finance.AccountTypeCreditCard
	case financev1.Account_CASH:
		return finance.AccountTypeCash
	case financev1.Account_DIGITAL_ACCOUNT:
		fallthrough
	default:
		return finance.AccountTypeDigitalAccount
	}
}

func toProtoAccount(a *finance.Account) *financev1.Account {
	if a == nil {
		return nil
	}
	return &financev1.Account{
		Id:             string(a.ID),
		SpaceId:        string(a.SpaceID),
		Name:           a.Name,
		Type:           toProtoAccountType(a.Type),
		Currency:       string(a.Currency),
		InitialBalance: a.InitialBalance,
		CurrentBalance: a.CurrentBalance,
		CreditLimit:    a.CreditLimit,
		IsDefault:      a.IsDefault,
		IsActive:       a.IsActive,
		Color:          a.Color,
		Notes:          a.Notes,
		LastFour:       a.LastFour,
		CreateTime:     timestamppb.New(a.CreateTime),
		UpdateTime:     timestamppb.New(a.UpdateTime),
	}
}

func toProtoTransfer(t *finance.Transfer) *financev1.Transfer {
	if t == nil {
		return nil
	}
	return &financev1.Transfer{
		Id:                   string(t.ID),
		SpaceId:              string(t.SpaceID),
		SourceAccountId:      string(t.SourceAccountID),
		DestinationAccountId: string(t.DestinationAccountID),
		SourceAmount:         t.SourceAmount,
		DestinationAmount:    t.DestinationAmount,
		TransferDate:         timestamppb.New(t.TransferDate),
		Notes:                t.Notes,
		CreateTime:           timestamppb.New(t.CreateTime),
		UpdateTime:           timestamppb.New(t.UpdateTime),
	}
}

func (h *Handler) CreateAccount(ctx context.Context, req *financev1.CreateAccountRequest) (*financev1.Account, error) {
	account := req.GetAccount()
	if account == nil {
		return nil, status.Error(codes.InvalidArgument, "account resource is required")
	}

	appReq := &financeapp.CreateAccountRequest{
		Name:           account.GetName(),
		Type:           string(toDomainAccountType(account.GetType())),
		Currency:       account.GetCurrency(),
		InitialBalance: account.GetInitialBalance(),
		CreditLimit:    account.GetCreditLimit(),
		IsDefault:      account.GetIsDefault(),
		Color:          account.GetColor(),
		Notes:          account.GetNotes(),
		LastFour:       account.GetLastFour(),
	}

	acc, err := h.Coordinator.CreateAccount(ctx, appReq)
	if err != nil {
		return nil, h.mapError(err)
	}

	return toProtoAccount(acc), nil
}

func (h *Handler) GetAccount(ctx context.Context, req *financev1.GetAccountRequest) (*financev1.Account, error) {
	spaceIDStr, ok := auth.SpaceIDFromContext(ctx)
	if !ok {
		return nil, status.Error(codes.Unauthenticated, "missing space-id context")
	}
	spaceID := finance.SpaceID(spaceIDStr)

	aID, err := finance.ParseAccountID(req.GetId())
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}

	viewType := financeaggregator.ViewBasic
	if req.GetView() == financev1.Account_FULL {
		viewType = financeaggregator.ViewFull
	}

	a, err := h.Aggregator.GetAccount(ctx, spaceID, aID, viewType)
	if err != nil {
		return nil, h.mapError(err)
	}

	pbAcc := toProtoAccount(a.Account)
	if viewType == financeaggregator.ViewFull {
		pbAcc.Conversion = &financev1.Account_Conversion{
			Balance: a.BalanceInBase,
			Rate:    a.ExchangeRateToBase,
		}
	}

	return pbAcc, nil
}

func (h *Handler) UpdateAccount(ctx context.Context, req *financev1.UpdateAccountRequest) (*financev1.Account, error) {
	account := req.GetAccount()
	if account == nil {
		return nil, status.Error(codes.InvalidArgument, "account resource is required")
	}

	aID, err := finance.ParseAccountID(account.GetId())
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}

	appReq := &financeapp.UpdateAccountRequest{
		ID:          aID,
		Name:        account.GetName(),
		CreditLimit: account.GetCreditLimit(),
		IsDefault:   account.GetIsDefault(),
		IsActive:    account.GetIsActive(),
		Color:       account.GetColor(),
		Notes:       account.GetNotes(),
		LastFour:    account.GetLastFour(),
	}

	acc, err := h.Coordinator.UpdateAccount(ctx, appReq)
	if err != nil {
		return nil, h.mapError(err)
	}

	return toProtoAccount(acc), nil
}

func (h *Handler) AdjustAccountBalance(ctx context.Context, req *financev1.AdjustAccountBalanceRequest) (*financev1.Account, error) {
	if req.GetAccountId() == "" {
		return nil, status.Error(codes.InvalidArgument, "account_id is required")
	}

	aID, err := finance.ParseAccountID(req.GetAccountId())
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}

	acc, err := h.Coordinator.AdjustAccountBalance(ctx, aID, req.GetTargetBalance(), req.GetAdjustmentDate(), req.GetNote())
	if err != nil {
		return nil, h.mapError(err)
	}

	return toProtoAccount(acc), nil
}

func (h *Handler) DeleteAccount(ctx context.Context, req *financev1.DeleteAccountRequest) (*emptypb.Empty, error) {
	aID, err := finance.ParseAccountID(req.GetId())
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}

	if err := h.Coordinator.DeleteAccount(ctx, aID); err != nil {
		return nil, h.mapError(err)
	}

	return &emptypb.Empty{}, nil
}

func (h *Handler) ListAccounts(ctx context.Context, req *financev1.ListAccountsRequest) (*financev1.ListAccountsResponse, error) {
	spaceIDStr, ok := auth.SpaceIDFromContext(ctx)
	if !ok {
		return nil, status.Error(codes.Unauthenticated, "missing space-id context")
	}
	spaceID := finance.SpaceID(spaceIDStr)

	viewType := financeaggregator.ViewBasic
	if req.GetView() == financev1.Account_FULL {
		viewType = financeaggregator.ViewFull
	}

	var activeOnly *bool
	if req.ActiveOnly != nil {
		val := req.GetActiveOnly()
		activeOnly = &val
	}

	var searchQuery *string
	if req.SearchQuery != nil {
		val := req.GetSearchQuery()
		searchQuery = &val
	}

	filter := financeaggregator.ListAccountsFilter{
		ListAccountsFilter: finance.ListAccountsFilter{
			PageSize:      req.GetPageSize(),
			NextPageToken: req.GetPageToken(),
			ActiveOnly:    activeOnly,
			SearchQuery:   searchQuery,
			Sort:          sorting.Parse(req.GetSort()),
		},
	}

	page, err := h.Aggregator.ListAccounts(ctx, spaceID, viewType, filter)
	if err != nil {
		return nil, h.mapError(err)
	}

	protoAccounts := make([]*financev1.Account, 0, len(page.Items))
	for _, a := range page.Items {
		pbAcc := toProtoAccount(a.Account)
		if viewType == financeaggregator.ViewFull {
			pbAcc.Conversion = &financev1.Account_Conversion{
				Balance: a.BalanceInBase,
				Rate:    a.ExchangeRateToBase,
			}
		}
		protoAccounts = append(protoAccounts, pbAcc)
	}

	return &financev1.ListAccountsResponse{
		Accounts:      protoAccounts,
		NextPageToken: page.NextPageToken,
	}, nil
}

func (h *Handler) CreateTransfer(ctx context.Context, req *financev1.CreateTransferRequest) (*financev1.Transfer, error) {
	var transferDate time.Time
	if req.GetTransferDate() != nil {
		transferDate = req.GetTransferDate().AsTime()
	} else {
		transferDate = time.Now().UTC()
	}

	appReq := &financeapp.CreateTransferRequest{
		SourceAccountID:      req.GetSourceAccountId(),
		DestinationAccountID: req.GetDestinationAccountId(),
		SourceAmount:         req.GetSourceAmount(),
		DestinationAmount:    req.GetDestinationAmount(),
		TransferDate:         transferDate,
		Notes:                req.GetNotes(),
	}

	trsf, err := h.Coordinator.CreateTransfer(ctx, appReq)
	if err != nil {
		return nil, h.mapError(err)
	}

	return toProtoTransfer(trsf), nil
}

func (h *Handler) ListTransfers(ctx context.Context, req *financev1.ListTransfersRequest) (*financev1.ListTransfersResponse, error) {
	appReq := &financeapp.ListTransfersRequest{
		Limit:     req.GetPageSize(),
		PageToken: req.GetPageToken(),
	}

	list, nextToken, err := h.Coordinator.ListTransfers(ctx, appReq)
	if err != nil {
		return nil, h.mapError(err)
	}

	protoTransfers := make([]*financev1.Transfer, 0, len(list))
	for _, t := range list {
		protoTransfers = append(protoTransfers, toProtoTransfer(t))
	}

	return &financev1.ListTransfersResponse{
		Transfers:     protoTransfers,
		NextPageToken: nextToken,
	}, nil
}

// --- Integrations & Inbox Items Endpoints ---

func toProtoInboxStatus(s finance.InboxItemStatus) financev1.InboxItem_Status {
	switch s {
	case finance.InboxItemPending:
		return financev1.InboxItem_PENDING
	case finance.InboxItemProcessing:
		return financev1.InboxItem_PROCESSING
	case finance.InboxItemResolved:
		return financev1.InboxItem_RESOLVED
	case finance.InboxItemArchived:
		return financev1.InboxItem_ARCHIVED
	default:
		return financev1.InboxItem_STATUS_UNSPECIFIED
	}
}

func toDomainInboxStatus(s financev1.InboxItem_Status) finance.InboxItemStatus {
	switch s {
	case financev1.InboxItem_PENDING:
		return finance.InboxItemPending
	case financev1.InboxItem_PROCESSING:
		return finance.InboxItemProcessing
	case financev1.InboxItem_RESOLVED:
		return finance.InboxItemResolved
	case financev1.InboxItem_ARCHIVED:
		return finance.InboxItemArchived
	default:
		return ""
	}
}

func toProtoInboxDocType(d finance.InboxItemDocType) financev1.InboxItem_DocType {
	switch d {
	case finance.InboxItemDocInvoice:
		return financev1.InboxItem_INVOICE
	case finance.InboxItemDocReceipt:
		return financev1.InboxItem_RECEIPT
	case finance.InboxItemDocBankNotification:
		return financev1.InboxItem_BANK_NOTIFICATION
	case finance.InboxItemDocSystemVerification:
		return financev1.InboxItem_SYSTEM_VERIFICATION
	case finance.InboxItemDocUnknown:
		return financev1.InboxItem_UNKNOWN
	default:
		return financev1.InboxItem_DOC_TYPE_UNSPECIFIED
	}
}

func toDomainInboxDocType(d financev1.InboxItem_DocType) finance.InboxItemDocType {
	switch d {
	case financev1.InboxItem_INVOICE:
		return finance.InboxItemDocInvoice
	case financev1.InboxItem_RECEIPT:
		return finance.InboxItemDocReceipt
	case financev1.InboxItem_BANK_NOTIFICATION:
		return finance.InboxItemDocBankNotification
	case financev1.InboxItem_SYSTEM_VERIFICATION:
		return finance.InboxItemDocSystemVerification
	case financev1.InboxItem_UNKNOWN:
		return finance.InboxItemDocUnknown
	default:
		return finance.InboxItemDocUnknown
	}
}

func toProtoBorrowingLinkType(l *finance.BorrowingLinkType) *financev1.BorrowingLinkType {
	if l == nil {
		return nil
	}
	switch *l {
	case finance.BorrowingLinkTypeInitialReceipt:
		v := financev1.BorrowingLinkType_BORROWING_LINK_TYPE_INITIAL_RECEIPT
		return &v
	case finance.BorrowingLinkTypeRepayment:
		v := financev1.BorrowingLinkType_BORROWING_LINK_TYPE_REPAYMENT
		return &v
	case finance.BorrowingLinkTypeAdditionalLoan:
		v := financev1.BorrowingLinkType_BORROWING_LINK_TYPE_ADDITIONAL_LOAN
		return &v
	default:
		v := financev1.BorrowingLinkType_BORROWING_LINK_TYPE_UNSPECIFIED
		return &v
	}
}

func toDomainBorrowingLinkType(l financev1.BorrowingLinkType) *finance.BorrowingLinkType {
	switch l {
	case financev1.BorrowingLinkType_BORROWING_LINK_TYPE_INITIAL_RECEIPT:
		v := finance.BorrowingLinkTypeInitialReceipt
		return &v
	case financev1.BorrowingLinkType_BORROWING_LINK_TYPE_REPAYMENT:
		v := finance.BorrowingLinkTypeRepayment
		return &v
	case financev1.BorrowingLinkType_BORROWING_LINK_TYPE_ADDITIONAL_LOAN:
		v := finance.BorrowingLinkTypeAdditionalLoan
		return &v
	default:
		return nil
	}
}

func toProtoInboxItem(pt *finance.InboxItem) *financev1.InboxItem {
	var accountID, budgetID, paymentID, transactionID, borrowingID string
	if pt.AccountID != nil {
		accountID = *pt.AccountID
	}
	if pt.BudgetID != nil {
		budgetID = *pt.BudgetID
	}
	if pt.ScheduledPaymentID != nil {
		paymentID = *pt.ScheduledPaymentID
	}
	if pt.TransactionID != nil {
		transactionID = *pt.TransactionID
	}
	if pt.BorrowingID != nil {
		borrowingID = *pt.BorrowingID
	}

	var txDate *timestamppb.Timestamp
	if !pt.TransactionDate.IsZero() {
		txDate = timestamppb.New(pt.TransactionDate)
	}

	protoMeta := make(map[string]string)
	if pt.Metadata != nil {
		for k, v := range pt.Metadata {
			protoMeta[k] = fmt.Sprintf("%v", v)
		}
	}

	return &financev1.InboxItem{
		Id:                 pt.ID,
		SpaceId:            pt.SpaceID,
		IntegrationId:      pt.IntegrationID,
		Status:             toProtoInboxStatus(pt.Status),
		DocType:            toProtoInboxDocType(pt.DocType),
		Amount:             pt.Amount,
		Currency:           pt.Currency,
		VendorName:         pt.VendorName,
		TransactionDate:    txDate,
		AccountId:          accountID,
		BudgetId:           budgetID,
		ScheduledPaymentId: paymentID,
		TransactionId:      transactionID,
		BorrowingId:        conv.Ptr(borrowingID),
		BorrowingLinkType:  toProtoBorrowingLinkType(pt.BorrowingLinkType),
		RawPayload:         pt.RawPayload,
		Metadata:           protoMeta,
		CreateTime:         timestamppb.New(pt.CreateTime),
	}
}

func toDomainInboxItem(pb *financev1.InboxItem) *finance.InboxItem {
	var accountID, budgetID, paymentID, transactionID, borrowingID *string
	if pb.GetAccountId() != "" {
		val := pb.GetAccountId()
		accountID = &val
	}
	if pb.GetBudgetId() != "" {
		val := pb.GetBudgetId()
		budgetID = &val
	}
	if pb.GetScheduledPaymentId() != "" {
		val := pb.GetScheduledPaymentId()
		paymentID = &val
	}
	if pb.GetTransactionId() != "" {
		val := pb.GetTransactionId()
		transactionID = &val
	}
	if pb.GetBorrowingId() != "" {
		val := pb.GetBorrowingId()
		borrowingID = &val
	}

	var txDate time.Time
	if pb.GetTransactionDate() != nil {
		txDate = pb.GetTransactionDate().AsTime()
	}

	domainMeta := make(map[string]any)
	if pb.GetMetadata() != nil {
		for k, v := range pb.GetMetadata() {
			if v == "true" {
				domainMeta[k] = true
			} else if v == "false" {
				domainMeta[k] = false
			} else {
				domainMeta[k] = v
			}
		}
	}

	return &finance.InboxItem{
		ID:                 pb.GetId(),
		SpaceID:            pb.GetSpaceId(),
		IntegrationID:      pb.GetIntegrationId(),
		Status:             toDomainInboxStatus(pb.GetStatus()),
		DocType:            toDomainInboxDocType(pb.GetDocType()),
		Amount:             pb.GetAmount(),
		Currency:           pb.GetCurrency(),
		VendorName:         pb.GetVendorName(),
		TransactionDate:    txDate,
		AccountID:          accountID,
		BudgetID:           budgetID,
		ScheduledPaymentID: paymentID,
		TransactionID:      transactionID,
		BorrowingID:        borrowingID,
		BorrowingLinkType:  toDomainBorrowingLinkType(pb.GetBorrowingLinkType()),
		RawPayload:         pb.GetRawPayload(),
		Metadata:           domainMeta,
	}
}

func (h *Handler) UpdateInboxItem(ctx context.Context, req *financev1.UpdateInboxItemRequest) (*financev1.InboxItem, error) {
	if req.GetId() == "" {
		return nil, status.Error(codes.InvalidArgument, "id is required")
	}
	if req.GetInboxItem() == nil {
		return nil, status.Error(codes.InvalidArgument, "inbox_item is required")
	}

	domainItem := toDomainInboxItem(req.GetInboxItem())
	domainItem.ID = req.GetId()

	res, err := h.Coordinator.UpdateInboxItem(ctx, domainItem)
	if err != nil {
		return nil, h.mapError(err)
	}

	return toProtoInboxItem(res), nil
}

func (h *Handler) ListInboxItems(ctx context.Context, req *financev1.ListInboxItemsRequest) (*financev1.ListInboxItemsResponse, error) {
	spaceIDStr, ok := auth.SpaceIDFromContext(ctx)
	if !ok {
		return nil, status.Error(codes.Unauthenticated, "missing space-id context")
	}
	spaceID := finance.SpaceID(spaceIDStr)

	var status *finance.InboxItemStatus
	if req.Status != nil {
		sVal := toDomainInboxStatus(*req.Status)
		if sVal != "" {
			status = &sVal
		}
	}

	var docType *finance.InboxItemDocType
	if req.DocType != nil {
		dVal := toDomainInboxDocType(*req.DocType)
		docType = &dVal
	}

	var searchQuery *string
	if req.SearchQuery != nil {
		sVal := req.GetSearchQuery()
		searchQuery = &sVal
	}

	excludePayload := req.GetView() == financev1.InboxItem_BASIC

	filter := &finance.ListInboxItemsFilter{
		PageSize:       req.GetPageSize(),
		NextPageToken:  req.GetPageToken(),
		SearchQuery:    searchQuery,
		Status:         status,
		DocType:        docType,
		Sort:           sorting.Parse(req.GetSort()),
		ExcludePayload: excludePayload,
	}

	page, err := h.Aggregator.ListInboxItems(ctx, spaceID, *filter)
	if err != nil {
		return nil, h.mapError(err)
	}

	protoList := make([]*financev1.InboxItem, len(page.Items))
	for idx, pt := range page.Items {
		protoList[idx] = toProtoInboxItem(pt)
	}

	return &financev1.ListInboxItemsResponse{
		InboxItems:    protoList,
		NextPageToken: page.NextPageToken,
	}, nil
}

func (h *Handler) ApproveInboxItem(ctx context.Context, req *financev1.ApproveInboxItemRequest) (*financev1.InboxItem, error) {
	if req.GetId() == "" {
		return nil, status.Error(codes.InvalidArgument, "id is required")
	}

	item, err := h.Coordinator.ApproveInboxItem(ctx, req.GetId())
	if err != nil {
		return nil, h.mapError(err)
	}

	return toProtoInboxItem(item), nil
}

func (h *Handler) DiscardInboxItem(ctx context.Context, req *financev1.DiscardInboxItemRequest) (*emptypb.Empty, error) {
	if req.GetId() == "" {
		return nil, status.Error(codes.InvalidArgument, "id is required")
	}

	err := h.Coordinator.DiscardInboxItem(ctx, req.GetId())
	if err != nil {
		return nil, h.mapError(err)
	}

	return &emptypb.Empty{}, nil
}
