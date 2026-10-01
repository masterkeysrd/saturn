package finance

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/errors"

	"github.com/masterkeysrd/saturn/internal/platform/id"
	"github.com/masterkeysrd/saturn/internal/platform/log"
	"github.com/masterkeysrd/saturn/internal/platform/paging"
	"github.com/masterkeysrd/saturn/internal/platform/settings"
)

// Dependencies defines the required persistence adapters for the service.
type Dependencies struct {
	Settings                  SettingsClient
	BudgetStore               BudgetStore
	PeriodStore               PeriodStore
	ExchangeRateStore         ExchangeRateStore
	TransactionStore          TransactionStore
	InsightsStore             InsightsStore
	RecurringTransactionStore RecurringTransactionStore
	ScheduledTransactionStore ScheduledTransactionStore
	BorrowingStore            BorrowingStore
	AccountStore              AccountStore
	TransferStore             TransferStore
	TransactionEventStore     TransactionEventStore
	InboxItemStore            InboxItemStore
	InstitutionStore          InstitutionStore
	StatementStore            StatementStore
}

// Service implements the domain-level finance operations.
type Service struct {
	deps Dependencies
}

// NewService instantiates a new Service.
func NewService(deps Dependencies) *Service {
	return &Service{deps: deps}
}

// Setup initializes workspace base currency settings if not already configured.
func (s *Service) Setup(ctx context.Context, spaceID SpaceID, settings *Settings) (*settings.Entry[Settings], error) {
	if err := spaceID.Validate(); err != nil {
		return nil, fmt.Errorf("validate space ID: %w", err)
	}
	if err := settings.Validate(); err != nil {
		return nil, err
	}

	entry, err := s.deps.Settings.Get(ctx, string(spaceID))
	if err == nil {
		// Base currency is immutable once configured
		return entry, nil
	}

	if !errors.Is(err, errors.NotExist) {
		return nil, err
	}

	newEntry := SettingsKey.For(string(spaceID)).Entry(*settings)
	if err := s.deps.Settings.Save(ctx, newEntry); err != nil {
		return nil, err
	}

	// Automatically initialize a default Cash Account for this space
	if defaultCashAcc, err := settings.NewDefaultCashAccount(); err == nil {
		systemCtx := NewRequestContext(spaceID, "system", time.UTC, settings.BaseCurrency)
		if _, err := s.CreateAccount(ctx, systemCtx, defaultCashAcc); err != nil {
			log.Warn(ctx, "failed to create default cash account", log.String("space_id", string(spaceID)), log.Err(err))
		}
	}

	return newEntry, nil
}

// GetSettings retrieves settings for a workspace.
func (s *Service) GetSettings(ctx context.Context, spaceID SpaceID) (*settings.Entry[Settings], error) {
	if string(spaceID) == "" {
		return nil, errors.New("space ID is required")
	}
	entry, err := s.deps.Settings.Get(ctx, string(spaceID))
	if err != nil {
		if errors.Is(err, errors.NotExist) {
			return nil, errors.E(errors.NotExist, SettingsNotFound, "workspace finance settings are not configured")
		}
		return nil, err
	}
	return entry, nil
}

// CreateBudget creates a new budget template in a workspace.
func (s *Service) CreateBudget(ctx context.Context, rCtx Context, budget *Budget) (*Budget, error) {
	if err := budget.Init(); err != nil {
		return nil, err
	}
	if err := budget.Validate(); err != nil {
		return nil, err
	}

	// Verify workspace base currency is configured
	if rCtx.BaseCurrency() == "" {
		return nil, errors.E(errors.Precondition, SettingsNotFound, "workspace base currency is not configured")
	}

	if err := s.deps.BudgetStore.Create(ctx, rCtx, budget); err != nil {
		return nil, err
	}

	return budget, nil
}

// UpdateBudget modifies an existing budget template, optionally applying a field mask.
// If mask is nil or empty, all registered patchable fields are updated.
func (s *Service) UpdateBudget(ctx context.Context, rCtx Context, budget *Budget, mask []string) (*Budget, error) {
	const op errors.Op = "domain/finance.UpdateBudget"

	existing, err := s.deps.BudgetStore.GetByID(ctx, rCtx, budget.ID)
	if err != nil {
		return nil, err
	}

	if budget.Version > 0 && budget.Version != existing.Version {
		return nil, errors.E(op, errors.Conflict, VersionMismatch, "update failed: budget not found or version mismatch")
	}

	if err := existing.ApplyPatch(budget, mask); err != nil {
		return nil, err
	}

	if err := s.deps.BudgetStore.Update(ctx, rCtx, existing); err != nil {
		return nil, err
	}

	return existing, nil
}

// DeleteBudget removes a budget.
func (s *Service) DeleteBudget(ctx context.Context, rCtx Context, id BudgetID, opts DeleteOptions) error {
	const op errors.Op = "domain/finance.DeleteBudget"

	if string(id) == "" {
		return errors.E(op, errors.Invalid, "budget ID is required")
	}

	hasTxns, err := s.deps.TransactionStore.HasTransactions(ctx, rCtx, &TransactionFilter{
		BudgetID: &id,
	})
	if err != nil {
		return err
	}
	if hasTxns {
		return errors.E(op, errors.Precondition, BudgetHasTransactions, "cannot delete budget with existing transactions. deactivate it instead")
	}

	hasScheduled, err := s.deps.ScheduledTransactionStore.HasScheduledTransactions(ctx, rCtx, &ListScheduledTransactionsFilter{
		BudgetID: &id,
	})
	if err != nil {
		return err
	}
	if hasScheduled {
		return errors.E(op, errors.Precondition, BudgetHasScheduledTransactions, "cannot delete budget with active scheduled transactions. cancel or reassign scheduled transactions first")
	}

	return s.deps.BudgetStore.Delete(ctx, rCtx, id, opts)
}

// ListBudgets returns the workspace's budgets.
func (s *Service) ListBudgets(ctx context.Context, rCtx Context, filter *ListBudgetsFilter) (*paging.Page[*Budget], error) {
	if string(rCtx.SpaceID()) == "" {
		return nil, errors.New("space ID is required")
	}
	return s.deps.BudgetStore.ListBySpace(ctx, rCtx, filter)
}

// GetOrCreatePeriod retrieves or lazily spawns a budget period for a target date.
func (s *Service) GetOrCreatePeriod(ctx context.Context, rCtx Context, budgetID BudgetID, date time.Time) (*BudgetPeriod, error) {
	budget, err := s.deps.BudgetStore.GetByID(ctx, rCtx, budgetID)
	if err != nil {
		return nil, err
	}

	if rCtx.BaseCurrency() == "" {
		return nil, errors.E(errors.Precondition, SettingsNotFound, "workspace base currency is not configured")
	}

	startDate, endDate := budget.CalculateBounds(date, rCtx.Location())

	// Try lookup
	period, err := s.deps.PeriodStore.GetByRange(ctx, rCtx, PeriodRangeKey{
		BudgetID:  budgetID,
		StartDate: startDate,
		EndDate:   endDate,
	})
	if err == nil {
		return period, nil
	}
	if !errors.Is(err, errors.NotExist) {
		return nil, err
	}

	// Determine exchange rate to base currency
	rate, err := s.resolveExchangeRate(ctx, rCtx, budget.Currency, rCtx.BaseCurrency(), date, true)
	if err != nil {
		return nil, err
	}

	newPeriod, err := budget.NewPeriod(NewPeriodOpts{
		TargetDate:         date,
		StartDate:          startDate,
		EndDate:            endDate,
		BaseCurrency:       rCtx.BaseCurrency(),
		ExchangeRateToBase: rate,
		Location:           rCtx.Location(),
	})
	if err != nil {
		return nil, err
	}

	if err := s.deps.PeriodStore.Create(ctx, rCtx, newPeriod); err != nil {
		return nil, err
	}

	return newPeriod, nil
}

// GetOrCreatePeriods retrieves or lazily spawns budget periods for a slice of budgets in batch.
func (s *Service) GetOrCreatePeriods(ctx context.Context, rCtx Context, budgets []*Budget, date time.Time) (map[BudgetID]*BudgetPeriod, error) {
	if len(budgets) == 0 {
		return make(map[BudgetID]*BudgetPeriod), nil
	}

	if rCtx.BaseCurrency() == "" {
		return nil, errors.E(errors.Precondition, SettingsNotFound, "workspace base currency is not configured")
	}

	// Calculate bounds for each budget
	keys := make([]PeriodRangeKey, len(budgets))
	boundsMap := make(map[BudgetID]struct{ Start, End time.Time })
	for i, b := range budgets {
		start, end := b.CalculateBounds(date, rCtx.Location())
		keys[i] = PeriodRangeKey{
			BudgetID:  b.ID,
			StartDate: start,
			EndDate:   end,
		}
		boundsMap[b.ID] = struct{ Start, End time.Time }{Start: start, End: end}
	}

	// 1. Bulk-retrieve existing periods in a single DB query
	existingPeriods, err := s.deps.PeriodStore.GetByRanges(ctx, rCtx, keys)
	if err != nil {
		return nil, fmt.Errorf("bulk fetch existing budget periods: %w", err)
	}

	periodsMap := make(map[BudgetID]*BudgetPeriod)
	for _, p := range existingPeriods {
		periodsMap[p.BudgetID] = p
	}

	// 2. Identify missing periods and create them
	for _, b := range budgets {
		if _, exists := periodsMap[b.ID]; exists {
			continue
		}

		bounds := boundsMap[b.ID]

		// Determine exchange rate to base currency
		rate, err := s.resolveExchangeRate(ctx, rCtx, b.Currency, rCtx.BaseCurrency(), date, true)
		if err != nil {
			return nil, err
		}

		newPeriod, err := b.NewPeriod(NewPeriodOpts{
			StartDate:          bounds.Start,
			EndDate:            bounds.End,
			BaseCurrency:       rCtx.BaseCurrency(),
			ExchangeRateToBase: rate,
			Location:           rCtx.Location(),
		})
		if err != nil {
			return nil, err
		}

		if err := s.deps.PeriodStore.Create(ctx, rCtx, newPeriod); err != nil {
			return nil, fmt.Errorf("create budget period: %w", err)
		}

		periodsMap[b.ID] = newPeriod
	}

	return periodsMap, nil
}

// AggregateSpentBatch calculates dynamic transaction spent progress for a list of budget period IDs.
func (s *Service) AggregateSpentBatch(ctx context.Context, rCtx Context, periodIDs []PeriodID) ([]PeriodSpent, error) {
	return s.deps.TransactionStore.AggregateSpentBatch(ctx, rCtx, periodIDs)
}

// UpdatePeriodLimit modifies the budget limit of a specific period.
func (s *Service) UpdatePeriodLimit(ctx context.Context, rCtx Context, id PeriodID, limit int64) error {
	if limit <= 0 {
		return errors.New("limit must be greater than zero")
	}
	return s.deps.PeriodStore.UpdateLimit(ctx, rCtx, id, limit)
}

// CreateExchangeRate registers a new daily rate record.
func (s *Service) CreateExchangeRate(ctx context.Context, rCtx Context, rate *ExchangeRate) (*ExchangeRate, error) {
	rate.RateDate = rCtx.Date(rate.RateDate)
	if err := rate.Init(); err != nil {
		return nil, err
	}
	if err := rate.Validate(); err != nil {
		return nil, fmt.Errorf("validate exchange rate: %w", err)
	}

	if err := s.deps.ExchangeRateStore.Create(ctx, rCtx, rate); err != nil {
		return nil, err
	}
	return rate, nil
}

// GetExchangeRateByID retrieves an exact exchange rate record by its ID.
func (s *Service) GetExchangeRateByID(ctx context.Context, rCtx Context, id string) (*ExchangeRate, error) {
	const op errors.Op = "domain/finance.GetExchangeRateByID"

	if err := rCtx.SpaceID().Validate(); err != nil {
		return nil, errors.E(op, errors.Invalid, err)
	}
	from, to, t, err := ParseExchangeRateID(id)
	if err != nil {
		return nil, errors.E(op, errors.NotExist, ExchangeRateNotFound, err)
	}
	key := ExchangeRateKey{
		FromCurrency: from,
		ToCurrency:   to,
		RateDate:     t,
	}
	return s.deps.ExchangeRateStore.GetExactRate(ctx, rCtx, key)
}

// UpdateExchangeRate corrects the multiplier on an existing exchange rate record.
func (s *Service) UpdateExchangeRate(ctx context.Context, rCtx Context, id string, rate *ExchangeRate) (*ExchangeRate, error) {
	const op errors.Op = "domain/finance.UpdateExchangeRate"

	if err := rCtx.SpaceID().Validate(); err != nil {
		return nil, errors.E(op, errors.Invalid, err)
	}

	from, to, t, err := ParseExchangeRateID(id)
	if err != nil {
		return nil, errors.E(op, errors.NotExist, ExchangeRateNotFound, err)
	}

	existing, err := s.deps.ExchangeRateStore.GetExactRate(ctx, rCtx, ExchangeRateKey{
		FromCurrency: from,
		ToCurrency:   to,
		RateDate:     t,
	})
	if err != nil {
		return nil, err
	}

	existing.Rate = rate.Rate
	if err := existing.Validate(); err != nil {
		return nil, errors.E(op, errors.Invalid, err)
	}

	if err := s.deps.ExchangeRateStore.Update(ctx, rCtx, existing); err != nil {
		return nil, err
	}
	return existing, nil
}

// ListExchangeRates retrieves paginated rate records.
func (s *Service) ListExchangeRates(ctx context.Context, rCtx Context, filter *ListExchangeRatesFilter) ([]*ExchangeRate, string, error) {
	if err := rCtx.SpaceID().Validate(); err != nil {
		return nil, "", fmt.Errorf("validate space ID: %w", err)
	}
	return s.deps.ExchangeRateStore.ListBySpace(ctx, rCtx, filter)
}

// DeleteExchangeRateByID removes a daily rate conversion rule by ID.
func (s *Service) DeleteExchangeRateByID(ctx context.Context, rCtx Context, id string) error {
	const op errors.Op = "domain/finance.DeleteExchangeRateByID"

	if err := rCtx.SpaceID().Validate(); err != nil {
		return errors.E(op, errors.Invalid, err)
	}
	from, to, t, err := ParseExchangeRateID(id)
	if err != nil {
		return errors.E(op, errors.NotExist, ExchangeRateNotFound, err)
	}
	key := ExchangeRateKey{
		FromCurrency: from,
		ToCurrency:   to,
		RateDate:     t,
	}
	return s.deps.ExchangeRateStore.Delete(ctx, rCtx, key)
}

// getExchangeRate resolves the exchange rate for the given key.
// It first looks for the closest rate on or before the target date (backward).
// If no such rate exists, it falls back to the closest rate after the target date (forward fallback).
func (s *Service) getExchangeRate(ctx context.Context, rCtx Context, key ExchangeRateKey) (*ExchangeRate, error) {
	rateRecord, err := s.deps.ExchangeRateStore.GetRate(ctx, rCtx, key)
	if err == nil {
		return rateRecord, nil
	}
	if !errors.Is(err, errors.NotExist) {
		return nil, err
	}

	return s.deps.ExchangeRateStore.GetNextRate(ctx, rCtx, key)
}

// resolveExchangeRate returns 1.0 for matching currencies, or queries the exchange rate store for cross-currency rates.
// If allowNotFoundFallback is true and no rate is configured, it returns 0.0 without failing.
func (s *Service) resolveExchangeRate(ctx context.Context, rCtx Context, from, to Currency, date time.Time, allowNotFoundFallback bool) (float64, error) {
	const op errors.Op = "domain/finance.resolveExchangeRate"
	if from == to {
		return 1.0, nil
	}
	rateRecord, err := s.getExchangeRate(ctx, rCtx, ExchangeRateKey{
		FromCurrency: from,
		ToCurrency:   to,
		RateDate:     rCtx.Date(date),
	})
	if err != nil {
		if errors.Is(err, errors.NotExist) {
			if allowNotFoundFallback {
				return 0.0, nil
			}
			return 0.0, errors.E(op, errors.NotExist, ExchangeRateNotFound, "exchange rate not found")
		}
		return 0.0, errors.E(op, err)
	}
	return rateRecord.Rate, nil
}

// CreateExpense logs a new expense transaction.
func (s *Service) CreateExpense(ctx context.Context, rCtx Context, txn *Transaction) (*Transaction, error) {
	txn.Type = TransactionTypeExpense
	if txn.BudgetID == nil {
		return nil, errors.New("expense transaction requires a budget ID")
	}

	if txn.ID == "" {
		tID, err := NewTransactionID()
		if err != nil {
			return nil, err
		}
		txn.ID = tID
	}

	if err := s.createTransaction(ctx, rCtx, txn); err != nil {
		return nil, err
	}
	return txn, nil
}

// CreateIncome logs a new income transaction.
func (s *Service) CreateIncome(ctx context.Context, rCtx Context, txn *Transaction) (*Transaction, error) {
	txn.Type = TransactionTypeIncome
	txn.BudgetID = nil

	if txn.ID == "" {
		tID, err := NewTransactionID()
		if err != nil {
			return nil, err
		}
		txn.ID = tID
	}

	if err := s.createTransaction(ctx, rCtx, txn); err != nil {
		return nil, err
	}
	return txn, nil
}

// GetTransaction retrieves a transaction by ID for a space.
func (s *Service) GetTransaction(ctx context.Context, rCtx Context, id TransactionID) (*Transaction, error) {
	if err := rCtx.SpaceID().Validate(); err != nil {
		return nil, fmt.Errorf("validate space ID: %w", err)
	}
	if err := id.Validate(); err != nil {
		return nil, fmt.Errorf("validate transaction ID: %w", err)
	}
	return s.deps.TransactionStore.GetByID(ctx, rCtx, id)
}

// DeleteTransaction removes any logged transaction and reverts its account balance impact.
func (s *Service) DeleteTransaction(ctx context.Context, rCtx Context, id TransactionID) error {
	if err := rCtx.SpaceID().Validate(); err != nil {
		return fmt.Errorf("validate space ID: %w", err)
	}
	if err := id.Validate(); err != nil {
		return fmt.Errorf("validate transaction ID: %w", err)
	}
	existing, err := s.deps.TransactionStore.GetByID(ctx, rCtx, id)
	if err != nil {
		return fmt.Errorf("fetch existing transaction to delete: %w", err)
	}
	return s.deleteTransaction(ctx, rCtx, existing)
}

// UpdateExpense modifies an existing expense transaction.
func (s *Service) UpdateExpense(ctx context.Context, rCtx Context, txn *Transaction) (*Transaction, error) {
	txn.Type = TransactionTypeExpense
	if txn.BudgetID == nil {
		return nil, errors.New("expense transaction requires a budget ID")
	}

	existing, err := s.deps.TransactionStore.GetByID(ctx, rCtx, txn.ID)
	if err != nil {
		return nil, fmt.Errorf("fetch existing transaction: %w", err)
	}

	if err := s.updateTransaction(ctx, rCtx, txn, existing); err != nil {
		return nil, err
	}

	// Log manual edit transaction event with field diff
	if diff := existing.Diff(txn); len(diff) > 0 {
		_, _ = s.LogTransactionEvent(ctx, rCtx, &TransactionEvent{
			TransactionID: txn.ID,
			EventType:     "MANUAL_EDIT",
			Metadata:      diff,
		})
	}

	return txn, nil
}

// UpdateIncome modifies an existing income transaction.
func (s *Service) UpdateIncome(ctx context.Context, rCtx Context, txn *Transaction) (*Transaction, error) {
	txn.Type = TransactionTypeIncome
	txn.BudgetID = nil

	existing, err := s.deps.TransactionStore.GetByID(ctx, rCtx, txn.ID)
	if err != nil {
		return nil, fmt.Errorf("fetch existing transaction: %w", err)
	}

	if err := s.updateTransaction(ctx, rCtx, txn, existing); err != nil {
		return nil, err
	}

	// Log manual edit transaction event with field diff
	if diff := existing.Diff(txn); len(diff) > 0 {
		_, _ = s.LogTransactionEvent(ctx, rCtx, &TransactionEvent{
			TransactionID: txn.ID,
			EventType:     "MANUAL_EDIT",
			Metadata:      diff,
		})
	}

	return txn, nil
}

// ListTransactions retrieves paginated transactions.
func (s *Service) ListTransactions(ctx context.Context, rCtx Context, filter *TransactionFilter) (*paging.Page[*Transaction], error) {
	if err := rCtx.SpaceID().Validate(); err != nil {
		return nil, fmt.Errorf("validate space ID: %w", err)
	}
	return s.deps.TransactionStore.ListBySpace(ctx, rCtx, filter)
}

// GetSpentInsights computes aggregated outflow analytics and trends for a space.
func (s *Service) GetSpentInsights(ctx context.Context, rCtx Context, req *GetSpentInsightsRequest) (*SpentInsights, error) {
	if rCtx.BaseCurrency() == "" {
		return nil, errors.E(errors.Precondition, SettingsNotFound, "workspace base currency is not configured")
	}

	g, start, end, err := req.ResolveRange(rCtx.Location())
	if err != nil {
		return nil, err
	}

	trendRows, err := s.deps.InsightsStore.GetSpentTrend(ctx, rCtx, &SpentTrendFilter{
		Granularity: g,
		StartDate:   start,
		EndDate:     end,
	})
	if err != nil {
		return nil, fmt.Errorf("fetch spent trend: %w", err)
	}

	distRows, err := s.deps.InsightsStore.GetBudgetDistribution(ctx, rCtx, &BudgetDistributionFilter{
		StartDate: start,
		EndDate:   end,
	})
	if err != nil {
		return nil, fmt.Errorf("fetch budget distributions: %w", err)
	}

	topRows, err := s.deps.InsightsStore.GetTopExpenses(ctx, rCtx, &TopExpensesFilter{
		StartDate: start,
		EndDate:   end,
		Limit:     5,
	})
	if err != nil {
		return nil, fmt.Errorf("fetch top expenses: %w", err)
	}

	return BuildSpentInsights(g, start, end, string(rCtx.BaseCurrency()), trendRows, distRows, topRows), nil
}

// GetIncomeInsights computes aggregated inflow analytics and trends for a space.
func (s *Service) GetIncomeInsights(ctx context.Context, rCtx Context, req *GetSpentInsightsRequest) (*IncomeInsights, error) {
	if rCtx.BaseCurrency() == "" {
		return nil, errors.E(errors.Precondition, SettingsNotFound, "workspace base currency is not configured")
	}

	g, start, end, err := req.ResolveRange(rCtx.Location())
	if err != nil {
		return nil, err
	}

	trendRows, err := s.deps.InsightsStore.GetIncomeTrend(ctx, rCtx, &IncomeTrendFilter{
		Granularity: g,
		StartDate:   start,
		EndDate:     end,
	})
	if err != nil {
		return nil, fmt.Errorf("fetch income trend: %w", err)
	}

	sourceRows, err := s.deps.InsightsStore.GetIncomeSources(ctx, rCtx, &IncomeSourcesFilter{
		StartDate: start,
		EndDate:   end,
	})
	if err != nil {
		return nil, fmt.Errorf("fetch income sources: %w", err)
	}

	topRows, err := s.deps.InsightsStore.GetTopIncomes(ctx, rCtx, &TopIncomesFilter{
		StartDate: start,
		EndDate:   end,
		Limit:     5,
	})
	if err != nil {
		return nil, fmt.Errorf("fetch top incomes: %w", err)
	}

	return BuildIncomeInsights(g, start, end, string(rCtx.BaseCurrency()), trendRows, sourceRows, topRows), nil
}

// CreateRecurringTransaction configures a new recurring transaction rule.
// CreateRecurringTransaction configures a new recurring transaction rule.
func (s *Service) CreateRecurringTransaction(ctx context.Context, rCtx Context, re *RecurringTransaction) (*RecurringTransaction, error) {
	if !re.NextDueDate.IsZero() {
		re.NextDueDate = rCtx.Date(re.NextDueDate)
	}
	if err := re.Init(); err != nil {
		return nil, err
	}
	if err := re.Validate(); err != nil {
		return nil, err
	}

	if err := s.deps.RecurringTransactionStore.Create(ctx, rCtx, re); err != nil {
		return nil, err
	}
	return re, nil
}

// GetRecurringTransaction retrieves a recurring transaction by ID for a space.
func (s *Service) GetRecurringTransaction(ctx context.Context, rCtx Context, id RecurringTransactionID) (*RecurringTransaction, error) {
	if err := rCtx.SpaceID().Validate(); err != nil {
		return nil, err
	}
	if err := id.Validate(); err != nil {
		return nil, err
	}
	return s.deps.RecurringTransactionStore.GetByID(ctx, rCtx, id)
}

// GetRecurringTransactions retrieves a batch of recurring transactions by their IDs for a space.
func (s *Service) GetRecurringTransactions(ctx context.Context, rCtx Context, ids []RecurringTransactionID) ([]*RecurringTransaction, error) {
	if err := rCtx.SpaceID().Validate(); err != nil {
		return nil, err
	}
	for _, id := range ids {
		if err := id.Validate(); err != nil {
			return nil, err
		}
	}
	return s.deps.RecurringTransactionStore.GetByIDs(ctx, rCtx, ids)
}

// UpdateRecurringTransaction modifies an existing recurring transaction template, optionally applying a field mask.
// If mask is nil or empty, all registered patchable fields are updated.
func (s *Service) UpdateRecurringTransaction(ctx context.Context, rCtx Context, re *RecurringTransaction, mask []string) (*RecurringTransaction, error) {
	const op errors.Op = "domain/finance.UpdateRecurringTransaction"

	existing, err := s.deps.RecurringTransactionStore.GetByID(ctx, rCtx, re.ID)
	if err != nil {
		return nil, err
	}

	if re.Version > 0 && re.Version != existing.Version {
		return nil, errors.E(op, errors.Conflict, VersionMismatch, "update failed: recurring transaction not found or version mismatch")
	}

	if err := existing.ApplyPatch(re, mask); err != nil {
		return nil, err
	}

	if !existing.NextDueDate.IsZero() {
		existing.NextDueDate = rCtx.Date(existing.NextDueDate)
	}

	if err := existing.Validate(); err != nil {
		return nil, err
	}

	if err := s.deps.RecurringTransactionStore.Update(ctx, rCtx, existing); err != nil {
		return nil, err
	}
	return existing, nil
}

// DeleteRecurringTransaction deletes a recurring transaction rule.
func (s *Service) DeleteRecurringTransaction(ctx context.Context, rCtx Context, id RecurringTransactionID, opts DeleteOptions) error {
	if err := id.Validate(); err != nil {
		return err
	}
	return s.deps.RecurringTransactionStore.Delete(ctx, rCtx, id, opts)
}

// ListRecurringTransactions lists recurring transactions for a workspace.
func (s *Service) ListRecurringTransactions(ctx context.Context, rCtx Context, filter *ListRecurringTransactionsFilter) (*paging.Page[*RecurringTransaction], error) {
	if err := rCtx.SpaceID().Validate(); err != nil {
		return nil, err
	}
	return s.deps.RecurringTransactionStore.ListBySpace(ctx, rCtx, filter)
}

// ListScheduledTransactions lists scheduled transactions for a workspace.
func (s *Service) ListScheduledTransactions(ctx context.Context, rCtx Context, filter *ListScheduledTransactionsFilter) (*paging.Page[*ScheduledTransaction], error) {
	if err := rCtx.SpaceID().Validate(); err != nil {
		return nil, err
	}
	return s.deps.ScheduledTransactionStore.ListBySpace(ctx, rCtx, filter)
}

// ConfirmScheduledTransactionRequest represents parameters to confirm a scheduled transaction.
type ConfirmScheduledTransactionRequest struct {
	SpaceID         SpaceID
	TransactionID   ScheduledTransactionID
	TransactionDate time.Time
	EffectiveDate   time.Time
	ActualAmount    int64
	Description     string
	AccountID       *AccountID
	BudgetID        *BudgetID
	Currency        *Currency
}

// ConfirmScheduledTransaction clears a scheduled transaction by promoting it to a permanent transaction.
func (s *Service) ConfirmScheduledTransaction(ctx context.Context, rCtx Context, req ConfirmScheduledTransactionRequest) (*Transaction, error) {
	if rCtx.BaseCurrency() == "" {
		return nil, errors.E(errors.Precondition, SettingsNotFound, "workspace base currency is not configured")
	}

	payment, err := s.deps.ScheduledTransactionStore.GetByID(ctx, rCtx, req.TransactionID)
	if err != nil {
		return nil, err
	}

	var budgetID BudgetID
	if payment.BudgetID != nil {
		budgetID = *payment.BudgetID
	}
	if req.BudgetID != nil && *req.BudgetID != "" {
		budgetID = *req.BudgetID
	}

	currency := payment.Currency
	if req.Currency != nil && *req.Currency != "" {
		currency = *req.Currency
	}

	txnDate := req.TransactionDate
	if txnDate.IsZero() {
		txnDate = rCtx.Now()
	} else {
		txnDate = rCtx.Date(txnDate)
	}

	effDate := req.EffectiveDate
	if effDate.IsZero() {
		effDate = txnDate
	} else {
		effDate = rCtx.Date(effDate)
	}

	// Resolve budget period for the transaction based on effectiveDate if type is Expense and budgetID is set
	var period *BudgetPeriod
	if payment.Type == TransactionTypeExpense && budgetID != "" {
		budget, err := s.deps.BudgetStore.GetByID(ctx, rCtx, budgetID)
		if err != nil {
			return nil, err
		}

		period, err = s.GetOrCreatePeriod(ctx, rCtx, budget.ID, effDate)
		if err != nil {
			return nil, err
		}
	}

	actualAmount := req.ActualAmount
	if actualAmount <= 0 {
		actualAmount = payment.Amount
	}

	// Calculate base currency conversion
	rate, err := s.resolveExchangeRate(ctx, rCtx, currency, rCtx.BaseCurrency(), txnDate, false)
	if err != nil {
		return nil, err
	}

	amountInBase := ConvertAmount(actualAmount, rate)

	sourceFallback := ""
	if req.Description == "" && payment.Metadata.Description == "" {
		switch payment.SourceType {
		case string(SourceTypeRecurrentTransaction):
			if exp, err := s.deps.RecurringTransactionStore.GetByID(ctx, rCtx, RecurringTransactionID(payment.SourceID)); err == nil {
				sourceFallback = exp.Name
			}
		case "invoice":
			if item, err := s.deps.InboxItemStore.Get(ctx, rCtx, payment.SourceID); err == nil {
				if item.VendorName != "" {
					sourceFallback = item.VendorName
				}
			}
		}
	}

	description := payment.ResolveDescription(req.Description, sourceFallback)

	var periodID *PeriodID
	if period != nil {
		periodID = &period.ID
	}
	var bID *BudgetID
	if budgetID != "" {
		bID = &budgetID
	}

	var accountID = payment.AccountID
	if req.AccountID != nil {
		accountID = req.AccountID
	}

	txn, err := payment.NewConfirmationTransaction(ConfirmOpts{
		BudgetID:            bID,
		PeriodID:            periodID,
		AccountID:           accountID,
		Amount:              actualAmount,
		Currency:            currency,
		AmountInBase:        amountInBase,
		AccountImpactAmount: actualAmount,
		Description:         description,
		TransactionDate:     txnDate,
		EffectiveDate:       effDate,
	})
	if err != nil {
		return nil, err
	}

	if err := s.deps.TransactionStore.Create(ctx, rCtx, txn); err != nil {
		return nil, err
	}

	if accountID != nil && *accountID != "" {
		if err := s.adjustAccountBalance(ctx, rCtx, *accountID, actualAmount, payment.Type, false); err != nil {
			return nil, fmt.Errorf("failed to adjust account balance: %w", err)
		}
	}

	// Log the historical scheduled event with the deferred creation date
	if _, err = s.LogTransactionEvent(ctx, rCtx, payment.NewScheduledEvent(txn.ID)); err != nil {
		return nil, fmt.Errorf("failed to log scheduled event: %w", err)
	}

	// Log the actual confirmation event with the transaction date
	if _, err = s.LogTransactionEvent(ctx, rCtx, txn.NewConfirmationEvent(actualAmount)); err != nil {
		return nil, fmt.Errorf("failed to log transaction confirmation event: %w", err)
	}

	// Mark scheduled transaction as paid
	if err := payment.MarkPaid(); err != nil {
		return nil, err
	}
	if err := s.deps.ScheduledTransactionStore.Update(ctx, rCtx, payment); err != nil {
		return nil, fmt.Errorf("failed to update scheduled transaction status: %w", err)
	}

	return txn, nil
}

// MatchScheduledTransactionRequest represents parameters to link an existing transaction to a scheduled transaction.
type MatchScheduledTransactionRequest struct {
	SpaceID       SpaceID
	TransactionID ScheduledTransactionID
	MatchedID     TransactionID
}

// MatchScheduledTransaction links an existing transaction with a pending scheduled transaction, marking the transaction cleared.
func (s *Service) MatchScheduledTransaction(ctx context.Context, rCtx Context, req MatchScheduledTransactionRequest) (*Transaction, error) {
	payment, err := s.deps.ScheduledTransactionStore.GetByID(ctx, rCtx, req.TransactionID)
	if err != nil {
		return nil, fmt.Errorf("scheduled transaction not found: %w", err)
	}

	txn, err := s.deps.TransactionStore.GetByID(ctx, rCtx, req.MatchedID)
	if err != nil {
		return nil, fmt.Errorf("transaction not found: %w", err)
	}

	// Update transaction link properties in metadata
	var reID *RecurringTransactionID
	if payment.SourceType == string(SourceTypeRecurrentTransaction) && payment.SourceID != "" {
		reID = new(RecurringTransactionID)
		*reID = RecurringTransactionID(payment.SourceID)
	}
	spID := ScheduledTransactionID(payment.ID)
	txn.LinkScheduledTransaction(spID, reID)

	if err := s.deps.TransactionStore.Update(ctx, rCtx, txn); err != nil {
		return nil, fmt.Errorf("failed to link transaction: %w", err)
	}

	// Log event
	_, err = s.LogTransactionEvent(ctx, rCtx, &TransactionEvent{
		TransactionID: txn.ID,
		EventType:     "SCHEDULED_TRANSACTION_LINKED",
		CreateTime:    time.Now().UTC(),
		Metadata:      map[string]any{"scheduled_transaction_id": string(payment.ID)},
	})
	if err != nil {
		return nil, fmt.Errorf("failed to log match event: %w", err)
	}

	// Mark scheduled transaction as paid
	payment.Status = ScheduledTransactionPaid
	payment.UpdateTime = time.Now().UTC()
	if err := s.deps.ScheduledTransactionStore.Update(ctx, rCtx, payment); err != nil {
		return nil, fmt.Errorf("failed to update scheduled transaction status: %w", err)
	}

	return txn, nil
}

// GetScheduledTransaction retrieves a scheduled transaction by ID for a space.
func (s *Service) GetScheduledTransaction(ctx context.Context, rCtx Context, id ScheduledTransactionID) (*ScheduledTransaction, error) {
	if err := rCtx.SpaceID().Validate(); err != nil {
		return nil, fmt.Errorf("validate space ID: %w", err)
	}
	if err := id.Validate(); err != nil {
		return nil, fmt.Errorf("validate scheduled transaction ID: %w", err)
	}
	return s.deps.ScheduledTransactionStore.GetByID(ctx, rCtx, id)
}

// SkipScheduledTransaction marks a pending scheduled transaction as skipped for a cycle.
func (s *Service) SkipScheduledTransaction(ctx context.Context, rCtx Context, id ScheduledTransactionID) (*ScheduledTransaction, error) {
	const op errors.Op = "domain/finance.SkipScheduledTransaction"

	if err := rCtx.SpaceID().Validate(); err != nil {
		return nil, errors.E(op, errors.Invalid, err)
	}
	if err := id.Validate(); err != nil {
		return nil, errors.E(op, errors.Invalid, err)
	}

	payment, err := s.deps.ScheduledTransactionStore.GetByID(ctx, rCtx, id)
	if err != nil {
		return nil, err
	}

	if err := payment.MarkSkipped(); err != nil {
		return nil, err
	}
	if err := s.deps.ScheduledTransactionStore.UpdateStatus(ctx, rCtx, id, ScheduledTransactionSkipped); err != nil {
		return nil, fmt.Errorf("update scheduled transaction status: %w", err)
	}

	return payment, nil
}

// GenerateScheduledTransactions performs bulk generation of pending scheduled transactions for recurring templates.
func (s *Service) GenerateScheduledTransactions(ctx context.Context) error {
	// Query templates due in next 10 days
	maxDueDate := time.Now().AddDate(0, 0, 10)
	pending, err := s.deps.RecurringTransactionStore.ListPendingGeneration(ctx, maxDueDate)
	if err != nil {
		return err
	}

	for _, item := range pending {
		re := item.Transaction
		// TODO: This is wrong doesn't follow the context pattern and doesn't retrieve the configured timezone.
		rCtx := NewContext(item.SpaceID, "system", time.UTC, re.Currency)
		// Generate all scheduled transactions up to 10 days in the future
		for re.NextDueDate.Before(maxDueDate) || re.NextDueDate.Equal(maxDueDate) {
			spID, err := NewScheduledTransactionID()
			if err != nil {
				return err
			}

			payment, err := re.NewScheduledTransaction(spID)
			if err != nil {
				return err
			}

			if err := s.deps.ScheduledTransactionStore.Create(ctx, rCtx, payment); err != nil {
				return err
			}

			if err := re.AdvanceNextDueDate(); err != nil {
				return err
			}
		}

		if err := s.deps.RecurringTransactionStore.Update(ctx, rCtx, re); err != nil {
			return err
		}
	}

	return nil
}

// createTransaction persists a transaction and adjusts the account balance.
func (s *Service) createTransaction(ctx context.Context, rCtx Context, txn *Transaction) error {
	// 1. Initialize transaction lifecycle defaults
	if err := txn.Init(); err != nil {
		return err
	}
	txn.TransactionDate = rCtx.Date(txn.TransactionDate)
	txn.EffectiveDate = rCtx.Date(txn.EffectiveDate)

	// 2. Verify workspace base currency is configured
	if rCtx.BaseCurrency() == "" {
		return errors.E(errors.Precondition, SettingsNotFound, "workspace base currency is not configured")
	}

	// 3. Centralized Budget Period Resolution
	if txn.BudgetID != nil {
		budget, err := s.deps.BudgetStore.GetByID(ctx, rCtx, *txn.BudgetID)
		if err != nil {
			return fmt.Errorf("fetch budget template: %w", err)
		}
		if err := budget.EnsureActive(); err != nil {
			return err
		}
		period, err := s.GetOrCreatePeriod(ctx, rCtx, budget.ID, txn.EffectiveDate)
		if err != nil {
			return fmt.Errorf("resolve active budget period: %w", err)
		}
		txn.PeriodID = new(period.ID)
	}

	// 4. Centralized Base Currency Exchange Rate Calculation
	if txn.AmountInBase == 0 || txn.Currency != rCtx.BaseCurrency() {
		rate, err := s.resolveExchangeRate(ctx, rCtx, txn.Currency, rCtx.BaseCurrency(), txn.TransactionDate, false)
		if err != nil {
			return err
		}
		txn.AmountInBase = ConvertAmount(txn.Amount, rate)
	}

	if err := txn.Validate(); err != nil {
		return err
	}

	// 5. Persist the transaction
	if err := s.deps.TransactionStore.Create(ctx, rCtx, txn); err != nil {
		return err
	}

	// 6. Adjust account balance
	if txn.AccountID != nil && *txn.AccountID != "" {
		if err := s.adjustAccountBalance(ctx, rCtx, *txn.AccountID, txn.ImpactAmount(), txn.Type, false); err != nil {
			return fmt.Errorf("failed to adjust account balance: %w", err)
		}
	}

	return nil
}

// updateTransaction updates a transaction and recalculates account balances.
func (s *Service) updateTransaction(ctx context.Context, rCtx Context, txn *Transaction, existing *Transaction) error {
	if existing.Type == TransactionTypeBalanceAdjustment {
		return errors.New("balance adjustment transactions cannot be edited directly; perform a new balance adjustment or delete this record to revert")
	}

	// Preserve existing metadata (to prevent edits from wiping out linked entity IDs)
	txn.Metadata = existing.Metadata

	// 1. Set dates
	if txn.EffectiveDate.IsZero() {
		txn.EffectiveDate = txn.TransactionDate
	}
	txn.TransactionDate = rCtx.Date(txn.TransactionDate)
	txn.EffectiveDate = rCtx.Date(txn.EffectiveDate)
	txn.UpdateTime = time.Now().UTC()

	// 2. Verify workspace base currency is configured
	if rCtx.BaseCurrency() == "" {
		return errors.E(errors.Precondition, SettingsNotFound, "workspace base currency is not configured")
	}

	// 3. Centralized Budget Period Resolution
	if txn.BudgetID != nil {
		budget, err := s.deps.BudgetStore.GetByID(ctx, rCtx, *txn.BudgetID)
		if err != nil {
			return fmt.Errorf("fetch budget template: %w", err)
		}
		if err := budget.EnsureActive(); err != nil {
			return err
		}
		period, err := s.GetOrCreatePeriod(ctx, rCtx, budget.ID, txn.EffectiveDate)
		if err != nil {
			return fmt.Errorf("resolve active budget period: %w", err)
		}
		txn.PeriodID = new(period.ID)
	} else {
		txn.PeriodID = nil
	}

	// 3. Centralized Base Currency Exchange Rate Calculation
	rate, err := s.resolveExchangeRate(ctx, rCtx, txn.Currency, rCtx.BaseCurrency(), txn.TransactionDate, false)
	if err != nil {
		return err
	}
	txn.AmountInBase = ConvertAmount(txn.Amount, rate)

	if err := txn.Validate(); err != nil {
		return err
	}

	// 5. Revert the old transaction's balance impact
	if existing.AccountID != nil {
		if err := s.adjustAccountBalance(ctx, rCtx, *existing.AccountID, existing.Amount, existing.Type, true); err != nil {
			return fmt.Errorf("failed to revert account balance: %w", err)
		}
	}

	// 6. Persist the updated transaction
	if err := s.deps.TransactionStore.Update(ctx, rCtx, txn); err != nil {
		return err
	}

	// 7. Apply the new transaction's balance impact
	if txn.AccountID != nil {
		if err := s.adjustAccountBalance(ctx, rCtx, *txn.AccountID, txn.Amount, txn.Type, false); err != nil {
			return fmt.Errorf("failed to apply updated account balance: %w", err)
		}
	}

	return nil
}

// deleteTransaction deletes a transaction, reverts its account balance impact, and syncs linked borrowings.
func (s *Service) deleteTransaction(ctx context.Context, rCtx Context, txn *Transaction) error {
	// 1. Revert the account balance impact using account_impact_amount if present
	if txn.AccountID != nil && *txn.AccountID != "" {
		if err := s.adjustAccountBalance(ctx, rCtx, *txn.AccountID, txn.ImpactAmount(), txn.Type, true); err != nil {
			return fmt.Errorf("failed to revert account balance on deletion: %w", err)
		}
	}

	// 2. Revert borrowing remaining balance if linked via metadata
	if txn.Metadata.BorrowingID != nil && *txn.Metadata.BorrowingID != "" {
		role := txn.Metadata.BorrowingRole
		borrowingAmount := txn.Amount
		if txn.Metadata.BorrowingAmount > 0 {
			borrowingAmount = txn.Metadata.BorrowingAmount
		}

		if b, err := s.deps.BorrowingStore.GetByID(ctx, rCtx, *txn.Metadata.BorrowingID); err == nil {
			b.RollbackTransaction(role, txn.Type, borrowingAmount)
			_ = s.deps.BorrowingStore.Update(ctx, rCtx, b)
		}
	}

	// 3. Delete the transaction from persistence
	return s.deps.TransactionStore.Delete(ctx, rCtx, txn.ID)
}

// adjustAccountBalance updates the balance of the specified account based on transaction changes.
func (s *Service) adjustAccountBalance(ctx context.Context, rCtx Context, accountID AccountID, amount int64, txnType TransactionType, revert bool) error {
	acc, err := s.deps.AccountStore.GetByID(ctx, rCtx, accountID)
	if err != nil {
		return err
	}

	if revert {
		acc.RollbackTransaction(txnType, amount)
	} else {
		acc.ApplyTransaction(txnType, amount)
	}

	return s.deps.AccountStore.Update(ctx, rCtx, acc)
}

// Helper to create or update associated borrowing transaction idempotently
func (s *Service) syncBorrowingTransaction(ctx context.Context, rCtx Context, targetTxn *Transaction) error {
	if targetTxn == nil || targetTxn.Metadata.BorrowingID == nil {
		return errors.New("borrowing transaction metadata requires borrowing_id")
	}

	role := targetTxn.Metadata.BorrowingRole
	if role == "" {
		role = "INITIAL_FUNDING"
	}

	page, err := s.deps.TransactionStore.ListBySpace(ctx, rCtx, &TransactionFilter{
		BorrowingID:    targetTxn.Metadata.BorrowingID,
		BorrowingRoles: []string{role},
		PageSize:       1,
	})
	if err != nil {
		return fmt.Errorf("list existing transactions: %w", err)
	}

	if len(page.Items) > 0 {
		existing := page.Items[0]
		targetTxn.ID = existing.ID
		return s.updateTransaction(ctx, rCtx, targetTxn, existing)
	}

	return s.createTransaction(ctx, rCtx, targetTxn)
}

// CreateBorrowing initializes a borrowing agreement and optionally logs its disbursement transaction.
func (s *Service) CreateBorrowing(ctx context.Context, rCtx Context, b *Borrowing, createAsTransaction bool) (*Borrowing, error) {
	if rCtx.BaseCurrency() == "" {
		return nil, errors.E(errors.Precondition, SettingsNotFound, "workspace base currency is not configured")
	}

	if err := b.Init(); err != nil {
		return nil, err
	}
	b.EstablishedAt = rCtx.Date(b.EstablishedAt)
	if b.DueAt != nil && !b.DueAt.IsZero() {
		dueAt := rCtx.Date(*b.DueAt)
		b.DueAt = &dueAt
	}

	if err := b.Validate(); err != nil {
		return nil, err
	}

	if createAsTransaction {
		if _, err := s.resolveExchangeRate(ctx, rCtx, b.Currency, rCtx.BaseCurrency(), b.EstablishedAt, false); err != nil {
			return nil, err
		}
	}

	if err := s.deps.BorrowingStore.Create(ctx, rCtx, b); err != nil {
		return nil, err
	}

	if createAsTransaction || b.HasLinkedAccount() {
		initialTxn, err := b.NewTransaction(BorrowingTransactionOpts{
			Role:            "INITIAL_FUNDING",
			Amount:          b.TotalAmount,
			AccountID:       b.AccountID,
			TransactionDate: b.EstablishedAt,
		})
		if err != nil {
			return nil, err
		}

		if err := s.syncBorrowingTransaction(ctx, rCtx, initialTxn); err != nil {
			return nil, err
		}
	}

	return b, nil
}

// GetBorrowing retrieves a borrowing record.
func (s *Service) GetBorrowing(ctx context.Context, rCtx Context, id BorrowingID) (*Borrowing, error) {
	if err := rCtx.SpaceID().Validate(); err != nil {
		return nil, err
	}
	if err := id.Validate(); err != nil {
		return nil, err
	}
	return s.deps.BorrowingStore.GetByID(ctx, rCtx, id)
}

// ListBorrowings lists borrowing records with filters.
func (s *Service) ListBorrowings(ctx context.Context, rCtx Context, filter *ListBorrowingsFilter) ([]*Borrowing, string, error) {
	if err := rCtx.SpaceID().Validate(); err != nil {
		return nil, "", err
	}
	return s.deps.BorrowingStore.ListBySpace(ctx, rCtx, filter)
}

// UpdateBorrowing updates a borrowing record and its associated transaction.
func (s *Service) UpdateBorrowing(ctx context.Context, rCtx Context, b *Borrowing, mask []string) (*Borrowing, error) {
	const op errors.Op = "domain/finance.UpdateBorrowing"

	if rCtx.BaseCurrency() == "" {
		return nil, errors.E(errors.Precondition, SettingsNotFound, "workspace base currency is not configured")
	}

	existing, err := s.deps.BorrowingStore.GetByID(ctx, rCtx, b.ID)
	if err != nil {
		return nil, err
	}
	if b.Version > 0 && b.Version != existing.Version {
		return nil, errors.E(op, errors.Conflict, VersionMismatch, "update failed: borrowing not found or version mismatch")
	}

	wasUntouched := (existing.RemainingAmount == existing.TotalAmount)

	accountID := b.AccountID
	if err := existing.ApplyPatch(b, mask); err != nil {
		return nil, err
	}
	existing.AccountID = accountID

	// If no repayments/disbursements have been logged yet (remaining balance equaled original total), sync remaining balance to new total
	if wasUntouched {
		existing.RemainingAmount = existing.TotalAmount
	}

	borID := existing.ID
	page, err := s.deps.TransactionStore.ListBySpace(ctx, rCtx, &TransactionFilter{
		BorrowingID:    &borID,
		BorrowingRoles: []string{"INITIAL_FUNDING"},
		PageSize:       1,
	})
	if err != nil {
		return nil, fmt.Errorf("check existing transaction: %w", err)
	}

	hasInitialTxn := len(page.Items) > 0
	if hasInitialTxn || existing.HasLinkedAccount() {
		if _, err := s.resolveExchangeRate(ctx, rCtx, existing.Currency, rCtx.BaseCurrency(), existing.EstablishedAt, false); err != nil {
			return nil, err
		}
	}

	if err := s.deps.BorrowingStore.Update(ctx, rCtx, existing); err != nil {
		return nil, err
	}

	if hasInitialTxn || existing.HasLinkedAccount() {
		initialTxn, err := existing.NewTransaction(BorrowingTransactionOpts{
			Role:            "INITIAL_FUNDING",
			Amount:          existing.TotalAmount,
			AccountID:       existing.AccountID,
			TransactionDate: existing.EstablishedAt,
		})
		if err != nil {
			return nil, err
		}

		if err := s.syncBorrowingTransaction(ctx, rCtx, initialTxn); err != nil {
			return nil, err
		}
	}

	return existing, nil
}

// DeleteBorrowing removes a borrowing agreement if it has no linked transactions.
func (s *Service) DeleteBorrowing(ctx context.Context, rCtx Context, id BorrowingID) error {
	const op errors.Op = "domain/finance.DeleteBorrowing"

	if err := rCtx.SpaceID().Validate(); err != nil {
		return errors.E(op, errors.Invalid, err)
	}

	_, err := s.deps.BorrowingStore.GetByID(ctx, rCtx, id)
	if err != nil {
		return err
	}

	// 1. Check if borrowing has linked transactions
	page, err := s.deps.TransactionStore.ListBySpace(ctx, rCtx, &TransactionFilter{
		BorrowingID: new(id),
		PageSize:    1,
	})
	if err != nil {
		return fmt.Errorf("check linked borrowing transactions: %w", err)
	}
	if len(page.Items) > 0 {
		return errors.E(op, errors.Precondition, BorrowingHasTransactions, "cannot delete borrowing agreement with linked transactions")
	}

	// 2. Delete borrowing agreement from DB
	return s.deps.BorrowingStore.Delete(ctx, rCtx, id)
}

// LogBorrowingTransactionRequest holds parameters to log a borrowing payment or disbursement.
type LogBorrowingTransactionRequest struct {
	BorrowingID     BorrowingID
	Type            BorrowingTransactionType
	Amount          int64
	TransactionDate time.Time
	AccountID       *AccountID
	Notes           string
}

// UpdateBorrowingTransactionRequest holds parameters to update a borrowing transaction.
type UpdateBorrowingTransactionRequest struct {
	BorrowingID     BorrowingID
	TransactionID   TransactionID
	Type            BorrowingTransactionType
	Amount          int64
	TransactionDate time.Time
	AccountID       *AccountID
	Notes           string
}

// DeleteBorrowingTransactionRequest holds parameters to delete a borrowing transaction.
type DeleteBorrowingTransactionRequest struct {
	BorrowingID   BorrowingID
	TransactionID TransactionID
}

// LogBorrowingTransaction logs a repayment or disbursement transaction for a borrowing agreement.
func (s *Service) LogBorrowingTransaction(ctx context.Context, rCtx Context, req LogBorrowingTransactionRequest) (*Transaction, error) {
	if rCtx.BaseCurrency() == "" {
		return nil, errors.E(errors.Precondition, SettingsNotFound, "workspace base currency is not configured")
	}

	if err := rCtx.SpaceID().Validate(); err != nil {
		return nil, err
	}
	if err := req.BorrowingID.Validate(); err != nil {
		return nil, err
	}

	b, err := s.deps.BorrowingStore.GetByID(ctx, rCtx, req.BorrowingID)
	if err != nil {
		return nil, fmt.Errorf("fetch borrowing record: %w", err)
	}

	borrowingRole, txnType, defaultDesc, err := b.ApplyTransaction(req.Type, req.Amount)
	if err != nil {
		return nil, err
	}

	desc := defaultDesc
	if req.Notes != "" {
		desc = req.Notes
	}

	date := req.TransactionDate
	if date.IsZero() {
		date = rCtx.Now()
	} else {
		date = rCtx.Date(date)
	}

	rateToBase, err := s.resolveExchangeRate(ctx, rCtx, b.Currency, rCtx.BaseCurrency(), date, false)
	if err != nil {
		return nil, err
	}
	amountInBase := ConvertAmount(req.Amount, rateToBase)

	accountImpactAmount := req.Amount
	if req.AccountID != nil && *req.AccountID != "" {
		acc, err := s.deps.AccountStore.GetByID(ctx, rCtx, *req.AccountID)
		if err != nil {
			return nil, fmt.Errorf("fetch payment account: %w", err)
		}
		rateToAcc, err := s.resolveExchangeRate(ctx, rCtx, b.Currency, acc.Currency, date, false)
		if err != nil {
			return nil, err
		}
		accountImpactAmount = ConvertAmount(req.Amount, rateToAcc)
	}

	if err := s.deps.BorrowingStore.Update(ctx, rCtx, b); err != nil {
		return nil, fmt.Errorf("failed to update borrowing balance: %w", err)
	}

	txn, err := b.NewTransaction(BorrowingTransactionOpts{
		Role:                borrowingRole,
		Type:                txnType,
		Amount:              req.Amount,
		AmountInBase:        amountInBase,
		AccountImpactAmount: accountImpactAmount,
		AccountID:           req.AccountID,
		TransactionDate:     date,
		Description:         desc,
	})
	if err != nil {
		return nil, err
	}

	if err := s.createTransaction(ctx, rCtx, txn); err != nil {
		return nil, fmt.Errorf("create borrowing transaction: %w", err)
	}

	return txn, nil
}

// UpdateBorrowingTransaction updates a borrowing transaction and recalculates all balance impacts.
func (s *Service) UpdateBorrowingTransaction(ctx context.Context, rCtx Context, req UpdateBorrowingTransactionRequest) (*Transaction, error) {
	if err := rCtx.SpaceID().Validate(); err != nil {
		return nil, err
	}
	if err := req.BorrowingID.Validate(); err != nil {
		return nil, err
	}
	if err := req.TransactionID.Validate(); err != nil {
		return nil, err
	}

	txn, err := s.deps.TransactionStore.GetByID(ctx, rCtx, req.TransactionID)
	if err != nil {
		return nil, fmt.Errorf("fetch existing transaction: %w", err)
	}

	if txn.Metadata.BorrowingID == nil || *txn.Metadata.BorrowingID != req.BorrowingID {
		return nil, fmt.Errorf("transaction %s does not belong to borrowing %s", req.TransactionID, req.BorrowingID)
	}

	if err := s.deleteTransaction(ctx, rCtx, txn); err != nil {
		return nil, fmt.Errorf("revert previous transaction impact: %w", err)
	}

	return s.LogBorrowingTransaction(ctx, rCtx, LogBorrowingTransactionRequest{
		BorrowingID:     req.BorrowingID,
		Type:            req.Type,
		Amount:          req.Amount,
		TransactionDate: req.TransactionDate,
		AccountID:       req.AccountID,
		Notes:           req.Notes,
	})
}

// DeleteBorrowingTransaction deletes a borrowing transaction and reverts balance impacts.
func (s *Service) DeleteBorrowingTransaction(ctx context.Context, rCtx Context, req DeleteBorrowingTransactionRequest) error {
	if err := rCtx.SpaceID().Validate(); err != nil {
		return err
	}
	if err := req.BorrowingID.Validate(); err != nil {
		return err
	}
	if err := req.TransactionID.Validate(); err != nil {
		return err
	}

	txn, err := s.deps.TransactionStore.GetByID(ctx, rCtx, req.TransactionID)
	if err != nil {
		return fmt.Errorf("fetch existing transaction: %w", err)
	}

	if txn.Metadata.BorrowingID == nil || *txn.Metadata.BorrowingID != req.BorrowingID {
		return fmt.Errorf("transaction %s does not belong to borrowing %s", req.TransactionID, req.BorrowingID)
	}

	return s.deleteTransaction(ctx, rCtx, txn)
}

// AdjustBorrowingBalanceRequest holds parameters to adjust a borrowing's remaining balance.
type AdjustBorrowingBalanceRequest struct {
	BorrowingID    BorrowingID
	TargetBalance  int64
	AdjustmentDate string
	Note           string
	AccountID      *AccountID
}

// AdjustBorrowingBalance reconciles a borrowing's remaining balance to a target balance.
func (s *Service) AdjustBorrowingBalance(ctx context.Context, rCtx Context, req AdjustBorrowingBalanceRequest) (*Borrowing, error) {
	if err := rCtx.SpaceID().Validate(); err != nil {
		return nil, err
	}
	if err := req.BorrowingID.Validate(); err != nil {
		return nil, err
	}

	b, err := s.deps.BorrowingStore.GetByID(ctx, rCtx, req.BorrowingID)
	if err != nil {
		return nil, fmt.Errorf("fetch target borrowing: %w", err)
	}

	delta := b.AdjustBalance(req.TargetBalance)
	if delta == 0 {
		return b, nil
	}

	parsedDate := rCtx.Now()
	if req.AdjustmentDate != "" {
		if t, parseErr := time.Parse(time.RFC3339, req.AdjustmentDate); parseErr == nil {
			parsedDate = rCtx.Date(t)
		} else if t, parseErr := time.Parse("2006-01-02", req.AdjustmentDate); parseErr == nil {
			parsedDate = rCtx.Date(t)
		}
	}

	if err := s.deps.BorrowingStore.Update(ctx, rCtx, b); err != nil {
		return nil, fmt.Errorf("failed to update borrowing balance: %w", err)
	}

	// 2. Record transaction with BorrowingRole = "ADJUSTMENT"
	txnID, err := NewTransactionID()
	if err != nil {
		return nil, err
	}

	description := "Balance Adjustment"
	if req.Note != "" {
		description += " (" + req.Note + ")"
	}

	var txnType TransactionType
	if b.Direction == BorrowingDirectionLent {
		if delta > 0 {
			txnType = TransactionTypeExpense
		} else {
			txnType = TransactionTypeIncome
		}
	} else {
		if delta > 0 {
			txnType = TransactionTypeIncome
		} else {
			txnType = TransactionTypeExpense
		}
	}

	absDelta := delta
	if absDelta < 0 {
		absDelta = -absDelta
	}

	txn := &Transaction{
		ID:              txnID,
		AccountID:       req.AccountID,
		Type:            txnType,
		Amount:          absDelta,
		Currency:        b.Currency,
		Description:     description,
		TransactionDate: parsedDate,
		EffectiveDate:   parsedDate,
		Metadata: TransactionMetadata{
			BorrowingID:   &req.BorrowingID,
			BorrowingRole: "ADJUSTMENT",
			Notes:         req.Note,
		},
	}

	if err := s.createTransaction(ctx, rCtx, txn); err != nil {
		return nil, fmt.Errorf("record balance adjustment transaction: %w", err)
	}

	return s.deps.BorrowingStore.GetByID(ctx, rCtx, req.BorrowingID)
}

// CurrencyInfo represents basic currency details.
type CurrencyInfo struct {
	Code string
	Name string
}

// ListCurrencies returns the list of supported currencies.
func (s *Service) ListCurrencies(ctx context.Context) ([]CurrencyInfo, error) {
	return []CurrencyInfo{
		{Code: "USD", Name: "US Dollar"},
		{Code: "EUR", Name: "Euro"},
		{Code: "GBP", Name: "British Pound"},
		{Code: "CAD", Name: "Canadian Dollar"},
		{Code: "JPY", Name: "Japanese Yen"},
		{Code: "DOP", Name: "Dominican Peso"},
	}, nil
}

// CreateAccount creates a new account.
func (s *Service) CreateAccount(ctx context.Context, rCtx Context, a *Account) (*Account, error) {
	if err := a.Init(); err != nil {
		return nil, err
	}

	if err := a.Validate(); err != nil {
		return nil, err
	}

	// Check if first account in space
	hasAny, err := s.deps.AccountStore.HasAny(ctx, rCtx)
	if err != nil {
		return nil, err
	}
	if !hasAny {
		_ = a.SetAsDefault()
	} else if a.IsDefault {
		if err := a.SetAsDefault(); err != nil {
			return nil, err
		}
		// Unset all other defaults space-wide atomically in the DB
		if err := s.deps.AccountStore.UnsetDefaultsExcept(ctx, rCtx, a.ID); err != nil {
			return nil, err
		}
	}
	if err := s.deps.AccountStore.Create(ctx, rCtx, a); err != nil {
		return nil, err
	}

	return a, nil
}

// GetAccount retrieves an account.
func (s *Service) GetAccount(ctx context.Context, rCtx Context, id AccountID) (*Account, error) {
	if err := rCtx.SpaceID().Validate(); err != nil {
		return nil, err
	}
	if err := id.Validate(); err != nil {
		return nil, err
	}
	return s.deps.AccountStore.GetByID(ctx, rCtx, id)
}

// GetAccounts retrieves a list of accounts by their identifiers for a space.
func (s *Service) GetAccounts(ctx context.Context, rCtx Context, ids []AccountID) ([]*Account, error) {
	if err := rCtx.SpaceID().Validate(); err != nil {
		return nil, err
	}
	return s.deps.AccountStore.GetByIDs(ctx, rCtx, ids)
}

// UpdateAccount updates account metadata with field masking and optimistic concurrency control.
func (s *Service) UpdateAccount(ctx context.Context, rCtx Context, account *Account, mask []string) (*Account, error) {
	const op errors.Op = "domain/finance.UpdateAccount"

	existing, err := s.deps.AccountStore.GetByID(ctx, rCtx, account.ID)
	if err != nil {
		return nil, err
	}
	if account.Version > 0 && account.Version != existing.Version {
		return nil, errors.E(op, errors.Conflict, VersionMismatch, "update failed: account not found or version mismatch")
	}

	wasDefault := existing.IsDefault
	wasActive := existing.IsActive

	if err := existing.ApplyPatch(account, mask); err != nil {
		return nil, err
	}

	if existing.IsDefault && !wasDefault {
		if err := existing.SetAsDefault(); err != nil {
			return nil, err
		}
		// Unset all other defaults space-wide atomically in the DB
		if err := s.deps.AccountStore.UnsetDefaultsExcept(ctx, rCtx, account.ID); err != nil {
			return nil, err
		}
	} else if !existing.IsDefault && wasDefault {
		// Prevent unsetting default status directly without setting another account as default
		_ = existing.SetAsDefault()
	}

	if !existing.IsActive && wasActive {
		if err := existing.Deactivate(); err != nil {
			return nil, err
		}
	}

	if err := s.deps.AccountStore.Update(ctx, rCtx, existing); err != nil {
		return nil, err
	}

	return existing, nil
}

// AdjustAccountBalanceRequest holds parameters to adjust an account's live balance.
type AdjustAccountBalanceRequest struct {
	AccountID      AccountID
	TargetBalance  int64
	AdjustmentDate string
	Note           string
}

// AdjustAccountBalance reconciles an account's live balance to a target balance by logging a system reconciliation transaction.
func (s *Service) AdjustAccountBalance(ctx context.Context, rCtx Context, req AdjustAccountBalanceRequest) (*Account, error) {
	if err := rCtx.SpaceID().Validate(); err != nil {
		return nil, err
	}
	if err := req.AccountID.Validate(); err != nil {
		return nil, err
	}

	acc, err := s.deps.AccountStore.GetByID(ctx, rCtx, req.AccountID)
	if err != nil {
		return nil, fmt.Errorf("fetch target account: %w", err)
	}

	parsedDate := rCtx.Now()
	if req.AdjustmentDate != "" {
		if t, parseErr := time.Parse(time.RFC3339, req.AdjustmentDate); parseErr == nil {
			parsedDate = rCtx.Date(t)
		} else if t, parseErr := time.Parse("2006-01-02", req.AdjustmentDate); parseErr == nil {
			parsedDate = rCtx.Date(t)
		}
	}

	txn, err := acc.ReconcileBalance(ReconcileAccountOpts{
		TargetBalance:  req.TargetBalance,
		AdjustmentDate: parsedDate,
		Note:           req.Note,
	})
	if err != nil {
		return nil, fmt.Errorf("reconcile balance: %w", err)
	}
	if txn == nil {
		return acc, nil
	}

	if err := s.createTransaction(ctx, rCtx, txn); err != nil {
		return nil, fmt.Errorf("record balance adjustment transaction: %w", err)
	}

	return s.deps.AccountStore.GetByID(ctx, rCtx, req.AccountID)
}

// DeleteAccount deletes an account and moves default status if necessary.
func (s *Service) DeleteAccount(ctx context.Context, rCtx Context, id AccountID, opts DeleteOptions) error {
	const op errors.Op = "domain/finance.DeleteAccount"

	existing, err := s.deps.AccountStore.GetByID(ctx, rCtx, id)
	if err != nil {
		return err
	}

	if existing.IsDefault {
		return errors.E(op, errors.Invalid, CannotDeleteDefaultAccount, "cannot delete the default account. please select another account as default first")
	}

	return s.deps.AccountStore.Delete(ctx, rCtx, id, opts)
}

// ListAccounts lists all accounts for a space.
func (s *Service) ListAccounts(ctx context.Context, rCtx Context, filter *ListAccountsFilter) (*paging.Page[*Account], error) {
	if err := rCtx.SpaceID().Validate(); err != nil {
		return nil, err
	}
	return s.deps.AccountStore.ListBySpace(ctx, rCtx, filter)
}

// GetLatestRates retrieves the latest exchange rates for the given fromCurrencies to the target currency.
func (s *Service) GetLatestRates(ctx context.Context, rCtx Context, fromCurrencies []Currency, toCurrency Currency) ([]*ExchangeRate, error) {
	if err := rCtx.SpaceID().Validate(); err != nil {
		return nil, err
	}
	return s.deps.ExchangeRateStore.GetLatestRates(ctx, rCtx, fromCurrencies, toCurrency)
}

// CreateTransfer logs a fund movement between accounts.
func (s *Service) CreateTransfer(ctx context.Context, rCtx Context, t *Transfer) (*Transfer, error) {
	transfer, _, _, err := s.createTransfer(ctx, rCtx, t, CreateTransferOpts{})
	return transfer, err
}

func (s *Service) createTransfer(ctx context.Context, rCtx Context, t *Transfer, opts CreateTransferOpts) (*Transfer, *Transaction, *Transaction, error) {
	if t.TransferDate.IsZero() {
		t.TransferDate = rCtx.Now()
	} else {
		t.TransferDate = rCtx.Date(t.TransferDate)
	}

	if err := t.Init(); err != nil {
		return nil, nil, nil, err
	}

	if err := t.Validate(); err != nil {
		return nil, nil, nil, err
	}

	// Fetch both accounts to verify existence and check currencies
	srcAcc, err := s.deps.AccountStore.GetByID(ctx, rCtx, t.SourceAccountID)
	if err != nil {
		return nil, nil, nil, fmt.Errorf("source account: %w", err)
	}
	destAcc, err := s.deps.AccountStore.GetByID(ctx, rCtx, t.DestinationAccountID)
	if err != nil {
		return nil, nil, nil, fmt.Errorf("destination account: %w", err)
	}

	if err := srcAcc.ValidateTransferTo(destAcc, t.SourceAmount); err != nil {
		return nil, nil, nil, fmt.Errorf("validate account transfer: %w", err)
	}

	// Double-entry validation: same currency transfers must have matching source and destination amounts
	if srcAcc.Currency == destAcc.Currency && t.SourceAmount != t.DestinationAmount {
		return nil, nil, nil, errors.New("source and destination amounts must match for single-currency transfers")
	}

	// 1. Insert Transfer parent record
	if err := s.deps.TransferStore.Create(ctx, rCtx, t); err != nil {
		return nil, nil, nil, err
	}

	outflowTxn, inflowTxn, err := t.NewLegTransactions(TransferLegOpts{
		SourceAccountName: srcAcc.Name,
		DestAccountName:   destAcc.Name,
		SourceCurrency:    srcAcc.Currency,
		DestCurrency:      destAcc.Currency,
	})
	if err != nil {
		return nil, nil, nil, err
	}

	// Attach optional leg-specific metadata
	if opts.OutflowMetadata != nil {
		outflowTxn.Metadata.Merge(*opts.OutflowMetadata)
	}
	if opts.InflowMetadata != nil {
		inflowTxn.Metadata.Merge(*opts.InflowMetadata)
	}

	if err := s.createTransaction(ctx, rCtx, outflowTxn); err != nil {
		return nil, nil, nil, fmt.Errorf("failed to log transfer outflow leg: %w", err)
	}
	if err := s.createTransaction(ctx, rCtx, inflowTxn); err != nil {
		return nil, nil, nil, fmt.Errorf("failed to log transfer inflow leg: %w", err)
	}

	return t, outflowTxn, inflowTxn, nil
}

// GetTransfer retrieves a transfer for a space.
func (s *Service) GetTransfer(ctx context.Context, rCtx Context, id TransferID) (*Transfer, error) {
	if err := rCtx.SpaceID().Validate(); err != nil {
		return nil, err
	}
	if err := id.Validate(); err != nil {
		return nil, err
	}
	return s.deps.TransferStore.GetByID(ctx, rCtx, id)
}

// DeleteTransfer deletes a transfer parent and deletes both linked ledger entries.
func (s *Service) DeleteTransfer(ctx context.Context, rCtx Context, id TransferID) error {
	_, err := s.deps.TransferStore.GetByID(ctx, rCtx, id)
	if err != nil {
		return err
	}

	// Find the associated transaction legs using TransferID
	page, err := s.deps.TransactionStore.ListBySpace(ctx, rCtx, &TransactionFilter{
		TransferID: &id,
		PageSize:   10,
	})
	if err != nil {
		return fmt.Errorf("failed to retrieve transfer transaction legs: %w", err)
	}
	legs := page.Items

	// Delete both transaction legs
	for _, leg := range legs {
		if err := s.deleteTransaction(ctx, rCtx, leg); err != nil {
			return fmt.Errorf("failed to delete transfer leg transaction: %w", err)
		}
	}

	// Delete parent transfer record
	return s.deps.TransferStore.Delete(ctx, rCtx, id)
}

// ListTransfers lists transfer records inside a space.
func (s *Service) ListTransfers(ctx context.Context, rCtx Context, limit int32, pageToken string) ([]*Transfer, string, error) {
	if err := rCtx.SpaceID().Validate(); err != nil {
		return nil, "", err
	}
	return s.deps.TransferStore.ListBySpace(ctx, rCtx, limit, pageToken)
}

// LogTransactionEvent inserts a new lifecycle event for a transaction.
func (s *Service) LogTransactionEvent(ctx context.Context, rCtx Context, e *TransactionEvent) (*TransactionEvent, error) {
	if err := e.Init(); err != nil {
		return nil, err
	}
	if err := e.Validate(); err != nil {
		return nil, err
	}
	if err := s.deps.TransactionEventStore.Create(ctx, rCtx, e); err != nil {
		return nil, err
	}
	return e, nil
}

// ListTransactionEvents retrieves all lifecycle events for a specific transaction in a space.
func (s *Service) ListTransactionEvents(ctx context.Context, rCtx Context, txnID TransactionID) ([]*TransactionEvent, error) {
	if err := rCtx.SpaceID().Validate(); err != nil {
		return nil, fmt.Errorf("validate space ID: %w", err)
	}
	if err := txnID.Validate(); err != nil {
		return nil, fmt.Errorf("validate transaction ID: %w", err)
	}
	return s.deps.TransactionEventStore.ListByTransaction(ctx, rCtx, txnID)
}

// StageInboxItem parses extraction suggestions and inserts a new draft entry into the inbox queue.
func (s *Service) StageInboxItem(ctx context.Context, rCtx Context, req *StageInboxItem) (*InboxItem, error) {
	if err := rCtx.SpaceID().Validate(); err != nil {
		return nil, err
	}

	// 1. Generate unique inbox item ID using "ibx_" prefix
	ibxID, err := id.Generate("ibx_")
	if err != nil {
		return nil, fmt.Errorf("generate inbox item ID: %w", err)
	}

	// 2. Resolve target account ID
	var accountID *string
	reqAccID := ""
	if req.AccountID != nil {
		reqAccID = *req.AccountID
	}
	acc, err := s.ResolveAccount(ctx, rCtx, ResolveAccountOpts{
		AccountID: reqAccID,
		LastFour:  req.CardLastFour,
		Currency:  req.Currency,
	})
	if err == nil && acc != nil {
		accountID = new(string(acc.ID))
	}

	// 3. Resolve and validate matching budget ID
	var budgetID *string
	if req.SuggestedBudget != "" {
		bID, err := ParseBudgetID(req.SuggestedBudget)
		if err == nil {
			budget, err := s.deps.BudgetStore.GetByID(ctx, rCtx, bID)
			if err == nil && budget != nil {
				budgetID = new(string(budget.ID))
			}
		}
	}

	// 4. Parse transaction timestamp
	txDate := rCtx.Now()
	if req.Date != "" {
		if t, err := time.Parse(time.RFC3339, req.Date); err == nil {
			txDate = rCtx.Date(t)
		} else if t, err := time.Parse("2006-01-02", req.Date); err == nil {
			txDate = rCtx.Date(t)
		}
	}

	// 5. Create and insert InboxItem
	item := &InboxItem{
		ID:              ibxID,
		IntegrationID:   req.IntegrationID,
		Status:          InboxItemPending,
		DocType:         req.DocType,
		Amount:          req.Amount,
		Currency:        req.Currency,
		VendorName:      req.Vendor,
		TransactionDate: txDate,
		AccountID:       accountID,
		BudgetID:        budgetID,
		RawPayload:      req.RawPayload,
		Metadata:        req.Metadata,
		CreateTime:      time.Now().UTC(),
	}

	if err := s.deps.InboxItemStore.Insert(ctx, rCtx, item); err != nil {
		return nil, fmt.Errorf("insert inbox item: %w", err)
	}

	return item, nil
}

// ListInboxItems lists all pending/staged items in the space inbox.
func (s *Service) ListInboxItems(ctx context.Context, rCtx Context, filter *ListInboxItemsFilter) (*paging.Page[*InboxItem], error) {
	if err := rCtx.SpaceID().Validate(); err != nil {
		return nil, err
	}
	return s.deps.InboxItemStore.ListBySpace(ctx, rCtx, filter)
}

// UpdateInboxItem updates a staging inbox item's draft properties.
func (s *Service) UpdateInboxItem(ctx context.Context, rCtx Context, item *InboxItem) (*InboxItem, error) {
	if err := rCtx.SpaceID().Validate(); err != nil {
		return nil, err
	}
	if item.ID == "" {
		return nil, errors.New("missing inbox item ID")
	}
	existing, err := s.deps.InboxItemStore.Get(ctx, rCtx, item.ID)
	if err != nil {
		return nil, err
	}

	if item.Status == "" {
		item.Status = existing.Status
	}
	if item.DocType == "" || item.DocType == InboxItemDocUnknown {
		item.DocType = existing.DocType
	}
	if item.Currency == "" {
		item.Currency = existing.Currency
	}
	if item.Amount == 0 {
		item.Amount = existing.Amount
	}
	if item.VendorName == "" {
		item.VendorName = existing.VendorName
	}
	if item.AccountID == nil {
		item.AccountID = existing.AccountID
	}
	if item.BudgetID == nil {
		item.BudgetID = existing.BudgetID
	}
	if item.ScheduledTransactionID == nil {
		item.ScheduledTransactionID = existing.ScheduledTransactionID
	}
	if item.TransactionID == nil {
		item.TransactionID = existing.TransactionID
	}
	if item.BorrowingID == nil {
		item.BorrowingID = existing.BorrowingID
	}

	// Persist changes
	if err := s.deps.InboxItemStore.Update(ctx, rCtx, item); err != nil {
		return nil, err
	}

	return item, nil
}

// DiscardInboxItem deletes an item from the inbox without ledger changes.
func (s *Service) DiscardInboxItem(ctx context.Context, rCtx Context, id string) error {
	if err := rCtx.SpaceID().Validate(); err != nil {
		return err
	}
	return s.deps.InboxItemStore.Delete(ctx, rCtx, id)
}

// ApproveInboxItem promotes an inbox item to the ledger or updates a scheduled payment, returning the resolved item.
func (s *Service) ApproveInboxItem(ctx context.Context, rCtx Context, id string) (*InboxItem, error) {
	if err := rCtx.SpaceID().Validate(); err != nil {
		return nil, err
	}

	item, err := s.deps.InboxItemStore.Get(ctx, rCtx, id)
	if err != nil {
		return nil, fmt.Errorf("get inbox item: %w", err)
	}

	if err := item.EnsurePending(); err != nil {
		return nil, err
	}

	switch {
	case item.DocType == InboxItemDocSystemVerification:
		return s.approveSystemVerification(ctx, rCtx, item)
	case item.TransactionID != nil && *item.TransactionID != "":
		return s.approveLinkedTransaction(ctx, rCtx, item)
	case item.ScheduledTransactionID != nil && *item.ScheduledTransactionID != "":
		return s.approveScheduledTransaction(ctx, rCtx, item)
	case item.DocType == InboxItemDocInvoice:
		return s.approveStagedInvoice(ctx, rCtx, item)
	default:
		return s.approveStandalonePromotion(ctx, rCtx, item)
	}
}

func (s *Service) approveSystemVerification(ctx context.Context, rCtx Context, item *InboxItem) (*InboxItem, error) {
	item.MarkResolved(nil)
	if err := s.deps.InboxItemStore.Update(ctx, rCtx, item); err != nil {
		return nil, fmt.Errorf("resolve verification inbox item: %w", err)
	}
	return item, nil
}

func (s *Service) approveLinkedTransaction(ctx context.Context, rCtx Context, item *InboxItem) (*InboxItem, error) {
	txnID, err := ParseTransactionID(*item.TransactionID)
	if err != nil {
		return nil, fmt.Errorf("invalid transaction ID: %w", err)
	}
	txn, err := s.deps.TransactionStore.GetByID(ctx, rCtx, txnID)
	if err != nil {
		return nil, fmt.Errorf("get transaction: %w", err)
	}
	if txn.Type == TransactionTypeTransferOut || txn.Type == TransactionTypeTransferIn {
		return nil, errors.E(errors.Invalid, CannotLinkReceiptToTransfer, "cannot link receipt to transfer transaction")
	}

	overwrite := item.MetadataBool("overwrite_linked_transaction")

	if overwrite {
		diff := item.Amount - txn.Amount
		if diff != 0 && txn.AccountID != nil {
			isReversal := diff < 0
			absDiff := diff
			if isReversal {
				absDiff = -diff
			}
			if err := s.adjustAccountBalance(ctx, rCtx, *txn.AccountID, absDiff, txn.Type, isReversal); err != nil {
				return nil, fmt.Errorf("failed to adjust account balance delta: %w", err)
			}
		}

		updatedTxn := *txn
		updatedTxn.Amount = item.Amount
		updatedTxn.Currency = Currency(item.Currency)
		if item.VendorName != "" {
			updatedTxn.Description = item.VendorName
		}

		if err := s.deps.TransactionStore.Update(ctx, rCtx, &updatedTxn); err != nil {
			return nil, fmt.Errorf("failed to update linked transaction: %w", err)
		}
		txn = &updatedTxn
	}

	if item.BorrowingID != nil && *item.BorrowingID != "" {
		linkType := BorrowingLinkTypeInitialReceipt
		if item.BorrowingLinkType != nil {
			linkType = *item.BorrowingLinkType
		}
		if err := s.handleBorrowingLinkForTransaction(ctx, rCtx, txn, *item.BorrowingID, linkType); err != nil {
			return nil, fmt.Errorf("link borrowing to existing transaction: %w", err)
		}
	}

	if item.ScheduledTransactionID != nil && *item.ScheduledTransactionID != "" {
		if err := s.handleScheduledTransactionLinkForTransaction(ctx, rCtx, txn, *item.ScheduledTransactionID); err != nil {
			return nil, fmt.Errorf("link scheduled transaction to existing transaction: %w", err)
		}
		item.ScheduledTransactionID = nil
	}

	item.Status = InboxItemResolved
	if err := s.deps.InboxItemStore.Update(ctx, rCtx, item); err != nil {
		return nil, fmt.Errorf("resolve inbox item: %w", err)
	}

	if _, err := s.LogTransactionEvent(ctx, rCtx, item.NewReceiptIngestedEvent(txn.ID)); err != nil {
		log.Warn(ctx, "failed to log receipt ingested event", log.String("transaction_id", string(txn.ID)), log.Err(err))
	}

	if _, err := s.LogTransactionEvent(ctx, rCtx, item.NewTransactionLinkedEvent(txn.ID, overwrite)); err != nil {
		log.Warn(ctx, "failed to log transaction linked event", log.String("transaction_id", string(txn.ID)), log.Err(err))
	}

	return item, nil
}

func (s *Service) approveScheduledTransaction(ctx context.Context, rCtx Context, item *InboxItem) (*InboxItem, error) {
	payID := ScheduledTransactionID(*item.ScheduledTransactionID)
	if item.DocType == InboxItemDocInvoice {
		payment, err := s.deps.ScheduledTransactionStore.GetByID(ctx, rCtx, payID)
		if err != nil {
			return nil, fmt.Errorf("get scheduled transaction: %w", err)
		}
		payment.Amount = item.Amount
		payment.SourceType = item.VendorName
		if err := s.deps.ScheduledTransactionStore.Update(ctx, rCtx, payment); err != nil {
			return nil, fmt.Errorf("update scheduled transaction: %w", err)
		}

		item.Status = InboxItemResolved
		if err := s.deps.InboxItemStore.Update(ctx, rCtx, item); err != nil {
			return nil, fmt.Errorf("resolve inbox item: %w", err)
		}
		return item, nil
	}

	txn, err := s.ConfirmScheduledTransaction(ctx, rCtx, ConfirmScheduledTransactionRequest{
		TransactionID:   payID,
		AccountID:       (*AccountID)(item.AccountID),
		TransactionDate: item.TransactionDate,
		EffectiveDate:   rCtx.Now(),
		ActualAmount:    item.Amount,
		Description:     item.VendorName,
	})
	if err != nil {
		return nil, fmt.Errorf("confirm scheduled transaction: %w", err)
	}

	item.MarkResolved(&txn.ID)
	if err := s.deps.InboxItemStore.Update(ctx, rCtx, item); err != nil {
		return nil, fmt.Errorf("resolve inbox item: %w", err)
	}
	return item, nil
}

func (s *Service) approveStagedInvoice(ctx context.Context, rCtx Context, item *InboxItem) (*InboxItem, error) {
	payment, err := item.NewScheduledTransactionFromInvoice(rCtx.SpaceID())
	if err != nil {
		return nil, err
	}

	if err := s.deps.ScheduledTransactionStore.Create(ctx, rCtx, payment); err != nil {
		return nil, fmt.Errorf("create scheduled transaction: %w", err)
	}

	item.Status = InboxItemResolved
	pIDStr := string(payment.ID)
	item.ScheduledTransactionID = &pIDStr
	if err := s.deps.InboxItemStore.Update(ctx, rCtx, item); err != nil {
		return nil, fmt.Errorf("resolve inbox item: %w", err)
	}

	return item, nil
}

func (s *Service) approveStandalonePromotion(ctx context.Context, rCtx Context, item *InboxItem) (*InboxItem, error) {
	transactionType := item.MetadataString("transaction_type")
	destinationAccountID := item.MetadataString("destination_account_id")
	transferLeg := item.MetadataString("transfer_leg")

	if transactionType == "TRANSFER" {
		if destinationAccountID == "" {
			return nil, errors.New("missing destination account for transfer")
		}
		destAccID, err := ParseAccountID(destinationAccountID)
		if err != nil {
			return nil, fmt.Errorf("invalid destination account: %w", err)
		}

		transfer, err := item.NewTransfer(rCtx.SpaceID(), destAccID)
		if err != nil {
			return nil, err
		}

		_, outflowTxn, inflowTxn, err := s.createTransfer(ctx, rCtx, transfer, CreateTransferOpts{})
		if err != nil {
			return nil, fmt.Errorf("create transfer: %w", err)
		}

		targetTxnID := &outflowTxn.ID
		targetAccIDStr := string(transfer.SourceAccountID)
		if transferLeg == "DESTINATION" {
			targetTxnID = &inflowTxn.ID
			targetAccIDStr = string(transfer.DestinationAccountID)
		}

		item.MarkResolved(targetTxnID)
		item.AccountID = &targetAccIDStr

		if err := s.deps.InboxItemStore.Update(ctx, rCtx, item); err != nil {
			return nil, fmt.Errorf("resolve inbox item: %w", err)
		}

		return item, nil
	}

	txn, err := item.NewTransaction(rCtx.SpaceID())
	if err != nil {
		return nil, err
	}

	if err := s.createTransaction(ctx, rCtx, txn); err != nil {
		return nil, err
	}

	if item.BorrowingID != nil && *item.BorrowingID != "" {
		linkType := BorrowingLinkTypeInitialReceipt
		if item.BorrowingLinkType != nil {
			linkType = *item.BorrowingLinkType
		}
		if err := s.handleBorrowingLinkForTransaction(ctx, rCtx, txn, *item.BorrowingID, linkType); err != nil {
			return nil, fmt.Errorf("link borrowing to new transaction: %w", err)
		}
	}

	if item.ScheduledTransactionID != nil && *item.ScheduledTransactionID != "" {
		if err := s.handleScheduledTransactionLinkForTransaction(ctx, rCtx, txn, *item.ScheduledTransactionID); err != nil {
			return nil, fmt.Errorf("link scheduled transaction to new transaction: %w", err)
		}
		item.ScheduledTransactionID = nil
	}

	item.MarkResolved(&txn.ID)
	if err := s.deps.InboxItemStore.Update(ctx, rCtx, item); err != nil {
		return nil, fmt.Errorf("resolve inbox item: %w", err)
	}

	return item, nil
}

func (s *Service) handleBorrowingLinkForTransaction(ctx context.Context, rCtx Context, txn *Transaction, borrowingIDStr string, linkType BorrowingLinkType) error {
	if borrowingIDStr == "" {
		return nil
	}
	bID, err := ParseBorrowingID(borrowingIDStr)
	if err != nil {
		return fmt.Errorf("invalid borrowing ID: %w", err)
	}
	borrowing, err := s.deps.BorrowingStore.GetByID(ctx, rCtx, bID)
	if err != nil {
		return fmt.Errorf("get borrowing: %w", err)
	}

	if txn.Metadata.BorrowingID != nil {
		if *txn.Metadata.BorrowingID != borrowing.ID {
			return errors.E(errors.Invalid, CannotRelinkTransactionToDifferentBorrowing, "cannot relink transaction to a different borrowing agreement")
		}
		// Already linked to this exact borrowing agreement (idempotent link attachment)
		return nil
	}

	role := "INITIAL_FUNDING"
	switch linkType {
	case BorrowingLinkTypeInitialReceipt:
		role = "INITIAL_FUNDING"

	case BorrowingLinkTypeRepayment:
		role = "REPAYMENT"
		borrowing.RemainingAmount -= txn.Amount
		if borrowing.RemainingAmount <= 0 {
			borrowing.RemainingAmount = 0
			borrowing.Status = BorrowingStatusPaidOff
		}
		borrowing.UpdateTime = time.Now().UTC()
		if err := s.deps.BorrowingStore.Update(ctx, rCtx, borrowing); err != nil {
			return fmt.Errorf("update borrowing remaining balance: %w", err)
		}

	case BorrowingLinkTypeAdditionalLoan:
		role = "ADDITIONAL_LOAN"
		borrowing.TotalAmount += txn.Amount
		borrowing.RemainingAmount += txn.Amount
		borrowing.UpdateTime = time.Now().UTC()
		if err := s.deps.BorrowingStore.Update(ctx, rCtx, borrowing); err != nil {
			return fmt.Errorf("update borrowing total balance: %w", err)
		}
	}

	// Update metadata with borrowing link details
	txn.LinkBorrowing(borrowing.ID, role)

	if err := s.deps.TransactionStore.Update(ctx, rCtx, txn); err != nil {
		return fmt.Errorf("update transaction borrowing metadata: %w", err)
	}

	return nil
}

func (s *Service) handleScheduledTransactionLinkForTransaction(ctx context.Context, rCtx Context, txn *Transaction, paymentIDStr string) error {
	if paymentIDStr == "" {
		return nil
	}
	pID, err := ParseScheduledTransactionID(paymentIDStr)
	if err != nil {
		return fmt.Errorf("invalid scheduled transaction ID: %w", err)
	}
	payment, err := s.deps.ScheduledTransactionStore.GetByID(ctx, rCtx, pID)
	if err != nil {
		return fmt.Errorf("get scheduled transaction: %w", err)
	}

	if txn.Metadata.ScheduledTransactionID != nil {
		if string(*txn.Metadata.ScheduledTransactionID) != string(payment.ID) {
			return errors.E(errors.Invalid, CannotRelinkTransactionToDifferentScheduledTransaction, "cannot relink transaction to a different scheduled transaction")
		}
		// Already linked to this exact scheduled transaction (ensure payment is marked paid)
		if payment.Status != ScheduledTransactionPaid {
			payment.Status = ScheduledTransactionPaid
			payment.UpdateTime = time.Now().UTC()
			if err := s.deps.ScheduledTransactionStore.Update(ctx, rCtx, payment); err != nil {
				return fmt.Errorf("update scheduled transaction status: %w", err)
			}
		}
		return nil
	}

	// Retroactively mark scheduled transaction as paid and link transaction
	payment.Status = ScheduledTransactionPaid
	payment.UpdateTime = time.Now().UTC()
	if err := s.deps.ScheduledTransactionStore.Update(ctx, rCtx, payment); err != nil {
		return fmt.Errorf("update scheduled transaction status: %w", err)
	}

	txn.Metadata.ScheduledTransactionID = &payment.ID
	txn.UpdateTime = time.Now().UTC()
	if err := s.deps.TransactionStore.Update(ctx, rCtx, txn); err != nil {
		return fmt.Errorf("update transaction scheduled transaction metadata: %w", err)
	}

	return nil
}

// GetBudget retrieves a budget by its unique identifier for a space.
func (s *Service) GetBudget(ctx context.Context, rCtx Context, id BudgetID) (*Budget, error) {
	if err := rCtx.SpaceID().Validate(); err != nil {
		return nil, err
	}
	if err := id.Validate(); err != nil {
		return nil, err
	}
	return s.deps.BudgetStore.GetByID(ctx, rCtx, id)
}

// GetBudgets retrieves a list of budgets by their identifiers for a space.
func (s *Service) GetBudgets(ctx context.Context, rCtx Context, ids []BudgetID) ([]*Budget, error) {
	if err := rCtx.SpaceID().Validate(); err != nil {
		return nil, err
	}
	return s.deps.BudgetStore.GetByIDs(ctx, rCtx, ids)
}

type ResolveInstitutionResult struct {
	Name                    string
	Domain                  string
	LogoURL                 string
	Color                   string
	ExistingInstitutionID   *InstitutionID
	ExistingInstitutionName string
}

func AutoResolveInstitutionDomain(nameOrURL string) string {
	clean := strings.TrimSpace(strings.ToLower(nameOrURL))
	if clean == "" {
		return ""
	}
	if idx := strings.Index(clean, "://"); idx != -1 {
		clean = clean[idx+3:]
	}
	if idx := strings.IndexAny(clean, "/?#"); idx != -1 {
		clean = clean[:idx]
	}
	clean = strings.TrimPrefix(clean, "www.")
	if strings.Contains(clean, ".") && !strings.Contains(clean, " ") {
		return clean
	}
	return ""
}

func BuildInstitutionFaviconURL(domain string) string {
	if domain == "" {
		return ""
	}
	return fmt.Sprintf("https://www.google.com/s2/favicons?domain=%s&sz=64", domain)
}

func (s *Service) CreateInstitution(ctx context.Context, rCtx Context, inst *Institution) (*Institution, error) {
	if err := inst.Init(); err != nil {
		return nil, err
	}
	if err := inst.Validate(); err != nil {
		return nil, err
	}
	if err := s.deps.InstitutionStore.Create(ctx, rCtx, inst); err != nil {
		return nil, err
	}
	return inst, nil
}

func (s *Service) GetInstitution(ctx context.Context, rCtx Context, id InstitutionID) (*Institution, error) {
	return s.deps.InstitutionStore.GetByID(ctx, rCtx, id)
}

func (s *Service) UpdateInstitution(ctx context.Context, rCtx Context, inst *Institution, mask []string) (*Institution, error) {
	const op errors.Op = "domain/finance.UpdateInstitution"

	existing, err := s.deps.InstitutionStore.GetByID(ctx, rCtx, inst.ID)
	if err != nil {
		return nil, err
	}
	if inst.Version > 0 && inst.Version != existing.Version {
		return nil, errors.E(op, errors.Conflict, VersionMismatch, "update failed: institution not found or version mismatch")
	}
	if err := existing.ApplyPatch(inst, mask); err != nil {
		return nil, err
	}
	if err := s.deps.InstitutionStore.Update(ctx, rCtx, existing); err != nil {
		return nil, err
	}
	return existing, nil
}

func (s *Service) DeleteInstitution(ctx context.Context, rCtx Context, id InstitutionID, opts DeleteOptions) error {
	return s.deps.InstitutionStore.Delete(ctx, rCtx, id, opts)
}

func (s *Service) ListInstitutions(ctx context.Context, rCtx Context, filter *ListInstitutionsFilter) (*paging.Page[*Institution], error) {
	return s.deps.InstitutionStore.ListBySpace(ctx, rCtx, filter)
}

func (s *Service) GetInstitutionsByIDs(ctx context.Context, rCtx Context, ids []InstitutionID) ([]*Institution, error) {
	return s.deps.InstitutionStore.GetByIDs(ctx, rCtx, ids)
}

func (s *Service) ResolveInstitution(ctx context.Context, rCtx Context, name string) (*ResolveInstitutionResult, error) {
	cleanName := strings.TrimSpace(name)
	domain := AutoResolveInstitutionDomain(cleanName)
	logoURL := ""
	if domain != "" {
		logoURL = fmt.Sprintf("https://www.google.com/s2/favicons?domain=%s&sz=64", domain)
	}

	result := &ResolveInstitutionResult{
		Name:    cleanName,
		Domain:  domain,
		LogoURL: logoURL,
		Color:   "indigo",
	}

	existing, err := s.deps.InstitutionStore.GetByName(ctx, rCtx, cleanName)
	if err == nil && existing != nil {
		result.ExistingInstitutionID = &existing.ID
		result.ExistingInstitutionName = existing.Name
		result.Domain = existing.Domain
		result.LogoURL = existing.LogoURL
		result.Color = existing.Color
	}

	return result, nil
}

// ResolveAccountOpts defines search criteria for resolving workspace accounts.
type ResolveAccountOpts struct {
	AccountID   string
	AccountName string
	LastFour    string
	Currency    string
}

// ResolveAccount resolves the best matching account for a given space using ID -> Name + Currency -> LastFour + Currency -> Single Active Account Fallback.
func (s *Service) ResolveAccount(ctx context.Context, rCtx Context, opts ResolveAccountOpts) (*Account, error) {
	if err := rCtx.SpaceID().Validate(); err != nil {
		return nil, err
	}

	activeOnly := true
	page, err := s.deps.AccountStore.ListBySpace(ctx, rCtx, &ListAccountsFilter{
		PageSize:   1000,
		ActiveOnly: &activeOnly,
	})
	if err != nil {
		return nil, fmt.Errorf("list accounts for resolution: %w", err)
	}
	accounts := page.Items
	if len(accounts) == 0 {
		return nil, nil
	}

	// 1. Match by explicit AccountID
	if opts.AccountID != "" {
		aID, err := ParseAccountID(opts.AccountID)
		if err == nil {
			for _, acc := range accounts {
				if acc.ID == aID {
					return acc, nil
				}
			}
		}
	}

	// 2. Match by Account Name (Priority 1: Currency match, Priority 2: Name match fallback)
	if opts.AccountName != "" {
		for _, acc := range accounts {
			if strings.EqualFold(acc.Name, opts.AccountName) && (opts.Currency == "" || string(acc.Currency) == opts.Currency) {
				return acc, nil
			}
		}
		for _, acc := range accounts {
			if strings.EqualFold(acc.Name, opts.AccountName) {
				return acc, nil
			}
		}
	}

	// 3. Match by Card LastFour (Priority 1: Currency match, Priority 2: LastFour match fallback)
	if opts.LastFour != "" {
		for _, acc := range accounts {
			if acc.LastFour == opts.LastFour && (opts.Currency == "" || string(acc.Currency) == opts.Currency) {
				return acc, nil
			}
		}
		for _, acc := range accounts {
			if acc.LastFour == opts.LastFour {
				return acc, nil
			}
		}
	}

	// 4. Single Active Account Fallback (only if no explicit search criteria provided)
	if opts.AccountID == "" && opts.AccountName == "" && opts.LastFour == "" && len(accounts) == 1 {
		return accounts[0], nil
	}

	return nil, nil
}

// ImportStatement parses and saves a statement with its statement lines.
func (s *Service) ImportStatement(ctx context.Context, rCtx Context, accountID AccountID, stmt *Statement) (*Statement, error) {
	if stmt == nil {
		return nil, errors.New("statement is required")
	}
	if err := rCtx.SpaceID().Validate(); err != nil {
		return nil, err
	}
	if err := accountID.Validate(); err != nil {
		return nil, err
	}

	// 1. Verify account exists
	acc, err := s.deps.AccountStore.GetByID(ctx, rCtx, accountID)
	if err != nil {
		return nil, fmt.Errorf("verify account: %w", err)
	}
	stmt.AccountID = acc.ID

	// 2. Initialize statement properties
	if err := stmt.Init(); err != nil {
		return nil, err
	}
	stmt.StatementDate = rCtx.Date(stmt.StatementDate)

	// 3. Decode lines from the statement model
	lines, err := stmt.DecodeLines()
	if err != nil {
		return nil, err
	}

	if err := stmt.Validate(); err != nil {
		return nil, err
	}

	// 4. Create statement and lines in database
	if err := s.deps.StatementStore.Create(ctx, rCtx, stmt, lines); err != nil {
		return nil, err
	}

	return stmt, nil
}

// GetStatement retrieves a statement by its ID.
func (s *Service) GetStatement(ctx context.Context, rCtx Context, id StatementID) (*Statement, error) {
	if err := rCtx.SpaceID().Validate(); err != nil {
		return nil, err
	}
	if err := id.Validate(); err != nil {
		return nil, err
	}
	return s.deps.StatementStore.GetByID(ctx, rCtx, id)
}

// DeleteStatement deletes a statement and its lines (discarding it).
func (s *Service) DeleteStatement(ctx context.Context, rCtx Context, id StatementID, opts DeleteOptions) error {
	if err := rCtx.SpaceID().Validate(); err != nil {
		return err
	}
	if err := id.Validate(); err != nil {
		return err
	}
	existing, err := s.deps.StatementStore.GetByID(ctx, rCtx, id)
	if err != nil {
		return err
	}
	if existing.Status == StatementStatusCompleted {
		return errors.New("cannot delete a completed statement reconciliation")
	}
	return s.deps.StatementStore.Delete(ctx, rCtx, id, opts)
}

// ListStatements lists statements in a workspace with filters.
func (s *Service) ListStatements(ctx context.Context, rCtx Context, filter *ListStatementsFilter) (*paging.Page[*Statement], error) {
	if err := rCtx.SpaceID().Validate(); err != nil {
		return nil, err
	}
	return s.deps.StatementStore.List(ctx, rCtx, filter)
}

// ListStatementLines lists all statement lines for a statement and resolves suggestions dynamically.
func (s *Service) ListStatementLines(ctx context.Context, rCtx Context, statementID StatementID) ([]*StatementLine, error) {
	if err := rCtx.SpaceID().Validate(); err != nil {
		return nil, err
	}
	if err := statementID.Validate(); err != nil {
		return nil, err
	}
	stmt, err := s.deps.StatementStore.GetByID(ctx, rCtx, statementID)
	if err != nil {
		return nil, err
	}
	lines, err := s.deps.StatementStore.ListLines(ctx, rCtx, statementID)
	if err != nil {
		return nil, err
	}

	// Resolve dynamic suggestions in memory
	if err := s.resolveSuggestions(ctx, rCtx, stmt.AccountID, lines); err != nil {
		log.Error(ctx, "failed to resolve reconciliation suggestions", log.Err(err))
	}

	return lines, nil
}

// UpdateStatementLine updates a statement line draft choice.
func (s *Service) UpdateStatementLine(ctx context.Context, rCtx Context, line *StatementLine, mask []string) (*StatementLine, error) {
	const op errors.Op = "domain/finance.UpdateStatementLine"

	if err := rCtx.SpaceID().Validate(); err != nil {
		return nil, errors.E(op, errors.Invalid, err)
	}
	if err := line.ID.Validate(); err != nil {
		return nil, errors.E(op, errors.Invalid, err)
	}

	existing, err := s.deps.StatementStore.GetLineByID(ctx, rCtx, line.ID)
	if err != nil {
		return nil, err
	}
	if line.Version > 0 && line.Version != existing.Version {
		return nil, errors.E(op, errors.Conflict, VersionMismatch, "update failed: statement line not found or version mismatch")
	}

	stmt, err := s.deps.StatementStore.GetByID(ctx, rCtx, existing.StatementID)
	if err != nil {
		return nil, err
	}

	if stmt.Status == StatementStatusCompleted {
		return nil, errors.E(op, errors.Precondition, "cannot update statement line draft in a completed statement")
	}

	if err := existing.ApplyPatch(line, mask); err != nil {
		return nil, err
	}

	if err := s.deps.StatementStore.UpdateLineDraft(ctx, rCtx, existing); err != nil {
		return nil, err
	}

	return existing, nil
}

// UpdateStatement updates statement metadata and balances.
func (s *Service) UpdateStatement(ctx context.Context, rCtx Context, stmt *Statement, mask []string) (*Statement, error) {
	const op errors.Op = "domain/finance.UpdateStatement"

	if err := rCtx.SpaceID().Validate(); err != nil {
		return nil, errors.E(op, errors.Invalid, err)
	}
	if err := stmt.ID.Validate(); err != nil {
		return nil, errors.E(op, errors.Invalid, err)
	}

	existing, err := s.deps.StatementStore.GetByID(ctx, rCtx, stmt.ID)
	if err != nil {
		return nil, err
	}
	if stmt.Version > 0 && stmt.Version != existing.Version {
		return nil, errors.E(op, errors.Conflict, VersionMismatch, "update failed: statement not found or version mismatch")
	}

	if existing.Status == StatementStatusCompleted {
		return nil, errors.E(op, errors.Precondition, "cannot update a completed statement")
	}

	if err := existing.ApplyPatch(stmt, mask); err != nil {
		return nil, err
	}
	if !existing.StatementDate.IsZero() {
		existing.StatementDate = rCtx.Date(existing.StatementDate)
	}

	if err := s.deps.StatementStore.Update(ctx, rCtx, existing); err != nil {
		return nil, err
	}

	return existing, nil
}

// InvertStatementSigns inverts all line amounts and negates statement starting/ending balances in a single transaction.
func (s *Service) InvertStatementSigns(ctx context.Context, rCtx Context, id StatementID) (*Statement, []*StatementLine, error) {
	if err := rCtx.SpaceID().Validate(); err != nil {
		return nil, nil, err
	}
	if err := id.Validate(); err != nil {
		return nil, nil, err
	}

	stmt, err := s.deps.StatementStore.GetByID(ctx, rCtx, id)
	if err != nil {
		return nil, nil, err
	}
	lines, err := s.deps.StatementStore.ListLines(ctx, rCtx, id)
	if err != nil {
		return nil, nil, err
	}

	if err := stmt.InvertSigns(); err != nil {
		return nil, nil, err
	}
	for _, line := range lines {
		line.InvertSign()
	}

	// Re-resolve dynamic suggestions on the inverted lines
	_ = s.resolveSuggestions(ctx, rCtx, stmt.AccountID, lines)

	if err := s.deps.StatementStore.UpdateStatementWithLines(ctx, rCtx, stmt, lines); err != nil {
		return nil, nil, err
	}

	return stmt, lines, nil
}

// CompleteStatement finalizes and commits the statement.
func (s *Service) CompleteStatement(ctx context.Context, rCtx Context, id StatementID) (*Statement, error) {
	const op errors.Op = "domain/finance.CompleteStatement"

	if err := rCtx.SpaceID().Validate(); err != nil {
		return nil, errors.E(op, errors.Invalid, err)
	}
	if err := id.Validate(); err != nil {
		return nil, errors.E(op, errors.Invalid, err)
	}

	stmt, err := s.deps.StatementStore.GetByID(ctx, rCtx, id)
	if err != nil {
		return nil, err
	}
	if stmt.Status == StatementStatusCompleted {
		return nil, errors.E(op, errors.Precondition, "statement reconciliation is already completed")
	}

	lines, err := s.deps.StatementStore.ListLines(ctx, rCtx, id)
	if err != nil {
		return nil, err
	}

	// 1. Validate total discrepancy balance is zero
	var netFlow int64
	for _, l := range lines {
		if l.Status != StatementLineStatusSkipped {
			netFlow += l.Amount
		}
	}
	expectedFlow := stmt.StatementEndingBalance - stmt.StatementStartingBalance
	if netFlow != expectedFlow {
		return nil, errors.E(op, errors.Precondition, StatementBalanceMismatch, "statement finalization failed: cash flow sum of matches does not equal statement balance difference")
	}

	// 2. Fetch account for default currency
	acc, err := s.deps.AccountStore.GetByID(ctx, rCtx, stmt.AccountID)
	if err != nil {
		return nil, fmt.Errorf("fetch statement account: %w", err)
	}

	for _, l := range lines {
		switch l.Status {
		case StatementLineStatusMatched:
			if l.MatchedTransactionID == nil || *l.MatchedTransactionID == "" {
				return nil, fmt.Errorf("line index %d status is MATCHED but matched_transaction_id is empty", l.RowIndex)
			}
			// Update matched transaction metadata with reconciliation flag
			existingTxn, err := s.deps.TransactionStore.GetByID(ctx, rCtx, *l.MatchedTransactionID)
			if err == nil {
				if l.Action.OverwriteTransaction != nil && *l.Action.OverwriteTransaction {
					absLineAmount := l.Amount
					if absLineAmount < 0 {
						absLineAmount = -absLineAmount
					}
					diff := absLineAmount - existingTxn.Amount
					if diff != 0 && existingTxn.AccountID != nil {
						isReversal := diff < 0
						absDiff := diff
						if isReversal {
							absDiff = -diff
						}
						if err := s.adjustAccountBalance(ctx, rCtx, *existingTxn.AccountID, absDiff, existingTxn.Type, isReversal); err != nil {
							return nil, fmt.Errorf("failed to adjust account balance delta: %w", err)
						}
					}
					existingTxn.Amount = absLineAmount
					if l.Description != "" {
						existingTxn.Description = l.Description
					}
				}
				existingTxn.Metadata.Reconciled = true
				existingTxn.Metadata.ReconciliationStatementID = string(stmt.ID)
				existingTxn.Metadata.ReconciledAt = new(time.Now().UTC())
				_ = s.deps.TransactionStore.Update(ctx, rCtx, existingTxn)
			}

		case StatementLineStatusSkipped:
			// Skipped lines require no transaction generation

		default:
			switch l.Action.Type {
			case StatementLineActionTypeMatch:
				if l.Action.TransactionID == nil || *l.Action.TransactionID == "" {
					return nil, fmt.Errorf("line index %d Action MATCH requires transaction_id", l.RowIndex)
				}
				existingTxn, err := s.deps.TransactionStore.GetByID(ctx, rCtx, *l.Action.TransactionID)
				if err != nil {
					return nil, fmt.Errorf("fetch matched transaction: %w", err)
				}
				if l.Action.OverwriteTransaction != nil && *l.Action.OverwriteTransaction {
					absLineAmount := l.Amount
					if absLineAmount < 0 {
						absLineAmount = -absLineAmount
					}
					diff := absLineAmount - existingTxn.Amount
					if diff != 0 && existingTxn.AccountID != nil {
						isReversal := diff < 0
						absDiff := diff
						if isReversal {
							absDiff = -diff
						}
						if err := s.adjustAccountBalance(ctx, rCtx, *existingTxn.AccountID, absDiff, existingTxn.Type, isReversal); err != nil {
							return nil, fmt.Errorf("failed to adjust account balance delta: %w", err)
						}
					}
					existingTxn.Amount = absLineAmount
					if l.Description != "" {
						existingTxn.Description = l.Description
					}
				}
				existingTxn.Metadata.Reconciled = true
				existingTxn.Metadata.ReconciliationStatementID = string(stmt.ID)
				existingTxn.Metadata.ReconciledAt = new(time.Now().UTC())
				if err := s.deps.TransactionStore.Update(ctx, rCtx, existingTxn); err != nil {
					return nil, fmt.Errorf("update matched transaction: %w", err)
				}
				l.MatchedTransactionID = l.Action.TransactionID
				l.Status = StatementLineStatusMatched

			case StatementLineActionTypeCreateExpense:
				txn, err := l.NewTransaction(StatementLineTransactionOpts{
					AccountID:    stmt.AccountID,
					Currency:     acc.Currency,
					Type:         TransactionTypeExpense,
					BudgetID:     l.Action.BudgetID,
					FallbackDate: stmt.StatementDate,
					Location:     rCtx.Location(),
				})
				if err != nil {
					return nil, err
				}
				if err := s.createTransaction(ctx, rCtx, txn); err != nil {
					return nil, fmt.Errorf("create expense transaction for line %d: %w", l.RowIndex, err)
				}
				l.MatchedTransactionID = &txn.ID
				l.Status = StatementLineStatusMatched

			case StatementLineActionTypeCreateIncome:
				txn, err := l.NewTransaction(StatementLineTransactionOpts{
					AccountID:    stmt.AccountID,
					Currency:     acc.Currency,
					Type:         TransactionTypeIncome,
					FallbackDate: stmt.StatementDate,
					Location:     rCtx.Location(),
				})
				if err != nil {
					return nil, err
				}
				if err := s.createTransaction(ctx, rCtx, txn); err != nil {
					return nil, fmt.Errorf("create income transaction for line %d: %w", l.RowIndex, err)
				}
				l.MatchedTransactionID = &txn.ID
				l.Status = StatementLineStatusMatched

			case StatementLineActionTypeCreateTransfer:
				if l.Action.CounterpartAccountID == nil || *l.Action.CounterpartAccountID == "" {
					return nil, fmt.Errorf("line index %d Action CREATE_TRANSFER requires counterpart_account_id", l.RowIndex)
				}

				transfer, transferOpts, err := l.NewTransfer(StatementLineTransferOpts{
					StatementAccountID:   stmt.AccountID,
					CounterpartAccountID: *l.Action.CounterpartAccountID,
					FallbackDate:         stmt.StatementDate,
					Location:             rCtx.Location(),
				})
				if err != nil {
					return nil, err
				}

				_, outflowTxn, inflowTxn, err := s.createTransfer(ctx, rCtx, transfer, transferOpts)
				if err != nil {
					return nil, fmt.Errorf("create transfer for line %d: %w", l.RowIndex, err)
				}

				if l.Amount < 0 {
					l.MatchedTransactionID = &outflowTxn.ID
				} else {
					l.MatchedTransactionID = &inflowTxn.ID
				}
				l.Status = StatementLineStatusMatched

			case StatementLineActionTypeConfirmScheduled:
				if l.Action.ScheduledTransactionID == nil {
					return nil, fmt.Errorf("line index %d Action CONFIRM_SCHEDULED requires scheduled_transaction_id", l.RowIndex)
				}
				if err := l.Action.ScheduledTransactionID.Validate(); err != nil {
					return nil, fmt.Errorf("line index %d Action CONFIRM_SCHEDULED invalid scheduled_transaction_id: %w", l.RowIndex, err)
				}

				budgetID := l.Action.BudgetID
				if budgetID == nil {
					if payment, err := s.deps.ScheduledTransactionStore.GetByID(ctx, rCtx, *l.Action.ScheduledTransactionID); err == nil {
						budgetID = payment.BudgetID
					}
				}

				txn, err := l.NewTransaction(StatementLineTransactionOpts{
					AccountID:    stmt.AccountID,
					Currency:     acc.Currency,
					Type:         TransactionTypeExpense,
					BudgetID:     budgetID,
					FallbackDate: stmt.StatementDate,
					Location:     rCtx.Location(),
				})
				if err != nil {
					return nil, err
				}
				if err := s.createTransaction(ctx, rCtx, txn); err != nil {
					return nil, fmt.Errorf("create transaction for scheduled line %d: %w", l.RowIndex, err)
				}
				if err := s.handleScheduledTransactionLinkForTransaction(ctx, rCtx, txn, string(*l.Action.ScheduledTransactionID)); err != nil {
					return nil, fmt.Errorf("link scheduled transaction for line %d: %w", l.RowIndex, err)
				}
				l.MatchedTransactionID = &txn.ID
				l.Status = StatementLineStatusMatched

			case StatementLineActionTypeCreateRepayment:
				if l.Action.BorrowingID == nil {
					return nil, fmt.Errorf("line index %d Action CREATE_REPAYMENT requires borrowing_id", l.RowIndex)
				}
				if err := l.Action.BorrowingID.Validate(); err != nil {
					return nil, fmt.Errorf("line index %d Action CREATE_REPAYMENT invalid borrowing_id: %w", l.RowIndex, err)
				}

				txnType := TransactionTypeExpense
				if l.Amount > 0 {
					txnType = TransactionTypeIncome
				}

				txn, err := l.NewTransaction(StatementLineTransactionOpts{
					AccountID:    stmt.AccountID,
					Currency:     acc.Currency,
					Type:         txnType,
					BudgetID:     l.Action.BudgetID,
					FallbackDate: stmt.StatementDate,
					Location:     rCtx.Location(),
				})
				if err != nil {
					return nil, err
				}
				if err := s.createTransaction(ctx, rCtx, txn); err != nil {
					return nil, fmt.Errorf("create transaction for repayment line %d: %w", l.RowIndex, err)
				}
				if err := s.handleBorrowingLinkForTransaction(ctx, rCtx, txn, string(*l.Action.BorrowingID), BorrowingLinkTypeRepayment); err != nil {
					return nil, fmt.Errorf("link borrowing repayment for line %d: %w", l.RowIndex, err)
				}
				l.MatchedTransactionID = &txn.ID
				l.Status = StatementLineStatusMatched

			case StatementLineActionTypeSkip:
				l.Status = StatementLineStatusSkipped
			}

			// Persist updated line draft status & matched_transaction_id
			if err := s.deps.StatementStore.UpdateLineDraft(ctx, rCtx, l); err != nil {
				return nil, fmt.Errorf("update statement line %s: %w", l.ID, err)
			}
		}
	}

	// 3. Mark Statement status as completed
	stmt.Status = StatementStatusCompleted
	stmt.UpdateTime = time.Now().UTC()
	if err := s.deps.StatementStore.Update(ctx, rCtx, stmt); err != nil {
		return nil, fmt.Errorf("update statement status: %w", err)
	}

	return stmt, nil
}

// resolveSuggestions computes dynamic suggestions in memory for fetched statement lines.
func (s *Service) resolveSuggestions(ctx context.Context, rCtx Context, accountID AccountID, lines []*StatementLine) error {
	// 1. Fetch transactions for the account
	page, err := s.deps.TransactionStore.ListBySpace(ctx, rCtx, &TransactionFilter{
		AccountID: &accountID,
		PageSize:  1000,
	})
	if err != nil {
		return err
	}
	txns := page.Items

	// 2. Fetch last 500 transactions in space to build category classification maps
	historyPage, err := s.deps.TransactionStore.ListBySpace(ctx, rCtx, &TransactionFilter{
		PageSize: 500,
	})
	var history []*Transaction
	if err == nil {
		history = historyPage.Items
	}

	// Build classification maps
	budgetMap := make(map[string]BudgetID)
	for _, t := range history {
		if t.BudgetID != nil && t.Description != "" {
			descLower := strings.ToLower(t.Description)
			budgetMap[descLower] = *t.BudgetID
		}
	}

	// 3. Resolve suggestions for each line
	for _, l := range lines {
		sugg := &StatementLineSuggestions{
			Matches: []*Transaction{},
		}

		if l.Amount < 0 {
			sugg.TransactionType = TransactionTypeExpense
		} else {
			sugg.TransactionType = TransactionTypeIncome
		}

		// Suggest budget category
		descLower := strings.ToLower(l.Description)
		for d, bID := range budgetMap {
			if strings.Contains(descLower, d) || strings.Contains(d, descLower) {
				idCopy := bID
				sugg.BudgetID = &idCopy
				break
			}
		}

		// Suggest transfer type if description fits
		if sugg.TransactionType == TransactionTypeExpense {
			if strings.Contains(descLower, "transfer") || strings.Contains(descLower, "wire") || strings.Contains(descLower, "zelle") {
				sugg.TransactionType = TransactionTypeTransferOut
			}
		} else {
			if strings.Contains(descLower, "transfer") || strings.Contains(descLower, "wire") || strings.Contains(descLower, "zelle") {
				sugg.TransactionType = TransactionTypeTransferIn
			}
		}

		// Suggest matching transactions
		lDate, err := time.Parse("2006-01-02", l.DateStr)
		if err == nil {
			lAmountAbs := l.Amount
			if lAmountAbs < 0 {
				lAmountAbs = -lAmountAbs
			}

			for _, t := range txns {
				if t.Amount == lAmountAbs {
					dateDiff := t.EffectiveDate.Sub(lDate)
					if dateDiff < 0 {
						dateDiff = -dateDiff
					}
					daysDiff := int(dateDiff.Hours() / 24)
					if daysDiff <= 3 {
						sugg.Matches = append(sugg.Matches, t)
					}
				}
			}
		}

		l.Suggestions = sugg
	}

	return nil
}
