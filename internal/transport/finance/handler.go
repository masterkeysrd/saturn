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
	financeapp "github.com/masterkeysrd/saturn/internal/application/finance"
	"github.com/masterkeysrd/saturn/internal/domain/finance"
)

// Handler implements the financev1.FinanceServer interface.
type Handler struct {
	financev1.UnimplementedFinanceServer
	Coordinator *financeapp.Coordinator
}

// NewHandler creates a new Handler.
func NewHandler(coordinator *financeapp.Coordinator) *Handler {
	return &Handler{Coordinator: coordinator}
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
	return &financev1.Budget{
		Id:          string(b.ID),
		SpaceId:     string(b.SpaceID),
		Name:        b.Name,
		LimitAmount: b.LimitAmount,
		Currency:    string(b.Currency),
		Interval:    toProtoInterval(b.Interval),
		IsActive:    b.IsActive,
		CreateTime:  timestamppb.New(b.CreateTime),
		UpdateTime:  timestamppb.New(b.UpdateTime),
		Icon:        b.Icon,
		Color:       b.Color,
	}
}

func toProtoBudgetPeriod(p *finance.BudgetPeriod) *financev1.BudgetPeriod {
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

func (h *Handler) CreateBudget(ctx context.Context, req *financev1.CreateBudgetRequest) (*financev1.Budget, error) {
	currency, err := finance.ParseCurrency(req.GetCurrency())
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}

	appReq := &financeapp.CreateBudgetRequest{
		Name:        req.GetName(),
		LimitAmount: req.GetLimitAmount(),
		Currency:    currency,
		Interval:    toDomainInterval(req.GetInterval()),
		Icon:        req.GetIcon(),
		Color:       req.GetColor(),
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

	appReq := &financeapp.UpdateBudgetRequest{
		ID:          finance.BudgetID(req.GetId()),
		Name:        req.GetName(),
		LimitAmount: req.GetLimitAmount(),
		Currency:    currency,
		Interval:    toDomainInterval(req.GetInterval()),
		IsActive:    req.GetIsActive(),
		Propagation: toDomainPropagation(req.GetPropagation()),
		Icon:        req.GetIcon(),
		Color:       req.GetColor(),
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
	appReq := &financeapp.ListBudgetsRequest{
		PageSize:  req.GetPageSize(),
		PageToken: req.GetPageToken(),
	}

	budgets, nextToken, err := h.Coordinator.ListBudgets(ctx, appReq)
	if err != nil {
		return nil, h.mapError(err)
	}

	protoBudgets := make([]*financev1.Budget, 0, len(budgets))
	for _, b := range budgets {
		protoBudgets = append(protoBudgets, toProtoBudget(b))
	}

	return &financev1.ListBudgetsResponse{
		Budgets:       protoBudgets,
		NextPageToken: nextToken,
	}, nil
}

func (h *Handler) GetBudgetPeriod(ctx context.Context, req *financev1.GetBudgetPeriodRequest) (*financev1.BudgetPeriod, error) {
	var targetDate time.Time
	if req.GetDate() != nil {
		targetDate = req.GetDate().AsTime()
	}

	appReq := &financeapp.GetBudgetPeriodRequest{
		BudgetID: finance.BudgetID(req.GetBudgetId()),
		Date:     targetDate,
	}

	period, err := h.Coordinator.GetBudgetPeriod(ctx, appReq)
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

	appReq := &financeapp.CreateExpenseRequest{
		BudgetID:        finance.BudgetID(expense.GetBudgetId()),
		Amount:          expense.GetAmount(),
		Currency:        currency,
		Description:     expense.GetDescription(),
		TransactionDate: transactionDate,
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

	tID, err := finance.ParseTransactionID(req.GetId())
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}

	appReq := &financeapp.UpdateExpenseRequest{
		TransactionID:   tID,
		BudgetID:        finance.BudgetID(expense.GetBudgetId()),
		Amount:          expense.GetAmount(),
		Currency:        currency,
		Description:     expense.GetDescription(),
		TransactionDate: transactionDate,
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
	var budgetID *finance.BudgetID
	if req.GetBudgetId() != "" {
		bID := finance.BudgetID(req.GetBudgetId())
		budgetID = &bID
	}

	var txnType *finance.TransactionType
	if req.GetType() != financev1.TransactionType_TRANSACTION_TYPE_UNSPECIFIED {
		var t finance.TransactionType
		switch req.GetType() {
		case financev1.TransactionType_EXPENSE:
			t = finance.TransactionTypeExpense
		case financev1.TransactionType_INCOME:
			t = finance.TransactionTypeIncome
		}
		txnType = &t
	}

	appReq := &financeapp.ListTransactionsRequest{
		BudgetID:      budgetID,
		Type:          txnType,
		PageSize:      req.GetPageSize(),
		NextPageToken: req.GetPageToken(),
	}

	txns, nextToken, err := h.Coordinator.ListTransactions(ctx, appReq)
	if err != nil {
		return nil, h.mapError(err)
	}

	protoTxns := make([]*financev1.Transaction, 0, len(txns))
	for _, t := range txns {
		protoTxns = append(protoTxns, toProtoTransaction(t))
	}

	return &financev1.ListTransactionsResponse{
		Transactions:  protoTxns,
		NextPageToken: nextToken,
	}, nil
}

func toProtoTransaction(t *finance.Transaction) *financev1.Transaction {
	if t == nil {
		return nil
	}
	var protoType financev1.TransactionType
	switch t.Type {
	case finance.TransactionTypeExpense:
		protoType = financev1.TransactionType_EXPENSE
	case finance.TransactionTypeIncome:
		protoType = financev1.TransactionType_INCOME
	default:
		protoType = financev1.TransactionType_TRANSACTION_TYPE_UNSPECIFIED
	}

	var budgetID, periodID string
	if t.BudgetID != nil {
		budgetID = string(*t.BudgetID)
	}
	if t.PeriodID != nil {
		periodID = string(*t.PeriodID)
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
		CreateTime:      timestamppb.New(t.CreateTime),
		UpdateTime:      timestamppb.New(t.UpdateTime),
	}
}
