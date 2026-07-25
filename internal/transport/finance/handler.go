package finance

import (
	"context"
	"errors"
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

func toProtoInterval(interval finance.RecurrenceInterval) financev1.RecurrenceInterval {
	switch interval {
	case finance.IntervalWeekly:
		return financev1.RecurrenceInterval_INTERVAL_WEEKLY
	case finance.IntervalYearly:
		return financev1.RecurrenceInterval_INTERVAL_YEARLY
	case finance.IntervalMonthly:
		return financev1.RecurrenceInterval_INTERVAL_MONTHLY
	default:
		return financev1.RecurrenceInterval_RECURRENCE_INTERVAL_UNSPECIFIED
	}
}

func toDomainInterval(interval financev1.RecurrenceInterval) finance.RecurrenceInterval {
	switch interval {
	case financev1.RecurrenceInterval_INTERVAL_WEEKLY:
		return finance.IntervalWeekly
	case financev1.RecurrenceInterval_INTERVAL_YEARLY:
		return finance.IntervalYearly
	case financev1.RecurrenceInterval_INTERVAL_MONTHLY:
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
	}
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
	currency, err := finance.ParseCurrency(req.GetCurrency())
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}

	var defaultAccountID *finance.AccountID
	if req.DefaultAccountId != nil {
		idVal := finance.AccountID(*req.DefaultAccountId)
		defaultAccountID = &idVal
	}

	appReq := &financeapp.CreateBudgetRequest{
		Name:             req.GetName(),
		LimitAmount:      req.GetLimitAmount(),
		Currency:         currency,
		Interval:         toDomainInterval(req.GetInterval()),
		Icon:             req.GetIcon(),
		Color:            req.GetColor(),
		DefaultAccountID: defaultAccountID,
	}

	budget, err := h.Coordinator.CreateBudget(ctx, appReq)
	if err != nil {
		return nil, h.mapError(err)
	}

	return toProtoBudget(budget), nil
}

func (h *Handler) UpdateBudget(ctx context.Context, req *financev1.UpdateBudgetRequest) (*financev1.Budget, error) {
	currency, err := finance.ParseCurrency(req.GetCurrency())
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}

	var defaultAccountID *finance.AccountID
	if req.DefaultAccountId != nil {
		idVal := finance.AccountID(*req.DefaultAccountId)
		defaultAccountID = &idVal
	}

	appReq := &financeapp.UpdateBudgetRequest{
		ID:               finance.BudgetID(req.GetId()),
		Name:             req.GetName(),
		LimitAmount:      req.GetLimitAmount(),
		Currency:         currency,
		Interval:         toDomainInterval(req.GetInterval()),
		IsActive:         req.GetIsActive(),
		Propagation:      toDomainPropagation(req.GetPropagation()),
		Icon:             req.GetIcon(),
		Color:            req.GetColor(),
		DefaultAccountID: defaultAccountID,
	}

	budget, err := h.Coordinator.UpdateBudget(ctx, appReq)
	if err != nil {
		return nil, h.mapError(err)
	}

	return toProtoBudget(budget), nil
}

func (h *Handler) DeleteBudget(ctx context.Context, req *financev1.DeleteBudgetRequest) (*emptypb.Empty, error) {
	if err := h.Coordinator.DeleteBudget(ctx, finance.BudgetID(req.GetId())); err != nil {
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
	var targetDate time.Time
	if req.GetDate() != nil {
		targetDate = req.GetDate().AsTime()
	} else {
		targetDate = time.Now()
	}

	bID := finance.BudgetID(req.GetBudgetId())
	period, err := h.Aggregator.GetBudgetPeriod(ctx, bID, targetDate)
	if err != nil {
		return nil, h.mapError(err)
	}

	return toProtoBudgetPeriod(period), nil
}

func (h *Handler) CreateExchangeRate(ctx context.Context, req *financev1.CreateExchangeRateRequest) (*financev1.ExchangeRate, error) {
	if req.GetRateDate() == nil {
		return nil, status.Error(codes.InvalidArgument, "rate date is required")
	}

	fromCurrency, err := finance.ParseCurrency(req.GetFromCurrency())
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}
	toCurrency, err := finance.ParseCurrency(req.GetToCurrency())
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}

	appReq := &financeapp.CreateExchangeRateRequest{
		FromCurrency: fromCurrency,
		ToCurrency:   toCurrency,
		Rate:         req.GetRate(),
		RateDate:     req.GetRateDate().AsTime(),
	}

	rate, err := h.Coordinator.CreateExchangeRate(ctx, appReq)
	if err != nil {
		return nil, h.mapError(err)
	}

	return toProtoExchangeRate(rate), nil
}

func (h *Handler) ListExchangeRates(ctx context.Context, req *financev1.ListExchangeRatesRequest) (*financev1.ListExchangeRatesResponse, error) {
	appReq := &financeapp.ListExchangeRatesRequest{
		PageSize:  req.GetPageSize(),
		PageToken: req.GetPageToken(),
	}

	rates, nextToken, err := h.Coordinator.ListExchangeRates(ctx, appReq)
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
	if req.GetRateDate() == nil {
		return nil, status.Error(codes.InvalidArgument, "rate date is required")
	}

	fromCurrency, err := finance.ParseCurrency(req.GetFromCurrency())
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}
	toCurrency, err := finance.ParseCurrency(req.GetToCurrency())
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}

	appReq := &financeapp.DeleteExchangeRateRequest{
		FromCurrency: fromCurrency,
		ToCurrency:   toCurrency,
		RateDate:     req.GetRateDate().AsTime(),
	}

	err = h.Coordinator.DeleteExchangeRate(ctx, appReq)
	if err != nil {
		return nil, h.mapError(err)
	}

	return &emptypb.Empty{}, nil
}

func toProtoExchangeRate(rate *finance.ExchangeRate) *financev1.ExchangeRate {
	if rate == nil {
		return nil
	}
	return &financev1.ExchangeRate{
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
	}

	var effectiveDate time.Time
	if expense.GetEffectiveDate() != nil {
		effectiveDate = expense.GetEffectiveDate().AsTime()
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

	filter := finance.ListTransactionsFilter{
		BudgetID:      budgetID,
		Type:          txnType,
		SourceType:    req.SourceType,
		SourceID:      req.SourceId,
		AccountID:     accountID,
		PageSize:      req.GetPageSize(),
		NextPageToken: req.GetPageToken(),
		Sort:          sorting.Parse(req.GetSort()),
		SearchQuery:   searchQuery,
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
	default:
		protoType = financev1.Transaction_TYPE_UNSPECIFIED
	}

	var budgetID, periodID, accountID, transferID string
	if t.BudgetID != nil {
		budgetID = string(*t.BudgetID)
	}
	if t.PeriodID != nil {
		periodID = string(*t.PeriodID)
	}
	if t.AccountID != nil {
		accountID = string(*t.AccountID)
	}
	if t.TransferID != nil {
		transferID = string(*t.TransferID)
	}

	var accountIDPtr, transferIDPtr *string
	if accountID != "" {
		accountIDPtr = &accountID
	}
	if transferID != "" {
		transferIDPtr = &transferID
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
		SourceType:      t.SourceType,
		SourceId:        t.SourceID,
		AccountId:       accountIDPtr,
		TransferId:      transferIDPtr,
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

func toProtoInboxItem(pt *finance.InboxItem) *financev1.InboxItem {
	var accountID, budgetID, paymentID, transactionID string
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

	var txDate *timestamppb.Timestamp
	if !pt.TransactionDate.IsZero() {
		txDate = timestamppb.New(pt.TransactionDate)
	}

	return &financev1.InboxItem{
		Id:                 pt.ID,
		SpaceId:            pt.SpaceID,
		IntegrationId:      pt.IntegrationID,
		Status:             string(pt.Status),
		DocType:            string(pt.DocType),
		Amount:             pt.Amount,
		Currency:           pt.Currency,
		VendorName:         pt.VendorName,
		TransactionDate:    txDate,
		AccountId:          accountID,
		BudgetId:           budgetID,
		ScheduledPaymentId: paymentID,
		TransactionId:      transactionID,
		RawPayload:         pt.RawPayload,
		MetadataJson:       pt.MetadataJSON,
		CreateTime:         timestamppb.New(pt.CreateTime),
	}
}

func (h *Handler) ListInboxItems(ctx context.Context, req *financev1.ListInboxItemsRequest) (*financev1.ListInboxItemsResponse, error) {
	list, err := h.Coordinator.ListInboxItems(ctx)
	if err != nil {
		return nil, h.mapError(err)
	}

	protoList := make([]*financev1.InboxItem, len(list))
	for idx, pt := range list {
		protoList[idx] = toProtoInboxItem(pt)
	}

	return &financev1.ListInboxItemsResponse{InboxItems: protoList}, nil
}

func (h *Handler) ApproveInboxItem(ctx context.Context, req *financev1.ApproveInboxItemRequest) (*financev1.Transaction, error) {
	if req.GetId() == "" {
		return nil, status.Error(codes.InvalidArgument, "id is required")
	}

	params := &finance.ApproveInboxItem{
		ID:                         req.GetId(),
		AccountID:                  req.GetAccountId(),
		BudgetID:                   req.GetBudgetId(),
		ScheduledPaymentID:         req.GetScheduledPaymentId(),
		Amount:                     req.GetAmount(),
		Description:                req.GetDescription(),
		DocType:                    req.GetDocType(),
		DestinationAccountID:       req.GetDestinationAccountId(),
		TransactionType:            req.GetTransactionType(),
		TransactionID:              req.GetTransactionId(),
		OverwriteLinkedTransaction: req.GetOverwriteLinkedTransaction(),
		TransferLeg:                req.GetTransferLeg(),
		Currency:                   req.GetCurrency(),
	}

	tx, err := h.Coordinator.ApproveInboxItem(ctx, params)
	if err != nil {
		return nil, h.mapError(err)
	}

	if tx == nil {
		return &financev1.Transaction{}, nil
	}

	return toProtoTransaction(tx), nil
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
