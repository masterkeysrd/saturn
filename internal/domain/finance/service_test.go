package finance

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/id"
	"github.com/segmentio/ksuid"
)

// --- Test Cases ---

func TestUpdateBudget(t *testing.T) {
	ctx := context.Background()
	spaceID := SpaceID("spc_2dE1V8ZqWz4eS2N9yX3bL1mK7pO")
	bID, _ := NewBudgetID()

	budgetStore := newBudgetStoreMock(nil)
	settingsStore := newSettingsStoreMock(nil)
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
			name: "stale version returns VersionMismatch",
			update: &Budget{
				ID:          bID,
				SpaceID:     spaceID,
				Name:        "Stale Update",
				LimitAmount: 40000,
				Version:     1,
			},
			wantErr: errors.E(errors.Conflict, VersionMismatch),
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

	budgetStore := newBudgetStoreMock(nil)
	txnStore := newTransactionStoreMock(nil)
	schedStore := newScheduledTransactionStoreMock(nil)

	_ = budgetStore.Create(ctx, &Budget{ID: bIDClean, SpaceID: spaceID, Name: "Clean Budget", Status: BudgetStatusActive})
	_ = budgetStore.Create(ctx, &Budget{ID: bIDTxns, SpaceID: spaceID, Name: "Txn Budget", Status: BudgetStatusActive})
	_ = budgetStore.Create(ctx, &Budget{ID: bIDSched, SpaceID: spaceID, Name: "Sched Budget", Status: BudgetStatusActive})

	_ = txnStore.Create(ctx, &Transaction{
		ID:       TransactionID("txn_1"),
		SpaceID:  spaceID,
		BudgetID: &bIDTxns,
		Type:     TransactionTypeExpense,
		Amount:   500,
	})

	_ = schedStore.Create(ctx, &ScheduledTransaction{
		ID:       ScheduledTransactionID("sch_1"),
		SpaceID:  spaceID,
		BudgetID: &bIDSched,
		Status:   ScheduledTransactionPending,
		Type:     TransactionTypeExpense,
	})

	svc := NewService(Dependencies{
		BudgetStore:               budgetStore,
		TransactionStore:          txnStore,
		ScheduledTransactionStore: schedStore,
	})

	tests := []struct {
		name    string
		bID     BudgetID
		wantErr error
	}{
		{
			name:    "deleting budget with active transactions fails",
			bID:     bIDTxns,
			wantErr: errors.E(errors.Precondition, BudgetHasTransactions),
		},
		{
			name:    "deleting budget with active scheduled payments fails",
			bID:     bIDSched,
			wantErr: errors.E(errors.Precondition, BudgetHasScheduledTransactions),
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

func TestGetScheduledTransaction(t *testing.T) {
	ctx := context.Background()
	spaceID := SpaceID("spc_2dE1V8ZqWz4eS2N9yX3bL1mK7pO")
	spID := ScheduledTransactionID("sch_2dE1V8ZqWz4eS2N9yX3bL1mK7pO")

	mockStore := newScheduledTransactionStoreMock(map[ScheduledTransactionID]*ScheduledTransaction{
		spID: {
			ID:       spID,
			SpaceID:  spaceID,
			Amount:   1500,
			Currency: Currency("USD"),
			Status:   ScheduledTransactionPending,
			Type:     TransactionTypeExpense,
		},
	})

	svc := NewService(Dependencies{
		ScheduledTransactionStore: mockStore,
	})

	tests := []struct {
		name    string
		spaceID SpaceID
		id      ScheduledTransactionID
		wantErr bool
	}{
		{
			name:    "valid query returns scheduled transaction",
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
			name:    "invalid scheduled transaction ID returns validation error",
			spaceID: spaceID,
			id:      ScheduledTransactionID("invalid"),
			wantErr: true,
		},
		{
			name:    "missing scheduled transaction returns not found error",
			spaceID: spaceID,
			id:      ScheduledTransactionID("sch_2dE1V8ZqWz4eS2N9yX3bL999999"),
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := svc.GetScheduledTransaction(ctx, tt.spaceID, tt.id)
			if tt.wantErr {
				if err == nil {
					t.Errorf("GetScheduledTransaction expected error, got nil")
				}
			} else {
				if err != nil {
					t.Errorf("unexpected GetScheduledTransaction error: %v", err)
				}
				if got == nil || got.ID != spID {
					t.Errorf("GetScheduledTransaction got = %v, want ID %s", got, spID)
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

	budgetStore := newBudgetStoreMock(nil)
	settingsStore := newSettingsStoreMock(nil)
	periodStore := newPeriodStoreMock(nil)
	rateStore := newExchangeRateStoreMock(nil)

	_ = settingsStore.Create(ctx, &FinanceSettings{SpaceID: spaceID, BaseCurrency: "USD"})
	_ = budgetStore.Create(ctx, &Budget{
		ID:          bID,
		SpaceID:     spaceID,
		Name:        "Travel EUR",
		LimitAmount: 100000,
		Currency:    "EUR",
		Interval:    IntervalMonthly,
		Status:      BudgetStatusActive,
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
	settingsStore := newSettingsStoreMock(nil)
	svc := NewService(Dependencies{
		SettingsStore:         settingsStore,
		AccountStore:          newAccountStoreMock(nil),
		TransferStore:         newTransferStoreMock(nil),
		TransactionEventStore: newTransactionEventStoreMock(nil),
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
	settingsStore := newSettingsStoreMock(nil)
	budgetStore := newBudgetStoreMock(nil)
	periodStore := newPeriodStoreMock(nil)
	rateStore := newExchangeRateStoreMock(nil)

	txnStore := newTransactionStoreMock(nil)

	svc := NewService(Dependencies{
		SettingsStore:         settingsStore,
		BudgetStore:           budgetStore,
		PeriodStore:           periodStore,
		ExchangeRateStore:     rateStore,
		TransactionStore:      txnStore,
		InsightsStore:         newInsightsStoreMock(nil, nil, nil, nil, nil, nil, nil),
		AccountStore:          newAccountStoreMock(nil),
		TransferStore:         newTransferStoreMock(nil),
		TransactionEventStore: newTransactionEventStoreMock(nil),
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
	settingsStore := newSettingsStoreMock(nil)
	budgetStore := newBudgetStoreMock(nil)
	periodStore := newPeriodStoreMock(nil)
	rateStore := newExchangeRateStoreMock(nil)
	txnStore := newTransactionStoreMock(nil)

	svc := NewService(Dependencies{
		SettingsStore:         settingsStore,
		BudgetStore:           budgetStore,
		PeriodStore:           periodStore,
		ExchangeRateStore:     rateStore,
		TransactionStore:      txnStore,
		InsightsStore:         newInsightsStoreMock(nil, nil, nil, nil, nil, nil, nil),
		AccountStore:          newAccountStoreMock(nil),
		TransferStore:         newTransferStoreMock(nil),
		TransactionEventStore: newTransactionEventStoreMock(nil),
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

	// 4. Create an expense of 10.00 EUR (1000 cents) on Feb 15 with mock metadata
	targetDate := time.Date(2026, 2, 15, 12, 0, 0, 0, time.UTC)
	schedID := ScheduledTransactionID("sctx_123")
	txn := &Transaction{
		SpaceID:         spID,
		BudgetID:        &budget.ID,
		Amount:          1000,
		Currency:        Currency("EUR"),
		Description:     "Dinner",
		TransactionDate: targetDate,
		Metadata: TransactionMetadata{
			ScheduledTransactionID: &schedID,
		},
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

	// Update the expense: simulate the coordinator by instantiating a clean Transaction struct without metadata
	updateTxnInput := &Transaction{
		ID:              createdTxn.ID,
		SpaceID:         createdTxn.SpaceID,
		BudgetID:        createdTxn.BudgetID,
		Amount:          1500,
		Currency:        createdTxn.Currency,
		Description:     createdTxn.Description,
		TransactionDate: createdTxn.TransactionDate,
		EffectiveDate:   createdTxn.EffectiveDate,
		AccountID:       createdTxn.AccountID,
	}
	updatedTxn, err := svc.UpdateExpense(ctx, updateTxnInput)
	if err != nil {
		t.Fatal(err)
	}

	if updatedTxn.AmountInBase != 1650 { // 1500 * 1.10 = 1650
		t.Errorf("Updated AmountInBase = %d, want 1650", updatedTxn.AmountInBase)
	}

	if updatedTxn.Metadata.ScheduledTransactionID == nil || *updatedTxn.Metadata.ScheduledTransactionID != "sctx_123" {
		t.Errorf("Metadata was lost or wiped during UpdateExpense: %+v", updatedTxn.Metadata)
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

	rateStore := newExchangeRateStoreMock(nil)
	settingsStore := newSettingsStoreMock(nil)

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

	accountStore := newAccountStoreMock(nil)
	txnData := make(map[TransactionID]*Transaction)
	txnStore := newTransactionStoreMock(txnData)
	settingsStore := newSettingsStoreMock(nil)
	eventStore := newTransactionEventStoreMock(nil)

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
	if len(txnData) != 1 {
		t.Fatalf("expected 1 logged transaction, got %d", len(txnData))
	}

	var loggedTxn *Transaction
	for _, tx := range txnData {
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
	spIDStr, _ := id.Generate("spc_")
	spaceID := SpaceID(spIDStr)
	accID, _ := NewAccountID()
	borID, _ := NewBorrowingID()

	accountStore := newAccountStoreMock(nil)
	txnStore := newTransactionStoreMock(nil)
	borrowingStore := newBorrowingStoreMock(nil)
	settingsStore := newSettingsStoreMock(nil)

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

	txnResult, err := svc.LogBorrowingTransaction(ctx, LogBorrowingTransactionRequest{
		BorrowingID:     borID,
		SpaceID:         spaceID,
		Type:            BorrowingTransactionTypePayment,
		Amount:          3000, // $30.00 repayment
		TransactionDate: time.Now().UTC(),
		AccountID:       &accID,
		Notes:           "Part payment from John",
	})
	if err != nil {
		t.Fatalf("LogBorrowingTransaction failed: %v", err)
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
	txn, err := txnStore.GetByID(ctx, spaceID, txnResult.ID)
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
	spIDStr, _ := id.Generate("spc_")
	spaceID := SpaceID(spIDStr)
	accID, _ := NewAccountID()
	borID, _ := NewBorrowingID()

	accountStore := newAccountStoreMock(nil)
	txnStore := newTransactionStoreMock(nil)
	borrowingStore := newBorrowingStoreMock(nil)
	settingsStore := newSettingsStoreMock(nil)
	rateStore := newExchangeRateStoreMock(nil)

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

	txnResult, err := svc.LogBorrowingTransaction(ctx, LogBorrowingTransactionRequest{
		BorrowingID:     borID,
		SpaceID:         spaceID,
		Type:            BorrowingTransactionTypePayment,
		Amount:          1000, // $10.00 USD repayment
		TransactionDate: time.Now().UTC(),
		AccountID:       &accID,
		Notes:           "Repayment from Maria in DOP",
	})
	if err != nil {
		t.Fatalf("LogBorrowingTransaction multi-currency failed: %v", err)
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
	err = svc.DeleteBorrowingTransaction(ctx, DeleteBorrowingTransactionRequest{
		SpaceID:       spaceID,
		BorrowingID:   borID,
		TransactionID: txnResult.ID,
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

func TestAdjustBorrowingBalance(t *testing.T) {
	tests := []struct {
		name                string
		direction           BorrowingDirection
		initialTotal        int64
		initialRemaining    int64
		initialAccountBal   int64
		targetBalance       int64
		withAccount         bool
		wantRemaining       int64
		wantStatus          BorrowingStatus
		wantAccountBal      int64
		wantRepaymentsCount int
	}{
		{
			name:                "LENT: decrease remaining balance with account (INFLOW)",
			direction:           BorrowingDirectionLent,
			initialTotal:        50000,
			initialRemaining:    50000,
			initialAccountBal:   100000,
			targetBalance:       30000,
			withAccount:         true,
			wantRemaining:       30000,
			wantStatus:          BorrowingStatusActive,
			wantAccountBal:      120000, // +20000 INFLOW
			wantRepaymentsCount: 1,
		},
		{
			name:                "LENT: increase remaining balance with account (OUTFLOW)",
			direction:           BorrowingDirectionLent,
			initialTotal:        50000,
			initialRemaining:    30000,
			initialAccountBal:   120000,
			targetBalance:       45000,
			withAccount:         true,
			wantRemaining:       45000,
			wantStatus:          BorrowingStatusActive,
			wantAccountBal:      105000, // -15000 OUTFLOW
			wantRepaymentsCount: 1,
		},
		{
			name:                "BORROWED: decrease remaining balance with account (OUTFLOW)",
			direction:           BorrowingDirectionBorrowed,
			initialTotal:        50000,
			initialRemaining:    50000,
			initialAccountBal:   100000,
			targetBalance:       30000,
			withAccount:         true,
			wantRemaining:       30000,
			wantStatus:          BorrowingStatusActive,
			wantAccountBal:      80000, // -20000 OUTFLOW
			wantRepaymentsCount: 1,
		},
		{
			name:                "BORROWED: increase remaining balance with account (INFLOW)",
			direction:           BorrowingDirectionBorrowed,
			initialTotal:        50000,
			initialRemaining:    30000,
			initialAccountBal:   80000,
			targetBalance:       40000,
			withAccount:         true,
			wantRemaining:       40000,
			wantStatus:          BorrowingStatusActive,
			wantAccountBal:      90000, // +10000 INFLOW
			wantRepaymentsCount: 1,
		},
		{
			name:                "Adjust to 0 without account (PAID_OFF status)",
			direction:           BorrowingDirectionBorrowed,
			initialTotal:        100000,
			initialRemaining:    100000,
			initialAccountBal:   100000,
			targetBalance:       0,
			withAccount:         false,
			wantRemaining:       0,
			wantStatus:          BorrowingStatusPaidOff,
			wantAccountBal:      100000, // Untouched
			wantRepaymentsCount: 1,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx := context.Background()
			spIDStr, _ := id.Generate("spc_")
			spaceID := SpaceID(spIDStr)
			accID, _ := NewAccountID()
			borID, _ := NewBorrowingID()

			accData := make(map[AccountID]*Account)
			accountStore := newAccountStoreMock(accData)
			txnData := make(map[TransactionID]*Transaction)
			txnStore := newTransactionStoreMock(txnData)
			borrowingStore := newBorrowingStoreMock(nil)
			settingsStore := newSettingsStoreMock(nil)

			_ = settingsStore.Create(ctx, &FinanceSettings{SpaceID: spaceID, BaseCurrency: "USD"})
			_ = accountStore.Create(ctx, &Account{
				ID:             accID,
				SpaceID:        spaceID,
				Name:           "Checking",
				Type:           AccountTypeBank,
				Currency:       "USD",
				CurrentBalance: tt.initialAccountBal,
				IsActive:       true,
			})
			_ = borrowingStore.Create(ctx, &Borrowing{
				ID:              borID,
				SpaceID:         spaceID,
				Direction:       tt.direction,
				Counterparty:    "Test Party",
				TotalAmount:     tt.initialTotal,
				RemainingAmount: tt.initialRemaining,
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

			var accIDPtr *AccountID
			if tt.withAccount {
				accIDPtr = &accID
			}

			adjusted, err := svc.AdjustBorrowingBalance(ctx, AdjustBorrowingBalanceRequest{
				SpaceID:       spaceID,
				BorrowingID:   borID,
				TargetBalance: tt.targetBalance,
				Note:          "Table test adjustment",
				AccountID:     accIDPtr,
			})
			if err != nil {
				t.Fatalf("AdjustBorrowingBalance failed: %v", err)
			}

			if adjusted.RemainingAmount != tt.wantRemaining {
				t.Errorf("RemainingAmount = %d, want %d", adjusted.RemainingAmount, tt.wantRemaining)
			}
			if adjusted.Status != tt.wantStatus {
				t.Errorf("Status = %s, want %s", adjusted.Status, tt.wantStatus)
			}

			acc, _ := accountStore.GetByID(ctx, spaceID, accID)
			if acc.CurrentBalance != tt.wantAccountBal {
				t.Errorf("Account balance = %d, want %d", acc.CurrentBalance, tt.wantAccountBal)
			}

			page, err := txnStore.ListBySpace(ctx, spaceID, &TransactionFilter{
				BorrowingID:    &borID,
				BorrowingRoles: []string{"REPAYMENT", "DISBURSEMENT", "ADJUSTMENT"},
			})
			if err != nil {
				t.Fatalf("ListBySpace failed: %v", err)
			}
			if len(page.Items) != tt.wantRepaymentsCount {
				t.Errorf("Repayments length = %d, want %d", len(page.Items), tt.wantRepaymentsCount)
			}

			// Verify base currency amount calculation on the generated adjustment transaction
			for _, txn := range txnData {
				if txn.Metadata.BorrowingRole == "ADJUSTMENT" {
					if txn.AmountInBase == 0 {
						t.Errorf("Adjustment transaction AmountInBase is 0, expected non-zero base currency amount")
					}
				}
			}
		})
	}
}

func TestLogAndUpdateBorrowingTransaction(t *testing.T) {
	tests := []struct {
		name                 string
		direction            BorrowingDirection
		initialTotal         int64
		initialRemaining     int64
		txType               BorrowingTransactionType
		amount               int64
		wantRemaining        int64
		wantTotal            int64
		wantAccountBalImpact int64 // Delta on account (Positive = Inflow, Negative = Outflow)
	}{
		{
			name:                 "LENT PAYMENT: Reduces debt & adds INFLOW to bank (+200)",
			direction:            BorrowingDirectionLent,
			initialTotal:         50000,
			initialRemaining:     50000,
			txType:               BorrowingTransactionTypePayment,
			amount:               20000,
			wantRemaining:        30000,
			wantTotal:            50000,
			wantAccountBalImpact: 20000,
		},
		{
			name:                 "LENT DISBURSEMENT: Increases debt & TotalAmount, adds OUTFLOW to bank (-100)",
			direction:            BorrowingDirectionLent,
			initialTotal:         50000,
			initialRemaining:     30000,
			txType:               BorrowingTransactionTypeDisbursement,
			amount:               10000,
			wantRemaining:        40000,
			wantTotal:            60000,
			wantAccountBalImpact: -10000,
		},
		{
			name:                 "BORROWED PAYMENT: Reduces debt & adds OUTFLOW to bank (-150)",
			direction:            BorrowingDirectionBorrowed,
			initialTotal:         50000,
			initialRemaining:     50000,
			txType:               BorrowingTransactionTypePayment,
			amount:               15000,
			wantRemaining:        35000,
			wantTotal:            50000,
			wantAccountBalImpact: -15000,
		},
		{
			name:                 "BORROWED DISBURSEMENT: Increases debt & TotalAmount, adds INFLOW to bank (+300)",
			direction:            BorrowingDirectionBorrowed,
			initialTotal:         50000,
			initialRemaining:     35000,
			txType:               BorrowingTransactionTypeDisbursement,
			amount:               30000,
			wantRemaining:        65000,
			wantTotal:            80000,
			wantAccountBalImpact: 30000,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx := context.Background()
			spIDStr, _ := id.Generate("spc_")
			spaceID := SpaceID(spIDStr)
			accID, _ := NewAccountID()
			borID, _ := NewBorrowingID()

			accountStore := newAccountStoreMock(nil)
			txnStore := newTransactionStoreMock(nil)
			borrowingStore := newBorrowingStoreMock(nil)
			settingsStore := newSettingsStoreMock(nil)

			_ = settingsStore.Create(ctx, &FinanceSettings{SpaceID: spaceID, BaseCurrency: "USD"})
			_ = accountStore.Create(ctx, &Account{
				ID:             accID,
				SpaceID:        spaceID,
				Name:           "Checking",
				Type:           AccountTypeBank,
				Currency:       "USD",
				CurrentBalance: 100000, // $1,000.00
				IsActive:       true,
			})
			_ = borrowingStore.Create(ctx, &Borrowing{
				ID:              borID,
				SpaceID:         spaceID,
				Direction:       tt.direction,
				Counterparty:    "Test Counterparty",
				TotalAmount:     tt.initialTotal,
				RemainingAmount: tt.initialRemaining,
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

			// 1. Log borrowing transaction
			rep, err := svc.LogBorrowingTransaction(ctx, LogBorrowingTransactionRequest{
				SpaceID:     spaceID,
				BorrowingID: borID,
				Type:        tt.txType,
				Amount:      tt.amount,
				AccountID:   &accID,
				Notes:       "Test transaction",
			})
			if err != nil {
				t.Fatalf("LogBorrowingTransaction failed: %v", err)
			}

			// Verify updated borrowing balances
			b, _ := borrowingStore.GetByID(ctx, spaceID, borID)
			if b.RemainingAmount != tt.wantRemaining {
				t.Errorf("RemainingAmount = %d, want %d", b.RemainingAmount, tt.wantRemaining)
			}
			if b.TotalAmount != tt.wantTotal {
				t.Errorf("TotalAmount = %d, want %d", b.TotalAmount, tt.wantTotal)
			}

			// Verify account balance impact
			acc, _ := accountStore.GetByID(ctx, spaceID, accID)
			wantAccBal := 100000 + tt.wantAccountBalImpact
			if acc.CurrentBalance != wantAccBal {
				t.Errorf("Account balance = %d, want %d", acc.CurrentBalance, wantAccBal)
			}

			// 2. Test DeleteBorrowingTransaction (reverts everything back)
			err = svc.DeleteBorrowingTransaction(ctx, DeleteBorrowingTransactionRequest{
				SpaceID:       spaceID,
				BorrowingID:   borID,
				TransactionID: TransactionID(rep.ID),
			})
			if err != nil {
				t.Fatalf("DeleteBorrowingTransaction failed: %v", err)
			}

			bRestored, _ := borrowingStore.GetByID(ctx, spaceID, borID)
			if bRestored.RemainingAmount != tt.initialRemaining {
				t.Errorf("Restored RemainingAmount = %d, want %d", bRestored.RemainingAmount, tt.initialRemaining)
			}
			if bRestored.TotalAmount != tt.initialTotal {
				t.Errorf("Restored TotalAmount = %d, want %d", bRestored.TotalAmount, tt.initialTotal)
			}

			accRestored, _ := accountStore.GetByID(ctx, spaceID, accID)
			if accRestored.CurrentBalance != 100000 {
				t.Errorf("Restored account balance = %d, want 100000", accRestored.CurrentBalance)
			}
		})
	}
}

func TestDeleteBorrowingAdjustment(t *testing.T) {
	ctx := context.Background()
	spIDStr, _ := id.Generate("spc_")
	spaceID := SpaceID(spIDStr)
	borID, _ := NewBorrowingID()

	txnStore := newTransactionStoreMock(nil)
	borrowingStore := newBorrowingStoreMock(nil)
	settingsStore := newSettingsStoreMock(nil)

	_ = settingsStore.Create(ctx, &FinanceSettings{SpaceID: spaceID, BaseCurrency: "USD"})
	_ = borrowingStore.Create(ctx, &Borrowing{
		ID:              borID,
		SpaceID:         spaceID,
		Direction:       BorrowingDirectionLent,
		Counterparty:    "Charlie",
		TotalAmount:     50000, // $500.00
		RemainingAmount: 50000, // $500.00
		Currency:        "USD",
		Status:          BorrowingStatusActive,
		EstablishedAt:   time.Now().UTC(),
	})

	svc := NewService(Dependencies{
		SettingsStore:    settingsStore,
		BorrowingStore:   borrowingStore,
		TransactionStore: txnStore,
	})

	// Perform adjustment from 50000 down to 20000
	_, err := svc.AdjustBorrowingBalance(ctx, AdjustBorrowingBalanceRequest{
		SpaceID:       spaceID,
		BorrowingID:   borID,
		TargetBalance: 20000,
		Note:          "Test Adjustment",
	})
	if err != nil {
		t.Fatalf("AdjustBorrowingBalance failed: %v", err)
	}

	page, _ := txnStore.ListBySpace(ctx, spaceID, &TransactionFilter{
		BorrowingID:    &borID,
		BorrowingRoles: []string{"ADJUSTMENT"},
	})
	if len(page.Items) != 1 {
		t.Fatalf("Expected 1 adjustment record, got %d", len(page.Items))
	}

	// Delete the adjustment record
	err = svc.DeleteBorrowingTransaction(ctx, DeleteBorrowingTransactionRequest{
		SpaceID:       spaceID,
		BorrowingID:   borID,
		TransactionID: page.Items[0].ID,
	})
	if err != nil {
		t.Fatalf("DeleteBorrowingRepayment for adjustment failed: %v", err)
	}

	// Verify RemainingAmount is restored back to 50000
	b, _ := borrowingStore.GetByID(ctx, spaceID, borID)
	if b.RemainingAmount != 50000 {
		t.Errorf("RemainingAmount after adjustment deletion = %d, want 50000", b.RemainingAmount)
	}
}

func TestDeleteBorrowing_BlockedWhenTransactionsExist(t *testing.T) {
	ctx := context.Background()
	rawSpace, _ := id.Generate("spc_")
	spaceID := SpaceID(rawSpace)

	settingsStore := newSettingsStoreMock(nil)
	_ = settingsStore.Create(ctx, &FinanceSettings{SpaceID: spaceID, BaseCurrency: "USD"})

	borrowingStore := newBorrowingStoreMock(nil)
	txnStore := newTransactionStoreMock(nil)

	svc := NewService(Dependencies{
		SettingsStore:    settingsStore,
		BorrowingStore:   borrowingStore,
		TransactionStore: txnStore,
	})

	// Create borrowing without transaction
	b, err := svc.CreateBorrowing(ctx, &Borrowing{
		SpaceID:         spaceID,
		Direction:       BorrowingDirectionLent,
		Counterparty:    "Frank",
		TotalAmount:     50000,
		RemainingAmount: 50000,
		Currency:        "USD",
		EstablishedAt:   time.Now().UTC(),
	}, false)
	if err != nil {
		t.Fatalf("CreateBorrowing failed: %v", err)
	}

	// 1. Can delete when no transactions exist
	if err := svc.DeleteBorrowing(ctx, spaceID, b.ID); err != nil {
		t.Fatalf("DeleteBorrowing failed when no transactions exist: %v", err)
	}

	// 2. Re-create borrowing with initial transaction
	b2, err := svc.CreateBorrowing(ctx, &Borrowing{
		SpaceID:         spaceID,
		Direction:       BorrowingDirectionLent,
		Counterparty:    "Grace",
		TotalAmount:     50000,
		RemainingAmount: 5000,
		Currency:        "USD",
		EstablishedAt:   time.Now().UTC(),
	}, true)
	if err != nil {
		t.Fatalf("CreateBorrowing with transaction failed: %v", err)
	}

	// 3. Attempt delete -> must be blocked with BorrowingHasTransactions
	err = svc.DeleteBorrowing(ctx, spaceID, b2.ID)
	if !errors.Is(err, BorrowingHasTransactions) {
		t.Fatalf("DeleteBorrowing error = %v, want code %v", err, BorrowingHasTransactions)
	}
}

func TestUpdateBorrowing(t *testing.T) {
	tests := []struct {
		name             string
		direction        BorrowingDirection
		initialTotal     int64
		initialRemaining int64
		newTotal         int64
		wantRemaining    int64
	}{
		{
			name:             "Zero payments logged: RemainingAmount auto-syncs to new TotalAmount",
			direction:        BorrowingDirectionLent,
			initialTotal:     50000,
			initialRemaining: 50000,
			newTotal:         60000,
			wantRemaining:    60000,
		},
		{
			name:             "Payments already logged: RemainingAmount stays preserved",
			direction:        BorrowingDirectionLent,
			initialTotal:     50000,
			initialRemaining: 30000,
			newTotal:         60000,
			wantRemaining:    30000,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx := context.Background()
			spIDStr, _ := id.Generate("spc_")
			spaceID := SpaceID(spIDStr)
			borID, _ := NewBorrowingID()

			txnStore := newTransactionStoreMock(nil)
			borrowingStore := newBorrowingStoreMock(nil)
			settingsStore := newSettingsStoreMock(nil)

			_ = settingsStore.Create(ctx, &FinanceSettings{SpaceID: spaceID, BaseCurrency: "USD"})
			_ = borrowingStore.Create(ctx, &Borrowing{
				ID:              borID,
				SpaceID:         spaceID,
				Direction:       tt.direction,
				Counterparty:    "Test Counterparty",
				TotalAmount:     tt.initialTotal,
				RemainingAmount: tt.initialRemaining,
				Currency:        "USD",
				Status:          BorrowingStatusActive,
				EstablishedAt:   time.Now().UTC(),
			})

			svc := NewService(Dependencies{
				SettingsStore:    settingsStore,
				BorrowingStore:   borrowingStore,
				TransactionStore: txnStore,
			})

			updated, err := svc.UpdateBorrowing(ctx, &Borrowing{
				ID:            borID,
				SpaceID:       spaceID,
				Direction:     tt.direction,
				Counterparty:  "Test Counterparty",
				TotalAmount:   tt.newTotal,
				Currency:      "USD",
				Status:        BorrowingStatusActive,
				EstablishedAt: time.Now().UTC(),
			}, nil)
			if err != nil {
				t.Fatalf("UpdateBorrowing failed: %v", err)
			}

			if updated.TotalAmount != tt.newTotal {
				t.Errorf("TotalAmount = %d, want %d", updated.TotalAmount, tt.newTotal)
			}
			if updated.RemainingAmount != tt.wantRemaining {
				t.Errorf("RemainingAmount = %d, want %d", updated.RemainingAmount, tt.wantRemaining)
			}
		})
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
		setupAccounts      func(accStore *AccountStoreMock)
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
			setupAccounts: func(as *AccountStoreMock) {
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
			setupAccounts: func(as *AccountStoreMock) {
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
			setupAccounts: func(as *AccountStoreMock) {
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
			setupAccounts: func(as *AccountStoreMock) {
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
			setupAccounts: func(as *AccountStoreMock) {
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
			setupAccounts: func(as *AccountStoreMock) {
				_ = as.Create(ctx, &Account{ID: srcUSD, SpaceID: spID, Name: "Checking USD", Currency: "USD", CurrentBalance: 100000, IsActive: true})
				_ = as.Create(ctx, &Account{ID: otherSpaceAcc, SpaceID: otherSpID, Name: "Foreign Space Account", Currency: "USD", CurrentBalance: 0, IsActive: true})
			},
			wantErr:     true,
			errContains: "destination account",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			settingsStore := newSettingsStoreMock(nil)
			_ = settingsStore.Create(ctx, &FinanceSettings{SpaceID: spID, BaseCurrency: "USD"})
			_ = settingsStore.Create(ctx, &FinanceSettings{SpaceID: otherSpID, BaseCurrency: "USD"})

			rateStore := newExchangeRateStoreMock(nil)
			_ = rateStore.Create(ctx, &ExchangeRate{
				SpaceID:      spID,
				FromCurrency: "EUR",
				ToCurrency:   "USD",
				Rate:         1.08,
				RateDate:     time.Now().UTC(),
			})

			accountStore := newAccountStoreMock(nil)
			tt.setupAccounts(accountStore)

			txnData := make(map[TransactionID]*Transaction)
			transactionStore := newTransactionStoreMock(txnData)
			transferStore := newTransferStoreMock(nil)

			svc := NewService(Dependencies{
				SettingsStore:         settingsStore,
				ExchangeRateStore:     rateStore,
				AccountStore:          accountStore,
				TransactionStore:      transactionStore,
				TransferStore:         transferStore,
				TransactionEventStore: newTransactionEventStoreMock(nil),
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
			for _, tx := range txnData {
				if tx.Metadata.TransferID != nil && *tx.Metadata.TransferID == res.ID {
					switch tx.Type {
					case TransactionTypeTransferOut:
						outflow = tx
					case TransactionTypeTransferIn:
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
		setupData   func(svc *Service, accStore *AccountStoreMock) TransferID
		wantErr     bool
		errContains string
	}{
		{
			name: "Success - Delete Existing Transfer & Roll Back Balances",
			setupData: func(svc *Service, as *AccountStoreMock) TransferID {
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
			setupData: func(svc *Service, as *AccountStoreMock) TransferID {
				dummyID, _ := NewTransferID()
				return dummyID
			},
			wantErr:     true,
			errContains: "transfer not found",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			settingsStore := newSettingsStoreMock(nil)
			_ = settingsStore.Create(ctx, &FinanceSettings{SpaceID: spID, BaseCurrency: "USD"})

			accountStore := newAccountStoreMock(nil)
			transactionStore := newTransactionStoreMock(nil)
			transferStore := newTransferStoreMock(nil)

			svc := NewService(Dependencies{
				SettingsStore:         settingsStore,
				AccountStore:          accountStore,
				TransactionStore:      transactionStore,
				TransferStore:         transferStore,
				TransactionEventStore: newTransactionEventStoreMock(nil),
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

	settingsStore := newSettingsStoreMock(nil)
	_ = settingsStore.Create(ctx, &FinanceSettings{SpaceID: spID, BaseCurrency: "USD"})

	accountStore := newAccountStoreMock(nil)
	transactionStore := newTransactionStoreMock(nil)
	transferStore := newTransferStoreMock(nil)

	svc := NewService(Dependencies{
		SettingsStore:         settingsStore,
		AccountStore:          accountStore,
		TransactionStore:      transactionStore,
		TransferStore:         transferStore,
		TransactionEventStore: newTransactionEventStoreMock(nil),
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

func TestService_ApproveInboxItem(t *testing.T) {
	ctx := context.Background()
	spIDStr, _ := id.Generate("spc_")
	spID := SpaceID(spIDStr)

	tests := []struct {
		name                 string
		docType              InboxItemDocType
		metadata             map[string]any
		linkExistingTxn      bool
		initialTxnAmount     int64
		initialTxnDesc       string
		expectedTxnAmount    int64
		expectedTxnDesc      string
		expectedTransferMade bool
		expectErr            bool
	}{
		{
			name:    "Receipt linked transaction with overwrite_linked_transaction = true",
			docType: InboxItemDocReceipt,
			metadata: map[string]any{
				"overwrite_linked_transaction": true,
			},
			linkExistingTxn:   true,
			initialTxnAmount:  1000,
			initialTxnDesc:    "Old Merchant",
			expectedTxnAmount: 4500,
			expectedTxnDesc:   "New Supermarket",
			expectErr:         false,
		},
		{
			name:    "Receipt linked transaction with overwrite_linked_transaction = false",
			docType: InboxItemDocReceipt,
			metadata: map[string]any{
				"overwrite_linked_transaction": false,
			},
			linkExistingTxn:   true,
			initialTxnAmount:  1000,
			initialTxnDesc:    "Old Merchant",
			expectedTxnAmount: 1000,
			expectedTxnDesc:   "Old Merchant",
			expectErr:         false,
		},
		{
			name:    "System verification docType resolves immediately",
			docType: InboxItemDocSystemVerification,
			metadata: map[string]any{
				"verification_code": "123456",
			},
			linkExistingTxn: false,
			expectErr:       false,
		},
		{
			name:    "Transfer transaction_type creates ledger transfer",
			docType: InboxItemDocReceipt,
			metadata: map[string]any{
				"transaction_type":       "TRANSFER",
				"destination_account_id": "DESTINATION_ACCOUNT_PLACEHOLDER",
			},
			linkExistingTxn:      false,
			expectedTransferMade: true,
			expectErr:            false,
		},
		{
			name:    "Bank Notification transfer source leg creates ledger transfer",
			docType: InboxItemDocBankNotification,
			metadata: map[string]any{
				"transaction_type":       "TRANSFER",
				"destination_account_id": "DESTINATION_ACCOUNT_PLACEHOLDER",
				"transfer_leg":           "SOURCE",
			},
			linkExistingTxn:      false,
			expectedTransferMade: true,
			expectErr:            false,
		},
		{
			name:    "Bank Notification transfer destination leg creates ledger transfer",
			docType: InboxItemDocBankNotification,
			metadata: map[string]any{
				"transaction_type":       "TRANSFER",
				"destination_account_id": "DESTINATION_ACCOUNT_PLACEHOLDER",
				"transfer_leg":           "DESTINATION",
			},
			linkExistingTxn:      false,
			expectedTransferMade: true,
			expectErr:            false,
		},
		{
			name:    "Bank Notification standalone income",
			docType: InboxItemDocBankNotification,
			metadata: map[string]any{
				"transaction_type": "INCOME",
			},
			linkExistingTxn: false,
			expectErr:       false,
		},
		{
			name:    "Bank Notification standalone expense",
			docType: InboxItemDocBankNotification,
			metadata: map[string]any{
				"transaction_type": "EXPENSE",
			},
			linkExistingTxn: false,
			expectErr:       false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			settingsStore := newSettingsStoreMock(nil)
			_ = settingsStore.Create(ctx, &FinanceSettings{SpaceID: spID, BaseCurrency: Currency("USD")})

			accountStore := newAccountStoreMock(nil)
			srcAccID, _ := NewAccountID()
			srcAcc := &Account{
				ID:             srcAccID,
				SpaceID:        spID,
				Name:           "Checking",
				Currency:       Currency("USD"),
				CurrentBalance: 100000,
				IsActive:       true,
			}
			_ = accountStore.Create(ctx, srcAcc)

			dstAccID, _ := NewAccountID()
			dstAcc := &Account{
				ID:             dstAccID,
				SpaceID:        spID,
				Name:           "Savings",
				Currency:       Currency("USD"),
				CurrentBalance: 0,
				IsActive:       true,
			}
			_ = accountStore.Create(ctx, dstAcc)

			budgetStore := newBudgetStoreMock(nil)
			bID, _ := NewBudgetID()
			bg := &Budget{
				ID:          bID,
				SpaceID:     spID,
				Name:        "General",
				LimitAmount: 50000,
				Currency:    Currency("USD"),
			}
			_ = budgetStore.Create(ctx, bg)

			periodStore := newPeriodStoreMock(nil)

			txnStore := newTransactionStoreMock(nil)
			eventStore := newTransactionEventStoreMock(nil)
			transferData := make(map[TransferID]*Transfer)
			transferStore := newTransferStoreMock(transferData)
			scheduledStore := newScheduledTransactionStoreMock(nil)
			inboxStore := newInboxItemStoreMock(nil)

			svc := NewService(Dependencies{
				SettingsStore:             settingsStore,
				AccountStore:              accountStore,
				TransactionStore:          txnStore,
				TransactionEventStore:     eventStore,
				TransferStore:             transferStore,
				ScheduledTransactionStore: scheduledStore,
				InboxItemStore:            inboxStore,
				BudgetStore:               budgetStore,
				PeriodStore:               periodStore,
			})

			// Prepare metadata overrides with valid destination account ID
			metadata := make(map[string]any)
			for k, v := range tt.metadata {
				if v == "DESTINATION_ACCOUNT_PLACEHOLDER" {
					metadata[k] = string(dstAccID)
				} else {
					metadata[k] = v
				}
			}

			// Stage item
			srcAccStr := string(srcAccID)
			bIDStr := string(bID)
			staged, err := svc.StageInboxItem(ctx, spID, &StageInboxItem{
				DocType:    tt.docType,
				Vendor:     "New Supermarket",
				Amount:     4500,
				Currency:   "USD",
				AccountID:  &srcAccStr,
				RawPayload: "{}",
				Metadata:   metadata,
			})
			if err != nil {
				t.Fatalf("StageInboxItem failed: %v", err)
			}
			if err != nil {
				t.Fatalf("StageInboxItem failed: %v", err)
			}
			staged.BudgetID = &bIDStr
			_, _ = svc.UpdateInboxItem(ctx, spID, staged)

			var existingTxnID TransactionID
			if tt.linkExistingTxn {
				existingTxnID, _ = NewTransactionID()
				txn := &Transaction{
					ID:              existingTxnID,
					SpaceID:         spID,
					AccountID:       &srcAccID,
					Amount:          tt.initialTxnAmount,
					Currency:        Currency("USD"),
					Description:     tt.initialTxnDesc,
					TransactionDate: time.Now().UTC(),
				}
				_ = txnStore.Create(ctx, txn)

				txnIDStr := string(existingTxnID)
				staged.TransactionID = &txnIDStr
				_, _ = svc.UpdateInboxItem(ctx, spID, staged)
			}

			_, err = svc.ApproveInboxItem(ctx, spID, staged.ID)
			if (err != nil) != tt.expectErr {
				t.Fatalf("ApproveInboxItem error = %v, expectErr = %v", err, tt.expectErr)
			}

			if tt.linkExistingTxn && !tt.expectErr {
				updatedTxn, err := txnStore.GetByID(ctx, spID, existingTxnID)
				if err != nil {
					t.Fatalf("GetByID failed: %v", err)
				}
				if updatedTxn.Amount != tt.expectedTxnAmount {
					t.Errorf("Txn Amount = %d, want %d", updatedTxn.Amount, tt.expectedTxnAmount)
				}
				if updatedTxn.Description != tt.expectedTxnDesc {
					t.Errorf("Txn Description = %q, want %q", updatedTxn.Description, tt.expectedTxnDesc)
				}
			}

			if tt.expectedTransferMade {
				if len(transferData) != 1 {
					t.Errorf("Transfer count = %d, want 1", len(transferData))
				}
			}

			// Verify status marked resolved
			finalItem, err := inboxStore.Get(ctx, spID, staged.ID)
			if err != nil {
				t.Fatalf("Get inbox item failed: %v", err)
			}
			if finalItem.Status != InboxItemResolved {
				t.Errorf("InboxItem Status = %s, want %s", finalItem.Status, InboxItemResolved)
			}
		})
	}
}

func TestService_SystemVerification(t *testing.T) {
	ctx := context.Background()
	spIDStr, _ := id.Generate("spc_")
	spID := SpaceID(spIDStr)

	tests := []struct {
		name     string
		action   string // "approve" or "discard"
		docType  InboxItemDocType
		metadata map[string]any
	}{
		{
			name:    "Approve system verification email resolves without ledger changes",
			action:  "approve",
			docType: InboxItemDocSystemVerification,
			metadata: map[string]any{
				"verification_code": "987654",
				"sender":            "no-reply@auth.com",
			},
		},
		{
			name:    "Discard system verification email deletes item from queue",
			action:  "discard",
			docType: InboxItemDocSystemVerification,
			metadata: map[string]any{
				"verification_link": "https://auth.com/verify?token=abc",
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			settingsStore := newSettingsStoreMock(nil)
			_ = settingsStore.Create(ctx, &FinanceSettings{SpaceID: spID, BaseCurrency: Currency("USD")})

			txnData := make(map[TransactionID]*Transaction)
			txnStore := newTransactionStoreMock(txnData)
			eventStore := newTransactionEventStoreMock(nil)
			transferData := make(map[TransferID]*Transfer)
			transferStore := newTransferStoreMock(transferData)
			schedData := make(map[ScheduledTransactionID]*ScheduledTransaction)
			scheduledStore := newScheduledTransactionStoreMock(schedData)
			inboxStore := newInboxItemStoreMock(nil)

			svc := NewService(Dependencies{
				SettingsStore:             settingsStore,
				TransactionStore:          txnStore,
				TransactionEventStore:     eventStore,
				TransferStore:             transferStore,
				ScheduledTransactionStore: scheduledStore,
				InboxItemStore:            inboxStore,
			})

			// Stage system verification item
			staged, err := svc.StageInboxItem(ctx, spID, &StageInboxItem{
				DocType:    tt.docType,
				Vendor:     "Auth System",
				RawPayload: "Your verification code is 987654",
				Metadata:   tt.metadata,
			})
			if err != nil {
				t.Fatalf("StageInboxItem failed: %v", err)
			}

			if staged.DocType != InboxItemDocSystemVerification {
				t.Fatalf("DocType = %s, want %s", staged.DocType, InboxItemDocSystemVerification)
			}

			switch tt.action {
			case "approve":
				_, err := svc.ApproveInboxItem(ctx, spID, staged.ID)
				if err != nil {
					t.Fatalf("ApproveInboxItem failed: %v", err)
				}

				// Verify item status resolved
				item, err := inboxStore.Get(ctx, spID, staged.ID)
				if err != nil {
					t.Fatalf("Get inbox item failed: %v", err)
				}
				if item.Status != InboxItemResolved {
					t.Errorf("Status = %s, want %s", item.Status, InboxItemResolved)
				}

			case "discard":
				err := svc.DiscardInboxItem(ctx, spID, staged.ID)
				if err != nil {
					t.Fatalf("DiscardInboxItem failed: %v", err)
				}

				// Verify item deleted from store
				_, err = inboxStore.Get(ctx, spID, staged.ID)
				if err == nil {
					t.Errorf("Expected error fetching discarded item, got nil")
				}
			}

			// Assert 0 side-effect ledger entities created across all cases
			if len(txnData) != 0 {
				t.Errorf("Transactions created = %d, want 0", len(txnData))
			}
			if len(transferData) != 0 {
				t.Errorf("Transfers created = %d, want 0", len(transferData))
			}
			if len(schedData) != 0 {
				t.Errorf("Scheduled transactions created = %d, want 0", len(schedData))
			}
		})
	}
}

func TestService_InvoiceBranch(t *testing.T) {
	ctx := context.Background()
	spIDStr, _ := id.Generate("spc_")
	spID := SpaceID(spIDStr)

	tests := []struct {
		name                     string
		action                   string // "approve" or "discard"
		linkScheduledPayment     bool
		paymentInitialStatus     ScheduledTransactionStatus
		expectedScheduledCount   int
		expectedTransactionCount int
		expectPaidTxnLinked      bool
	}{
		{
			name:                     "Unlinked invoice creates new scheduled payment",
			action:                   "approve",
			linkScheduledPayment:     false,
			expectedScheduledCount:   1,
			expectedTransactionCount: 0,
			expectPaidTxnLinked:      false,
		},
		{
			name:                     "Linked invoice to unpaid scheduled payment updates bill figures",
			action:                   "approve",
			linkScheduledPayment:     true,
			paymentInitialStatus:     ScheduledTransactionPending,
			expectedScheduledCount:   1,
			expectedTransactionCount: 0,
			expectPaidTxnLinked:      false,
		},
		{
			name:                     "Linked invoice to already paid scheduled payment attaches audit link to paid transaction",
			action:                   "approve",
			linkScheduledPayment:     true,
			paymentInitialStatus:     ScheduledTransactionStatus("paid"),
			expectedScheduledCount:   1,
			expectedTransactionCount: 1,
			expectPaidTxnLinked:      true,
		},
		{
			name:                     "Discard invoice deletes item from queue",
			action:                   "discard",
			linkScheduledPayment:     false,
			expectedScheduledCount:   0,
			expectedTransactionCount: 0,
			expectPaidTxnLinked:      false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			settingsStore := newSettingsStoreMock(nil)
			_ = settingsStore.Create(ctx, &FinanceSettings{SpaceID: spID, BaseCurrency: Currency("USD")})

			accountStore := newAccountStoreMock(nil)
			accID, _ := NewAccountID()
			_ = accountStore.Create(ctx, &Account{
				ID:             accID,
				SpaceID:        spID,
				Name:           "checking",
				Currency:       Currency("USD"),
				CurrentBalance: 100000,
				IsActive:       true,
			})

			budgetStore := newBudgetStoreMock(nil)
			bIDVal, _ := NewBudgetID()
			bg := &Budget{
				ID:       bIDVal,
				SpaceID:  spID,
				Name:     "util",
				Currency: Currency("USD"),
			}
			_ = budgetStore.Create(ctx, bg)

			periodStore := newPeriodStoreMock(nil)

			txnData := make(map[TransactionID]*Transaction)
			txnStore := newTransactionStoreMock(txnData)
			eventStore := newTransactionEventStoreMock(nil)
			transferStore := newTransferStoreMock(nil)
			schedData := make(map[ScheduledTransactionID]*ScheduledTransaction)
			scheduledStore := newScheduledTransactionStoreMock(schedData)
			inboxStore := newInboxItemStoreMock(nil)

			svc := NewService(Dependencies{
				SettingsStore:             settingsStore,
				AccountStore:              accountStore,
				TransactionStore:          txnStore,
				TransactionEventStore:     eventStore,
				TransferStore:             transferStore,
				ScheduledTransactionStore: scheduledStore,
				InboxItemStore:            inboxStore,
				BudgetStore:               budgetStore,
				PeriodStore:               periodStore,
			})

			var preExistingPayID ScheduledTransactionID
			var preExistingTxnID TransactionID

			if tt.linkScheduledPayment {
				preExistingPayID, _ = NewScheduledTransactionID()
				pay := &ScheduledTransaction{
					ID:         preExistingPayID,
					SpaceID:    spID,
					SourceType: "Electric Co",
					SourceID:   "src_elec",
					Amount:     10000,
					Currency:   Currency("USD"),
					DueDate:    time.Now().UTC(),
					Status:     tt.paymentInitialStatus,
					Type:       TransactionTypeExpense,
				}

				if tt.expectPaidTxnLinked {
					preExistingTxnID, _ = NewTransactionID()
					txn := &Transaction{
						ID:              preExistingTxnID,
						SpaceID:         spID,
						AccountID:       &accID,
						Amount:          10000,
						Currency:        Currency("USD"),
						Description:     "Electric Co Bill Paid",
						TransactionDate: time.Now().UTC(),
					}
					_ = txnStore.Create(ctx, txn)
				}

				_ = scheduledStore.Create(ctx, pay)
			}

			bIDStr := string(bIDVal)

			// Stage Invoice item
			accIDStr := string(accID)
			staged, err := svc.StageInboxItem(ctx, spID, &StageInboxItem{
				DocType:    InboxItemDocInvoice,
				Vendor:     "Electric Co",
				Amount:     12500, // $125.00
				Currency:   "USD",
				AccountID:  &accIDStr,
				Date:       time.Now().UTC().Format(time.RFC3339),
				RawPayload: "{}",
			})
			if err != nil {
				t.Fatalf("StageInboxItem failed: %v", err)
			}
			staged.BudgetID = &bIDStr
			_, _ = svc.UpdateInboxItem(ctx, spID, staged)

			if tt.linkScheduledPayment {
				pIDStr := string(preExistingPayID)
				staged.ScheduledTransactionID = &pIDStr
				if tt.expectPaidTxnLinked {
					tIDStr := string(preExistingTxnID)
					staged.TransactionID = &tIDStr
				}
				_, _ = svc.UpdateInboxItem(ctx, spID, staged)
			}

			switch tt.action {
			case "approve":
				_, err := svc.ApproveInboxItem(ctx, spID, staged.ID)
				if err != nil {
					t.Fatalf("ApproveInboxItem failed: %v", err)
				}

				item, err := inboxStore.Get(ctx, spID, staged.ID)
				if err != nil {
					t.Fatalf("Get inbox item failed: %v", err)
				}
				if item.Status != InboxItemResolved {
					t.Errorf("InboxItem Status = %s, want %s", item.Status, InboxItemResolved)
				}

				if tt.expectPaidTxnLinked {
					if item.TransactionID == nil || *item.TransactionID != string(preExistingTxnID) {
						t.Errorf("Item TransactionID = %v, want %s", item.TransactionID, preExistingTxnID)
					}
				}

			case "discard":
				err := svc.DiscardInboxItem(ctx, spID, staged.ID)
				if err != nil {
					t.Fatalf("DiscardInboxItem failed: %v", err)
				}

				_, err = inboxStore.Get(ctx, spID, staged.ID)
				if err == nil {
					t.Errorf("Expected error fetching discarded invoice, got nil")
				}
			}

			if len(schedData) != tt.expectedScheduledCount {
				t.Errorf("Scheduled Payments count = %d, want %d", len(schedData), tt.expectedScheduledCount)
			}
			if len(txnData) != tt.expectedTransactionCount {
				t.Errorf("Transactions count = %d, want %d", len(txnData), tt.expectedTransactionCount)
			}
		})
	}
}

func TestUpdateAccount(t *testing.T) {
	ctx := context.Background()
	spaceID := SpaceID("spc_2dE1V8ZqWz4eS2N9yX3bL1mK7pO")
	aID, _ := NewAccountID()

	accStore := newAccountStoreMock(nil)
	_ = accStore.Create(ctx, &Account{
		ID:             aID,
		SpaceID:        spaceID,
		Name:           "Checking",
		Type:           AccountTypeBank,
		Currency:       "USD",
		InitialBalance: 100000,
		CurrentBalance: 100000,
		Version:        1,
	})

	svc := NewService(Dependencies{AccountStore: accStore})

	tests := []struct {
		name      string
		update    *Account
		mask      []string
		wantErr   error
		wantColor string
	}{
		{
			name: "stale version returns VersionMismatch",
			update: &Account{
				ID:      aID,
				SpaceID: spaceID,
				Color:   "#FF0000",
				Version: 99,
			},
			mask:    []string{"color"},
			wantErr: errors.E(errors.Conflict, VersionMismatch),
		},
		{
			name: "valid version applies patch mask",
			update: &Account{
				ID:      aID,
				SpaceID: spaceID,
				Color:   "#00FF00",
				Version: 1,
			},
			mask:      []string{"color"},
			wantErr:   nil,
			wantColor: "#00FF00",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			res, err := svc.UpdateAccount(ctx, tt.update, tt.mask)
			if tt.wantErr != nil {
				if !errors.Is(err, tt.wantErr) {
					t.Errorf("UpdateAccount error = %v, want %v", err, tt.wantErr)
				}
			} else {
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				if res.Color != tt.wantColor {
					t.Errorf("Color = %s, want %s", res.Color, tt.wantColor)
				}
			}
		})
	}
}

func TestUpdateInstitution(t *testing.T) {
	ctx := context.Background()
	spaceID := SpaceID("spc_2dE1V8ZqWz4eS2N9yX3bL1mK7pO")
	iID, _ := NewInstitutionID()

	instStore := newInstitutionStoreMock(nil)
	_ = instStore.Create(ctx, &Institution{
		ID:      iID,
		SpaceID: spaceID,
		Name:    "Chase",
		Domain:  "chase.com",
		Color:   "#0000FF",
		Version: 1,
	})

	svc := NewService(Dependencies{InstitutionStore: instStore})

	tests := []struct {
		name      string
		update    *Institution
		mask      []string
		wantErr   error
		wantColor string
	}{
		{
			name: "stale version returns VersionMismatch",
			update: &Institution{
				ID:      iID,
				SpaceID: spaceID,
				Color:   "#FF0000",
				Version: 99,
			},
			mask:    []string{"color"},
			wantErr: errors.E(errors.Conflict, VersionMismatch),
		},
		{
			name: "valid version applies patch mask",
			update: &Institution{
				ID:      iID,
				SpaceID: spaceID,
				Color:   "#0000AA",
				Version: 1,
			},
			mask:      []string{"color"},
			wantErr:   nil,
			wantColor: "#0000AA",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			res, err := svc.UpdateInstitution(ctx, tt.update, tt.mask)
			if tt.wantErr != nil {
				if !errors.Is(err, tt.wantErr) {
					t.Errorf("UpdateInstitution error = %v, want %v", err, tt.wantErr)
				}
			} else {
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				if res.Color != tt.wantColor {
					t.Errorf("Color = %s, want %s", res.Color, tt.wantColor)
				}
			}
		})
	}
}

func TestCreateInstitution(t *testing.T) {
	ctx := context.Background()
	spaceID := SpaceID("spc_2dE1V8ZqWz4eS2N9yX3bL1mK7pO")
	instStore := newInstitutionStoreMock(nil)
	svc := NewService(Dependencies{InstitutionStore: instStore})

	tests := []struct {
		name       string
		input      *Institution
		wantErr    bool
		wantDomain string
	}{
		{
			name: "valid institution creates successfully",
			input: &Institution{
				SpaceID: spaceID,
				Name:    "Chase Bank",
				Domain:  "chase.com",
			},
			wantErr:    false,
			wantDomain: "chase.com",
		},
		{
			name: "full website URL extracts domain",
			input: &Institution{
				SpaceID: spaceID,
				Name:    "https://www.chase.com/personal/banking",
			},
			wantErr:    false,
			wantDomain: "chase.com",
		},
		{
			name: "empty name returns validation error",
			input: &Institution{
				SpaceID: spaceID,
				Name:    "",
			},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			res, err := svc.CreateInstitution(ctx, tt.input)
			if tt.wantErr {
				if err == nil {
					t.Errorf("expected error, got nil")
				}
			} else {
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				if res.Domain != tt.wantDomain {
					t.Errorf("Domain = %s, want %s", res.Domain, tt.wantDomain)
				}
			}
		})
	}
}

func TestDeleteInstitution(t *testing.T) {
	ctx := context.Background()
	spaceID := SpaceID("spc_2dE1V8ZqWz4eS2N9yX3bL1mK7pO")
	iID, _ := NewInstitutionID()

	instStore := newInstitutionStoreMock(nil)
	_ = instStore.Create(ctx, &Institution{
		ID:      iID,
		SpaceID: spaceID,
		Name:    "Chase",
		Version: 2,
	})

	svc := NewService(Dependencies{InstitutionStore: instStore})

	tests := []struct {
		name    string
		opts    DeleteOptions
		wantErr error
	}{
		{
			name:    "version mismatch returns VersionMismatch",
			opts:    DeleteOptions{Version: 1},
			wantErr: errors.E(errors.Conflict, VersionMismatch),
		},
		{
			name:    "matching version succeeds",
			opts:    DeleteOptions{Version: 2},
			wantErr: nil,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := svc.DeleteInstitution(ctx, spaceID, iID, tt.opts)
			if tt.wantErr != nil {
				if !errors.Is(err, tt.wantErr) {
					t.Errorf("DeleteInstitution error = %v, want %v", err, tt.wantErr)
				}
			} else {
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
			}
		})
	}
}

func TestDeleteAccount(t *testing.T) {
	ctx := context.Background()
	spaceID := SpaceID("spc_2dE1V8ZqWz4eS2N9yX3bL1mK7pO")
	aID, _ := NewAccountID()

	accStore := newAccountStoreMock(nil)
	_ = accStore.Create(ctx, &Account{
		ID:        aID,
		SpaceID:   spaceID,
		Name:      "Savings",
		IsDefault: false,
		Version:   2,
	})

	svc := NewService(Dependencies{AccountStore: accStore})

	tests := []struct {
		name    string
		opts    DeleteOptions
		wantErr error
	}{
		{
			name:    "version mismatch returns VersionMismatch",
			opts:    DeleteOptions{Version: 1},
			wantErr: errors.E(errors.Conflict, VersionMismatch),
		},
		{
			name:    "matching version succeeds",
			opts:    DeleteOptions{Version: 2},
			wantErr: nil,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := svc.DeleteAccount(ctx, spaceID, aID, tt.opts)
			if tt.wantErr != nil {
				if !errors.Is(err, tt.wantErr) {
					t.Errorf("DeleteAccount error = %v, want %v", err, tt.wantErr)
				}
			} else {
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
			}
		})
	}
}

func TestService_ImportStatement(t *testing.T) {
	type testFixture struct {
		name        string
		csvMapping  *CSVMapping
		rawCSV      string
		wantErr     bool
		verifyLines func(t *testing.T, lines []*StatementLine)
	}

	tests := []testFixture{
		{
			name: "SingleAmountColumn_DebitAndCredit",
			csvMapping: &CSVMapping{
				DateColumnIndex:        0,
				DescriptionColumnIndex: 1,
				AmountColumnIndex:      2,
				DebitColumnIndex:       -1,
				CreditColumnIndex:      -1,
				HasHeader:              true,
				Delimiter:              ",",
				DateFormat:             "2006-01-02",
			},
			rawCSV: "date,description,amount\n2026-08-12,Salary Direct Deposit,200.00\n2026-08-13,Coffee Shop,-4.50\n",
			verifyLines: func(t *testing.T, lines []*StatementLine) {
				if len(lines) != 2 {
					t.Fatalf("expected 2 parsed lines, got %d", len(lines))
				}
				if lines[0].Amount != 20000 || lines[0].Description != "Salary Direct Deposit" {
					t.Errorf("unexpected line 0: %+v", lines[0])
				}
				if lines[1].Amount != -450 || lines[1].Description != "Coffee Shop" {
					t.Errorf("unexpected line 1: %+v", lines[1])
				}
			},
		},
		{
			name: "DualColumn_DebitAndCredit",
			csvMapping: &CSVMapping{
				DateColumnIndex:        0,
				DescriptionColumnIndex: 1,
				AmountColumnIndex:      -1,
				DebitColumnIndex:       2,
				CreditColumnIndex:      3,
				HasHeader:              true,
				Delimiter:              ",",
				DateFormat:             "2006-01-02",
			},
			rawCSV: "date,description,debit,credit\n2026-08-12,Salary Deposit,,200.00\n2026-08-13,Gas Purchase,50.00,\n",
			verifyLines: func(t *testing.T, lines []*StatementLine) {
				if len(lines) != 2 {
					t.Fatalf("expected 2 parsed lines, got %d", len(lines))
				}
				if lines[0].Amount != 20000 || lines[0].Description != "Salary Deposit" {
					t.Errorf("unexpected credit line: %+v", lines[0])
				}
				if lines[1].Amount != -5000 || lines[1].Description != "Gas Purchase" {
					t.Errorf("unexpected debit line: %+v", lines[1])
				}
			},
		},
		{
			name: "SemicolonDelimiter_CustomDateFormat",
			csvMapping: &CSVMapping{
				DateColumnIndex:        0,
				DescriptionColumnIndex: 1,
				AmountColumnIndex:      2,
				DebitColumnIndex:       -1,
				CreditColumnIndex:      -1,
				HasHeader:              false,
				Delimiter:              ";",
				DateFormat:             "02/01/2006",
			},
			rawCSV: "12/08/2026;Vendor Payment;-75.25\n",
			verifyLines: func(t *testing.T, lines []*StatementLine) {
				if len(lines) != 1 {
					t.Fatalf("expected 1 parsed line, got %d", len(lines))
				}
				if lines[0].DateStr != "2026-08-12" || lines[0].Amount != -7525 {
					t.Errorf("unexpected line: %+v", lines[0])
				}
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			spaceID := SpaceID("spc_" + ksuid.New().String())
			accountID := AccountID("acc_" + ksuid.New().String())
			linesMap := make(map[StatementID][]*StatementLine)
			statementStore := newStatementStoreMock(nil, linesMap)

			deps := Dependencies{
				SettingsStore: newSettingsStoreMock(map[SpaceID]*FinanceSettings{
					spaceID: {SpaceID: spaceID, BaseCurrency: Currency("USD")},
				}),
				AccountStore: newAccountStoreMock(map[AccountID]*Account{
					accountID: {
						ID:             accountID,
						SpaceID:        spaceID,
						Name:           "Main Checking",
						Type:           AccountTypeBank,
						Currency:       Currency("USD"),
						CurrentBalance: 100000,
						IsActive:       true,
					},
				}),
				StatementStore:   statementStore,
				TransactionStore: newTransactionStoreMock(nil),
			}

			svc := NewService(deps)
			stmt := &Statement{
				SpaceID:                  spaceID,
				StatementDate:            time.Date(2026, 8, 12, 0, 0, 0, 0, time.UTC),
				StatementStartingBalance: 100000,
				StatementEndingBalance:   120000,
				Filename:                 "statement.csv",
				Config: StatementConfig{
					Format: "CSV",
					CSV:    tt.csvMapping,
				},
				RawContent: tt.rawCSV,
			}

			imported, err := svc.ImportStatement(context.Background(), accountID, stmt)
			if tt.wantErr {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}

			lines := linesMap[imported.ID]
			if tt.verifyLines != nil {
				tt.verifyLines(t, lines)
			}
		})
	}
}

func TestService_InvertStatementSigns(t *testing.T) {
	ctx := context.Background()
	spaceID := SpaceID("spc_" + ksuid.New().String())
	accountID := AccountID("acc_" + ksuid.New().String())
	stmtID := StatementID("stmt_" + ksuid.New().String())

	statementStore := newStatementStoreMock(nil, nil)
	accountData := map[AccountID]*Account{
		accountID: {
			ID:             accountID,
			SpaceID:        spaceID,
			Type:           AccountTypeCreditCard,
			CurrentBalance: 50000,
			Currency:       Currency("USD"),
		},
	}
	accountStore := newAccountStoreMock(accountData)

	stmt := &Statement{
		ID:                       stmtID,
		SpaceID:                  spaceID,
		AccountID:                accountID,
		Status:                   StatementStatusInProgress,
		StatementDate:            time.Date(2026, 8, 20, 0, 0, 0, 0, time.UTC),
		StatementStartingBalance: 50000,
		StatementEndingBalance:   80000,
		Filename:                 "card_statement.csv",
		Config:                   StatementConfig{Format: "CSV"},
		RawContent:               "raw",
	}

	lines := []*StatementLine{
		{
			ID:          StatementLineID("stln_1"),
			StatementID: stmtID,
			RowIndex:    0,
			DateStr:     "2026-08-01",
			Description: "Amazon Purchase",
			Amount:      25000,
			Status:      StatementLineStatusUnmatched,
			Action:      StatementLineAction{Type: StatementLineActionTypeCreateIncome},
		},
		{
			ID:          StatementLineID("stln_2"),
			StatementID: stmtID,
			RowIndex:    1,
			DateStr:     "2026-08-05",
			Description: "Online Payment",
			Amount:      -10000,
			Status:      StatementLineStatusUnmatched,
			Action:      StatementLineAction{Type: StatementLineActionTypeCreateExpense},
		},
	}

	_ = statementStore.Create(ctx, stmt, lines)

	deps := Dependencies{
		StatementStore:   statementStore,
		AccountStore:     accountStore,
		TransactionStore: newTransactionStoreMock(nil),
	}

	svc := NewService(deps)

	invertedStmt, invertedLines, err := svc.InvertStatementSigns(ctx, spaceID, stmtID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if invertedStmt.StatementStartingBalance != -50000 {
		t.Errorf("expected starting balance -50000, got %d", invertedStmt.StatementStartingBalance)
	}
	if invertedStmt.StatementEndingBalance != -80000 {
		t.Errorf("expected ending balance -80000, got %d", invertedStmt.StatementEndingBalance)
	}

	if len(invertedLines) != 2 {
		t.Fatalf("expected 2 lines, got %d", len(invertedLines))
	}
	line0 := invertedLines[0]
	if line0.Amount != -25000 {
		t.Errorf("expected line 0 amount -25000, got %d", line0.Amount)
	}
	if line0.Action.Type != StatementLineActionTypeCreateExpense {
		t.Errorf("expected line 0 action CREATE_EXPENSE, got %s", line0.Action.Type)
	}

	line1 := invertedLines[1]
	if line1.Amount != 10000 {
		t.Errorf("expected line 1 amount 10000, got %d", line1.Amount)
	}
	if line1.Action.Type != StatementLineActionTypeCreateIncome {
		t.Errorf("expected line 1 action CREATE_INCOME, got %s", line1.Action.Type)
	}
}

func TestService_CompleteStatement(t *testing.T) {
	type testFixture struct {
		name            string
		startingBalance int64
		endingBalance   int64
		setupStores     func(spaceID SpaceID, accountID AccountID, counterpartID AccountID, deps *Dependencies, txns map[TransactionID]*Transaction, sched map[ScheduledTransactionID]*ScheduledTransaction, bor map[BorrowingID]*Borrowing)
		setupLines      func(spaceID SpaceID, stmtID StatementID, accountID AccountID, counterpartID AccountID, deps *Dependencies, txns map[TransactionID]*Transaction, sched map[ScheduledTransactionID]*ScheduledTransaction, bor map[BorrowingID]*Borrowing) []*StatementLine
		wantErr         bool
		errContains     string
		verifyResults   func(t *testing.T, spaceID SpaceID, stmt *Statement, lines []*StatementLine, deps *Dependencies, txns map[TransactionID]*Transaction)
	}

	tests := []testFixture{
		{
			name:            "Match_ExistingTransaction_Outflow",
			startingBalance: 100000,
			endingBalance:   95000,
			setupStores: func(spaceID SpaceID, accountID AccountID, counterpartID AccountID, deps *Dependencies, txns map[TransactionID]*Transaction, sched map[ScheduledTransactionID]*ScheduledTransaction, bor map[BorrowingID]*Borrowing) {
				txID := TransactionID("txn_" + ksuid.New().String())
				txn := &Transaction{
					ID:              txID,
					SpaceID:         spaceID,
					Type:            TransactionTypeExpense,
					AccountID:       &accountID,
					Amount:          5000,
					Currency:        Currency("USD"),
					Description:     "Grocery Store",
					TransactionDate: time.Date(2026, 8, 14, 0, 0, 0, 0, time.UTC),
				}
				_ = deps.TransactionStore.Create(context.Background(), txn)
			},
			setupLines: func(spaceID SpaceID, stmtID StatementID, accountID AccountID, counterpartID AccountID, deps *Dependencies, txns map[TransactionID]*Transaction, sched map[ScheduledTransactionID]*ScheduledTransaction, bor map[BorrowingID]*Borrowing) []*StatementLine {
				var txID TransactionID
				for id := range txns {
					txID = id
				}
				return []*StatementLine{
					{
						ID:          StatementLineID("stln_" + ksuid.New().String()),
						StatementID: stmtID,
						RowIndex:    1,
						DateStr:     "2026-08-14",
						Description: "Grocery Store",
						Amount:      -5000,
						Status:      StatementLineStatusImported,
						Action: StatementLineAction{
							Type:          StatementLineActionTypeMatch,
							TransactionID: &txID,
						},
					},
				}
			},
			verifyResults: func(t *testing.T, spaceID SpaceID, stmt *Statement, lines []*StatementLine, deps *Dependencies, txns map[TransactionID]*Transaction) {
				if stmt.Status != StatementStatusCompleted {
					t.Errorf("expected statement completed, got %s", stmt.Status)
				}
				line := lines[0]
				if line.Status != StatementLineStatusMatched {
					t.Errorf("expected line matched, got %s", line.Status)
				}
				if line.MatchedTransactionID == nil {
					t.Fatal("expected matched transaction ID to be set")
				}
				txn, err := deps.TransactionStore.GetByID(context.Background(), spaceID, *line.MatchedTransactionID)
				if err != nil {
					t.Fatalf("get matched transaction: %v", err)
				}
				if !txn.Metadata.Reconciled {
					t.Error("expected transaction metadata reconciled to be true")
				}
				if txn.Metadata.ReconciliationStatementID != string(stmt.ID) {
					t.Errorf("expected reconciliation statement ID %s, got %s", stmt.ID, txn.Metadata.ReconciliationStatementID)
				}
			},
		},
		{
			name:            "Match_ExistingTransaction_WithOverwrite_IncreaseExpense",
			startingBalance: 100000,
			endingBalance:   85000,
			setupStores: func(spaceID SpaceID, accountID AccountID, counterpartID AccountID, deps *Dependencies, txns map[TransactionID]*Transaction, sched map[ScheduledTransactionID]*ScheduledTransaction, bor map[BorrowingID]*Borrowing) {
				txID := TransactionID("txn_" + ksuid.New().String())
				txn := &Transaction{
					ID:              txID,
					SpaceID:         spaceID,
					Type:            TransactionTypeExpense,
					AccountID:       &accountID,
					Amount:          10000, // initially 100.00
					Currency:        Currency("USD"),
					Description:     "Initial Grocery",
					TransactionDate: time.Date(2026, 8, 14, 0, 0, 0, 0, time.UTC),
				}
				_ = deps.TransactionStore.Create(context.Background(), txn)
			},
			setupLines: func(spaceID SpaceID, stmtID StatementID, accountID AccountID, counterpartID AccountID, deps *Dependencies, txns map[TransactionID]*Transaction, sched map[ScheduledTransactionID]*ScheduledTransaction, bor map[BorrowingID]*Borrowing) []*StatementLine {
				var txID TransactionID
				for id := range txns {
					txID = id
				}
				overwrite := true
				return []*StatementLine{
					{
						ID:          StatementLineID("stln_" + ksuid.New().String()),
						StatementID: stmtID,
						RowIndex:    1,
						DateStr:     "2026-08-14",
						Description: "Updated Grocery From Bank",
						Amount:      -15000, // statement shows 150.00
						Status:      StatementLineStatusImported,
						Action: StatementLineAction{
							Type:                 StatementLineActionTypeMatch,
							TransactionID:        &txID,
							OverwriteTransaction: &overwrite,
						},
					},
				}
			},
			verifyResults: func(t *testing.T, spaceID SpaceID, stmt *Statement, lines []*StatementLine, deps *Dependencies, txns map[TransactionID]*Transaction) {
				if stmt.Status != StatementStatusCompleted {
					t.Errorf("expected statement completed, got %s", stmt.Status)
				}
				line := lines[0]
				if line.Status != StatementLineStatusMatched {
					t.Errorf("expected line matched, got %s", line.Status)
				}
				txn, err := deps.TransactionStore.GetByID(context.Background(), spaceID, *line.MatchedTransactionID)
				if err != nil {
					t.Fatalf("expected matched transaction: %v", err)
				}
				if txn.Amount != 15000 {
					t.Errorf("expected transaction amount overwritten to 15000, got %d", txn.Amount)
				}
				if txn.Description != "Updated Grocery From Bank" {
					t.Errorf("expected description updated, got %s", txn.Description)
				}
				if !txn.Metadata.Reconciled {
					t.Errorf("expected transaction marked reconciled")
				}
				// Verify account balance was adjusted by delta (10000 -> 15000 means -5000 more deducted from 100000 initial balance)
				acc, err := deps.AccountStore.GetByID(context.Background(), spaceID, stmt.AccountID)
				if err != nil {
					t.Fatalf("expected account: %v", err)
				}
				// Initial mock account balance was 100000, after -5000 delta adjustment it should be 95000
				if acc.CurrentBalance != 95000 {
					t.Errorf("expected account balance 95000, got %d", acc.CurrentBalance)
				}
			},
		},
		{
			name:            "CreateExpense_Standalone",
			startingBalance: 100000,
			endingBalance:   92500,
			setupLines: func(spaceID SpaceID, stmtID StatementID, accountID AccountID, counterpartID AccountID, deps *Dependencies, txns map[TransactionID]*Transaction, sched map[ScheduledTransactionID]*ScheduledTransaction, bor map[BorrowingID]*Borrowing) []*StatementLine {
				return []*StatementLine{
					{
						ID:          StatementLineID("stln_" + ksuid.New().String()),
						StatementID: stmtID,
						RowIndex:    1,
						DateStr:     "2026-08-14",
						Description: "Office Supplies",
						Amount:      -7500,
						Status:      StatementLineStatusImported,
						Action: StatementLineAction{
							Type: StatementLineActionTypeCreateExpense,
						},
					},
				}
			},
			verifyResults: func(t *testing.T, spaceID SpaceID, stmt *Statement, lines []*StatementLine, deps *Dependencies, txns map[TransactionID]*Transaction) {
				line := lines[0]
				if line.MatchedTransactionID == nil {
					t.Fatal("expected matched transaction ID to be populated")
				}
				txn, err := deps.TransactionStore.GetByID(context.Background(), spaceID, *line.MatchedTransactionID)
				if err != nil {
					t.Fatalf("expected created transaction in store: %v", err)
				}
				if txn.Type != TransactionTypeExpense || txn.Amount != 7500 {
					t.Errorf("expected expense 7500 cents, got %s %d", txn.Type, txn.Amount)
				}
				if !txn.Metadata.Reconciled || txn.Metadata.ReconciliationStatementID != string(stmt.ID) {
					t.Errorf("expected reconciliation metadata attached, got %+v", txn.Metadata)
				}
			},
		},
		{
			name:            "CreateIncome_Standalone",
			startingBalance: 100000,
			endingBalance:   220000,
			setupLines: func(spaceID SpaceID, stmtID StatementID, accountID AccountID, counterpartID AccountID, deps *Dependencies, txns map[TransactionID]*Transaction, sched map[ScheduledTransactionID]*ScheduledTransaction, bor map[BorrowingID]*Borrowing) []*StatementLine {
				return []*StatementLine{
					{
						ID:          StatementLineID("stln_" + ksuid.New().String()),
						StatementID: stmtID,
						RowIndex:    1,
						DateStr:     "2026-08-14",
						Description: "Client Retainer",
						Amount:      120000,
						Status:      StatementLineStatusImported,
						Action: StatementLineAction{
							Type: StatementLineActionTypeCreateIncome,
						},
					},
				}
			},
			verifyResults: func(t *testing.T, spaceID SpaceID, stmt *Statement, lines []*StatementLine, deps *Dependencies, txns map[TransactionID]*Transaction) {
				line := lines[0]
				if line.MatchedTransactionID == nil {
					t.Fatal("expected matched transaction ID to be populated")
				}
				txn, err := deps.TransactionStore.GetByID(context.Background(), spaceID, *line.MatchedTransactionID)
				if err != nil {
					t.Fatalf("expected created transaction in store: %v", err)
				}
				if txn.Type != TransactionTypeIncome || txn.Amount != 120000 {
					t.Errorf("expected income 120000 cents, got %s %d", txn.Type, txn.Amount)
				}
				if !txn.Metadata.Reconciled || txn.Metadata.ReconciliationStatementID != string(stmt.ID) {
					t.Errorf("expected reconciliation metadata attached, got %+v", txn.Metadata)
				}
			},
		},
		{
			name:            "CreateTransfer_Outflow_StampsOutflowLegOnly",
			startingBalance: 100000,
			endingBalance:   70000,
			setupLines: func(spaceID SpaceID, stmtID StatementID, accountID AccountID, counterpartID AccountID, deps *Dependencies, txns map[TransactionID]*Transaction, sched map[ScheduledTransactionID]*ScheduledTransaction, bor map[BorrowingID]*Borrowing) []*StatementLine {
				return []*StatementLine{
					{
						ID:          StatementLineID("stln_" + ksuid.New().String()),
						StatementID: stmtID,
						RowIndex:    1,
						DateStr:     "2026-08-14",
						Description: "Transfer to Savings",
						Amount:      -30000,
						Status:      StatementLineStatusImported,
						Action: StatementLineAction{
							Type:                 StatementLineActionTypeCreateTransfer,
							CounterpartAccountID: &counterpartID,
						},
					},
				}
			},
			verifyResults: func(t *testing.T, spaceID SpaceID, stmt *Statement, lines []*StatementLine, deps *Dependencies, txns map[TransactionID]*Transaction) {
				line := lines[0]
				if line.MatchedTransactionID == nil {
					t.Fatal("expected matched transaction ID to be populated")
				}
				outflowTxn, err := deps.TransactionStore.GetByID(context.Background(), spaceID, *line.MatchedTransactionID)
				if err != nil {
					t.Fatalf("expected outflow transaction: %v", err)
				}
				if outflowTxn.Type != TransactionTypeTransferOut {
					t.Errorf("expected outflow leg, got %s", outflowTxn.Type)
				}
				if !outflowTxn.Metadata.Reconciled || outflowTxn.Metadata.ReconciliationStatementID != string(stmt.ID) {
					t.Errorf("expected outflow leg reconciled, got %+v", outflowTxn.Metadata)
				}

				// Verify inflow leg is NOT marked reconciled
				for _, tx := range txns {
					if tx.Type == TransactionTypeTransferIn {
						if tx.Metadata.Reconciled {
							t.Error("expected destination inflow leg not to be reconciled")
						}
					}
				}
			},
		},
		{
			name:            "CreateTransfer_Inflow_StampsInflowLegOnly",
			startingBalance: 100000,
			endingBalance:   145000,
			setupLines: func(spaceID SpaceID, stmtID StatementID, accountID AccountID, counterpartID AccountID, deps *Dependencies, txns map[TransactionID]*Transaction, sched map[ScheduledTransactionID]*ScheduledTransaction, bor map[BorrowingID]*Borrowing) []*StatementLine {
				return []*StatementLine{
					{
						ID:          StatementLineID("stln_" + ksuid.New().String()),
						StatementID: stmtID,
						RowIndex:    1,
						DateStr:     "2026-08-14",
						Description: "Transfer from Savings",
						Amount:      45000,
						Status:      StatementLineStatusImported,
						Action: StatementLineAction{
							Type:                 StatementLineActionTypeCreateTransfer,
							CounterpartAccountID: &counterpartID,
						},
					},
				}
			},
			verifyResults: func(t *testing.T, spaceID SpaceID, stmt *Statement, lines []*StatementLine, deps *Dependencies, txns map[TransactionID]*Transaction) {
				line := lines[0]
				if line.MatchedTransactionID == nil {
					t.Fatal("expected matched transaction ID to be populated")
				}
				inflowTxn, err := deps.TransactionStore.GetByID(context.Background(), spaceID, *line.MatchedTransactionID)
				if err != nil {
					t.Fatalf("expected inflow transaction: %v", err)
				}
				if inflowTxn.Type != TransactionTypeTransferIn {
					t.Errorf("expected inflow leg, got %s", inflowTxn.Type)
				}
				if !inflowTxn.Metadata.Reconciled || inflowTxn.Metadata.ReconciliationStatementID != string(stmt.ID) {
					t.Errorf("expected inflow leg reconciled, got %+v", inflowTxn.Metadata)
				}

				// Verify counterpart outflow leg is NOT marked reconciled
				for _, tx := range txns {
					if tx.Type == TransactionTypeTransferOut {
						if tx.Metadata.Reconciled {
							t.Error("expected source counterpart outflow leg not to be reconciled")
						}
					}
				}
			},
		},
		{
			name:            "ConfirmScheduled_Payment",
			startingBalance: 100000,
			endingBalance:   85000,
			setupStores: func(spaceID SpaceID, accountID AccountID, counterpartID AccountID, deps *Dependencies, txns map[TransactionID]*Transaction, sched map[ScheduledTransactionID]*ScheduledTransaction, bor map[BorrowingID]*Borrowing) {
				schedID := ScheduledTransactionID("sch_" + ksuid.New().String())
				payment := &ScheduledTransaction{
					ID:         schedID,
					SpaceID:    spaceID,
					Amount:     15000,
					Currency:   Currency("USD"),
					Status:     ScheduledTransactionPending,
					DueDate:    time.Date(2026, 8, 14, 0, 0, 0, 0, time.UTC),
					Type:       TransactionTypeExpense,
					SourceType: "Electric Company",
				}
				_ = deps.ScheduledTransactionStore.Create(context.Background(), payment)
			},
			setupLines: func(spaceID SpaceID, stmtID StatementID, accountID AccountID, counterpartID AccountID, deps *Dependencies, txns map[TransactionID]*Transaction, sched map[ScheduledTransactionID]*ScheduledTransaction, bor map[BorrowingID]*Borrowing) []*StatementLine {
				var schedID ScheduledTransactionID
				for id := range sched {
					schedID = id
				}
				return []*StatementLine{
					{
						ID:          StatementLineID("stln_" + ksuid.New().String()),
						StatementID: stmtID,
						RowIndex:    1,
						DateStr:     "2026-08-14",
						Description: "Electric Company Autopay",
						Amount:      -15000,
						Status:      StatementLineStatusImported,
						Action: StatementLineAction{
							Type:                   StatementLineActionTypeConfirmScheduled,
							ScheduledTransactionID: &schedID,
						},
					},
				}
			},
			verifyResults: func(t *testing.T, spaceID SpaceID, stmt *Statement, lines []*StatementLine, deps *Dependencies, txns map[TransactionID]*Transaction) {
				line := lines[0]
				if line.MatchedTransactionID == nil {
					t.Fatal("expected matched transaction ID to be populated")
				}
				txn, err := deps.TransactionStore.GetByID(context.Background(), spaceID, *line.MatchedTransactionID)
				if err != nil {
					t.Fatalf("expected logged payment transaction: %v", err)
				}
				if !txn.Metadata.Reconciled {
					t.Error("expected transaction reconciled")
				}
			},
		},
		{
			name:            "CreateRepayment_Borrowing",
			startingBalance: 100000,
			endingBalance:   80000,
			setupStores: func(spaceID SpaceID, accountID AccountID, counterpartID AccountID, deps *Dependencies, txns map[TransactionID]*Transaction, sched map[ScheduledTransactionID]*ScheduledTransaction, bor map[BorrowingID]*Borrowing) {
				bID := BorrowingID("bor_" + ksuid.New().String())
				b := &Borrowing{
					ID:              bID,
					SpaceID:         spaceID,
					Direction:       BorrowingDirectionBorrowed,
					Counterparty:    "Bank of America",
					TotalAmount:     100000,
					RemainingAmount: 100000,
					Currency:        Currency("USD"),
					Status:          BorrowingStatusActive,
				}
				_ = deps.BorrowingStore.Create(context.Background(), b)
			},
			setupLines: func(spaceID SpaceID, stmtID StatementID, accountID AccountID, counterpartID AccountID, deps *Dependencies, txns map[TransactionID]*Transaction, sched map[ScheduledTransactionID]*ScheduledTransaction, bor map[BorrowingID]*Borrowing) []*StatementLine {
				var bID BorrowingID
				for id := range bor {
					bID = id
				}
				return []*StatementLine{
					{
						ID:          StatementLineID("stln_" + ksuid.New().String()),
						StatementID: stmtID,
						RowIndex:    1,
						DateStr:     "2026-08-14",
						Description: "Loan Monthly Payment",
						Amount:      -20000,
						Status:      StatementLineStatusImported,
						Action: StatementLineAction{
							Type:        StatementLineActionTypeCreateRepayment,
							BorrowingID: &bID,
						},
					},
				}
			},
			verifyResults: func(t *testing.T, spaceID SpaceID, stmt *Statement, lines []*StatementLine, deps *Dependencies, txns map[TransactionID]*Transaction) {
				line := lines[0]
				if line.MatchedTransactionID == nil {
					t.Fatal("expected matched transaction ID to be populated")
				}
				txn, err := deps.TransactionStore.GetByID(context.Background(), spaceID, *line.MatchedTransactionID)
				if err != nil {
					t.Fatalf("expected repayment transaction: %v", err)
				}
				if txn.Metadata.BorrowingRole != "REPAYMENT" {
					t.Errorf("expected borrowing role REPAYMENT, got %s", txn.Metadata.BorrowingRole)
				}
				if !txn.Metadata.Reconciled {
					t.Error("expected repayment transaction reconciled")
				}
			},
		},
		{
			name:            "Skip_Line",
			startingBalance: 100000,
			endingBalance:   99900,
			setupLines: func(spaceID SpaceID, stmtID StatementID, accountID AccountID, counterpartID AccountID, deps *Dependencies, txns map[TransactionID]*Transaction, sched map[ScheduledTransactionID]*ScheduledTransaction, bor map[BorrowingID]*Borrowing) []*StatementLine {
				return []*StatementLine{
					{
						ID:          StatementLineID("stln_" + ksuid.New().String()),
						StatementID: stmtID,
						RowIndex:    1,
						DateStr:     "2026-08-14",
						Description: "Ignored Bank Adjustment",
						Amount:      -100,
						Status:      StatementLineStatusImported,
						Action: StatementLineAction{
							Type: StatementLineActionTypeSkip,
						},
					},
				}
			},
			verifyResults: func(t *testing.T, spaceID SpaceID, stmt *Statement, lines []*StatementLine, deps *Dependencies, txns map[TransactionID]*Transaction) {
				line := lines[0]
				if line.MatchedTransactionID != nil {
					t.Errorf("expected nil matched transaction ID for skipped line, got %v", line.MatchedTransactionID)
				}
				if line.Status != StatementLineStatusSkipped {
					t.Errorf("expected line status skipped, got %s", line.Status)
				}
			},
		},
		{
			name:            "Error_Transfer_MissingCounterpartAccount",
			startingBalance: 100000,
			endingBalance:   95000,
			setupLines: func(spaceID SpaceID, stmtID StatementID, accountID AccountID, counterpartID AccountID, deps *Dependencies, txns map[TransactionID]*Transaction, sched map[ScheduledTransactionID]*ScheduledTransaction, bor map[BorrowingID]*Borrowing) []*StatementLine {
				return []*StatementLine{
					{
						ID:          StatementLineID("stln_" + ksuid.New().String()),
						StatementID: stmtID,
						RowIndex:    1,
						DateStr:     "2026-08-14",
						Description: "Transfer with missing counterpart",
						Amount:      -5000,
						Status:      StatementLineStatusImported,
						Action: StatementLineAction{
							Type:                 StatementLineActionTypeCreateTransfer,
							CounterpartAccountID: nil,
						},
					},
				}
			},
			wantErr:     true,
			errContains: "requires counterpart_account_id",
		},
		{
			name:            "Error_StatementBalanceMismatch",
			startingBalance: 100000,
			endingBalance:   200000, // Expected 150000, reported 200000
			setupLines: func(spaceID SpaceID, stmtID StatementID, accountID AccountID, counterpartID AccountID, deps *Dependencies, txns map[TransactionID]*Transaction, sched map[ScheduledTransactionID]*ScheduledTransaction, bor map[BorrowingID]*Borrowing) []*StatementLine {
				return []*StatementLine{
					{
						ID:          StatementLineID("stln_" + ksuid.New().String()),
						StatementID: stmtID,
						RowIndex:    1,
						DateStr:     "2026-08-14",
						Description: "Partial Deposit",
						Amount:      50000,
						Status:      StatementLineStatusImported,
						Action: StatementLineAction{
							Type: StatementLineActionTypeCreateIncome,
						},
					},
				}
			},
			wantErr:     true,
			errContains: "cash flow sum of matches does not equal statement balance difference",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			spaceID := SpaceID("spc_" + ksuid.New().String())
			accountID := AccountID("acc_" + ksuid.New().String())
			counterpartID := AccountID("acc_" + ksuid.New().String())
			stmtID := StatementID("stmt_" + ksuid.New().String())
			bgtID := BudgetID("bgt_" + ksuid.New().String())
			periodID := PeriodID("bgp_" + ksuid.New().String())

			txnData := make(map[TransactionID]*Transaction)
			schedData := make(map[ScheduledTransactionID]*ScheduledTransaction)
			borData := make(map[BorrowingID]*Borrowing)
			transferData := make(map[TransferID]*Transfer)

			settingsData := map[SpaceID]*FinanceSettings{
				spaceID: {
					SpaceID:      spaceID,
					BaseCurrency: Currency("USD"),
				},
			}
			budgetData := map[BudgetID]*Budget{
				bgtID: {
					ID:          bgtID,
					SpaceID:     spaceID,
					Name:        "Operations",
					LimitAmount: 1000000,
					Currency:    Currency("USD"),
					Status:      BudgetStatusActive,
				},
			}
			periodData := map[string]*BudgetPeriod{
				string(bgtID) + "_" + time.Date(2026, 8, 1, 0, 0, 0, 0, time.UTC).Format(time.RFC3339) + "_" + time.Date(2026, 8, 31, 23, 59, 59, 0, time.UTC).Format(time.RFC3339): {
					ID:          periodID,
					SpaceID:     spaceID,
					BudgetID:    bgtID,
					StartDate:   time.Date(2026, 8, 1, 0, 0, 0, 0, time.UTC),
					EndDate:     time.Date(2026, 8, 31, 23, 59, 59, 0, time.UTC),
					LimitAmount: 1000000,
				},
			}
			accountData := map[AccountID]*Account{
				accountID: {
					ID:             accountID,
					SpaceID:        spaceID,
					Name:           "Main Checking",
					Type:           AccountTypeBank,
					Currency:       Currency("USD"),
					CurrentBalance: tt.startingBalance,
					IsActive:       true,
				},
				counterpartID: {
					ID:             counterpartID,
					SpaceID:        spaceID,
					Name:           "High Yield Savings",
					Type:           AccountTypeBank,
					Currency:       Currency("USD"),
					CurrentBalance: 500000,
					IsActive:       true,
				},
			}

			deps := Dependencies{
				SettingsStore:             newSettingsStoreMock(settingsData),
				BudgetStore:               newBudgetStoreMock(budgetData),
				PeriodStore:               newPeriodStoreMock(periodData),
				AccountStore:              newAccountStoreMock(accountData),
				StatementStore:            newStatementStoreMock(nil, nil),
				TransactionStore:          newTransactionStoreMock(txnData),
				TransferStore:             newTransferStoreMock(transferData),
				ScheduledTransactionStore: newScheduledTransactionStoreMock(schedData),
				BorrowingStore:            newBorrowingStoreMock(borData),
			}

			if tt.setupStores != nil {
				tt.setupStores(spaceID, accountID, counterpartID, &deps, txnData, schedData, borData)
			}

			stmt := &Statement{
				ID:                       stmtID,
				SpaceID:                  spaceID,
				AccountID:                accountID,
				StatementDate:            time.Date(2026, 8, 14, 0, 0, 0, 0, time.UTC),
				StatementStartingBalance: tt.startingBalance,
				StatementEndingBalance:   tt.endingBalance,
				Status:                   StatementStatusInProgress,
			}

			var lines []*StatementLine
			if tt.setupLines != nil {
				lines = tt.setupLines(spaceID, stmtID, accountID, counterpartID, &deps, txnData, schedData, borData)
				for _, l := range lines {
					if l.Amount < 0 && l.Action.BudgetID == nil {
						l.Action.BudgetID = &bgtID
					}
				}
			}

			_ = deps.StatementStore.Create(context.Background(), stmt, lines)

			svc := NewService(deps)
			completedStmt, err := svc.CompleteStatement(context.Background(), spaceID, stmtID)

			if tt.wantErr {
				if err == nil {
					t.Fatalf("expected error containing %q, got nil", tt.errContains)
				}
				if tt.errContains != "" && !strings.Contains(err.Error(), tt.errContains) {
					t.Errorf("expected error %q, got %q", tt.errContains, err.Error())
				}
				return
			}

			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}

			updatedLines, err := svc.ListStatementLines(context.Background(), spaceID, stmtID)
			if err != nil {
				t.Fatalf("failed to list lines: %v", err)
			}

			if tt.verifyResults != nil {
				tt.verifyResults(t, spaceID, completedStmt, updatedLines, &deps, txnData)
			}
		})
	}
}

func TestService_UpdateStatement(t *testing.T) {
	spaceID := SpaceID("spc_" + ksuid.New().String())
	stmtID := StatementID("stmt_" + ksuid.New().String())
	accID := AccountID("acc_" + ksuid.New().String())

	tests := []struct {
		name       string
		setupStore func() *StatementStoreMock
		updateStmt *Statement
		mask       []string
		wantVer    int64
		wantErr    error
	}{
		{
			name: "successful update increments version",
			setupStore: func() *StatementStoreMock {
				store := newStatementStoreMock(nil, nil)
				_ = store.Create(context.Background(), &Statement{
					ID:                       stmtID,
					SpaceID:                  spaceID,
					AccountID:                accID,
					Status:                   StatementStatusInProgress,
					StatementDate:            time.Date(2026, 8, 1, 0, 0, 0, 0, time.UTC),
					StatementStartingBalance: 1000,
					StatementEndingBalance:   2000,
					Filename:                 "stmt.csv",
					Config:                   StatementConfig{Format: "CSV", CSV: &CSVMapping{}},
					RawContent:               "dummy",
					Version:                  1,
				}, nil)
				return store
			},
			updateStmt: &Statement{
				ID:                     stmtID,
				StatementEndingBalance: 2500,
				Version:                1,
			},
			mask:    []string{"statement_ending_balance", "version"},
			wantVer: 2,
			wantErr: nil,
		},
		{
			name: "stale version returns VersionMismatch",
			setupStore: func() *StatementStoreMock {
				store := newStatementStoreMock(nil, nil)
				_ = store.Create(context.Background(), &Statement{
					ID:                       stmtID,
					SpaceID:                  spaceID,
					AccountID:                accID,
					Status:                   StatementStatusInProgress,
					StatementDate:            time.Date(2026, 8, 1, 0, 0, 0, 0, time.UTC),
					StatementStartingBalance: 1000,
					StatementEndingBalance:   2000,
					Filename:                 "stmt.csv",
					Config:                   StatementConfig{Format: "CSV", CSV: &CSVMapping{}},
					RawContent:               "dummy",
					Version:                  2,
				}, nil)
				return store
			},
			updateStmt: &Statement{
				ID:                     stmtID,
				StatementEndingBalance: 2500,
				Version:                1,
			},
			mask:    []string{"statement_ending_balance", "version"},
			wantErr: errors.E(errors.Conflict, VersionMismatch),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			store := tt.setupStore()
			svc := NewService(Dependencies{StatementStore: store})

			res, err := svc.UpdateStatement(context.Background(), spaceID, tt.updateStmt, tt.mask)
			if tt.wantErr != nil {
				if !errors.Is(err, tt.wantErr) {
					t.Fatalf("expected error %v, got %v", tt.wantErr, err)
				}
				return
			}

			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if res.Version != tt.wantVer {
				t.Errorf("expected version %d, got %d", tt.wantVer, res.Version)
			}
		})
	}
}

func TestService_DeleteStatement(t *testing.T) {
	spaceID := SpaceID("spc_" + ksuid.New().String())
	stmtID := StatementID("stmt_" + ksuid.New().String())
	accID := AccountID("acc_" + ksuid.New().String())

	tests := []struct {
		name       string
		setupStore func() *StatementStoreMock
		opts       DeleteOptions
		wantErr    error
	}{
		{
			name: "successful delete matching version",
			setupStore: func() *StatementStoreMock {
				store := newStatementStoreMock(nil, nil)
				_ = store.Create(context.Background(), &Statement{
					ID:        stmtID,
					SpaceID:   spaceID,
					AccountID: accID,
					Status:    StatementStatusInProgress,
					Version:   2,
				}, nil)
				return store
			},
			opts:    DeleteOptions{Version: 2},
			wantErr: nil,
		},
		{
			name: "version mismatch returns VersionMismatch",
			setupStore: func() *StatementStoreMock {
				store := newStatementStoreMock(nil, nil)
				_ = store.Create(context.Background(), &Statement{
					ID:        stmtID,
					SpaceID:   spaceID,
					AccountID: accID,
					Status:    StatementStatusInProgress,
					Version:   2,
				}, nil)
				return store
			},
			opts:    DeleteOptions{Version: 1},
			wantErr: errors.E(errors.Conflict, VersionMismatch),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			store := tt.setupStore()
			svc := NewService(Dependencies{StatementStore: store})

			err := svc.DeleteStatement(context.Background(), spaceID, stmtID, tt.opts)
			if tt.wantErr != nil {
				if !errors.Is(err, tt.wantErr) {
					t.Fatalf("expected error %v, got %v", tt.wantErr, err)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
		})
	}
}

func TestService_UpdateStatementLine(t *testing.T) {
	spaceID := SpaceID("spc_" + ksuid.New().String())
	stmtID := StatementID("stmt_" + ksuid.New().String())
	lineID := StatementLineID("stln_" + ksuid.New().String())
	accID := AccountID("acc_" + ksuid.New().String())

	tests := []struct {
		name       string
		setupStore func() *StatementStoreMock
		updateLine *StatementLine
		mask       []string
		wantVer    int64
		wantErr    error
	}{
		{
			name: "successful update increments line version",
			setupStore: func() *StatementStoreMock {
				store := newStatementStoreMock(nil, nil)
				_ = store.Create(context.Background(), &Statement{
					ID:        stmtID,
					SpaceID:   spaceID,
					AccountID: accID,
					Status:    StatementStatusInProgress,
					Version:   1,
				}, []*StatementLine{
					{
						ID:          lineID,
						StatementID: stmtID,
						Description: "Coffee",
						Amount:      -500,
						DateStr:     "2026-08-01",
						Status:      StatementLineStatusUnmatched,
						Version:     1,
					},
				})
				return store
			},
			updateLine: &StatementLine{
				ID:      lineID,
				Status:  StatementLineStatusSkipped,
				Version: 1,
			},
			mask:    []string{"status", "version"},
			wantVer: 2,
			wantErr: nil,
		},
		{
			name: "stale line version returns VersionMismatch",
			setupStore: func() *StatementStoreMock {
				store := newStatementStoreMock(nil, nil)
				_ = store.Create(context.Background(), &Statement{
					ID:        stmtID,
					SpaceID:   spaceID,
					AccountID: accID,
					Status:    StatementStatusInProgress,
					Version:   1,
				}, []*StatementLine{
					{
						ID:          lineID,
						StatementID: stmtID,
						Description: "Coffee",
						Amount:      -500,
						DateStr:     "2026-08-01",
						Status:      StatementLineStatusUnmatched,
						Version:     2,
					},
				})
				return store
			},
			updateLine: &StatementLine{
				ID:      lineID,
				Status:  StatementLineStatusSkipped,
				Version: 1,
			},
			mask:    []string{"status", "version"},
			wantErr: errors.E(errors.Conflict, VersionMismatch),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			store := tt.setupStore()
			svc := NewService(Dependencies{StatementStore: store})

			res, err := svc.UpdateStatementLine(context.Background(), spaceID, tt.updateLine, tt.mask)
			if tt.wantErr != nil {
				if !errors.Is(err, tt.wantErr) {
					t.Fatalf("expected error %v, got %v", tt.wantErr, err)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if res.Version != tt.wantVer {
				t.Errorf("expected version %d, got %d", tt.wantVer, res.Version)
			}
		})
	}
}

// --- Tests from service_account_test.go ---

func TestService_AccountsAndCurrencies(t *testing.T) {
	ctx := context.Background()
	validSpace := SpaceID("spc_2dE1V8ZqWz4eS2N9yX3bL1mK7pO")
	validAccID, _ := NewAccountID()

	t.Run("ListCurrencies", func(t *testing.T) {
		svc := NewService(Dependencies{})
		currencies, err := svc.ListCurrencies(ctx)
		if err != nil {
			t.Fatalf("ListCurrencies() error = %v", err)
		}
		if len(currencies) == 0 {
			t.Error("expected non-empty currencies list")
		}
	})

	t.Run("GetAccount", func(t *testing.T) {
		tests := []struct {
			name    string
			spaceID SpaceID
			id      AccountID
			exists  bool
			wantErr bool
		}{
			{
				name:    "valid retrieval",
				spaceID: validSpace,
				id:      validAccID,
				exists:  true,
				wantErr: false,
			},
			{
				name:    "invalid space ID",
				spaceID: "invalid_space",
				id:      validAccID,
				exists:  true,
				wantErr: true,
			},
			{
				name:    "invalid account ID",
				spaceID: validSpace,
				id:      "invalid_acc",
				exists:  true,
				wantErr: true,
			},
			{
				name:    "account not found",
				spaceID: validSpace,
				id:      validAccID,
				exists:  false,
				wantErr: true,
			},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				data := make(map[AccountID]*Account)
				if tt.exists {
					data[validAccID] = &Account{ID: validAccID, SpaceID: validSpace, Name: "Checking"}
				}
				store := newAccountStoreMock(data)
				svc := NewService(Dependencies{AccountStore: store})
				res, err := svc.GetAccount(ctx, tt.spaceID, tt.id)
				if (err != nil) != tt.wantErr {
					t.Errorf("GetAccount() error = %v, wantErr %v", err, tt.wantErr)
				}
				if !tt.wantErr && res.ID != tt.id {
					t.Errorf("res.ID = %v, want %v", res.ID, tt.id)
				}
			})
		}
	})

	t.Run("GetAccounts", func(t *testing.T) {
		tests := []struct {
			name    string
			spaceID SpaceID
			ids     []AccountID
			wantErr bool
		}{
			{
				name:    "valid bulk retrieval",
				spaceID: validSpace,
				ids:     []AccountID{validAccID},
				wantErr: false,
			},
			{
				name:    "invalid space ID",
				spaceID: "invalid_space",
				ids:     []AccountID{validAccID},
				wantErr: true,
			},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				store := newAccountStoreMock(map[AccountID]*Account{
					validAccID: {ID: validAccID, SpaceID: validSpace, Name: "Savings"},
				})
				svc := NewService(Dependencies{AccountStore: store})
				res, err := svc.GetAccounts(ctx, tt.spaceID, tt.ids)
				if (err != nil) != tt.wantErr {
					t.Errorf("GetAccounts() error = %v, wantErr %v", err, tt.wantErr)
				}
				if !tt.wantErr && len(res) != 1 {
					t.Errorf("len(res) = %d, want 1", len(res))
				}
			})
		}
	})

	t.Run("ListAccounts", func(t *testing.T) {
		tests := []struct {
			name    string
			spaceID SpaceID
			wantErr bool
		}{
			{
				name:    "valid list",
				spaceID: validSpace,
				wantErr: false,
			},
			{
				name:    "invalid space ID",
				spaceID: "invalid_space",
				wantErr: true,
			},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				store := newAccountStoreMock(nil)
				svc := NewService(Dependencies{AccountStore: store})
				_, err := svc.ListAccounts(ctx, tt.spaceID, nil)
				if (err != nil) != tt.wantErr {
					t.Errorf("ListAccounts() error = %v, wantErr %v", err, tt.wantErr)
				}
			})
		}
	})
}

func TestService_ResolveAccount_Table(t *testing.T) {
	ctx := context.Background()
	validSpace := SpaceID("spc_2dE1V8ZqWz4eS2N9yX3bL1mK7pO")
	acc1ID, _ := NewAccountID()
	acc2ID, _ := NewAccountID()

	acc1 := &Account{
		ID:             acc1ID,
		SpaceID:        validSpace,
		Name:           "Checking",
		Currency:       "USD",
		LastFour:       "1111",
		IsActive:       true,
		CurrentBalance: 1000,
	}
	acc2 := &Account{
		ID:             acc2ID,
		SpaceID:        validSpace,
		Name:           "Savings",
		Currency:       "EUR",
		LastFour:       "2222",
		IsActive:       true,
		CurrentBalance: 5000,
	}

	tests := []struct {
		name         string
		spaceID      SpaceID
		opts         ResolveAccountOpts
		setupStore   func() *AccountStoreMock
		wantMatchID  AccountID
		wantErr      bool
		wantNilMatch bool
	}{
		{
			name:    "invalid space ID returns error",
			spaceID: "invalid_space",
			opts:    ResolveAccountOpts{},
			setupStore: func() *AccountStoreMock {
				return newAccountStoreMock(nil)
			},
			wantErr: true,
		},
		{
			name:    "empty store returns nil",
			spaceID: validSpace,
			opts:    ResolveAccountOpts{AccountName: "Checking"},
			setupStore: func() *AccountStoreMock {
				return newAccountStoreMock(nil)
			},
			wantNilMatch: true,
		},
		{
			name:    "match by explicit AccountID",
			spaceID: validSpace,
			opts:    ResolveAccountOpts{AccountID: string(acc1ID)},
			setupStore: func() *AccountStoreMock {
				return newAccountStoreMock(map[AccountID]*Account{
					acc1ID: acc1,
					acc2ID: acc2,
				})
			},
			wantMatchID: acc1ID,
		},
		{
			name:    "match by Name and Currency",
			spaceID: validSpace,
			opts:    ResolveAccountOpts{AccountName: "Checking", Currency: "USD"},
			setupStore: func() *AccountStoreMock {
				return newAccountStoreMock(map[AccountID]*Account{
					acc1ID: acc1,
					acc2ID: acc2,
				})
			},
			wantMatchID: acc1ID,
		},
		{
			name:    "match by Name fallback when currency differs",
			spaceID: validSpace,
			opts:    ResolveAccountOpts{AccountName: "Checking", Currency: "CAD"},
			setupStore: func() *AccountStoreMock {
				return newAccountStoreMock(map[AccountID]*Account{
					acc1ID: acc1,
				})
			},
			wantMatchID: acc1ID,
		},
		{
			name:    "match by LastFour and Currency",
			spaceID: validSpace,
			opts:    ResolveAccountOpts{LastFour: "2222", Currency: "EUR"},
			setupStore: func() *AccountStoreMock {
				return newAccountStoreMock(map[AccountID]*Account{
					acc1ID: acc1,
					acc2ID: acc2,
				})
			},
			wantMatchID: acc2ID,
		},
		{
			name:    "single active account fallback when no criteria provided",
			spaceID: validSpace,
			opts:    ResolveAccountOpts{},
			setupStore: func() *AccountStoreMock {
				return newAccountStoreMock(map[AccountID]*Account{
					acc1ID: acc1,
				})
			},
			wantMatchID: acc1ID,
		},
		{
			name:    "multiple accounts and no criteria returns nil",
			spaceID: validSpace,
			opts:    ResolveAccountOpts{},
			setupStore: func() *AccountStoreMock {
				return newAccountStoreMock(map[AccountID]*Account{
					acc1ID: acc1,
					acc2ID: acc2,
				})
			},
			wantNilMatch: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			store := tt.setupStore()
			svc := NewService(Dependencies{AccountStore: store})
			acc, err := svc.ResolveAccount(ctx, tt.spaceID, tt.opts)
			if (err != nil) != tt.wantErr {
				t.Errorf("ResolveAccount() error = %v, wantErr %v", err, tt.wantErr)
			}
			if tt.wantNilMatch && acc != nil {
				t.Errorf("expected nil account, got %+v", acc)
			}
			if tt.wantMatchID != "" {
				if acc == nil || acc.ID != tt.wantMatchID {
					t.Errorf("matched ID = %v, want %v", acc, tt.wantMatchID)
				}
			}
		})
	}
}

func TestService_CreateAccount_Table(t *testing.T) {
	ctx := context.Background()
	validSpace := SpaceID("spc_2dE1V8ZqWz4eS2N9yX3bL1mK7pO")
	existingID, _ := NewAccountID()

	tests := []struct {
		name        string
		account     *Account
		hasAny      bool
		wantDefault bool
		wantErr     bool
	}{
		{
			name: "first account automatically becomes default",
			account: &Account{
				SpaceID:   validSpace,
				Name:      "First Bank",
				Type:      AccountTypeBank,
				Currency:  "USD",
				IsDefault: false,
			},
			hasAny:      false,
			wantDefault: true,
			wantErr:     false,
		},
		{
			name: "subsequent account with IsDefault true",
			account: &Account{
				SpaceID:   validSpace,
				Name:      "Second Card",
				Type:      AccountTypeCreditCard,
				Currency:  "USD",
				IsDefault: true,
			},
			hasAny:      true,
			wantDefault: true,
			wantErr:     false,
		},
		{
			name: "subsequent account with IsDefault false",
			account: &Account{
				SpaceID:   validSpace,
				Name:      "Third Account",
				Type:      AccountTypeBank,
				Currency:  "USD",
				IsDefault: false,
			},
			hasAny:      true,
			wantDefault: false,
			wantErr:     false,
		},
		{
			name: "invalid account fails validation",
			account: &Account{
				SpaceID:  validSpace,
				Name:     "",
				Currency: "USD",
			},
			hasAny:      false,
			wantDefault: false,
			wantErr:     true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			data := make(map[AccountID]*Account)
			if tt.hasAny {
				data[existingID] = &Account{
					ID:        existingID,
					SpaceID:   validSpace,
					IsDefault: true,
					IsActive:  true,
				}
			}
			store := newAccountStoreMock(data)
			svc := NewService(Dependencies{AccountStore: store})
			created, err := svc.CreateAccount(ctx, tt.account)
			if (err != nil) != tt.wantErr {
				t.Errorf("CreateAccount() error = %v, wantErr %v", err, tt.wantErr)
			}
			if !tt.wantErr && created.IsDefault != tt.wantDefault {
				t.Errorf("created.IsDefault = %v, want %v", created.IsDefault, tt.wantDefault)
			}
		})
	}
}

func TestService_UpdateAccount_Table(t *testing.T) {
	ctx := context.Background()
	validSpace := SpaceID("spc_2dE1V8ZqWz4eS2N9yX3bL1mK7pO")
	accID, _ := NewAccountID()
	otherAccID, _ := NewAccountID()

	tests := []struct {
		name       string
		patchAcc   *Account
		mask       []string
		setupStore func() *AccountStoreMock
		wantErr    bool
	}{
		{
			name: "not found",
			patchAcc: &Account{
				ID:      accID,
				SpaceID: validSpace,
			},
			mask: []string{"name"},
			setupStore: func() *AccountStoreMock {
				return newAccountStoreMock(nil)
			},
			wantErr: true,
		},
		{
			name: "version mismatch conflict",
			patchAcc: &Account{
				ID:      accID,
				SpaceID: validSpace,
				Version: 2,
			},
			mask: []string{"name"},
			setupStore: func() *AccountStoreMock {
				return newAccountStoreMock(map[AccountID]*Account{
					accID: {ID: accID, SpaceID: validSpace, Version: 1},
				})
			},
			wantErr: true,
		},
		{
			name: "successful name update",
			patchAcc: &Account{
				ID:      accID,
				SpaceID: validSpace,
				Name:    "Updated Checking",
				Version: 1,
			},
			mask: []string{"name"},
			setupStore: func() *AccountStoreMock {
				return newAccountStoreMock(map[AccountID]*Account{
					accID: {
						ID:       accID,
						SpaceID:  validSpace,
						Name:     "Old Checking",
						Type:     AccountTypeBank,
						Currency: "USD",
						IsActive: true,
						Version:  1,
					},
				})
			},
			wantErr: false,
		},
		{
			name: "make default unsets other defaults",
			patchAcc: &Account{
				ID:        accID,
				SpaceID:   validSpace,
				IsDefault: true,
				Version:   1,
			},
			mask: []string{"is_default"},
			setupStore: func() *AccountStoreMock {
				return newAccountStoreMock(map[AccountID]*Account{
					accID: {
						ID:        accID,
						SpaceID:   validSpace,
						Name:      "Savings",
						Type:      AccountTypeBank,
						Currency:  "USD",
						IsActive:  true,
						IsDefault: false,
						Version:   1,
					},
					otherAccID: {
						ID:        otherAccID,
						SpaceID:   validSpace,
						Name:      "Checking",
						Type:      AccountTypeBank,
						Currency:  "USD",
						IsActive:  true,
						IsDefault: true,
						Version:   1,
					},
				})
			},
			wantErr: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			store := tt.setupStore()
			svc := NewService(Dependencies{AccountStore: store})
			updated, err := svc.UpdateAccount(ctx, tt.patchAcc, tt.mask)
			if (err != nil) != tt.wantErr {
				t.Errorf("UpdateAccount() error = %v, wantErr %v", err, tt.wantErr)
			}
			if !tt.wantErr && updated == nil {
				t.Error("expected non-nil updated account")
			}
		})
	}
}

func TestService_AdjustAccountBalance_Table(t *testing.T) {
	ctx := context.Background()
	validSpace := SpaceID("spc_2dE1V8ZqWz4eS2N9yX3bL1mK7pO")
	accID, _ := NewAccountID()

	tests := []struct {
		name          string
		initBalance   int64
		targetBalance int64
		dateStr       string
		wantErr       bool
	}{
		{
			name:          "target equals current (no delta)",
			initBalance:   5000,
			targetBalance: 5000,
			dateStr:       "2026-08-01",
			wantErr:       false,
		},
		{
			name:          "target differs with date string",
			initBalance:   5000,
			targetBalance: 7500,
			dateStr:       "2026-08-01",
			wantErr:       false,
		},
		{
			name:          "target differs with RFC3339 date",
			initBalance:   5000,
			targetBalance: 3000,
			dateStr:       "2026-08-01T12:00:00Z",
			wantErr:       false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			accStore := newAccountStoreMock(map[AccountID]*Account{
				accID: {
					ID:             accID,
					SpaceID:        validSpace,
					Name:           "Audit Account",
					Type:           AccountTypeBank,
					Currency:       "USD",
					CurrentBalance: tt.initBalance,
					IsActive:       true,
				},
			})
			txnStore := newTransactionStoreMock(nil)
			settingsStore := newSettingsStoreMock(map[SpaceID]*FinanceSettings{
				validSpace: {BaseCurrency: "USD"},
			})
			svc := NewService(Dependencies{
				AccountStore:     accStore,
				TransactionStore: txnStore,
				SettingsStore:    settingsStore,
			})
			res, err := svc.AdjustAccountBalance(ctx, validSpace, accID, tt.targetBalance, tt.dateStr, "Reconciliation")
			if (err != nil) != tt.wantErr {
				t.Errorf("AdjustAccountBalance() error = %v, wantErr %v", err, tt.wantErr)
			}
			if !tt.wantErr && res == nil {
				t.Error("expected non-nil account")
			}
		})
	}
}

func TestService_DeleteAccount_Table(t *testing.T) {
	ctx := context.Background()
	validSpace := SpaceID("spc_2dE1V8ZqWz4eS2N9yX3bL1mK7pO")
	defaultAccID, _ := NewAccountID()
	nonDefaultAccID, _ := NewAccountID()

	tests := []struct {
		name    string
		accID   AccountID
		wantErr bool
	}{
		{
			name:    "cannot delete default account",
			accID:   defaultAccID,
			wantErr: true,
		},
		{
			name:    "can delete non-default account",
			accID:   nonDefaultAccID,
			wantErr: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			store := newAccountStoreMock(map[AccountID]*Account{
				defaultAccID: {
					ID:        defaultAccID,
					SpaceID:   validSpace,
					IsDefault: true,
				},
				nonDefaultAccID: {
					ID:        nonDefaultAccID,
					SpaceID:   validSpace,
					IsDefault: false,
				},
			})
			svc := NewService(Dependencies{AccountStore: store})
			err := svc.DeleteAccount(ctx, validSpace, tt.accID, DeleteOptions{})
			if (err != nil) != tt.wantErr {
				t.Errorf("DeleteAccount() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

// --- Tests from service_borrowing_test.go ---

func TestService_Borrowings(t *testing.T) {
	ctx := context.Background()
	validSpace := SpaceID("spc_2dE1V8ZqWz4eS2N9yX3bL1mK7pO")
	validBID, _ := NewBorrowingID()
	validTID, _ := NewTransactionID()
	validAccID, _ := NewAccountID()
	now := time.Now().UTC()

	t.Run("GetBorrowing", func(t *testing.T) {
		tests := []struct {
			name    string
			spaceID SpaceID
			id      BorrowingID
			exists  bool
			wantErr bool
		}{
			{
				name:    "valid retrieval",
				spaceID: validSpace,
				id:      validBID,
				exists:  true,
				wantErr: false,
			},
			{
				name:    "invalid space ID",
				spaceID: "invalid_space",
				id:      validBID,
				exists:  true,
				wantErr: true,
			},
			{
				name:    "invalid borrowing ID",
				spaceID: validSpace,
				id:      "invalid_bid",
				exists:  true,
				wantErr: true,
			},
			{
				name:    "borrowing not found",
				spaceID: validSpace,
				id:      validBID,
				exists:  false,
				wantErr: true,
			},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				data := make(map[BorrowingID]*Borrowing)
				if tt.exists {
					data[validBID] = &Borrowing{ID: validBID, SpaceID: validSpace, Counterparty: "Alice"}
				}
				store := newBorrowingStoreMock(data)
				svc := NewService(Dependencies{BorrowingStore: store})
				res, err := svc.GetBorrowing(ctx, tt.spaceID, tt.id)
				if (err != nil) != tt.wantErr {
					t.Errorf("GetBorrowing() error = %v, wantErr %v", err, tt.wantErr)
				}
				if !tt.wantErr && res.ID != tt.id {
					t.Errorf("res.ID = %v, want %v", res.ID, tt.id)
				}
			})
		}
	})

	t.Run("ListBorrowings", func(t *testing.T) {
		tests := []struct {
			name    string
			spaceID SpaceID
			wantErr bool
		}{
			{
				name:    "valid list",
				spaceID: validSpace,
				wantErr: false,
			},
			{
				name:    "invalid space ID",
				spaceID: "invalid_space",
				wantErr: true,
			},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				store := newBorrowingStoreMock(nil)
				svc := NewService(Dependencies{BorrowingStore: store})
				_, _, err := svc.ListBorrowings(ctx, tt.spaceID, nil)
				if (err != nil) != tt.wantErr {
					t.Errorf("ListBorrowings() error = %v, wantErr %v", err, tt.wantErr)
				}
			})
		}
	})

	t.Run("UpdateBorrowingTransaction", func(t *testing.T) {
		tests := []struct {
			name      string
			req       UpdateBorrowingTransactionRequest
			setupTxn  bool
			wrongLink bool
			wantErr   bool
		}{
			{
				name: "valid update of repayment",
				req: UpdateBorrowingTransactionRequest{
					SpaceID:         validSpace,
					BorrowingID:     validBID,
					TransactionID:   validTID,
					Type:            BorrowingTransactionTypePayment,
					Amount:          2000,
					TransactionDate: now,
					AccountID:       &validAccID,
				},
				setupTxn:  true,
				wrongLink: false,
				wantErr:   false,
			},
			{
				name: "transaction linked to different borrowing",
				req: UpdateBorrowingTransactionRequest{
					SpaceID:         validSpace,
					BorrowingID:     validBID,
					TransactionID:   validTID,
					Type:            BorrowingTransactionTypePayment,
					Amount:          2000,
					TransactionDate: now,
				},
				setupTxn:  true,
				wrongLink: true,
				wantErr:   true,
			},
			{
				name: "invalid space ID",
				req: UpdateBorrowingTransactionRequest{
					SpaceID:       "invalid_space",
					BorrowingID:   validBID,
					TransactionID: validTID,
				},
				setupTxn: false,
				wantErr:  true,
			},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				bStore := newBorrowingStoreMock(map[BorrowingID]*Borrowing{
					validBID: {
						ID:              validBID,
						SpaceID:         validSpace,
						Direction:       BorrowingDirectionBorrowed,
						Counterparty:    "Bob",
						TotalAmount:     10000,
						RemainingAmount: 5000,
						Currency:        "USD",
						Status:          BorrowingStatusActive,
						EstablishedAt:   now,
					},
				})

				txnMap := make(map[TransactionID]*Transaction)
				if tt.setupTxn {
					linkID := validBID
					if tt.wrongLink {
						linkID = "bor_other"
					}
					txnMap[validTID] = &Transaction{
						ID:              validTID,
						SpaceID:         validSpace,
						Amount:          1000,
						AmountInBase:    1000,
						Currency:        "USD",
						Type:            TransactionTypeExpense,
						TransactionDate: now,
						Metadata: TransactionMetadata{
							BorrowingID:   &linkID,
							BorrowingRole: "REPAYMENT",
						},
					}
				}
				txnStore := newTransactionStoreMock(txnMap)

				setStore := newSettingsStoreMock(map[SpaceID]*FinanceSettings{
					validSpace: {SpaceID: validSpace, BaseCurrency: "USD"},
				})

				accStore := newAccountStoreMock(map[AccountID]*Account{
					validAccID: {
						ID:             validAccID,
						SpaceID:        validSpace,
						Currency:       "USD",
						IsActive:       true,
						CurrentBalance: 20000,
					},
				})

				svc := NewService(Dependencies{
					BorrowingStore:   bStore,
					TransactionStore: txnStore,
					SettingsStore:    setStore,
					AccountStore:     accStore,
				})

				res, err := svc.UpdateBorrowingTransaction(ctx, tt.req)
				if (err != nil) != tt.wantErr {
					t.Errorf("UpdateBorrowingTransaction() error = %v, wantErr %v", err, tt.wantErr)
				}
				if !tt.wantErr && res == nil {
					t.Error("expected non-nil updated transaction")
				}
			})
		}
	})

	t.Run("CreateBorrowing", func(t *testing.T) {
		tests := []struct {
			name                string
			borrowing           *Borrowing
			createAsTransaction bool
			setupStore          func() (*BorrowingStoreMock, *SettingsStoreMock, *AccountStoreMock, *TransactionStoreMock)
			wantErr             bool
		}{
			{
				name: "invalid borrowing properties",
				borrowing: &Borrowing{
					SpaceID:      validSpace,
					Counterparty: "",
					TotalAmount:  0,
				},
				createAsTransaction: false,
				setupStore: func() (*BorrowingStoreMock, *SettingsStoreMock, *AccountStoreMock, *TransactionStoreMock) {
					return newBorrowingStoreMock(nil),
						newSettingsStoreMock(nil),
						newAccountStoreMock(nil),
						newTransactionStoreMock(nil)
				},
				wantErr: true,
			},
			{
				name: "missing workspace settings fails",
				borrowing: &Borrowing{
					ID:              validBID,
					SpaceID:         validSpace,
					Direction:       BorrowingDirectionBorrowed,
					Counterparty:    "Charlie",
					TotalAmount:     10000,
					RemainingAmount: 10000,
					Currency:        "USD",
					Status:          BorrowingStatusActive,
					EstablishedAt:   now,
				},
				createAsTransaction: false,
				setupStore: func() (*BorrowingStoreMock, *SettingsStoreMock, *AccountStoreMock, *TransactionStoreMock) {
					return newBorrowingStoreMock(nil),
						newSettingsStoreMock(nil), // no settings for space
						newAccountStoreMock(nil),
						newTransactionStoreMock(nil)
				},
				wantErr: true,
			},
			{
				name: "createAsTransaction true with missing exchange rate fails",
				borrowing: &Borrowing{
					ID:              validBID,
					SpaceID:         validSpace,
					Direction:       BorrowingDirectionLent,
					Counterparty:    "Charlie",
					TotalAmount:     10000,
					RemainingAmount: 10000,
					Currency:        "EUR",
					Status:          BorrowingStatusActive,
					EstablishedAt:   now,
					AccountID:       nil,
				},
				createAsTransaction: true,
				setupStore: func() (*BorrowingStoreMock, *SettingsStoreMock, *AccountStoreMock, *TransactionStoreMock) {
					return newBorrowingStoreMock(nil),
						newSettingsStoreMock(map[SpaceID]*FinanceSettings{validSpace: {BaseCurrency: "USD"}}),
						newAccountStoreMock(nil),
						newTransactionStoreMock(nil)
				},
				wantErr: true,
			},
			{
				name: "createAsTransaction true with missing account fails",
				borrowing: &Borrowing{
					ID:              validBID,
					SpaceID:         validSpace,
					Direction:       BorrowingDirectionLent,
					Counterparty:    "Charlie",
					TotalAmount:     10000,
					RemainingAmount: 10000,
					Currency:        "USD",
					Status:          BorrowingStatusActive,
					EstablishedAt:   now,
					AccountID:       &validAccID,
				},
				createAsTransaction: true,
				setupStore: func() (*BorrowingStoreMock, *SettingsStoreMock, *AccountStoreMock, *TransactionStoreMock) {
					return newBorrowingStoreMock(nil),
						newSettingsStoreMock(map[SpaceID]*FinanceSettings{validSpace: {BaseCurrency: "USD"}}),
						newAccountStoreMock(nil),
						newTransactionStoreMock(nil)
				},
				wantErr: true,
			},
			{
				name: "valid borrowing without initial transaction",
				borrowing: &Borrowing{
					ID:              validBID,
					SpaceID:         validSpace,
					Direction:       BorrowingDirectionBorrowed,
					Counterparty:    "Charlie",
					TotalAmount:     10000,
					RemainingAmount: 10000,
					Currency:        "USD",
					Status:          BorrowingStatusActive,
					EstablishedAt:   now,
				},
				createAsTransaction: false,
				setupStore: func() (*BorrowingStoreMock, *SettingsStoreMock, *AccountStoreMock, *TransactionStoreMock) {
					return newBorrowingStoreMock(nil),
						newSettingsStoreMock(map[SpaceID]*FinanceSettings{validSpace: {BaseCurrency: "USD"}}),
						newAccountStoreMock(nil),
						newTransactionStoreMock(nil)
				},
				wantErr: false,
			},
			{
				name: "valid borrowing with initial transaction and account",
				borrowing: &Borrowing{
					ID:              validBID,
					SpaceID:         validSpace,
					Direction:       BorrowingDirectionBorrowed,
					Counterparty:    "Charlie",
					TotalAmount:     10000,
					RemainingAmount: 10000,
					Currency:        "USD",
					Status:          BorrowingStatusActive,
					EstablishedAt:   now,
					AccountID:       &validAccID,
				},
				createAsTransaction: true,
				setupStore: func() (*BorrowingStoreMock, *SettingsStoreMock, *AccountStoreMock, *TransactionStoreMock) {
					return newBorrowingStoreMock(nil),
						newSettingsStoreMock(map[SpaceID]*FinanceSettings{validSpace: {BaseCurrency: "USD"}}),
						newAccountStoreMock(map[AccountID]*Account{
							validAccID: {ID: validAccID, SpaceID: validSpace, Currency: "USD", IsActive: true},
						}),
						newTransactionStoreMock(nil)
				},
				wantErr: false,
			},
			{
				name: "valid borrowing with initial transaction updates existing transaction if already present",
				borrowing: &Borrowing{
					ID:              validBID,
					SpaceID:         validSpace,
					Direction:       BorrowingDirectionBorrowed,
					Counterparty:    "Charlie",
					TotalAmount:     10000,
					RemainingAmount: 10000,
					Currency:        "USD",
					Status:          BorrowingStatusActive,
					EstablishedAt:   now,
					AccountID:       &validAccID,
				},
				createAsTransaction: true,
				setupStore: func() (*BorrowingStoreMock, *SettingsStoreMock, *AccountStoreMock, *TransactionStoreMock) {
					return newBorrowingStoreMock(nil),
						newSettingsStoreMock(map[SpaceID]*FinanceSettings{validSpace: {BaseCurrency: "USD"}}),
						newAccountStoreMock(map[AccountID]*Account{
							validAccID: {ID: validAccID, SpaceID: validSpace, Currency: "USD", IsActive: true, CurrentBalance: 20000},
						}),
						newTransactionStoreMock(map[TransactionID]*Transaction{
							validTID: {
								ID:        validTID,
								SpaceID:   validSpace,
								Type:      TransactionTypeIncome,
								Amount:    10000,
								AccountID: &validAccID,
								Metadata: TransactionMetadata{
									BorrowingID:   &validBID,
									BorrowingRole: "INITIAL_FUNDING",
								},
							},
						})
				},
				wantErr: false,
			},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				bStore, setStore, accStore, txnStore := tt.setupStore()
				svc := NewService(Dependencies{
					BorrowingStore:    bStore,
					SettingsStore:     setStore,
					AccountStore:      accStore,
					TransactionStore:  txnStore,
					ExchangeRateStore: newExchangeRateStoreMock(nil),
				})
				res, err := svc.CreateBorrowing(ctx, tt.borrowing, tt.createAsTransaction)
				if (err != nil) != tt.wantErr {
					t.Errorf("CreateBorrowing() error = %v, wantErr %v", err, tt.wantErr)
				}
				if !tt.wantErr && res == nil {
					t.Error("expected non-nil created borrowing")
				}
			})
		}
	})

	t.Run("UpdateBorrowing", func(t *testing.T) {
		tests := []struct {
			name       string
			borrowing  *Borrowing
			mask       []string
			setupStore func() (*BorrowingStoreMock, *SettingsStoreMock, *TransactionStoreMock)
			wantErr    bool
		}{
			{
				name: "not found",
				borrowing: &Borrowing{
					ID:      validBID,
					SpaceID: validSpace,
				},
				mask: []string{"notes"},
				setupStore: func() (*BorrowingStoreMock, *SettingsStoreMock, *TransactionStoreMock) {
					return newBorrowingStoreMock(nil),
						newSettingsStoreMock(nil),
						newTransactionStoreMock(nil)
				},
				wantErr: true,
			},
			{
				name: "successful patch update untouched borrowing",
				borrowing: &Borrowing{
					ID:          validBID,
					SpaceID:     validSpace,
					TotalAmount: 15000,
					Notes:       "Updated note",
					Version:     1,
				},
				mask: []string{"total_amount", "notes"},
				setupStore: func() (*BorrowingStoreMock, *SettingsStoreMock, *TransactionStoreMock) {
					bStore := newBorrowingStoreMock(map[BorrowingID]*Borrowing{
						validBID: {
							ID:              validBID,
							SpaceID:         validSpace,
							Direction:       BorrowingDirectionBorrowed,
							Counterparty:    "Bob",
							TotalAmount:     10000,
							RemainingAmount: 10000,
							Currency:        "USD",
							Status:          BorrowingStatusActive,
							EstablishedAt:   now,
							Version:         1,
						},
					})
					setStore := newSettingsStoreMock(map[SpaceID]*FinanceSettings{validSpace: {BaseCurrency: "USD"}})
					txnStore := newTransactionStoreMock(nil)
					return bStore, setStore, txnStore
				},
				wantErr: false,
			},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				bStore, setStore, txnStore := tt.setupStore()
				svc := NewService(Dependencies{
					BorrowingStore:   bStore,
					SettingsStore:    setStore,
					TransactionStore: txnStore,
				})
				res, err := svc.UpdateBorrowing(ctx, tt.borrowing, tt.mask)
				if (err != nil) != tt.wantErr {
					t.Errorf("UpdateBorrowing() error = %v, wantErr %v", err, tt.wantErr)
				}
				if !tt.wantErr && res == nil {
					t.Error("expected non-nil updated borrowing")
				}
			})
		}
	})

	t.Run("DeleteBorrowing", func(t *testing.T) {
		tests := []struct {
			name       string
			setupStore func() (*BorrowingStoreMock, *TransactionStoreMock)
			wantErr    bool
		}{
			{
				name: "not found",
				setupStore: func() (*BorrowingStoreMock, *TransactionStoreMock) {
					return newBorrowingStoreMock(nil),
						newTransactionStoreMock(nil)
				},
				wantErr: true,
			},
			{
				name: "has linked transactions rejected",
				setupStore: func() (*BorrowingStoreMock, *TransactionStoreMock) {
					bStore := newBorrowingStoreMock(map[BorrowingID]*Borrowing{
						validBID: {ID: validBID, SpaceID: validSpace},
					})
					txnStore := newTransactionStoreMock(map[TransactionID]*Transaction{
						validTID: {
							ID:       validTID,
							SpaceID:  validSpace,
							Metadata: TransactionMetadata{BorrowingID: &validBID},
						},
					})
					return bStore, txnStore
				},
				wantErr: true,
			},
			{
				name: "successful deletion without transactions",
				setupStore: func() (*BorrowingStoreMock, *TransactionStoreMock) {
					bStore := newBorrowingStoreMock(map[BorrowingID]*Borrowing{
						validBID: {ID: validBID, SpaceID: validSpace},
					})
					return bStore, newTransactionStoreMock(nil)
				},
				wantErr: false,
			},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				bStore, txnStore := tt.setupStore()
				svc := NewService(Dependencies{
					BorrowingStore:   bStore,
					TransactionStore: txnStore,
				})
				err := svc.DeleteBorrowing(ctx, validSpace, validBID)
				if (err != nil) != tt.wantErr {
					t.Errorf("DeleteBorrowing() error = %v, wantErr %v", err, tt.wantErr)
				}
			})
		}
	})

	t.Run("DeleteBorrowingTransaction", func(t *testing.T) {
		tests := []struct {
			name       string
			req        DeleteBorrowingTransactionRequest
			setupStore func() (*TransactionStoreMock, *BorrowingStoreMock, *AccountStoreMock)
			wantErr    bool
		}{
			{
				name: "invalid space ID",
				req: DeleteBorrowingTransactionRequest{
					SpaceID:       "invalid",
					BorrowingID:   validBID,
					TransactionID: validTID,
				},
				setupStore: func() (*TransactionStoreMock, *BorrowingStoreMock, *AccountStoreMock) {
					return newTransactionStoreMock(nil),
						newBorrowingStoreMock(nil),
						newAccountStoreMock(nil)
				},
				wantErr: true,
			},
			{
				name: "transaction not found",
				req: DeleteBorrowingTransactionRequest{
					SpaceID:       validSpace,
					BorrowingID:   validBID,
					TransactionID: validTID,
				},
				setupStore: func() (*TransactionStoreMock, *BorrowingStoreMock, *AccountStoreMock) {
					return newTransactionStoreMock(nil),
						newBorrowingStoreMock(nil),
						newAccountStoreMock(nil)
				},
				wantErr: true,
			},
			{
				name: "transaction not linked to this borrowing",
				req: DeleteBorrowingTransactionRequest{
					SpaceID:       validSpace,
					BorrowingID:   validBID,
					TransactionID: validTID,
				},
				setupStore: func() (*TransactionStoreMock, *BorrowingStoreMock, *AccountStoreMock) {
					otherBID := BorrowingID("bor_other")
					return newTransactionStoreMock(map[TransactionID]*Transaction{
							validTID: {
								ID:       validTID,
								SpaceID:  validSpace,
								Metadata: TransactionMetadata{BorrowingID: &otherBID},
							},
						}),
						newBorrowingStoreMock(nil),
						newAccountStoreMock(nil)
				},
				wantErr: true,
			},
			{
				name: "successful deletion",
				req: DeleteBorrowingTransactionRequest{
					SpaceID:       validSpace,
					BorrowingID:   validBID,
					TransactionID: validTID,
				},
				setupStore: func() (*TransactionStoreMock, *BorrowingStoreMock, *AccountStoreMock) {
					return newTransactionStoreMock(map[TransactionID]*Transaction{
							validTID: {
								ID:        validTID,
								SpaceID:   validSpace,
								Type:      TransactionTypeExpense,
								Amount:    1000,
								AccountID: &validAccID,
								Metadata: TransactionMetadata{
									BorrowingID:   &validBID,
									BorrowingRole: "REPAYMENT",
								},
							},
						}),
						newBorrowingStoreMock(map[BorrowingID]*Borrowing{
							validBID: {
								ID:              validBID,
								SpaceID:         validSpace,
								TotalAmount:     10000,
								RemainingAmount: 4000,
								Status:          BorrowingStatusActive,
							},
						}),
						newAccountStoreMock(map[AccountID]*Account{
							validAccID: {
								ID:             validAccID,
								SpaceID:        validSpace,
								CurrentBalance: 5000,
								IsActive:       true,
							},
						})
				},
				wantErr: false,
			},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				txnStore, bStore, accStore := tt.setupStore()
				svc := NewService(Dependencies{
					TransactionStore: txnStore,
					BorrowingStore:   bStore,
					AccountStore:     accStore,
				})
				err := svc.DeleteBorrowingTransaction(ctx, tt.req)
				if (err != nil) != tt.wantErr {
					t.Errorf("DeleteBorrowingTransaction() error = %v, wantErr %v", err, tt.wantErr)
				}
			})
		}
	})
}

// --- Tests from service_budget_test.go ---

func TestService_ListBudgets(t *testing.T) {
	ctx := context.Background()
	validSpace := SpaceID("spc_2dE1V8ZqWz4eS2N9yX3bL1mK7pO")
	bID, _ := NewBudgetID()

	tests := []struct {
		name    string
		spaceID SpaceID
		wantErr bool
	}{
		{
			name:    "valid list",
			spaceID: validSpace,
			wantErr: false,
		},
		{
			name:    "empty space ID",
			spaceID: "",
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			bStore := newBudgetStoreMock(map[BudgetID]*Budget{
				bID: {ID: bID, SpaceID: validSpace, Name: "Food"},
			})
			svc := NewService(Dependencies{BudgetStore: bStore})
			page, err := svc.ListBudgets(ctx, tt.spaceID, &ListBudgetsFilter{})
			if (err != nil) != tt.wantErr {
				t.Errorf("ListBudgets() error = %v, wantErr %v", err, tt.wantErr)
			}
			if !tt.wantErr && page == nil {
				t.Error("expected non-nil page")
			}
		})
	}
}

func TestService_GetBudget(t *testing.T) {
	ctx := context.Background()
	validSpace := SpaceID("spc_2dE1V8ZqWz4eS2N9yX3bL1mK7pO")
	validBID, _ := NewBudgetID()
	notFoundBID, _ := NewBudgetID()

	tests := []struct {
		name     string
		spaceID  SpaceID
		budgetID BudgetID
		wantErr  bool
	}{
		{
			name:     "valid retrieval",
			spaceID:  validSpace,
			budgetID: validBID,
			wantErr:  false,
		},
		{
			name:     "invalid space ID",
			spaceID:  "invalid_space",
			budgetID: validBID,
			wantErr:  true,
		},
		{
			name:     "invalid budget ID",
			spaceID:  validSpace,
			budgetID: "invalid_bid",
			wantErr:  true,
		},
		{
			name:     "budget not found",
			spaceID:  validSpace,
			budgetID: notFoundBID,
			wantErr:  true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			bStore := newBudgetStoreMock(map[BudgetID]*Budget{
				validBID: {ID: validBID, SpaceID: validSpace, Name: "Rent"},
			})
			svc := NewService(Dependencies{BudgetStore: bStore})
			res, err := svc.GetBudget(ctx, tt.spaceID, tt.budgetID)
			if (err != nil) != tt.wantErr {
				t.Errorf("GetBudget() error = %v, wantErr %v", err, tt.wantErr)
			}
			if !tt.wantErr && res.ID != tt.budgetID {
				t.Errorf("res.ID = %v, want %v", res.ID, tt.budgetID)
			}
		})
	}
}

func TestService_GetBudgets(t *testing.T) {
	ctx := context.Background()
	validSpace := SpaceID("spc_2dE1V8ZqWz4eS2N9yX3bL1mK7pO")
	validBID, _ := NewBudgetID()

	tests := []struct {
		name    string
		spaceID SpaceID
		ids     []BudgetID
		wantErr bool
	}{
		{
			name:    "valid bulk retrieval",
			spaceID: validSpace,
			ids:     []BudgetID{validBID},
			wantErr: false,
		},
		{
			name:    "invalid space ID",
			spaceID: "invalid_space",
			ids:     []BudgetID{validBID},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			bStore := newBudgetStoreMock(map[BudgetID]*Budget{
				validBID: {ID: validBID, SpaceID: validSpace, Name: "Utilities"},
			})
			svc := NewService(Dependencies{BudgetStore: bStore})
			res, err := svc.GetBudgets(ctx, tt.spaceID, tt.ids)
			if (err != nil) != tt.wantErr {
				t.Errorf("GetBudgets() error = %v, wantErr %v", err, tt.wantErr)
			}
			if !tt.wantErr && len(res) != 1 {
				t.Errorf("len(res) = %d, want 1", len(res))
			}
		})
	}
}

func TestService_GetOrCreatePeriods(t *testing.T) {
	ctx := context.Background()
	validSpace := SpaceID("spc_2dE1V8ZqWz4eS2N9yX3bL1mK7pO")
	bID, _ := NewBudgetID()
	now := time.Date(2026, 8, 15, 0, 0, 0, 0, time.UTC)

	budget := &Budget{
		ID:          bID,
		SpaceID:     validSpace,
		Name:        "Entertainment",
		LimitAmount: 50000,
		Currency:    "USD",
		Interval:    IntervalMonthly,
		Status:      BudgetStatusActive,
	}

	tests := []struct {
		name          string
		budgets       []*Budget
		setupSettings bool
		setupPeriod   bool
		wantErr       bool
	}{
		{
			name:    "empty budgets returns empty map",
			budgets: []*Budget{},
			wantErr: false,
		},
		{
			name:          "missing settings causes error",
			budgets:       []*Budget{budget},
			setupSettings: false,
			wantErr:       true,
		},
		{
			name:          "lazily creates missing period",
			budgets:       []*Budget{budget},
			setupSettings: true,
			setupPeriod:   false,
			wantErr:       false,
		},
		{
			name:          "reuses existing period",
			budgets:       []*Budget{budget},
			setupSettings: true,
			setupPeriod:   true,
			wantErr:       false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			sStoreData := make(map[SpaceID]*FinanceSettings)
			if tt.setupSettings {
				sStoreData[validSpace] = &FinanceSettings{SpaceID: validSpace, BaseCurrency: "USD"}
			}
			sStore := newSettingsStoreMock(sStoreData)

			pStore := newPeriodStoreMock(nil)
			if tt.setupPeriod {
				start, end := budget.CalculateBounds(now)
				p := &BudgetPeriod{
					ID:                 "bgp_existing",
					BudgetID:           bID,
					SpaceID:            validSpace,
					StartDate:          start,
					EndDate:            end,
					LimitAmount:        50000,
					Currency:           "USD",
					BaseCurrency:       "USD",
					ExchangeRateToBase: 1.0,
				}
				_ = pStore.Create(ctx, p)
			}

			rateStore := newExchangeRateStoreMock(nil)
			svc := NewService(Dependencies{
				SettingsStore:     sStore,
				PeriodStore:       pStore,
				ExchangeRateStore: rateStore,
			})

			res, err := svc.GetOrCreatePeriods(ctx, tt.budgets, now)
			if (err != nil) != tt.wantErr {
				t.Errorf("GetOrCreatePeriods() error = %v, wantErr %v", err, tt.wantErr)
			}
			if !tt.wantErr && len(tt.budgets) > 0 && res[bID] == nil {
				t.Error("expected period in result map")
			}
		})
	}
}

func TestService_UpdatePeriodLimit(t *testing.T) {
	ctx := context.Background()
	validPID, _ := NewPeriodID()

	tests := []struct {
		name     string
		periodID PeriodID
		newLimit int64
		exists   bool
		wantErr  bool
	}{
		{
			name:     "valid update",
			periodID: validPID,
			newLimit: 60000,
			exists:   true,
			wantErr:  false,
		},
		{
			name:     "invalid non-positive limit",
			periodID: validPID,
			newLimit: 0,
			exists:   true,
			wantErr:  true,
		},
		{
			name:     "period not found",
			periodID: validPID,
			newLimit: 60000,
			exists:   false,
			wantErr:  true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			pData := make(map[string]*BudgetPeriod)
			if tt.exists {
				pData["key"] = &BudgetPeriod{ID: tt.periodID, LimitAmount: 50000}
			}
			pStore := newPeriodStoreMock(pData)
			svc := NewService(Dependencies{PeriodStore: pStore})
			err := svc.UpdatePeriodLimit(ctx, tt.periodID, tt.newLimit)
			if (err != nil) != tt.wantErr {
				t.Errorf("UpdatePeriodLimit() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

func TestService_BudgetCRUD_Table(t *testing.T) {
	ctx := context.Background()
	validSpace := SpaceID("spc_2dE1V8ZqWz4eS2N9yX3bL1mK7pO")
	validBID, _ := NewBudgetID()

	t.Run("CreateBudget", func(t *testing.T) {
		tests := []struct {
			name       string
			budget     *Budget
			setupStore func() (*BudgetStoreMock, *SettingsStoreMock)
			wantErr    bool
		}{
			{
				name: "invalid budget validation",
				budget: &Budget{
					SpaceID: validSpace,
					Name:    "",
				},
				setupStore: func() (*BudgetStoreMock, *SettingsStoreMock) {
					return newBudgetStoreMock(nil),
						newSettingsStoreMock(nil)
				},
				wantErr: true,
			},
			{
				name: "missing space settings",
				budget: &Budget{
					ID:          validBID,
					SpaceID:     validSpace,
					Name:        "Groceries",
					LimitAmount: 50000,
					Currency:    "USD",
					Interval:    IntervalMonthly,
				},
				setupStore: func() (*BudgetStoreMock, *SettingsStoreMock) {
					return newBudgetStoreMock(nil),
						newSettingsStoreMock(nil)
				},
				wantErr: true,
			},
			{
				name: "successful budget creation",
				budget: &Budget{
					ID:          validBID,
					SpaceID:     validSpace,
					Name:        "Groceries",
					LimitAmount: 50000,
					Currency:    "USD",
					Interval:    IntervalMonthly,
				},
				setupStore: func() (*BudgetStoreMock, *SettingsStoreMock) {
					return newBudgetStoreMock(nil),
						newSettingsStoreMock(map[SpaceID]*FinanceSettings{
							validSpace: {BaseCurrency: "USD"},
						})
				},
				wantErr: false,
			},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				bStore, setStore := tt.setupStore()
				svc := NewService(Dependencies{
					BudgetStore:   bStore,
					SettingsStore: setStore,
				})
				res, err := svc.CreateBudget(ctx, tt.budget)
				if (err != nil) != tt.wantErr {
					t.Errorf("CreateBudget() error = %v, wantErr %v", err, tt.wantErr)
				}
				if !tt.wantErr && res == nil {
					t.Error("expected non-nil created budget")
				}
			})
		}
	})

	t.Run("UpdateBudget", func(t *testing.T) {
		tests := []struct {
			name       string
			budget     *Budget
			mask       []string
			setupStore func() *BudgetStoreMock
			wantErr    bool
		}{
			{
				name: "budget not found",
				budget: &Budget{
					ID:      validBID,
					SpaceID: validSpace,
					Name:    "Dining",
				},
				mask: []string{"name"},
				setupStore: func() *BudgetStoreMock {
					return newBudgetStoreMock(nil)
				},
				wantErr: true,
			},
			{
				name: "successful update",
				budget: &Budget{
					ID:      validBID,
					SpaceID: validSpace,
					Name:    "Dining Out",
					Version: 1,
				},
				mask: []string{"name"},
				setupStore: func() *BudgetStoreMock {
					return newBudgetStoreMock(map[BudgetID]*Budget{
						validBID: {
							ID:          validBID,
							SpaceID:     validSpace,
							Name:        "Dining",
							LimitAmount: 40000,
							Currency:    "USD",
							Interval:    IntervalMonthly,
							Version:     1,
						},
					})
				},
				wantErr: false,
			},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				bStore := tt.setupStore()
				svc := NewService(Dependencies{BudgetStore: bStore})
				res, err := svc.UpdateBudget(ctx, tt.budget, tt.mask)
				if (err != nil) != tt.wantErr {
					t.Errorf("UpdateBudget() error = %v, wantErr %v", err, tt.wantErr)
				}
				if !tt.wantErr && res == nil {
					t.Error("expected non-nil updated budget")
				}
			})
		}
	})

	t.Run("DeleteBudget", func(t *testing.T) {
		tests := []struct {
			name       string
			spaceID    SpaceID
			budgetID   BudgetID
			setupStore func() (*BudgetStoreMock, *TransactionStoreMock, *ScheduledTransactionStoreMock)
			wantErr    bool
		}{
			{
				name:     "empty budget ID",
				spaceID:  validSpace,
				budgetID: "",
				setupStore: func() (*BudgetStoreMock, *TransactionStoreMock, *ScheduledTransactionStoreMock) {
					return newBudgetStoreMock(nil),
						newTransactionStoreMock(nil),
						newScheduledTransactionStoreMock(nil)
				},
				wantErr: true,
			},
			{
				name:     "has transactions rejected",
				spaceID:  validSpace,
				budgetID: validBID,
				setupStore: func() (*BudgetStoreMock, *TransactionStoreMock, *ScheduledTransactionStoreMock) {
					tID, _ := NewTransactionID()
					return newBudgetStoreMock(map[BudgetID]*Budget{validBID: {ID: validBID, SpaceID: validSpace}}),
						newTransactionStoreMock(map[TransactionID]*Transaction{
							tID: {ID: tID, SpaceID: validSpace, BudgetID: &validBID},
						}),
						newScheduledTransactionStoreMock(nil)
				},
				wantErr: true,
			},
			{
				name:     "successful delete",
				spaceID:  validSpace,
				budgetID: validBID,
				setupStore: func() (*BudgetStoreMock, *TransactionStoreMock, *ScheduledTransactionStoreMock) {
					return newBudgetStoreMock(map[BudgetID]*Budget{validBID: {ID: validBID, SpaceID: validSpace}}),
						newTransactionStoreMock(nil),
						newScheduledTransactionStoreMock(nil)
				},
				wantErr: false,
			},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				bStore, txnStore, schedStore := tt.setupStore()
				svc := NewService(Dependencies{
					BudgetStore:               bStore,
					TransactionStore:          txnStore,
					ScheduledTransactionStore: schedStore,
				})
				err := svc.DeleteBudget(ctx, tt.spaceID, tt.budgetID, DeleteOptions{})
				if (err != nil) != tt.wantErr {
					t.Errorf("DeleteBudget() error = %v, wantErr %v", err, tt.wantErr)
				}
			})
		}
	})
}

func TestService_AggregateSpentBatch(t *testing.T) {
	ctx := context.Background()
	pID, _ := NewPeriodID()

	tests := []struct {
		name       string
		setupStore func() *TransactionStoreMock
		wantLen    int
		wantErr    bool
	}{
		{
			name: "nil store returns nil",
			setupStore: func() *TransactionStoreMock {
				return nil
			},
			wantLen: 0,
			wantErr: false,
		},
		{
			name: "with store returns period spent",
			setupStore: func() *TransactionStoreMock {
				return newTransactionStoreMock(nil)
			},
			wantLen: 1,
			wantErr: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			store := tt.setupStore()
			var txnStore TransactionStore
			if store != nil {
				txnStore = store
			}
			svc := NewService(Dependencies{TransactionStore: txnStore})
			res, err := svc.AggregateSpentBatch(ctx, []PeriodID{pID})
			if (err != nil) != tt.wantErr {
				t.Errorf("AggregateSpentBatch() error = %v, wantErr %v", err, tt.wantErr)
			}
			if len(res) != tt.wantLen {
				t.Errorf("len(res) = %d, want %d", len(res), tt.wantLen)
			}
		})
	}
}

// --- Tests from service_inbox_test.go ---

func TestService_ListInboxItems(t *testing.T) {
	ctx := context.Background()
	validSpace := SpaceID("spc_2dE1V8ZqWz4eS2N9yX3bL1mK7pO")

	tests := []struct {
		name    string
		spaceID SpaceID
		wantErr bool
	}{
		{
			name:    "valid list",
			spaceID: validSpace,
			wantErr: false,
		},
		{
			name:    "invalid space ID",
			spaceID: "invalid_space",
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			store := newInboxItemStoreMock(map[string]*InboxItem{
				"item_1": {ID: "item_1", SpaceID: string(validSpace)},
			})
			svc := NewService(Dependencies{InboxItemStore: store})
			res, err := svc.ListInboxItems(ctx, tt.spaceID, nil)
			if (err != nil) != tt.wantErr {
				t.Errorf("ListInboxItems() error = %v, wantErr %v", err, tt.wantErr)
			}
			if !tt.wantErr && res == nil {
				t.Error("expected non-nil page")
			}
		})
	}
}

func TestService_UpdateInboxItem(t *testing.T) {
	ctx := context.Background()
	validSpace := SpaceID("spc_2dE1V8ZqWz4eS2N9yX3bL1mK7pO")
	dummyAcc := "acc_test123"
	dummyBgt := "bgt_test123"
	dummyPay := "sch_test123"
	dummyTxn := "txn_test123"
	dummyBrw := "brw_test123"

	tests := []struct {
		name       string
		spaceID    SpaceID
		item       *InboxItem
		setupStore func() *InboxItemStoreMock
		wantErr    bool
		checkItem  func(t *testing.T, res *InboxItem)
	}{
		{
			name:    "invalid space ID",
			spaceID: "invalid_space",
			item:    &InboxItem{ID: "ibx_1"},
			setupStore: func() *InboxItemStoreMock {
				return newInboxItemStoreMock(nil)
			},
			wantErr: true,
		},
		{
			name:    "missing item ID",
			spaceID: validSpace,
			item:    &InboxItem{},
			setupStore: func() *InboxItemStoreMock {
				return newInboxItemStoreMock(nil)
			},
			wantErr: true,
		},
		{
			name:    "item not found in store",
			spaceID: validSpace,
			item:    &InboxItem{ID: "ibx_notfound"},
			setupStore: func() *InboxItemStoreMock {
				return newInboxItemStoreMock(nil)
			},
			wantErr: true,
		},
		{
			name:    "fallback to existing fields when incoming fields are empty",
			spaceID: validSpace,
			item: &InboxItem{
				ID: "ibx_1",
			},
			setupStore: func() *InboxItemStoreMock {
				return newInboxItemStoreMock(map[string]*InboxItem{
					"ibx_1": {
						ID:                     "ibx_1",
						SpaceID:                string(validSpace),
						Status:                 InboxItemPending,
						DocType:                InboxItemDocReceipt,
						Amount:                 2500,
						Currency:               "USD",
						VendorName:             "Supermarket",
						AccountID:              &dummyAcc,
						BudgetID:               &dummyBgt,
						ScheduledTransactionID: &dummyPay,
						TransactionID:          &dummyTxn,
						BorrowingID:            &dummyBrw,
					},
				})
			},
			wantErr: false,
			checkItem: func(t *testing.T, res *InboxItem) {
				if res.Amount != 2500 || res.VendorName != "Supermarket" || res.Currency != "USD" {
					t.Errorf("expected existing fields retained, got %+v", res)
				}
				if res.AccountID == nil || *res.AccountID != dummyAcc {
					t.Errorf("expected account ID retained, got %v", res.AccountID)
				}
			},
		},
		{
			name:    "explicit overrides update all fields",
			spaceID: validSpace,
			item: &InboxItem{
				ID:                     "ibx_1",
				Status:                 InboxItemProcessing,
				DocType:                InboxItemDocInvoice,
				Amount:                 9900,
				Currency:               "EUR",
				VendorName:             "Hardware Store",
				AccountID:              &dummyAcc,
				BudgetID:               &dummyBgt,
				ScheduledTransactionID: &dummyPay,
				TransactionID:          &dummyTxn,
				BorrowingID:            &dummyBrw,
			},
			setupStore: func() *InboxItemStoreMock {
				return newInboxItemStoreMock(map[string]*InboxItem{
					"ibx_1": {
						ID:         "ibx_1",
						SpaceID:    string(validSpace),
						Status:     InboxItemPending,
						DocType:    InboxItemDocReceipt,
						Amount:     1000,
						Currency:   "USD",
						VendorName: "Old",
					},
				})
			},
			wantErr: false,
			checkItem: func(t *testing.T, res *InboxItem) {
				if res.Amount != 9900 || res.VendorName != "Hardware Store" || res.Currency != "EUR" {
					t.Errorf("expected updated fields, got %+v", res)
				}
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			store := tt.setupStore()
			svc := NewService(Dependencies{InboxItemStore: store})
			res, err := svc.UpdateInboxItem(ctx, tt.spaceID, tt.item)
			if (err != nil) != tt.wantErr {
				t.Errorf("UpdateInboxItem() error = %v, wantErr %v", err, tt.wantErr)
			}
			if !tt.wantErr && tt.checkItem != nil {
				tt.checkItem(t, res)
			}
		})
	}
}

func TestService_DiscardInboxItem(t *testing.T) {
	ctx := context.Background()
	validSpace := SpaceID("spc_2dE1V8ZqWz4eS2N9yX3bL1mK7pO")

	tests := []struct {
		name    string
		spaceID SpaceID
		itemID  string
		wantErr bool
	}{
		{
			name:    "invalid space ID",
			spaceID: "invalid_space",
			itemID:  "ibx_1",
			wantErr: true,
		},
		{
			name:    "valid discard item",
			spaceID: validSpace,
			itemID:  "ibx_1",
			wantErr: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			store := newInboxItemStoreMock(map[string]*InboxItem{
				"ibx_1": {ID: "ibx_1", SpaceID: string(validSpace)},
			})
			svc := NewService(Dependencies{InboxItemStore: store})
			err := svc.DiscardInboxItem(ctx, tt.spaceID, tt.itemID)
			if (err != nil) != tt.wantErr {
				t.Errorf("DiscardInboxItem() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

func TestService_ApproveInboxItem_Extended(t *testing.T) {
	ctx := context.Background()
	validSpace := SpaceID("spc_2dE1V8ZqWz4eS2N9yX3bL1mK7pO")
	now := time.Now().UTC()

	validAccID, _ := NewAccountID()
	accIDStr := string(validAccID)
	validBID, _ := NewBudgetID()
	bgtIDStr := string(validBID)
	validTxnID, _ := NewTransactionID()
	txnIDStr := string(validTxnID)
	validPID, _ := NewScheduledTransactionID()
	payIDStr := string(validPID)
	validBrwID, _ := NewBorrowingID()
	brwIDStr := string(validBrwID)

	t.Run("Validation and NotPending errors", func(t *testing.T) {
		tests := []struct {
			name       string
			spaceID    SpaceID
			itemID     string
			setupStore func() *InboxItemStoreMock
			wantErr    bool
		}{
			{
				name:    "invalid space ID",
				spaceID: "invalid_space",
				itemID:  "ibx_1",
				setupStore: func() *InboxItemStoreMock {
					return newInboxItemStoreMock(nil)
				},
				wantErr: true,
			},
			{
				name:    "item not found",
				spaceID: validSpace,
				itemID:  "ibx_nonexistent",
				setupStore: func() *InboxItemStoreMock {
					return newInboxItemStoreMock(nil)
				},
				wantErr: true,
			},
			{
				name:    "item already resolved fails EnsurePending",
				spaceID: validSpace,
				itemID:  "ibx_resolved",
				setupStore: func() *InboxItemStoreMock {
					return newInboxItemStoreMock(map[string]*InboxItem{
						"ibx_resolved": {
							ID:      "ibx_resolved",
							SpaceID: string(validSpace),
							Status:  InboxItemResolved,
						},
					})
				},
				wantErr: true,
			},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				store := tt.setupStore()
				svc := NewService(Dependencies{InboxItemStore: store})
				_, err := svc.ApproveInboxItem(ctx, tt.spaceID, tt.itemID)
				if (err != nil) != tt.wantErr {
					t.Errorf("ApproveInboxItem() error = %v, wantErr %v", err, tt.wantErr)
				}
			})
		}
	})

	t.Run("approveLinkedTransaction edge cases", func(t *testing.T) {
		tests := []struct {
			name        string
			item        *InboxItem
			setupStores func() (Dependencies, *Transaction)
			wantErr     bool
		}{
			{
				name: "invalid transaction ID format in item",
				item: &InboxItem{
					ID:            "ibx_1",
					SpaceID:       string(validSpace),
					Status:        InboxItemPending,
					TransactionID: new(string),
				},
				setupStores: func() (Dependencies, *Transaction) {
					invalidStr := "not_a_valid_txn_id"
					ibx := &InboxItem{
						ID:            "ibx_1",
						SpaceID:       string(validSpace),
						Status:        InboxItemPending,
						TransactionID: &invalidStr,
					}
					return Dependencies{
						InboxItemStore: newInboxItemStoreMock(map[string]*InboxItem{"ibx_1": ibx}),
					}, nil
				},
				wantErr: true,
			},
			{
				name: "transaction not found in store",
				item: &InboxItem{
					ID:            "ibx_1",
					SpaceID:       string(validSpace),
					Status:        InboxItemPending,
					TransactionID: &txnIDStr,
				},
				setupStores: func() (Dependencies, *Transaction) {
					return Dependencies{
						InboxItemStore:   newInboxItemStoreMock(map[string]*InboxItem{"ibx_1": {ID: "ibx_1", SpaceID: string(validSpace), Status: InboxItemPending, TransactionID: &txnIDStr}}),
						TransactionStore: newTransactionStoreMock(nil),
					}, nil
				},
				wantErr: true,
			},
			{
				name: "cannot link receipt to transfer transaction",
				item: &InboxItem{
					ID:            "ibx_1",
					SpaceID:       string(validSpace),
					Status:        InboxItemPending,
					TransactionID: &txnIDStr,
				},
				setupStores: func() (Dependencies, *Transaction) {
					txn := &Transaction{
						ID:       validTxnID,
						SpaceID:  validSpace,
						Type:     TransactionTypeTransferOut,
						Amount:   1000,
						Currency: "USD",
					}
					return Dependencies{
						InboxItemStore:   newInboxItemStoreMock(map[string]*InboxItem{"ibx_1": {ID: "ibx_1", SpaceID: string(validSpace), Status: InboxItemPending, TransactionID: &txnIDStr}}),
						TransactionStore: newTransactionStoreMock(map[TransactionID]*Transaction{validTxnID: txn}),
					}, txn
				},
				wantErr: true,
			},
			{
				name: "link borrowing repayment reducing remaining amount to zero",
				item: &InboxItem{
					ID:                "ibx_1",
					SpaceID:           string(validSpace),
					Status:            InboxItemPending,
					Amount:            1000,
					Currency:          "USD",
					TransactionID:     &txnIDStr,
					BorrowingID:       &brwIDStr,
					BorrowingLinkType: new(BorrowingLinkType),
				},
				setupStores: func() (Dependencies, *Transaction) {
					repayType := BorrowingLinkTypeRepayment
					ibx := &InboxItem{
						ID:                "ibx_1",
						SpaceID:           string(validSpace),
						Status:            InboxItemPending,
						Amount:            1000,
						Currency:          "USD",
						TransactionID:     &txnIDStr,
						BorrowingID:       &brwIDStr,
						BorrowingLinkType: &repayType,
					}
					txn := &Transaction{
						ID:        validTxnID,
						SpaceID:   validSpace,
						Type:      TransactionTypeExpense,
						AccountID: &validAccID,
						Amount:    1000,
						Currency:  "USD",
					}
					brw := &Borrowing{
						ID:              validBrwID,
						SpaceID:         validSpace,
						TotalAmount:     1000,
						RemainingAmount: 1000,
						Status:          BorrowingStatusActive,
					}
					return Dependencies{
						InboxItemStore:        newInboxItemStoreMock(map[string]*InboxItem{"ibx_1": ibx}),
						TransactionStore:      newTransactionStoreMock(map[TransactionID]*Transaction{validTxnID: txn}),
						BorrowingStore:        newBorrowingStoreMock(map[BorrowingID]*Borrowing{validBrwID: brw}),
						TransactionEventStore: newTransactionEventStoreMock(nil),
					}, txn
				},
				wantErr: false,
			},
			{
				name: "link borrowing additional loan increasing total and remaining amount",
				item: &InboxItem{
					ID:                "ibx_1",
					SpaceID:           string(validSpace),
					Status:            InboxItemPending,
					Amount:            500,
					Currency:          "USD",
					TransactionID:     &txnIDStr,
					BorrowingID:       &brwIDStr,
					BorrowingLinkType: new(BorrowingLinkType),
				},
				setupStores: func() (Dependencies, *Transaction) {
					loanType := BorrowingLinkTypeAdditionalLoan
					ibx := &InboxItem{
						ID:                "ibx_1",
						SpaceID:           string(validSpace),
						Status:            InboxItemPending,
						Amount:            500,
						Currency:          "USD",
						TransactionID:     &txnIDStr,
						BorrowingID:       &brwIDStr,
						BorrowingLinkType: &loanType,
					}
					txn := &Transaction{
						ID:        validTxnID,
						SpaceID:   validSpace,
						Type:      TransactionTypeIncome,
						AccountID: &validAccID,
						Amount:    500,
						Currency:  "USD",
					}
					brw := &Borrowing{
						ID:              validBrwID,
						SpaceID:         validSpace,
						TotalAmount:     1000,
						RemainingAmount: 1000,
						Status:          BorrowingStatusActive,
					}
					return Dependencies{
						InboxItemStore:        newInboxItemStoreMock(map[string]*InboxItem{"ibx_1": ibx}),
						TransactionStore:      newTransactionStoreMock(map[TransactionID]*Transaction{validTxnID: txn}),
						BorrowingStore:        newBorrowingStoreMock(map[BorrowingID]*Borrowing{validBrwID: brw}),
						TransactionEventStore: newTransactionEventStoreMock(nil),
					}, txn
				},
				wantErr: false,
			},
			{
				name: "relink borrowing to different borrowing fails",
				item: &InboxItem{
					ID:            "ibx_1",
					SpaceID:       string(validSpace),
					Status:        InboxItemPending,
					Amount:        500,
					Currency:      "USD",
					TransactionID: &txnIDStr,
					BorrowingID:   &brwIDStr,
				},
				setupStores: func() (Dependencies, *Transaction) {
					otherBrwID, _ := NewBorrowingID()
					ibx := &InboxItem{
						ID:            "ibx_1",
						SpaceID:       string(validSpace),
						Status:        InboxItemPending,
						Amount:        500,
						Currency:      "USD",
						TransactionID: &txnIDStr,
						BorrowingID:   &brwIDStr,
					}
					txn := &Transaction{
						ID:        validTxnID,
						SpaceID:   validSpace,
						Type:      TransactionTypeExpense,
						AccountID: &validAccID,
						Amount:    500,
						Currency:  "USD",
						Metadata: TransactionMetadata{
							BorrowingID: &otherBrwID,
						},
					}
					brw := &Borrowing{
						ID:              validBrwID,
						SpaceID:         validSpace,
						TotalAmount:     1000,
						RemainingAmount: 1000,
					}
					return Dependencies{
						InboxItemStore:   newInboxItemStoreMock(map[string]*InboxItem{"ibx_1": ibx}),
						TransactionStore: newTransactionStoreMock(map[TransactionID]*Transaction{validTxnID: txn}),
						BorrowingStore:   newBorrowingStoreMock(map[BorrowingID]*Borrowing{validBrwID: brw}),
					}, txn
				},
				wantErr: true,
			},
			{
				name: "relink scheduled transaction to different scheduled transaction fails",
				item: &InboxItem{
					ID:                     "ibx_1",
					SpaceID:                string(validSpace),
					Status:                 InboxItemPending,
					Amount:                 500,
					Currency:               "USD",
					TransactionID:          &txnIDStr,
					ScheduledTransactionID: &payIDStr,
				},
				setupStores: func() (Dependencies, *Transaction) {
					otherPayID, _ := NewScheduledTransactionID()
					ibx := &InboxItem{
						ID:                     "ibx_1",
						SpaceID:                string(validSpace),
						Status:                 InboxItemPending,
						Amount:                 500,
						Currency:               "USD",
						TransactionID:          &txnIDStr,
						ScheduledTransactionID: &payIDStr,
					}
					txn := &Transaction{
						ID:        validTxnID,
						SpaceID:   validSpace,
						Type:      TransactionTypeExpense,
						AccountID: &validAccID,
						Amount:    500,
						Currency:  "USD",
						Metadata: TransactionMetadata{
							ScheduledTransactionID: &otherPayID,
						},
					}
					payment := &ScheduledTransaction{
						ID:      validPID,
						SpaceID: validSpace,
						Amount:  500,
					}
					return Dependencies{
						InboxItemStore:            newInboxItemStoreMock(map[string]*InboxItem{"ibx_1": ibx}),
						TransactionStore:          newTransactionStoreMock(map[TransactionID]*Transaction{validTxnID: txn}),
						ScheduledTransactionStore: newScheduledTransactionStoreMock(map[ScheduledTransactionID]*ScheduledTransaction{validPID: payment}),
					}, txn
				},
				wantErr: true,
			},
			{
				name: "link scheduled transaction to transaction successfully marks payment paid",
				item: &InboxItem{
					ID:                     "ibx_1",
					SpaceID:                string(validSpace),
					Status:                 InboxItemPending,
					Amount:                 500,
					Currency:               "USD",
					TransactionID:          &txnIDStr,
					ScheduledTransactionID: &payIDStr,
				},
				setupStores: func() (Dependencies, *Transaction) {
					ibx := &InboxItem{
						ID:                     "ibx_1",
						SpaceID:                string(validSpace),
						Status:                 InboxItemPending,
						Amount:                 500,
						Currency:               "USD",
						TransactionID:          &txnIDStr,
						ScheduledTransactionID: &payIDStr,
					}
					txn := &Transaction{
						ID:        validTxnID,
						SpaceID:   validSpace,
						Type:      TransactionTypeExpense,
						AccountID: &validAccID,
						Amount:    500,
						Currency:  "USD",
					}
					payment := &ScheduledTransaction{
						ID:      validPID,
						SpaceID: validSpace,
						Amount:  500,
						Status:  ScheduledTransactionPending,
					}
					return Dependencies{
						InboxItemStore:            newInboxItemStoreMock(map[string]*InboxItem{"ibx_1": ibx}),
						TransactionStore:          newTransactionStoreMock(map[TransactionID]*Transaction{validTxnID: txn}),
						ScheduledTransactionStore: newScheduledTransactionStoreMock(map[ScheduledTransactionID]*ScheduledTransaction{validPID: payment}),
						TransactionEventStore:     newTransactionEventStoreMock(nil),
					}, txn
				},
				wantErr: false,
			},
			{
				name: "relink to same scheduled transaction with status pending updates status to paid",
				item: &InboxItem{
					ID:                     "ibx_1",
					SpaceID:                string(validSpace),
					Status:                 InboxItemPending,
					Amount:                 500,
					Currency:               "USD",
					TransactionID:          &txnIDStr,
					ScheduledTransactionID: &payIDStr,
				},
				setupStores: func() (Dependencies, *Transaction) {
					ibx := &InboxItem{
						ID:                     "ibx_1",
						SpaceID:                string(validSpace),
						Status:                 InboxItemPending,
						Amount:                 500,
						Currency:               "USD",
						TransactionID:          &txnIDStr,
						ScheduledTransactionID: &payIDStr,
					}
					txn := &Transaction{
						ID:        validTxnID,
						SpaceID:   validSpace,
						Type:      TransactionTypeExpense,
						AccountID: &validAccID,
						Amount:    500,
						Currency:  "USD",
						Metadata: TransactionMetadata{
							ScheduledTransactionID: &validPID,
						},
					}
					payment := &ScheduledTransaction{
						ID:      validPID,
						SpaceID: validSpace,
						Amount:  500,
						Status:  ScheduledTransactionPending,
					}
					return Dependencies{
						InboxItemStore:            newInboxItemStoreMock(map[string]*InboxItem{"ibx_1": ibx}),
						TransactionStore:          newTransactionStoreMock(map[TransactionID]*Transaction{validTxnID: txn}),
						ScheduledTransactionStore: newScheduledTransactionStoreMock(map[ScheduledTransactionID]*ScheduledTransaction{validPID: payment}),
						TransactionEventStore:     newTransactionEventStoreMock(nil),
					}, txn
				},
				wantErr: false,
			},
			{
				name: "relink to same scheduled transaction with status already paid returns nil",
				item: &InboxItem{
					ID:                     "ibx_1",
					SpaceID:                string(validSpace),
					Status:                 InboxItemPending,
					Amount:                 500,
					Currency:               "USD",
					TransactionID:          &txnIDStr,
					ScheduledTransactionID: &payIDStr,
				},
				setupStores: func() (Dependencies, *Transaction) {
					ibx := &InboxItem{
						ID:                     "ibx_1",
						SpaceID:                string(validSpace),
						Status:                 InboxItemPending,
						Amount:                 500,
						Currency:               "USD",
						TransactionID:          &txnIDStr,
						ScheduledTransactionID: &payIDStr,
					}
					txn := &Transaction{
						ID:        validTxnID,
						SpaceID:   validSpace,
						Type:      TransactionTypeExpense,
						AccountID: &validAccID,
						Amount:    500,
						Currency:  "USD",
						Metadata: TransactionMetadata{
							ScheduledTransactionID: &validPID,
						},
					}
					payment := &ScheduledTransaction{
						ID:      validPID,
						SpaceID: validSpace,
						Amount:  500,
						Status:  ScheduledTransactionPaid,
					}
					return Dependencies{
						InboxItemStore:            newInboxItemStoreMock(map[string]*InboxItem{"ibx_1": ibx}),
						TransactionStore:          newTransactionStoreMock(map[TransactionID]*Transaction{validTxnID: txn}),
						ScheduledTransactionStore: newScheduledTransactionStoreMock(map[ScheduledTransactionID]*ScheduledTransaction{validPID: payment}),
						TransactionEventStore:     newTransactionEventStoreMock(nil),
					}, txn
				},
				wantErr: false,
			},
			{
				name: "link scheduled transaction not found returns error",
				item: &InboxItem{
					ID:                     "ibx_1",
					SpaceID:                string(validSpace),
					Status:                 InboxItemPending,
					Amount:                 500,
					Currency:               "USD",
					TransactionID:          &txnIDStr,
					ScheduledTransactionID: &payIDStr,
				},
				setupStores: func() (Dependencies, *Transaction) {
					ibx := &InboxItem{
						ID:                     "ibx_1",
						SpaceID:                string(validSpace),
						Status:                 InboxItemPending,
						Amount:                 500,
						Currency:               "USD",
						TransactionID:          &txnIDStr,
						ScheduledTransactionID: &payIDStr,
					}
					txn := &Transaction{
						ID:        validTxnID,
						SpaceID:   validSpace,
						Type:      TransactionTypeExpense,
						AccountID: &validAccID,
						Amount:    500,
						Currency:  "USD",
					}
					return Dependencies{
						InboxItemStore:            newInboxItemStoreMock(map[string]*InboxItem{"ibx_1": ibx}),
						TransactionStore:          newTransactionStoreMock(map[TransactionID]*Transaction{validTxnID: txn}),
						ScheduledTransactionStore: newScheduledTransactionStoreMock(nil),
					}, txn
				},
				wantErr: true,
			},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				deps, _ := tt.setupStores()
				svc := NewService(deps)
				res, err := svc.ApproveInboxItem(ctx, validSpace, "ibx_1")
				if (err != nil) != tt.wantErr {
					t.Errorf("ApproveInboxItem() error = %v, wantErr %v", err, tt.wantErr)
				}
				if !tt.wantErr && res.Status != InboxItemResolved {
					t.Errorf("expected status resolved, got %v", res.Status)
				}
			})
		}
	})

	t.Run("approveScheduledTransaction invoice branch", func(t *testing.T) {
		tests := []struct {
			name        string
			docType     InboxItemDocType
			setupStores func() Dependencies
			wantErr     bool
		}{
			{
				name:    "invoice scheduled transaction updates amount and vendor name",
				docType: InboxItemDocInvoice,
				setupStores: func() Dependencies {
					ibx := &InboxItem{
						ID:                     "ibx_1",
						SpaceID:                string(validSpace),
						Status:                 InboxItemPending,
						DocType:                InboxItemDocInvoice,
						Amount:                 7500,
						VendorName:             "Electric Utility",
						ScheduledTransactionID: &payIDStr,
					}
					pay := &ScheduledTransaction{
						ID:         validPID,
						SpaceID:    validSpace,
						Amount:     5000,
						SourceType: "Old Utility",
					}
					return Dependencies{
						InboxItemStore:            newInboxItemStoreMock(map[string]*InboxItem{"ibx_1": ibx}),
						ScheduledTransactionStore: newScheduledTransactionStoreMock(map[ScheduledTransactionID]*ScheduledTransaction{validPID: pay}),
					}
				},
				wantErr: false,
			},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				deps := tt.setupStores()
				svc := NewService(deps)
				res, err := svc.ApproveInboxItem(ctx, validSpace, "ibx_1")
				if (err != nil) != tt.wantErr {
					t.Errorf("ApproveInboxItem() error = %v, wantErr %v", err, tt.wantErr)
				}
				if !tt.wantErr && res.Status != InboxItemResolved {
					t.Errorf("expected status resolved, got %v", res.Status)
				}
			})
		}
	})

	t.Run("approveStagedInvoice creates scheduled transaction", func(t *testing.T) {
		tests := []struct {
			name        string
			setupStores func() Dependencies
			wantErr     bool
		}{
			{
				name: "valid invoice creates scheduled transaction",
				setupStores: func() Dependencies {
					ibx := &InboxItem{
						ID:              "ibx_1",
						SpaceID:         string(validSpace),
						Status:          InboxItemPending,
						DocType:         InboxItemDocInvoice,
						Amount:          12000,
						Currency:        "USD",
						VendorName:      "Cloud Services",
						AccountID:       &accIDStr,
						BudgetID:        &bgtIDStr,
						TransactionDate: now,
					}
					return Dependencies{
						InboxItemStore:            newInboxItemStoreMock(map[string]*InboxItem{"ibx_1": ibx}),
						ScheduledTransactionStore: newScheduledTransactionStoreMock(nil),
					}
				},
				wantErr: false,
			},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				deps := tt.setupStores()
				svc := NewService(deps)
				res, err := svc.ApproveInboxItem(ctx, validSpace, "ibx_1")
				if (err != nil) != tt.wantErr {
					t.Errorf("ApproveInboxItem() error = %v, wantErr %v", err, tt.wantErr)
				}
				if !tt.wantErr && (res.Status != InboxItemResolved || res.ScheduledTransactionID == nil) {
					t.Errorf("expected resolved with scheduled transaction id, got %+v", res)
				}
			})
		}
	})

	t.Run("approveScheduledTransaction non-invoice branch", func(t *testing.T) {
		tests := []struct {
			name        string
			setupStores func() Dependencies
			wantErr     bool
		}{
			{
				name: "confirms scheduled transaction successfully",
				setupStores: func() Dependencies {
					ibx := &InboxItem{
						ID:                     "ibx_1",
						SpaceID:                string(validSpace),
						Status:                 InboxItemPending,
						DocType:                InboxItemDocReceipt,
						Amount:                 4000,
						VendorName:             "Coffee Shop",
						AccountID:              &accIDStr,
						ScheduledTransactionID: &payIDStr,
						TransactionDate:        now,
					}
					pay := &ScheduledTransaction{
						ID:       validPID,
						SpaceID:  validSpace,
						Amount:   4000,
						Currency: "USD",
						Type:     TransactionTypeIncome,
						Status:   ScheduledTransactionPending,
					}
					return Dependencies{
						InboxItemStore:            newInboxItemStoreMock(map[string]*InboxItem{"ibx_1": ibx}),
						ScheduledTransactionStore: newScheduledTransactionStoreMock(map[ScheduledTransactionID]*ScheduledTransaction{validPID: pay}),
						SettingsStore:             newSettingsStoreMock(map[SpaceID]*FinanceSettings{validSpace: {BaseCurrency: "USD"}}),
						AccountStore: newAccountStoreMock(map[AccountID]*Account{
							validAccID: {ID: validAccID, SpaceID: validSpace, Currency: "USD", IsActive: true, CurrentBalance: 10000},
						}),
						TransactionStore:      newTransactionStoreMock(nil),
						TransactionEventStore: newTransactionEventStoreMock(nil),
					}
				},
				wantErr: false,
			},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				deps := tt.setupStores()
				svc := NewService(deps)
				res, err := svc.ApproveInboxItem(ctx, validSpace, "ibx_1")
				if (err != nil) != tt.wantErr {
					t.Errorf("ApproveInboxItem() error = %v, wantErr %v", err, tt.wantErr)
				}
				if !tt.wantErr && res.Status != InboxItemResolved {
					t.Errorf("expected status resolved, got %v", res.Status)
				}
			})
		}
	})

	t.Run("approveStandalonePromotion branches", func(t *testing.T) {
		tests := []struct {
			name        string
			setupStores func() Dependencies
			wantErr     bool
		}{
			{
				name: "missing destination account for transfer fails",
				setupStores: func() Dependencies {
					ibx := &InboxItem{
						ID:       "ibx_1",
						SpaceID:  string(validSpace),
						Status:   InboxItemPending,
						DocType:  InboxItemDocReceipt,
						Amount:   1000,
						Currency: "USD",
						Metadata: map[string]any{
							"transaction_type": "TRANSFER",
						},
					}
					return Dependencies{
						InboxItemStore: newInboxItemStoreMock(map[string]*InboxItem{"ibx_1": ibx}),
					}
				},
				wantErr: true,
			},
			{
				name: "invalid destination account for transfer fails",
				setupStores: func() Dependencies {
					ibx := &InboxItem{
						ID:       "ibx_1",
						SpaceID:  string(validSpace),
						Status:   InboxItemPending,
						DocType:  InboxItemDocReceipt,
						Amount:   1000,
						Currency: "USD",
						Metadata: map[string]any{
							"transaction_type":       "TRANSFER",
							"destination_account_id": "invalid_acc_id",
						},
					}
					return Dependencies{
						InboxItemStore: newInboxItemStoreMock(map[string]*InboxItem{"ibx_1": ibx}),
					}
				},
				wantErr: true,
			},
			{
				name: "standalone promotion linking borrowing",
				setupStores: func() Dependencies {
					ibx := &InboxItem{
						ID:          "ibx_1",
						SpaceID:     string(validSpace),
						Status:      InboxItemPending,
						DocType:     InboxItemDocReceipt,
						Amount:      2000,
						Currency:    "USD",
						VendorName:  "Merchant",
						AccountID:   &accIDStr,
						BorrowingID: &brwIDStr,
						Metadata: map[string]any{
							"transaction_type": "INCOME",
						},
					}
					brw := &Borrowing{
						ID:              validBrwID,
						SpaceID:         validSpace,
						TotalAmount:     5000,
						RemainingAmount: 5000,
						Status:          BorrowingStatusActive,
					}
					return Dependencies{
						InboxItemStore: newInboxItemStoreMock(map[string]*InboxItem{"ibx_1": ibx}),
						AccountStore: newAccountStoreMock(map[AccountID]*Account{
							validAccID: {ID: validAccID, SpaceID: validSpace, Currency: "USD", IsActive: true, CurrentBalance: 10000},
						}),
						SettingsStore:    newSettingsStoreMock(map[SpaceID]*FinanceSettings{validSpace: {BaseCurrency: "USD"}}),
						TransactionStore: newTransactionStoreMock(nil),
						BorrowingStore:   newBorrowingStoreMock(map[BorrowingID]*Borrowing{validBrwID: brw}),
					}
				},
				wantErr: false,
			},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				deps := tt.setupStores()
				svc := NewService(deps)
				res, err := svc.ApproveInboxItem(ctx, validSpace, "ibx_1")
				if (err != nil) != tt.wantErr {
					t.Errorf("ApproveInboxItem() error = %v, wantErr %v", err, tt.wantErr)
				}
				if !tt.wantErr && res.Status != InboxItemResolved {
					t.Errorf("expected status resolved, got %v", res.Status)
				}
			})
		}
	})
}

// --- Tests from service_insights_test.go ---

func TestService_Insights(t *testing.T) {
	ctx := context.Background()
	validSpace := SpaceID("spc_2dE1V8ZqWz4eS2N9yX3bL1mK7pO")
	now := time.Now().UTC()

	t.Run("GetSpentInsights", func(t *testing.T) {
		tests := []struct {
			name     string
			req      *GetSpentInsightsRequest
			setupSet bool
			storeErr error
			wantErr  bool
		}{
			{
				name: "valid spent insights",
				req: &GetSpentInsightsRequest{
					SpaceID:     validSpace,
					Granularity: "monthly",
					StartDate:   now.AddDate(0, -1, 0),
					EndDate:     now,
				},
				setupSet: true,
				storeErr: nil,
				wantErr:  false,
			},
			{
				name: "invalid range",
				req: &GetSpentInsightsRequest{
					SpaceID:     "invalid_space",
					Granularity: "monthly",
				},
				setupSet: true,
				wantErr:  true,
			},
			{
				name: "missing settings",
				req: &GetSpentInsightsRequest{
					SpaceID:     validSpace,
					Granularity: "monthly",
				},
				setupSet: false,
				wantErr:  true,
			},
			{
				name: "store error on spent trend",
				req: &GetSpentInsightsRequest{
					SpaceID:     validSpace,
					Granularity: "monthly",
				},
				setupSet: true,
				storeErr: errors.New("db error"),
				wantErr:  true,
			},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				setStore := newSettingsStoreMock(nil)
				if tt.setupSet {
					_ = setStore.Create(ctx, &FinanceSettings{SpaceID: validSpace, BaseCurrency: "USD"})
				}
				insStore := newInsightsStoreMock(
					[]*SpentTrend{},
					[]*BudgetDistribution{},
					[]*TopExpense{},
					nil,
					nil,
					nil,
					tt.storeErr,
				)
				svc := NewService(Dependencies{
					SettingsStore: setStore,
					InsightsStore: insStore,
				})

				res, err := svc.GetSpentInsights(ctx, tt.req)
				if (err != nil) != tt.wantErr {
					t.Errorf("GetSpentInsights() error = %v, wantErr %v", err, tt.wantErr)
				}
				if !tt.wantErr && res == nil {
					t.Error("expected non-nil SpentInsights")
				}
			})
		}
	})

	t.Run("GetIncomeInsights", func(t *testing.T) {
		tests := []struct {
			name     string
			req      *GetSpentInsightsRequest
			setupSet bool
			storeErr error
			wantErr  bool
		}{
			{
				name: "valid income insights",
				req: &GetSpentInsightsRequest{
					SpaceID:     validSpace,
					Granularity: "monthly",
					StartDate:   now.AddDate(0, -1, 0),
					EndDate:     now,
				},
				setupSet: true,
				storeErr: nil,
				wantErr:  false,
			},
			{
				name: "invalid range",
				req: &GetSpentInsightsRequest{
					SpaceID:     "invalid_space",
					Granularity: "monthly",
				},
				setupSet: true,
				wantErr:  true,
			},
			{
				name: "missing settings",
				req: &GetSpentInsightsRequest{
					SpaceID:     validSpace,
					Granularity: "monthly",
				},
				setupSet: false,
				wantErr:  true,
			},
			{
				name: "store error on income trend",
				req: &GetSpentInsightsRequest{
					SpaceID:     validSpace,
					Granularity: "monthly",
				},
				setupSet: true,
				storeErr: errors.New("db error"),
				wantErr:  true,
			},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				setStore := newSettingsStoreMock(nil)
				if tt.setupSet {
					_ = setStore.Create(ctx, &FinanceSettings{SpaceID: validSpace, BaseCurrency: "USD"})
				}
				insStore := newInsightsStoreMock(
					nil,
					nil,
					nil,
					[]*IncomeTrend{},
					[]*IncomeSourceRow{},
					[]*TopIncome{},
					tt.storeErr,
				)
				svc := NewService(Dependencies{
					SettingsStore: setStore,
					InsightsStore: insStore,
				})

				res, err := svc.GetIncomeInsights(ctx, tt.req)
				if (err != nil) != tt.wantErr {
					t.Errorf("GetIncomeInsights() error = %v, wantErr %v", err, tt.wantErr)
				}
				if !tt.wantErr && res == nil {
					t.Error("expected non-nil IncomeInsights")
				}
			})
		}
	})
}

// --- Tests from service_institution_test.go ---

func TestService_Institutions(t *testing.T) {
	ctx := context.Background()
	validSpace := SpaceID("spc_2dE1V8ZqWz4eS2N9yX3bL1mK7pO")
	validInstID, _ := NewInstitutionID()

	t.Run("GetInstitution", func(t *testing.T) {
		tests := []struct {
			name    string
			spaceID SpaceID
			id      InstitutionID
			exists  bool
			wantErr bool
		}{
			{
				name:    "valid retrieval",
				spaceID: validSpace,
				id:      validInstID,
				exists:  true,
				wantErr: false,
			},
			{
				name:    "not found",
				spaceID: validSpace,
				id:      validInstID,
				exists:  false,
				wantErr: true,
			},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				data := make(map[InstitutionID]*Institution)
				if tt.exists {
					data[validInstID] = &Institution{ID: validInstID, SpaceID: validSpace, Name: "Chase"}
				}
				svc := NewService(Dependencies{InstitutionStore: newInstitutionStoreMock(data)})
				res, err := svc.GetInstitution(ctx, tt.spaceID, tt.id)
				if (err != nil) != tt.wantErr {
					t.Errorf("GetInstitution() error = %v, wantErr %v", err, tt.wantErr)
				}
				if !tt.wantErr && res.ID != tt.id {
					t.Errorf("res.ID = %v, want %v", res.ID, tt.id)
				}
			})
		}
	})

	t.Run("ListInstitutions", func(t *testing.T) {
		tests := []struct {
			name     string
			hasStore bool
		}{
			{"with store", true},
			{"nil store returns empty page", false},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				var store InstitutionStore
				if tt.hasStore {
					store = newInstitutionStoreMock(map[InstitutionID]*Institution{
						validInstID: {ID: validInstID, SpaceID: validSpace, Name: "Bank of America"},
					})
				}
				svc := NewService(Dependencies{InstitutionStore: store})
				res, err := svc.ListInstitutions(ctx, validSpace, nil)
				if err != nil {
					t.Fatalf("ListInstitutions() unexpected error: %v", err)
				}
				if res == nil {
					t.Error("expected non-nil page")
				}
			})
		}
	})

	t.Run("GetInstitutionsByIDs", func(t *testing.T) {
		tests := []struct {
			name     string
			hasStore bool
			ids      []InstitutionID
			wantLen  int
		}{
			{
				name:     "valid retrieval",
				hasStore: true,
				ids:      []InstitutionID{validInstID},
				wantLen:  1,
			},
			{
				name:     "empty ids",
				hasStore: true,
				ids:      []InstitutionID{},
				wantLen:  0,
			},
			{
				name:     "nil store",
				hasStore: false,
				ids:      []InstitutionID{validInstID},
				wantLen:  0,
			},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				var store InstitutionStore
				if tt.hasStore {
					store = newInstitutionStoreMock(map[InstitutionID]*Institution{
						validInstID: {ID: validInstID, SpaceID: validSpace, Name: "Chase"},
					})
				}
				svc := NewService(Dependencies{InstitutionStore: store})
				res, err := svc.GetInstitutionsByIDs(ctx, validSpace, tt.ids)
				if err != nil {
					t.Fatalf("GetInstitutionsByIDs() unexpected error: %v", err)
				}
				if len(res) != tt.wantLen {
					t.Errorf("len(res) = %d, want %d", len(res), tt.wantLen)
				}
			})
		}
	})

	t.Run("ResolveInstitution", func(t *testing.T) {
		tests := []struct {
			name         string
			inputName    string
			setupExist   bool
			wantExisting bool
			wantDomain   string
		}{
			{
				name:         "matches existing institution by name",
				inputName:    "Chase",
				setupExist:   true,
				wantExisting: true,
				wantDomain:   "chase.com",
			},
			{
				name:         "generates suggestions when not found",
				inputName:    "paypal.com",
				setupExist:   false,
				wantExisting: false,
				wantDomain:   "paypal.com",
			},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				data := make(map[InstitutionID]*Institution)
				if tt.setupExist {
					data[validInstID] = &Institution{
						ID:      validInstID,
						SpaceID: validSpace,
						Name:    "Chase",
						Domain:  "chase.com",
						LogoURL: "https://chase.com/icon.png",
						Color:   "blue",
					}
				}
				svc := NewService(Dependencies{InstitutionStore: newInstitutionStoreMock(data)})
				res, err := svc.ResolveInstitution(ctx, validSpace, tt.inputName)
				if err != nil {
					t.Fatalf("ResolveInstitution() unexpected error: %v", err)
				}
				if (res.ExistingInstitutionID != nil) != tt.wantExisting {
					t.Errorf("ExistingInstitutionID = %v, want existing: %v", res.ExistingInstitutionID, tt.wantExisting)
				}
				if res.Domain != tt.wantDomain {
					t.Errorf("res.Domain = %q, want %q", res.Domain, tt.wantDomain)
				}
			})
		}
	})

	t.Run("CreateInstitution", func(t *testing.T) {
		tests := []struct {
			name    string
			inst    *Institution
			wantErr bool
		}{
			{
				name: "invalid institution fails validation",
				inst: &Institution{
					SpaceID: validSpace,
					Name:    "", // empty name fails validation
				},
				wantErr: true,
			},
			{
				name: "valid institution creates successfully",
				inst: &Institution{
					SpaceID: validSpace,
					Name:    "Wells Fargo",
					Domain:  "wellsfargo.com",
				},
				wantErr: false,
			},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				svc := NewService(Dependencies{InstitutionStore: newInstitutionStoreMock(nil)})
				res, err := svc.CreateInstitution(ctx, tt.inst)
				if (err != nil) != tt.wantErr {
					t.Errorf("CreateInstitution() error = %v, wantErr %v", err, tt.wantErr)
				}
				if !tt.wantErr && res == nil {
					t.Error("expected non-nil institution")
				}
			})
		}
	})

	t.Run("UpdateInstitution", func(t *testing.T) {
		tests := []struct {
			name       string
			inst       *Institution
			mask       []string
			setupStore func() *InstitutionStoreMock
			wantErr    bool
		}{
			{
				name: "institution not found",
				inst: &Institution{
					ID:      validInstID,
					SpaceID: validSpace,
					Name:    "Nonexistent",
				},
				mask: []string{"name"},
				setupStore: func() *InstitutionStoreMock {
					return newInstitutionStoreMock(nil)
				},
				wantErr: true,
			},
			{
				name: "successful update",
				inst: &Institution{
					ID:      validInstID,
					SpaceID: validSpace,
					Name:    "Updated Bank",
					Version: 1,
				},
				mask: []string{"name"},
				setupStore: func() *InstitutionStoreMock {
					return newInstitutionStoreMock(map[InstitutionID]*Institution{
						validInstID: {
							ID:      validInstID,
							SpaceID: validSpace,
							Name:    "Old Bank",
							Version: 1,
						},
					})
				},
				wantErr: false,
			},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				store := tt.setupStore()
				svc := NewService(Dependencies{InstitutionStore: store})
				res, err := svc.UpdateInstitution(ctx, tt.inst, tt.mask)
				if (err != nil) != tt.wantErr {
					t.Errorf("UpdateInstitution() error = %v, wantErr %v", err, tt.wantErr)
				}
				if !tt.wantErr && res.Name != tt.inst.Name {
					t.Errorf("Name = %q, want %q", res.Name, tt.inst.Name)
				}
			})
		}
	})

	t.Run("DeleteInstitution", func(t *testing.T) {
		tests := []struct {
			name       string
			spaceID    SpaceID
			id         InstitutionID
			setupStore func() *InstitutionStoreMock
			wantErr    bool
		}{
			{
				name:    "not found",
				spaceID: validSpace,
				id:      validInstID,
				setupStore: func() *InstitutionStoreMock {
					return newInstitutionStoreMock(nil)
				},
				wantErr: true,
			},
			{
				name:    "successful deletion",
				spaceID: validSpace,
				id:      validInstID,
				setupStore: func() *InstitutionStoreMock {
					return newInstitutionStoreMock(map[InstitutionID]*Institution{
						validInstID: {ID: validInstID, SpaceID: validSpace, Name: "Bank"},
					})
				},
				wantErr: false,
			},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				store := tt.setupStore()
				svc := NewService(Dependencies{InstitutionStore: store})
				err := svc.DeleteInstitution(ctx, tt.spaceID, tt.id, DeleteOptions{})
				if (err != nil) != tt.wantErr {
					t.Errorf("DeleteInstitution() error = %v, wantErr %v", err, tt.wantErr)
				}
			})
		}
	})
}

func TestBuildInstitutionFaviconURL(t *testing.T) {
	tests := []struct {
		domain string
		want   string
	}{
		{"", ""},
		{"chase.com", "https://www.google.com/s2/favicons?domain=chase.com&sz=64"},
	}

	for _, tt := range tests {
		t.Run(tt.domain, func(t *testing.T) {
			got := BuildInstitutionFaviconURL(tt.domain)
			if got != tt.want {
				t.Errorf("BuildInstitutionFaviconURL(%q) = %q, want %q", tt.domain, got, tt.want)
			}
		})
	}
}

// --- Tests from service_rate_test.go ---

func TestService_ExchangeRates(t *testing.T) {
	ctx := context.Background()
	validSpace := SpaceID("spc_2dE1V8ZqWz4eS2N9yX3bL1mK7pO")
	rateDate := time.Date(2026, 7, 30, 0, 0, 0, 0, time.UTC)

	t.Run("CreateExchangeRate", func(t *testing.T) {
		tests := []struct {
			name    string
			rate    *ExchangeRate
			wantErr bool
		}{
			{
				name: "valid rate",
				rate: &ExchangeRate{
					SpaceID:      validSpace,
					FromCurrency: "EUR",
					ToCurrency:   "USD",
					Rate:         1.08,
					RateDate:     rateDate,
				},
				wantErr: false,
			},
			{
				name: "invalid rate <= 0",
				rate: &ExchangeRate{
					SpaceID:      validSpace,
					FromCurrency: "EUR",
					ToCurrency:   "USD",
					Rate:         0,
					RateDate:     rateDate,
				},
				wantErr: true,
			},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				store := newExchangeRateStoreMock(nil)
				svc := NewService(Dependencies{ExchangeRateStore: store})
				res, err := svc.CreateExchangeRate(ctx, tt.rate)
				if (err != nil) != tt.wantErr {
					t.Errorf("CreateExchangeRate() error = %v, wantErr %v", err, tt.wantErr)
				}
				if !tt.wantErr && res.ID == "" {
					t.Error("expected generated ID")
				}
			})
		}
	})

	t.Run("GetExchangeRateByID", func(t *testing.T) {
		rate := &ExchangeRate{
			SpaceID:      validSpace,
			FromCurrency: "EUR",
			ToCurrency:   "USD",
			Rate:         1.08,
			RateDate:     rateDate,
		}
		_ = rate.Init()
		validID := rate.ID

		tests := []struct {
			name    string
			spaceID SpaceID
			id      string
			exists  bool
			wantErr bool
		}{
			{
				name:    "valid retrieval",
				spaceID: validSpace,
				id:      validID,
				exists:  true,
				wantErr: false,
			},
			{
				name:    "invalid space ID",
				spaceID: "invalid_space",
				id:      validID,
				exists:  true,
				wantErr: true,
			},
			{
				name:    "invalid rate ID format",
				spaceID: validSpace,
				id:      "invalid_rate_id",
				exists:  true,
				wantErr: true,
			},
			{
				name:    "rate not found",
				spaceID: validSpace,
				id:      validID,
				exists:  false,
				wantErr: true,
			},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				store := newExchangeRateStoreMock(nil)
				if tt.exists {
					_ = store.Create(ctx, rate)
				}
				svc := NewService(Dependencies{ExchangeRateStore: store})
				res, err := svc.GetExchangeRateByID(ctx, tt.spaceID, tt.id)
				if (err != nil) != tt.wantErr {
					t.Errorf("GetExchangeRateByID() error = %v, wantErr %v", err, tt.wantErr)
				}
				if !tt.wantErr && res.ID != tt.id {
					t.Errorf("res.ID = %v, want %v", res.ID, tt.id)
				}
			})
		}
	})

	t.Run("UpdateExchangeRate", func(t *testing.T) {
		rate := &ExchangeRate{
			SpaceID:      validSpace,
			FromCurrency: "EUR",
			ToCurrency:   "USD",
			Rate:         1.08,
			RateDate:     rateDate,
		}
		_ = rate.Init()
		validID := rate.ID

		tests := []struct {
			name    string
			spaceID SpaceID
			id      string
			exists  bool
			newRate float64
			wantErr bool
		}{
			{
				name:    "valid update",
				spaceID: validSpace,
				id:      validID,
				exists:  true,
				newRate: 1.15,
				wantErr: false,
			},
			{
				spaceID: "invalid_space",
				id:      validID,
				exists:  true,
				newRate: 1.15,
				wantErr: true,
			},
			{
				name:    "invalid rate ID",
				spaceID: validSpace,
				id:      "invalid_id",
				exists:  true,
				newRate: 1.15,
				wantErr: true,
			},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				store := newExchangeRateStoreMock(nil)
				if tt.exists {
					_ = store.Create(ctx, &ExchangeRate{
						SpaceID:      rate.SpaceID,
						FromCurrency: rate.FromCurrency,
						ToCurrency:   rate.ToCurrency,
						Rate:         rate.Rate,
						RateDate:     rate.RateDate,
					})
				}
				svc := NewService(Dependencies{ExchangeRateStore: store})
				res, err := svc.UpdateExchangeRate(ctx, tt.spaceID, tt.id, &ExchangeRate{Rate: tt.newRate})
				if (err != nil) != tt.wantErr {
					t.Errorf("UpdateExchangeRate() error = %v, wantErr %v", err, tt.wantErr)
				}
				if !tt.wantErr && res.Rate != tt.newRate {
					t.Errorf("res.Rate = %f, want %f", res.Rate, tt.newRate)
				}
			})
		}
	})

	t.Run("ListExchangeRates", func(t *testing.T) {
		tests := []struct {
			name    string
			spaceID SpaceID
			wantErr bool
		}{
			{
				name:    "valid list",
				spaceID: validSpace,
				wantErr: false,
			},
			{
				name:    "invalid space ID",
				spaceID: "invalid_space",
				wantErr: true,
			},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				store := newExchangeRateStoreMock(map[string]*ExchangeRate{
					"key": {SpaceID: validSpace},
				})
				svc := NewService(Dependencies{ExchangeRateStore: store})
				list, _, err := svc.ListExchangeRates(ctx, tt.spaceID, nil)
				if (err != nil) != tt.wantErr {
					t.Errorf("ListExchangeRates() error = %v, wantErr %v", err, tt.wantErr)
				}
				if !tt.wantErr && list == nil {
					t.Error("expected non-nil list")
				}
			})
		}
	})

	t.Run("DeleteExchangeRateByID", func(t *testing.T) {
		rate := &ExchangeRate{
			SpaceID:      validSpace,
			FromCurrency: "EUR",
			ToCurrency:   "USD",
			Rate:         1.08,
			RateDate:     rateDate,
		}
		_ = rate.Init()
		validID := rate.ID

		tests := []struct {
			name    string
			spaceID SpaceID
			id      string
			wantErr bool
		}{
			{
				name:    "valid deletion",
				spaceID: validSpace,
				id:      validID,
				wantErr: false,
			},
			{
				name:    "invalid space ID",
				spaceID: "invalid_space",
				id:      validID,
				wantErr: true,
			},
			{
				name:    "invalid id format",
				spaceID: validSpace,
				id:      "bad_id",
				wantErr: true,
			},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				store := newExchangeRateStoreMock(nil)
				_ = store.Create(ctx, rate)
				svc := NewService(Dependencies{ExchangeRateStore: store})
				err := svc.DeleteExchangeRateByID(ctx, tt.spaceID, tt.id)
				if (err != nil) != tt.wantErr {
					t.Errorf("DeleteExchangeRateByID() error = %v, wantErr %v", err, tt.wantErr)
				}
			})
		}
	})

	t.Run("GetLatestRates", func(t *testing.T) {
		tests := []struct {
			name    string
			spaceID SpaceID
			wantErr bool
		}{
			{
				name:    "valid call",
				spaceID: validSpace,
				wantErr: false,
			},
			{
				name:    "invalid space ID",
				spaceID: "invalid_space",
				wantErr: true,
			},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				store := newExchangeRateStoreMock(nil)
				svc := NewService(Dependencies{ExchangeRateStore: store})
				_, err := svc.GetLatestRates(ctx, tt.spaceID, []Currency{"EUR"}, "USD")
				if (err != nil) != tt.wantErr {
					t.Errorf("GetLatestRates() error = %v, wantErr %v", err, tt.wantErr)
				}
			})
		}
	})
}

// --- Tests from service_recurring_test.go ---

func TestService_RecurringTransactions(t *testing.T) {
	ctx := context.Background()
	validSpace := SpaceID("spc_2dE1V8ZqWz4eS2N9yX3bL1mK7pO")
	validBID, _ := NewBudgetID()
	validRID, _ := NewRecurringTransactionID()
	now := time.Now().UTC()

	t.Run("CreateRecurringTransaction", func(t *testing.T) {
		tests := []struct {
			name    string
			rec     *RecurringTransaction
			wantErr bool
		}{
			{
				name: "valid recurring expense",
				rec: &RecurringTransaction{
					SpaceID:     validSpace,
					BudgetID:    &validBID,
					Name:        "Netflix",
					Amount:      1500,
					Currency:    "USD",
					Interval:    IntervalMonthly,
					NextDueDate: now,
					Status:      RecurringTransactionActive,
					Type:        TransactionTypeExpense,
				},
				wantErr: false,
			},
			{
				name: "invalid recurring transaction amount <= 0",
				rec: &RecurringTransaction{
					SpaceID:  validSpace,
					BudgetID: &validBID,
					Name:     "Netflix",
					Amount:   0,
					Currency: "USD",
					Interval: IntervalMonthly,
					Type:     TransactionTypeExpense,
				},
				wantErr: true,
			},
			{
				name: "invalid budget ID",
				rec: &RecurringTransaction{
					SpaceID:  validSpace,
					BudgetID: (*BudgetID)(new(string)), // invalid pointer to empty string
					Name:     "Netflix",
					Amount:   1500,
					Currency: "USD",
					Interval: IntervalMonthly,
					Type:     TransactionTypeExpense,
				},
				wantErr: true,
			},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				rStore := newRecurringTransactionStoreMock(nil)
				svc := NewService(Dependencies{RecurringTransactionStore: rStore})
				res, err := svc.CreateRecurringTransaction(ctx, tt.rec)
				if (err != nil) != tt.wantErr {
					t.Errorf("CreateRecurringTransaction() error = %v, wantErr %v", err, tt.wantErr)
				}
				if !tt.wantErr && res.ID == "" {
					t.Error("expected ID to be generated")
				}
			})
		}
	})

	t.Run("GetRecurringTransaction", func(t *testing.T) {
		tests := []struct {
			name    string
			spaceID SpaceID
			id      RecurringTransactionID
			exists  bool
			wantErr bool
		}{
			{
				name:    "valid retrieval",
				spaceID: validSpace,
				id:      validRID,
				exists:  true,
				wantErr: false,
			},
			{
				name:    "invalid space ID",
				spaceID: "invalid_space",
				id:      validRID,
				exists:  true,
				wantErr: true,
			},
			{
				name:    "invalid recurring ID",
				spaceID: validSpace,
				id:      "invalid_id",
				exists:  true,
				wantErr: true,
			},
			{
				name:    "not found",
				spaceID: validSpace,
				id:      validRID,
				exists:  false,
				wantErr: true,
			},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				data := make(map[RecurringTransactionID]*RecurringTransaction)
				if tt.exists {
					data[validRID] = &RecurringTransaction{ID: validRID, SpaceID: validSpace, Name: "Gym"}
				}
				rStore := newRecurringTransactionStoreMock(data)
				svc := NewService(Dependencies{RecurringTransactionStore: rStore})
				res, err := svc.GetRecurringTransaction(ctx, tt.spaceID, tt.id)
				if (err != nil) != tt.wantErr {
					t.Errorf("GetRecurringTransaction() error = %v, wantErr %v", err, tt.wantErr)
				}
				if !tt.wantErr && res.ID != tt.id {
					t.Errorf("res.ID = %v, want %v", res.ID, tt.id)
				}
			})
		}
	})

	t.Run("GetRecurringTransactions", func(t *testing.T) {
		tests := []struct {
			name    string
			spaceID SpaceID
			ids     []RecurringTransactionID
			wantErr bool
		}{
			{
				name:    "valid batch",
				spaceID: validSpace,
				ids:     []RecurringTransactionID{validRID},
				wantErr: false,
			},
			{
				name:    "invalid space ID",
				spaceID: "invalid_space",
				ids:     []RecurringTransactionID{validRID},
				wantErr: true,
			},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				rStore := newRecurringTransactionStoreMock(map[RecurringTransactionID]*RecurringTransaction{
					validRID: {ID: validRID, SpaceID: validSpace},
				})
				svc := NewService(Dependencies{RecurringTransactionStore: rStore})
				res, err := svc.GetRecurringTransactions(ctx, tt.spaceID, tt.ids)
				if (err != nil) != tt.wantErr {
					t.Errorf("GetRecurringTransactions() error = %v, wantErr %v", err, tt.wantErr)
				}
				if !tt.wantErr && len(res) != 1 {
					t.Errorf("len(res) = %d, want 1", len(res))
				}
			})
		}
	})

	t.Run("UpdateRecurringTransaction", func(t *testing.T) {
		tests := []struct {
			name       string
			re         *RecurringTransaction
			mask       []string
			setupExist bool
			existVer   int64
			wantErr    bool
		}{
			{
				name: "valid patch update",
				re: &RecurringTransaction{
					ID:      validRID,
					SpaceID: validSpace,
					Name:    "Gym Patched",
					Amount:  5000,
					Version: 1,
				},
				mask:       []string{"name", "amount"},
				setupExist: true,
				existVer:   1,
				wantErr:    false,
			},
			{
				name: "version mismatch",
				re: &RecurringTransaction{
					ID:      validRID,
					SpaceID: validSpace,
					Name:    "Gym Patched",
					Version: 1,
				},
				mask:       []string{"name"},
				setupExist: true,
				existVer:   2,
				wantErr:    true,
			},
			{
				name: "not found",
				re: &RecurringTransaction{
					ID:      validRID,
					SpaceID: validSpace,
					Name:    "Gym Patched",
				},
				mask:       []string{"name"},
				setupExist: false,
				wantErr:    true,
			},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				data := make(map[RecurringTransactionID]*RecurringTransaction)
				if tt.setupExist {
					data[validRID] = &RecurringTransaction{
						ID:          validRID,
						SpaceID:     validSpace,
						BudgetID:    &validBID,
						Name:        "Gym",
						Amount:      4000,
						Currency:    "USD",
						Interval:    IntervalMonthly,
						NextDueDate: now,
						Status:      RecurringTransactionActive,
						Type:        TransactionTypeExpense,
						Version:     tt.existVer,
					}
				}
				rStore := newRecurringTransactionStoreMock(data)
				svc := NewService(Dependencies{RecurringTransactionStore: rStore})
				res, err := svc.UpdateRecurringTransaction(ctx, tt.re, tt.mask)
				if (err != nil) != tt.wantErr {
					t.Errorf("UpdateRecurringTransaction() error = %v, wantErr %v", err, tt.wantErr)
				}
				if !tt.wantErr && (res == nil || res.Name != tt.re.Name) {
					t.Errorf("res.Name = %v, want %q", res, tt.re.Name)
				}
			})
		}
	})

	t.Run("DeleteRecurringTransaction", func(t *testing.T) {
		tests := []struct {
			name    string
			id      RecurringTransactionID
			exists  bool
			wantErr bool
		}{
			{
				name:    "valid deletion",
				id:      validRID,
				exists:  true,
				wantErr: false,
			},
			{
				name:    "invalid recurring transaction ID",
				id:      "invalid_id",
				exists:  false,
				wantErr: true,
			},
			{
				name:    "not found",
				id:      validRID,
				exists:  false,
				wantErr: true,
			},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				data := make(map[RecurringTransactionID]*RecurringTransaction)
				if tt.exists {
					data[validRID] = &RecurringTransaction{ID: validRID, SpaceID: validSpace}
				}
				rStore := newRecurringTransactionStoreMock(data)
				svc := NewService(Dependencies{RecurringTransactionStore: rStore})
				err := svc.DeleteRecurringTransaction(ctx, tt.id, DeleteOptions{})
				if (err != nil) != tt.wantErr {
					t.Errorf("DeleteRecurringTransaction() error = %v, wantErr %v", err, tt.wantErr)
				}
			})
		}
	})

	t.Run("ListRecurringTransactions", func(t *testing.T) {
		tests := []struct {
			name    string
			spaceID SpaceID
			wantErr bool
		}{
			{
				name:    "valid list",
				spaceID: validSpace,
				wantErr: false,
			},
			{
				name:    "invalid space ID",
				spaceID: "invalid_space",
				wantErr: true,
			},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				rStore := newRecurringTransactionStoreMock(nil)
				svc := NewService(Dependencies{RecurringTransactionStore: rStore})
				_, err := svc.ListRecurringTransactions(ctx, tt.spaceID, nil)
				if (err != nil) != tt.wantErr {
					t.Errorf("ListRecurringTransactions() error = %v, wantErr %v", err, tt.wantErr)
				}
			})
		}
	})

	t.Run("GenerateScheduledTransactions", func(t *testing.T) {
		tests := []struct {
			name        string
			setupStores func() (*RecurringTransactionStoreMock, *ScheduledTransactionStoreMock, map[ScheduledTransactionID]*ScheduledTransaction)
			wantErr     bool
		}{
			{
				name: "template generation validation error",
				setupStores: func() (*RecurringTransactionStoreMock, *ScheduledTransactionStoreMock, map[ScheduledTransactionID]*ScheduledTransaction) {
					rStore := newRecurringTransactionStoreMock(map[RecurringTransactionID]*RecurringTransaction{
						validRID: {
							ID:          validRID,
							SpaceID:     "invalid_space",
							BudgetID:    &validBID,
							Name:        "Internet",
							Amount:      6000,
							Currency:    "USD",
							Interval:    IntervalMonthly,
							NextDueDate: now,
							Status:      RecurringTransactionActive,
							Type:        TransactionTypeExpense,
						},
					})
					payments := make(map[ScheduledTransactionID]*ScheduledTransaction)
					sStore := newScheduledTransactionStoreMock(payments)
					return rStore, sStore, payments
				},
				wantErr: true,
			},
			{
				name: "successful generation",
				setupStores: func() (*RecurringTransactionStoreMock, *ScheduledTransactionStoreMock, map[ScheduledTransactionID]*ScheduledTransaction) {
					rStore := newRecurringTransactionStoreMock(map[RecurringTransactionID]*RecurringTransaction{
						validRID: {
							ID:          validRID,
							SpaceID:     validSpace,
							BudgetID:    &validBID,
							Name:        "Internet",
							Amount:      6000,
							Currency:    "USD",
							Interval:    IntervalMonthly,
							NextDueDate: now,
							Status:      RecurringTransactionActive,
							Type:        TransactionTypeExpense,
						},
					})
					payments := make(map[ScheduledTransactionID]*ScheduledTransaction)
					sStore := newScheduledTransactionStoreMock(payments)
					return rStore, sStore, payments
				},
				wantErr: false,
			},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				rStore, sStore, payments := tt.setupStores()
				svc := NewService(Dependencies{
					RecurringTransactionStore: rStore,
					ScheduledTransactionStore: sStore,
				})
				err := svc.GenerateScheduledTransactions(ctx)
				if (err != nil) != tt.wantErr {
					t.Errorf("GenerateScheduledTransactions() error = %v, wantErr %v", err, tt.wantErr)
				}
				if !tt.wantErr && len(payments) == 0 {
					t.Error("expected scheduled transactions to be generated")
				}
			})
		}
	})
}

// --- Tests from service_scheduled_test.go ---

func TestService_ScheduledTransactions(t *testing.T) {
	ctx := context.Background()
	validSpace := SpaceID("spc_2dE1V8ZqWz4eS2N9yX3bL1mK7pO")
	otherSpace := SpaceID("spc_2dE1V8ZqWz4eS2N9yX3bL1mK7pX")
	validBID, _ := NewBudgetID()
	validAccID, _ := NewAccountID()
	validPID, _ := NewPeriodID()
	validSTID, _ := NewScheduledTransactionID()
	validTID, _ := NewTransactionID()
	now := time.Now().UTC()

	t.Run("ListScheduledTransactions", func(t *testing.T) {
		tests := []struct {
			name    string
			spaceID SpaceID
			wantErr bool
		}{
			{"valid list", validSpace, false},
			{"invalid space ID", "", true},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				sStore := newScheduledTransactionStoreMock(nil)
				svc := NewService(Dependencies{ScheduledTransactionStore: sStore})
				_, err := svc.ListScheduledTransactions(ctx, tt.spaceID, nil)
				if (err != nil) != tt.wantErr {
					t.Errorf("ListScheduledTransactions() error = %v, wantErr %v", err, tt.wantErr)
				}
			})
		}
	})

	t.Run("ConfirmScheduledTransaction", func(t *testing.T) {
		tests := []struct {
			name    string
			req     ConfirmScheduledTransactionRequest
			setupST bool
			isPaid  bool
			wantErr bool
		}{
			{
				name: "successful confirmation of expense",
				req: ConfirmScheduledTransactionRequest{
					SpaceID:       validSpace,
					TransactionID: validSTID,
					AccountID:     &validAccID,
					ActualAmount:  5000,
				},
				setupST: true,
				isPaid:  false,
				wantErr: false,
			},
			{
				name: "scheduled transaction not found",
				req: ConfirmScheduledTransactionRequest{
					SpaceID:       validSpace,
					TransactionID: "invalid_stid",
				},
				setupST: false,
				wantErr: true,
			},
			{
				name: "already paid scheduled transaction",
				req: ConfirmScheduledTransactionRequest{
					SpaceID:       validSpace,
					TransactionID: validSTID,
				},
				setupST: true,
				isPaid:  true,
				wantErr: true,
			},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				stPayments := make(map[ScheduledTransactionID]*ScheduledTransaction)
				if tt.setupST {
					status := ScheduledTransactionPending
					if tt.isPaid {
						status = ScheduledTransactionPaid
					}
					stPayments[validSTID] = &ScheduledTransaction{
						ID:         validSTID,
						SpaceID:    validSpace,
						BudgetID:   &validBID,
						AccountID:  &validAccID,
						Amount:     5000,
						Currency:   "USD",
						DueDate:    now,
						Status:     status,
						Type:       TransactionTypeExpense,
						SourceType: string(SourceTypeRecurrentTransaction),
						SourceID:   "rec_123",
					}
				}
				stStore := newScheduledTransactionStoreMock(stPayments)

				bStore := newBudgetStoreMock(map[BudgetID]*Budget{
					validBID: {
						ID:          validBID,
						SpaceID:     validSpace,
						LimitAmount: 50000,
						Currency:    "USD",
						Interval:    IntervalMonthly,
						Status:      BudgetStatusActive,
					},
				})

				pStore := newPeriodStoreMock(map[string]*BudgetPeriod{
					"key": {
						ID:                 validPID,
						BudgetID:           validBID,
						SpaceID:            validSpace,
						Currency:           "USD",
						BaseCurrency:       "USD",
						ExchangeRateToBase: 1.0,
					},
				})

				setStore := newSettingsStoreMock(map[SpaceID]*FinanceSettings{
					validSpace: {SpaceID: validSpace, BaseCurrency: "USD"},
				})

				accStore := newAccountStoreMock(map[AccountID]*Account{
					validAccID: {ID: validAccID, SpaceID: validSpace, Currency: "USD", IsActive: true, CurrentBalance: 20000},
				})

				txnStore := newTransactionStoreMock(nil)
				eventStore := newTransactionEventStoreMock(nil)
				rStore := newRecurringTransactionStoreMock(map[RecurringTransactionID]*RecurringTransaction{
					"rec_123": {ID: "rec_123", SpaceID: validSpace, Name: "Rec Name"},
				})

				svc := NewService(Dependencies{
					ScheduledTransactionStore: stStore,
					BudgetStore:               bStore,
					PeriodStore:               pStore,
					SettingsStore:             setStore,
					AccountStore:              accStore,
					TransactionStore:          txnStore,
					TransactionEventStore:     eventStore,
					RecurringTransactionStore: rStore,
				})

				res, err := svc.ConfirmScheduledTransaction(ctx, tt.req)
				if (err != nil) != tt.wantErr {
					t.Errorf("ConfirmScheduledTransaction() error = %v, wantErr %v", err, tt.wantErr)
				}
				if !tt.wantErr && res == nil {
					t.Error("expected non-nil transaction")
				}
			})
		}
	})

	t.Run("MatchScheduledTransaction", func(t *testing.T) {
		tests := []struct {
			name       string
			req        MatchScheduledTransactionRequest
			setupST    bool
			setupTxn   bool
			diffSpaces bool
			wantErr    bool
		}{
			{
				name: "valid matching",
				req: MatchScheduledTransactionRequest{
					SpaceID:       validSpace,
					TransactionID: validSTID,
					MatchedID:     validTID,
				},
				setupST:  true,
				setupTxn: true,
				wantErr:  false,
			},
			{
				name: "different spaces error",
				req: MatchScheduledTransactionRequest{
					SpaceID:       validSpace,
					TransactionID: validSTID,
					MatchedID:     validTID,
				},
				setupST:    true,
				setupTxn:   true,
				diffSpaces: true,
				wantErr:    true,
			},
			{
				name: "scheduled transaction not found",
				req: MatchScheduledTransactionRequest{
					SpaceID:       validSpace,
					TransactionID: "invalid_id",
					MatchedID:     validTID,
				},
				setupST:  false,
				setupTxn: true,
				wantErr:  true,
			},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				stPayments := make(map[ScheduledTransactionID]*ScheduledTransaction)
				if tt.setupST {
					stPayments[validSTID] = &ScheduledTransaction{
						ID:         validSTID,
						SpaceID:    validSpace,
						Amount:     5000,
						Status:     ScheduledTransactionPending,
						SourceType: string(SourceTypeRecurrentTransaction),
						SourceID:   "rec_123",
					}
				}
				stStore := newScheduledTransactionStoreMock(stPayments)

				txnMap := make(map[TransactionID]*Transaction)
				if tt.setupTxn {
					space := validSpace
					if tt.diffSpaces {
						space = otherSpace
					}
					txnMap[validTID] = &Transaction{
						ID:      validTID,
						SpaceID: space,
						Amount:  5000,
					}
				}
				txnStore := newTransactionStoreMock(txnMap)

				eventStore := newTransactionEventStoreMock(nil)

				svc := NewService(Dependencies{
					ScheduledTransactionStore: stStore,
					TransactionStore:          txnStore,
					TransactionEventStore:     eventStore,
				})

				res, err := svc.MatchScheduledTransaction(ctx, tt.req)
				if (err != nil) != tt.wantErr {
					t.Errorf("MatchScheduledTransaction() error = %v, wantErr %v", err, tt.wantErr)
				}
				if !tt.wantErr && res == nil {
					t.Error("expected non-nil transaction")
				}
			})
		}
	})

	t.Run("SkipScheduledTransaction", func(t *testing.T) {
		tests := []struct {
			name    string
			spaceID SpaceID
			id      ScheduledTransactionID
			exists  bool
			isPaid  bool
			wantErr bool
		}{
			{
				name:    "valid skip",
				spaceID: validSpace,
				id:      validSTID,
				exists:  true,
				isPaid:  false,
				wantErr: false,
			},
			{
				name:    "invalid space ID",
				spaceID: "invalid_space",
				id:      validSTID,
				exists:  true,
				wantErr: true,
			},
			{
				name:    "invalid scheduled transaction ID",
				spaceID: validSpace,
				id:      "invalid_id",
				exists:  true,
				wantErr: true,
			},
			{
				name:    "not found",
				spaceID: validSpace,
				id:      validSTID,
				exists:  false,
				wantErr: true,
			},
			{
				name:    "cannot skip paid transaction",
				spaceID: validSpace,
				id:      validSTID,
				exists:  true,
				isPaid:  true,
				wantErr: true,
			},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				stPayments := make(map[ScheduledTransactionID]*ScheduledTransaction)
				if tt.exists {
					status := ScheduledTransactionPending
					if tt.isPaid {
						status = ScheduledTransactionPaid
					}
					stPayments[validSTID] = &ScheduledTransaction{
						ID:      validSTID,
						SpaceID: validSpace,
						Status:  status,
					}
				}
				stStore := newScheduledTransactionStoreMock(stPayments)

				svc := NewService(Dependencies{ScheduledTransactionStore: stStore})
				res, err := svc.SkipScheduledTransaction(ctx, tt.spaceID, tt.id)
				if (err != nil) != tt.wantErr {
					t.Errorf("SkipScheduledTransaction() error = %v, wantErr %v", err, tt.wantErr)
				}
				if !tt.wantErr && res.Status != ScheduledTransactionSkipped {
					t.Errorf("res.Status = %v, want SKIPPED", res.Status)
				}
			})
		}
	})
}

// --- Tests from service_settings_test.go ---

func TestService_GetFinanceSettings(t *testing.T) {
	ctx := context.Background()
	validSpace := SpaceID("spc_2dE1V8ZqWz4eS2N9yX3bL1mK7pO")
	otherSpace := SpaceID("spc_2dE1V8ZqWz4eS2N9yX3bL1mK7pX")

	tests := []struct {
		name      string
		spaceID   SpaceID
		setupData map[SpaceID]*FinanceSettings
		wantErr   bool
	}{
		{
			name:    "successful retrieval",
			spaceID: validSpace,
			setupData: map[SpaceID]*FinanceSettings{
				validSpace: {SpaceID: validSpace, BaseCurrency: "USD"},
			},
			wantErr: false,
		},
		{
			name:      "empty space ID",
			spaceID:   "",
			setupData: nil,
			wantErr:   true,
		},
		{
			name:      "settings not found",
			spaceID:   otherSpace,
			setupData: map[SpaceID]*FinanceSettings{},
			wantErr:   true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			store := &SettingsStoreMock{
				GetByIDFunc: func(ctx context.Context, spaceID SpaceID) (*FinanceSettings, error) {
					if tt.setupData != nil {
						if s, ok := tt.setupData[spaceID]; ok {
							return s, nil
						}
					}
					return nil, errors.E(errors.NotExist, SettingsNotFound, "finance settings not found")
				},
			}
			svc := NewService(Dependencies{SettingsStore: store})
			res, err := svc.GetFinanceSettings(ctx, tt.spaceID)
			if (err != nil) != tt.wantErr {
				t.Errorf("GetFinanceSettings() error = %v, wantErr %v", err, tt.wantErr)
			}
			if !tt.wantErr && res.SpaceID != tt.spaceID {
				t.Errorf("res.SpaceID = %v, want %v", res.SpaceID, tt.spaceID)
			}
		})
	}
}

// --- Tests from service_statement_test.go ---

func TestService_Statements(t *testing.T) {
	ctx := context.Background()
	validSpace := SpaceID("spc_2dE1V8ZqWz4eS2N9yX3bL1mK7pO")
	validSID, _ := NewStatementID()
	validAccID, _ := NewAccountID()
	validLineID, _ := NewStatementLineID()
	now := time.Now().UTC()

	t.Run("GetStatement", func(t *testing.T) {
		tests := []struct {
			name    string
			spaceID SpaceID
			id      StatementID
			exists  bool
			wantErr bool
		}{
			{
				name:    "valid retrieval",
				spaceID: validSpace,
				id:      validSID,
				exists:  true,
				wantErr: false,
			},
			{
				name:    "invalid space ID",
				spaceID: "invalid_space",
				id:      validSID,
				exists:  true,
				wantErr: true,
			},
			{
				name:    "invalid statement ID",
				spaceID: validSpace,
				id:      "invalid_id",
				exists:  true,
				wantErr: true,
			},
			{
				name:    "not found",
				spaceID: validSpace,
				id:      validSID,
				exists:  false,
				wantErr: true,
			},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				store := newStatementStoreMock(nil, nil)
				if tt.exists {
					_ = store.Create(ctx, &Statement{ID: validSID, SpaceID: validSpace}, nil)
				}
				svc := NewService(Dependencies{StatementStore: store})
				res, err := svc.GetStatement(ctx, tt.spaceID, tt.id)
				if (err != nil) != tt.wantErr {
					t.Errorf("GetStatement() error = %v, wantErr %v", err, tt.wantErr)
				}
				if !tt.wantErr && res.ID != tt.id {
					t.Errorf("res.ID = %v, want %v", res.ID, tt.id)
				}
			})
		}
	})

	t.Run("ListStatements", func(t *testing.T) {
		tests := []struct {
			name    string
			spaceID SpaceID
			wantErr bool
		}{
			{
				name:    "valid list",
				spaceID: validSpace,
				wantErr: false,
			},
			{
				name:    "invalid space ID",
				spaceID: "invalid_space",
				wantErr: true,
			},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				store := newStatementStoreMock(nil, nil)
				svc := NewService(Dependencies{StatementStore: store})
				_, err := svc.ListStatements(ctx, tt.spaceID, &ListStatementsFilter{})
				if (err != nil) != tt.wantErr {
					t.Errorf("ListStatements() error = %v, wantErr %v", err, tt.wantErr)
				}
			})
		}
	})

	t.Run("ImportStatement", func(t *testing.T) {
		tests := []struct {
			name       string
			accountID  AccountID
			statement  *Statement
			setupStore func() *AccountStoreMock
			wantErr    bool
		}{
			{
				name:      "nil statement returns error",
				accountID: validAccID,
				statement: nil,
				setupStore: func() *AccountStoreMock {
					return newAccountStoreMock(map[AccountID]*Account{validAccID: {ID: validAccID, SpaceID: validSpace}})
				},
				wantErr: true,
			},
			{
				name:      "invalid space ID",
				accountID: validAccID,
				statement: &Statement{
					SpaceID: "invalid_space",
				},
				setupStore: func() *AccountStoreMock {
					return newAccountStoreMock(map[AccountID]*Account{validAccID: {ID: validAccID, SpaceID: validSpace}})
				},
				wantErr: true,
			},
			{
				name:      "invalid account ID",
				accountID: "invalid_acc",
				statement: &Statement{
					SpaceID: validSpace,
				},
				setupStore: func() *AccountStoreMock {
					return newAccountStoreMock(map[AccountID]*Account{validAccID: {ID: validAccID, SpaceID: validSpace}})
				},
				wantErr: true,
			},
			{
				name:      "account not found in store",
				accountID: validAccID,
				statement: &Statement{
					SpaceID: validSpace,
				},
				setupStore: func() *AccountStoreMock {
					return newAccountStoreMock(nil)
				},
				wantErr: true,
			},
			{
				name:      "decode lines fails on unsupported format",
				accountID: validAccID,
				statement: &Statement{
					ID:            validSID,
					SpaceID:       validSpace,
					AccountID:     validAccID,
					Status:        StatementStatusInProgress,
					StatementDate: now,
					Filename:      "test.unsupported",
					Config: StatementConfig{
						Format: "UNSUPPORTED_FORMAT",
					},
					RawContent: "some random data",
				},
				setupStore: func() *AccountStoreMock {
					return newAccountStoreMock(map[AccountID]*Account{validAccID: {ID: validAccID, SpaceID: validSpace}})
				},
				wantErr: true,
			},
			{
				name:      "valid CSV import",
				accountID: validAccID,
				statement: &Statement{
					ID:            validSID,
					SpaceID:       validSpace,
					AccountID:     validAccID,
					Status:        StatementStatusInProgress,
					StatementDate: now,
					Filename:      "test.csv",
					Config: StatementConfig{
						Format: "CSV",
						CSV: &CSVMapping{
							DateColumnIndex:        0,
							DescriptionColumnIndex: 1,
							AmountColumnIndex:      2,
							HasHeader:              true,
							Delimiter:              ",",
							DateFormat:             "2006-01-02",
						},
					},
					RawContent: "Date,Description,Amount\n2026-08-01,Store,-15.50",
				},
				setupStore: func() *AccountStoreMock {
					return newAccountStoreMock(map[AccountID]*Account{validAccID: {ID: validAccID, SpaceID: validSpace}})
				},
				wantErr: false,
			},
			{
				name:      "invalid statement validation fails import",
				accountID: validAccID,
				statement: &Statement{
					ID:            validSID,
					SpaceID:       validSpace,
					AccountID:     validAccID,
					Status:        "UNKNOWN_STATUS",
					StatementDate: now,
					Filename:      "test.csv",
					Config:        StatementConfig{Format: "CSV"},
					RawContent:    "data",
				},
				setupStore: func() *AccountStoreMock {
					return newAccountStoreMock(map[AccountID]*Account{validAccID: {ID: validAccID, SpaceID: validSpace}})
				},
				wantErr: true,
			},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				store := newStatementStoreMock(nil, nil)
				accStore := tt.setupStore()
				svc := NewService(Dependencies{StatementStore: store, AccountStore: accStore})
				stmt, err := svc.ImportStatement(ctx, tt.accountID, tt.statement)
				if (err != nil) != tt.wantErr {
					t.Errorf("ImportStatement() error = %v, wantErr %v", err, tt.wantErr)
				}
				if !tt.wantErr && stmt == nil {
					t.Error("expected non-nil imported statement")
				}
			})
		}
	})

	t.Run("DeleteStatement", func(t *testing.T) {
		tests := []struct {
			name       string
			spaceID    SpaceID
			id         StatementID
			setupStore func() *StatementStoreMock
			wantErr    bool
		}{
			{
				name:    "invalid space ID",
				spaceID: "invalid",
				id:      validSID,
				setupStore: func() *StatementStoreMock {
					return newStatementStoreMock(nil, nil)
				},
				wantErr: true,
			},
			{
				name:    "not found",
				spaceID: validSpace,
				id:      validSID,
				setupStore: func() *StatementStoreMock {
					return newStatementStoreMock(nil, nil)
				},
				wantErr: true,
			},
			{
				name:    "completed statement cannot be deleted",
				spaceID: validSpace,
				id:      validSID,
				setupStore: func() *StatementStoreMock {
					store := newStatementStoreMock(nil, nil)
					_ = store.Create(ctx, &Statement{
						ID:      validSID,
						SpaceID: validSpace,
						Status:  StatementStatusCompleted,
					}, nil)
					return store
				},
				wantErr: true,
			},
			{
				name:    "in progress statement deleted successfully",
				spaceID: validSpace,
				id:      validSID,
				setupStore: func() *StatementStoreMock {
					store := newStatementStoreMock(nil, nil)
					_ = store.Create(ctx, &Statement{
						ID:      validSID,
						SpaceID: validSpace,
						Status:  StatementStatusInProgress,
					}, nil)
					return store
				},
				wantErr: false,
			},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				store := tt.setupStore()
				svc := NewService(Dependencies{StatementStore: store})
				err := svc.DeleteStatement(ctx, tt.spaceID, tt.id, DeleteOptions{})
				if (err != nil) != tt.wantErr {
					t.Errorf("DeleteStatement() error = %v, wantErr %v", err, tt.wantErr)
				}
			})
		}
	})

	t.Run("ListStatementLines", func(t *testing.T) {
		tests := []struct {
			name       string
			spaceID    SpaceID
			id         StatementID
			setupStore func() *StatementStoreMock
			wantErr    bool
		}{
			{
				name:    "valid statement ID",
				spaceID: validSpace,
				id:      validSID,
				setupStore: func() *StatementStoreMock {
					store := newStatementStoreMock(nil, nil)
					_ = store.Create(ctx, &Statement{ID: validSID, SpaceID: validSpace}, nil)
					return store
				},
				wantErr: false,
			},
			{
				name:    "invalid space ID",
				spaceID: "invalid_space",
				id:      validSID,
				setupStore: func() *StatementStoreMock {
					return newStatementStoreMock(nil, nil)
				},
				wantErr: true,
			},
			{
				name:    "invalid statement ID",
				spaceID: validSpace,
				id:      "invalid_id",
				setupStore: func() *StatementStoreMock {
					return newStatementStoreMock(nil, nil)
				},
				wantErr: true,
			},
			{
				name:    "statement not found",
				spaceID: validSpace,
				id:      validSID,
				setupStore: func() *StatementStoreMock {
					return newStatementStoreMock(nil, nil)
				},
				wantErr: true,
			},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				store := tt.setupStore()
				txnStore := newTransactionStoreMock(nil)
				svc := NewService(Dependencies{
					StatementStore:   store,
					TransactionStore: txnStore,
				})
				_, err := svc.ListStatementLines(ctx, tt.spaceID, tt.id)
				if (err != nil) != tt.wantErr {
					t.Errorf("ListStatementLines() error = %v, wantErr %v", err, tt.wantErr)
				}
			})
		}
	})

	t.Run("UpdateStatementLine", func(t *testing.T) {
		tests := []struct {
			name       string
			line       *StatementLine
			mask       []string
			setupStore func() *StatementStoreMock
			wantErr    bool
		}{
			{
				name: "invalid line ID",
				line: &StatementLine{
					StatementID: validSID,
					ID:          "invalid_id",
				},
				mask: []string{"status"},
				setupStore: func() *StatementStoreMock {
					return newStatementStoreMock(nil, nil)
				},
				wantErr: true,
			},
			{
				name: "line not found",
				line: &StatementLine{
					StatementID: validSID,
					ID:          validLineID,
				},
				mask: []string{"status"},
				setupStore: func() *StatementStoreMock {
					return newStatementStoreMock(nil, nil)
				},
				wantErr: true,
			},
			{
				name: "successful update",
				line: &StatementLine{
					StatementID: validSID,
					ID:          validLineID,
					Status:      StatementLineStatusMatched,
					Version:     1,
				},
				mask: []string{"status"},
				setupStore: func() *StatementStoreMock {
					store := newStatementStoreMock(nil, nil)
					_ = store.Create(ctx, &Statement{ID: validSID, SpaceID: validSpace}, []*StatementLine{
						{
							ID:          validLineID,
							StatementID: validSID,
							RowIndex:    0,
							DateStr:     "2026-08-01",
							Description: "Item",
							Amount:      1000,
							Status:      StatementLineStatusUnmatched,
							Version:     1,
						},
					})
					return store
				},
				wantErr: false,
			},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				store := tt.setupStore()
				svc := NewService(Dependencies{StatementStore: store})
				res, err := svc.UpdateStatementLine(ctx, validSpace, tt.line, tt.mask)
				if (err != nil) != tt.wantErr {
					t.Errorf("UpdateStatementLine() error = %v, wantErr %v", err, tt.wantErr)
				}
				if !tt.wantErr && res == nil {
					t.Error("expected non-nil updated line")
				}
			})
		}
	})

	t.Run("UpdateStatement", func(t *testing.T) {
		tests := []struct {
			name       string
			statement  *Statement
			mask       []string
			setupStore func() *StatementStoreMock
			wantErr    bool
		}{
			{
				name: "cannot update completed statement",
				statement: &Statement{
					ID:      validSID,
					SpaceID: validSpace,
					Version: 1,
				},
				mask: []string{"statement_ending_balance"},
				setupStore: func() *StatementStoreMock {
					store := newStatementStoreMock(nil, nil)
					_ = store.Create(ctx, &Statement{
						ID:      validSID,
						SpaceID: validSpace,
						Status:  StatementStatusCompleted,
						Version: 1,
					}, nil)
					return store
				},
				wantErr: true,
			},
			{
				name: "successful patch update",
				statement: &Statement{
					ID:                     validSID,
					SpaceID:                validSpace,
					StatementEndingBalance: 9000,
					Version:                1,
				},
				mask: []string{"statement_ending_balance"},
				setupStore: func() *StatementStoreMock {
					store := newStatementStoreMock(nil, nil)
					_ = store.Create(ctx, &Statement{
						ID:            validSID,
						SpaceID:       validSpace,
						AccountID:     validAccID,
						Status:        StatementStatusInProgress,
						StatementDate: now,
						Filename:      "stmt.csv",
						Config:        StatementConfig{Format: "CSV"},
						RawContent:    "data",
						Version:       1,
					}, nil)
					return store
				},
				wantErr: false,
			},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				store := tt.setupStore()
				svc := NewService(Dependencies{StatementStore: store})
				res, err := svc.UpdateStatement(ctx, validSpace, tt.statement, tt.mask)
				if (err != nil) != tt.wantErr {
					t.Errorf("UpdateStatement() error = %v, wantErr %v", err, tt.wantErr)
				}
				if !tt.wantErr && res == nil {
					t.Error("expected non-nil updated statement")
				}
			})
		}
	})

	t.Run("InvertStatementSigns", func(t *testing.T) {
		tests := []struct {
			name       string
			spaceID    SpaceID
			id         StatementID
			setupStore func() *StatementStoreMock
			wantErr    bool
		}{
			{
				name:    "invalid space ID",
				spaceID: "invalid_space",
				id:      validSID,
				setupStore: func() *StatementStoreMock {
					return newStatementStoreMock(nil, nil)
				},
				wantErr: true,
			},
			{
				name:    "invalid statement ID",
				spaceID: validSpace,
				id:      "invalid_id",
				setupStore: func() *StatementStoreMock {
					return newStatementStoreMock(nil, nil)
				},
				wantErr: true,
			},
			{
				name:    "statement not found",
				spaceID: validSpace,
				id:      validSID,
				setupStore: func() *StatementStoreMock {
					return newStatementStoreMock(nil, nil)
				},
				wantErr: true,
			},
			{
				name:    "completed statement cannot be inverted",
				spaceID: validSpace,
				id:      validSID,
				setupStore: func() *StatementStoreMock {
					store := newStatementStoreMock(nil, nil)
					_ = store.Create(ctx, &Statement{
						ID:                       validSID,
						SpaceID:                  validSpace,
						Status:                   StatementStatusCompleted,
						StatementStartingBalance: 1000,
						StatementEndingBalance:   2000,
					}, nil)
					return store
				},
				wantErr: true,
			},
			{
				name:    "successful inversion of in-progress statement and lines",
				spaceID: validSpace,
				id:      validSID,
				setupStore: func() *StatementStoreMock {
					store := newStatementStoreMock(nil, nil)
					_ = store.Create(ctx, &Statement{
						ID:                       validSID,
						SpaceID:                  validSpace,
						AccountID:                validAccID,
						Status:                   StatementStatusInProgress,
						StatementStartingBalance: 1000,
						StatementEndingBalance:   3000,
					}, []*StatementLine{
						{
							ID:          validLineID,
							StatementID: validSID,
							Amount:      2000,
							Action:      StatementLineAction{Type: StatementLineActionTypeCreateIncome},
						},
					})
					return store
				},
				wantErr: false,
			},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				store := tt.setupStore()
				txnStore := newTransactionStoreMock(nil)
				svc := NewService(Dependencies{
					StatementStore:   store,
					TransactionStore: txnStore,
				})
				stmt, lines, err := svc.InvertStatementSigns(ctx, tt.spaceID, tt.id)
				if (err != nil) != tt.wantErr {
					t.Errorf("InvertStatementSigns() error = %v, wantErr %v", err, tt.wantErr)
				}
				if !tt.wantErr {
					if stmt == nil || len(lines) == 0 {
						t.Error("expected non-nil statement and lines")
					}
					if stmt.StatementStartingBalance != -1000 || stmt.StatementEndingBalance != -3000 {
						t.Errorf("expected inverted balances, got starting %d ending %d", stmt.StatementStartingBalance, stmt.StatementEndingBalance)
					}
				}
			})
		}
	})

	t.Run("CompleteStatement", func(t *testing.T) {
		counterAccID, _ := NewAccountID()
		validBID, _ := NewBudgetID()
		validPID, _ := NewScheduledTransactionID()
		validBrwID, _ := NewBorrowingID()
		existingTxnID, _ := NewTransactionID()

		tests := []struct {
			name        string
			spaceID     SpaceID
			id          StatementID
			setupStores func() Dependencies
			wantErr     bool
		}{
			{
				name:    "invalid space ID",
				spaceID: "invalid_space",
				id:      validSID,
				setupStores: func() Dependencies {
					return Dependencies{StatementStore: newStatementStoreMock(nil, nil)}
				},
				wantErr: true,
			},
			{
				name:    "invalid statement ID",
				spaceID: validSpace,
				id:      "invalid_id",
				setupStores: func() Dependencies {
					return Dependencies{StatementStore: newStatementStoreMock(nil, nil)}
				},
				wantErr: true,
			},
			{
				name:    "statement not found",
				spaceID: validSpace,
				id:      validSID,
				setupStores: func() Dependencies {
					return Dependencies{StatementStore: newStatementStoreMock(nil, nil)}
				},
				wantErr: true,
			},
			{
				name:    "statement already completed",
				spaceID: validSpace,
				id:      validSID,
				setupStores: func() Dependencies {
					store := newStatementStoreMock(nil, nil)
					_ = store.Create(ctx, &Statement{
						ID:      validSID,
						SpaceID: validSpace,
						Status:  StatementStatusCompleted,
					}, nil)
					return Dependencies{StatementStore: store}
				},
				wantErr: true,
			},
			{
				name:    "balance mismatch discrepancy fails",
				spaceID: validSpace,
				id:      validSID,
				setupStores: func() Dependencies {
					store := newStatementStoreMock(nil, nil)
					_ = store.Create(ctx, &Statement{
						ID:                       validSID,
						SpaceID:                  validSpace,
						AccountID:                validAccID,
						Status:                   StatementStatusInProgress,
						StatementStartingBalance: 1000,
						StatementEndingBalance:   5000, // expected flow is 4000
					}, []*StatementLine{
						{
							ID:          validLineID,
							StatementID: validSID,
							Amount:      2000, // netFlow is 2000 != 4000
							Status:      StatementLineStatusUnmatched,
						},
					})
					return Dependencies{StatementStore: store}
				},
				wantErr: true,
			},
			{
				name:    "statement account not found",
				spaceID: validSpace,
				id:      validSID,
				setupStores: func() Dependencies {
					store := newStatementStoreMock(nil, nil)
					_ = store.Create(ctx, &Statement{
						ID:                       validSID,
						SpaceID:                  validSpace,
						AccountID:                validAccID,
						Status:                   StatementStatusInProgress,
						StatementStartingBalance: 1000,
						StatementEndingBalance:   3000,
					}, []*StatementLine{
						{
							ID:          validLineID,
							StatementID: validSID,
							Amount:      2000,
							Status:      StatementLineStatusUnmatched,
						},
					})
					return Dependencies{
						StatementStore: store,
						AccountStore:   newAccountStoreMock(nil),
					}
				},
				wantErr: true,
			},
			{
				name:    "line status matched with missing transaction ID fails",
				spaceID: validSpace,
				id:      validSID,
				setupStores: func() Dependencies {
					store := newStatementStoreMock(nil, nil)
					_ = store.Create(ctx, &Statement{
						ID:                       validSID,
						SpaceID:                  validSpace,
						AccountID:                validAccID,
						Status:                   StatementStatusInProgress,
						StatementStartingBalance: 1000,
						StatementEndingBalance:   3000,
					}, []*StatementLine{
						{
							ID:                   validLineID,
							StatementID:          validSID,
							Amount:               2000,
							Status:               StatementLineStatusMatched,
							MatchedTransactionID: nil,
						},
					})
					accStore := newAccountStoreMock(map[AccountID]*Account{
						validAccID: {ID: validAccID, SpaceID: validSpace, Currency: "USD"},
					})
					return Dependencies{
						StatementStore: store,
						AccountStore:   accStore,
					}
				},
				wantErr: true,
			},
			{
				name:    "successful complete with matched line and overwrite delta balance",
				spaceID: validSpace,
				id:      validSID,
				setupStores: func() Dependencies {
					store := newStatementStoreMock(nil, nil)
					overwrite := true
					_ = store.Create(ctx, &Statement{
						ID:                       validSID,
						SpaceID:                  validSpace,
						AccountID:                validAccID,
						Status:                   StatementStatusInProgress,
						StatementStartingBalance: 1000,
						StatementEndingBalance:   3000,
					}, []*StatementLine{
						{
							ID:                   validLineID,
							StatementID:          validSID,
							Amount:               2000,
							Status:               StatementLineStatusMatched,
							MatchedTransactionID: &existingTxnID,
							Action:               StatementLineAction{OverwriteTransaction: &overwrite},
							Description:          "Updated Merchant",
						},
					})
					accStore := newAccountStoreMock(map[AccountID]*Account{
						validAccID: {ID: validAccID, SpaceID: validSpace, Currency: "USD", CurrentBalance: 10000, IsActive: true},
					})
					txnStore := newTransactionStoreMock(map[TransactionID]*Transaction{
						existingTxnID: {
							ID:        existingTxnID,
							SpaceID:   validSpace,
							Type:      TransactionTypeIncome,
							AccountID: &validAccID,
							Amount:    1500,
						},
					})
					return Dependencies{
						StatementStore:   store,
						AccountStore:     accStore,
						TransactionStore: txnStore,
					}
				},
				wantErr: false,
			},
			{
				name:    "successful complete with action CreateExpense, CreateIncome, and Skip",
				spaceID: validSpace,
				id:      validSID,
				setupStores: func() Dependencies {
					store := newStatementStoreMock(nil, nil)
					lineExpenseID, _ := NewStatementLineID()
					lineIncomeID, _ := NewStatementLineID()
					lineSkipID, _ := NewStatementLineID()

					_ = store.Create(ctx, &Statement{
						ID:                       validSID,
						SpaceID:                  validSpace,
						AccountID:                validAccID,
						Status:                   StatementStatusInProgress,
						StatementStartingBalance: 10000,
						StatementEndingBalance:   12000, // net difference 2000
					}, []*StatementLine{
						{
							ID:          lineExpenseID,
							StatementID: validSID,
							RowIndex:    0,
							Amount:      -3000,
							DateStr:     "2026-08-01",
							Description: "Expense Item",
							Status:      StatementLineStatusUnmatched,
							Action: StatementLineAction{
								Type:     StatementLineActionTypeCreateExpense,
								BudgetID: &validBID,
							},
						},
						{
							ID:          lineIncomeID,
							StatementID: validSID,
							RowIndex:    1,
							Amount:      5000,
							DateStr:     "2026-08-02",
							Description: "Income Item",
							Status:      StatementLineStatusUnmatched,
							Action: StatementLineAction{
								Type: StatementLineActionTypeCreateIncome,
							},
						},
						{
							ID:          lineSkipID,
							StatementID: validSID,
							RowIndex:    2,
							Amount:      0,
							Status:      StatementLineStatusUnmatched,
							Action: StatementLineAction{
								Type: StatementLineActionTypeSkip,
							},
						},
					})

					accStore := newAccountStoreMock(map[AccountID]*Account{
						validAccID: {ID: validAccID, SpaceID: validSpace, Currency: "USD", CurrentBalance: 10000, IsActive: true},
					})
					bgtStore := newBudgetStoreMock(map[BudgetID]*Budget{
						validBID: {
							ID:          validBID,
							SpaceID:     validSpace,
							Name:        "General",
							Status:      BudgetStatusActive,
							LimitAmount: 50000,
							Currency:    "USD",
							Interval:    IntervalMonthly,
						},
					})
					pStore := newPeriodStoreMock(nil)
					setStore := newSettingsStoreMock(map[SpaceID]*FinanceSettings{
						validSpace: {BaseCurrency: "USD"},
					})
					txnStore := newTransactionStoreMock(nil)

					return Dependencies{
						StatementStore:   store,
						AccountStore:     accStore,
						BudgetStore:      bgtStore,
						PeriodStore:      pStore,
						SettingsStore:    setStore,
						TransactionStore: txnStore,
					}
				},
				wantErr: false,
			},
			{
				name:    "action CreateTransfer missing counterpart account fails",
				spaceID: validSpace,
				id:      validSID,
				setupStores: func() Dependencies {
					store := newStatementStoreMock(nil, nil)
					_ = store.Create(ctx, &Statement{
						ID:                       validSID,
						SpaceID:                  validSpace,
						AccountID:                validAccID,
						Status:                   StatementStatusInProgress,
						StatementStartingBalance: 1000,
						StatementEndingBalance:   2000,
					}, []*StatementLine{
						{
							ID:          validLineID,
							StatementID: validSID,
							Amount:      1000,
							Status:      StatementLineStatusUnmatched,
							Action: StatementLineAction{
								Type: StatementLineActionTypeCreateTransfer,
							},
						},
					})
					accStore := newAccountStoreMock(map[AccountID]*Account{
						validAccID: {ID: validAccID, SpaceID: validSpace, Currency: "USD", CurrentBalance: 10000, IsActive: true},
					})
					return Dependencies{
						StatementStore: store,
						AccountStore:   accStore,
					}
				},
				wantErr: true,
			},
			{
				name:    "successful complete with action CreateTransfer",
				spaceID: validSpace,
				id:      validSID,
				setupStores: func() Dependencies {
					store := newStatementStoreMock(nil, nil)
					_ = store.Create(ctx, &Statement{
						ID:                       validSID,
						SpaceID:                  validSpace,
						AccountID:                validAccID,
						Status:                   StatementStatusInProgress,
						StatementStartingBalance: 5000,
						StatementEndingBalance:   2000, // outflow -3000
					}, []*StatementLine{
						{
							ID:          validLineID,
							StatementID: validSID,
							Amount:      -3000,
							DateStr:     "2026-08-01",
							Status:      StatementLineStatusUnmatched,
							Action: StatementLineAction{
								Type:                 StatementLineActionTypeCreateTransfer,
								CounterpartAccountID: &counterAccID,
							},
						},
					})
					accStore := newAccountStoreMock(map[AccountID]*Account{
						validAccID:   {ID: validAccID, SpaceID: validSpace, Currency: "USD", CurrentBalance: 10000, IsActive: true},
						counterAccID: {ID: counterAccID, SpaceID: validSpace, Currency: "USD", CurrentBalance: 5000, IsActive: true},
					})
					setStore := newSettingsStoreMock(map[SpaceID]*FinanceSettings{
						validSpace: {BaseCurrency: "USD"},
					})
					txnStore := newTransactionStoreMock(nil)

					return Dependencies{
						StatementStore:   store,
						AccountStore:     accStore,
						SettingsStore:    setStore,
						TransactionStore: txnStore,
						TransferStore:    newTransferStoreMock(nil),
					}
				},
				wantErr: false,
			},
			{
				name:    "successful complete with action ConfirmScheduled",
				spaceID: validSpace,
				id:      validSID,
				setupStores: func() Dependencies {
					store := newStatementStoreMock(nil, nil)
					_ = store.Create(ctx, &Statement{
						ID:                       validSID,
						SpaceID:                  validSpace,
						AccountID:                validAccID,
						Status:                   StatementStatusInProgress,
						StatementStartingBalance: 5000,
						StatementEndingBalance:   3000, // expense -2000
					}, []*StatementLine{
						{
							ID:          validLineID,
							StatementID: validSID,
							Amount:      -2000,
							DateStr:     "2026-08-01",
							Status:      StatementLineStatusUnmatched,
							Action: StatementLineAction{
								Type:                   StatementLineActionTypeConfirmScheduled,
								ScheduledTransactionID: &validPID,
							},
						},
					})
					accStore := newAccountStoreMock(map[AccountID]*Account{
						validAccID: {ID: validAccID, SpaceID: validSpace, Currency: "USD", CurrentBalance: 10000, IsActive: true},
					})
					schedStore := newScheduledTransactionStoreMock(map[ScheduledTransactionID]*ScheduledTransaction{
						validPID: {
							ID:       validPID,
							SpaceID:  validSpace,
							Amount:   2000,
							BudgetID: &validBID,
							Status:   ScheduledTransactionPending,
						},
					})
					bgtStore := newBudgetStoreMock(map[BudgetID]*Budget{
						validBID: {
							ID:          validBID,
							SpaceID:     validSpace,
							Name:        "Utilities",
							Status:      BudgetStatusActive,
							LimitAmount: 50000,
							Currency:    "USD",
							Interval:    IntervalMonthly,
						},
					})
					pStore := newPeriodStoreMock(nil)
					setStore := newSettingsStoreMock(map[SpaceID]*FinanceSettings{
						validSpace: {BaseCurrency: "USD"},
					})
					txnStore := newTransactionStoreMock(nil)

					return Dependencies{
						StatementStore:            store,
						AccountStore:              accStore,
						ScheduledTransactionStore: schedStore,
						BudgetStore:               bgtStore,
						PeriodStore:               pStore,
						SettingsStore:             setStore,
						TransactionStore:          txnStore,
					}
				},
				wantErr: false,
			},
			{
				name:    "successful complete with action CreateRepayment",
				spaceID: validSpace,
				id:      validSID,
				setupStores: func() Dependencies {
					store := newStatementStoreMock(nil, nil)
					_ = store.Create(ctx, &Statement{
						ID:                       validSID,
						SpaceID:                  validSpace,
						AccountID:                validAccID,
						Status:                   StatementStatusInProgress,
						StatementStartingBalance: 5000,
						StatementEndingBalance:   4000, // expense -1000
					}, []*StatementLine{
						{
							ID:          validLineID,
							StatementID: validSID,
							Amount:      -1000,
							DateStr:     "2026-08-01",
							Status:      StatementLineStatusUnmatched,
							Action: StatementLineAction{
								Type:        StatementLineActionTypeCreateRepayment,
								BorrowingID: &validBrwID,
								BudgetID:    &validBID,
							},
						},
					})
					accStore := newAccountStoreMock(map[AccountID]*Account{
						validAccID: {ID: validAccID, SpaceID: validSpace, Currency: "USD", CurrentBalance: 10000, IsActive: true},
					})
					brwStore := newBorrowingStoreMock(map[BorrowingID]*Borrowing{
						validBrwID: {
							ID:              validBrwID,
							SpaceID:         validSpace,
							TotalAmount:     10000,
							RemainingAmount: 5000,
							Status:          BorrowingStatusActive,
						},
					})
					bgtStore := newBudgetStoreMock(map[BudgetID]*Budget{
						validBID: {
							ID:          validBID,
							SpaceID:     validSpace,
							Name:        "Loan Repayment",
							Status:      BudgetStatusActive,
							LimitAmount: 50000,
							Currency:    "USD",
							Interval:    IntervalMonthly,
						},
					})
					pStore := newPeriodStoreMock(nil)
					setStore := newSettingsStoreMock(map[SpaceID]*FinanceSettings{
						validSpace: {BaseCurrency: "USD"},
					})
					txnStore := newTransactionStoreMock(nil)

					return Dependencies{
						StatementStore:   store,
						AccountStore:     accStore,
						BorrowingStore:   brwStore,
						BudgetStore:      bgtStore,
						PeriodStore:      pStore,
						SettingsStore:    setStore,
						TransactionStore: txnStore,
					}
				},
				wantErr: false,
			},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				deps := tt.setupStores()
				svc := NewService(deps)
				stmt, err := svc.CompleteStatement(ctx, tt.spaceID, tt.id)
				if (err != nil) != tt.wantErr {
					t.Errorf("CompleteStatement() error = %v, wantErr %v", err, tt.wantErr)
				}
				if !tt.wantErr && (stmt == nil || stmt.Status != StatementStatusCompleted) {
					t.Errorf("expected completed statement, got %+v", stmt)
				}
			})
		}
	})
}

// --- Tests from service_transfer_test.go ---

func TestService_TransferOperations_Table(t *testing.T) {
	ctx := context.Background()
	rawSpace, _ := id.Generate("spc_")
	spaceID := SpaceID(rawSpace)
	srcAccID, _ := NewAccountID()
	dstAccID, _ := NewAccountID()
	trsfID, _ := NewTransferID()
	now := time.Now().UTC()

	t.Run("GetTransfer", func(t *testing.T) {
		tests := []struct {
			name    string
			spaceID SpaceID
			id      TransferID
			exists  bool
			wantErr bool
		}{
			{
				name:    "valid retrieval",
				spaceID: spaceID,
				id:      trsfID,
				exists:  true,
				wantErr: false,
			},
			{
				name:    "invalid space ID",
				spaceID: "invalid_space",
				id:      trsfID,
				exists:  true,
				wantErr: true,
			},
			{
				name:    "invalid transfer ID",
				spaceID: spaceID,
				id:      "invalid_id",
				exists:  true,
				wantErr: true,
			},
			{
				name:    "transfer not found",
				spaceID: spaceID,
				id:      trsfID,
				exists:  false,
				wantErr: true,
			},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				data := make(map[TransferID]*Transfer)
				if tt.exists {
					data[trsfID] = &Transfer{
						ID:                   trsfID,
						SpaceID:              spaceID,
						SourceAccountID:      srcAccID,
						DestinationAccountID: dstAccID,
						SourceAmount:         1000,
						DestinationAmount:    1000,
						TransferDate:         now,
					}
				}
				store := newTransferStoreMock(data)
				svc := NewService(Dependencies{TransferStore: store})
				res, err := svc.GetTransfer(ctx, tt.spaceID, tt.id)
				if (err != nil) != tt.wantErr {
					t.Errorf("GetTransfer() error = %v, wantErr %v", err, tt.wantErr)
				}
				if !tt.wantErr && res.ID != tt.id {
					t.Errorf("res.ID = %v, want %v", res.ID, tt.id)
				}
			})
		}
	})

	t.Run("ListTransfers", func(t *testing.T) {
		tests := []struct {
			name    string
			spaceID SpaceID
			wantErr bool
		}{
			{
				name:    "valid list",
				spaceID: spaceID,
				wantErr: false,
			},
			{
				name:    "invalid space ID",
				spaceID: "invalid_space",
				wantErr: true,
			},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				store := newTransferStoreMock(nil)
				svc := NewService(Dependencies{TransferStore: store})
				_, _, err := svc.ListTransfers(ctx, tt.spaceID, 10, "")
				if (err != nil) != tt.wantErr {
					t.Errorf("ListTransfers() error = %v, wantErr %v", err, tt.wantErr)
				}
			})
		}
	})

	t.Run("CreateTransfer", func(t *testing.T) {
		tests := []struct {
			name         string
			transfer     *Transfer
			setupStore   func() (*AccountStoreMock, *TransferStoreMock, *TransactionStoreMock, *SettingsStoreMock)
			wantErr      bool
			errorMessage string
		}{
			{
				name: "invalid transfer properties (zero amount)",
				transfer: &Transfer{
					ID:                   trsfID,
					SpaceID:              spaceID,
					SourceAccountID:      srcAccID,
					DestinationAccountID: dstAccID,
					SourceAmount:         0,
					DestinationAmount:    1000,
					TransferDate:         now,
				},
				setupStore: func() (*AccountStoreMock, *TransferStoreMock, *TransactionStoreMock, *SettingsStoreMock) {
					return newAccountStoreMock(nil),
						newTransferStoreMock(nil),
						newTransactionStoreMock(nil),
						newSettingsStoreMock(nil)
				},
				wantErr: true,
			},
			{
				name: "source and destination amounts differ for single currency",
				transfer: &Transfer{
					ID:                   trsfID,
					SpaceID:              spaceID,
					SourceAccountID:      srcAccID,
					DestinationAccountID: dstAccID,
					SourceAmount:         1000,
					DestinationAmount:    2000,
					TransferDate:         now,
				},
				setupStore: func() (*AccountStoreMock, *TransferStoreMock, *TransactionStoreMock, *SettingsStoreMock) {
					accStore := newAccountStoreMock(map[AccountID]*Account{
						srcAccID: {ID: srcAccID, SpaceID: spaceID, Name: "Src", Currency: "USD", IsActive: true},
						dstAccID: {ID: dstAccID, SpaceID: spaceID, Name: "Dst", Currency: "USD", IsActive: true},
					})
					return accStore,
						newTransferStoreMock(nil),
						newTransactionStoreMock(nil),
						newSettingsStoreMock(map[SpaceID]*FinanceSettings{spaceID: {BaseCurrency: "USD"}})
				},
				wantErr: true,
			},
			{
				name: "valid transfer creates parent and both leg transactions",
				transfer: &Transfer{
					ID:                   trsfID,
					SpaceID:              spaceID,
					SourceAccountID:      srcAccID,
					DestinationAccountID: dstAccID,
					SourceAmount:         5000,
					DestinationAmount:    5000,
					TransferDate:         now,
				},
				setupStore: func() (*AccountStoreMock, *TransferStoreMock, *TransactionStoreMock, *SettingsStoreMock) {
					accStore := newAccountStoreMock(map[AccountID]*Account{
						srcAccID: {ID: srcAccID, SpaceID: spaceID, Name: "Src", Currency: "USD", CurrentBalance: 10000, IsActive: true},
						dstAccID: {ID: dstAccID, SpaceID: spaceID, Name: "Dst", Currency: "USD", CurrentBalance: 2000, IsActive: true},
					})
					return accStore,
						newTransferStoreMock(nil),
						newTransactionStoreMock(nil),
						newSettingsStoreMock(map[SpaceID]*FinanceSettings{spaceID: {BaseCurrency: "USD"}})
				},
				wantErr: false,
			},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				accStore, trsfStore, txnStore, settingsStore := tt.setupStore()
				svc := NewService(Dependencies{
					AccountStore:     accStore,
					TransferStore:    trsfStore,
					TransactionStore: txnStore,
					SettingsStore:    settingsStore,
				})
				created, outLeg, inLeg, err := svc.createTransfer(ctx, tt.transfer, CreateTransferOpts{})
				if (err != nil) != tt.wantErr {
					t.Errorf("createTransfer() error = %v, wantErr %v", err, tt.wantErr)
				}
				if !tt.wantErr {
					if created == nil || outLeg == nil || inLeg == nil {
						t.Fatal("expected non-nil transfer and transaction legs")
					}
					if outLeg.Type != TransactionTypeTransferOut || inLeg.Type != TransactionTypeTransferIn {
						t.Errorf("unexpected leg types: out=%s in=%s", outLeg.Type, inLeg.Type)
					}
				}
			})
		}
	})

	t.Run("DeleteTransfer", func(t *testing.T) {
		tests := []struct {
			name       string
			transferID TransferID
			setupStore func() (*TransferStoreMock, *TransactionStoreMock, *AccountStoreMock, map[TransferID]*Transfer, map[TransactionID]*Transaction)
			wantErr    bool
		}{
			{
				name:       "not found",
				transferID: trsfID,
				setupStore: func() (*TransferStoreMock, *TransactionStoreMock, *AccountStoreMock, map[TransferID]*Transfer, map[TransactionID]*Transaction) {
					trsfMap := make(map[TransferID]*Transfer)
					txnMap := make(map[TransactionID]*Transaction)
					return newTransferStoreMock(trsfMap),
						newTransactionStoreMock(txnMap),
						newAccountStoreMock(nil),
						trsfMap,
						txnMap
				},
				wantErr: true,
			},
			{
				name:       "successful deletion cascades to leg transactions",
				transferID: trsfID,
				setupStore: func() (*TransferStoreMock, *TransactionStoreMock, *AccountStoreMock, map[TransferID]*Transfer, map[TransactionID]*Transaction) {
					trsfMap := map[TransferID]*Transfer{
						trsfID: {
							ID:                   trsfID,
							SpaceID:              spaceID,
							SourceAccountID:      srcAccID,
							DestinationAccountID: dstAccID,
							SourceAmount:         5000,
							DestinationAmount:    5000,
							TransferDate:         now,
						},
					}
					trsfStore := newTransferStoreMock(trsfMap)
					tID1, _ := NewTransactionID()
					tID2, _ := NewTransactionID()
					txnMap := map[TransactionID]*Transaction{
						tID1: {
							ID:        tID1,
							SpaceID:   spaceID,
							Type:      TransactionTypeTransferOut,
							AccountID: &srcAccID,
							Amount:    5000,
							Metadata:  TransactionMetadata{TransferID: &trsfID},
						},
						tID2: {
							ID:        tID2,
							SpaceID:   spaceID,
							Type:      TransactionTypeTransferIn,
							AccountID: &dstAccID,
							Amount:    5000,
							Metadata:  TransactionMetadata{TransferID: &trsfID},
						},
					}
					txnStore := newTransactionStoreMock(txnMap)
					accStore := newAccountStoreMock(map[AccountID]*Account{
						srcAccID: {ID: srcAccID, SpaceID: spaceID, CurrentBalance: 5000, IsActive: true},
						dstAccID: {ID: dstAccID, SpaceID: spaceID, CurrentBalance: 7000, IsActive: true},
					})
					return trsfStore, txnStore, accStore, trsfMap, txnMap
				},
				wantErr: false,
			},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				trsfStore, txnStore, accStore, trsfMap, txnMap := tt.setupStore()
				svc := NewService(Dependencies{
					TransferStore:    trsfStore,
					TransactionStore: txnStore,
					AccountStore:     accStore,
				})
				err := svc.DeleteTransfer(ctx, spaceID, tt.transferID)
				if (err != nil) != tt.wantErr {
					t.Errorf("DeleteTransfer() error = %v, wantErr %v", err, tt.wantErr)
				}
				if !tt.wantErr {
					if _, ok := trsfMap[tt.transferID]; ok {
						t.Error("expected transfer record to be deleted")
					}
					if len(txnMap) != 0 {
						t.Errorf("expected 0 remaining transactions, got %d", len(txnMap))
					}
				}
			})
		}
	})
}

// --- Tests from service_txn_test.go ---

func TestService_Transactions(t *testing.T) {
	ctx := context.Background()
	validSpace := SpaceID("spc_2dE1V8ZqWz4eS2N9yX3bL1mK7pO")
	validAccID, _ := NewAccountID()
	now := time.Now().UTC()

	t.Run("CreateIncome", func(t *testing.T) {
		tests := []struct {
			name     string
			txn      *Transaction
			setupAcc bool
			setupSet bool
			wantErr  bool
		}{
			{
				name: "valid income transaction",
				txn: &Transaction{
					SpaceID:         validSpace,
					AccountID:       &validAccID,
					Amount:          10000,
					Currency:        "USD",
					TransactionDate: now,
					Description:     "Bonus",
				},
				setupAcc: true,
				setupSet: true,
				wantErr:  false,
			},
			{
				name: "missing settings fails creation",
				txn: &Transaction{
					SpaceID:         validSpace,
					AccountID:       &validAccID,
					Amount:          10000,
					Currency:        "USD",
					TransactionDate: now,
					Description:     "Bonus",
				},
				setupAcc: true,
				setupSet: false,
				wantErr:  true,
			},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				setData := make(map[SpaceID]*FinanceSettings)
				if tt.setupSet {
					setData[validSpace] = &FinanceSettings{SpaceID: validSpace, BaseCurrency: "USD"}
				}
				accData := make(map[AccountID]*Account)
				if tt.setupAcc {
					accData[validAccID] = &Account{
						ID:             validAccID,
						SpaceID:        validSpace,
						Currency:       "USD",
						IsActive:       true,
						CurrentBalance: 50000,
					}
				}
				setStore := newSettingsStoreMock(setData)
				accStore := newAccountStoreMock(accData)
				txnStore := newTransactionStoreMock(nil)
				eventStore := newTransactionEventStoreMock(nil)

				svc := NewService(Dependencies{
					SettingsStore:         setStore,
					AccountStore:          accStore,
					TransactionStore:      txnStore,
					TransactionEventStore: eventStore,
				})

				res, err := svc.CreateIncome(ctx, tt.txn)
				if (err != nil) != tt.wantErr {
					t.Errorf("CreateIncome() error = %v, wantErr %v", err, tt.wantErr)
				}
				if !tt.wantErr && res.ID == "" {
					t.Error("expected ID to be set")
				}
			})
		}
	})

	t.Run("GetTransaction", func(t *testing.T) {
		validTID, _ := NewTransactionID()
		missingTID, _ := NewTransactionID()

		tests := []struct {
			name    string
			spaceID SpaceID
			id      TransactionID
			exists  bool
			wantErr bool
		}{
			{
				name:    "valid retrieval",
				spaceID: validSpace,
				id:      validTID,
				exists:  true,
				wantErr: false,
			},
			{
				name:    "invalid space ID",
				spaceID: "invalid_space",
				id:      validTID,
				exists:  true,
				wantErr: true,
			},
			{
				name:    "invalid transaction ID",
				spaceID: validSpace,
				id:      "invalid_id",
				exists:  true,
				wantErr: true,
			},
			{
				name:    "not found",
				spaceID: validSpace,
				id:      missingTID,
				exists:  false,
				wantErr: true,
			},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				txnData := make(map[TransactionID]*Transaction)
				if tt.exists {
					txnData[validTID] = &Transaction{ID: validTID, SpaceID: validSpace, Amount: 1000}
				}
				txnStore := newTransactionStoreMock(txnData)
				svc := NewService(Dependencies{TransactionStore: txnStore})
				res, err := svc.GetTransaction(ctx, tt.spaceID, tt.id)
				if (err != nil) != tt.wantErr {
					t.Errorf("GetTransaction() error = %v, wantErr %v", err, tt.wantErr)
				}
				if !tt.wantErr && res.ID != tt.id {
					t.Errorf("res.ID = %v, want %v", res.ID, tt.id)
				}
			})
		}
	})

	t.Run("UpdateIncome", func(t *testing.T) {
		validTID, _ := NewTransactionID()
		existingTxn := &Transaction{
			ID:              validTID,
			SpaceID:         validSpace,
			AccountID:       &validAccID,
			Amount:          10000,
			AmountInBase:    10000,
			Currency:        "USD",
			Type:            TransactionTypeIncome,
			TransactionDate: now,
			Description:     "Old Bonus",
		}

		tests := []struct {
			name       string
			updateTxn  *Transaction
			setupExist bool
			wantErr    bool
		}{
			{
				name: "valid update with diff event",
				updateTxn: &Transaction{
					ID:              validTID,
					SpaceID:         validSpace,
					AccountID:       &validAccID,
					Amount:          15000,
					AmountInBase:    15000,
					Currency:        "USD",
					TransactionDate: now,
					Description:     "Updated Bonus",
				},
				setupExist: true,
				wantErr:    false,
			},
			{
				name: "transaction not found",
				updateTxn: &Transaction{
					ID:              validTID,
					SpaceID:         validSpace,
					AccountID:       &validAccID,
					Amount:          15000,
					Currency:        "USD",
					TransactionDate: now,
				},
				setupExist: false,
				wantErr:    true,
			},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				setStore := newSettingsStoreMock(map[SpaceID]*FinanceSettings{
					validSpace: {SpaceID: validSpace, BaseCurrency: "USD"},
				})
				accStore := newAccountStoreMock(map[AccountID]*Account{
					validAccID: {ID: validAccID, SpaceID: validSpace, Currency: "USD", IsActive: true, CurrentBalance: 50000},
				})
				txnData := make(map[TransactionID]*Transaction)
				if tt.setupExist {
					cp := *existingTxn
					txnData[validTID] = &cp
				}
				txnStore := newTransactionStoreMock(txnData)
				eventStore := newTransactionEventStoreMock(nil)

				svc := NewService(Dependencies{
					SettingsStore:         setStore,
					AccountStore:          accStore,
					TransactionStore:      txnStore,
					TransactionEventStore: eventStore,
				})

				res, err := svc.UpdateIncome(ctx, tt.updateTxn)
				if (err != nil) != tt.wantErr {
					t.Errorf("UpdateIncome() error = %v, wantErr %v", err, tt.wantErr)
				}
				if !tt.wantErr && res.Amount != 15000 {
					t.Errorf("res.Amount = %d, want 15000", res.Amount)
				}
			})
		}
	})

	t.Run("ListTransactions", func(t *testing.T) {
		tests := []struct {
			name    string
			spaceID SpaceID
			wantErr bool
		}{
			{
				name:    "valid list",
				spaceID: validSpace,
				wantErr: false,
			},
			{
				name:    "invalid space ID",
				spaceID: "invalid_space",
				wantErr: true,
			},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				txnStore := newTransactionStoreMock(nil)
				svc := NewService(Dependencies{TransactionStore: txnStore})
				_, err := svc.ListTransactions(ctx, tt.spaceID, &TransactionFilter{})
				if (err != nil) != tt.wantErr {
					t.Errorf("ListTransactions() error = %v, wantErr %v", err, tt.wantErr)
				}
			})
		}
	})

	t.Run("ListTransactionEvents", func(t *testing.T) {
		validTID, _ := NewTransactionID()

		tests := []struct {
			name    string
			spaceID SpaceID
			txnID   TransactionID
			wantErr bool
		}{
			{
				name:    "valid list",
				spaceID: validSpace,
				txnID:   validTID,
				wantErr: false,
			},
			{
				name:    "invalid space ID",
				spaceID: "invalid_space",
				txnID:   validTID,
				wantErr: true,
			},
			{
				name:    "invalid txn ID",
				spaceID: validSpace,
				txnID:   "invalid_tid",
				wantErr: true,
			},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				eventStore := newTransactionEventStoreMock(nil)
				svc := NewService(Dependencies{TransactionEventStore: eventStore})
				_, err := svc.ListTransactionEvents(ctx, tt.spaceID, tt.txnID)
				if (err != nil) != tt.wantErr {
					t.Errorf("ListTransactionEvents() error = %v, wantErr %v", err, tt.wantErr)
				}
			})
		}
	})

	t.Run("DeleteTransaction", func(t *testing.T) {
		validTID, _ := NewTransactionID()

		tests := []struct {
			name       string
			spaceID    SpaceID
			txnID      TransactionID
			setupStore func() (*TransactionStoreMock, *AccountStoreMock)
			wantErr    bool
		}{
			{
				name:    "invalid space ID",
				spaceID: "invalid_space",
				txnID:   validTID,
				setupStore: func() (*TransactionStoreMock, *AccountStoreMock) {
					return newTransactionStoreMock(nil),
						newAccountStoreMock(nil)
				},
				wantErr: true,
			},
			{
				name:    "transaction not found",
				spaceID: validSpace,
				txnID:   validTID,
				setupStore: func() (*TransactionStoreMock, *AccountStoreMock) {
					return newTransactionStoreMock(nil),
						newAccountStoreMock(nil)
				},
				wantErr: true,
			},
			{
				name:    "successful delete with balance rollback",
				spaceID: validSpace,
				txnID:   validTID,
				setupStore: func() (*TransactionStoreMock, *AccountStoreMock) {
					txnStore := newTransactionStoreMock(map[TransactionID]*Transaction{
						validTID: {
							ID:        validTID,
							SpaceID:   validSpace,
							Type:      TransactionTypeExpense,
							Amount:    2000,
							AccountID: &validAccID,
						},
					})
					accStore := newAccountStoreMock(map[AccountID]*Account{
						validAccID: {
							ID:             validAccID,
							SpaceID:        validSpace,
							Type:           AccountTypeBank,
							CurrentBalance: 8000,
							IsActive:       true,
						},
					})
					return txnStore, accStore
				},
				wantErr: false,
			},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				txnStore, accStore := tt.setupStore()
				svc := NewService(Dependencies{
					TransactionStore: txnStore,
					AccountStore:     accStore,
				})
				err := svc.DeleteTransaction(ctx, tt.spaceID, tt.txnID)
				if (err != nil) != tt.wantErr {
					t.Errorf("DeleteTransaction() error = %v, wantErr %v", err, tt.wantErr)
				}
			})
		}
	})

	t.Run("CreateExpense", func(t *testing.T) {
		validBID, _ := NewBudgetID()

		tests := []struct {
			name       string
			txn        *Transaction
			setupStore func() (*BudgetStoreMock, *PeriodStoreMock, *SettingsStoreMock, *TransactionStoreMock, *AccountStoreMock)
			wantErr    bool
		}{
			{
				name: "missing budget ID fails",
				txn: &Transaction{
					SpaceID:         validSpace,
					Amount:          5000,
					Currency:        "USD",
					TransactionDate: now,
				},
				setupStore: func() (*BudgetStoreMock, *PeriodStoreMock, *SettingsStoreMock, *TransactionStoreMock, *AccountStoreMock) {
					return newBudgetStoreMock(nil),
						newPeriodStoreMock(nil),
						newSettingsStoreMock(nil),
						newTransactionStoreMock(nil),
						newAccountStoreMock(nil)
				},
				wantErr: true,
			},
			{
				name: "valid expense creates transaction",
				txn: &Transaction{
					SpaceID:         validSpace,
					BudgetID:        &validBID,
					Amount:          5000,
					Currency:        "USD",
					TransactionDate: now,
					AccountID:       &validAccID,
					Description:     "Groceries",
				},
				setupStore: func() (*BudgetStoreMock, *PeriodStoreMock, *SettingsStoreMock, *TransactionStoreMock, *AccountStoreMock) {
					bStore := newBudgetStoreMock(map[BudgetID]*Budget{
						validBID: {
							ID:          validBID,
							SpaceID:     validSpace,
							Name:        "Food",
							Status:      BudgetStatusActive,
							LimitAmount: 50000,
							Currency:    "USD",
							Interval:    IntervalMonthly,
						},
					})
					pStore := newPeriodStoreMock(nil)
					setStore := newSettingsStoreMock(map[SpaceID]*FinanceSettings{
						validSpace: {BaseCurrency: "USD"},
					})
					txnStore := newTransactionStoreMock(nil)
					accStore := newAccountStoreMock(map[AccountID]*Account{
						validAccID: {
							ID:             validAccID,
							SpaceID:        validSpace,
							Type:           AccountTypeBank,
							CurrentBalance: 10000,
							IsActive:       true,
						},
					})
					return bStore, pStore, setStore, txnStore, accStore
				},
				wantErr: false,
			},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				bStore, pStore, setStore, txnStore, accStore := tt.setupStore()
				svc := NewService(Dependencies{
					BudgetStore:      bStore,
					PeriodStore:      pStore,
					SettingsStore:    setStore,
					TransactionStore: txnStore,
					AccountStore:     accStore,
				})
				res, err := svc.CreateExpense(ctx, tt.txn)
				if (err != nil) != tt.wantErr {
					t.Errorf("CreateExpense() error = %v, wantErr %v", err, tt.wantErr)
				}
				if !tt.wantErr && res == nil {
					t.Error("expected non-nil created expense")
				}
			})
		}
	})
}
