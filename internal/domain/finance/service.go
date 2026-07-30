package finance

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/id"
	"github.com/masterkeysrd/saturn/internal/platform/paging"
)

// Dependencies defines the required persistence adapters for the service.
type Dependencies struct {
	SettingsStore           SettingsStore
	BudgetStore             BudgetStore
	PeriodStore             PeriodStore
	ExchangeRateStore       ExchangeRateStore
	TransactionStore        TransactionStore
	InsightsStore           InsightsStore
	RecurringExpenseStore   RecurringExpenseStore
	ScheduledPaymentStore   ScheduledPaymentStore
	BorrowingStore          BorrowingStore
	BorrowingRepaymentStore BorrowingRepaymentStore
	AccountStore            AccountStore
	TransferStore           TransferStore
	TransactionEventStore   TransactionEventStore
	InboxItemStore          InboxItemStore
}

// Service implements the domain-level finance operations.
type Service struct {
	deps Dependencies
}

// NewService instantiates a new Service.
func NewService(deps Dependencies) *Service {
	return &Service{deps: deps}
}

// ConfigureFinance creates or updates the workspace base currency settings.
func (s *Service) ConfigureFinance(ctx context.Context, settings *FinanceSettings) (*FinanceSettings, error) {
	if err := settings.Validate(); err != nil {
		return nil, err
	}

	settings.CreateTime = time.Now().UTC()
	settings.UpdateTime = time.Now().UTC()

	existing, err := s.deps.SettingsStore.GetByID(ctx, settings.SpaceID)
	if err == nil {
		// Base currency is immutable once configured
		return existing, nil
	}

	if !errors.Is(err, ErrSettingsNotFound) {
		return nil, err
	}

	if err := s.deps.SettingsStore.Create(ctx, settings); err != nil {
		return nil, err
	}

	// Automatically initialize a default Cash Account for this space
	cashAccID, err := NewAccountID()
	if err == nil {
		defaultCashAcc := &Account{
			ID:             cashAccID,
			SpaceID:        settings.SpaceID,
			Name:           "Cash",
			Type:           AccountTypeCash,
			Currency:       settings.BaseCurrency,
			IsActive:       true,
			InitialBalance: 0,
			CurrentBalance: 0,
		}
		if _, err := s.CreateAccount(ctx, defaultCashAcc); err != nil {
			fmt.Printf("[Finance Service] Warning: failed to create default Cash Account: %v\n", err)
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
	if string(budget.ID) == "" {
		bID, err := NewBudgetID()
		if err != nil {
			return nil, err
		}
		budget.ID = bID
	}

	if err := budget.Validate(); err != nil {
		return nil, err
	}

	// Verify workspace settings exist
	_, err := s.deps.SettingsStore.GetByID(ctx, budget.SpaceID)
	if err != nil {
		return nil, fmt.Errorf("verify workspace settings: %w", err)
	}

	budget.IsActive = true
	budget.CreateTime = time.Now().UTC()
	budget.UpdateTime = time.Now().UTC()

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
	rate := 1.0
	if budget.Currency != settings.BaseCurrency {
		rateRecord, err := s.getExchangeRate(ctx, ExchangeRateKey{
			SpaceID:      budget.SpaceID,
			FromCurrency: Currency(budget.Currency),
			ToCurrency:   Currency(settings.BaseCurrency),
			RateDate:     date,
		})
		if err != nil {
			if errors.Is(err, ErrExchangeRateNotFound) {
				rate = 0.0
			} else {
				return nil, fmt.Errorf("fetch exchange rate from %s to %s for date %s: %w", budget.Currency, settings.BaseCurrency, date.Format("2006-01-02"), err)
			}
		} else {
			rate = rateRecord.Rate
		}
	}

	periodID, err := NewPeriodID()
	if err != nil {
		return nil, err
	}

	newPeriod := &BudgetPeriod{
		ID:                 periodID,
		BudgetID:           budget.ID,
		SpaceID:            budget.SpaceID,
		StartDate:          startDate,
		EndDate:            endDate,
		LimitAmount:        budget.LimitAmount,
		Currency:           budget.Currency,
		BaseCurrency:       settings.BaseCurrency,
		ExchangeRateToBase: rate,
		CreateTime:         time.Now().UTC(),
		UpdateTime:         time.Now().UTC(),
	}

	if err := newPeriod.Validate(); err != nil {
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
		rate := 1.0
		if b.Currency != settings.BaseCurrency {
			rateRecord, err := s.getExchangeRate(ctx, ExchangeRateKey{
				SpaceID:      b.SpaceID,
				FromCurrency: Currency(b.Currency),
				ToCurrency:   Currency(settings.BaseCurrency),
				RateDate:     date,
			})
			if err != nil {
				if errors.Is(err, ErrExchangeRateNotFound) {
					rate = 0.0
				} else {
					return nil, fmt.Errorf("fetch exchange rate from %s to %s for date %s: %w", b.Currency, settings.BaseCurrency, date.Format("2006-01-02"), err)
				}
			} else {
				rate = rateRecord.Rate
			}
		}

		periodID, err := NewPeriodID()
		if err != nil {
			return nil, err
		}

		newPeriod := &BudgetPeriod{
			ID:                 periodID,
			BudgetID:           b.ID,
			SpaceID:            b.SpaceID,
			StartDate:          bounds.Start,
			EndDate:            bounds.End,
			LimitAmount:        b.LimitAmount,
			Currency:           b.Currency,
			BaseCurrency:       settings.BaseCurrency,
			ExchangeRateToBase: rate,
			CreateTime:         time.Now().UTC(),
			UpdateTime:         time.Now().UTC(),
		}

		if err := newPeriod.Validate(); err != nil {
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
	if err := rate.Validate(); err != nil {
		return nil, fmt.Errorf("validate exchange rate: %w", err)
	}
	rate.CreateTime = time.Now().UTC()
	rate.ID = rate.ComputeID()

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

// UpdateExchangeRate updates an existing exchange rate record.
func (s *Service) UpdateExchangeRate(ctx context.Context, spaceID SpaceID, id string, rate *ExchangeRate) (*ExchangeRate, error) {
	if err := spaceID.Validate(); err != nil {
		return nil, fmt.Errorf("validate space ID: %w", err)
	}
	from, to, t, err := ParseExchangeRateID(id)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrExchangeRateNotFound, err)
	}
	rate.SpaceID = spaceID
	rate.FromCurrency = from
	rate.ToCurrency = to
	rate.RateDate = t
	rate.ID = id
	if err := rate.Validate(); err != nil {
		return nil, fmt.Errorf("validate exchange rate: %w", err)
	}
	if err := s.deps.ExchangeRateStore.Update(ctx, rate); err != nil {
		return nil, err
	}
	return rate, nil
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
	metadata := map[string]any{}
	if existing.Amount != txn.Amount {
		metadata["old_amount"] = existing.Amount
		metadata["new_amount"] = txn.Amount
	}
	if existing.Description != txn.Description {
		metadata["old_description"] = existing.Description
		metadata["new_description"] = txn.Description
	}
	if existing.Currency != txn.Currency {
		metadata["old_currency"] = string(existing.Currency)
		metadata["new_currency"] = string(txn.Currency)
	}
	if existing.BudgetID != nil && txn.BudgetID != nil && *existing.BudgetID != *txn.BudgetID {
		metadata["old_budget_id"] = string(*existing.BudgetID)
		metadata["new_budget_id"] = string(*txn.BudgetID)
	}
	if (existing.AccountID == nil && txn.AccountID != nil) ||
		(existing.AccountID != nil && txn.AccountID == nil) ||
		(existing.AccountID != nil && txn.AccountID != nil && *existing.AccountID != *txn.AccountID) {
		if existing.AccountID != nil {
			metadata["old_account_id"] = string(*existing.AccountID)
		}
		if txn.AccountID != nil {
			metadata["new_account_id"] = string(*txn.AccountID)
		}
	}

	if len(metadata) > 0 {
		_, _ = s.LogTransactionEvent(ctx, &TransactionEvent{
			SpaceID:       txn.SpaceID,
			TransactionID: txn.ID,
			EventType:     "MANUAL_EDIT",
			Metadata:      metadata,
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
	if err := req.SpaceID.Validate(); err != nil {
		return nil, fmt.Errorf("validate space ID: %w", err)
	}

	settings, err := s.deps.SettingsStore.GetByID(ctx, req.SpaceID)
	if err != nil {
		return nil, fmt.Errorf("verify workspace settings: %w", err)
	}

	g, err := ParseGranularity(req.Granularity)
	if err != nil {
		return nil, fmt.Errorf("invalid granularity: %w", err)
	}

	start := req.StartDate
	if start.IsZero() {
		switch g {
		case GranularityDaily:
			start = time.Now().AddDate(0, 0, -30)
		case GranularityWeekly:
			start = time.Now().AddDate(0, 0, -84) // 12 weeks
		case GranularityMonthly:
			start = time.Now().AddDate(-1, 0, 0) // 12 months
		case GranularityYearly:
			start = time.Now().AddDate(-5, 0, 0) // 5 years
		}
	}
	end := req.EndDate
	if end.IsZero() {
		end = time.Now()
	}

	// Fetch trend, distributions, and top expenses from storage
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

	// 1. Group raw trend rows by interval_start
	trendPoints := make([]*TrendDataPoint, 0)
	var currentPoint *TrendDataPoint
	var lastStart time.Time

	for _, row := range trendRows {
		if currentPoint == nil || !row.IntervalStart.Equal(lastStart) {
			var label string
			switch g {
			case GranularityDaily:
				label = row.IntervalStart.Format("02 Jan")
			case GranularityWeekly:
				_, w := row.IntervalStart.ISOWeek()
				label = fmt.Sprintf("Wk %d", w)
			case GranularityMonthly:
				label = row.IntervalStart.Format("Jan 06")
			case GranularityYearly:
				label = row.IntervalStart.Format("2006")
			}

			currentPoint = &TrendDataPoint{
				Label:     label,
				StartDate: row.IntervalStart.Format(time.RFC3339),
			}
			trendPoints = append(trendPoints, currentPoint)
			lastStart = row.IntervalStart
		}

		currentPoint.AmountInBase += row.SpentInBase
		currentPoint.TransactionCount += row.TxnCount

		if row.BudgetID != "" {
			currentPoint.Contributions = append(currentPoint.Contributions, &BudgetContribution{
				BudgetID:      row.BudgetID,
				BudgetName:    row.BudgetName,
				BudgetColor:   row.BudgetColor,
				AmountInBase:  row.SpentInBase,
				AmountInLocal: row.SpentInLocal,
				LocalCurrency: row.BudgetCurrency,
			})
		} else {
			currentPoint.Contributions = append(currentPoint.Contributions, &BudgetContribution{
				BudgetID:      "unbudgeted",
				BudgetName:    "Unbudgeted",
				BudgetColor:   "#94a3b8",
				AmountInBase:  row.SpentInBase,
				AmountInLocal: row.SpentInLocal,
				LocalCurrency: string(settings.BaseCurrency),
			})
		}
	}

	// Calculate contribution percentages
	for _, pt := range trendPoints {
		if pt.AmountInBase > 0 {
			for _, c := range pt.Contributions {
				c.ContributionPercentage = (float64(c.AmountInBase) / float64(pt.AmountInBase)) * 100.0
			}
		}
	}

	var unbudgetedSpentInBase int64
	for _, row := range trendRows {
		if row.BudgetID == "" {
			unbudgetedSpentInBase += row.SpentInBase
		}
	}

	// 2. Map budget distributions
	var totalSpent int64
	var totalLimit int64
	distributions := make([]*BudgetUsage, 0, len(distRows)+1)

	for _, r := range distRows {
		totalSpent += r.SpentInBase

		// Convert budget limit to base currency using the period's exchange rate
		limitInBase := int64(float64(r.BudgetLimit) * r.ExchangeRateToBase)
		totalLimit += limitInBase

		usagePct := 0.0
		if r.BudgetLimit > 0 {
			usagePct = (float64(r.SpentInLocalMatching) / float64(r.BudgetLimit)) * 100.0
		}

		distributions = append(distributions, &BudgetUsage{
			BudgetID:        r.BudgetID,
			BudgetName:      r.BudgetName,
			BudgetColor:     r.BudgetColor,
			BudgetIcon:      r.BudgetIcon,
			Limit:           r.BudgetLimit,
			Spent:           r.SpentInLocalMatching,
			SpentInBase:     r.SpentInBase,
			UsagePercentage: usagePct,
		})
	}

	if unbudgetedSpentInBase > 0 {
		totalSpent += unbudgetedSpentInBase
		distributions = append(distributions, &BudgetUsage{
			BudgetID:        "unbudgeted",
			BudgetName:      "Unbudgeted",
			BudgetColor:     "#94a3b8",
			BudgetIcon:      "Coins",
			Limit:           0,
			Spent:           unbudgetedSpentInBase,
			SpentInBase:     unbudgetedSpentInBase,
			UsagePercentage: 0.0,
		})
	}

	// 3. Overall calculation stats
	remaining := totalLimit - totalSpent
	burnRate := 0.0
	days := end.Sub(start).Hours() / 24.0
	if days > 0 {
		burnRate = float64(totalSpent) / days
	}

	// 4. Map top expenses
	topExpenses := make([]*HighValueExpense, 0, len(topRows))
	for _, r := range topRows {
		topExpenses = append(topExpenses, &HighValueExpense{
			TransactionID:   r.TransactionID,
			Description:     r.Description,
			Amount:          r.Amount,
			Currency:        r.Currency,
			AmountInBase:    r.AmountInBase,
			BudgetName:      r.BudgetName,
			TransactionDate: r.TransactionDate,
			EffectiveDate:   r.EffectiveDate,
		})
	}

	return &SpentInsights{
		TotalLimit:      totalLimit,
		TotalSpent:      totalSpent,
		RemainingBudget: remaining,
		BurnRate:        burnRate,
		Trend:           trendPoints,
		Distributions:   distributions,
		TopExpenses:     topExpenses,
	}, nil
}

// CreateRecurringExpense configures a new recurring expense rule.
func (s *Service) CreateRecurringExpense(ctx context.Context, re *RecurringExpense) (*RecurringExpense, error) {
	if re.ID == "" {
		id, err := NewRecurringExpenseID()
		if err != nil {
			return nil, err
		}
		re.ID = id
	}

	re.Status = RecurringExpenseActive
	re.CreateTime = time.Now().UTC()
	re.UpdateTime = time.Now().UTC()

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

// UpdateRecurringExpense updates an existing recurring expense template.
func (s *Service) UpdateRecurringExpense(ctx context.Context, re *RecurringExpense) (*RecurringExpense, error) {
	existing, err := s.deps.RecurringExpenseStore.GetByID(ctx, re.SpaceID, re.ID)
	if err != nil {
		return nil, err
	}

	re.CreateTime = existing.CreateTime
	re.UpdateTime = time.Now().UTC()

	if err := re.Validate(); err != nil {
		return nil, err
	}

	if err := s.deps.RecurringExpenseStore.Update(ctx, re); err != nil {
		return nil, err
	}
	return re, nil
}

// DeleteRecurringExpense deletes a recurring expense rule.
func (s *Service) DeleteRecurringExpense(ctx context.Context, id RecurringExpenseID) error {
	if err := id.Validate(); err != nil {
		return err
	}
	return s.deps.RecurringExpenseStore.Delete(ctx, id)
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

	// Resolve budget period for the transaction based on effectiveDate
	period, err := s.GetOrCreatePeriod(ctx, payment.SpaceID, budget.ID, req.EffectiveDate)
	if err != nil {
		return nil, err
	}

	// Calculate base currency conversion
	rate := 1.0
	if currency != settings.BaseCurrency {
		rateRecord, err := s.getExchangeRate(ctx, ExchangeRateKey{
			SpaceID:      payment.SpaceID,
			FromCurrency: currency,
			ToCurrency:   settings.BaseCurrency,
			RateDate:     req.TransactionDate,
		})
		if err != nil {
			return nil, err
		}
		rate = rateRecord.Rate
	}

	amountInBase := int64(float64(req.ActualAmount) * rate)

	description := ""
	if req.Description != "" {
		description = req.Description
	} else if len(payment.Metadata) > 0 {
		var meta struct {
			Description string `json:"description"`
		}
		if err := json.Unmarshal(payment.Metadata, &meta); err == nil && meta.Description != "" {
			description = meta.Description
		}
	}

	if description == "" && payment.SourceType == SourceTypeRecurrentExpense {
		if exp, err := s.deps.RecurringExpenseStore.GetByID(ctx, payment.SpaceID, RecurringExpenseID(payment.SourceID)); err == nil {
			description = exp.Name
		}
	} else if description == "" && payment.SourceType == "invoice" {
		if item, err := s.deps.InboxItemStore.Get(ctx, string(payment.SpaceID), payment.SourceID); err == nil {
			if item.VendorName != "" {
				description = item.VendorName
			}
		}
	}

	if description == "" {
		description = "Scheduled Payment"
	}

	tID, err := NewTransactionID()
	if err != nil {
		return nil, err
	}

	txn := &Transaction{
		ID:              tID,
		SpaceID:         payment.SpaceID,
		AccountID:       req.AccountID,
		Type:            TransactionTypeExpense,
		BudgetID:        &budgetID,
		PeriodID:        &period.ID,
		Amount:          req.ActualAmount,
		Currency:        currency,
		AmountInBase:    amountInBase,
		Description:     description,
		TransactionDate: req.TransactionDate,
		EffectiveDate:   req.EffectiveDate,
		SourceType:      &payment.SourceType,
		SourceID:        &payment.SourceID,
		CreateTime:      time.Now().UTC(),
		UpdateTime:      time.Now().UTC(),
	}

	if err := txn.Validate(); err != nil {
		return nil, err
	}

	if err := s.deps.TransactionStore.Create(ctx, txn); err != nil {
		return nil, err
	}

	if req.AccountID != nil && *req.AccountID != "" {
		if err := s.adjustAccountBalance(ctx, payment.SpaceID, *req.AccountID, req.ActualAmount, TransactionTypeExpense, false); err != nil {
			return nil, fmt.Errorf("failed to adjust account balance: %w", err)
		}
	}

	// Log the historical scheduled event with the deferred creation date
	_, err = s.LogTransactionEvent(ctx, &TransactionEvent{
		SpaceID:       payment.SpaceID,
		TransactionID: txn.ID,
		EventType:     "EXPENSE_SCHEDULED",
		CreateTime:    payment.CreateTime,
		Metadata:      map[string]any{"scheduled_payment_id": string(payment.ID)},
	})
	if err != nil {
		return nil, fmt.Errorf("failed to log scheduled event: %w", err)
	}

	// Log the actual payment confirmation event with the transaction date
	_, err = s.LogTransactionEvent(ctx, &TransactionEvent{
		SpaceID:       payment.SpaceID,
		TransactionID: txn.ID,
		EventType:     "BANK_CONFIRM_RECEIVED",
		CreateTime:    req.TransactionDate,
		Metadata:      map[string]any{"actual_amount": req.ActualAmount},
	})
	if err != nil {
		return nil, fmt.Errorf("failed to log payment confirmation event: %w", err)
	}

	if err := s.deps.ScheduledPaymentStore.Delete(ctx, req.PaymentID); err != nil {
		return nil, err
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

	// Update transaction link properties
	st := payment.SourceType
	sid := payment.SourceID
	txn.SourceType = &st
	txn.SourceID = &sid
	txn.UpdateTime = time.Now().UTC()

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

	// Delete/clear the pending scheduled payment instance
	if err := s.deps.ScheduledPaymentStore.Delete(ctx, req.PaymentID); err != nil {
		return nil, fmt.Errorf("failed to delete scheduled payment: %w", err)
	}

	return txn, nil
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

	payment.Status = ScheduledPaymentSkipped
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

			var dateTag string
			switch re.Interval {
			case "monthly":
				dateTag = re.NextDueDate.Format("2006-01")
			case "yearly":
				dateTag = re.NextDueDate.Format("2006")
			case "weekly":
				dateTag = re.NextDueDate.Format("2006-01-02")
			default:
				dateTag = re.NextDueDate.Format("2006-01-02")
			}

			descText := fmt.Sprintf("%s (%s)", re.Name, dateTag)
			metaMap := map[string]any{
				"name":        re.Name,
				"due_date":    re.NextDueDate.Format("2006-01-02"),
				"description": descText,
			}
			metaBytes, err := json.Marshal(metaMap)
			if err != nil {
				return fmt.Errorf("marshal scheduled payment metadata: %w", err)
			}

			payment := &ScheduledPayment{
				ID:         spID,
				SpaceID:    re.SpaceID,
				BudgetID:   re.BudgetID,
				SourceType: SourceTypeRecurrentExpense,
				SourceID:   string(re.ID),
				Amount:     re.Amount,
				Currency:   re.Currency,
				DueDate:    re.NextDueDate,
				Status:     ScheduledPaymentPending,
				Metadata:   metaBytes,
				CreateTime: time.Now().UTC(),
				UpdateTime: time.Now().UTC(),
			}

			if err := payment.Validate(); err != nil {
				return err
			}

			if err := s.deps.ScheduledPaymentStore.Create(ctx, payment); err != nil {
				return err
			}

			// Advance the template next due date
			switch re.Interval {
			case "weekly":
				re.NextDueDate = re.NextDueDate.AddDate(0, 0, 7)
			case "monthly":
				re.NextDueDate = re.NextDueDate.AddDate(0, 1, 0)
			case "yearly":
				re.NextDueDate = re.NextDueDate.AddDate(1, 0, 0)
			default:
				return fmt.Errorf("unsupported interval for recurring expense %s: %s", re.ID, re.Interval)
			}
		}

		re.UpdateTime = time.Now().UTC()
		if err := s.deps.RecurringExpenseStore.Update(ctx, re); err != nil {
			return err
		}
	}

	return nil
}

// createTransaction persists a transaction and adjusts the account balance.
func (s *Service) createTransaction(ctx context.Context, txn *Transaction) error {
	// 1. Set dates
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
		period, err := s.GetOrCreatePeriod(ctx, txn.SpaceID, budget.ID, txn.EffectiveDate)
		if err != nil {
			return fmt.Errorf("resolve active budget period: %w", err)
		}
		txn.PeriodID = &period.ID
	}

	// 4. Centralized Base Currency Exchange Rate Calculation
	if txn.AmountInBase == 0 || txn.Currency != settings.BaseCurrency {
		rate := 1.0
		if txn.Currency != settings.BaseCurrency {
			rateRecord, err := s.getExchangeRate(ctx, ExchangeRateKey{
				SpaceID:      txn.SpaceID,
				FromCurrency: txn.Currency,
				ToCurrency:   settings.BaseCurrency,
				RateDate:     txn.TransactionDate,
			})
			if err != nil {
				return fmt.Errorf("fetch exchange rate from %s to %s for date %s: %w", txn.Currency, settings.BaseCurrency, txn.TransactionDate.Format("2006-01-02"), err)
			}
			rate = rateRecord.Rate
		}
		txn.AmountInBase = int64(float64(txn.Amount) * rate)
	}

	if err := txn.Validate(); err != nil {
		return err
	}

	// 5. Persist the transaction
	if err := s.deps.TransactionStore.Create(ctx, txn); err != nil {
		return err
	}

	// 6. Adjust account balance
	if txn.AccountID != nil {
		if err := s.adjustAccountBalance(ctx, txn.SpaceID, *txn.AccountID, txn.Amount, txn.Type, false); err != nil {
			return fmt.Errorf("failed to adjust account balance: %w", err)
		}
	}

	return nil
}

// updateTransaction updates a transaction and recalculates account balances.
func (s *Service) updateTransaction(ctx context.Context, txn *Transaction, existing *Transaction) error {
	if existing.Type == TransactionTypeBalanceAdjustment || (existing.SourceType != nil && *existing.SourceType == "SYSTEM_BALANCE_ADJUSTMENT") {
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
		period, err := s.GetOrCreatePeriod(ctx, txn.SpaceID, budget.ID, txn.EffectiveDate)
		if err != nil {
			return fmt.Errorf("resolve active budget period: %w", err)
		}
		txn.PeriodID = &period.ID
	} else {
		txn.PeriodID = nil
	}

	// 4. Centralized Base Currency Exchange Rate Calculation
	if txn.Currency != settings.BaseCurrency {
		rateRecord, err := s.getExchangeRate(ctx, ExchangeRateKey{
			SpaceID:      txn.SpaceID,
			FromCurrency: txn.Currency,
			ToCurrency:   settings.BaseCurrency,
			RateDate:     txn.TransactionDate,
		})
		if err != nil {
			return fmt.Errorf("fetch exchange rate from %s to %s for date %s: %w", txn.Currency, settings.BaseCurrency, txn.TransactionDate.Format("2006-01-02"), err)
		}
		txn.AmountInBase = int64(float64(txn.Amount) * rateRecord.Rate)
	} else {
		txn.AmountInBase = txn.Amount
	}

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

// deleteTransaction deletes a transaction and reverts its account balance impact.
func (s *Service) deleteTransaction(ctx context.Context, txn *Transaction) error {
	// 1. Revert the balance impact
	if txn.AccountID != nil {
		if err := s.adjustAccountBalance(ctx, txn.SpaceID, *txn.AccountID, txn.Amount, txn.Type, true); err != nil {
			return fmt.Errorf("failed to revert account balance on deletion: %w", err)
		}
	}

	// 2. Delete the transaction
	return s.deps.TransactionStore.Delete(ctx, txn.ID)
}

// adjustAccountBalance updates the balance of the specified account based on transaction changes.
func (s *Service) adjustAccountBalance(ctx context.Context, spaceID SpaceID, accountID AccountID, amount int64, txnType TransactionType, revert bool) error {
	acc, err := s.deps.AccountStore.GetByID(ctx, spaceID, accountID)
	if err != nil {
		return err
	}

	if txnType == TransactionTypeBalanceAdjustment {
		if revert {
			acc.CurrentBalance -= amount
		} else {
			acc.CurrentBalance += amount
		}
		acc.UpdateTime = time.Now().UTC()
		return s.deps.AccountStore.Update(ctx, acc)
	}

	// Determine if the transaction is an inflow or an outflow
	isOutflow := (txnType == TransactionTypeExpense || txnType == TransactionTypeTransferOut)
	isInflow := (txnType == TransactionTypeIncome || txnType == TransactionTypeTransferIn)

	// Reverse logic if we are reverting an operation (on update or delete)
	if revert {
		isOutflow, isInflow = isInflow, isOutflow
	}

	if acc.Type == AccountTypeCreditCard {
		// Liability Account Rules (Positive = Debt Owed):
		// Outflow (Purchase/Expense/TransferOut) INCREASES debt (+amount)
		// Inflow (Card Payment/Refund/TransferIn) DECREASES debt (-amount)
		if isOutflow {
			acc.CurrentBalance += amount
		} else if isInflow {
			acc.CurrentBalance -= amount
		}
	} else {
		// Asset Account Rules (Positive = Money Owned):
		// Outflow (Withdrawal/Expense/TransferOut) DECREASES asset (-amount)
		// Inflow (Deposit/Income/TransferIn) INCREASES asset (+amount)
		if isOutflow {
			acc.CurrentBalance -= amount
		} else if isInflow {
			acc.CurrentBalance += amount
		}
	}

	acc.UpdateTime = time.Now().UTC()
	return s.deps.AccountStore.Update(ctx, acc)
}

type syncTransactionParams struct {
	SpaceID         SpaceID
	SourceID        string
	SourceType      string
	Amount          int64
	Currency        Currency
	TransactionDate time.Time
	Description     string
	Type            TransactionType
	AccountID       *AccountID
}

// Helper to create or update associated transaction
func (s *Service) syncTransaction(ctx context.Context, params syncTransactionParams) error {
	// Find if transaction already exists
	st := params.SourceType
	si := params.SourceID
	page, err := s.deps.TransactionStore.ListBySpace(ctx, params.SpaceID, &TransactionFilter{
		SourceType: &st,
		SourceID:   &si,
		PageSize:   1,
	})
	if err != nil {
		return fmt.Errorf("list existing transactions: %w", err)
	}
	existingTxs := page.Items

	if len(existingTxs) > 0 {
		existing := existingTxs[0]
		// Clone and modify for update
		txn := *existing
		txn.Amount = params.Amount
		txn.Currency = params.Currency
		txn.Description = params.Description
		txn.TransactionDate = params.TransactionDate
		txn.EffectiveDate = params.TransactionDate
		txn.Type = params.Type
		txn.AccountID = params.AccountID
		txn.UpdateTime = time.Now().UTC()

		if err := s.updateTransaction(ctx, &txn, existing); err != nil {
			return fmt.Errorf("update transaction: %w", err)
		}
	} else {
		tID, err := NewTransactionID()
		if err != nil {
			return err
		}
		txn := &Transaction{
			ID:              tID,
			SpaceID:         params.SpaceID,
			Type:            params.Type,
			Amount:          params.Amount,
			Currency:        params.Currency,
			Description:     params.Description,
			TransactionDate: params.TransactionDate,
			EffectiveDate:   params.TransactionDate,
			SourceType:      &params.SourceType,
			SourceID:        &params.SourceID,
			AccountID:       params.AccountID,
			CreateTime:      time.Now().UTC(),
			UpdateTime:      time.Now().UTC(),
		}
		if err := s.createTransaction(ctx, txn); err != nil {
			return fmt.Errorf("create transaction: %w", err)
		}
	}
	return nil
}

func (s *Service) deleteTransactionBySource(ctx context.Context, spaceID SpaceID, sourceID string, sourceType string) error {
	st := sourceType
	si := sourceID
	page, err := s.deps.TransactionStore.ListBySpace(ctx, spaceID, &TransactionFilter{
		SourceType: &st,
		SourceID:   &si,
		PageSize:   10,
	})
	if err != nil {
		return err
	}
	existingTxs := page.Items
	for _, txn := range existingTxs {
		if err := s.deleteTransaction(ctx, txn); err != nil {
			return err
		}
	}
	return nil
}

// CreateBorrowing creates a new borrowing record and syncs a transaction.
func (s *Service) CreateBorrowing(ctx context.Context, b *Borrowing, createAsTransaction bool) (*Borrowing, error) {
	if b.ID == "" {
		bID, err := NewBorrowingID()
		if err != nil {
			return nil, err
		}
		b.ID = bID
	}
	b.RemainingAmount = b.TotalAmount
	b.Status = BorrowingStatusActive
	b.CreateTime = time.Now().UTC()
	b.UpdateTime = time.Now().UTC()

	if err := b.Validate(); err != nil {
		return nil, err
	}

	settings, err := s.deps.SettingsStore.GetByID(ctx, b.SpaceID)
	if err != nil {
		return nil, err
	}

	if createAsTransaction && b.Currency != settings.BaseCurrency {
		_, err := s.getExchangeRate(ctx, ExchangeRateKey{
			SpaceID:      b.SpaceID,
			FromCurrency: b.Currency,
			ToCurrency:   settings.BaseCurrency,
			RateDate:     b.EstablishedAt,
		})
		if err != nil {
			return nil, fmt.Errorf("exchange rate not configured from %s to %s for date %s: %w", b.Currency, settings.BaseCurrency, b.EstablishedAt.Format("2006-01-02"), err)
		}
	}

	if err := s.deps.BorrowingStore.Create(ctx, b); err != nil {
		return nil, err
	}

	if createAsTransaction {
		// Sync transaction
		var txnType TransactionType
		var desc string
		if b.Direction == BorrowingDirectionLent {
			txnType = TransactionTypeExpense
			desc = fmt.Sprintf("Lent to %s", b.Counterparty)
		} else {
			txnType = TransactionTypeIncome
			desc = fmt.Sprintf("Borrowed from %s", b.Counterparty)
		}

		err = s.syncTransaction(ctx, syncTransactionParams{
			SpaceID:         b.SpaceID,
			SourceID:        string(b.ID),
			SourceType:      SourceTypeBorrowing,
			Amount:          b.TotalAmount,
			Currency:        b.Currency,
			TransactionDate: b.EstablishedAt,
			Description:     desc,
			Type:            txnType,
			AccountID:       b.AccountID,
		})
		if err != nil {
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
func (s *Service) UpdateBorrowing(ctx context.Context, b *Borrowing) (*Borrowing, error) {
	existing, err := s.deps.BorrowingStore.GetByID(ctx, b.SpaceID, b.ID)
	if err != nil {
		return nil, err
	}

	// Keep internal fields
	b.RemainingAmount = existing.RemainingAmount
	b.Status = existing.Status
	b.CreateTime = existing.CreateTime
	b.UpdateTime = time.Now().UTC()

	if err := b.Validate(); err != nil {
		return nil, err
	}

	settings, err := s.deps.SettingsStore.GetByID(ctx, b.SpaceID)
	if err != nil {
		return nil, err
	}

	// Check if a transaction already exists for this borrowing
	st := SourceTypeBorrowing
	si := string(b.ID)
	page, err := s.deps.TransactionStore.ListBySpace(ctx, b.SpaceID, &TransactionFilter{
		SourceType: &st,
		SourceID:   &si,
		PageSize:   1,
	})
	if err != nil {
		return nil, fmt.Errorf("check existing transaction: %w", err)
	}
	existingTxs := page.Items
	hasTransaction := len(existingTxs) > 0

	if hasTransaction && b.Currency != settings.BaseCurrency {
		_, err := s.getExchangeRate(ctx, ExchangeRateKey{
			SpaceID:      b.SpaceID,
			FromCurrency: b.Currency,
			ToCurrency:   settings.BaseCurrency,
			RateDate:     b.EstablishedAt,
		})
		if err != nil {
			return nil, fmt.Errorf("exchange rate not configured from %s to %s for date %s: %w", b.Currency, settings.BaseCurrency, b.EstablishedAt.Format("2006-01-02"), err)
		}
	}

	if err := s.deps.BorrowingStore.Update(ctx, b); err != nil {
		return nil, err
	}

	if hasTransaction {
		// Update associated transaction
		var txnType TransactionType
		var desc string
		if b.Direction == BorrowingDirectionLent {
			txnType = TransactionTypeExpense
			desc = fmt.Sprintf("Lent to %s", b.Counterparty)
		} else {
			txnType = TransactionTypeIncome
			desc = fmt.Sprintf("Borrowed from %s", b.Counterparty)
		}

		err = s.syncTransaction(ctx, syncTransactionParams{
			SpaceID:         b.SpaceID,
			SourceID:        string(b.ID),
			SourceType:      SourceTypeBorrowing,
			Amount:          b.TotalAmount,
			Currency:        b.Currency,
			TransactionDate: b.EstablishedAt,
			Description:     desc,
			Type:            txnType,
			AccountID:       b.AccountID,
		})
		if err != nil {
			return nil, err
		}
	}

	return b, nil
}

// DeleteBorrowing removes a borrowing, its repayments, and their transactions.
func (s *Service) DeleteBorrowing(ctx context.Context, spaceID SpaceID, id BorrowingID) error {
	b, err := s.deps.BorrowingStore.GetByID(ctx, spaceID, id)
	if err != nil {
		return err
	}

	if b.SpaceID != spaceID {
		return errors.New("borrowing does not belong to space")
	}

	// 1. Delete associated parent transaction
	_ = s.deleteTransactionBySource(ctx, spaceID, string(id), SourceTypeBorrowing)

	// 2. Fetch and delete repayments + their transactions
	repayments, err := s.deps.BorrowingRepaymentStore.ListByBorrowing(ctx, spaceID, id)
	if err == nil {
		for _, r := range repayments {
			_ = s.deleteTransactionBySource(ctx, spaceID, string(r.ID), SourceTypeBorrowingRepayment)
		}
	}

	// 3. Delete from DB (foreign key cascade deletes repayments in db)
	return s.deps.BorrowingStore.Delete(ctx, id)
}

// CreateBorrowingRepayment logs an installment repayment towards a borrowing.
func (s *Service) CreateBorrowingRepayment(ctx context.Context, r *BorrowingRepayment) (*BorrowingRepayment, error) {
	b, err := s.deps.BorrowingStore.GetByID(ctx, r.SpaceID, r.BorrowingID)
	if err != nil {
		return nil, err
	}

	if r.SpaceID != b.SpaceID {
		return nil, errors.New("repayment space ID does not match borrowing space ID")
	}

	if r.Amount <= 0 {
		return nil, errors.New("repayment amount must be greater than zero")
	}

	if r.Amount > b.RemainingAmount {
		return nil, fmt.Errorf("repayment amount %d exceeds remaining borrowing balance %d", r.Amount, b.RemainingAmount)
	}

	if r.ID == "" {
		rID, err := NewBorrowingRepaymentID()
		if err != nil {
			return nil, err
		}
		r.ID = rID
	}
	r.CreateTime = time.Now().UTC()
	r.UpdateTime = time.Now().UTC()

	if err := r.Validate(); err != nil {
		return nil, err
	}

	settings, err := s.deps.SettingsStore.GetByID(ctx, r.SpaceID)
	if err != nil {
		return nil, err
	}

	if b.Currency != settings.BaseCurrency {
		_, err := s.getExchangeRate(ctx, ExchangeRateKey{
			SpaceID:      r.SpaceID,
			FromCurrency: b.Currency,
			ToCurrency:   settings.BaseCurrency,
			RateDate:     r.PaymentDate,
		})
		if err != nil {
			return nil, fmt.Errorf("exchange rate not configured from %s to %s for date %s: %w", b.Currency, settings.BaseCurrency, r.PaymentDate.Format("2006-01-02"), err)
		}
	}

	// Create repayment
	if err := s.deps.BorrowingRepaymentStore.Create(ctx, r); err != nil {
		return nil, err
	}

	// Update borrowing balance
	b.RemainingAmount -= r.Amount
	if b.RemainingAmount == 0 {
		b.Status = BorrowingStatusPaidOff
	}
	b.UpdateTime = time.Now().UTC()
	if err := s.deps.BorrowingStore.Update(ctx, b); err != nil {
		return nil, fmt.Errorf("failed to update borrowing balance: %w", err)
	}

	// Sync transaction for repayment
	var txnType TransactionType
	var desc string
	if b.Direction == BorrowingDirectionLent {
		txnType = TransactionTypeIncome // paid back to us
		desc = fmt.Sprintf("Repayment from %s", b.Counterparty)
	} else {
		txnType = TransactionTypeExpense // we paid them back
		desc = fmt.Sprintf("Repayment to %s", b.Counterparty)
	}

	err = s.syncTransaction(ctx, syncTransactionParams{
		SpaceID:         r.SpaceID,
		SourceID:        string(r.ID),
		SourceType:      SourceTypeBorrowingRepayment,
		Amount:          r.Amount,
		Currency:        b.Currency,
		TransactionDate: r.PaymentDate,
		Description:     desc,
		Type:            txnType,
		AccountID:       r.AccountID,
	})
	if err != nil {
		return nil, err
	}

	return r, nil
}

// ListBorrowingRepayments returns repayments for a borrowing.
func (s *Service) ListBorrowingRepayments(ctx context.Context, spaceID SpaceID, borrowingID BorrowingID) ([]*BorrowingRepayment, error) {
	if err := spaceID.Validate(); err != nil {
		return nil, err
	}
	if err := borrowingID.Validate(); err != nil {
		return nil, err
	}
	return s.deps.BorrowingRepaymentStore.ListByBorrowing(ctx, spaceID, borrowingID)
}

// DeleteBorrowingRepaymentRequest represents parameters to delete a repayment installment.
type DeleteBorrowingRepaymentRequest struct {
	SpaceID     SpaceID
	BorrowingID BorrowingID
	ID          BorrowingRepaymentID
}

// DeleteBorrowingRepayment deletes a repayment installment, restoring balance.
func (s *Service) DeleteBorrowingRepayment(ctx context.Context, req DeleteBorrowingRepaymentRequest) error {
	b, err := s.deps.BorrowingStore.GetByID(ctx, req.SpaceID, req.BorrowingID)
	if err != nil {
		return err
	}

	if b.SpaceID != req.SpaceID {
		return errors.New("borrowing does not belong to space")
	}

	r, err := s.deps.BorrowingRepaymentStore.GetByID(ctx, req.SpaceID, req.ID)
	if err != nil {
		return err
	}

	if r.BorrowingID != req.BorrowingID {
		return errors.New("repayment does not belong to this borrowing")
	}

	// Delete repayment transaction
	_ = s.deleteTransactionBySource(ctx, req.SpaceID, string(req.ID), SourceTypeBorrowingRepayment)

	// Delete repayment
	if err := s.deps.BorrowingRepaymentStore.Delete(ctx, req.ID); err != nil {
		return err
	}

	// Restore borrowing balance
	b.RemainingAmount += r.Amount
	if b.RemainingAmount > 0 {
		b.Status = BorrowingStatusActive
	}
	b.UpdateTime = time.Now().UTC()

	return s.deps.BorrowingStore.Update(ctx, b)
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
	if a.ID == "" {
		aID, err := NewAccountID()
		if err != nil {
			return nil, err
		}
		a.ID = aID
	}
	a.CreateTime = time.Now().UTC()
	a.UpdateTime = time.Now().UTC()
	a.IsActive = true

	if err := a.Validate(); err != nil {
		return nil, err
	}

	// Check if first account in space
	hasAny, err := s.deps.AccountStore.HasAny(ctx, a.SpaceID)
	if err != nil {
		return nil, err
	}
	if !hasAny {
		a.IsDefault = true
	} else if a.IsDefault {
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

// UpdateAccount updates account metadata and handles default flag adjustments.
func (s *Service) UpdateAccount(ctx context.Context, a *Account) (*Account, error) {
	existing, err := s.deps.AccountStore.GetByID(ctx, a.SpaceID, a.ID)
	if err != nil {
		return nil, err
	}

	// Preserve space identity and internal balances if updated ad-hoc
	a.SpaceID = existing.SpaceID
	a.Type = existing.Type
	a.Currency = existing.Currency
	a.InitialBalance = existing.InitialBalance
	a.CurrentBalance = existing.CurrentBalance
	a.CreateTime = existing.CreateTime
	a.UpdateTime = time.Now().UTC()

	if err := a.Validate(); err != nil {
		return nil, err
	}

	if a.IsDefault && !existing.IsDefault {
		// Unset all other defaults space-wide atomically in the DB
		if err := s.deps.AccountStore.UnsetDefaultsExcept(ctx, a.SpaceID, a.ID); err != nil {
			return nil, err
		}
	} else if !a.IsDefault && existing.IsDefault {
		// Override and force it to remain default
		a.IsDefault = true
	}
	if err := s.deps.AccountStore.Update(ctx, a); err != nil {
		return nil, err
	}

	return a, nil
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

	delta := targetBalance - acc.CurrentBalance
	if delta == 0 {
		return acc, nil
	}

	txnID, err := NewTransactionID()
	if err != nil {
		return nil, err
	}

	parsedDate := time.Now().UTC()
	if adjustmentDate != "" {
		if t, parseErr := time.Parse(time.RFC3339, adjustmentDate); parseErr == nil {
			parsedDate = t
		} else if t, parseErr := time.Parse("2006-01-02", adjustmentDate); parseErr == nil {
			parsedDate = t
		}
	}

	description := "Balance Adjustment"
	if note != "" {
		description += " (" + note + ")"
	}

	sourceType := "SYSTEM_BALANCE_ADJUSTMENT"
	accIDVal := accountID
	txn := &Transaction{
		ID:              txnID,
		SpaceID:         spaceID,
		AccountID:       &accIDVal,
		Type:            TransactionTypeBalanceAdjustment,
		Amount:          delta,
		Currency:        acc.Currency,
		Description:     description,
		TransactionDate: parsedDate,
		EffectiveDate:   parsedDate,
		SourceType:      &sourceType,
	}

	if err := s.createTransaction(ctx, txn); err != nil {
		return nil, fmt.Errorf("record balance adjustment transaction: %w", err)
	}

	return s.deps.AccountStore.GetByID(ctx, spaceID, accountID)
}

// DeleteAccount deletes an account and moves default status if necessary.
func (s *Service) DeleteAccount(ctx context.Context, spaceID SpaceID, id AccountID) error {
	existing, err := s.deps.AccountStore.GetByID(ctx, spaceID, id)
	if err != nil {
		return err
	}

	if existing.IsDefault {
		return ErrCannotDeleteDefaultAccount
	}

	return s.deps.AccountStore.Delete(ctx, id)
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

	if srcAcc.SpaceID != t.SpaceID || destAcc.SpaceID != t.SpaceID {
		return nil, errors.New("accounts do not belong to the same space as the transfer")
	}

	// Double-entry validation: same currency transfers must have matching source and destination amounts
	if srcAcc.Currency == destAcc.Currency && t.SourceAmount != t.DestinationAmount {
		return nil, errors.New("source and destination amounts must match for single-currency transfers")
	}

	// 1. Insert Transfer parent record
	if err := s.deps.TransferStore.Create(ctx, t); err != nil {
		return nil, err
	}

	// 2. Create the Outflow Transaction Leg
	outflowTxnID, err := NewTransactionID()
	if err != nil {
		return nil, err
	}
	outflowTxn := &Transaction{
		ID:              outflowTxnID,
		SpaceID:         t.SpaceID,
		Type:            TransactionTypeTransferOut,
		Amount:          t.SourceAmount,
		Currency:        srcAcc.Currency,
		Description:     fmt.Sprintf("Transfer to %s", destAcc.Name),
		TransactionDate: t.TransferDate,
		EffectiveDate:   t.TransferDate,
		AccountID:       &t.SourceAccountID,
		TransferID:      &t.ID,
		CreateTime:      t.CreateTime,
		UpdateTime:      t.UpdateTime,
	}
	if err := s.createTransaction(ctx, outflowTxn); err != nil {
		return nil, fmt.Errorf("failed to log transfer outflow leg: %w", err)
	}

	// 3. Create the Inflow Transaction Leg
	inflowTxnID, err := NewTransactionID()
	if err != nil {
		return nil, err
	}
	inflowTxn := &Transaction{
		ID:              inflowTxnID,
		SpaceID:         t.SpaceID,
		Type:            TransactionTypeTransferIn,
		Amount:          t.DestinationAmount,
		Currency:        destAcc.Currency,
		Description:     fmt.Sprintf("Transfer from %s", srcAcc.Name),
		TransactionDate: t.TransferDate,
		EffectiveDate:   t.TransferDate,
		AccountID:       &t.DestinationAccountID,
		TransferID:      &t.ID,
		CreateTime:      t.CreateTime,
		UpdateTime:      t.UpdateTime,
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
func (s *Service) StageInboxItem(ctx context.Context, spaceID string, req *StageInboxItem) (*InboxItem, error) {
	if err := SpaceID(spaceID).Validate(); err != nil {
		return nil, err
	}

	// 1. Generate unique inbox item ID using "ibx_" prefix
	ibxID, err := id.Generate("ibx_")
	if err != nil {
		return nil, fmt.Errorf("generate inbox item ID: %w", err)
	}

	// 2. Resolve matching account by card last four digits
	var accountID *string
	if req.CardLastFour != "" {
		page, err := s.deps.AccountStore.ListBySpace(ctx, SpaceID(spaceID), &ListAccountsFilter{PageSize: 1000})
		if err == nil {
			for _, acc := range page.Items {
				if acc.LastFour == req.CardLastFour && acc.IsActive {
					accIDStr := string(acc.ID)
					accountID = &accIDStr
					break
				}
			}
		}
	}

	// 3. Resolve and validate matching budget ID
	var budgetID *string
	if req.SuggestedBudget != "" {
		bID, err := ParseBudgetID(req.SuggestedBudget)
		if err == nil {
			budget, err := s.deps.BudgetStore.GetByID(ctx, SpaceID(spaceID), bID)
			if err == nil && budget != nil && string(budget.SpaceID) == spaceID {
				bIDStr := string(budget.ID)
				budgetID = &bIDStr
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
		SpaceID:         spaceID,
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
		MetadataJSON:    req.MetadataJSON,
		CreateTime:      time.Now().UTC(),
	}

	if err := s.deps.InboxItemStore.Insert(ctx, item); err != nil {
		return nil, fmt.Errorf("insert inbox item: %w", err)
	}

	return item, nil
}

// ListInboxItems lists all pending/staged items in the space inbox.
func (s *Service) ListInboxItems(ctx context.Context, spaceID string, filter *ListInboxItemsFilter) (*paging.Page[*InboxItem], error) {
	if err := SpaceID(spaceID).Validate(); err != nil {
		return nil, err
	}
	return s.deps.InboxItemStore.ListBySpace(ctx, spaceID, filter)
}

// UpdateInboxItem updates a staging inbox item's draft properties.
func (s *Service) UpdateInboxItem(ctx context.Context, spaceID string, item *InboxItem) (*InboxItem, error) {
	if err := SpaceID(spaceID).Validate(); err != nil {
		return nil, err
	}
	if item.ID == "" {
		return nil, errors.New("missing inbox item ID")
	}
	// Verify it belongs to the space
	existing, err := s.deps.InboxItemStore.Get(ctx, spaceID, item.ID)
	if err != nil {
		return nil, err
	}
	if existing.SpaceID != spaceID {
		return nil, fmt.Errorf("inbox item does not belong to space: %s", spaceID)
	}

	// Persist changes
	if err := s.deps.InboxItemStore.Update(ctx, item); err != nil {
		return nil, err
	}

	return item, nil
}

// DiscardInboxItem deletes an item from the inbox without ledger changes.
func (s *Service) DiscardInboxItem(ctx context.Context, spaceID, id string) error {
	if err := SpaceID(spaceID).Validate(); err != nil {
		return err
	}
	return s.deps.InboxItemStore.Delete(ctx, spaceID, id)
}

// ApproveInboxItem promotes an inbox item to the ledger or updates a scheduled payment.
func (s *Service) ApproveInboxItem(ctx context.Context, spaceID string, id string) error {
	if err := SpaceID(spaceID).Validate(); err != nil {
		return err
	}

	// 1. Fetch current staging inbox item
	item, err := s.deps.InboxItemStore.Get(ctx, spaceID, id)
	if err != nil {
		return fmt.Errorf("get inbox item: %w", err)
	}

	if item.Status != InboxItemPending {
		return fmt.Errorf("inbox item is already processed: status = %s", item.Status)
	}

	// 1b. If it is a system verification email: mark resolved immediately
	if item.DocType == InboxItemDocSystemVerification {
		item.Status = InboxItemResolved
		if err := s.deps.InboxItemStore.Update(ctx, item); err != nil {
			return fmt.Errorf("resolve verification inbox item: %w", err)
		}
		return nil
	}

	// 2. If it is linked to an existing transaction:
	if item.TransactionID != nil && *item.TransactionID != "" {
		txnID, err := ParseTransactionID(*item.TransactionID)
		if err != nil {
			return fmt.Errorf("invalid transaction ID: %w", err)
		}
		txn, err := s.deps.TransactionStore.GetByID(ctx, SpaceID(spaceID), txnID)
		if err != nil {
			return fmt.Errorf("get transaction: %w", err)
		}
		if txn.SpaceID != SpaceID(spaceID) {
			return fmt.Errorf("transaction does not belong to this space")
		}

		var overwrite bool
		var metadataMap map[string]any
		if item.MetadataJSON != "" {
			if err := json.Unmarshal([]byte(item.MetadataJSON), &metadataMap); err == nil {
				if val, ok := metadataMap["overwrite_linked_transaction"].(bool); ok {
					overwrite = val
				}
			}
		}

		// If overwrite option is selected, update the ledger transaction to match receipt details
		if overwrite {
			updatedTxn := *txn
			updatedTxn.Amount = item.Amount
			updatedTxn.Currency = Currency(item.Currency)
			if item.VendorName != "" {
				updatedTxn.Description = item.VendorName
			}

			if err := s.updateTransaction(ctx, &updatedTxn, txn); err != nil {
				return fmt.Errorf("failed to update linked transaction: %w", err)
			}
			txn = &updatedTxn
		}

		// Mark inbox item as resolved and link it
		item.Status = InboxItemResolved
		if err := s.deps.InboxItemStore.Update(ctx, item); err != nil {
			return fmt.Errorf("resolve inbox item: %w", err)
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

		return nil
	}

	// 3. If it is linked to a bill/scheduled payment:
	if item.ScheduledPaymentID != nil && *item.ScheduledPaymentID != "" {
		payID := ScheduledPaymentID(*item.ScheduledPaymentID)
		if item.DocType == InboxItemDocInvoice {
			// A. If it's an unpaid INVOICE: do NOT create a transaction.
			// Just update the scheduled payment amount and metadata to the actual values.
			payment, err := s.deps.ScheduledPaymentStore.GetByID(ctx, SpaceID(spaceID), payID)
			if err != nil {
				return fmt.Errorf("get scheduled payment: %w", err)
			}
			payment.Amount = item.Amount
			payment.SourceType = item.VendorName
			if err := s.deps.ScheduledPaymentStore.UpdateStatus(ctx, payID, payment.Status); err != nil {
				return fmt.Errorf("update scheduled payment: %w", err)
			}

			// Mark inbox item as resolved and link it
			item.Status = InboxItemResolved
			if err := s.deps.InboxItemStore.Update(ctx, item); err != nil {
				return fmt.Errorf("resolve inbox item: %w", err)
			}
			return nil
		} else {
			// B. If it's a RECEIPT or other: promote the scheduled payment to a finished transaction.
			txn, err := s.ConfirmScheduledPayment(ctx, ConfirmScheduledPaymentRequest{
				PaymentID:       payID,
				TransactionDate: item.TransactionDate,
				EffectiveDate:   time.Now().UTC(),
				ActualAmount:    item.Amount,
				Description:     item.VendorName,
			})
			if err != nil {
				return fmt.Errorf("confirm scheduled payment: %w", err)
			}

			// Mark inbox item as resolved and link it
			item.Status = InboxItemResolved
			tIDStr := string(txn.ID)
			item.TransactionID = &tIDStr
			if err := s.deps.InboxItemStore.Update(ctx, item); err != nil {
				return fmt.Errorf("resolve inbox item: %w", err)
			}
			return nil
		}
	}

	if item.DocType == InboxItemDocInvoice {
		spID, err := NewScheduledPaymentID()
		if err != nil {
			return err
		}
		var bID BudgetID
		if item.BudgetID != nil && *item.BudgetID != "" {
			bID, err = ParseBudgetID(*item.BudgetID)
			if err != nil {
				return fmt.Errorf("parse budget ID: %w", err)
			}
		}

		dueDate := item.TransactionDate
		if dueDate.IsZero() {
			dueDate = time.Now().UTC()
		}

		desc := item.VendorName
		metaMap := map[string]any{
			"vendor_name": desc,
		}
		var metaBytes []byte
		if b, err := json.Marshal(metaMap); err == nil {
			metaBytes = b
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
			Metadata:   metaBytes,
			CreateTime: time.Now().UTC(),
			UpdateTime: time.Now().UTC(),
		}

		if err := payment.Validate(); err != nil {
			return fmt.Errorf("validate new scheduled payment: %w", err)
		}

		if err := s.deps.ScheduledPaymentStore.Create(ctx, payment); err != nil {
			return fmt.Errorf("create scheduled payment: %w", err)
		}

		// Mark inbox item as resolved and link it
		item.Status = InboxItemResolved
		pIDStr := string(payment.ID)
		item.ScheduledPaymentID = &pIDStr
		if err := s.deps.InboxItemStore.Update(ctx, item); err != nil {
			return fmt.Errorf("resolve inbox item: %w", err)
		}

		return nil
	}

	// 4. Otherwise: create a standalone ledger transaction or a transfer
	var transactionType string
	var destinationAccountID string
	var transferLeg string
	if item.MetadataJSON != "" {
		var metadataMap map[string]any
		if err := json.Unmarshal([]byte(item.MetadataJSON), &metadataMap); err == nil {
			if val, ok := metadataMap["transaction_type"].(string); ok {
				transactionType = val
			}
			if val, ok := metadataMap["destination_account_id"].(string); ok {
				destinationAccountID = val
			}
			if val, ok := metadataMap["transfer_leg"].(string); ok {
				transferLeg = val
			}
		}
	}

	settings, err := s.deps.SettingsStore.GetByID(ctx, SpaceID(spaceID))
	if err != nil {
		return err
	}

	if transactionType == "TRANSFER" {
		if item.AccountID == nil || *item.AccountID == "" {
			return fmt.Errorf("missing source account for transfer")
		}
		srcAccID, err := ParseAccountID(*item.AccountID)
		if err != nil {
			return fmt.Errorf("invalid source account: %w", err)
		}
		if destinationAccountID == "" {
			return fmt.Errorf("missing destination account for transfer")
		}
		destAccID, err := ParseAccountID(destinationAccountID)
		if err != nil {
			return fmt.Errorf("invalid destination account: %w", err)
		}

		t := &Transfer{
			SpaceID:              SpaceID(spaceID),
			SourceAccountID:      srcAccID,
			DestinationAccountID: destAccID,
			SourceAmount:         item.Amount,
			DestinationAmount:    item.Amount,
			TransferDate:         item.TransactionDate,
			Notes:                item.VendorName,
		}
		newT, err := s.CreateTransfer(ctx, t)
		if err != nil {
			return fmt.Errorf("create transfer: %w", err)
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
		item.Status = InboxItemResolved
		if matchedTx != nil {
			tIDStr := string(matchedTx.ID)
			item.TransactionID = &tIDStr
		}
		targetAccIDStr := string(targetAccID)
		item.AccountID = &targetAccIDStr

		if err := s.deps.InboxItemStore.Update(ctx, item); err != nil {
			return fmt.Errorf("resolve inbox item: %w", err)
		}

		return nil
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
				return fmt.Errorf("parse budget ID: %w", err)
			}
			budget, err := s.deps.BudgetStore.GetByID(ctx, SpaceID(spaceID), bID)
			if err != nil {
				return fmt.Errorf("get budget: %w", err)
			}
			period, err := s.GetOrCreatePeriod(ctx, SpaceID(spaceID), budget.ID, item.TransactionDate)
			if err != nil {
				return fmt.Errorf("get or create period: %w", err)
			}
			budgetID = &budget.ID
			periodID = &period.ID
		}
	default:
		if item.BudgetID != nil && *item.BudgetID != "" {
			bID, err := ParseBudgetID(*item.BudgetID)
			if err != nil {
				return fmt.Errorf("parse budget ID: %w", err)
			}
			budget, err := s.deps.BudgetStore.GetByID(ctx, SpaceID(spaceID), bID)
			if err != nil {
				return fmt.Errorf("get budget: %w", err)
			}
			period, err := s.GetOrCreatePeriod(ctx, SpaceID(spaceID), budget.ID, item.TransactionDate)
			if err != nil {
				return fmt.Errorf("get or create period: %w", err)
			}
			budgetID = &budget.ID
			periodID = &period.ID
			txnType = TransactionTypeExpense
		} else {
			txnType = TransactionTypeIncome
		}
	}

	// Calculate base currency conversion
	var rate = 1.0
	if item.Currency != string(settings.BaseCurrency) {
		rateRecord, err := s.getExchangeRate(ctx, ExchangeRateKey{
			SpaceID:      SpaceID(spaceID),
			FromCurrency: Currency(item.Currency),
			ToCurrency:   settings.BaseCurrency,
			RateDate:     item.TransactionDate,
		})
		if err == nil {
			rate = rateRecord.Rate
		}
	}
	amountInBase := int64(float64(item.Amount) * rate)

	tID, err := NewTransactionID()
	if err != nil {
		return err
	}

	var accountID *AccountID
	if item.AccountID != nil && *item.AccountID != "" {
		accID, err := ParseAccountID(*item.AccountID)
		if err == nil {
			accountID = &accID
		}
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
		TransactionDate: item.TransactionDate,
		EffectiveDate:   time.Now().UTC(),
		CreateTime:      time.Now().UTC(),
		UpdateTime:      time.Now().UTC(),
	}

	if err := txn.Validate(); err != nil {
		return err
	}

	if err := s.deps.TransactionStore.Create(ctx, txn); err != nil {
		return err
	}

	// Mark inbox item as resolved and link it
	item.Status = InboxItemResolved
	tIDStr := string(txn.ID)
	item.TransactionID = &tIDStr
	if err := s.deps.InboxItemStore.Update(ctx, item); err != nil {
		return fmt.Errorf("resolve inbox item: %w", err)
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
