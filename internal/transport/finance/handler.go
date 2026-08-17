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

func toProtoStatus(s finance.BudgetStatus) financev1.Budget_Status {
	switch s {
	case finance.BudgetStatusActive:
		return financev1.Budget_ACTIVE
	case finance.BudgetStatusPaused:
		return financev1.Budget_PAUSED
	case finance.BudgetStatusClosed:
		return financev1.Budget_CLOSED
	default:
		return financev1.Budget_STATUS_UNSPECIFIED
	}
}

func toDomainStatus(s financev1.Budget_Status) finance.BudgetStatus {
	switch s {
	case financev1.Budget_ACTIVE:
		return finance.BudgetStatusActive
	case financev1.Budget_PAUSED:
		return finance.BudgetStatusPaused
	case financev1.Budget_CLOSED:
		return finance.BudgetStatusClosed
	default:
		return finance.BudgetStatusActive
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
		Status:           toProtoStatus(b.Status),
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
		Status:           toDomainStatus(pb.GetStatus()),
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

	var searchQuery *string
	if req.SearchQuery != nil {
		val := req.GetSearchQuery()
		searchQuery = &val
	}

	viewType := financeaggregator.ViewBasic
	if req.GetView() == financev1.Budget_FULL {
		viewType = financeaggregator.ViewFull
	}

	var domainStatuses []finance.BudgetStatus
	for _, st := range req.GetStatuses() {
		ds := toDomainStatus(st)
		if ds != "" {
			domainStatuses = append(domainStatuses, ds)
		}
	}

	page, err := h.Aggregator.ListBudgets(ctx, spaceID, financeaggregator.ListBudgetsFilter{
		ListBudgetsFilter: finance.ListBudgetsFilter{
			PageSize:      int32(pageSize),
			NextPageToken: req.GetPageToken(),
			Statuses:      domainStatuses,
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
	case errors.Is(err, finance.ErrScheduledTransactionNotFound):
		return status.Error(codes.NotFound, "scheduled transaction not found")
	case errors.Is(err, finance.ErrBorrowingNotFound):
		return status.Error(codes.NotFound, "borrowing not found")
	case errors.Is(err, finance.ErrRepaymentNotFound):
		return status.Error(codes.NotFound, "borrowing repayment not found")
	case errors.Is(err, finance.ErrBudgetVersionMismatch), errors.Is(err, finance.ErrAccountVersionMismatch), errors.Is(err, finance.ErrInstitutionVersionMismatch), errors.Is(err, finance.ErrBorrowingVersionMismatch), errors.Is(err, finance.ErrRecurringTransactionVersionMismatch), errors.Is(err, finance.ErrStatementVersionMismatch), errors.Is(err, finance.ErrStatementLineVersionMismatch):
		return status.Error(codes.Aborted, err.Error())
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

func (h *Handler) CreateIncome(ctx context.Context, req *financev1.CreateIncomeRequest) (*financev1.Transaction, error) {
	income := req.GetIncome()
	if income == nil {
		return nil, status.Error(codes.InvalidArgument, "income details are required")
	}

	currency, err := finance.ParseCurrency(income.GetCurrency())
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}

	var transactionDate time.Time
	if income.GetTransactionDate() != nil {
		transactionDate = income.GetTransactionDate().AsTime()
	} else {
		transactionDate = time.Now().UTC()
	}

	var effectiveDate time.Time
	if income.GetEffectiveDate() != nil {
		effectiveDate = income.GetEffectiveDate().AsTime()
	} else {
		effectiveDate = transactionDate
	}

	var accountID *finance.AccountID
	if income.AccountId != nil {
		idVal := finance.AccountID(*income.AccountId)
		accountID = &idVal
	}

	appReq := &financeapp.CreateIncomeRequest{
		Amount:          income.GetAmount(),
		Currency:        currency,
		Description:     income.GetDescription(),
		TransactionDate: transactionDate,
		EffectiveDate:   effectiveDate,
		AccountID:       accountID,
	}

	txn, err := h.Coordinator.CreateIncome(ctx, appReq)
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

func (h *Handler) UpdateIncome(ctx context.Context, req *financev1.UpdateIncomeRequest) (*financev1.Transaction, error) {
	income := req.GetIncome()
	if income == nil {
		return nil, status.Error(codes.InvalidArgument, "income details are required")
	}

	currency, err := finance.ParseCurrency(income.GetCurrency())
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}

	var transactionDate time.Time
	if income.GetTransactionDate() != nil {
		transactionDate = income.GetTransactionDate().AsTime()
	}

	var effectiveDate time.Time
	if income.GetEffectiveDate() != nil {
		effectiveDate = income.GetEffectiveDate().AsTime()
	}

	tID, err := finance.ParseTransactionID(req.GetId())
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}

	var accountID *finance.AccountID
	if income.AccountId != nil {
		idVal := finance.AccountID(*income.AccountId)
		accountID = &idVal
	}

	appReq := &financeapp.UpdateIncomeRequest{
		TransactionID:   tID,
		Amount:          income.GetAmount(),
		Currency:        currency,
		Description:     income.GetDescription(),
		TransactionDate: transactionDate,
		EffectiveDate:   effectiveDate,
		AccountID:       accountID,
	}

	txn, err := h.Coordinator.UpdateIncome(ctx, appReq)
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
		budgetID = new(finance.BudgetID(req.GetBudgetId()))
	}

	var txnTypes []finance.TransactionType
	for _, pt := range req.GetTypes() {
		switch pt {
		case financev1.Transaction_EXPENSE:
			txnTypes = append(txnTypes, finance.TransactionTypeExpense)
		case financev1.Transaction_INCOME:
			txnTypes = append(txnTypes, finance.TransactionTypeIncome)
		case financev1.Transaction_TRANSFER_OUT:
			txnTypes = append(txnTypes, finance.TransactionTypeTransferOut)
		case financev1.Transaction_TRANSFER_IN:
			txnTypes = append(txnTypes, finance.TransactionTypeTransferIn)
		case financev1.Transaction_BALANCE_ADJUSTMENT:
			txnTypes = append(txnTypes, finance.TransactionTypeBalanceAdjustment)
		}
	}

	var accountID *finance.AccountID
	if req.AccountId != nil {
		accountID = new(finance.AccountID(*req.AccountId))
	}

	var searchQuery *string
	if req.SearchQuery != nil {
		searchQuery = new(req.GetSearchQuery())
	}

	var transferID *finance.TransferID
	if req.TransferId != nil {
		transferID = new(finance.TransferID(*req.TransferId))
	}

	var scheduledTransactionID *finance.ScheduledTransactionID
	if req.ScheduledTransactionId != nil && *req.ScheduledTransactionId != "" {
		scheduledTransactionID = new(finance.ScheduledTransactionID(*req.ScheduledTransactionId))
	}

	var borrowingID *finance.BorrowingID
	if req.BorrowingId != nil && *req.BorrowingId != "" {
		borrowingID = new(finance.BorrowingID(*req.BorrowingId))
	}

	filter := finance.TransactionFilter{
		BudgetID:               budgetID,
		Types:                  txnTypes,
		AccountID:              accountID,
		TransferID:             transferID,
		ScheduledTransactionID: scheduledTransactionID,
		BorrowingID:            borrowingID,
		PageSize:               req.GetPageSize(),
		NextPageToken:          req.GetPageToken(),
		Sort:                   sorting.Parse(req.GetSort()),
		SearchQuery:            searchQuery,
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
	if t.Metadata.ScheduledTransactionID != nil {
		metaMap["scheduled_transaction_id"] = string(*t.Metadata.ScheduledTransactionID)
	}
	if t.Metadata.RecurringTransactionID != nil {
		metaMap["recurring_transaction_id"] = string(*t.Metadata.RecurringTransactionID)
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
	if t.Metadata.Reconciled {
		metaMap["reconciled"] = "true"
	}
	if t.Metadata.ReconciliationStatementID != "" {
		metaMap["reconciliation_statement_id"] = t.Metadata.ReconciliationStatementID
	}
	if t.Metadata.ReconciledAt != nil {
		metaMap["reconciled_at"] = t.Metadata.ReconciledAt.Format(time.RFC3339)
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

func toProtoInsightsResponse(in *finance.Insights) *financev1.GetInsightsResponse {
	if in == nil {
		return &financev1.GetInsightsResponse{}
	}

	var spentProto *financev1.SpentInsights
	if in.Spent != nil {
		trendPoints := make([]*financev1.SpentInsights_TrendDataPoint, 0, len(in.Spent.Trend))
		for _, pt := range in.Spent.Trend {
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

		dists := make([]*financev1.SpentInsights_BudgetUsage, 0, len(in.Spent.Distributions))
		for _, d := range in.Spent.Distributions {
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

		tops := make([]*financev1.SpentInsights_HighValueExpense, 0, len(in.Spent.TopExpenses))
		for _, t := range in.Spent.TopExpenses {
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

		spentProto = &financev1.SpentInsights{
			TotalLimit:      in.Spent.TotalLimit,
			TotalSpent:      in.Spent.TotalSpent,
			RemainingBudget: in.Spent.RemainingBudget,
			BurnRate:        in.Spent.BurnRate,
			Trend:           trendPoints,
			Distributions:   dists,
			TopExpenses:     tops,
		}
	}

	var incomeProto *financev1.IncomeInsights
	if in.Income != nil {
		incTrend := make([]*financev1.IncomeInsights_TrendDataPoint, 0, len(in.Income.Trend))
		for _, pt := range in.Income.Trend {
			contrs := make([]*financev1.IncomeInsights_AccountContribution, 0, len(pt.Contributions))
			for _, c := range pt.Contributions {
				contrs = append(contrs, &financev1.IncomeInsights_AccountContribution{
					AccountId:     c.AccountID,
					AccountName:   c.AccountName,
					AmountInBase:  c.AmountInBase,
					AmountInLocal: c.AmountInLocal,
					LocalCurrency: c.LocalCurrency,
				})
			}
			incTrend = append(incTrend, &financev1.IncomeInsights_TrendDataPoint{
				Label:            pt.Label,
				StartDate:        pt.StartDate,
				AmountInBase:     pt.AmountInBase,
				TransactionCount: pt.TransactionCount,
				Contributions:    contrs,
			})
		}

		incDists := make([]*financev1.IncomeInsights_IncomeSource, 0, len(in.Income.Distributions))
		for _, d := range in.Income.Distributions {
			incDists = append(incDists, &financev1.IncomeInsights_IncomeSource{
				Name:         d.Name,
				Amount:       d.Amount,
				AmountInBase: d.AmountInBase,
				Percentage:   d.Percentage,
			})
		}

		incTops := make([]*financev1.IncomeInsights_HighValueIncome, 0, len(in.Income.TopIncomes))
		for _, t := range in.Income.TopIncomes {
			incTops = append(incTops, &financev1.IncomeInsights_HighValueIncome{
				TransactionId:   t.TransactionID,
				Description:     t.Description,
				Amount:          t.Amount,
				Currency:        t.Currency,
				AmountInBase:    t.AmountInBase,
				TransactionDate: timestamppb.New(t.TransactionDate),
				EffectiveDate:   timestamppb.New(t.EffectiveDate),
			})
		}

		incomeProto = &financev1.IncomeInsights{
			TotalIncome:   in.Income.TotalIncome,
			Trend:         incTrend,
			Distributions: incDists,
			TopIncomes:    incTops,
		}
	}

	return &financev1.GetInsightsResponse{
		Spent:  spentProto,
		Income: incomeProto,
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

func toProtoInstitution(i *finance.Institution) *financev1.Institution {
	if i == nil {
		return nil
	}
	return &financev1.Institution{
		Id:         string(i.ID),
		Name:       i.Name,
		Domain:     i.Domain,
		LogoUrl:    i.LogoURL,
		Color:      i.Color,
		Version:    i.Version,
		CreateTime: timestamppb.New(i.CreateTime),
		UpdateTime: timestamppb.New(i.UpdateTime),
	}
}

func toProtoAccountInstitutionInfo(i *finance.Institution) *financev1.Account_InstitutionInfo {
	if i == nil {
		return nil
	}
	return &financev1.Account_InstitutionInfo{
		Id:      string(i.ID),
		Name:    i.Name,
		Domain:  i.Domain,
		LogoUrl: i.LogoURL,
		Color:   i.Color,
	}
}

func toProtoAccount(a *finance.Account) *financev1.Account {
	if a == nil {
		return nil
	}
	var instID *string
	if a.InstitutionID != nil {
		str := string(*a.InstitutionID)
		instID = &str
	}
	return &financev1.Account{
		Id:             string(a.ID),
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
		InstitutionId:  instID,
		Version:        a.Version,
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
		InstitutionID:  account.GetInstitutionId(),
	}

	acc, err := h.Coordinator.CreateAccount(ctx, appReq)
	if err != nil {
		return nil, h.mapError(err)
	}

	return toProtoAccount(acc), nil
}

func toProtoAggregatedAccount(a *financeaggregator.AggregatedAccount, viewType financeaggregator.ViewType) *financev1.Account {
	if a == nil {
		return nil
	}
	pbAcc := toProtoAccount(a.Account)
	if a.Institution != nil {
		pbAcc.Institution = toProtoAccountInstitutionInfo(a.Institution)
	}
	if viewType == financeaggregator.ViewFull {
		pbAcc.Conversion = &financev1.Account_Conversion{
			Balance: a.BalanceInBase,
			Rate:    a.ExchangeRateToBase,
		}
	}
	return pbAcc
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

	return toProtoAggregatedAccount(a, viewType), nil
}

func (h *Handler) UpdateAccount(ctx context.Context, req *financev1.UpdateAccountRequest) (*financev1.Account, error) {
	account := req.GetAccount()
	if account == nil {
		return nil, status.Error(codes.InvalidArgument, "account resource is required")
	}

	idStr := req.GetId()
	if idStr == "" {
		idStr = account.GetId()
	}

	aID, err := finance.ParseAccountID(idStr)
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}

	var mask []string
	if req.UpdateMask != nil {
		mask = req.UpdateMask.Paths
	}

	appReq := &financeapp.UpdateAccountRequest{
		ID:            aID,
		Name:          account.GetName(),
		CreditLimit:   account.GetCreditLimit(),
		IsDefault:     account.GetIsDefault(),
		IsActive:      account.GetIsActive(),
		Color:         account.GetColor(),
		Notes:         account.GetNotes(),
		LastFour:      account.GetLastFour(),
		InstitutionID: account.GetInstitutionId(),
		Mask:          mask,
		Version:       req.GetVersion(),
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

	opts := finance.DeleteOptions{Version: req.GetVersion()}
	if err := h.Coordinator.DeleteAccount(ctx, aID, opts); err != nil {
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
		protoAccounts = append(protoAccounts, toProtoAggregatedAccount(a, viewType))
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
	if pt.ScheduledTransactionID != nil {
		paymentID = *pt.ScheduledTransactionID
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
		Id:                     pt.ID,
		SpaceId:                pt.SpaceID,
		IntegrationId:          pt.IntegrationID,
		Status:                 toProtoInboxStatus(pt.Status),
		DocType:                toProtoInboxDocType(pt.DocType),
		Amount:                 pt.Amount,
		Currency:               pt.Currency,
		VendorName:             pt.VendorName,
		TransactionDate:        txDate,
		AccountId:              accountID,
		BudgetId:               budgetID,
		ScheduledTransactionId: paymentID,
		TransactionId:          transactionID,
		BorrowingId:            conv.Ptr(borrowingID),
		BorrowingLinkType:      toProtoBorrowingLinkType(pt.BorrowingLinkType),
		RawPayload:             pt.RawPayload,
		Metadata:               protoMeta,
		CreateTime:             timestamppb.New(pt.CreateTime),
	}
}

func toDomainInboxItem(pb *financev1.InboxItem) *finance.InboxItem {
	var accountID, budgetID, paymentID, transactionID, borrowingID *string
	if pb.GetAccountId() != "" {
		accountID = new(pb.GetAccountId())
	}
	if pb.GetBudgetId() != "" {
		budgetID = new(pb.GetBudgetId())
	}
	if pb.GetScheduledTransactionId() != "" {
		paymentID = new(pb.GetScheduledTransactionId())
	}
	if pb.GetTransactionId() != "" {
		transactionID = new(pb.GetTransactionId())
	}
	if pb.GetBorrowingId() != "" {
		borrowingID = new(pb.GetBorrowingId())
	}

	var txDate time.Time
	if pb.GetTransactionDate() != nil {
		txDate = pb.GetTransactionDate().AsTime()
	}

	domainMeta := make(map[string]any)
	if pb.GetMetadata() != nil {
		for k, v := range pb.GetMetadata() {
			switch v {
			case "true":
				domainMeta[k] = true
			case "false":
				domainMeta[k] = false
			default:
				domainMeta[k] = v
			}
		}
	}

	return &finance.InboxItem{
		ID:                     pb.GetId(),
		SpaceID:                pb.GetSpaceId(),
		IntegrationID:          pb.GetIntegrationId(),
		Status:                 toDomainInboxStatus(pb.GetStatus()),
		DocType:                toDomainInboxDocType(pb.GetDocType()),
		Amount:                 pb.GetAmount(),
		Currency:               pb.GetCurrency(),
		VendorName:             pb.GetVendorName(),
		TransactionDate:        txDate,
		AccountID:              accountID,
		BudgetID:               budgetID,
		ScheduledTransactionID: paymentID,
		TransactionID:          transactionID,
		BorrowingID:            borrowingID,
		BorrowingLinkType:      toDomainBorrowingLinkType(pb.GetBorrowingLinkType()),
		RawPayload:             pb.GetRawPayload(),
		Metadata:               domainMeta,
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
			status = new(sVal)
		}
	}

	var docType *finance.InboxItemDocType
	if req.DocType != nil {
		docType = new(toDomainInboxDocType(*req.DocType))
	}

	var searchQuery *string
	if req.SearchQuery != nil {
		searchQuery = new(req.GetSearchQuery())
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

func (h *Handler) CreateInstitution(ctx context.Context, req *financev1.CreateInstitutionRequest) (*financev1.Institution, error) {
	pbInst := req.GetInstitution()
	if pbInst == nil {
		return nil, status.Error(codes.InvalidArgument, "institution resource is required")
	}

	inst := &finance.Institution{
		Name:    pbInst.GetName(),
		Domain:  pbInst.GetDomain(),
		LogoURL: pbInst.GetLogoUrl(),
		Color:   pbInst.GetColor(),
	}

	created, err := h.Coordinator.CreateInstitution(ctx, inst)
	if err != nil {
		return nil, h.mapError(err)
	}

	return toProtoInstitution(created), nil
}

func (h *Handler) UpdateInstitution(ctx context.Context, req *financev1.UpdateInstitutionRequest) (*financev1.Institution, error) {
	pbInst := req.GetInstitution()
	if pbInst == nil {
		return nil, status.Error(codes.InvalidArgument, "institution resource is required")
	}

	iid := finance.InstitutionID(req.GetId())
	if err := iid.Validate(); err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}

	var version int64
	if req.Version != nil {
		version = req.GetVersion()
	}

	incoming := &finance.Institution{
		ID:      iid,
		Name:    pbInst.GetName(),
		Domain:  pbInst.GetDomain(),
		LogoURL: pbInst.GetLogoUrl(),
		Color:   pbInst.GetColor(),
		Version: version,
	}

	var mask []string
	if req.GetUpdateMask() != nil {
		mask = req.GetUpdateMask().GetPaths()
	}

	updated, err := h.Coordinator.UpdateInstitution(ctx, incoming, mask)
	if err != nil {
		return nil, h.mapError(err)
	}

	return toProtoInstitution(updated), nil
}

func (h *Handler) DeleteInstitution(ctx context.Context, req *financev1.DeleteInstitutionRequest) (*emptypb.Empty, error) {
	iid := finance.InstitutionID(req.GetId())
	if err := iid.Validate(); err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}

	var version int64
	if req.Version != nil {
		version = req.GetVersion()
	}

	if err := h.Coordinator.DeleteInstitution(ctx, iid, finance.DeleteOptions{Version: version}); err != nil {
		return nil, h.mapError(err)
	}

	return &emptypb.Empty{}, nil
}

func (h *Handler) ListInstitutions(ctx context.Context, req *financev1.ListInstitutionsRequest) (*financev1.ListInstitutionsResponse, error) {
	spaceIDStr, ok := auth.SpaceIDFromContext(ctx)
	if !ok {
		return nil, status.Error(codes.Unauthenticated, "missing space-id context")
	}
	spaceID := finance.SpaceID(spaceIDStr)

	filter := &finance.ListInstitutionsFilter{
		PageSize:      req.GetPageSize(),
		NextPageToken: req.GetPageToken(),
	}
	if req.SearchQuery != nil {
		filter.SearchQuery = req.SearchQuery
	}

	page, err := h.Aggregator.ListInstitutions(ctx, spaceID, filter)
	if err != nil {
		return nil, h.mapError(err)
	}

	items := make([]*financev1.Institution, len(page.Items))
	for i, item := range page.Items {
		items[i] = toProtoInstitution(item)
	}

	return &financev1.ListInstitutionsResponse{
		Institutions:  items,
		NextPageToken: page.NextPageToken,
	}, nil
}

func (h *Handler) ResolveInstitution(ctx context.Context, req *financev1.ResolveInstitutionRequest) (*financev1.ResolveInstitutionResponse, error) {
	if req.GetName() == "" {
		return nil, status.Error(codes.InvalidArgument, "name is required")
	}

	res, err := h.Coordinator.ResolveInstitution(ctx, req.GetName())
	if err != nil {
		return nil, h.mapError(err)
	}

	resp := &financev1.ResolveInstitutionResponse{
		Name:    res.Name,
		Domain:  res.Domain,
		LogoUrl: res.LogoURL,
		Color:   res.Color,
	}

	if res.ExistingInstitutionID != nil {
		exID := string(*res.ExistingInstitutionID)
		resp.ExistingInstitutionId = &exID
		resp.ExistingInstitutionName = &res.ExistingInstitutionName
	}

	return resp, nil
}

// Statement Reconciliation Handlers

func (h *Handler) ImportStatement(ctx context.Context, req *financev1.ImportStatementRequest) (*financev1.Statement, error) {
	if req.AccountId == "" {
		return nil, status.Error(codes.InvalidArgument, "account_id is required")
	}
	if req.Statement == nil {
		return nil, status.Error(codes.InvalidArgument, "statement details are required")
	}

	var stmtDate time.Time
	if req.Statement.StatementDate != "" {
		if t, err := time.Parse("2006-01-02", req.Statement.StatementDate); err == nil {
			stmtDate = t
		} else if t, err := time.Parse(time.RFC3339, req.Statement.StatementDate); err == nil {
			stmtDate = t
		}
	}

	var domainConfig finance.StatementConfig
	if req.Statement.Config != nil {
		if csvProto := req.Statement.Config.GetCsv(); csvProto != nil {
			domainConfig.Format = "CSV"
			domainConfig.CSV = &finance.CSVMapping{
				DateColumnIndex:        csvProto.DateColumnIndex,
				DescriptionColumnIndex: csvProto.DescriptionColumnIndex,
				AmountColumnIndex:      csvProto.AmountColumnIndex,
				DebitColumnIndex:       csvProto.DebitColumnIndex,
				CreditColumnIndex:      csvProto.CreditColumnIndex,
				ReferenceColumnIndex:   csvProto.ReferenceColumnIndex,
				HasHeader:              csvProto.HasHeader,
				Delimiter:              csvProto.Delimiter,
				DateFormat:             csvProto.DateFormat,
			}
		}
	}

	domainStmt := &finance.Statement{
		StatementDate:            stmtDate,
		StatementStartingBalance: req.Statement.StatementStartingBalance,
		StatementEndingBalance:   req.Statement.StatementEndingBalance,
		Filename:                 req.Statement.Filename,
		Config:                   domainConfig,
		RawContent:               req.Statement.RawContent,
	}

	res, err := h.Coordinator.ImportStatement(ctx, finance.AccountID(req.AccountId), domainStmt)
	if err != nil {
		return nil, h.mapError(err)
	}

	return toProtoStatement(res), nil
}

func (h *Handler) GetStatement(ctx context.Context, req *financev1.GetStatementRequest) (*financev1.Statement, error) {
	if req.Id == "" {
		return nil, status.Error(codes.InvalidArgument, "id is required")
	}

	spaceIDStr, ok := auth.SpaceIDFromContext(ctx)
	if !ok {
		return nil, status.Error(codes.Unauthenticated, "space_id not found in context")
	}
	spaceID := finance.SpaceID(spaceIDStr)

	res, err := h.Aggregator.GetStatement(ctx, spaceID, finance.StatementID(req.Id))
	if err != nil {
		return nil, h.mapError(err)
	}

	return toProtoStatement(res), nil
}

func (h *Handler) DeleteStatement(ctx context.Context, req *financev1.DeleteStatementRequest) (*emptypb.Empty, error) {
	if req.Id == "" {
		return nil, status.Error(codes.InvalidArgument, "id is required")
	}

	opts := finance.DeleteOptions{Version: req.GetVersion()}
	err := h.Coordinator.DeleteStatement(ctx, finance.StatementID(req.Id), opts)
	if err != nil {
		return nil, h.mapError(err)
	}

	return &emptypb.Empty{}, nil
}

func (h *Handler) ListStatements(ctx context.Context, req *financev1.ListStatementsRequest) (*financev1.ListStatementsResponse, error) {
	spaceIDStr, ok := auth.SpaceIDFromContext(ctx)
	if !ok {
		return nil, status.Error(codes.Unauthenticated, "space_id not found in context")
	}
	spaceID := finance.SpaceID(spaceIDStr)

	filter := &finance.ListStatementsFilter{
		PageSize:  req.PageSize,
		PageToken: req.PageToken,
	}

	if req.AccountId != nil && *req.AccountId != "" {
		aID := finance.AccountID(*req.AccountId)
		filter.AccountID = &aID
	}

	if req.Status != nil {
		var dStatus finance.StatementStatus
		switch *req.Status {
		case financev1.Statement_IN_PROGRESS:
			dStatus = finance.StatementStatusInProgress
		case financev1.Statement_COMPLETED:
			dStatus = finance.StatementStatusCompleted
		default:
			dStatus = ""
		}
		if dStatus != "" {
			filter.Status = &dStatus
		}
	}

	page, err := h.Aggregator.ListStatements(ctx, spaceID, filter)
	if err != nil {
		return nil, h.mapError(err)
	}

	protoStatements := make([]*financev1.Statement, len(page.Items))
	for i, s := range page.Items {
		protoStatements[i] = toProtoStatement(s)
	}

	return &financev1.ListStatementsResponse{
		Statements:    protoStatements,
		NextPageToken: page.NextPageToken,
	}, nil
}

func (h *Handler) ListStatementLines(ctx context.Context, req *financev1.ListStatementLinesRequest) (*financev1.ListStatementLinesResponse, error) {
	if req.StatementId == "" {
		return nil, status.Error(codes.InvalidArgument, "statement_id is required")
	}

	spaceIDStr, ok := auth.SpaceIDFromContext(ctx)
	if !ok {
		return nil, status.Error(codes.Unauthenticated, "space_id not found in context")
	}
	spaceID := finance.SpaceID(spaceIDStr)

	lines, err := h.Aggregator.ListStatementLines(ctx, spaceID, finance.StatementID(req.StatementId))
	if err != nil {
		return nil, h.mapError(err)
	}

	protoLines := make([]*financev1.StatementLine, len(lines))
	for i, l := range lines {
		protoLines[i] = toProtoStatementLine(l)
	}

	return &financev1.ListStatementLinesResponse{
		Lines: protoLines,
	}, nil
}

func (h *Handler) UpdateStatementLine(ctx context.Context, req *financev1.UpdateStatementLineRequest) (*financev1.StatementLine, error) {
	if req.StatementLine == nil || req.Id == "" {
		return nil, status.Error(codes.InvalidArgument, "statement line with valid id is required")
	}

	var maskPaths []string
	if req.UpdateMask != nil {
		hasAction := false
		for _, p := range req.UpdateMask.Paths {
			if strings.HasPrefix(p, "match") {
				if !hasAction {
					maskPaths = append(maskPaths, "action", "matched_transaction_id")
					hasAction = true
				}
			} else if strings.HasPrefix(p, "create_") || strings.HasPrefix(p, "confirm_") || strings.HasPrefix(p, "skip") || p == "action" {
				if !hasAction {
					maskPaths = append(maskPaths, "action")
					hasAction = true
				}
			} else {
				maskPaths = append(maskPaths, p)
			}
		}
	}

	req.StatementLine.Id = req.Id
	domainLine := toDomainStatementLine(req.StatementLine)
	if req.Version != nil {
		domainLine.Version = req.GetVersion()
	}
	res, err := h.Coordinator.UpdateStatementLine(ctx, domainLine, maskPaths)
	if err != nil {
		return nil, h.mapError(err)
	}

	return toProtoStatementLine(res), nil
}

func (h *Handler) UpdateStatement(ctx context.Context, req *financev1.UpdateStatementRequest) (*financev1.Statement, error) {
	if req.Statement == nil || req.Id == "" {
		return nil, status.Error(codes.InvalidArgument, "statement with valid id is required")
	}

	var maskPaths []string
	if req.UpdateMask != nil {
		maskPaths = req.UpdateMask.Paths
	}

	req.Statement.Id = req.Id
	domainStmt := toDomainStatement(req.Statement)
	if req.Version != nil {
		domainStmt.Version = req.GetVersion()
	}
	res, err := h.Coordinator.UpdateStatement(ctx, domainStmt, maskPaths)
	if err != nil {
		return nil, h.mapError(err)
	}

	return toProtoStatement(res), nil
}

func (h *Handler) CompleteStatement(ctx context.Context, req *financev1.CompleteStatementRequest) (*financev1.Statement, error) {
	if req.Id == "" {
		return nil, status.Error(codes.InvalidArgument, "id is required")
	}

	res, err := h.Coordinator.CompleteStatement(ctx, finance.StatementID(req.Id))
	if err != nil {
		return nil, h.mapError(err)
	}

	return toProtoStatement(res), nil
}

// Mappers

func toProtoStatement(s *finance.Statement) *financev1.Statement {
	if s == nil {
		return nil
	}
	var protoStatus financev1.Statement_Status
	switch s.Status {
	case finance.StatementStatusInProgress:
		protoStatus = financev1.Statement_IN_PROGRESS
	case finance.StatementStatusCompleted:
		protoStatus = financev1.Statement_COMPLETED
	default:
		protoStatus = financev1.Statement_STATUS_UNSPECIFIED
	}

	var protoConfig *financev1.Statement_Config
	if s.Config.Format == "CSV" && s.Config.CSV != nil {
		m := s.Config.CSV
		protoConfig = &financev1.Statement_Config{
			Format: &financev1.Statement_Config_Csv{
				Csv: &financev1.Statement_Config_CsvConfig{
					HasHeader:              m.HasHeader,
					Delimiter:              m.Delimiter,
					DateFormat:             m.DateFormat,
					DateColumnIndex:        m.DateColumnIndex,
					DescriptionColumnIndex: m.DescriptionColumnIndex,
					ReferenceColumnIndex:   m.ReferenceColumnIndex,
					AmountColumnIndex:      m.AmountColumnIndex,
					DebitColumnIndex:       m.DebitColumnIndex,
					CreditColumnIndex:      m.CreditColumnIndex,
				},
			},
		}
	}

	return &financev1.Statement{
		Id:                       string(s.ID),
		SpaceId:                  string(s.SpaceID),
		AccountId:                string(s.AccountID),
		Status:                   protoStatus,
		StatementDate:            s.StatementDate.Format("2006-01-02"),
		StatementStartingBalance: s.StatementStartingBalance,
		StatementEndingBalance:   s.StatementEndingBalance,
		Filename:                 s.Filename,
		Config:                   protoConfig,
		RawContent:               s.RawContent,
		CreateTime:               timestamppb.New(s.CreateTime),
		UpdateTime:               timestamppb.New(s.UpdateTime),
		Version:                  s.Version,
	}
}

func toProtoStatementLine(l *finance.StatementLine) *financev1.StatementLine {
	if l == nil {
		return nil
	}
	var protoStatus financev1.StatementLine_Status
	switch l.Status {
	case finance.StatementLineStatusUnmatched:
		protoStatus = financev1.StatementLine_UNMATCHED
	case finance.StatementLineStatusMatched:
		protoStatus = financev1.StatementLine_MATCHED
	case finance.StatementLineStatusImported:
		protoStatus = financev1.StatementLine_IMPORTED
	case finance.StatementLineStatusSkipped:
		protoStatus = financev1.StatementLine_SKIPPED
	default:
		protoStatus = financev1.StatementLine_STATUS_UNSPECIFIED
	}

	var matchedTxnID *string
	if l.MatchedTransactionID != nil {
		s := string(*l.MatchedTransactionID)
		matchedTxnID = &s
	}

	res := &financev1.StatementLine{
		Id:                   string(l.ID),
		StatementId:          string(l.StatementID),
		RowIndex:             l.RowIndex,
		DateStr:              l.DateStr,
		Description:          l.Description,
		Amount:               l.Amount,
		Status:               protoStatus,
		MatchedTransactionId: matchedTxnID,
		Reference:            l.Reference,
		Version:              l.Version,
	}

	// Map Action oneof
	switch l.Action.Type {
	case finance.StatementLineActionTypeMatch:
		var txnID string
		if l.Action.TransactionID != nil {
			txnID = string(*l.Action.TransactionID)
		}
		res.Action = &financev1.StatementLine_Match{
			Match: &financev1.StatementLine_MatchAction{
				TransactionId:        txnID,
				OverwriteTransaction: l.Action.OverwriteTransaction,
			},
		}
	case finance.StatementLineActionTypeCreateExpense:
		var bID string
		if l.Action.BudgetID != nil {
			bID = string(*l.Action.BudgetID)
		}
		res.Action = &financev1.StatementLine_CreateExpense{
			CreateExpense: &financev1.StatementLine_CreateExpenseAction{
				BudgetId: bID,
			},
		}
	case finance.StatementLineActionTypeCreateIncome:
		res.Action = &financev1.StatementLine_CreateIncome{
			CreateIncome: &financev1.StatementLine_CreateIncomeAction{},
		}
	case finance.StatementLineActionTypeCreateTransfer:
		var destID string
		if l.Action.CounterpartAccountID != nil {
			destID = string(*l.Action.CounterpartAccountID)
		}
		res.Action = &financev1.StatementLine_CreateTransfer{
			CreateTransfer: &financev1.StatementLine_CreateTransferAction{
				CounterpartAccountId: destID,
			},
		}
	case finance.StatementLineActionTypeConfirmScheduled:
		var sID string
		if l.Action.ScheduledTransactionID != nil {
			sID = string(*l.Action.ScheduledTransactionID)
		}
		res.Action = &financev1.StatementLine_ConfirmScheduled{
			ConfirmScheduled: &financev1.StatementLine_ConfirmScheduledAction{
				ScheduledTransactionId: sID,
			},
		}
	case finance.StatementLineActionTypeCreateRepayment:
		var borID string
		if l.Action.BorrowingID != nil {
			borID = string(*l.Action.BorrowingID)
		}
		res.Action = &financev1.StatementLine_CreateRepayment{
			CreateRepayment: &financev1.StatementLine_CreateRepaymentAction{
				BorrowingId: borID,
			},
		}
	case finance.StatementLineActionTypeSkip:
		res.Action = &financev1.StatementLine_Skip{
			Skip: &financev1.StatementLine_SkipAction{},
		}
	}

	// Map suggestions
	if l.Suggestions != nil {
		var protoType financev1.Transaction_Type
		switch l.Suggestions.TransactionType {
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

		var bID *string
		if l.Suggestions.BudgetID != nil {
			s := string(*l.Suggestions.BudgetID)
			bID = &s
		}

		var protoMatches []*financev1.Transaction
		for _, t := range l.Suggestions.Matches {
			protoMatches = append(protoMatches, toProtoTransaction(t))
		}

		res.Suggestions = &financev1.StatementLine_Suggestions{
			TransactionType: protoType,
			BudgetId:        bID,
			Matches:         protoMatches,
		}
	}

	return res
}

func toDomainAction(pb *financev1.StatementLine) finance.StatementLineAction {
	if pb == nil {
		return finance.StatementLineAction{Type: finance.StatementLineActionTypePending}
	}
	if pb.GetMatch() != nil {
		var txnID *finance.TransactionID
		if idStr := pb.GetMatch().GetTransactionId(); idStr != "" {
			tID := finance.TransactionID(idStr)
			txnID = &tID
		}
		return finance.StatementLineAction{
			Type:                 finance.StatementLineActionTypeMatch,
			TransactionID:        txnID,
			OverwriteTransaction: pb.GetMatch().OverwriteTransaction,
		}
	}
	if pb.GetCreateExpense() != nil {
		var bID *finance.BudgetID
		if idStr := pb.GetCreateExpense().GetBudgetId(); idStr != "" {
			parsed := finance.BudgetID(idStr)
			bID = &parsed
		}
		return finance.StatementLineAction{
			Type:     finance.StatementLineActionTypeCreateExpense,
			BudgetID: bID,
		}
	}
	if pb.GetCreateIncome() != nil {
		return finance.StatementLineAction{
			Type: finance.StatementLineActionTypeCreateIncome,
		}
	}
	if pb.GetCreateTransfer() != nil {
		var accID *finance.AccountID
		if idStr := pb.GetCreateTransfer().GetCounterpartAccountId(); idStr != "" {
			parsed := finance.AccountID(idStr)
			accID = &parsed
		}
		return finance.StatementLineAction{
			Type:                 finance.StatementLineActionTypeCreateTransfer,
			CounterpartAccountID: accID,
		}
	}
	if pb.GetConfirmScheduled() != nil {
		var sID *finance.ScheduledTransactionID
		if idStr := pb.GetConfirmScheduled().GetScheduledTransactionId(); idStr != "" {
			parsed := finance.ScheduledTransactionID(idStr)
			sID = &parsed
		}
		return finance.StatementLineAction{
			Type:                   finance.StatementLineActionTypeConfirmScheduled,
			ScheduledTransactionID: sID,
		}
	}
	if pb.GetCreateRepayment() != nil {
		var borID *finance.BorrowingID
		if idStr := pb.GetCreateRepayment().GetBorrowingId(); idStr != "" {
			parsed := finance.BorrowingID(idStr)
			borID = &parsed
		}
		return finance.StatementLineAction{
			Type:        finance.StatementLineActionTypeCreateRepayment,
			BorrowingID: borID,
		}
	}
	if pb.GetSkip() != nil {
		return finance.StatementLineAction{
			Type: finance.StatementLineActionTypeSkip,
		}
	}
	return finance.StatementLineAction{Type: finance.StatementLineActionTypePending}
}

func toDomainStatementLine(pb *financev1.StatementLine) *finance.StatementLine {
	if pb == nil {
		return nil
	}
	var status finance.StatementLineStatus
	switch pb.Status {
	case financev1.StatementLine_UNMATCHED:
		status = finance.StatementLineStatusUnmatched
	case financev1.StatementLine_MATCHED:
		status = finance.StatementLineStatusMatched
	case financev1.StatementLine_IMPORTED:
		status = finance.StatementLineStatusImported
	case financev1.StatementLine_SKIPPED:
		status = finance.StatementLineStatusSkipped
	default:
		status = finance.StatementLineStatusUnmatched
	}

	var matchedTxnID *finance.TransactionID
	if pb.MatchedTransactionId != nil && *pb.MatchedTransactionId != "" {
		id := finance.TransactionID(*pb.MatchedTransactionId)
		matchedTxnID = &id
	} else if pb.GetMatch() != nil && pb.GetMatch().GetTransactionId() != "" {
		id := finance.TransactionID(pb.GetMatch().GetTransactionId())
		matchedTxnID = &id
	}

	return &finance.StatementLine{
		ID:                   finance.StatementLineID(pb.Id),
		StatementID:          finance.StatementID(pb.StatementId),
		RowIndex:             pb.RowIndex,
		DateStr:              pb.DateStr,
		Description:          pb.Description,
		Amount:               pb.Amount,
		Reference:            pb.Reference,
		Action:               toDomainAction(pb),
		Status:               status,
		MatchedTransactionID: matchedTxnID,
		Version:              pb.Version,
	}
}

func toDomainStatement(pb *financev1.Statement) *finance.Statement {
	if pb == nil {
		return nil
	}
	var stmtDate time.Time
	if pb.StatementDate != "" {
		if t, err := time.Parse("2006-01-02", pb.StatementDate); err == nil {
			stmtDate = t
		} else if t, err := time.Parse(time.RFC3339, pb.StatementDate); err == nil {
			stmtDate = t
		}
	}

	return &finance.Statement{
		ID:                       finance.StatementID(pb.Id),
		SpaceID:                  finance.SpaceID(pb.SpaceId),
		AccountID:                finance.AccountID(pb.AccountId),
		StatementDate:            stmtDate,
		StatementStartingBalance: pb.StatementStartingBalance,
		StatementEndingBalance:   pb.StatementEndingBalance,
		Filename:                 pb.Filename,
		RawContent:               pb.RawContent,
		Version:                  pb.Version,
	}
}
