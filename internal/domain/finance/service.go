package finance

import (
	"context"
	"errors"
	"fmt"
	"time"
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

// UpdateBudget modifies an existing budget template.
func (s *Service) UpdateBudget(ctx context.Context, budget *Budget) (*Budget, error) {
	existing, err := s.deps.BudgetStore.GetByID(ctx, budget.ID)
	if err != nil {
		return nil, err
	}

	if existing.Currency != budget.Currency {
		return nil, errors.New("budget currency is immutable after creation")
	}
	if existing.Interval != budget.Interval {
		return nil, errors.New("budget interval is immutable after creation")
	}

	existing.Name = budget.Name
	existing.LimitAmount = budget.LimitAmount
	existing.IsActive = budget.IsActive
	existing.Icon = budget.Icon
	existing.Color = budget.Color
	existing.UpdateTime = time.Now().UTC()

	if err := existing.Validate(); err != nil {
		return nil, err
	}

	if err := s.deps.BudgetStore.Update(ctx, existing); err != nil {
		return nil, err
	}

	return existing, nil
}

// DeleteBudget removes a budget.
func (s *Service) DeleteBudget(ctx context.Context, id BudgetID) error {
	if string(id) == "" {
		return errors.New("budget ID is required")
	}
	return s.deps.BudgetStore.Delete(ctx, id)
}

// ListBudgets returns the workspace's budgets.
func (s *Service) ListBudgets(ctx context.Context, spaceID SpaceID, filter *ListBudgetsFilter) ([]*Budget, string, error) {
	if string(spaceID) == "" {
		return nil, "", errors.New("space ID is required")
	}
	return s.deps.BudgetStore.ListBySpace(ctx, spaceID, filter)
}

// GetOrCreatePeriod retrieves or lazily spawns a budget period for a target date.
func (s *Service) GetOrCreatePeriod(ctx context.Context, budgetID BudgetID, date time.Time) (*BudgetPeriod, error) {
	budget, err := s.deps.BudgetStore.GetByID(ctx, budgetID)
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
		if s.deps.TransactionStore != nil {
			spentInBase, spentAmount, aggErr := s.deps.TransactionStore.AggregateSpent(ctx, period.ID, period.Currency, period.ExchangeRateToBase)
			if aggErr == nil {
				period.SpentInBase = spentInBase
				period.SpentAmount = spentAmount
			}
		}
		return period, nil
	}
	if !errors.Is(err, ErrPeriodNotFound) {
		return nil, err
	}

	// Determine exchange rate to base currency
	var rate float64 = 1.0
	if budget.Currency != settings.BaseCurrency {
		rateRecord, err := s.deps.ExchangeRateStore.GetRate(ctx, ExchangeRateKey{
			SpaceID:      budget.SpaceID,
			FromCurrency: Currency(budget.Currency),
			ToCurrency:   Currency(settings.BaseCurrency),
			RateDate:     date,
		})
		if err != nil {
			return nil, fmt.Errorf("fetch exchange rate from %s to %s for date %s: %w", budget.Currency, settings.BaseCurrency, date.Format("2006-01-02"), err)
		}
		rate = rateRecord.Rate
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

	newPeriod.SpentInBase = 0
	newPeriod.SpentAmount = 0

	return newPeriod, nil
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

	if err := s.deps.ExchangeRateStore.Create(ctx, rate); err != nil {
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

// DeleteExchangeRateRequest represents parameters to delete an exchange rate conversion rule.
type DeleteExchangeRateRequest struct {
	SpaceID      SpaceID
	FromCurrency Currency
	ToCurrency   Currency
	RateDate     time.Time
}

// DeleteExchangeRate removes a daily rate conversion rule.
func (s *Service) DeleteExchangeRate(ctx context.Context, req DeleteExchangeRateRequest) error {
	if err := req.SpaceID.Validate(); err != nil {
		return fmt.Errorf("validate space ID: %w", err)
	}
	if err := req.FromCurrency.Validate(); err != nil {
		return fmt.Errorf("validate from currency: %w", err)
	}
	if err := req.ToCurrency.Validate(); err != nil {
		return fmt.Errorf("validate to currency: %w", err)
	}
	if req.RateDate.IsZero() {
		return errors.New("rate date is required")
	}
	return s.deps.ExchangeRateStore.Delete(ctx, ExchangeRateKey{
		SpaceID:      req.SpaceID,
		FromCurrency: req.FromCurrency,
		ToCurrency:   req.ToCurrency,
		RateDate:     req.RateDate,
	})
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

// DeleteTransaction removes any logged transaction and reverts its account balance impact.
func (s *Service) DeleteTransaction(ctx context.Context, id TransactionID) error {
	if err := id.Validate(); err != nil {
		return fmt.Errorf("validate transaction ID: %w", err)
	}
	existing, err := s.deps.TransactionStore.GetByID(ctx, id)
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

	existing, err := s.deps.TransactionStore.GetByID(ctx, txn.ID)
	if err != nil {
		return nil, fmt.Errorf("fetch existing transaction: %w", err)
	}

	if err := s.updateTransaction(ctx, txn, existing); err != nil {
		return nil, err
	}
	return txn, nil
}

// ListTransactions retrieves paginated transactions.
func (s *Service) ListTransactions(ctx context.Context, spaceID SpaceID, filter *ListTransactionsFilter) ([]*Transaction, string, error) {
	if err := spaceID.Validate(); err != nil {
		return nil, "", fmt.Errorf("validate space ID: %w", err)
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

		var usagePct float64 = 0.0
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
	var burnRate float64 = 0.0
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

// GetRecurringExpense retrieves a recurring expense by ID.
func (s *Service) GetRecurringExpense(ctx context.Context, id RecurringExpenseID) (*RecurringExpense, error) {
	if err := id.Validate(); err != nil {
		return nil, err
	}
	return s.deps.RecurringExpenseStore.GetByID(ctx, id)
}

// UpdateRecurringExpense modifies an existing recurring expense rule.
func (s *Service) UpdateRecurringExpense(ctx context.Context, re *RecurringExpense) (*RecurringExpense, error) {
	existing, err := s.deps.RecurringExpenseStore.GetByID(ctx, re.ID)
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
func (s *Service) ListRecurringExpenses(ctx context.Context, spaceID SpaceID, filter *ListRecurringExpensesFilter) ([]*RecurringExpense, string, error) {
	if err := spaceID.Validate(); err != nil {
		return nil, "", err
	}
	return s.deps.RecurringExpenseStore.ListBySpace(ctx, spaceID, filter)
}

// ListScheduledPayments lists scheduled payments for a workspace.
func (s *Service) ListScheduledPayments(ctx context.Context, spaceID SpaceID, filter *ListScheduledPaymentsFilter) ([]*ScheduledPayment, string, error) {
	if err := spaceID.Validate(); err != nil {
		return nil, "", err
	}
	return s.deps.ScheduledPaymentStore.ListBySpace(ctx, spaceID, filter)
}

// ConfirmScheduledPaymentRequest represents parameters to confirm a scheduled payment.
type ConfirmScheduledPaymentRequest struct {
	PaymentID       ScheduledPaymentID
	TransactionDate time.Time
	EffectiveDate   time.Time
	ActualAmount    int64
}

// ConfirmScheduledPayment clears a scheduled payment by promoting it to a permanent transaction.
func (s *Service) ConfirmScheduledPayment(ctx context.Context, req ConfirmScheduledPaymentRequest) (*Transaction, error) {
	payment, err := s.deps.ScheduledPaymentStore.GetByID(ctx, req.PaymentID)
	if err != nil {
		return nil, err
	}

	settings, err := s.deps.SettingsStore.GetByID(ctx, payment.SpaceID)
	if err != nil {
		return nil, err
	}

	budget, err := s.deps.BudgetStore.GetByID(ctx, payment.BudgetID)
	if err != nil {
		return nil, err
	}

	// Resolve budget period for the transaction based on effectiveDate
	period, err := s.GetOrCreatePeriod(ctx, budget.ID, req.EffectiveDate)
	if err != nil {
		return nil, err
	}

	// Calculate base currency conversion
	var rate float64 = 1.0
	if payment.Currency != settings.BaseCurrency {
		rateRecord, err := s.deps.ExchangeRateStore.GetRate(ctx, ExchangeRateKey{
			SpaceID:      payment.SpaceID,
			FromCurrency: payment.Currency,
			ToCurrency:   settings.BaseCurrency,
			RateDate:     req.TransactionDate,
		})
		if err != nil {
			return nil, err
		}
		rate = rateRecord.Rate
	}

	amountInBase := int64(float64(req.ActualAmount) * rate)

	description := "Scheduled Payment"
	if payment.SourceType == SourceTypeRecurrentExpense {
		if exp, err := s.deps.RecurringExpenseStore.GetByID(ctx, RecurringExpenseID(payment.SourceID)); err == nil {
			description = exp.Name
		}
	}

	tID, err := NewTransactionID()
	if err != nil {
		return nil, err
	}

	txn := &Transaction{
		ID:              tID,
		SpaceID:         payment.SpaceID,
		Type:            TransactionTypeExpense,
		BudgetID:        &payment.BudgetID,
		PeriodID:        &period.ID,
		Amount:          req.ActualAmount,
		Currency:        payment.Currency,
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

	if err := s.deps.ScheduledPaymentStore.Delete(ctx, req.PaymentID); err != nil {
		return nil, err
	}

	return txn, nil
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
		budget, err := s.deps.BudgetStore.GetByID(ctx, *txn.BudgetID)
		if err != nil {
			return fmt.Errorf("fetch budget template: %w", err)
		}
		period, err := s.GetOrCreatePeriod(ctx, budget.ID, txn.EffectiveDate)
		if err != nil {
			return fmt.Errorf("resolve active budget period: %w", err)
		}
		txn.PeriodID = &period.ID
	}

	// 4. Centralized Base Currency Exchange Rate Calculation
	if txn.AmountInBase == 0 || txn.Currency != settings.BaseCurrency {
		var rate float64 = 1.0
		if txn.Currency != settings.BaseCurrency {
			rateRecord, err := s.deps.ExchangeRateStore.GetRate(ctx, ExchangeRateKey{
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
		if err := s.adjustAccountBalance(ctx, *txn.AccountID, txn.Amount, txn.Type, false); err != nil {
			return fmt.Errorf("failed to adjust account balance: %w", err)
		}
	}

	return nil
}

// updateTransaction updates a transaction and recalculates account balances.
func (s *Service) updateTransaction(ctx context.Context, txn *Transaction, existing *Transaction) error {
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
		budget, err := s.deps.BudgetStore.GetByID(ctx, *txn.BudgetID)
		if err != nil {
			return fmt.Errorf("fetch budget template: %w", err)
		}
		period, err := s.GetOrCreatePeriod(ctx, budget.ID, txn.EffectiveDate)
		if err != nil {
			return fmt.Errorf("resolve active budget period: %w", err)
		}
		txn.PeriodID = &period.ID
	} else {
		txn.PeriodID = nil
	}

	// 4. Centralized Base Currency Exchange Rate Calculation
	if txn.Currency != settings.BaseCurrency {
		rateRecord, err := s.deps.ExchangeRateStore.GetRate(ctx, ExchangeRateKey{
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
		if err := s.adjustAccountBalance(ctx, *existing.AccountID, existing.Amount, existing.Type, true); err != nil {
			return fmt.Errorf("failed to revert account balance: %w", err)
		}
	}

	// 6. Persist the updated transaction
	if err := s.deps.TransactionStore.Update(ctx, txn); err != nil {
		return err
	}

	// 7. Apply the new transaction's balance impact
	if txn.AccountID != nil {
		if err := s.adjustAccountBalance(ctx, *txn.AccountID, txn.Amount, txn.Type, false); err != nil {
			return fmt.Errorf("failed to apply updated account balance: %w", err)
		}
	}

	return nil
}

// deleteTransaction deletes a transaction and reverts its account balance impact.
func (s *Service) deleteTransaction(ctx context.Context, txn *Transaction) error {
	// 1. Revert the balance impact
	if txn.AccountID != nil {
		if err := s.adjustAccountBalance(ctx, *txn.AccountID, txn.Amount, txn.Type, true); err != nil {
			return fmt.Errorf("failed to revert account balance on deletion: %w", err)
		}
	}

	// 2. Delete the transaction
	return s.deps.TransactionStore.Delete(ctx, txn.ID)
}

// adjustAccountBalance updates the balance of the specified account based on transaction changes.
func (s *Service) adjustAccountBalance(ctx context.Context, accountID AccountID, amount int64, txnType TransactionType, revert bool) error {
	acc, err := s.deps.AccountStore.GetByID(ctx, accountID)
	if err != nil {
		return err
	}

	// Determine if the transaction is an inflow or an outflow
	isOutflow := (txnType == TransactionTypeExpense || txnType == TransactionTypeTransferOut)
	isInflow := (txnType == TransactionTypeIncome || txnType == TransactionTypeTransferIn)

	// Reverse logic if we are reverting an operation (on update or delete)
	if revert {
		isOutflow, isInflow = isInflow, isOutflow
	}

	if isOutflow {
		acc.CurrentBalance -= amount
	} else if isInflow {
		acc.CurrentBalance += amount
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
	existingTxs, _, err := s.deps.TransactionStore.ListBySpace(ctx, params.SpaceID, &ListTransactionsFilter{
		SourceType: &st,
		SourceID:   &si,
		PageSize:   1,
	})
	if err != nil {
		return fmt.Errorf("list existing transactions: %w", err)
	}

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
	existingTxs, _, err := s.deps.TransactionStore.ListBySpace(ctx, spaceID, &ListTransactionsFilter{
		SourceType: &st,
		SourceID:   &si,
		PageSize:   10,
	})
	if err != nil {
		return err
	}
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
		_, err := s.deps.ExchangeRateStore.GetRate(ctx, ExchangeRateKey{
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
		var txnType TransactionType = TransactionTypeExpense
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
func (s *Service) GetBorrowing(ctx context.Context, id BorrowingID) (*Borrowing, error) {
	if err := id.Validate(); err != nil {
		return nil, err
	}
	return s.deps.BorrowingStore.GetByID(ctx, id)
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
	existing, err := s.deps.BorrowingStore.GetByID(ctx, b.ID)
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
	existingTxs, _, err := s.deps.TransactionStore.ListBySpace(ctx, b.SpaceID, &ListTransactionsFilter{
		SourceType: &st,
		SourceID:   &si,
		PageSize:   1,
	})
	if err != nil {
		return nil, fmt.Errorf("check existing transaction: %w", err)
	}
	hasTransaction := len(existingTxs) > 0

	if hasTransaction && b.Currency != settings.BaseCurrency {
		_, err := s.deps.ExchangeRateStore.GetRate(ctx, ExchangeRateKey{
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
		var txnType TransactionType = TransactionTypeExpense
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
	b, err := s.deps.BorrowingStore.GetByID(ctx, id)
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
	b, err := s.deps.BorrowingStore.GetByID(ctx, r.BorrowingID)
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
		_, err := s.deps.ExchangeRateStore.GetRate(ctx, ExchangeRateKey{
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
	var txnType TransactionType = TransactionTypeIncome
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
	b, err := s.deps.BorrowingStore.GetByID(ctx, req.BorrowingID)
	if err != nil {
		return err
	}

	if b.SpaceID != req.SpaceID {
		return errors.New("borrowing does not belong to space")
	}

	r, err := s.deps.BorrowingRepaymentStore.GetByID(ctx, req.ID)
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

	existing, err := s.deps.AccountStore.ListBySpace(ctx, a.SpaceID)
	if err != nil {
		return nil, err
	}

	// Rule: If first account, force is_default = true. Else if is_default is true, unset default flag on others.
	if len(existing) == 0 {
		a.IsDefault = true
	} else if a.IsDefault {
		for _, acc := range existing {
			if acc.IsDefault {
				acc.IsDefault = false
				acc.UpdateTime = time.Now().UTC()
				if err := s.deps.AccountStore.Update(ctx, acc); err != nil {
					return nil, fmt.Errorf("failed to unset default flag: %w", err)
				}
			}
		}
	}

	if err := s.deps.AccountStore.Create(ctx, a); err != nil {
		return nil, err
	}

	return a, nil
}

// GetAccount retrieves an account.
func (s *Service) GetAccount(ctx context.Context, id AccountID) (*Account, error) {
	if err := id.Validate(); err != nil {
		return nil, err
	}
	return s.deps.AccountStore.GetByID(ctx, id)
}

// UpdateAccount updates account metadata and handles default flag adjustments.
func (s *Service) UpdateAccount(ctx context.Context, a *Account) (*Account, error) {
	existing, err := s.deps.AccountStore.GetByID(ctx, a.ID)
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
		// Unset default on other accounts
		accounts, err := s.deps.AccountStore.ListBySpace(ctx, a.SpaceID)
		if err != nil {
			return nil, err
		}
		for _, acc := range accounts {
			if acc.ID != a.ID && acc.IsDefault {
				acc.IsDefault = false
				acc.UpdateTime = time.Now().UTC()
				if err := s.deps.AccountStore.Update(ctx, acc); err != nil {
					return nil, fmt.Errorf("failed to unset default flag on other accounts: %w", err)
				}
			}
		}
	} else if !a.IsDefault && existing.IsDefault {
		// Cannot unset default if it is the only account, or we must ensure another account becomes default
		accounts, err := s.deps.AccountStore.ListBySpace(ctx, a.SpaceID)
		if err != nil {
			return nil, err
		}
		var foundOther bool
		for _, acc := range accounts {
			if acc.ID != a.ID && acc.IsActive {
				acc.IsDefault = true
				acc.UpdateTime = time.Now().UTC()
				if err := s.deps.AccountStore.Update(ctx, acc); err != nil {
					return nil, fmt.Errorf("failed to propagate default flag: %w", err)
				}
				foundOther = true
				break
			}
		}
		if !foundOther {
			// Keep it default
			a.IsDefault = true
		}
	}

	if err := s.deps.AccountStore.Update(ctx, a); err != nil {
		return nil, err
	}

	return a, nil
}

// DeleteAccount deletes an account and moves default status if necessary.
func (s *Service) DeleteAccount(ctx context.Context, id AccountID) error {
	existing, err := s.deps.AccountStore.GetByID(ctx, id)
	if err != nil {
		return err
	}

	if err := s.deps.AccountStore.Delete(ctx, id); err != nil {
		return err
	}

	if existing.IsDefault {
		// Mark next available active account as default
		accounts, err := s.deps.AccountStore.ListBySpace(ctx, existing.SpaceID)
		if err != nil {
			return nil // DB clean deletion completed, default reallocation failure is non-fatal to delete
		}
		for _, acc := range accounts {
			if acc.IsActive {
				acc.IsDefault = true
				acc.UpdateTime = time.Now().UTC()
				_ = s.deps.AccountStore.Update(ctx, acc)
				break
			}
		}
	}

	return nil
}

// ListAccounts lists all accounts for a space.
func (s *Service) ListAccounts(ctx context.Context, spaceID SpaceID) ([]*Account, error) {
	if err := spaceID.Validate(); err != nil {
		return nil, err
	}
	return s.deps.AccountStore.ListBySpace(ctx, spaceID)
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
	srcAcc, err := s.deps.AccountStore.GetByID(ctx, t.SourceAccountID)
	if err != nil {
		return nil, fmt.Errorf("source account: %w", err)
	}
	destAcc, err := s.deps.AccountStore.GetByID(ctx, t.DestinationAccountID)
	if err != nil {
		return nil, fmt.Errorf("destination account: %w", err)
	}

	if srcAcc.SpaceID != t.SpaceID || destAcc.SpaceID != t.SpaceID {
		return nil, errors.New("accounts do not belong to the same space as the transfer")
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

// GetTransfer retrieves a transfer.
func (s *Service) GetTransfer(ctx context.Context, id TransferID) (*Transfer, error) {
	if err := id.Validate(); err != nil {
		return nil, err
	}
	return s.deps.TransferStore.GetByID(ctx, id)
}

// DeleteTransfer deletes a transfer parent and deletes both linked ledger entries.
func (s *Service) DeleteTransfer(ctx context.Context, id TransferID) error {
	t, err := s.deps.TransferStore.GetByID(ctx, id)
	if err != nil {
		return err
	}

	// Find the associated transaction legs using TransferID
	legs, _, err := s.deps.TransactionStore.ListBySpace(ctx, t.SpaceID, &ListTransactionsFilter{
		TransferID: &id,
		PageSize:   10,
	})
	if err != nil {
		return fmt.Errorf("failed to retrieve transfer transaction legs: %w", err)
	}

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
