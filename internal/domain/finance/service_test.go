package finance

import (
	"context"
	"errors"
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

func (m *mockBudgetStore) Delete(ctx context.Context, spaceID SpaceID, id BudgetID, opts DeleteOptions) error {
	existing, ok := m.data[id]
	if !ok {
		return ErrBudgetNotFound
	}
	if opts.Version > 0 && existing.Version != opts.Version {
		return ErrBudgetVersionMismatch
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

func (m *mockTransactionStore) HasTransactions(ctx context.Context, spaceID SpaceID, filter *TransactionFilter) (bool, error) {
	for _, t := range m.txns {
		if t.SpaceID != spaceID {
			continue
		}
		if filter != nil && filter.BudgetID != nil && (t.BudgetID == nil || *t.BudgetID != *filter.BudgetID) {
			continue
		}
		return true, nil
	}
	return false, nil
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

func (m *mockTransactionStore) ListBySpace(ctx context.Context, spaceID SpaceID, filter *TransactionFilter) (*paging.Page[*Transaction], error) {
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

type mockBorrowingStore struct {
	data map[BorrowingID]*Borrowing
}

func (m *mockBorrowingStore) Create(ctx context.Context, b *Borrowing) error {
	m.data[b.ID] = b
	return nil
}

func (m *mockBorrowingStore) GetByID(ctx context.Context, spaceID SpaceID, id BorrowingID) (*Borrowing, error) {
	b, ok := m.data[id]
	if !ok {
		return nil, ErrBorrowingNotFound
	}
	return b, nil
}

func (m *mockBorrowingStore) GetByIDs(ctx context.Context, spaceID SpaceID, ids []BorrowingID) ([]*Borrowing, error) {
	var list []*Borrowing
	for _, id := range ids {
		if b, ok := m.data[id]; ok {
			list = append(list, b)
		}
	}
	return list, nil
}

func (m *mockBorrowingStore) Update(ctx context.Context, b *Borrowing) error {
	m.data[b.ID] = b
	return nil
}

func (m *mockBorrowingStore) Delete(ctx context.Context, id BorrowingID) error {
	delete(m.data, id)
	return nil
}

func (m *mockBorrowingStore) ListBySpace(ctx context.Context, spaceID SpaceID, filter *ListBorrowingsFilter) ([]*Borrowing, string, error) {
	var list []*Borrowing
	for _, b := range m.data {
		if b.SpaceID == spaceID {
			list = append(list, b)
		}
	}
	return list, "", nil
}

type mockScheduledPaymentStore struct {
	payments map[ScheduledPaymentID]*ScheduledPayment
}

func (m *mockScheduledPaymentStore) Create(ctx context.Context, payment *ScheduledPayment) error {
	if m.payments == nil {
		m.payments = make(map[ScheduledPaymentID]*ScheduledPayment)
	}
	m.payments[payment.ID] = payment
	return nil
}

func (m *mockScheduledPaymentStore) GetByID(ctx context.Context, spaceID SpaceID, id ScheduledPaymentID) (*ScheduledPayment, error) {
	p, ok := m.payments[id]
	if !ok || p.SpaceID != spaceID {
		return nil, ErrScheduledPaymentNotFound
	}
	return p, nil
}

func (m *mockScheduledPaymentStore) UpdateStatus(ctx context.Context, id ScheduledPaymentID, status ScheduledPaymentStatus) error {
	p, ok := m.payments[id]
	if !ok {
		return ErrScheduledPaymentNotFound
	}
	p.Status = status
	return nil
}

func (m *mockScheduledPaymentStore) Delete(ctx context.Context, id ScheduledPaymentID) error {
	delete(m.payments, id)
	return nil
}

func (m *mockScheduledPaymentStore) ListBySpace(ctx context.Context, spaceID SpaceID, filter *ListScheduledPaymentsFilter) (*paging.Page[*ScheduledPayment], error) {
	var list []*ScheduledPayment
	for _, p := range m.payments {
		if p.SpaceID == spaceID {
			list = append(list, p)
		}
	}
	return &paging.Page[*ScheduledPayment]{Items: list}, nil
}

func (m *mockScheduledPaymentStore) HasScheduledPayments(ctx context.Context, spaceID SpaceID, filter *ListScheduledPaymentsFilter) (bool, error) {
	for _, p := range m.payments {
		if p.SpaceID == spaceID {
			if filter != nil && filter.BudgetID != nil && p.BudgetID != *filter.BudgetID {
				continue
			}
			return true, nil
		}
	}
	return false, nil
}

// --- Test Cases ---

func TestUpdateBudget(t *testing.T) {
	ctx := context.Background()
	spaceID := SpaceID("spc_2dE1V8ZqWz4eS2N9yX3bL1mK7pO")
	bID, _ := NewBudgetID()

	budgetStore := &mockBudgetStore{data: make(map[BudgetID]*Budget)}
	settingsStore := &mockSettingsStore{data: make(map[SpaceID]*FinanceSettings)}
	_ = settingsStore.Create(ctx, &FinanceSettings{SpaceID: spaceID, BaseCurrency: "USD"})

	_ = budgetStore.Create(ctx, &Budget{
		ID:          bID,
		SpaceID:     spaceID,
		Name:        "Dining Out",
		LimitAmount: 30000,
		Currency:    "USD",
		Interval:    IntervalMonthly,
		Version:     2,
	})

	svc := NewService(Dependencies{
		BudgetStore:   budgetStore,
		SettingsStore: settingsStore,
	})

	tests := []struct {
		name      string
		update    *Budget
		mask      []string
		wantErr   error
		wantName  string
		wantLimit int64
	}{
		{
			name: "stale version returns ErrBudgetVersionMismatch",
			update: &Budget{
				ID:          bID,
				SpaceID:     spaceID,
				Name:        "Stale Update",
				LimitAmount: 40000,
				Version:     1,
			},
			wantErr: ErrBudgetVersionMismatch,
		},
		{
			name: "valid matching version succeeds and updates fields",
			update: &Budget{
				ID:          bID,
				SpaceID:     spaceID,
				Name:        "Dining Out New",
				LimitAmount: 35000,
				Version:     2,
			},
			mask:      []string{"name", "limit_amount"},
			wantErr:   nil,
			wantName:  "Dining Out New",
			wantLimit: 35000,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			res, err := svc.UpdateBudget(ctx, tt.update, tt.mask)
			if tt.wantErr != nil {
				if !errors.Is(err, tt.wantErr) {
					t.Errorf("UpdateBudget error = %v, want %v", err, tt.wantErr)
				}
			} else {
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				if res.Name != tt.wantName {
					t.Errorf("Name = %s, want %s", res.Name, tt.wantName)
				}
				if res.LimitAmount != tt.wantLimit {
					t.Errorf("LimitAmount = %d, want %d", res.LimitAmount, tt.wantLimit)
				}
			}
		})
	}
}

func TestDeleteBudget(t *testing.T) {
	ctx := context.Background()
	spaceID := SpaceID("spc_2dE1V8ZqWz4eS2N9yX3bL1mK7pO")

	bIDClean, _ := NewBudgetID()
	bIDTxns, _ := NewBudgetID()
	bIDSched, _ := NewBudgetID()

	budgetStore := &mockBudgetStore{data: make(map[BudgetID]*Budget)}
	txnStore := &mockTransactionStore{txns: make(map[TransactionID]*Transaction)}
	schedStore := &mockScheduledPaymentStore{payments: make(map[ScheduledPaymentID]*ScheduledPayment)}

	_ = budgetStore.Create(ctx, &Budget{ID: bIDClean, SpaceID: spaceID, Name: "Clean Budget", IsActive: true})
	_ = budgetStore.Create(ctx, &Budget{ID: bIDTxns, SpaceID: spaceID, Name: "Txn Budget", IsActive: true})
	_ = budgetStore.Create(ctx, &Budget{ID: bIDSched, SpaceID: spaceID, Name: "Sched Budget", IsActive: true})

	_ = txnStore.Create(ctx, &Transaction{
		ID:       TransactionID("txn_1"),
		SpaceID:  spaceID,
		BudgetID: &bIDTxns,
		Type:     TransactionTypeExpense,
		Amount:   500,
	})

	_ = schedStore.Create(ctx, &ScheduledPayment{
		ID:       ScheduledPaymentID("sch_1"),
		SpaceID:  spaceID,
		BudgetID: bIDSched,
		Status:   ScheduledPaymentPending,
	})

	svc := NewService(Dependencies{
		BudgetStore:           budgetStore,
		TransactionStore:      txnStore,
		ScheduledPaymentStore: schedStore,
	})

	tests := []struct {
		name    string
		bID     BudgetID
		wantErr error
	}{
		{
			name:    "deleting budget with active transactions fails",
			bID:     bIDTxns,
			wantErr: ErrBudgetHasTransactions,
		},
		{
			name:    "deleting budget with active scheduled payments fails",
			bID:     bIDSched,
			wantErr: ErrBudgetHasScheduledPayments,
		},
		{
			name:    "deleting clean budget succeeds",
			bID:     bIDClean,
			wantErr: nil,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := svc.DeleteBudget(ctx, spaceID, tt.bID, DeleteOptions{})
			if tt.wantErr != nil {
				if !errors.Is(err, tt.wantErr) {
					t.Errorf("DeleteBudget error = %v, want %v", err, tt.wantErr)
				}
			} else if err != nil {
				t.Errorf("unexpected DeleteBudget error: %v", err)
			}
		})
	}
}

func TestGetScheduledPayment(t *testing.T) {
	ctx := context.Background()
	spaceID := SpaceID("spc_2dE1V8ZqWz4eS2N9yX3bL1mK7pO")
	spID := ScheduledPaymentID("sch_2dE1V8ZqWz4eS2N9yX3bL1mK7pO")

	mockStore := &mockScheduledPaymentStore{
		payments: map[ScheduledPaymentID]*ScheduledPayment{
			spID: {
				ID:       spID,
				SpaceID:  spaceID,
				Amount:   1500,
				Currency: Currency("USD"),
				Status:   ScheduledPaymentPending,
			},
		},
	}

	svc := NewService(Dependencies{
		ScheduledPaymentStore: mockStore,
	})

	tests := []struct {
		name    string
		spaceID SpaceID
		id      ScheduledPaymentID
		wantErr bool
	}{
		{
			name:    "valid query returns scheduled payment",
			spaceID: spaceID,
			id:      spID,
			wantErr: false,
		},
		{
			name:    "invalid space ID returns validation error",
			spaceID: SpaceID("invalid"),
			id:      spID,
			wantErr: true,
		},
		{
			name:    "invalid scheduled payment ID returns validation error",
			spaceID: spaceID,
			id:      ScheduledPaymentID("invalid"),
			wantErr: true,
		},
		{
			name:    "missing scheduled payment returns not found error",
			spaceID: spaceID,
			id:      ScheduledPaymentID("sch_2dE1V8ZqWz4eS2N9yX3bL999999"),
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := svc.GetScheduledPayment(ctx, tt.spaceID, tt.id)
			if tt.wantErr {
				if err == nil {
					t.Errorf("GetScheduledPayment expected error, got nil")
				}
			} else {
				if err != nil {
					t.Errorf("unexpected GetScheduledPayment error: %v", err)
				}
				if got == nil || got.ID != spID {
					t.Errorf("GetScheduledPayment got = %v, want ID %s", got, spID)
				}
			}
		})
	}
}

func TestGetOrCreatePeriod_MultiCurrencyRateResolution(t *testing.T) {
	ctx := context.Background()
	spaceID := SpaceID("spc_2dE1V8ZqWz4eS2N9yX3bL1mK7pO")
	bID, _ := NewBudgetID()
	now := time.Now().UTC()

	budgetStore := &mockBudgetStore{data: make(map[BudgetID]*Budget)}
	settingsStore := &mockSettingsStore{data: make(map[SpaceID]*FinanceSettings)}
	periodStore := &mockPeriodStore{data: make(map[string]*BudgetPeriod)}
	rateStore := &mockExchangeRateStore{rates: make(map[string]*ExchangeRate)}

	_ = settingsStore.Create(ctx, &FinanceSettings{SpaceID: spaceID, BaseCurrency: "USD"})
	_ = budgetStore.Create(ctx, &Budget{
		ID:          bID,
		SpaceID:     spaceID,
		Name:        "Travel EUR",
		LimitAmount: 100000,
		Currency:    "EUR",
		Interval:    IntervalMonthly,
		IsActive:    true,
	})

	svc := NewService(Dependencies{
		BudgetStore:       budgetStore,
		SettingsStore:     settingsStore,
		PeriodStore:       periodStore,
		ExchangeRateStore: rateStore,
	})

	t.Run("missing exchange rate returns validation error", func(t *testing.T) {
		_, err := svc.GetOrCreatePeriod(ctx, spaceID, bID, now)
		if err == nil || !strings.Contains(err.Error(), "exchange rate must be greater than zero") {
			t.Fatalf("expected exchange rate error, got %v", err)
		}
	})

	t.Run("registered exchange rate sets rate on period", func(t *testing.T) {
		_ = rateStore.Create(ctx, &ExchangeRate{
			SpaceID:      spaceID,
			FromCurrency: "EUR",
			ToCurrency:   "USD",
			Rate:         1.10,
			RateDate:     now,
		})

		// Create period for next month with registered rate
		nextMonth := now.AddDate(0, 1, 0)
		p, err := svc.GetOrCreatePeriod(ctx, spaceID, bID, nextMonth)
		if err != nil {
			t.Fatalf("GetOrCreatePeriod failed: %v", err)
		}
		if p.ExchangeRateToBase != 1.10 {
			t.Errorf("ExchangeRateToBase = %f, want 1.10", p.ExchangeRateToBase)
		}
	})
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

func TestCreateBorrowingRepayment_SameCurrencyLent(t *testing.T) {
	ctx := context.Background()
	spaceID := SpaceID("sp_test123")
	accID := AccountID("acc_bank123")
	borID, _ := NewBorrowingID()

	accountStore := &mockAccountStore{data: make(map[AccountID]*Account)}
	txnStore := &mockTransactionStore{txns: make(map[TransactionID]*Transaction)}
	borrowingStore := &mockBorrowingStore{data: make(map[BorrowingID]*Borrowing)}
	settingsStore := &mockSettingsStore{data: make(map[SpaceID]*FinanceSettings)}

	_ = settingsStore.Create(ctx, &FinanceSettings{SpaceID: spaceID, BaseCurrency: "USD"})
	_ = accountStore.Create(ctx, &Account{
		ID:             accID,
		SpaceID:        spaceID,
		Name:           "Checking Account",
		Type:           AccountTypeBank,
		Currency:       "USD",
		CurrentBalance: 50000, // $500.00
		IsActive:       true,
	})
	_ = borrowingStore.Create(ctx, &Borrowing{
		ID:              borID,
		SpaceID:         spaceID,
		Direction:       BorrowingDirectionLent,
		Counterparty:    "John",
		TotalAmount:     10000, // $100.00
		RemainingAmount: 10000, // $100.00
		Currency:        "USD",
		Status:          BorrowingStatusActive,
		EstablishedAt:   time.Now().UTC(),
	})

	svc := NewService(Dependencies{
		SettingsStore:    settingsStore,
		AccountStore:     accountStore,
		BorrowingStore:   borrowingStore,
		TransactionStore: txnStore,
	})

	repayment, err := svc.CreateBorrowingRepayment(ctx, &BorrowingRepayment{
		BorrowingID: borID,
		SpaceID:     spaceID,
		Amount:      3000, // $30.00 repayment
		PaymentDate: time.Now().UTC(),
		AccountID:   &accID,
		Notes:       "Part payment from John",
	})
	if err != nil {
		t.Fatalf("CreateBorrowingRepayment failed: %v", err)
	}

	// Verify Borrowing remaining balance (10000 - 3000 = 7000)
	b, _ := borrowingStore.GetByID(ctx, spaceID, borID)
	if b.RemainingAmount != 7000 {
		t.Errorf("Borrowing remaining balance = %d, want 7000", b.RemainingAmount)
	}

	// Verify Account balance (50000 + 3000 = 53000 because LENT repayment is INFLOW)
	acc, _ := accountStore.GetByID(ctx, spaceID, accID)
	if acc.CurrentBalance != 53000 {
		t.Errorf("Account balance = %d, want 53000", acc.CurrentBalance)
	}

	// Verify Repayment Transaction logged
	txn, err := txnStore.GetByID(ctx, spaceID, TransactionID(repayment.ID))
	if err != nil {
		t.Fatalf("Repayment transaction not found: %v", err)
	}
	if txn.Type != TransactionTypeIncome {
		t.Errorf("Transaction type = %s, want INCOME", txn.Type)
	}
	if txn.Amount != 3000 {
		t.Errorf("Transaction amount = %d, want 3000", txn.Amount)
	}
}

func TestCreateBorrowingRepayment_MultiCurrency(t *testing.T) {
	ctx := context.Background()
	spaceID := SpaceID("sp_test456")
	accID := AccountID("acc_dop123")
	borID, _ := NewBorrowingID()

	accountStore := &mockAccountStore{data: make(map[AccountID]*Account)}
	txnStore := &mockTransactionStore{txns: make(map[TransactionID]*Transaction)}
	borrowingStore := &mockBorrowingStore{data: make(map[BorrowingID]*Borrowing)}
	settingsStore := &mockSettingsStore{data: make(map[SpaceID]*FinanceSettings)}
	rateStore := &mockExchangeRateStore{rates: make(map[string]*ExchangeRate)}

	_ = settingsStore.Create(ctx, &FinanceSettings{SpaceID: spaceID, BaseCurrency: "USD"})
	_ = rateStore.Create(ctx, &ExchangeRate{
		SpaceID:      spaceID,
		FromCurrency: "USD",
		ToCurrency:   "DOP",
		Rate:         60.0,
		RateDate:     time.Now().UTC(),
	})

	_ = accountStore.Create(ctx, &Account{
		ID:             accID,
		SpaceID:        spaceID,
		Name:           "Dominican Bank Account",
		Type:           AccountTypeBank,
		Currency:       "DOP",
		CurrentBalance: 5000000, // 50,000.00 DOP
		IsActive:       true,
	})
	_ = borrowingStore.Create(ctx, &Borrowing{
		ID:              borID,
		SpaceID:         spaceID,
		Direction:       BorrowingDirectionLent,
		Counterparty:    "Maria",
		TotalAmount:     10000, // $100.00 USD
		RemainingAmount: 10000, // $100.00 USD
		Currency:        "USD",
		Status:          BorrowingStatusActive,
		EstablishedAt:   time.Now().UTC(),
	})

	svc := NewService(Dependencies{
		SettingsStore:     settingsStore,
		ExchangeRateStore: rateStore,
		AccountStore:      accountStore,
		BorrowingStore:    borrowingStore,
		TransactionStore:  txnStore,
	})

	repayment, err := svc.CreateBorrowingRepayment(ctx, &BorrowingRepayment{
		BorrowingID: borID,
		SpaceID:     spaceID,
		Amount:      1000, // $10.00 USD repayment
		PaymentDate: time.Now().UTC(),
		AccountID:   &accID,
		Notes:       "Repayment from Maria in DOP",
	})
	if err != nil {
		t.Fatalf("CreateBorrowingRepayment multi-currency failed: %v", err)
	}

	// Verify Borrowing remaining balance ($100 - $10 = $90 USD)
	b, _ := borrowingStore.GetByID(ctx, spaceID, borID)
	if b.RemainingAmount != 9000 {
		t.Errorf("Borrowing remaining balance = %d, want 9000 USD", b.RemainingAmount)
	}

	// Verify DOP Account balance: 50,000 DOP + ($10 * 60 = 600 DOP = 60000 DOP cents)
	acc, _ := accountStore.GetByID(ctx, spaceID, accID)
	expectedDOPBalance := int64(5000000 + 60000)
	if acc.CurrentBalance != expectedDOPBalance {
		t.Errorf("Account DOP balance = %d, want %d", acc.CurrentBalance, expectedDOPBalance)
	}

	// Verify Deleting Repayment rolls back both DOP Account and USD Borrowing
	err = svc.DeleteBorrowingRepayment(ctx, DeleteBorrowingRepaymentRequest{
		SpaceID:     spaceID,
		BorrowingID: borID,
		ID:          repayment.ID,
	})
	if err != nil {
		t.Fatalf("DeleteBorrowingRepayment failed: %v", err)
	}

	bAfterDelete, _ := borrowingStore.GetByID(ctx, spaceID, borID)
	if bAfterDelete.RemainingAmount != 10000 {
		t.Errorf("Borrowing balance after deletion = %d, want 10000 USD", bAfterDelete.RemainingAmount)
	}

	accAfterDelete, _ := accountStore.GetByID(ctx, spaceID, accID)
	if accAfterDelete.CurrentBalance != 5000000 {
		t.Errorf("Account DOP balance after deletion = %d, want 5000000 DOP", accAfterDelete.CurrentBalance)
	}
}

func TestService_CreateTransfer(t *testing.T) {
	spIDStr, _ := id.Generate("spc_")
	spID := SpaceID(spIDStr)
	otherSpIDStr, _ := id.Generate("spc_")
	otherSpID := SpaceID(otherSpIDStr)

	ctx := context.Background()

	srcUSD, _ := NewAccountID()
	dstUSD, _ := NewAccountID()
	dstEUR, _ := NewAccountID()
	otherSpaceAcc, _ := NewAccountID()

	tests := []struct {
		name               string
		transfer           *Transfer
		setupAccounts      func(accStore *mockAccountStore)
		wantErr            bool
		errContains        string
		expectedSrcBalance int64
		expectedDstBalance int64
	}{
		{
			name: "Success - Single Currency (USD to USD)",
			transfer: &Transfer{
				SpaceID:              spID,
				SourceAccountID:      srcUSD,
				DestinationAccountID: dstUSD,
				SourceAmount:         40000,
				DestinationAmount:    40000,
				TransferDate:         time.Now().UTC(),
				Notes:                "Single currency savings transfer",
			},
			setupAccounts: func(as *mockAccountStore) {
				_ = as.Create(ctx, &Account{ID: srcUSD, SpaceID: spID, Name: "Checking USD", Currency: "USD", CurrentBalance: 100000, IsActive: true})
				_ = as.Create(ctx, &Account{ID: dstUSD, SpaceID: spID, Name: "Savings USD", Currency: "USD", CurrentBalance: 0, IsActive: true})
			},
			wantErr:            false,
			expectedSrcBalance: 60000,
			expectedDstBalance: 40000,
		},
		{
			name: "Success - Multi Currency (EUR to USD)",
			transfer: &Transfer{
				SpaceID:              spID,
				SourceAccountID:      srcUSD,
				DestinationAccountID: dstEUR,
				SourceAmount:         50000, // €500
				DestinationAmount:    54000, // $540
				TransferDate:         time.Now().UTC(),
				Notes:                "Multi currency transfer",
			},
			setupAccounts: func(as *mockAccountStore) {
				_ = as.Create(ctx, &Account{ID: srcUSD, SpaceID: spID, Name: "Checking USD", Currency: "USD", CurrentBalance: 100000, IsActive: true})
				_ = as.Create(ctx, &Account{ID: dstEUR, SpaceID: spID, Name: "Savings EUR", Currency: "EUR", CurrentBalance: 0, IsActive: true})
			},
			wantErr:            false,
			expectedSrcBalance: 50000,
			expectedDstBalance: 54000,
		},
		{
			name: "Err - Same Source and Destination Account",
			transfer: &Transfer{
				SpaceID:              spID,
				SourceAccountID:      srcUSD,
				DestinationAccountID: srcUSD,
				SourceAmount:         10000,
				DestinationAmount:    10000,
				TransferDate:         time.Now().UTC(),
			},
			setupAccounts: func(as *mockAccountStore) {
				_ = as.Create(ctx, &Account{ID: srcUSD, SpaceID: spID, Name: "Checking USD", Currency: "USD", CurrentBalance: 100000, IsActive: true})
			},
			wantErr:     true,
			errContains: "source and destination accounts must be different",
		},
		{
			name: "Err - Single Currency Mismatched Amounts",
			transfer: &Transfer{
				SpaceID:              spID,
				SourceAccountID:      srcUSD,
				DestinationAccountID: dstUSD,
				SourceAmount:         50000,
				DestinationAmount:    40000,
				TransferDate:         time.Now().UTC(),
			},
			setupAccounts: func(as *mockAccountStore) {
				_ = as.Create(ctx, &Account{ID: srcUSD, SpaceID: spID, Name: "Checking USD", Currency: "USD", CurrentBalance: 100000, IsActive: true})
				_ = as.Create(ctx, &Account{ID: dstUSD, SpaceID: spID, Name: "Savings USD", Currency: "USD", CurrentBalance: 0, IsActive: true})
			},
			wantErr:     true,
			errContains: "source and destination amounts must match for single-currency transfers",
		},
		{
			name: "Err - Zero or Negative Source Amount",
			transfer: &Transfer{
				SpaceID:              spID,
				SourceAccountID:      srcUSD,
				DestinationAccountID: dstUSD,
				SourceAmount:         0,
				DestinationAmount:    10000,
				TransferDate:         time.Now().UTC(),
			},
			setupAccounts: func(as *mockAccountStore) {
				_ = as.Create(ctx, &Account{ID: srcUSD, SpaceID: spID, Name: "Checking USD", Currency: "USD", CurrentBalance: 100000, IsActive: true})
				_ = as.Create(ctx, &Account{ID: dstUSD, SpaceID: spID, Name: "Savings USD", Currency: "USD", CurrentBalance: 0, IsActive: true})
			},
			wantErr:     true,
			errContains: "source amount must be greater than zero",
		},
		{
			name: "Err - Account From Different Space",
			transfer: &Transfer{
				SpaceID:              spID,
				SourceAccountID:      srcUSD,
				DestinationAccountID: otherSpaceAcc,
				SourceAmount:         10000,
				DestinationAmount:    10000,
				TransferDate:         time.Now().UTC(),
			},
			setupAccounts: func(as *mockAccountStore) {
				_ = as.Create(ctx, &Account{ID: srcUSD, SpaceID: spID, Name: "Checking USD", Currency: "USD", CurrentBalance: 100000, IsActive: true})
				_ = as.Create(ctx, &Account{ID: otherSpaceAcc, SpaceID: otherSpID, Name: "Foreign Space Account", Currency: "USD", CurrentBalance: 0, IsActive: true})
			},
			wantErr:     true,
			errContains: "destination account",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			settingsStore := &mockSettingsStore{data: make(map[SpaceID]*FinanceSettings)}
			_ = settingsStore.Create(ctx, &FinanceSettings{SpaceID: spID, BaseCurrency: "USD"})
			_ = settingsStore.Create(ctx, &FinanceSettings{SpaceID: otherSpID, BaseCurrency: "USD"})

			rateStore := &mockExchangeRateStore{rates: make(map[string]*ExchangeRate)}
			_ = rateStore.Create(ctx, &ExchangeRate{
				SpaceID:      spID,
				FromCurrency: "EUR",
				ToCurrency:   "USD",
				Rate:         1.08,
				RateDate:     time.Now().UTC(),
			})

			accountStore := &mockAccountStore{data: make(map[AccountID]*Account)}
			tt.setupAccounts(accountStore)

			transactionStore := &mockTransactionStore{txns: make(map[TransactionID]*Transaction)}
			transferStore := &mockTransferStore{data: make(map[TransferID]*Transfer)}

			svc := NewService(Dependencies{
				SettingsStore:         settingsStore,
				ExchangeRateStore:     rateStore,
				AccountStore:          accountStore,
				TransactionStore:      transactionStore,
				TransferStore:         transferStore,
				TransactionEventStore: &mockTransactionEventStore{events: make(map[TransactionEventID]*TransactionEvent)},
			})

			res, err := svc.CreateTransfer(ctx, tt.transfer)
			if tt.wantErr {
				if err == nil {
					t.Fatalf("expected error containing %q, got nil", tt.errContains)
				}
				if !strings.Contains(err.Error(), tt.errContains) {
					t.Fatalf("error = %v, want error containing %q", err, tt.errContains)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected CreateTransfer error: %v", err)
			}

			// Verify balances
			srcAcc, _ := accountStore.GetByID(ctx, spID, tt.transfer.SourceAccountID)
			if srcAcc.CurrentBalance != tt.expectedSrcBalance {
				t.Errorf("Source account balance = %d, want %d", srcAcc.CurrentBalance, tt.expectedSrcBalance)
			}

			dstAcc, _ := accountStore.GetByID(ctx, spID, tt.transfer.DestinationAccountID)
			if dstAcc.CurrentBalance != tt.expectedDstBalance {
				t.Errorf("Destination account balance = %d, want %d", dstAcc.CurrentBalance, tt.expectedDstBalance)
			}

			// Verify transaction legs
			var outflow, inflow *Transaction
			for _, tx := range transactionStore.txns {
				if tx.Metadata.TransferID != nil && *tx.Metadata.TransferID == res.ID {
					if tx.Type == TransactionTypeTransferOut {
						outflow = tx
					} else if tx.Type == TransactionTypeTransferIn {
						inflow = tx
					}
				}
			}
			if outflow == nil || inflow == nil {
				t.Fatalf("expected both outflow and inflow transaction legs created")
			}
			if *outflow.Metadata.CounterpartAccountID != tt.transfer.DestinationAccountID {
				t.Errorf("outflow counterpart = %s, want %s", *outflow.Metadata.CounterpartAccountID, tt.transfer.DestinationAccountID)
			}
			if *inflow.Metadata.CounterpartAccountID != tt.transfer.SourceAccountID {
				t.Errorf("inflow counterpart = %s, want %s", *inflow.Metadata.CounterpartAccountID, tt.transfer.SourceAccountID)
			}
		})
	}
}

func TestService_DeleteTransfer(t *testing.T) {
	ctx := context.Background()
	spIDStr, _ := id.Generate("spc_")
	spID := SpaceID(spIDStr)

	srcAccID, _ := NewAccountID()
	dstAccID, _ := NewAccountID()

	tests := []struct {
		name        string
		transferID  TransferID
		setupData   func(svc *Service, accStore *mockAccountStore) TransferID
		wantErr     bool
		errContains string
	}{
		{
			name: "Success - Delete Existing Transfer & Roll Back Balances",
			setupData: func(svc *Service, as *mockAccountStore) TransferID {
				_ = as.Create(ctx, &Account{ID: srcAccID, SpaceID: spID, Name: "Checking", Currency: "USD", CurrentBalance: 100000, IsActive: true})
				_ = as.Create(ctx, &Account{ID: dstAccID, SpaceID: spID, Name: "Savings", Currency: "USD", CurrentBalance: 0, IsActive: true})
				tr, _ := svc.CreateTransfer(ctx, &Transfer{
					SpaceID:              spID,
					SourceAccountID:      srcAccID,
					DestinationAccountID: dstAccID,
					SourceAmount:         30000,
					DestinationAmount:    30000,
					TransferDate:         time.Now().UTC(),
				})
				return tr.ID
			},
			wantErr: false,
		},
		{
			name: "Err - Transfer Not Found",
			setupData: func(svc *Service, as *mockAccountStore) TransferID {
				dummyID, _ := NewTransferID()
				return dummyID
			},
			wantErr:     true,
			errContains: "transfer not found",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			settingsStore := &mockSettingsStore{data: make(map[SpaceID]*FinanceSettings)}
			_ = settingsStore.Create(ctx, &FinanceSettings{SpaceID: spID, BaseCurrency: "USD"})

			accountStore := &mockAccountStore{data: make(map[AccountID]*Account)}
			transactionStore := &mockTransactionStore{txns: make(map[TransactionID]*Transaction)}
			transferStore := &mockTransferStore{data: make(map[TransferID]*Transfer)}

			svc := NewService(Dependencies{
				SettingsStore:         settingsStore,
				AccountStore:          accountStore,
				TransactionStore:      transactionStore,
				TransferStore:         transferStore,
				TransactionEventStore: &mockTransactionEventStore{events: make(map[TransactionEventID]*TransactionEvent)},
			})

			targetID := tt.setupData(svc, accountStore)

			err := svc.DeleteTransfer(ctx, spID, targetID)
			if tt.wantErr {
				if err == nil {
					t.Fatalf("expected error containing %q, got nil", tt.errContains)
				}
				if !strings.Contains(err.Error(), tt.errContains) {
					t.Fatalf("error = %v, want error containing %q", err, tt.errContains)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected DeleteTransfer error: %v", err)
			}

			// Assert Transfer record deleted
			_, err = transferStore.GetByID(ctx, spID, targetID)
			if err == nil {
				t.Errorf("expected transfer record to be deleted")
			}

			// Assert Account Balances restored ($1000 and $0)
			sAcc, _ := accountStore.GetByID(ctx, spID, srcAccID)
			if sAcc.CurrentBalance != 100000 {
				t.Errorf("Source account balance after deletion = %d, want 100000", sAcc.CurrentBalance)
			}
			dAcc, _ := accountStore.GetByID(ctx, spID, dstAccID)
			if dAcc.CurrentBalance != 0 {
				t.Errorf("Destination account balance after deletion = %d, want 0", dAcc.CurrentBalance)
			}
		})
	}
}

func TestService_GetAndListTransfers(t *testing.T) {
	ctx := context.Background()
	spIDStr, _ := id.Generate("spc_")
	spID := SpaceID(spIDStr)

	settingsStore := &mockSettingsStore{data: make(map[SpaceID]*FinanceSettings)}
	_ = settingsStore.Create(ctx, &FinanceSettings{SpaceID: spID, BaseCurrency: "USD"})

	accountStore := &mockAccountStore{data: make(map[AccountID]*Account)}
	transactionStore := &mockTransactionStore{txns: make(map[TransactionID]*Transaction)}
	transferStore := &mockTransferStore{data: make(map[TransferID]*Transfer)}

	svc := NewService(Dependencies{
		SettingsStore:         settingsStore,
		AccountStore:          accountStore,
		TransactionStore:      transactionStore,
		TransferStore:         transferStore,
		TransactionEventStore: &mockTransactionEventStore{events: make(map[TransactionEventID]*TransactionEvent)},
	})

	srcAccID, _ := NewAccountID()
	dstAccID, _ := NewAccountID()

	srcAcc := &Account{
		ID:             srcAccID,
		SpaceID:        spID,
		Name:           "Checking",
		Currency:       Currency("USD"),
		CurrentBalance: 100000,
		IsActive:       true,
	}
	dstAcc := &Account{
		ID:             dstAccID,
		SpaceID:        spID,
		Name:           "Savings",
		Currency:       Currency("USD"),
		CurrentBalance: 0,
		IsActive:       true,
	}
	_ = accountStore.Create(ctx, srcAcc)
	_ = accountStore.Create(ctx, dstAcc)

	tr, err := svc.CreateTransfer(ctx, &Transfer{
		SpaceID:              spID,
		SourceAccountID:      srcAcc.ID,
		DestinationAccountID: dstAcc.ID,
		SourceAmount:         15000,
		DestinationAmount:    15000,
		TransferDate:         time.Now().UTC(),
	})
	if err != nil {
		t.Fatalf("CreateTransfer failed: %v", err)
	}

	// Test GetTransfer
	fetched, err := svc.GetTransfer(ctx, spID, tr.ID)
	if err != nil {
		t.Fatalf("GetTransfer failed: %v", err)
	}
	if fetched.ID != tr.ID {
		t.Errorf("GetTransfer ID = %s, want %s", fetched.ID, tr.ID)
	}

	// Test ListTransfers
	list, _, err := svc.ListTransfers(ctx, spID, 10, "")
	if err != nil {
		t.Fatalf("ListTransfers failed: %v", err)
	}
	if len(list) != 1 {
		t.Errorf("ListTransfers count = %d, want 1", len(list))
	}
}
