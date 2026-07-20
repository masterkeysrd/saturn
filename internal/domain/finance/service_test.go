package finance

import (
	"context"
	"testing"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/id"
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

func (m *mockBudgetStore) GetByID(ctx context.Context, id BudgetID) (*Budget, error) {
	b, ok := m.data[id]
	if !ok {
		return nil, ErrBudgetNotFound
	}
	return b, nil
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

func (m *mockBudgetStore) ListBySpace(ctx context.Context, spaceID SpaceID, filter *ListBudgetsFilter) ([]*Budget, string, error) {
	var list []*Budget
	for _, b := range m.data {
		if b.SpaceID == spaceID {
			list = append(list, b)
		}
	}
	return list, "", nil
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

func (m *mockExchangeRateStore) GetRate(ctx context.Context, spaceID SpaceID, fromCurrency, toCurrency Currency, rateDate time.Time) (*ExchangeRate, error) {
	// Look up rate exactly, or fallback to the closest date before
	var best *ExchangeRate
	for _, r := range m.rates {
		if r.SpaceID == spaceID && r.FromCurrency == fromCurrency && r.ToCurrency == toCurrency {
			if !r.RateDate.After(rateDate) {
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

func (m *mockExchangeRateStore) ListBySpace(ctx context.Context, spaceID SpaceID, filter *ListExchangeRatesFilter) ([]*ExchangeRate, string, error) {
	var results []*ExchangeRate
	for _, r := range m.rates {
		if r.SpaceID == spaceID {
			results = append(results, r)
		}
	}
	return results, "", nil
}

func (m *mockExchangeRateStore) Delete(ctx context.Context, spaceID SpaceID, fromCurrency, toCurrency Currency, rateDate time.Time) error {
	key := string(spaceID) + "_" + string(fromCurrency) + "_" + string(toCurrency) + "_" + rateDate.Format("2006-01-02")
	delete(m.rates, key)
	return nil
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
			wantEnd:   time.Date(2026, 3, 1, 0, 0, 0, 0, time.UTC).Add(-time.Nanosecond),
		},
		{
			name:      "yearly bounds calculation",
			interval:  IntervalYearly,
			date:      time.Date(2026, 5, 20, 10, 0, 0, 0, time.UTC),
			wantStart: time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC),
			wantEnd:   time.Date(2027, 1, 1, 0, 0, 0, 0, time.UTC).Add(-time.Nanosecond),
		},
		{
			name:      "weekly bounds calculation (Wednesday mid-week)",
			interval:  IntervalWeekly,
			date:      time.Date(2026, 2, 18, 15, 0, 0, 0, time.UTC), // Feb 18 is Wednesday
			wantStart: time.Date(2026, 2, 16, 0, 0, 0, 0, time.UTC),  // Monday is Feb 16
			wantEnd:   time.Date(2026, 2, 23, 0, 0, 0, 0, time.UTC).Add(-time.Nanosecond),
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
	svc := NewService(Dependencies{SettingsStore: settingsStore})

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

	svc := NewService(Dependencies{
		SettingsStore:     settingsStore,
		BudgetStore:       budgetStore,
		PeriodStore:       periodStore,
		ExchangeRateStore: rateStore,
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
	period, err := svc.GetOrCreatePeriod(ctx, budget.ID, targetDate)
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
	period2, err := svc.GetOrCreatePeriod(ctx, budget.ID, targetDate)
	if err != nil {
		t.Fatal(err)
	}
	if period2.ID != period.ID {
		t.Errorf("re-queried period ID = %s, want %s", period2.ID, period.ID)
	}
}
