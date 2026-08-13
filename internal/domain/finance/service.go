package finance

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/id"
	"github.com/masterkeysrd/saturn/internal/platform/paging"
)

// Dependencies defines the required persistence adapters for the service.
type Dependencies struct {
	SettingsStore         SettingsStore
	BudgetStore           BudgetStore
	PeriodStore           PeriodStore
	ExchangeRateStore     ExchangeRateStore
	TransactionStore      TransactionStore
	InsightsStore         InsightsStore
	RecurringExpenseStore RecurringExpenseStore
	ScheduledPaymentStore ScheduledPaymentStore
	BorrowingStore        BorrowingStore
	AccountStore          AccountStore
	TransferStore         TransferStore
	TransactionEventStore TransactionEventStore
	InboxItemStore        InboxItemStore
	InstitutionStore      InstitutionStore
}

// Service implements the domain-level finance operations.
type Service struct {
	deps Dependencies
}

// NewService instantiates a new Service.
func NewService(deps Dependencies) *Service {
	return &Service{deps: deps}
}

// ConfigureFinance initializes workspace base currency settings if not already configured.
func (s *Service) ConfigureFinance(ctx context.Context, settings *FinanceSettings) (*FinanceSettings, error) {
	if err := settings.Validate(); err != nil {
		return nil, err
	}

	existing, err := s.deps.SettingsStore.GetByID(ctx, settings.SpaceID)
	if err == nil {
		// Base currency is immutable once configured
		return existing, nil
	}

	if !errors.Is(err, ErrSettingsNotFound) {
		return nil, err
	}

	now := time.Now().UTC()
	settings.CreateTime = now
	settings.UpdateTime = now

	if err := s.deps.SettingsStore.Create(ctx, settings); err != nil {
		return nil, err
	}

	// Automatically initialize a default Cash Account for this space
	if defaultCashAcc, err := settings.NewDefaultCashAccount(); err == nil {
		if _, err := s.CreateAccount(ctx, defaultCashAcc); err != nil {
			slog.WarnContext(ctx, "failed to create default cash account", "space_id", settings.SpaceID, "error", err)
		}
	}

	return settings, nil
}

// GetFinanceSettings retrieves settings for a workspace.
func (s *Service) GetFinanceSettings(ctx context.Context, spaceID SpaceID) (*FinanceSettings, error) {
	if string(spaceID) == "" {
		return nil, errors.New("space ID is required")
	}
	return s.deps.SettingsStore.GetByID(ctx, spaceID)
}

// CreateBudget creates a new budget template in a workspace.
func (s *Service) CreateBudget(ctx context.Context, budget *Budget) (*Budget, error) {
	if err := budget.Init(); err != nil {
		return nil, err
	}
	if err := budget.Validate(); err != nil {
		return nil, err
	}

	// Verify workspace settings exist
	if _, err := s.deps.SettingsStore.GetByID(ctx, budget.SpaceID); err != nil {
		return nil, fmt.Errorf("verify workspace settings: %w", err)
	}

	if err := s.deps.BudgetStore.Create(ctx, budget); err != nil {
		return nil, err
	}

	return budget, nil
}

// UpdateBudget modifies an existing budget template, optionally applying a field mask.
// If mask is nil or empty, all registered patchable fields are updated.
func (s *Service) UpdateBudget(ctx context.Context, budget *Budget, mask []string) (*Budget, error) {
	existing, err := s.deps.BudgetStore.GetByID(ctx, budget.SpaceID, budget.ID)
	if err != nil {
		return nil, err
	}

	if budget.Version > 0 && budget.Version != existing.Version {
		return nil, ErrBudgetVersionMismatch
	}

	if err := existing.ApplyPatch(budget, mask); err != nil {
		return nil, err
	}

	if err := s.deps.BudgetStore.Update(ctx, existing); err != nil {
		return nil, err
	}

	return existing, nil
}

// DeleteBudget removes a budget.
func (s *Service) DeleteBudget(ctx context.Context, spaceID SpaceID, id BudgetID, opts DeleteOptions) error {
	if string(id) == "" {
		return errors.New("budget ID is required")
	}

	hasTxns, err := s.deps.TransactionStore.HasTransactions(ctx, spaceID, &TransactionFilter{
		BudgetID: &id,
	})
	if err != nil {
		return err
	}
	if hasTxns {
		return ErrBudgetHasTransactions
	}

	hasScheduled, err := s.deps.ScheduledPaymentStore.HasScheduledPayments(ctx, spaceID, &ListScheduledPaymentsFilter{
		BudgetID: &id,
	})
	if err != nil {
		return err
	}
	if hasScheduled {
		return ErrBudgetHasScheduledPayments
	}

	return s.deps.BudgetStore.Delete(ctx, spaceID, id, opts)
}

// ListBudgets returns the workspace's budgets.
func (s *Service) ListBudgets(ctx context.Context, spaceID SpaceID, filter *ListBudgetsFilter) (*paging.Page[*Budget], error) {
	if string(spaceID) == "" {
		return nil, errors.New("space ID is required")
	}
	return s.deps.BudgetStore.ListBySpace(ctx, spaceID, filter)
}

// GetOrCreatePeriod retrieves or lazily spawns a budget period for a target date.
func (s *Service) GetOrCreatePeriod(ctx context.Context, spaceID SpaceID, budgetID BudgetID, date time.Time) (*BudgetPeriod, error) {
	budget, err := s.deps.BudgetStore.GetByID(ctx, spaceID, budgetID)
	if err != nil {
		return nil, err
	}

	settings, err := s.deps.SettingsStore.GetByID(ctx, budget.SpaceID)
	if err != nil {
		return nil, fmt.Errorf("fetch workspace base currency settings: %w", err)
	}

	startDate, endDate := budget.CalculateBounds(date)

	// Try lookup
	period, err := s.deps.PeriodStore.GetByRange(ctx, budgetID, startDate, endDate)
	if err == nil {
		return period, nil
	}
	if !errors.Is(err, ErrPeriodNotFound) {
		return nil, err
	}

	// Determine exchange rate to base currency
	rate, err := s.resolveExchangeRate(ctx, budget.SpaceID, budget.Currency, settings.BaseCurrency, date, true)
	if err != nil {
		return nil, err
	}

	newPeriod, err := budget.NewPeriod(NewPeriodOpts{
		TargetDate:         date,
		BaseCurrency:       settings.BaseCurrency,
		ExchangeRateToBase: rate,
	})
	if err != nil {
		return nil, err
	}

	if err := s.deps.PeriodStore.Create(ctx, newPeriod); err != nil {
		return nil, err
	}

	return newPeriod, nil
}

// GetOrCreatePeriods retrieves or lazily spawns budget periods for a slice of budgets in batch.
func (s *Service) GetOrCreatePeriods(ctx context.Context, budgets []*Budget, date time.Time) (map[BudgetID]*BudgetPeriod, error) {
	if len(budgets) == 0 {
		return make(map[BudgetID]*BudgetPeriod), nil
	}

	// Fetch workspace base currency settings once (using the SpaceID of the first budget)
	settings, err := s.deps.SettingsStore.GetByID(ctx, budgets[0].SpaceID)
	if err != nil {
		return nil, fmt.Errorf("fetch workspace base currency settings: %w", err)
	}

	// Calculate bounds for each budget
	keys := make([]PeriodRangeKey, len(budgets))
	boundsMap := make(map[BudgetID]struct{ Start, End time.Time })
	for i, b := range budgets {
		start, end := b.CalculateBounds(date)
		keys[i] = PeriodRangeKey{
			BudgetID:  b.ID,
			StartDate: start,
			EndDate:   end,
		}
		boundsMap[b.ID] = struct{ Start, End time.Time }{Start: start, End: end}
	}

	// 1. Bulk-retrieve existing periods in a single DB query
	existingPeriods, err := s.deps.PeriodStore.GetByRanges(ctx, keys)
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
		rate, err := s.resolveExchangeRate(ctx, b.SpaceID, b.Currency, settings.BaseCurrency, date, true)
		if err != nil {
			return nil, err
		}

		newPeriod, err := b.NewPeriod(NewPeriodOpts{
			StartDate:          bounds.Start,
			EndDate:            bounds.End,
			BaseCurrency:       settings.BaseCurrency,
			ExchangeRateToBase: rate,
		})
		if err != nil {
			return nil, err
		}

		if err := s.deps.PeriodStore.Create(ctx, newPeriod); err != nil {
			return nil, fmt.Errorf("create budget period: %w", err)
		}

		periodsMap[b.ID] = newPeriod
	}

	return periodsMap, nil
}

// AggregateSpentBatch calculates dynamic transaction spent progress for a list of budget period IDs.
func (s *Service) AggregateSpentBatch(ctx context.Context, periodIDs []PeriodID) ([]PeriodSpent, error) {
	if s.deps.TransactionStore == nil {
		return nil, nil
	}
	return s.deps.TransactionStore.AggregateSpentBatch(ctx, periodIDs)
}

// UpdatePeriodLimit modifies the budget limit of a specific period.
func (s *Service) UpdatePeriodLimit(ctx context.Context, id PeriodID, limit int64) error {
	if limit <= 0 {
		return errors.New("limit must be greater than zero")
	}
	return s.deps.PeriodStore.UpdateLimit(ctx, id, limit)
}

// CreateExchangeRate registers a new daily rate record.
func (s *Service) CreateExchangeRate(ctx context.Context, rate *ExchangeRate) (*ExchangeRate, error) {
	if err := rate.Init(); err != nil {
		return nil, err
	}
	if err := rate.Validate(); err != nil {
		return nil, fmt.Errorf("validate exchange rate: %w", err)
	}

	if err := s.deps.ExchangeRateStore.Create(ctx, rate); err != nil {
		return nil, err
	}
	return rate, nil
}

// GetExchangeRateByID retrieves an exact exchange rate record by its ID.
func (s *Service) GetExchangeRateByID(ctx context.Context, spaceID SpaceID, id string) (*ExchangeRate, error) {
	if err := spaceID.Validate(); err != nil {
		return nil, fmt.Errorf("validate space ID: %w", err)
	}
	from, to, t, err := ParseExchangeRateID(id)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrExchangeRateNotFound, err)
	}
	key := ExchangeRateKey{
		SpaceID:      spaceID,
		FromCurrency: from,
		ToCurrency:   to,
		RateDate:     t,
	}
	return s.deps.ExchangeRateStore.GetExactRate(ctx, key)
}

// UpdateExchangeRate corrects the multiplier on an existing exchange rate record.
func (s *Service) UpdateExchangeRate(ctx context.Context, spaceID SpaceID, id string, rate *ExchangeRate) (*ExchangeRate, error) {
	if err := spaceID.Validate(); err != nil {
		return nil, fmt.Errorf("validate space ID: %w", err)
	}

	from, to, t, err := ParseExchangeRateID(id)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrExchangeRateNotFound, err)
	}

	existing, err := s.deps.ExchangeRateStore.GetExactRate(ctx, ExchangeRateKey{
		SpaceID:      spaceID,
		FromCurrency: from,
		ToCurrency:   to,
		RateDate:     t,
	})
	if err != nil {
		return nil, err
	}

	existing.Rate = rate.Rate
	if err := existing.Validate(); err != nil {
		return nil, fmt.Errorf("validate exchange rate: %w", err)
	}

	if err := s.deps.ExchangeRateStore.Update(ctx, existing); err != nil {
		return nil, err
	}
	return existing, nil
}

// ListExchangeRates retrieves paginated rate records.
func (s *Service) ListExchangeRates(ctx context.Context, spaceID SpaceID, filter *ListExchangeRatesFilter) ([]*ExchangeRate, string, error) {
	if err := spaceID.Validate(); err != nil {
		return nil, "", fmt.Errorf("validate space ID: %w", err)
	}
	return s.deps.ExchangeRateStore.ListBySpace(ctx, spaceID, filter)
}

// DeleteExchangeRateByID removes a daily rate conversion rule by ID.
func (s *Service) DeleteExchangeRateByID(ctx context.Context, spaceID SpaceID, id string) error {
	if err := spaceID.Validate(); err != nil {
		return fmt.Errorf("validate space ID: %w", err)
	}
	from, to, t, err := ParseExchangeRateID(id)
	if err != nil {
		return fmt.Errorf("%w: %v", ErrExchangeRateNotFound, err)
	}
	key := ExchangeRateKey{
		SpaceID:      spaceID,
		FromCurrency: from,
		ToCurrency:   to,
		RateDate:     t,
	}
	return s.deps.ExchangeRateStore.Delete(ctx, key)
}

// getExchangeRate resolves the exchange rate for the given key.
// It first looks for the closest rate on or before the target date (backward).
// If no such rate exists, it falls back to the closest rate after the target date (forward fallback).
func (s *Service) getExchangeRate(ctx context.Context, key ExchangeRateKey) (*ExchangeRate, error) {
	rateRecord, err := s.deps.ExchangeRateStore.GetRate(ctx, key)
	if err == nil {
		return rateRecord, nil
	}
	if !errors.Is(err, ErrExchangeRateNotFound) {
		return nil, err
	}

	return s.deps.ExchangeRateStore.GetNextRate(ctx, key)
}

// resolveExchangeRate returns 1.0 for matching currencies, or queries the exchange rate store for cross-currency rates.
// If allowNotFoundFallback is true and no rate is configured, it returns 0.0 without failing.
func (s *Service) resolveExchangeRate(ctx context.Context, spaceID SpaceID, from, to Currency, date time.Time, allowNotFoundFallback bool) (float64, error) {
	if from == to {
		return 1.0, nil
	}
	rateRecord, err := s.getExchangeRate(ctx, ExchangeRateKey{
		SpaceID:      spaceID,
		FromCurrency: from,
		ToCurrency:   to,
		RateDate:     date,
	})
	if err != nil {
		if allowNotFoundFallback && errors.Is(err, ErrExchangeRateNotFound) {
			return 0.0, nil
		}
		return 0.0, fmt.Errorf("fetch exchange rate from %s to %s for date %s: %w", from, to, date.Format("2006-01-02"), err)
	}
	return rateRecord.Rate, nil
}

// CreateExpense logs a new expense transaction.
func (s *Service) CreateExpense(ctx context.Context, txn *Transaction) (*Transaction, error) {
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

	if err := s.createTransaction(ctx, txn); err != nil {
		return nil, err
	}
	return txn, nil
}

// GetTransaction retrieves a transaction by ID for a space.
func (s *Service) GetTransaction(ctx context.Context, spaceID SpaceID, id TransactionID) (*Transaction, error) {
	if err := spaceID.Validate(); err != nil {
		return nil, fmt.Errorf("validate space ID: %w", err)
	}
	if err := id.Validate(); err != nil {
		return nil, fmt.Errorf("validate transaction ID: %w", err)
	}
	return s.deps.TransactionStore.GetByID(ctx, spaceID, id)
}

// DeleteTransaction removes any logged transaction and reverts its account balance impact.
func (s *Service) DeleteTransaction(ctx context.Context, spaceID SpaceID, id TransactionID) error {
	if err := spaceID.Validate(); err != nil {
		return fmt.Errorf("validate space ID: %w", err)
	}
	if err := id.Validate(); err != nil {
		return fmt.Errorf("validate transaction ID: %w", err)
	}
	existing, err := s.deps.TransactionStore.GetByID(ctx, spaceID, id)
	if err != nil {
		return fmt.Errorf("fetch existing transaction to delete: %w", err)
	}
	return s.deleteTransaction(ctx, existing)
}

// UpdateExpense modifies an existing expense transaction.
func (s *Service) UpdateExpense(ctx context.Context, txn *Transaction) (*Transaction, error) {
	txn.Type = TransactionTypeExpense
	if txn.BudgetID == nil {
		return nil, errors.New("expense transaction requires a budget ID")
	}

	existing, err := s.deps.TransactionStore.GetByID(ctx, txn.SpaceID, txn.ID)
	if err != nil {
		return nil, fmt.Errorf("fetch existing transaction: %w", err)
	}

	if err := s.updateTransaction(ctx, txn, existing); err != nil {
		return nil, err
	}

	// Log manual edit transaction event with field diff
	if diff := existing.Diff(txn); len(diff) > 0 {
		_, _ = s.LogTransactionEvent(ctx, &TransactionEvent{
			SpaceID:       txn.SpaceID,
			TransactionID: txn.ID,
			EventType:     "MANUAL_EDIT",
			Metadata:      diff,
		})
	}

	return txn, nil
}

// ListTransactions retrieves paginated transactions.
func (s *Service) ListTransactions(ctx context.Context, spaceID SpaceID, filter *TransactionFilter) (*paging.Page[*Transaction], error) {
	if err := spaceID.Validate(); err != nil {
		return nil, fmt.Errorf("validate space ID: %w", err)
	}
	return s.deps.TransactionStore.ListBySpace(ctx, spaceID, filter)
}

// GetSpentInsights computes aggregated outflow analytics and trends for a space.
func (s *Service) GetSpentInsights(ctx context.Context, req *GetSpentInsightsRequest) (*SpentInsights, error) {
	g, start, end, err := req.ResolveRange()
	if err != nil {
		return nil, err
	}

	settings, err := s.deps.SettingsStore.GetByID(ctx, req.SpaceID)
	if err != nil {
		return nil, fmt.Errorf("verify workspace settings: %w", err)
	}

	trendRows, err := s.deps.InsightsStore.GetSpentTrend(ctx, &SpentTrendFilter{
		SpaceID:     req.SpaceID,
		Granularity: g,
		StartDate:   start,
		EndDate:     end,
	})
	if err != nil {
		return nil, fmt.Errorf("fetch spent trend: %w", err)
	}

	distRows, err := s.deps.InsightsStore.GetBudgetDistribution(ctx, &BudgetDistributionFilter{
		SpaceID:   req.SpaceID,
		StartDate: start,
		EndDate:   end,
	})
	if err != nil {
		return nil, fmt.Errorf("fetch budget distributions: %w", err)
	}

	topRows, err := s.deps.InsightsStore.GetTopExpenses(ctx, &TopExpensesFilter{
		SpaceID:   req.SpaceID,
		StartDate: start,
		EndDate:   end,
		Limit:     5,
	})
	if err != nil {
		return nil, fmt.Errorf("fetch top expenses: %w", err)
	}

	return BuildSpentInsights(g, start, end, string(settings.BaseCurrency), trendRows, distRows, topRows), nil
}

// CreateRecurringExpense configures a new recurring expense rule.
func (s *Service) CreateRecurringExpense(ctx context.Context, re *RecurringExpense) (*RecurringExpense, error) {
	if err := re.Init(); err != nil {
		return nil, err
	}
	if err := re.Validate(); err != nil {
		return nil, err
	}

	if err := s.deps.RecurringExpenseStore.Create(ctx, re); err != nil {
		return nil, err
	}
	return re, nil
}

// GetRecurringExpense retrieves a recurring expense by ID for a space.
func (s *Service) GetRecurringExpense(ctx context.Context, spaceID SpaceID, id RecurringExpenseID) (*RecurringExpense, error) {
	if err := spaceID.Validate(); err != nil {
		return nil, err
	}
	if err := id.Validate(); err != nil {
		return nil, err
	}
	return s.deps.RecurringExpenseStore.GetByID(ctx, spaceID, id)
}

// GetRecurringExpenses retrieves a batch of recurring expenses by their IDs for a space.
func (s *Service) GetRecurringExpenses(ctx context.Context, spaceID SpaceID, ids []RecurringExpenseID) ([]*RecurringExpense, error) {
	if err := spaceID.Validate(); err != nil {
		return nil, err
	}
	for _, id := range ids {
		if err := id.Validate(); err != nil {
			return nil, err
		}
	}
	return s.deps.RecurringExpenseStore.GetByIDs(ctx, spaceID, ids)
}

// UpdateRecurringExpense modifies an existing recurring expense template, optionally applying a field mask.
// If mask is nil or empty, all registered patchable fields are updated.
func (s *Service) UpdateRecurringExpense(ctx context.Context, re *RecurringExpense, mask []string) (*RecurringExpense, error) {
	existing, err := s.deps.RecurringExpenseStore.GetByID(ctx, re.SpaceID, re.ID)
	if err != nil {
		return nil, err
	}

	if re.Version > 0 && re.Version != existing.Version {
		return nil, ErrRecurringExpenseVersionMismatch
	}

	if err := existing.ApplyPatch(re, mask); err != nil {
		return nil, err
	}

	if err := existing.Validate(); err != nil {
		return nil, err
	}

	if err := s.deps.RecurringExpenseStore.Update(ctx, existing); err != nil {
		return nil, err
	}
	return existing, nil
}

// DeleteRecurringExpense deletes a recurring expense rule.
func (s *Service) DeleteRecurringExpense(ctx context.Context, id RecurringExpenseID, opts DeleteOptions) error {
	if err := id.Validate(); err != nil {
		return err
	}
	return s.deps.RecurringExpenseStore.Delete(ctx, id, opts)
}

// ListRecurringExpenses lists recurring expenses for a workspace.
func (s *Service) ListRecurringExpenses(ctx context.Context, spaceID SpaceID, filter *ListRecurringExpensesFilter) (*paging.Page[*RecurringExpense], error) {
	if err := spaceID.Validate(); err != nil {
		return nil, err
	}
	return s.deps.RecurringExpenseStore.ListBySpace(ctx, spaceID, filter)
}

// ListScheduledPayments lists scheduled payments for a workspace.
func (s *Service) ListScheduledPayments(ctx context.Context, spaceID SpaceID, filter *ListScheduledPaymentsFilter) (*paging.Page[*ScheduledPayment], error) {
	if err := spaceID.Validate(); err != nil {
		return nil, err
	}
	return s.deps.ScheduledPaymentStore.ListBySpace(ctx, spaceID, filter)
}

// ConfirmScheduledPaymentRequest represents parameters to confirm a scheduled payment.
type ConfirmScheduledPaymentRequest struct {
	SpaceID         SpaceID
	PaymentID       ScheduledPaymentID
	TransactionDate time.Time
	EffectiveDate   time.Time
	ActualAmount    int64
	Description     string
	AccountID       *AccountID
	BudgetID        *BudgetID
	Currency        *Currency
}

// ConfirmScheduledPayment clears a scheduled payment by promoting it to a permanent transaction.
func (s *Service) ConfirmScheduledPayment(ctx context.Context, req ConfirmScheduledPaymentRequest) (*Transaction, error) {
	payment, err := s.deps.ScheduledPaymentStore.GetByID(ctx, req.SpaceID, req.PaymentID)
	if err != nil {
		return nil, err
	}

	settings, err := s.deps.SettingsStore.GetByID(ctx, payment.SpaceID)
	if err != nil {
		return nil, err
	}

	budgetID := payment.BudgetID
	if req.BudgetID != nil && *req.BudgetID != "" {
		budgetID = *req.BudgetID
	}

	currency := payment.Currency
	if req.Currency != nil && *req.Currency != "" {
		currency = *req.Currency
	}

	budget, err := s.deps.BudgetStore.GetByID(ctx, payment.SpaceID, budgetID)
	if err != nil {
		return nil, err
	}

	actualAmount := req.ActualAmount
	if actualAmount <= 0 {
		actualAmount = payment.Amount
	}

	txnDate := req.TransactionDate
	if txnDate.IsZero() {
		txnDate = time.Now().UTC()
	}

	effDate := req.EffectiveDate
	if effDate.IsZero() {
		effDate = txnDate
	}

	// Resolve budget period for the transaction based on effectiveDate
	period, err := s.GetOrCreatePeriod(ctx, payment.SpaceID, budget.ID, effDate)
	if err != nil {
		return nil, err
	}

	// Calculate base currency conversion
	rate, err := s.resolveExchangeRate(ctx, payment.SpaceID, currency, settings.BaseCurrency, txnDate, false)
	if err != nil {
		return nil, err
	}

	amountInBase := ConvertAmount(actualAmount, rate)

	sourceFallback := ""
	if req.Description == "" && payment.Metadata.Description == "" {
		if payment.SourceType == SourceTypeRecurrentExpense {
			if exp, err := s.deps.RecurringExpenseStore.GetByID(ctx, payment.SpaceID, RecurringExpenseID(payment.SourceID)); err == nil {
				sourceFallback = exp.Name
			}
		} else if payment.SourceType == "invoice" {
			if item, err := s.deps.InboxItemStore.Get(ctx, payment.SpaceID, payment.SourceID); err == nil {
				if item.VendorName != "" {
					sourceFallback = item.VendorName
				}
			}
		}
	}

	description := payment.ResolveDescription(req.Description, sourceFallback)

	txn, err := payment.NewConfirmationTransaction(ConfirmOpts{
		BudgetID:            new(budgetID),
		PeriodID:            &period.ID,
		AccountID:           req.AccountID,
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

	if err := s.deps.TransactionStore.Create(ctx, txn); err != nil {
		return nil, err
	}

	if req.AccountID != nil && *req.AccountID != "" {
		if err := s.adjustAccountBalance(ctx, payment.SpaceID, *req.AccountID, actualAmount, TransactionTypeExpense, false); err != nil {
			return nil, fmt.Errorf("failed to adjust account balance: %w", err)
		}
	}

	// Log the historical scheduled event with the deferred creation date
	if _, err = s.LogTransactionEvent(ctx, payment.NewScheduledEvent(txn.ID)); err != nil {
		return nil, fmt.Errorf("failed to log scheduled event: %w", err)
	}

	// Log the actual payment confirmation event with the transaction date
	if _, err = s.LogTransactionEvent(ctx, txn.NewConfirmationEvent(actualAmount)); err != nil {
		return nil, fmt.Errorf("failed to log payment confirmation event: %w", err)
	}

	// Mark scheduled payment as paid
	if err := payment.MarkPaid(); err != nil {
		return nil, err
	}
	if err := s.deps.ScheduledPaymentStore.Update(ctx, payment); err != nil {
		return nil, fmt.Errorf("failed to update scheduled payment status: %w", err)
	}

	return txn, nil
}

// MatchScheduledPaymentRequest represents parameters to link an existing transaction to a scheduled payment.
type MatchScheduledPaymentRequest struct {
	SpaceID       SpaceID
	PaymentID     ScheduledPaymentID
	TransactionID TransactionID
}

// MatchScheduledPayment links an existing transaction with a pending scheduled payment, marking the payment cleared.
func (s *Service) MatchScheduledPayment(ctx context.Context, req MatchScheduledPaymentRequest) (*Transaction, error) {
	payment, err := s.deps.ScheduledPaymentStore.GetByID(ctx, req.SpaceID, req.PaymentID)
	if err != nil {
		return nil, fmt.Errorf("scheduled payment not found: %w", err)
	}

	txn, err := s.deps.TransactionStore.GetByID(ctx, req.SpaceID, req.TransactionID)
	if err != nil {
		return nil, fmt.Errorf("transaction not found: %w", err)
	}

	if txn.SpaceID != payment.SpaceID {
		return nil, errors.New("transaction and scheduled payment belong to different spaces")
	}

	// Update transaction link properties in metadata
	var reID *RecurringExpenseID
	if payment.SourceType == SourceTypeRecurrentExpense && payment.SourceID != "" {
		reID = new(RecurringExpenseID(payment.SourceID))
	}
	txn.LinkScheduledPayment(payment.ID, reID)

	if err := s.deps.TransactionStore.Update(ctx, txn); err != nil {
		return nil, fmt.Errorf("failed to link transaction: %w", err)
	}

	// Log event
	_, err = s.LogTransactionEvent(ctx, &TransactionEvent{
		SpaceID:       payment.SpaceID,
		TransactionID: txn.ID,
		EventType:     "SCHEDULED_PAYMENT_LINKED",
		CreateTime:    time.Now().UTC(),
		Metadata:      map[string]any{"scheduled_payment_id": string(payment.ID)},
	})
	if err != nil {
		return nil, fmt.Errorf("failed to log match event: %w", err)
	}

	// Mark scheduled payment as paid
	payment.Status = ScheduledPaymentPaid
	payment.UpdateTime = time.Now().UTC()
	if err := s.deps.ScheduledPaymentStore.Update(ctx, payment); err != nil {
		return nil, fmt.Errorf("failed to update scheduled payment status: %w", err)
	}

	return txn, nil
}

// GetScheduledPayment retrieves a scheduled payment by ID for a space.
func (s *Service) GetScheduledPayment(ctx context.Context, spaceID SpaceID, id ScheduledPaymentID) (*ScheduledPayment, error) {
	if err := spaceID.Validate(); err != nil {
		return nil, fmt.Errorf("validate space ID: %w", err)
	}
	if err := id.Validate(); err != nil {
		return nil, fmt.Errorf("validate scheduled payment ID: %w", err)
	}
	return s.deps.ScheduledPaymentStore.GetByID(ctx, spaceID, id)
}

// SkipScheduledPayment marks a pending scheduled payment as skipped for a cycle.
func (s *Service) SkipScheduledPayment(ctx context.Context, spaceID SpaceID, id ScheduledPaymentID) (*ScheduledPayment, error) {
	if err := spaceID.Validate(); err != nil {
		return nil, err
	}
	if err := id.Validate(); err != nil {
		return nil, err
	}

	payment, err := s.deps.ScheduledPaymentStore.GetByID(ctx, spaceID, id)
	if err != nil {
		return nil, err
	}

	if payment.SpaceID != spaceID {
		return nil, ErrScheduledPaymentNotFound
	}

	if err := payment.MarkSkipped(); err != nil {
		return nil, err
	}
	if err := s.deps.ScheduledPaymentStore.UpdateStatus(ctx, id, ScheduledPaymentSkipped); err != nil {
		return nil, fmt.Errorf("update scheduled payment status: %w", err)
	}

	return payment, nil
}

// GenerateScheduledPayments performs bulk generation of pending scheduled payments for recurring expenses.
func (s *Service) GenerateScheduledPayments(ctx context.Context) error {
	// Query templates due in next 10 days
	maxDueDate := time.Now().AddDate(0, 0, 10)
	expenses, err := s.deps.RecurringExpenseStore.ListPendingGeneration(ctx, maxDueDate)
	if err != nil {
		return err
	}

	for _, re := range expenses {
		// Generate all scheduled payments up to 10 days in the future
		for re.NextDueDate.Before(maxDueDate) || re.NextDueDate.Equal(maxDueDate) {
			spID, err := NewScheduledPaymentID()
			if err != nil {
				return err
			}

			payment, err := re.NewScheduledPayment(spID)
			if err != nil {
				return err
			}

			if err := s.deps.ScheduledPaymentStore.Create(ctx, payment); err != nil {
				return err
			}

			if err := re.AdvanceNextDueDate(); err != nil {
				return err
			}
		}

		if err := s.deps.RecurringExpenseStore.Update(ctx, re); err != nil {
			return err
		}
	}

	return nil
}

// createTransaction persists a transaction and adjusts the account balance.
func (s *Service) createTransaction(ctx context.Context, txn *Transaction) error {
	// 1. Set dates
	if txn.TransactionDate.IsZero() {
		txn.TransactionDate = time.Now().UTC()
	}
	if txn.EffectiveDate.IsZero() {
		txn.EffectiveDate = txn.TransactionDate
	}
	if txn.CreateTime.IsZero() {
		txn.CreateTime = time.Now().UTC()
	}
	txn.UpdateTime = time.Now().UTC()

	// 2. Fetch workspace settings
	settings, err := s.deps.SettingsStore.GetByID(ctx, txn.SpaceID)
	if err != nil {
		return fmt.Errorf("verify workspace settings: %w", err)
	}

	// 3. Centralized Budget Period Resolution
	if txn.BudgetID != nil {
		budget, err := s.deps.BudgetStore.GetByID(ctx, txn.SpaceID, *txn.BudgetID)
		if err != nil {
			return fmt.Errorf("fetch budget template: %w", err)
		}
		if err := budget.EnsureActive(); err != nil {
			return err
		}
		period, err := s.GetOrCreatePeriod(ctx, txn.SpaceID, budget.ID, txn.EffectiveDate)
		if err != nil {
			return fmt.Errorf("resolve active budget period: %w", err)
		}
		txn.PeriodID = new(period.ID)
	}

	// 4. Centralized Base Currency Exchange Rate Calculation
	if txn.AmountInBase == 0 || txn.Currency != settings.BaseCurrency {
		rate, err := s.resolveExchangeRate(ctx, txn.SpaceID, txn.Currency, settings.BaseCurrency, txn.TransactionDate, false)
		if err != nil {
			return err
		}
		txn.AmountInBase = ConvertAmount(txn.Amount, rate)
	}

	if err := txn.Validate(); err != nil {
		return err
	}

	// 5. Persist the transaction
	if err := s.deps.TransactionStore.Create(ctx, txn); err != nil {
		return err
	}

	// 6. Adjust account balance
	if txn.AccountID != nil && *txn.AccountID != "" {
		if err := s.adjustAccountBalance(ctx, txn.SpaceID, *txn.AccountID, txn.ImpactAmount(), txn.Type, false); err != nil {
			return fmt.Errorf("failed to adjust account balance: %w", err)
		}
	}

	return nil
}

// updateTransaction updates a transaction and recalculates account balances.
func (s *Service) updateTransaction(ctx context.Context, txn *Transaction, existing *Transaction) error {
	if existing.Type == TransactionTypeBalanceAdjustment {
		return errors.New("balance adjustment transactions cannot be edited directly; perform a new balance adjustment or delete this record to revert")
	}

	// 1. Set dates
	if txn.EffectiveDate.IsZero() {
		txn.EffectiveDate = txn.TransactionDate
	}
	txn.UpdateTime = time.Now().UTC()

	// 2. Fetch workspace settings
	settings, err := s.deps.SettingsStore.GetByID(ctx, txn.SpaceID)
	if err != nil {
		return fmt.Errorf("verify workspace settings: %w", err)
	}

	// 3. Centralized Budget Period Resolution
	if txn.BudgetID != nil {
		budget, err := s.deps.BudgetStore.GetByID(ctx, txn.SpaceID, *txn.BudgetID)
		if err != nil {
			return fmt.Errorf("fetch budget template: %w", err)
		}
		st := budget.Status
		if st == "" {
			st = BudgetStatusActive
		}
		if st != BudgetStatusActive {
			return fmt.Errorf("cannot log transaction against budget %q with status %q", budget.Name, st)
		}
		period, err := s.GetOrCreatePeriod(ctx, txn.SpaceID, budget.ID, txn.EffectiveDate)
		if err != nil {
			return fmt.Errorf("resolve active budget period: %w", err)
		}
		txn.PeriodID = new(period.ID)
	} else {
		txn.PeriodID = nil
	}

	// 4. Centralized Base Currency Exchange Rate Calculation
	rate, err := s.resolveExchangeRate(ctx, txn.SpaceID, txn.Currency, settings.BaseCurrency, txn.TransactionDate, false)
	if err != nil {
		return err
	}
	txn.AmountInBase = ConvertAmount(txn.Amount, rate)

	if err := txn.Validate(); err != nil {
		return err
	}

	// 5. Revert the old transaction's balance impact
	if existing.AccountID != nil {
		if err := s.adjustAccountBalance(ctx, existing.SpaceID, *existing.AccountID, existing.Amount, existing.Type, true); err != nil {
			return fmt.Errorf("failed to revert account balance: %w", err)
		}
	}

	// 6. Persist the updated transaction
	if err := s.deps.TransactionStore.Update(ctx, txn); err != nil {
		return err
	}

	// 7. Apply the new transaction's balance impact
	if txn.AccountID != nil {
		if err := s.adjustAccountBalance(ctx, txn.SpaceID, *txn.AccountID, txn.Amount, txn.Type, false); err != nil {
			return fmt.Errorf("failed to apply updated account balance: %w", err)
		}
	}

	return nil
}

// deleteTransaction deletes a transaction, reverts its account balance impact, and syncs linked borrowings.
func (s *Service) deleteTransaction(ctx context.Context, txn *Transaction) error {
	// 1. Revert the account balance impact using account_impact_amount if present
	if txn.AccountID != nil && *txn.AccountID != "" {
		if err := s.adjustAccountBalance(ctx, txn.SpaceID, *txn.AccountID, txn.ImpactAmount(), txn.Type, true); err != nil {
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

		if b, err := s.deps.BorrowingStore.GetByID(ctx, txn.SpaceID, *txn.Metadata.BorrowingID); err == nil {
			b.RollbackTransaction(role, txn.Type, borrowingAmount)
			_ = s.deps.BorrowingStore.Update(ctx, b)
		}
	}

	// 3. Delete the transaction from persistence
	return s.deps.TransactionStore.Delete(ctx, txn.ID)
}

// adjustAccountBalance updates the balance of the specified account based on transaction changes.
func (s *Service) adjustAccountBalance(ctx context.Context, spaceID SpaceID, accountID AccountID, amount int64, txnType TransactionType, revert bool) error {
	acc, err := s.deps.AccountStore.GetByID(ctx, spaceID, accountID)
	if err != nil {
		return err
	}

	if revert {
		acc.RollbackTransaction(txnType, amount)
	} else {
		acc.ApplyTransaction(txnType, amount)
	}

	return s.deps.AccountStore.Update(ctx, acc)
}

// Helper to create or update associated borrowing transaction idempotently
func (s *Service) syncBorrowingTransaction(ctx context.Context, targetTxn *Transaction) error {
	if targetTxn == nil || targetTxn.Metadata.BorrowingID == nil {
		return errors.New("borrowing transaction metadata requires borrowing_id")
	}

	role := targetTxn.Metadata.BorrowingRole
	if role == "" {
		role = "INITIAL_FUNDING"
	}

	page, err := s.deps.TransactionStore.ListBySpace(ctx, targetTxn.SpaceID, &TransactionFilter{
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
		return s.updateTransaction(ctx, targetTxn, existing)
	}

	return s.createTransaction(ctx, targetTxn)
}

// CreateBorrowing initializes a borrowing agreement and optionally logs its disbursement transaction.
func (s *Service) CreateBorrowing(ctx context.Context, b *Borrowing, createAsTransaction bool) (*Borrowing, error) {
	if err := b.Init(); err != nil {
		return nil, err
	}

	if err := b.Validate(); err != nil {
		return nil, err
	}

	settings, err := s.deps.SettingsStore.GetByID(ctx, b.SpaceID)
	if err != nil {
		return nil, err
	}

	if createAsTransaction {
		if _, err := s.resolveExchangeRate(ctx, b.SpaceID, b.Currency, settings.BaseCurrency, b.EstablishedAt, false); err != nil {
			return nil, err
		}
	}

	if err := s.deps.BorrowingStore.Create(ctx, b); err != nil {
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

		if err := s.syncBorrowingTransaction(ctx, initialTxn); err != nil {
			return nil, err
		}
	}

	return b, nil
}

// GetBorrowing retrieves a borrowing record.
func (s *Service) GetBorrowing(ctx context.Context, spaceID SpaceID, id BorrowingID) (*Borrowing, error) {
	if err := spaceID.Validate(); err != nil {
		return nil, err
	}
	if err := id.Validate(); err != nil {
		return nil, err
	}
	return s.deps.BorrowingStore.GetByID(ctx, spaceID, id)
}

// ListBorrowings lists borrowing records with filters.
func (s *Service) ListBorrowings(ctx context.Context, spaceID SpaceID, filter *ListBorrowingsFilter) ([]*Borrowing, string, error) {
	if err := spaceID.Validate(); err != nil {
		return nil, "", err
	}
	return s.deps.BorrowingStore.ListBySpace(ctx, spaceID, filter)
}

// UpdateBorrowing updates a borrowing record and its associated transaction.
func (s *Service) UpdateBorrowing(ctx context.Context, b *Borrowing, mask []string) (*Borrowing, error) {
	existing, err := s.deps.BorrowingStore.GetByID(ctx, b.SpaceID, b.ID)
	if err != nil {
		return nil, err
	}
	if b.Version > 0 && b.Version != existing.Version {
		return nil, ErrBorrowingVersionMismatch
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

	settings, err := s.deps.SettingsStore.GetByID(ctx, existing.SpaceID)
	if err != nil {
		return nil, err
	}

	borID := existing.ID
	page, err := s.deps.TransactionStore.ListBySpace(ctx, existing.SpaceID, &TransactionFilter{
		BorrowingID:    &borID,
		BorrowingRoles: []string{"INITIAL_FUNDING"},
		PageSize:       1,
	})
	if err != nil {
		return nil, fmt.Errorf("check existing transaction: %w", err)
	}
	hasInitialTxn := len(page.Items) > 0

	if hasInitialTxn || existing.HasLinkedAccount() {
		if _, err := s.resolveExchangeRate(ctx, existing.SpaceID, existing.Currency, settings.BaseCurrency, existing.EstablishedAt, false); err != nil {
			return nil, err
		}
	}

	if err := s.deps.BorrowingStore.Update(ctx, existing); err != nil {
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

		if err := s.syncBorrowingTransaction(ctx, initialTxn); err != nil {
			return nil, err
		}
	}

	return existing, nil
}

// DeleteBorrowing removes a borrowing agreement if it has no linked transactions.
func (s *Service) DeleteBorrowing(ctx context.Context, spaceID SpaceID, id BorrowingID) error {
	b, err := s.deps.BorrowingStore.GetByID(ctx, spaceID, id)
	if err != nil {
		return err
	}

	if b.SpaceID != spaceID {
		return errors.New("borrowing does not belong to space")
	}

	// 1. Check if borrowing has linked transactions
	bID := id
	page, err := s.deps.TransactionStore.ListBySpace(ctx, spaceID, &TransactionFilter{
		BorrowingID: &bID,
		PageSize:    1,
	})
	if err != nil {
		return fmt.Errorf("check linked borrowing transactions: %w", err)
	}
	if len(page.Items) > 0 {
		return ErrBorrowingHasTransactions
	}

	// 2. Delete borrowing agreement from DB
	return s.deps.BorrowingStore.Delete(ctx, id)
}

// LogBorrowingTransactionRequest holds parameters to log a borrowing payment or disbursement.
type LogBorrowingTransactionRequest struct {
	SpaceID         SpaceID
	BorrowingID     BorrowingID
	Type            BorrowingTransactionType
	Amount          int64
	TransactionDate time.Time
	AccountID       *AccountID
	Notes           string
}

// UpdateBorrowingTransactionRequest holds parameters to update a borrowing transaction.
type UpdateBorrowingTransactionRequest struct {
	SpaceID         SpaceID
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
	SpaceID       SpaceID
	BorrowingID   BorrowingID
	TransactionID TransactionID
}

// LogBorrowingTransaction logs a repayment or disbursement transaction for a borrowing agreement.
func (s *Service) LogBorrowingTransaction(ctx context.Context, req LogBorrowingTransactionRequest) (*Transaction, error) {
	if err := req.SpaceID.Validate(); err != nil {
		return nil, err
	}
	if err := req.BorrowingID.Validate(); err != nil {
		return nil, err
	}

	b, err := s.deps.BorrowingStore.GetByID(ctx, req.SpaceID, req.BorrowingID)
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
		date = time.Now().UTC()
	}

	settings, err := s.deps.SettingsStore.GetByID(ctx, req.SpaceID)
	if err != nil {
		return nil, fmt.Errorf("verify workspace settings: %w", err)
	}

	rateToBase, err := s.resolveExchangeRate(ctx, req.SpaceID, b.Currency, settings.BaseCurrency, date, false)
	if err != nil {
		return nil, err
	}
	amountInBase := ConvertAmount(req.Amount, rateToBase)

	accountImpactAmount := req.Amount
	if req.AccountID != nil && *req.AccountID != "" {
		acc, err := s.deps.AccountStore.GetByID(ctx, req.SpaceID, *req.AccountID)
		if err != nil {
			return nil, fmt.Errorf("fetch payment account: %w", err)
		}
		rateToAcc, err := s.resolveExchangeRate(ctx, req.SpaceID, b.Currency, acc.Currency, date, false)
		if err != nil {
			return nil, err
		}
		accountImpactAmount = ConvertAmount(req.Amount, rateToAcc)
	}

	if err := s.deps.BorrowingStore.Update(ctx, b); err != nil {
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

	if err := s.createTransaction(ctx, txn); err != nil {
		return nil, fmt.Errorf("create borrowing transaction: %w", err)
	}

	return txn, nil
}

// UpdateBorrowingTransaction updates a borrowing transaction and recalculates all balance impacts.
func (s *Service) UpdateBorrowingTransaction(ctx context.Context, req UpdateBorrowingTransactionRequest) (*Transaction, error) {
	if err := req.SpaceID.Validate(); err != nil {
		return nil, err
	}
	if err := req.BorrowingID.Validate(); err != nil {
		return nil, err
	}
	if err := req.TransactionID.Validate(); err != nil {
		return nil, err
	}

	txn, err := s.deps.TransactionStore.GetByID(ctx, req.SpaceID, req.TransactionID)
	if err != nil {
		return nil, fmt.Errorf("fetch existing transaction: %w", err)
	}

	if txn.Metadata.BorrowingID == nil || *txn.Metadata.BorrowingID != req.BorrowingID {
		return nil, fmt.Errorf("transaction %s does not belong to borrowing %s", req.TransactionID, req.BorrowingID)
	}

	if err := s.deleteTransaction(ctx, txn); err != nil {
		return nil, fmt.Errorf("revert previous transaction impact: %w", err)
	}

	return s.LogBorrowingTransaction(ctx, LogBorrowingTransactionRequest{
		SpaceID:         req.SpaceID,
		BorrowingID:     req.BorrowingID,
		Type:            req.Type,
		Amount:          req.Amount,
		TransactionDate: req.TransactionDate,
		AccountID:       req.AccountID,
		Notes:           req.Notes,
	})
}

// DeleteBorrowingTransaction deletes a borrowing transaction and reverts balance impacts.
func (s *Service) DeleteBorrowingTransaction(ctx context.Context, req DeleteBorrowingTransactionRequest) error {
	if err := req.SpaceID.Validate(); err != nil {
		return err
	}
	if err := req.BorrowingID.Validate(); err != nil {
		return err
	}
	if err := req.TransactionID.Validate(); err != nil {
		return err
	}

	txn, err := s.deps.TransactionStore.GetByID(ctx, req.SpaceID, req.TransactionID)
	if err != nil {
		return fmt.Errorf("fetch existing transaction: %w", err)
	}

	if txn.Metadata.BorrowingID == nil || *txn.Metadata.BorrowingID != req.BorrowingID {
		return fmt.Errorf("transaction %s does not belong to borrowing %s", req.TransactionID, req.BorrowingID)
	}

	return s.deleteTransaction(ctx, txn)
}

// AdjustBorrowingBalanceRequest holds parameters to adjust a borrowing's remaining balance.
type AdjustBorrowingBalanceRequest struct {
	SpaceID        SpaceID
	BorrowingID    BorrowingID
	TargetBalance  int64
	AdjustmentDate string
	Note           string
	AccountID      *AccountID
}

// AdjustBorrowingBalance reconciles a borrowing's remaining balance to a target balance.
func (s *Service) AdjustBorrowingBalance(ctx context.Context, req AdjustBorrowingBalanceRequest) (*Borrowing, error) {
	if err := req.SpaceID.Validate(); err != nil {
		return nil, err
	}
	if err := req.BorrowingID.Validate(); err != nil {
		return nil, err
	}

	b, err := s.deps.BorrowingStore.GetByID(ctx, req.SpaceID, req.BorrowingID)
	if err != nil {
		return nil, fmt.Errorf("fetch target borrowing: %w", err)
	}

	delta := b.AdjustBalance(req.TargetBalance)
	if delta == 0 {
		return b, nil
	}

	parsedDate := time.Now().UTC()
	if req.AdjustmentDate != "" {
		if t, parseErr := time.Parse(time.RFC3339, req.AdjustmentDate); parseErr == nil {
			parsedDate = t
		} else if t, parseErr := time.Parse("2006-01-02", req.AdjustmentDate); parseErr == nil {
			parsedDate = t
		}
	}

	if err := s.deps.BorrowingStore.Update(ctx, b); err != nil {
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
		SpaceID:         req.SpaceID,
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

	if err := s.createTransaction(ctx, txn); err != nil {
		return nil, fmt.Errorf("record balance adjustment transaction: %w", err)
	}

	return s.deps.BorrowingStore.GetByID(ctx, req.SpaceID, req.BorrowingID)
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
func (s *Service) CreateAccount(ctx context.Context, a *Account) (*Account, error) {
	if err := a.Init(); err != nil {
		return nil, err
	}

	if err := a.Validate(); err != nil {
		return nil, err
	}

	// Check if first account in space
	hasAny, err := s.deps.AccountStore.HasAny(ctx, a.SpaceID)
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
		if err := s.deps.AccountStore.UnsetDefaultsExcept(ctx, a.SpaceID, a.ID); err != nil {
			return nil, err
		}
	}
	if err := s.deps.AccountStore.Create(ctx, a); err != nil {
		return nil, err
	}

	return a, nil
}

// GetAccount retrieves an account.
func (s *Service) GetAccount(ctx context.Context, spaceID SpaceID, id AccountID) (*Account, error) {
	if err := spaceID.Validate(); err != nil {
		return nil, err
	}
	if err := id.Validate(); err != nil {
		return nil, err
	}
	return s.deps.AccountStore.GetByID(ctx, spaceID, id)
}

// GetAccounts retrieves a list of accounts by their identifiers for a space.
func (s *Service) GetAccounts(ctx context.Context, spaceID SpaceID, ids []AccountID) ([]*Account, error) {
	if err := spaceID.Validate(); err != nil {
		return nil, err
	}
	return s.deps.AccountStore.GetByIDs(ctx, spaceID, ids)
}

// UpdateAccount updates account metadata with field masking and optimistic concurrency control.
func (s *Service) UpdateAccount(ctx context.Context, account *Account, mask []string) (*Account, error) {
	existing, err := s.deps.AccountStore.GetByID(ctx, account.SpaceID, account.ID)
	if err != nil {
		return nil, err
	}
	if account.Version > 0 && account.Version != existing.Version {
		return nil, ErrAccountVersionMismatch
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
		if err := s.deps.AccountStore.UnsetDefaultsExcept(ctx, account.SpaceID, account.ID); err != nil {
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

	if err := s.deps.AccountStore.Update(ctx, existing); err != nil {
		return nil, err
	}

	return existing, nil
}

// AdjustAccountBalance reconciles an account's live balance to a target balance by logging a system reconciliation transaction.
func (s *Service) AdjustAccountBalance(ctx context.Context, spaceID SpaceID, accountID AccountID, targetBalance int64, adjustmentDate string, note string) (*Account, error) {
	if err := spaceID.Validate(); err != nil {
		return nil, err
	}
	if err := accountID.Validate(); err != nil {
		return nil, err
	}

	acc, err := s.deps.AccountStore.GetByID(ctx, spaceID, accountID)
	if err != nil {
		return nil, fmt.Errorf("fetch target account: %w", err)
	}

	parsedDate := time.Now().UTC()
	if adjustmentDate != "" {
		if t, parseErr := time.Parse(time.RFC3339, adjustmentDate); parseErr == nil {
			parsedDate = t
		} else if t, parseErr := time.Parse("2006-01-02", adjustmentDate); parseErr == nil {
			parsedDate = t
		}
	}

	txn, err := acc.ReconcileBalance(ReconcileAccountOpts{
		TargetBalance:  targetBalance,
		AdjustmentDate: parsedDate,
		Note:           note,
	})
	if err != nil {
		return nil, fmt.Errorf("reconcile balance: %w", err)
	}
	if txn == nil {
		return acc, nil
	}

	if err := s.createTransaction(ctx, txn); err != nil {
		return nil, fmt.Errorf("record balance adjustment transaction: %w", err)
	}

	return s.deps.AccountStore.GetByID(ctx, spaceID, accountID)
}

// DeleteAccount deletes an account and moves default status if necessary.
func (s *Service) DeleteAccount(ctx context.Context, spaceID SpaceID, id AccountID, opts DeleteOptions) error {
	existing, err := s.deps.AccountStore.GetByID(ctx, spaceID, id)
	if err != nil {
		return err
	}

	if existing.IsDefault {
		return ErrCannotDeleteDefaultAccount
	}

	return s.deps.AccountStore.Delete(ctx, spaceID, id, opts)
}

// ListAccounts lists all accounts for a space.
func (s *Service) ListAccounts(ctx context.Context, spaceID SpaceID, filter *ListAccountsFilter) (*paging.Page[*Account], error) {
	if err := spaceID.Validate(); err != nil {
		return nil, err
	}
	return s.deps.AccountStore.ListBySpace(ctx, spaceID, filter)
}

// GetLatestRates retrieves the latest exchange rates for the given fromCurrencies to the target currency.
func (s *Service) GetLatestRates(ctx context.Context, spaceID SpaceID, fromCurrencies []Currency, toCurrency Currency) ([]*ExchangeRate, error) {
	if err := spaceID.Validate(); err != nil {
		return nil, err
	}
	return s.deps.ExchangeRateStore.GetLatestRates(ctx, spaceID, fromCurrencies, toCurrency)
}

// CreateTransfer logs a fund movement between accounts.
func (s *Service) CreateTransfer(ctx context.Context, t *Transfer) (*Transfer, error) {
	if t.ID == "" {
		tID, err := NewTransferID()
		if err != nil {
			return nil, err
		}
		t.ID = tID
	}
	t.CreateTime = time.Now().UTC()
	t.UpdateTime = time.Now().UTC()

	if err := t.Validate(); err != nil {
		return nil, err
	}

	// Fetch both accounts to verify existence and check currencies
	srcAcc, err := s.deps.AccountStore.GetByID(ctx, t.SpaceID, t.SourceAccountID)
	if err != nil {
		return nil, fmt.Errorf("source account: %w", err)
	}
	destAcc, err := s.deps.AccountStore.GetByID(ctx, t.SpaceID, t.DestinationAccountID)
	if err != nil {
		return nil, fmt.Errorf("destination account: %w", err)
	}

	if err := srcAcc.ValidateTransferTo(destAcc, t.SourceAmount); err != nil {
		return nil, fmt.Errorf("validate account transfer: %w", err)
	}

	// Double-entry validation: same currency transfers must have matching source and destination amounts
	if srcAcc.Currency == destAcc.Currency && t.SourceAmount != t.DestinationAmount {
		return nil, errors.New("source and destination amounts must match for single-currency transfers")
	}

	// 1. Insert Transfer parent record
	if err := s.deps.TransferStore.Create(ctx, t); err != nil {
		return nil, err
	}

	outflowTxn, inflowTxn, err := t.NewLegTransactions(TransferLegOpts{
		SourceAccountName: srcAcc.Name,
		DestAccountName:   destAcc.Name,
		SourceCurrency:    srcAcc.Currency,
		DestCurrency:      destAcc.Currency,
	})
	if err != nil {
		return nil, err
	}

	if err := s.createTransaction(ctx, outflowTxn); err != nil {
		return nil, fmt.Errorf("failed to log transfer outflow leg: %w", err)
	}
	if err := s.createTransaction(ctx, inflowTxn); err != nil {
		return nil, fmt.Errorf("failed to log transfer inflow leg: %w", err)
	}

	return t, nil
}

// GetTransfer retrieves a transfer for a space.
func (s *Service) GetTransfer(ctx context.Context, spaceID SpaceID, id TransferID) (*Transfer, error) {
	if err := spaceID.Validate(); err != nil {
		return nil, err
	}
	if err := id.Validate(); err != nil {
		return nil, err
	}
	return s.deps.TransferStore.GetByID(ctx, spaceID, id)
}

// DeleteTransfer deletes a transfer parent and deletes both linked ledger entries.
func (s *Service) DeleteTransfer(ctx context.Context, spaceID SpaceID, id TransferID) error {
	t, err := s.deps.TransferStore.GetByID(ctx, spaceID, id)
	if err != nil {
		return err
	}

	// Find the associated transaction legs using TransferID
	page, err := s.deps.TransactionStore.ListBySpace(ctx, t.SpaceID, &TransactionFilter{
		TransferID: &id,
		PageSize:   10,
	})
	if err != nil {
		return fmt.Errorf("failed to retrieve transfer transaction legs: %w", err)
	}
	legs := page.Items

	// Delete both transaction legs
	for _, leg := range legs {
		if err := s.deleteTransaction(ctx, leg); err != nil {
			return fmt.Errorf("failed to delete transfer leg transaction: %w", err)
		}
	}

	// Delete parent transfer record
	return s.deps.TransferStore.Delete(ctx, id)
}

// ListTransfers lists transfer records inside a space.
func (s *Service) ListTransfers(ctx context.Context, spaceID SpaceID, limit int32, pageToken string) ([]*Transfer, string, error) {
	if err := spaceID.Validate(); err != nil {
		return nil, "", err
	}
	return s.deps.TransferStore.ListBySpace(ctx, spaceID, limit, pageToken)
}

// LogTransactionEvent inserts a new lifecycle event for a transaction.
func (s *Service) LogTransactionEvent(ctx context.Context, e *TransactionEvent) (*TransactionEvent, error) {
	if e.ID == "" {
		id, err := NewTransactionEventID()
		if err != nil {
			return nil, err
		}
		e.ID = id
	}
	if e.CreateTime.IsZero() {
		e.CreateTime = time.Now().UTC()
	}
	if err := e.Validate(); err != nil {
		return nil, err
	}
	if err := s.deps.TransactionEventStore.Create(ctx, e); err != nil {
		return nil, err
	}
	return e, nil
}

// ListTransactionEvents retrieves all lifecycle events for a specific transaction in a space.
func (s *Service) ListTransactionEvents(ctx context.Context, spaceID SpaceID, txnID TransactionID) ([]*TransactionEvent, error) {
	if err := spaceID.Validate(); err != nil {
		return nil, fmt.Errorf("validate space ID: %w", err)
	}
	if err := txnID.Validate(); err != nil {
		return nil, fmt.Errorf("validate transaction ID: %w", err)
	}
	return s.deps.TransactionEventStore.ListByTransaction(ctx, spaceID, txnID)
}

// StageInboxItem parses extraction suggestions and inserts a new draft entry into the inbox queue.
func (s *Service) StageInboxItem(ctx context.Context, spaceID SpaceID, req *StageInboxItem) (*InboxItem, error) {
	if err := spaceID.Validate(); err != nil {
		return nil, err
	}

	// 1. Generate unique inbox item ID using "ibx_" prefix
	ibxID, err := id.Generate("ibx_")
	if err != nil {
		return nil, fmt.Errorf("generate inbox item ID: %w", err)
	}

	// 2. Resolve target account ID (prioritizing explicit AccountID over CardLastFour fallback with currency priority)
	var accountID *string
	if req.AccountID != nil && *req.AccountID != "" {
		accountID = req.AccountID
	} else if req.CardLastFour != "" {
		activeOnly := true
		last4 := req.CardLastFour
		page, err := s.deps.AccountStore.ListBySpace(ctx, spaceID, &ListAccountsFilter{
			PageSize:   100,
			ActiveOnly: &activeOnly,
			LastFour:   &last4,
		})
		if err == nil && len(page.Items) > 0 {
			var selected *Account
			// Priority 1: Match currency exact
			for _, acc := range page.Items {
				if string(acc.Currency) == req.Currency {
					selected = acc
					break
				}
			}
			// Priority 2: Fallback to first matching account
			if selected == nil {
				selected = page.Items[0]
			}
			accountID = new(string(selected.ID))
		}
	}

	// 3. Resolve and validate matching budget ID
	var budgetID *string
	if req.SuggestedBudget != "" {
		bID, err := ParseBudgetID(req.SuggestedBudget)
		if err == nil {
			budget, err := s.deps.BudgetStore.GetByID(ctx, spaceID, bID)
			if err == nil && budget != nil && budget.SpaceID == spaceID {
				budgetID = new(string(budget.ID))
			}
		}
	}

	// 4. Parse transaction timestamp
	txDate := time.Now().UTC()
	if req.Date != "" {
		if t, err := time.Parse(time.RFC3339, req.Date); err == nil {
			txDate = t.UTC()
		}
	}

	// 5. Create and insert InboxItem
	item := &InboxItem{
		ID:              ibxID,
		SpaceID:         string(spaceID),
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

	if err := s.deps.InboxItemStore.Insert(ctx, item); err != nil {
		return nil, fmt.Errorf("insert inbox item: %w", err)
	}

	return item, nil
}

// ListInboxItems lists all pending/staged items in the space inbox.
func (s *Service) ListInboxItems(ctx context.Context, spaceID SpaceID, filter *ListInboxItemsFilter) (*paging.Page[*InboxItem], error) {
	if err := spaceID.Validate(); err != nil {
		return nil, err
	}
	return s.deps.InboxItemStore.ListBySpace(ctx, spaceID, filter)
}

// UpdateInboxItem updates a staging inbox item's draft properties.
func (s *Service) UpdateInboxItem(ctx context.Context, spaceID SpaceID, item *InboxItem) (*InboxItem, error) {
	if err := spaceID.Validate(); err != nil {
		return nil, err
	}
	if item.ID == "" {
		return nil, errors.New("missing inbox item ID")
	}
	existing, err := s.deps.InboxItemStore.Get(ctx, spaceID, item.ID)
	if err != nil {
		return nil, err
	}

	item.SpaceID = string(spaceID)
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
	if item.ScheduledPaymentID == nil {
		item.ScheduledPaymentID = existing.ScheduledPaymentID
	}
	if item.TransactionID == nil {
		item.TransactionID = existing.TransactionID
	}
	if item.BorrowingID == nil {
		item.BorrowingID = existing.BorrowingID
	}

	// Persist changes
	if err := s.deps.InboxItemStore.Update(ctx, item); err != nil {
		return nil, err
	}

	return item, nil
}

// DiscardInboxItem deletes an item from the inbox without ledger changes.
func (s *Service) DiscardInboxItem(ctx context.Context, spaceID SpaceID, id string) error {
	if err := spaceID.Validate(); err != nil {
		return err
	}
	return s.deps.InboxItemStore.Delete(ctx, spaceID, id)
}

// ApproveInboxItem promotes an inbox item to the ledger or updates a scheduled payment, returning the resolved item.
func (s *Service) ApproveInboxItem(ctx context.Context, spaceID SpaceID, id string) (*InboxItem, error) {
	if err := spaceID.Validate(); err != nil {
		return nil, err
	}

	// 1. Fetch current staging inbox item
	item, err := s.deps.InboxItemStore.Get(ctx, spaceID, id)
	if err != nil {
		return nil, fmt.Errorf("get inbox item: %w", err)
	}

	if err := item.EnsurePending(); err != nil {
		return nil, err
	}

	// 1b. If it is a system verification email: mark resolved immediately
	if item.DocType == InboxItemDocSystemVerification {
		item.MarkResolved(nil)
		if err := s.deps.InboxItemStore.Update(ctx, item); err != nil {
			return nil, fmt.Errorf("resolve verification inbox item: %w", err)
		}
		return item, nil
	}

	// 2. If it is linked to an existing transaction:
	if item.TransactionID != nil && *item.TransactionID != "" {
		txnID, err := ParseTransactionID(*item.TransactionID)
		if err != nil {
			return nil, fmt.Errorf("invalid transaction ID: %w", err)
		}
		txn, err := s.deps.TransactionStore.GetByID(ctx, SpaceID(spaceID), txnID)
		if err != nil {
			return nil, fmt.Errorf("get transaction: %w", err)
		}
		if txn.SpaceID != SpaceID(spaceID) {
			return nil, fmt.Errorf("transaction does not belong to this space")
		}
		if txn.Type == TransactionTypeTransferOut || txn.Type == TransactionTypeTransferIn {
			return nil, ErrCannotLinkReceiptToTransfer
		}

		overwrite := item.MetadataBool("overwrite_linked_transaction")

		// If overwrite option is selected, update the ledger transaction to match receipt details
		if overwrite {
			diff := item.Amount - txn.Amount
			if diff != 0 && txn.AccountID != nil {
				if diff > 0 {
					if err := s.adjustAccountBalance(ctx, SpaceID(spaceID), *txn.AccountID, diff, txn.Type, false); err != nil {
						return nil, fmt.Errorf("failed to adjust account balance delta: %w", err)
					}
				} else {
					if err := s.adjustAccountBalance(ctx, SpaceID(spaceID), *txn.AccountID, -diff, txn.Type, true); err != nil {
						return nil, fmt.Errorf("failed to adjust account balance delta: %w", err)
					}
				}
			}

			updatedTxn := *txn
			updatedTxn.Amount = item.Amount
			updatedTxn.Currency = Currency(item.Currency)
			if item.VendorName != "" {
				updatedTxn.Description = item.VendorName
			}

			if err := s.deps.TransactionStore.Update(ctx, &updatedTxn); err != nil {
				return nil, fmt.Errorf("failed to update linked transaction: %w", err)
			}
			txn = &updatedTxn
		}

		// Handle optional borrowing link for existing transaction
		if item.BorrowingID != nil && *item.BorrowingID != "" {
			linkType := BorrowingLinkTypeInitialReceipt
			if item.BorrowingLinkType != nil {
				linkType = *item.BorrowingLinkType
			}
			if err := s.handleBorrowingLinkForTransaction(ctx, SpaceID(spaceID), txn, *item.BorrowingID, linkType); err != nil {
				return nil, fmt.Errorf("link borrowing to existing transaction: %w", err)
			}
		}

		// Handle optional scheduled payment link for existing transaction
		if item.ScheduledPaymentID != nil && *item.ScheduledPaymentID != "" {
			if err := s.handleScheduledPaymentLinkForTransaction(ctx, SpaceID(spaceID), txn, *item.ScheduledPaymentID); err != nil {
				return nil, fmt.Errorf("link scheduled payment to existing transaction: %w", err)
			}
			item.ScheduledPaymentID = nil
		}

		// Mark inbox item as resolved and link it
		item.Status = InboxItemResolved
		if err := s.deps.InboxItemStore.Update(ctx, item); err != nil {
			return nil, fmt.Errorf("resolve inbox item: %w", err)
		}

		// Event 1: Receipt/Document Ingested
		evtIngested := &TransactionEvent{
			SpaceID:       SpaceID(spaceID),
			TransactionID: txn.ID,
			EventType:     "RECEIPT_INGESTED",
			Metadata: map[string]any{
				"amount_cents": item.Amount,
				"currency":     item.Currency,
				"vendor_name":  item.VendorName,
				"description":  "Receipt/Document ingested into staging queue",
			},
			CreateTime: item.CreateTime,
		}
		if _, err := s.LogTransactionEvent(ctx, evtIngested); err != nil {
			fmt.Printf("warning: failed to log receipt ingested event: %v\n", err)
		}

		// Event 2: Staging item linked to this transaction
		linkedDesc := "Staged document linked to existing ledger entry"
		if overwrite {
			linkedDesc = "Staged document linked to existing ledger entry and updated transaction details"
		}
		evtLinked := &TransactionEvent{
			SpaceID:       SpaceID(spaceID),
			TransactionID: txn.ID,
			EventType:     "TRANSACTION_LINKED",
			Metadata: map[string]any{
				"inbox_item_id":                string(item.ID),
				"overwrite_linked_transaction": overwrite,
				"description":                  linkedDesc,
			},
			CreateTime: time.Now(),
		}
		if _, err := s.LogTransactionEvent(ctx, evtLinked); err != nil {
			fmt.Printf("warning: failed to log transaction linked event: %v\n", err)
		}

		return item, nil
	}

	// 3. If it is linked to a bill/scheduled payment:
	if item.ScheduledPaymentID != nil && *item.ScheduledPaymentID != "" {
		payID := ScheduledPaymentID(*item.ScheduledPaymentID)
		if item.DocType == InboxItemDocInvoice {
			// A. If it's an unpaid INVOICE: do NOT create a transaction.
			// Just update the scheduled payment amount and metadata to the actual values.
			payment, err := s.deps.ScheduledPaymentStore.GetByID(ctx, SpaceID(spaceID), payID)
			if err != nil {
				return nil, fmt.Errorf("get scheduled payment: %w", err)
			}
			payment.Amount = item.Amount
			payment.SourceType = item.VendorName
			if err := s.deps.ScheduledPaymentStore.Update(ctx, payment); err != nil {
				return nil, fmt.Errorf("update scheduled payment: %w", err)
			}

			// Mark inbox item as resolved and link it
			item.Status = InboxItemResolved
			if err := s.deps.InboxItemStore.Update(ctx, item); err != nil {
				return nil, fmt.Errorf("resolve inbox item: %w", err)
			}
			return item, nil
		} else {
			// B. If it's a RECEIPT or other: promote the scheduled payment to a finished transaction.
			txn, err := s.ConfirmScheduledPayment(ctx, ConfirmScheduledPaymentRequest{
				SpaceID:         SpaceID(spaceID),
				PaymentID:       payID,
				AccountID:       (*AccountID)(item.AccountID),
				TransactionDate: item.TransactionDate,
				EffectiveDate:   time.Now().UTC(),
				ActualAmount:    item.Amount,
				Description:     item.VendorName,
			})
			if err != nil {
				return nil, fmt.Errorf("confirm scheduled payment: %w", err)
			}

			// Mark inbox item as resolved and link it
			item.MarkResolved(&txn.ID)
			if err := s.deps.InboxItemStore.Update(ctx, item); err != nil {
				return nil, fmt.Errorf("resolve inbox item: %w", err)
			}
			return item, nil
		}
	}

	// 4. Otherwise: create a standalone ledger transaction or a transfer
	transactionType := item.MetadataString("transaction_type")
	destinationAccountID := item.MetadataString("destination_account_id")
	transferLeg := item.MetadataString("transfer_leg")
	if item.DocType == InboxItemDocInvoice {
		spID, err := NewScheduledPaymentID()
		if err != nil {
			return nil, err
		}
		var bID BudgetID
		if item.BudgetID != nil && *item.BudgetID != "" {
			bID, err = ParseBudgetID(*item.BudgetID)
			if err != nil {
				return nil, fmt.Errorf("parse budget ID: %w", err)
			}
		}

		dueDate := item.TransactionDate
		if dueDate.IsZero() {
			dueDate = time.Now().UTC()
		}

		payment := &ScheduledPayment{
			ID:         spID,
			SpaceID:    SpaceID(spaceID),
			BudgetID:   bID,
			SourceType: "invoice",
			SourceID:   item.ID,
			Amount:     item.Amount,
			Currency:   Currency(item.Currency),
			DueDate:    dueDate,
			Status:     ScheduledPaymentPending,
			Metadata: ScheduledPaymentMetadata{
				VendorName:  item.VendorName,
				DueDate:     dueDate.Format("2006-01-02"),
				Description: item.VendorName,
				InvoiceID:   item.ID,
			},
			CreateTime: time.Now().UTC(),
			UpdateTime: time.Now().UTC(),
		}

		if err := payment.Validate(); err != nil {
			return nil, fmt.Errorf("validate new scheduled payment: %w", err)
		}

		if err := s.deps.ScheduledPaymentStore.Create(ctx, payment); err != nil {
			return nil, fmt.Errorf("create scheduled payment: %w", err)
		}

		// Mark inbox item as resolved and link it
		item.Status = InboxItemResolved
		pIDStr := string(payment.ID)
		item.ScheduledPaymentID = &pIDStr
		if err := s.deps.InboxItemStore.Update(ctx, item); err != nil {
			return nil, fmt.Errorf("resolve inbox item: %w", err)
		}

		return item, nil
	}

	settings, err := s.deps.SettingsStore.GetByID(ctx, SpaceID(spaceID))
	if err != nil {
		return nil, err
	}

	if transactionType == "TRANSFER" {
		if item.AccountID == nil || *item.AccountID == "" {
			return nil, fmt.Errorf("missing source account for transfer")
		}
		srcAccID, err := ParseAccountID(*item.AccountID)
		if err != nil {
			return nil, fmt.Errorf("invalid source account: %w", err)
		}
		if destinationAccountID == "" {
			return nil, fmt.Errorf("missing destination account for transfer")
		}
		destAccID, err := ParseAccountID(destinationAccountID)
		if err != nil {
			return nil, fmt.Errorf("invalid destination account: %w", err)
		}

		tDate := item.TransactionDate
		if tDate.IsZero() {
			tDate = time.Now().UTC()
		}

		t := &Transfer{
			SpaceID:              SpaceID(spaceID),
			SourceAccountID:      srcAccID,
			DestinationAccountID: destAccID,
			SourceAmount:         item.Amount,
			DestinationAmount:    item.Amount,
			TransferDate:         tDate,
			Notes:                item.VendorName,
		}
		newT, err := s.CreateTransfer(ctx, t)
		if err != nil {
			return nil, fmt.Errorf("create transfer: %w", err)
		}

		targetLeg := TransactionTypeTransferOut
		targetAccID := srcAccID
		if transferLeg == "DESTINATION" {
			targetLeg = TransactionTypeTransferIn
			targetAccID = destAccID
		}

		page, err := s.deps.TransactionStore.ListBySpace(ctx, SpaceID(spaceID), &TransactionFilter{
			TransferID: &newT.ID,
		})
		var txs []*Transaction
		if err == nil {
			txs = page.Items
		}
		var matchedTx *Transaction
		if err == nil {
			for _, tx := range txs {
				if tx.Type == targetLeg {
					matchedTx = tx
					break
				}
			}
		}

		// Mark inbox item as resolved and link it
		var matchedTxID *TransactionID
		if matchedTx != nil {
			matchedTxID = &matchedTx.ID
		}
		item.MarkResolved(matchedTxID)
		targetAccIDStr := string(targetAccID)
		item.AccountID = &targetAccIDStr

		if err := s.deps.InboxItemStore.Update(ctx, item); err != nil {
			return nil, fmt.Errorf("resolve inbox item: %w", err)
		}

		return item, nil
	}

	var txnType TransactionType
	var budgetID *BudgetID
	var periodID *PeriodID

	switch transactionType {
	case "INCOME":
		txnType = TransactionTypeIncome
	case "EXPENSE":
		txnType = TransactionTypeExpense
		if item.BudgetID != nil && *item.BudgetID != "" {
			bID, err := ParseBudgetID(*item.BudgetID)
			if err != nil {
				return nil, fmt.Errorf("parse budget ID: %w", err)
			}
			budget, err := s.deps.BudgetStore.GetByID(ctx, SpaceID(spaceID), bID)
			if err != nil {
				return nil, fmt.Errorf("get budget: %w", err)
			}
			period, err := s.GetOrCreatePeriod(ctx, SpaceID(spaceID), budget.ID, item.TransactionDate)
			if err != nil {
				return nil, fmt.Errorf("get or create period: %w", err)
			}
			budgetID = &budget.ID
			periodID = &period.ID
		}
	default:
		if item.DocType == InboxItemDocReceipt || item.DocType == InboxItemDocInvoice {
			txnType = TransactionTypeExpense
		} else {
			txnType = TransactionTypeIncome
		}
		if item.BudgetID != nil && *item.BudgetID != "" {
			bID, err := ParseBudgetID(*item.BudgetID)
			if err != nil {
				return nil, fmt.Errorf("parse budget ID: %w", err)
			}
			budget, err := s.deps.BudgetStore.GetByID(ctx, SpaceID(spaceID), bID)
			if err != nil {
				return nil, fmt.Errorf("get budget: %w", err)
			}
			period, err := s.GetOrCreatePeriod(ctx, SpaceID(spaceID), budget.ID, item.TransactionDate)
			if err != nil {
				return nil, fmt.Errorf("get or create period: %w", err)
			}
			budgetID = &budget.ID
			periodID = &period.ID
		}
	}

	// Calculate base currency conversion
	rate, err := s.resolveExchangeRate(ctx, SpaceID(spaceID), Currency(item.Currency), settings.BaseCurrency, item.TransactionDate, true)
	if err != nil {
		return nil, err
	}
	amountInBase := ConvertAmount(item.Amount, rate)

	tID, err := NewTransactionID()
	if err != nil {
		return nil, err
	}

	var accountID *AccountID
	if item.AccountID != nil && *item.AccountID != "" {
		accID, err := ParseAccountID(*item.AccountID)
		if err == nil {
			accountID = &accID
		}
	}

	txDate := item.TransactionDate
	if txDate.IsZero() {
		txDate = time.Now().UTC()
	}

	txn := &Transaction{
		ID:              tID,
		SpaceID:         SpaceID(spaceID),
		Type:            txnType,
		BudgetID:        budgetID,
		PeriodID:        periodID,
		AccountID:       accountID,
		Amount:          item.Amount,
		Currency:        Currency(item.Currency),
		AmountInBase:    amountInBase,
		Description:     item.VendorName,
		TransactionDate: txDate,
		CreateTime:      time.Now().UTC(),
		UpdateTime:      time.Now().UTC(),
	}

	if err := txn.Validate(); err != nil {
		return nil, err
	}

	if err := s.createTransaction(ctx, txn); err != nil {
		return nil, err
	}

	// Handle optional borrowing link for newly promoted transaction
	if item.BorrowingID != nil && *item.BorrowingID != "" {
		linkType := BorrowingLinkTypeInitialReceipt
		if item.BorrowingLinkType != nil {
			linkType = *item.BorrowingLinkType
		}
		if err := s.handleBorrowingLinkForTransaction(ctx, SpaceID(spaceID), txn, *item.BorrowingID, linkType); err != nil {
			return nil, fmt.Errorf("link borrowing to new transaction: %w", err)
		}
	}

	// Mark inbox item as resolved and link it
	item.MarkResolved(&txn.ID)
	if err := s.deps.InboxItemStore.Update(ctx, item); err != nil {
		return nil, fmt.Errorf("resolve inbox item: %w", err)
	}

	return item, nil
}

func (s *Service) handleBorrowingLinkForTransaction(ctx context.Context, spaceID SpaceID, txn *Transaction, borrowingIDStr string, linkType BorrowingLinkType) error {
	if borrowingIDStr == "" {
		return nil
	}
	bID, err := ParseBorrowingID(borrowingIDStr)
	if err != nil {
		return fmt.Errorf("invalid borrowing ID: %w", err)
	}
	borrowing, err := s.deps.BorrowingStore.GetByID(ctx, spaceID, bID)
	if err != nil {
		return fmt.Errorf("get borrowing: %w", err)
	}

	if txn.Metadata.BorrowingID != nil {
		if *txn.Metadata.BorrowingID != borrowing.ID {
			return ErrCannotRelinkTransactionToDifferentBorrowing
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
		if err := s.deps.BorrowingStore.Update(ctx, borrowing); err != nil {
			return fmt.Errorf("update borrowing remaining balance: %w", err)
		}

	case BorrowingLinkTypeAdditionalLoan:
		role = "ADDITIONAL_LOAN"
		borrowing.TotalAmount += txn.Amount
		borrowing.RemainingAmount += txn.Amount
		borrowing.UpdateTime = time.Now().UTC()
		if err := s.deps.BorrowingStore.Update(ctx, borrowing); err != nil {
			return fmt.Errorf("update borrowing total balance: %w", err)
		}
	}

	// Update metadata with borrowing link details
	txn.LinkBorrowing(borrowing.ID, role)

	if err := s.deps.TransactionStore.Update(ctx, txn); err != nil {
		return fmt.Errorf("update transaction borrowing metadata: %w", err)
	}

	return nil
}

func (s *Service) handleScheduledPaymentLinkForTransaction(ctx context.Context, spaceID SpaceID, txn *Transaction, paymentIDStr string) error {
	if paymentIDStr == "" {
		return nil
	}
	pID, err := ParseScheduledPaymentID(paymentIDStr)
	if err != nil {
		return fmt.Errorf("invalid scheduled payment ID: %w", err)
	}
	payment, err := s.deps.ScheduledPaymentStore.GetByID(ctx, spaceID, pID)
	if err != nil {
		return fmt.Errorf("get scheduled payment: %w", err)
	}

	if txn.Metadata.ScheduledPaymentID != nil {
		if *txn.Metadata.ScheduledPaymentID != payment.ID {
			return ErrCannotRelinkTransactionToDifferentScheduledPayment
		}
		// Already linked to this exact scheduled payment (ensure payment is marked paid)
		if payment.Status != ScheduledPaymentPaid {
			payment.Status = ScheduledPaymentPaid
			payment.UpdateTime = time.Now().UTC()
			if err := s.deps.ScheduledPaymentStore.Update(ctx, payment); err != nil {
				return fmt.Errorf("update scheduled payment status: %w", err)
			}
		}
		return nil
	}

	// Retroactively mark scheduled payment as paid and link transaction
	payment.Status = ScheduledPaymentPaid
	payment.UpdateTime = time.Now().UTC()
	if err := s.deps.ScheduledPaymentStore.Update(ctx, payment); err != nil {
		return fmt.Errorf("update scheduled payment status: %w", err)
	}

	txn.Metadata.ScheduledPaymentID = &payment.ID
	txn.UpdateTime = time.Now().UTC()
	if err := s.deps.TransactionStore.Update(ctx, txn); err != nil {
		return fmt.Errorf("update transaction scheduled payment metadata: %w", err)
	}

	return nil
}

// GetBudget retrieves a budget by its unique identifier for a space.
func (s *Service) GetBudget(ctx context.Context, spaceID SpaceID, id BudgetID) (*Budget, error) {
	if err := spaceID.Validate(); err != nil {
		return nil, err
	}
	if err := id.Validate(); err != nil {
		return nil, err
	}
	return s.deps.BudgetStore.GetByID(ctx, spaceID, id)
}

// GetBudgets retrieves a list of budgets by their identifiers for a space.
func (s *Service) GetBudgets(ctx context.Context, spaceID SpaceID, ids []BudgetID) ([]*Budget, error) {
	if err := spaceID.Validate(); err != nil {
		return nil, err
	}
	return s.deps.BudgetStore.GetByIDs(ctx, spaceID, ids)
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

func (s *Service) CreateInstitution(ctx context.Context, inst *Institution) (*Institution, error) {
	if err := inst.Init(); err != nil {
		return nil, err
	}
	if err := inst.Validate(); err != nil {
		return nil, err
	}
	if err := s.deps.InstitutionStore.Create(ctx, inst); err != nil {
		return nil, err
	}
	return inst, nil
}

func (s *Service) GetInstitution(ctx context.Context, spaceID SpaceID, id InstitutionID) (*Institution, error) {
	return s.deps.InstitutionStore.GetByID(ctx, spaceID, id)
}

func (s *Service) UpdateInstitution(ctx context.Context, inst *Institution, mask []string) (*Institution, error) {
	existing, err := s.deps.InstitutionStore.GetByID(ctx, inst.SpaceID, inst.ID)
	if err != nil {
		return nil, err
	}
	if inst.Version > 0 && inst.Version != existing.Version {
		return nil, ErrInstitutionVersionMismatch
	}
	if err := existing.ApplyPatch(inst, mask); err != nil {
		return nil, err
	}
	if err := s.deps.InstitutionStore.Update(ctx, existing); err != nil {
		return nil, err
	}
	return existing, nil
}

func (s *Service) DeleteInstitution(ctx context.Context, spaceID SpaceID, id InstitutionID, opts DeleteOptions) error {
	return s.deps.InstitutionStore.Delete(ctx, spaceID, id, opts)
}

func (s *Service) ListInstitutions(ctx context.Context, spaceID SpaceID, filter *ListInstitutionsFilter) (*paging.Page[*Institution], error) {
	if s.deps.InstitutionStore == nil {
		return &paging.Page[*Institution]{Items: []*Institution{}}, nil
	}
	return s.deps.InstitutionStore.ListBySpace(ctx, spaceID, filter)
}

func (s *Service) GetInstitutionsByIDs(ctx context.Context, spaceID SpaceID, ids []InstitutionID) ([]*Institution, error) {
	if s.deps.InstitutionStore == nil || len(ids) == 0 {
		return nil, nil
	}
	return s.deps.InstitutionStore.GetByIDs(ctx, spaceID, ids)
}

func (s *Service) ResolveInstitution(ctx context.Context, spaceID SpaceID, name string) (*ResolveInstitutionResult, error) {
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

	if s.deps.InstitutionStore != nil {
		existing, err := s.deps.InstitutionStore.GetByName(ctx, spaceID, cleanName)
		if err == nil && existing != nil {
			result.ExistingInstitutionID = &existing.ID
			result.ExistingInstitutionName = existing.Name
			result.Domain = existing.Domain
			result.LogoURL = existing.LogoURL
			result.Color = existing.Color
		}
	}

	return result, nil
}
