package finance

import (
	"context"
	"math"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/id"
	"github.com/masterkeysrd/saturn/internal/platform/paging"
)

// --- In-Memory Mocks for Stores ---

type mockSettingsStore struct {
	data map[SpaceID]*FinanceSettings
}

func (m *mockSettingsStore) Create(ctx context.Context, settings *FinanceSettings) error {
	m.data[settings.SpaceID] = settings
	return nil
}

func (m *mockSettingsStore) GetByID(ctx context.Context, spaceID SpaceID) (*FinanceSettings, error) {
	s, ok := m.data[spaceID]
	if !ok {
		return nil, ErrSettingsNotFound
	}
	return s, nil
}

type mockBudgetStore struct {
	data map[BudgetID]*Budget
}

func (m *mockBudgetStore) Create(ctx context.Context, b *Budget) error {
	m.data[b.ID] = b
	return nil
}

func (m *mockBudgetStore) GetByID(ctx context.Context, spaceID SpaceID, id BudgetID) (*Budget, error) {
	b, ok := m.data[id]
	if !ok {
		return nil, ErrBudgetNotFound
	}
	return b, nil
}

func (m *mockBudgetStore) GetByIDs(ctx context.Context, spaceID SpaceID, ids []BudgetID) ([]*Budget, error) {
	var list []*Budget
	for _, id := range ids {
		if b, ok := m.data[id]; ok {
			list = append(list, b)
		}
	}
	return list, nil
}

func (m *mockBudgetStore) Update(ctx context.Context, b *Budget) error {
	if _, ok := m.data[b.ID]; !ok {
		return ErrBudgetNotFound
	}
	m.data[b.ID] = b
	return nil
}

func (m *mockBudgetStore) Delete(ctx context.Context, id BudgetID) error {
	if _, ok := m.data[id]; !ok {
		return ErrBudgetNotFound
	}
	delete(m.data, id)
	return nil
}

func (m *mockBudgetStore) ListBySpace(ctx context.Context, spaceID SpaceID, filter *ListBudgetsFilter) (*paging.Page[*Budget], error) {
	var list []*Budget
	for _, b := range m.data {
		if b.SpaceID == spaceID {
			list = append(list, b)
		}
	}
	return &paging.Page[*Budget]{
		Items: list,
	}, nil
}

type mockPeriodStore struct {
	data map[string]*BudgetPeriod
}

func (m *mockPeriodStore) Create(ctx context.Context, p *BudgetPeriod) error {
	key := string(p.BudgetID) + "_" + p.StartDate.Format(time.RFC3339) + "_" + p.EndDate.Format(time.RFC3339)
	m.data[key] = p
	return nil
}

func (m *mockPeriodStore) GetByRange(ctx context.Context, budgetID BudgetID, startDate, endDate time.Time) (*BudgetPeriod, error) {
	key := string(budgetID) + "_" + startDate.Format(time.RFC3339) + "_" + endDate.Format(time.RFC3339)
	p, ok := m.data[key]
	if !ok {
		return nil, ErrPeriodNotFound
	}
	return p, nil
}

func (m *mockPeriodStore) GetByRanges(ctx context.Context, keys []PeriodRangeKey) ([]*BudgetPeriod, error) {
	var list []*BudgetPeriod
	for _, key := range keys {
		k := string(key.BudgetID) + "_" + key.StartDate.Format(time.RFC3339) + "_" + key.EndDate.Format(time.RFC3339)
		if p, ok := m.data[k]; ok {
			list = append(list, p)
		}
	}
	return list, nil
}

func (m *mockPeriodStore) UpdateLimit(ctx context.Context, id PeriodID, limit int64) error {
	for _, p := range m.data {
		if p.ID == id {
			p.LimitAmount = limit
			return nil
		}
	}
	return ErrPeriodNotFound
}

func (m *mockPeriodStore) ListByBudget(ctx context.Context, budgetID BudgetID) ([]*BudgetPeriod, error) {
	var list []*BudgetPeriod
	for _, p := range m.data {
		if p.BudgetID == budgetID {
			list = append(list, p)
		}
	}
	return list, nil
}

type mockExchangeRateStore struct {
	rates map[string]*ExchangeRate
}

func (m *mockExchangeRateStore) Create(ctx context.Context, r *ExchangeRate) error {
	key := string(r.SpaceID) + "_" + string(r.FromCurrency) + "_" + string(r.ToCurrency) + "_" + r.RateDate.Format("2006-01-02")
	m.rates[key] = r
	return nil
}

func (m *mockExchangeRateStore) Update(ctx context.Context, r *ExchangeRate) error {
	key := string(r.SpaceID) + "_" + string(r.FromCurrency) + "_" + string(r.ToCurrency) + "_" + r.RateDate.Format("2006-01-02")
	if _, ok := m.rates[key]; !ok {
		return ErrExchangeRateNotFound
	}
	m.rates[key] = r
	return nil
}

func (m *mockExchangeRateStore) GetExactRate(ctx context.Context, query ExchangeRateKey) (*ExchangeRate, error) {
	key := string(query.SpaceID) + "_" + string(query.FromCurrency) + "_" + string(query.ToCurrency) + "_" + query.RateDate.Format("2006-01-02")
	r, ok := m.rates[key]
	if !ok {
		return nil, ErrExchangeRateNotFound
	}
	return r, nil
}

func (m *mockExchangeRateStore) GetRate(ctx context.Context, query ExchangeRateKey) (*ExchangeRate, error) {
	// Look up rate exactly, or fallback to the closest date before
	var best *ExchangeRate
	for _, r := range m.rates {
		if r.SpaceID == query.SpaceID && r.FromCurrency == query.FromCurrency && r.ToCurrency == query.ToCurrency {
			if !r.RateDate.After(query.RateDate) {
				if best == nil || r.RateDate.After(best.RateDate) {
					best = r
				}
			}
		}
	}
	if best == nil {
		return nil, ErrExchangeRateNotFound
	}
	return best, nil
}

func (m *mockExchangeRateStore) GetNextRate(ctx context.Context, query ExchangeRateKey) (*ExchangeRate, error) {
	// Look up the closest date after query.RateDate
	var best *ExchangeRate
	for _, r := range m.rates {
		if r.SpaceID == query.SpaceID && r.FromCurrency == query.FromCurrency && r.ToCurrency == query.ToCurrency {
			if r.RateDate.After(query.RateDate) {
				if best == nil || r.RateDate.Before(best.RateDate) {
					best = r
				}
			}
		}
	}
	if best == nil {
		return nil, ErrExchangeRateNotFound
	}
	return best, nil
}

func (m *mockExchangeRateStore) ListBySpace(ctx context.Context, spaceID SpaceID, filter *ListExchangeRatesFilter) ([]*ExchangeRate, string, error) {
	var results []*ExchangeRate
	for _, r := range m.rates {
		if r.SpaceID == spaceID {
			results = append(results, r)
		}
	}
	return results, "", nil
}

func (m *mockExchangeRateStore) Delete(ctx context.Context, query ExchangeRateKey) error {
	key := string(query.SpaceID) + "_" + string(query.FromCurrency) + "_" + string(query.ToCurrency) + "_" + query.RateDate.Format("2006-01-02")
	delete(m.rates, key)
	return nil
}

func (m *mockExchangeRateStore) GetLatestRates(ctx context.Context, spaceID SpaceID, fromCurrencies []Currency, toCurrency Currency) ([]*ExchangeRate, error) {
	type currencyPair struct {
		from Currency
		to   Currency
	}
	latestRates := make(map[currencyPair]*ExchangeRate)
	for _, r := range m.rates {
		if r.SpaceID == spaceID && r.ToCurrency == toCurrency {
			match := slices.Contains(fromCurrencies, r.FromCurrency)
			if match {
				pair := currencyPair{from: r.FromCurrency, to: r.ToCurrency}
				existing, ok := latestRates[pair]
				if !ok || r.RateDate.After(existing.RateDate) {
					latestRates[pair] = r
				}
			}
		}
	}
	var result []*ExchangeRate
	for _, r := range latestRates {
		result = append(result, r)
	}
	return result, nil
}

type mockTransactionStore struct {
	txns map[TransactionID]*Transaction
}

func (m *mockTransactionStore) Create(ctx context.Context, t *Transaction) error {
	m.txns[t.ID] = t
	return nil
}

func (m *mockTransactionStore) GetByID(ctx context.Context, spaceID SpaceID, id TransactionID) (*Transaction, error) {
	t, ok := m.txns[id]
	if !ok {
		return nil, ErrTransactionNotFound
	}
	return t, nil
}

func (m *mockTransactionStore) Delete(ctx context.Context, id TransactionID) error {
	if _, ok := m.txns[id]; !ok {
		return ErrTransactionNotFound
	}
	delete(m.txns, id)
	return nil
}

func (m *mockTransactionStore) Update(ctx context.Context, t *Transaction) error {
	if _, ok := m.txns[t.ID]; !ok {
		return ErrTransactionNotFound
	}
	m.txns[t.ID] = t
	return nil
}

func (m *mockTransactionStore) ListBySpace(ctx context.Context, spaceID SpaceID, filter *ListTransactionsFilter) (*paging.Page[*Transaction], error) {
	var list []*Transaction
	for _, t := range m.txns {
		if t.SpaceID == spaceID {
			if filter.BudgetID != nil && (t.BudgetID == nil || *t.BudgetID != *filter.BudgetID) {
				continue
			}
			if filter.Type != nil && t.Type != *filter.Type {
				continue
			}
			if filter.MinAmount != nil && t.Amount < *filter.MinAmount {
				continue
			}
			if filter.MaxAmount != nil && t.Amount > *filter.MaxAmount {
				continue
			}
			if filter.StartDate != nil && t.TransactionDate.Before(*filter.StartDate) {
				continue
			}
			if filter.EndDate != nil && t.TransactionDate.After(*filter.EndDate) {
				continue
			}
			if filter.SearchQuery != nil && *filter.SearchQuery != "" {
				descLower := strings.ToLower(t.Description)
				queryLower := strings.ToLower(*filter.SearchQuery)
				if !strings.Contains(descLower, queryLower) {
					continue
				}
			}
			list = append(list, t)
		}
	}
	return &paging.Page[*Transaction]{
		Items: list,
	}, nil
}

func (m *mockTransactionStore) AggregateSpent(ctx context.Context, periodID PeriodID, budgetCurrency Currency, exchangeRateToBase float64) (int64, int64, error) {
	var spentInBase int64
	var spentAmount int64
	for _, t := range m.txns {
		if t.PeriodID != nil && *t.PeriodID == periodID {
			spentInBase += t.AmountInBase
			if t.Currency == budgetCurrency {
				spentAmount += t.Amount
			} else if exchangeRateToBase > 0 {
				spentAmount += int64(math.Round(float64(t.AmountInBase) / exchangeRateToBase))
			}
		}
	}
	return spentInBase, spentAmount, nil
}

func (m *mockTransactionStore) AggregateSpentBatch(ctx context.Context, periodIDs []PeriodID) ([]PeriodSpent, error) {
	results := make([]PeriodSpent, len(periodIDs))
	for i, periodID := range periodIDs {
		var spentInBase int64
		var spentAmount int64
		for _, t := range m.txns {
			if t.PeriodID != nil && *t.PeriodID == periodID {
				spentInBase += t.AmountInBase
				spentAmount += t.Amount
			}
		}
		results[i] = PeriodSpent{
			PeriodID:    periodID,
			SpentInBase: spentInBase,
			SpentAmount: spentAmount,
		}
	}
	return results, nil
}

type mockInsightsStore struct {
	spentTrend         []*SpentTrend
	budgetDistribution []*BudgetDistribution
	topExpenses        []*TopExpense
	err                error
}

func (m *mockInsightsStore) GetSpentTrend(ctx context.Context, filter *SpentTrendFilter) ([]*SpentTrend, error) {
	return m.spentTrend, m.err
}

func (m *mockInsightsStore) GetBudgetDistribution(ctx context.Context, filter *BudgetDistributionFilter) ([]*BudgetDistribution, error) {
	return m.budgetDistribution, m.err
}

func (m *mockInsightsStore) GetTopExpenses(ctx context.Context, filter *TopExpensesFilter) ([]*TopExpense, error) {
	return m.topExpenses, m.err
}

type mockAccountStore struct {
	data map[AccountID]*Account
}

func (m *mockAccountStore) Create(ctx context.Context, a *Account) error {
	m.data[a.ID] = a
	return nil
}

func (m *mockAccountStore) GetByID(ctx context.Context, spaceID SpaceID, id AccountID) (*Account, error) {
	a, ok := m.data[id]
	if !ok || a.SpaceID != spaceID {
		return nil, ErrAccountNotFound
	}
	return a, nil
}

func (m *mockAccountStore) Update(ctx context.Context, a *Account) error {
	if _, ok := m.data[a.ID]; !ok {
		return ErrAccountNotFound
	}
	m.data[a.ID] = a
	return nil
}

func (m *mockAccountStore) Delete(ctx context.Context, id AccountID) error {
	if _, ok := m.data[id]; !ok {
		return ErrAccountNotFound
	}
	delete(m.data, id)
	return nil
}

func (m *mockAccountStore) ListBySpace(ctx context.Context, spaceID SpaceID, filter *ListAccountsFilter) (*paging.Page[*Account], error) {
	var list []*Account
	for _, a := range m.data {
		if a.SpaceID == spaceID {
			list = append(list, a)
		}
	}
	return &paging.Page[*Account]{
		Items: list,
	}, nil
}

func (m *mockAccountStore) HasDefault(ctx context.Context, spaceID SpaceID) (bool, error) {
	for _, a := range m.data {
		if a.SpaceID == spaceID && a.IsDefault {
			return true, nil
		}
	}
	return false, nil
}

func (m *mockAccountStore) GetByIDs(ctx context.Context, spaceID SpaceID, ids []AccountID) ([]*Account, error) {
	var list []*Account
	for _, id := range ids {
		if a, ok := m.data[id]; ok && a.SpaceID == spaceID {
			list = append(list, a)
		}
	}
	return list, nil
}

func (m *mockAccountStore) UnsetDefaultsExcept(ctx context.Context, spaceID SpaceID, id AccountID) error {
	for _, a := range m.data {
		if a.SpaceID == spaceID && a.ID != id {
			a.IsDefault = false
		}
	}
	return nil
}

func (m *mockAccountStore) HasAny(ctx context.Context, spaceID SpaceID) (bool, error) {
	for _, a := range m.data {
		if a.SpaceID == spaceID {
			return true, nil
		}
	}
	return false, nil
}

type mockTransferStore struct {
	data map[TransferID]*Transfer
}

func (m *mockTransferStore) Create(ctx context.Context, t *Transfer) error {
	m.data[t.ID] = t
	return nil
}

func (m *mockTransferStore) GetByID(ctx context.Context, spaceID SpaceID, id TransferID) (*Transfer, error) {
	t, ok := m.data[id]
	if !ok {
		return nil, ErrTransferNotFound
	}
	return t, nil
}

func (m *mockTransferStore) Delete(ctx context.Context, id TransferID) error {
	if _, ok := m.data[id]; !ok {
		return ErrTransferNotFound
	}
	delete(m.data, id)
	return nil
}

func (m *mockTransferStore) ListBySpace(ctx context.Context, spaceID SpaceID, limit int32, pageToken string) ([]*Transfer, string, error) {
	var list []*Transfer
	for _, t := range m.data {
		if t.SpaceID == spaceID {
			list = append(list, t)
		}
	}
	return list, "", nil
}

type mockTransactionEventStore struct {
	events map[TransactionEventID]*TransactionEvent
}

func (m *mockTransactionEventStore) Create(ctx context.Context, e *TransactionEvent) error {
	m.events[e.ID] = e
	return nil
}

func (m *mockTransactionEventStore) ListByTransaction(ctx context.Context, spaceID SpaceID, txnID TransactionID) ([]*TransactionEvent, error) {
	var list []*TransactionEvent
	for _, e := range m.events {
		if e.SpaceID == spaceID && e.TransactionID == txnID {
			list = append(list, e)
		}
	}
	return list, nil
}

// --- Test Cases ---

func TestCalculateBounds(t *testing.T) {
	tests := []struct {
		name      string
		interval  RecurrenceInterval
		date      time.Time
		wantStart time.Time
		wantEnd   time.Time
	}{
		{
			name:      "monthly bounds calculation",
			interval:  IntervalMonthly,
			date:      time.Date(2026, 2, 15, 12, 30, 0, 0, time.UTC),
			wantStart: time.Date(2026, 2, 1, 0, 0, 0, 0, time.UTC),
			wantEnd:   time.Date(2026, 3, 1, 0, 0, 0, 0, time.UTC).Add(-time.Second),
		},
		{
			name:      "yearly bounds calculation",
			interval:  IntervalYearly,
			date:      time.Date(2026, 5, 20, 10, 0, 0, 0, time.UTC),
			wantStart: time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC),
			wantEnd:   time.Date(2027, 1, 1, 0, 0, 0, 0, time.UTC).Add(-time.Second),
		},
		{
			name:      "weekly bounds calculation (Wednesday mid-week)",
			interval:  IntervalWeekly,
			date:      time.Date(2026, 2, 18, 15, 0, 0, 0, time.UTC), // Feb 18 is Wednesday
			wantStart: time.Date(2026, 2, 16, 0, 0, 0, 0, time.UTC),  // Monday is Feb 16
			wantEnd:   time.Date(2026, 2, 23, 0, 0, 0, 0, time.UTC).Add(-time.Second),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			b := &Budget{Interval: tt.interval}
			start, end := b.CalculateBounds(tt.date)
			if !start.Equal(tt.wantStart) {
				t.Errorf("start date = %s, want %s", start, tt.wantStart)
			}
			if !end.Equal(tt.wantEnd) {
				t.Errorf("end date = %s, want %s", end, tt.wantEnd)
			}
		})
	}
}

func TestConfigureFinance(t *testing.T) {
	settingsStore := &mockSettingsStore{data: make(map[SpaceID]*FinanceSettings)}
	svc := NewService(Dependencies{
		SettingsStore:         settingsStore,
		AccountStore:          &mockAccountStore{data: make(map[AccountID]*Account)},
		TransferStore:         &mockTransferStore{data: make(map[TransferID]*Transfer)},
		TransactionEventStore: &mockTransactionEventStore{events: make(map[TransactionEventID]*TransactionEvent)},
	})

	spIDStr, _ := id.Generate("spc_")
	spID := SpaceID(spIDStr)

	settings := &FinanceSettings{
		SpaceID:      spID,
		BaseCurrency: Currency("USD"),
	}

	res, err := svc.ConfigureFinance(context.Background(), settings)
	if err != nil {
		t.Fatal(err)
	}

	if res.BaseCurrency != Currency("USD") {
		t.Errorf("BaseCurrency = %s, want USD", res.BaseCurrency)
	}

	// Verify settings exist
	retrieved, err := settingsStore.GetByID(context.Background(), spID)
	if err != nil {
		t.Fatal(err)
	}
	if retrieved.BaseCurrency != Currency("USD") {
		t.Errorf("stored BaseCurrency = %s, want USD", retrieved.BaseCurrency)
	}

	// Verify base currency cannot be modified (immutable test)
	newSettings := &FinanceSettings{
		SpaceID:      spID,
		BaseCurrency: Currency("EUR"),
	}
	res2, err := svc.ConfigureFinance(context.Background(), newSettings)
	if err != nil {
		t.Fatal(err)
	}
	if res2.BaseCurrency != Currency("USD") {
		t.Errorf("immutable currency got updated to %s", res2.BaseCurrency)
	}
}

func TestGetOrCreatePeriod(t *testing.T) {
	settingsStore := &mockSettingsStore{data: make(map[SpaceID]*FinanceSettings)}
	budgetStore := &mockBudgetStore{data: make(map[BudgetID]*Budget)}
	periodStore := &mockPeriodStore{data: make(map[string]*BudgetPeriod)}
	rateStore := &mockExchangeRateStore{rates: make(map[string]*ExchangeRate)}

	txnStore := &mockTransactionStore{txns: make(map[TransactionID]*Transaction)}

	svc := NewService(Dependencies{
		SettingsStore:         settingsStore,
		BudgetStore:           budgetStore,
		PeriodStore:           periodStore,
		ExchangeRateStore:     rateStore,
		TransactionStore:      txnStore,
		InsightsStore:         &mockInsightsStore{},
		AccountStore:          &mockAccountStore{data: make(map[AccountID]*Account)},
		TransferStore:         &mockTransferStore{data: make(map[TransferID]*Transfer)},
		TransactionEventStore: &mockTransactionEventStore{events: make(map[TransactionEventID]*TransactionEvent)},
	})

	ctx := context.Background()
	spIDStr, _ := id.Generate("spc_")
	spID := SpaceID(spIDStr)

	// 1. Setup workspace base currency
	_, err := svc.ConfigureFinance(ctx, &FinanceSettings{SpaceID: spID, BaseCurrency: Currency("USD")})
	if err != nil {
		t.Fatal(err)
	}

	bgtIDStr, _ := id.Generate("bgt_")
	bgtID := BudgetID(bgtIDStr)

	// 2. Setup budget template (EUR budget)
	budget, err := svc.CreateBudget(ctx, &Budget{
		ID:          bgtID,
		SpaceID:     spID,
		Name:        "Dining",
		LimitAmount: 50000, // 500.00 EUR
		Currency:    Currency("EUR"),
		Interval:    IntervalMonthly,
	})
	if err != nil {
		t.Fatal(err)
	}

	// 3. Set up exchange rate (EUR to USD) for Feb 15
	err = rateStore.Create(ctx, &ExchangeRate{
		SpaceID:      spID,
		FromCurrency: Currency("EUR"),
		ToCurrency:   Currency("USD"),
		Rate:         1.085,
		RateDate:     time.Date(2026, 2, 10, 0, 0, 0, 0, time.UTC), // Pre-existing rate
	})
	if err != nil {
		t.Fatal(err)
	}

	// 4. Trigger JIT period creation
	targetDate := time.Date(2026, 2, 15, 12, 0, 0, 0, time.UTC)
	period, err := svc.GetOrCreatePeriod(ctx, spID, budget.ID, targetDate)
	if err != nil {
		t.Fatal(err)
	}

	if period.LimitAmount != 50000 {
		t.Errorf("period limit = %d, want 50000", period.LimitAmount)
	}
	if period.ExchangeRateToBase != 1.085 {
		t.Errorf("period rate = %f, want 1.085", period.ExchangeRateToBase)
	}
	if period.BaseCurrency != Currency("USD") {
		t.Errorf("period base currency = %s, want USD", period.BaseCurrency)
	}

	// 5. Query again (should return the same period without recreating)
	period2, err := svc.GetOrCreatePeriod(ctx, spID, budget.ID, targetDate)
	if err != nil {
		t.Fatal(err)
	}
	if period2.ID != period.ID {
		t.Errorf("re-queried period ID = %s, want %s", period2.ID, period.ID)
	}
}

func TestTransactions(t *testing.T) {
	settingsStore := &mockSettingsStore{data: make(map[SpaceID]*FinanceSettings)}
	budgetStore := &mockBudgetStore{data: make(map[BudgetID]*Budget)}
	periodStore := &mockPeriodStore{data: make(map[string]*BudgetPeriod)}
	rateStore := &mockExchangeRateStore{rates: make(map[string]*ExchangeRate)}
	txnStore := &mockTransactionStore{txns: make(map[TransactionID]*Transaction)}

	svc := NewService(Dependencies{
		SettingsStore:         settingsStore,
		BudgetStore:           budgetStore,
		PeriodStore:           periodStore,
		ExchangeRateStore:     rateStore,
		TransactionStore:      txnStore,
		InsightsStore:         &mockInsightsStore{},
		AccountStore:          &mockAccountStore{data: make(map[AccountID]*Account)},
		TransferStore:         &mockTransferStore{data: make(map[TransferID]*Transfer)},
		TransactionEventStore: &mockTransactionEventStore{events: make(map[TransactionEventID]*TransactionEvent)},
	})

	ctx := context.Background()
	spIDStr, _ := id.Generate("spc_")
	spID := SpaceID(spIDStr)

	// 1. Setup settings
	_, err := svc.ConfigureFinance(ctx, &FinanceSettings{SpaceID: spID, BaseCurrency: Currency("USD")})
	if err != nil {
		t.Fatal(err)
	}

	// 2. Setup budget
	bgtIDStr, _ := id.Generate("bgt_")
	budget, err := svc.CreateBudget(ctx, &Budget{
		ID:          BudgetID(bgtIDStr),
		SpaceID:     spID,
		Name:        "Food",
		LimitAmount: 20000,
		Currency:    Currency("EUR"),
		Interval:    IntervalMonthly,
	})
	if err != nil {
		t.Fatal(err)
	}

	// 3. Setup exchange rate (EUR to USD = 1.10)
	rateDate := time.Date(2026, 2, 1, 0, 0, 0, 0, time.UTC)
	err = rateStore.Create(ctx, &ExchangeRate{
		SpaceID:      spID,
		FromCurrency: Currency("EUR"),
		ToCurrency:   Currency("USD"),
		Rate:         1.10,
		RateDate:     rateDate,
	})
	if err != nil {
		t.Fatal(err)
	}

	// 4. Create an expense of 10.00 EUR (1000 cents) on Feb 15
	targetDate := time.Date(2026, 2, 15, 12, 0, 0, 0, time.UTC)
	txn := &Transaction{
		SpaceID:         spID,
		BudgetID:        &budget.ID,
		Amount:          1000,
		Currency:        Currency("EUR"),
		Description:     "Dinner",
		TransactionDate: targetDate,
	}

	createdTxn, err := svc.CreateExpense(ctx, txn)
	if err != nil {
		t.Fatal(err)
	}

	if createdTxn.AmountInBase != 1100 { // 1000 * 1.10 = 1100
		t.Errorf("AmountInBase = %d, want 1100", createdTxn.AmountInBase)
	}

	period, err := svc.GetOrCreatePeriod(ctx, spID, budget.ID, targetDate)
	if err != nil {
		t.Fatal(err)
	}

	// Verify the period spent progress calculates correctly in batch query
	stats, err := svc.AggregateSpentBatch(ctx, []PeriodID{period.ID})
	if err != nil {
		t.Fatal(err)
	}
	if len(stats) != 1 {
		t.Fatalf("expected 1 stats item, got %d", len(stats))
	}
	if stats[0].SpentInBase != 1100 {
		t.Errorf("Period SpentInBase = %d, want 1100", stats[0].SpentInBase)
	}
	if stats[0].SpentAmount != 1000 { // 1100 / 1.10 = 1000
		t.Errorf("Period SpentAmount = %d, want 1000", stats[0].SpentAmount)
	}

	// Update the expense to 15.00 EUR (1500 cents)
	createdTxn.Amount = 1500
	updatedTxn, err := svc.UpdateExpense(ctx, createdTxn)
	if err != nil {
		t.Fatal(err)
	}

	if updatedTxn.AmountInBase != 1650 { // 1500 * 1.10 = 1650
		t.Errorf("Updated AmountInBase = %d, want 1650", updatedTxn.AmountInBase)
	}

	// Verify the period updated its spent aggregates to reflect new amount
	stats2, err := svc.AggregateSpentBatch(ctx, []PeriodID{period.ID})
	if err != nil {
		t.Fatal(err)
	}
	if len(stats2) != 1 {
		t.Fatalf("expected 1 stats item, got %d", len(stats2))
	}
	if stats2[0].SpentInBase != 1650 {
		t.Errorf("Period SpentInBase = %d, want 1650", stats2[0].SpentInBase)
	}

	// 5. Delete transaction
	err = svc.DeleteTransaction(ctx, spID, createdTxn.ID)
	if err != nil {
		t.Fatal(err)
	}

	// Verify period spent is back to 0
	stats3, err := svc.AggregateSpentBatch(ctx, []PeriodID{period.ID})
	if err != nil {
		t.Fatal(err)
	}
	if len(stats3) != 1 {
		t.Fatalf("expected 1 stats item, got %d", len(stats3))
	}
	if stats3[0].SpentInBase != 0 {
		t.Errorf("After delete, SpentInBase = %d, want 0", stats3[0].SpentInBase)
	}
}

func TestExchangeRateFallback(t *testing.T) {
	ctx := context.Background()
	spaceID := SpaceID("test-space")

	rateStore := &mockExchangeRateStore{rates: make(map[string]*ExchangeRate)}
	settingsStore := &mockSettingsStore{data: make(map[SpaceID]*FinanceSettings)}

	// Create service
	svc := NewService(Dependencies{
		ExchangeRateStore: rateStore,
		SettingsStore:     settingsStore,
	})

	// Configure finance settings
	_ = settingsStore.Create(ctx, &FinanceSettings{
		SpaceID:      spaceID,
		BaseCurrency: "USD",
	})

	// Set an exchange rate for 2026-07-24 (today) and 2026-07-28 (future)
	rate1 := &ExchangeRate{
		SpaceID:      spaceID,
		FromCurrency: "EUR",
		ToCurrency:   "USD",
		Rate:         1.10,
		RateDate:     time.Date(2026, 7, 24, 0, 0, 0, 0, time.UTC),
	}
	_ = rateStore.Create(ctx, rate1)

	rate2 := &ExchangeRate{
		SpaceID:      spaceID,
		FromCurrency: "EUR",
		ToCurrency:   "USD",
		Rate:         1.20,
		RateDate:     time.Date(2026, 7, 28, 0, 0, 0, 0, time.UTC),
	}
	_ = rateStore.Create(ctx, rate2)

	// Test Case 1: Exact date lookup (2026-07-24)
	r, err := svc.getExchangeRate(ctx, ExchangeRateKey{
		SpaceID:      spaceID,
		FromCurrency: "EUR",
		ToCurrency:   "USD",
		RateDate:     time.Date(2026, 7, 24, 0, 0, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("Test Case 1 failed: %v", err)
	}
	if r.Rate != 1.10 {
		t.Errorf("Test Case 1: rate = %f, want 1.10", r.Rate)
	}

	// Test Case 2: Past date before any rates exist (e.g., 2026-07-20)
	// It should fall back to the oldest future rate (which is Rate 1 on 2026-07-24)
	r, err = svc.getExchangeRate(ctx, ExchangeRateKey{
		SpaceID:      spaceID,
		FromCurrency: "EUR",
		ToCurrency:   "USD",
		RateDate:     time.Date(2026, 7, 20, 0, 0, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("Test Case 2 failed: %v", err)
	}
	if r.Rate != 1.10 {
		t.Errorf("Test Case 2: rate = %f, want 1.10 (oldest future rate)", r.Rate)
	}

	// Test Case 3: Future date (e.g., 2026-07-26)
	// It should find the closest rate in the past (which is Rate 1 on 2026-07-24)
	r, err = svc.getExchangeRate(ctx, ExchangeRateKey{
		SpaceID:      spaceID,
		FromCurrency: "EUR",
		ToCurrency:   "USD",
		RateDate:     time.Date(2026, 7, 26, 0, 0, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("Test Case 3 failed: %v", err)
	}
	if r.Rate != 1.10 {
		t.Errorf("Test Case 3: rate = %f, want 1.10 (most recent past rate)", r.Rate)
	}
}

func TestAdjustAccountBalance(t *testing.T) {
	ctx := context.Background()
	spIDStr, _ := id.Generate("spc_")
	spaceID := SpaceID(spIDStr)

	accIDStr, _ := id.Generate("acc_")
	accID := AccountID(accIDStr)

	accountStore := &mockAccountStore{data: make(map[AccountID]*Account)}
	txnStore := &mockTransactionStore{txns: make(map[TransactionID]*Transaction)}
	settingsStore := &mockSettingsStore{data: make(map[SpaceID]*FinanceSettings)}
	eventStore := &mockTransactionEventStore{events: make(map[TransactionEventID]*TransactionEvent)}

	_ = settingsStore.Create(ctx, &FinanceSettings{
		SpaceID:      spaceID,
		BaseCurrency: "USD",
	})

	initialAcc := &Account{
		ID:             accID,
		SpaceID:        spaceID,
		Name:           "Checking",
		Type:           AccountTypeBank,
		Currency:       "USD",
		CurrentBalance: 5000, // $50.00
		IsActive:       true,
	}
	_ = accountStore.Create(ctx, initialAcc)

	svc := NewService(Dependencies{
		SettingsStore:         settingsStore,
		AccountStore:          accountStore,
		TransactionStore:      txnStore,
		TransactionEventStore: eventStore,
	})

	// Test Case 1: Positive Adjustment ($50.00 -> $120.00, Delta = +$70.00)
	updatedAcc, err := svc.AdjustAccountBalance(ctx, spaceID, accID, 12000, "", "Statement reconciliation")
	if err != nil {
		t.Fatalf("AdjustAccountBalance failed: %v", err)
	}

	if updatedAcc.CurrentBalance != 12000 {
		t.Errorf("CurrentBalance = %d, want 12000", updatedAcc.CurrentBalance)
	}

	// Verify logged transaction
	if len(txnStore.txns) != 1 {
		t.Fatalf("expected 1 logged transaction, got %d", len(txnStore.txns))
	}

	var loggedTxn *Transaction
	for _, tx := range txnStore.txns {
		loggedTxn = tx
	}

	if loggedTxn.Type != TransactionTypeBalanceAdjustment {
		t.Errorf("Type = %s, want BALANCE_ADJUSTMENT", loggedTxn.Type)
	}
	if loggedTxn.Amount != 7000 {
		t.Errorf("Amount = %d, want 7000", loggedTxn.Amount)
	}
	if loggedTxn.SourceType == nil || *loggedTxn.SourceType != "SYSTEM_BALANCE_ADJUSTMENT" {
		t.Errorf("SourceType = %v, want SYSTEM_BALANCE_ADJUSTMENT", loggedTxn.SourceType)
	}

	// Test Case 2: Negative Adjustment ($120.00 -> $80.00, Delta = -$40.00)
	updatedAcc2, err := svc.AdjustAccountBalance(ctx, spaceID, accID, 8000, "", "Fee adjustment")
	if err != nil {
		t.Fatalf("AdjustAccountBalance negative failed: %v", err)
	}

	if updatedAcc2.CurrentBalance != 8000 {
		t.Errorf("CurrentBalance = %d, want 8000", updatedAcc2.CurrentBalance)
	}

	// Test Case 3: Prevent Manual Editing of Balance Adjustment
	err = svc.updateTransaction(ctx, loggedTxn, loggedTxn)
	if err == nil {
		t.Error("expected error when attempting to update balance adjustment transaction, got nil")
	} else if !strings.Contains(err.Error(), "balance adjustment transactions cannot be edited directly") {
		t.Errorf("unexpected error message: %v", err)
	}
}
