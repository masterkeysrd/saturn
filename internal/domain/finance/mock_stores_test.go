package finance

import (
	"context"
	"math"
	"slices"
	"strings"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/paging"
)

func newSettingsStoreMock(data map[SpaceID]*FinanceSettings) *SettingsStoreMock {
	if data == nil {
		data = make(map[SpaceID]*FinanceSettings)
	}
	return &SettingsStoreMock{
		CreateFunc: func(ctx context.Context, settings *FinanceSettings) error {
			data[settings.SpaceID] = settings
			return nil
		},
		GetByIDFunc: func(ctx context.Context, spaceID SpaceID) (*FinanceSettings, error) {
			s, ok := data[spaceID]
			if !ok {
				return nil, errors.E(errors.NotExist, SettingsNotFound, "finance settings not found")
			}
			return s, nil
		},
	}
}

func newBudgetStoreMock(data map[BudgetID]*Budget) *BudgetStoreMock {
	if data == nil {
		data = make(map[BudgetID]*Budget)
	}
	return &BudgetStoreMock{
		CreateFunc: func(ctx context.Context, b *Budget) error {
			if b.Status == "" {
				b.Status = BudgetStatusActive
			}
			data[b.ID] = b
			return nil
		},
		GetByIDFunc: func(ctx context.Context, spaceID SpaceID, id BudgetID) (*Budget, error) {
			b, ok := data[id]
			if !ok {
				return nil, errors.E(errors.NotExist, BudgetNotFound, "budget not found")
			}
			if b.Status == "" {
				b.Status = BudgetStatusActive
			}
			return b, nil
		},
		GetByIDsFunc: func(ctx context.Context, spaceID SpaceID, ids []BudgetID) ([]*Budget, error) {
			var list []*Budget
			for _, id := range ids {
				if b, ok := data[id]; ok {
					list = append(list, b)
				}
			}
			return list, nil
		},
		UpdateFunc: func(ctx context.Context, b *Budget) error {
			if _, ok := data[b.ID]; !ok {
				return errors.E(errors.NotExist, BudgetNotFound, "budget not found")
			}
			data[b.ID] = b
			return nil
		},
		DeleteFunc: func(ctx context.Context, spaceID SpaceID, id BudgetID, opts DeleteOptions) error {
			existing, ok := data[id]
			if !ok {
				return errors.E(errors.NotExist, BudgetNotFound, "budget not found")
			}
			if opts.Version > 0 && existing.Version != opts.Version {
				return errors.E(errors.Conflict, VersionMismatch, "budget version mismatch")
			}
			delete(data, id)
			return nil
		},
		ListBySpaceFunc: func(ctx context.Context, spaceID SpaceID, filter *ListBudgetsFilter) (*paging.Page[*Budget], error) {
			var list []*Budget
			for _, b := range data {
				if b.SpaceID == spaceID {
					list = append(list, b)
				}
			}
			return &paging.Page[*Budget]{
				Items: list,
			}, nil
		},
	}
}

func newPeriodStoreMock(data map[string]*BudgetPeriod) *PeriodStoreMock {
	if data == nil {
		data = make(map[string]*BudgetPeriod)
	}
	return &PeriodStoreMock{
		CreateFunc: func(ctx context.Context, p *BudgetPeriod) error {
			key := string(p.BudgetID) + "_" + p.StartDate.Format(time.RFC3339) + "_" + p.EndDate.Format(time.RFC3339)
			data[key] = p
			return nil
		},
		GetByRangeFunc: func(ctx context.Context, budgetID BudgetID, startDate, endDate time.Time) (*BudgetPeriod, error) {
			key := string(budgetID) + "_" + startDate.Format(time.RFC3339) + "_" + endDate.Format(time.RFC3339)
			p, ok := data[key]
			if !ok {
				return nil, errors.E(errors.NotExist, PeriodNotFound, "budget period not found")
			}
			return p, nil
		},
		GetByRangesFunc: func(ctx context.Context, keys []PeriodRangeKey) ([]*BudgetPeriod, error) {
			var list []*BudgetPeriod
			for _, key := range keys {
				k := string(key.BudgetID) + "_" + key.StartDate.Format(time.RFC3339) + "_" + key.EndDate.Format(time.RFC3339)
				if p, ok := data[k]; ok {
					list = append(list, p)
				}
			}
			return list, nil
		},
		UpdateLimitFunc: func(ctx context.Context, id PeriodID, limit int64) error {
			for _, p := range data {
				if p.ID == id {
					p.LimitAmount = limit
					return nil
				}
			}
			return errors.E(errors.NotExist, PeriodNotFound, "budget period not found")
		},
		ListByBudgetFunc: func(ctx context.Context, budgetID BudgetID) ([]*BudgetPeriod, error) {
			var list []*BudgetPeriod
			for _, p := range data {
				if p.BudgetID == budgetID {
					list = append(list, p)
				}
			}
			return list, nil
		},
	}
}

func newExchangeRateStoreMock(rates map[string]*ExchangeRate) *ExchangeRateStoreMock {
	if rates == nil {
		rates = make(map[string]*ExchangeRate)
	}
	return &ExchangeRateStoreMock{
		CreateFunc: func(ctx context.Context, r *ExchangeRate) error {
			key := string(r.SpaceID) + "_" + string(r.FromCurrency) + "_" + string(r.ToCurrency) + "_" + r.RateDate.Format("2006-01-02")
			rates[key] = r
			return nil
		},
		UpdateFunc: func(ctx context.Context, r *ExchangeRate) error {
			key := string(r.SpaceID) + "_" + string(r.FromCurrency) + "_" + string(r.ToCurrency) + "_" + r.RateDate.Format("2006-01-02")
			if _, ok := rates[key]; !ok {
				return errors.E(errors.NotExist, ExchangeRateNotFound, "exchange rate not found")
			}
			rates[key] = r
			return nil
		},
		GetExactRateFunc: func(ctx context.Context, query ExchangeRateKey) (*ExchangeRate, error) {
			key := string(query.SpaceID) + "_" + string(query.FromCurrency) + "_" + string(query.ToCurrency) + "_" + query.RateDate.Format("2006-01-02")
			r, ok := rates[key]
			if !ok {
				return nil, errors.E(errors.NotExist, ExchangeRateNotFound, "exchange rate not found")
			}
			return r, nil
		},
		GetRateFunc: func(ctx context.Context, query ExchangeRateKey) (*ExchangeRate, error) {
			var best *ExchangeRate
			for _, r := range rates {
				if r.SpaceID == query.SpaceID && r.FromCurrency == query.FromCurrency && r.ToCurrency == query.ToCurrency {
					if !r.RateDate.After(query.RateDate) {
						if best == nil || r.RateDate.After(best.RateDate) {
							best = r
						}
					}
				}
			}
			if best == nil {
				return nil, errors.E(errors.NotExist, ExchangeRateNotFound, "exchange rate not found")
			}
			return best, nil
		},
		GetNextRateFunc: func(ctx context.Context, query ExchangeRateKey) (*ExchangeRate, error) {
			var best *ExchangeRate
			for _, r := range rates {
				if r.SpaceID == query.SpaceID && r.FromCurrency == query.FromCurrency && r.ToCurrency == query.ToCurrency {
					if r.RateDate.After(query.RateDate) {
						if best == nil || r.RateDate.Before(best.RateDate) {
							best = r
						}
					}
				}
			}
			if best == nil {
				return nil, errors.E(errors.NotExist, ExchangeRateNotFound, "exchange rate not found")
			}
			return best, nil
		},
		ListBySpaceFunc: func(ctx context.Context, spaceID SpaceID, filter *ListExchangeRatesFilter) ([]*ExchangeRate, string, error) {
			var results []*ExchangeRate
			for _, r := range rates {
				if r.SpaceID == spaceID {
					results = append(results, r)
				}
			}
			return results, "", nil
		},
		DeleteFunc: func(ctx context.Context, query ExchangeRateKey) error {
			key := string(query.SpaceID) + "_" + string(query.FromCurrency) + "_" + string(query.ToCurrency) + "_" + query.RateDate.Format("2006-01-02")
			delete(rates, key)
			return nil
		},
		GetLatestRatesFunc: func(ctx context.Context, spaceID SpaceID, fromCurrencies []Currency, toCurrency Currency) ([]*ExchangeRate, error) {
			type currencyPair struct {
				from Currency
				to   Currency
			}
			latestRates := make(map[currencyPair]*ExchangeRate)
			for _, r := range rates {
				if r.SpaceID == spaceID && r.ToCurrency == toCurrency {
					if slices.Contains(fromCurrencies, r.FromCurrency) {
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
		},
	}
}

func newTransactionStoreMock(txns map[TransactionID]*Transaction) *TransactionStoreMock {
	if txns == nil {
		txns = make(map[TransactionID]*Transaction)
	}
	return &TransactionStoreMock{
		CreateFunc: func(ctx context.Context, t *Transaction) error {
			txns[t.ID] = t
			return nil
		},
		GetByIDFunc: func(ctx context.Context, spaceID SpaceID, id TransactionID) (*Transaction, error) {
			t, ok := txns[id]
			if !ok {
				return nil, errors.E(errors.NotExist, TransactionNotFound, "transaction not found")
			}
			return t, nil
		},
		HasTransactionsFunc: func(ctx context.Context, spaceID SpaceID, filter *TransactionFilter) (bool, error) {
			for _, t := range txns {
				if t.SpaceID != spaceID {
					continue
				}
				if filter != nil && filter.BudgetID != nil && (t.BudgetID == nil || *t.BudgetID != *filter.BudgetID) {
					continue
				}
				return true, nil
			}
			return false, nil
		},
		DeleteFunc: func(ctx context.Context, id TransactionID) error {
			if _, ok := txns[id]; !ok {
				return errors.E(errors.NotExist, TransactionNotFound, "transaction not found")
			}
			delete(txns, id)
			return nil
		},
		UpdateFunc: func(ctx context.Context, t *Transaction) error {
			if _, ok := txns[t.ID]; !ok {
				return errors.E(errors.NotExist, TransactionNotFound, "transaction not found")
			}
			txns[t.ID] = t
			return nil
		},
		ListBySpaceFunc: func(ctx context.Context, spaceID SpaceID, filter *TransactionFilter) (*paging.Page[*Transaction], error) {
			var list []*Transaction
			for _, t := range txns {
				if t.SpaceID == spaceID {
					if filter.BudgetID != nil && (t.BudgetID == nil || *t.BudgetID != *filter.BudgetID) {
						continue
					}
					if len(filter.Types) > 0 {
						match := false
						for _, ft := range filter.Types {
							if t.Type == ft {
								match = true
								break
							}
						}
						if !match {
							continue
						}
					}
					if filter.BorrowingID != nil && (t.Metadata.BorrowingID == nil || *t.Metadata.BorrowingID != *filter.BorrowingID) {
						continue
					}
					if filter.TransferID != nil && (t.Metadata.TransferID == nil || *t.Metadata.TransferID != *filter.TransferID) {
						continue
					}
					if len(filter.BorrowingRoles) > 0 {
						matchRole := false
						for _, r := range filter.BorrowingRoles {
							if t.Metadata.BorrowingRole == r {
								matchRole = true
								break
							}
						}
						if !matchRole {
							continue
						}
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
		},
		AggregateSpentFunc: func(ctx context.Context, periodID PeriodID, budgetCurrency Currency, exchangeRateToBase float64) (int64, int64, error) {
			var spentInBase int64
			var spentAmount int64
			for _, t := range txns {
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
		},
		AggregateSpentBatchFunc: func(ctx context.Context, periodIDs []PeriodID) ([]PeriodSpent, error) {
			results := make([]PeriodSpent, len(periodIDs))
			for i, periodID := range periodIDs {
				var spentInBase int64
				var spentAmount int64
				for _, t := range txns {
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
		},
	}
}

func newInsightsStoreMock(spentTrend []*SpentTrend, budgetDistribution []*BudgetDistribution, topExpenses []*TopExpense, incomeTrend []*IncomeTrend, incomeSources []*IncomeSourceRow, topIncomes []*TopIncome, err error) *InsightsStoreMock {
	return &InsightsStoreMock{
		GetSpentTrendFunc: func(ctx context.Context, filter *SpentTrendFilter) ([]*SpentTrend, error) {
			return spentTrend, err
		},
		GetBudgetDistributionFunc: func(ctx context.Context, filter *BudgetDistributionFilter) ([]*BudgetDistribution, error) {
			return budgetDistribution, err
		},
		GetTopExpensesFunc: func(ctx context.Context, filter *TopExpensesFilter) ([]*TopExpense, error) {
			return topExpenses, err
		},
		GetIncomeTrendFunc: func(ctx context.Context, filter *IncomeTrendFilter) ([]*IncomeTrend, error) {
			return incomeTrend, err
		},
		GetIncomeSourcesFunc: func(ctx context.Context, filter *IncomeSourcesFilter) ([]*IncomeSourceRow, error) {
			return incomeSources, err
		},
		GetTopIncomesFunc: func(ctx context.Context, filter *TopIncomesFilter) ([]*TopIncome, error) {
			return topIncomes, err
		},
	}
}

func newRecurringTransactionStoreMock(data map[RecurringTransactionID]*RecurringTransaction) *RecurringTransactionStoreMock {
	if data == nil {
		data = make(map[RecurringTransactionID]*RecurringTransaction)
	}
	return &RecurringTransactionStoreMock{
		CreateFunc: func(ctx context.Context, transaction *RecurringTransaction) error {
			data[transaction.ID] = transaction
			return nil
		},
		GetByIDFunc: func(ctx context.Context, spaceID SpaceID, id RecurringTransactionID) (*RecurringTransaction, error) {
			r, ok := data[id]
			if !ok || r.SpaceID != spaceID {
				return nil, errors.E(errors.NotExist, "recurring transaction not found")
			}
			return r, nil
		},
		GetByIDsFunc: func(ctx context.Context, spaceID SpaceID, ids []RecurringTransactionID) ([]*RecurringTransaction, error) {
			var list []*RecurringTransaction
			for _, id := range ids {
				if r, ok := data[id]; ok && r.SpaceID == spaceID {
					list = append(list, r)
				}
			}
			return list, nil
		},
		UpdateFunc: func(ctx context.Context, transaction *RecurringTransaction) error {
			if _, ok := data[transaction.ID]; !ok {
				return errors.E(errors.NotExist, "recurring transaction not found")
			}
			data[transaction.ID] = transaction
			return nil
		},
		DeleteFunc: func(ctx context.Context, id RecurringTransactionID, opts DeleteOptions) error {
			existing, ok := data[id]
			if !ok {
				return errors.E(errors.NotExist, "recurring transaction not found")
			}
			if opts.Version > 0 && existing.Version != opts.Version {
				return errors.E(errors.Conflict, VersionMismatch, "recurring transaction version mismatch")
			}
			delete(data, id)
			return nil
		},
		ListBySpaceFunc: func(ctx context.Context, spaceID SpaceID, filter *ListRecurringTransactionsFilter) (*paging.Page[*RecurringTransaction], error) {
			var list []*RecurringTransaction
			for _, r := range data {
				if r.SpaceID == spaceID {
					list = append(list, r)
				}
			}
			return &paging.Page[*RecurringTransaction]{Items: list}, nil
		},
		ListPendingGenerationFunc: func(ctx context.Context, maxDueDate time.Time) ([]*RecurringTransaction, error) {
			var list []*RecurringTransaction
			for _, r := range data {
				if r.Status == RecurringTransactionActive && !r.NextDueDate.After(maxDueDate) {
					list = append(list, r)
				}
			}
			return list, nil
		},
	}
}

func newAccountStoreMock(data map[AccountID]*Account) *AccountStoreMock {
	if data == nil {
		data = make(map[AccountID]*Account)
	}
	return &AccountStoreMock{
		CreateFunc: func(ctx context.Context, a *Account) error {
			if a.Version == 0 {
				a.Version = 1
			}
			data[a.ID] = a
			return nil
		},
		GetByIDFunc: func(ctx context.Context, spaceID SpaceID, id AccountID) (*Account, error) {
			a, ok := data[id]
			if !ok || a.SpaceID != spaceID {
				return nil, errors.E(errors.NotExist, AccountNotFound, "account not found")
			}
			return a, nil
		},
		UpdateFunc: func(ctx context.Context, a *Account) error {
			existing, ok := data[a.ID]
			if !ok || existing.SpaceID != a.SpaceID {
				return errors.E(errors.NotExist, AccountNotFound, "account not found")
			}
			a.Version++
			data[a.ID] = a
			return nil
		},
		DeleteFunc: func(ctx context.Context, spaceID SpaceID, id AccountID, opts DeleteOptions) error {
			existing, ok := data[id]
			if !ok || existing.SpaceID != spaceID {
				return errors.E(errors.NotExist, AccountNotFound, "account not found")
			}
			if opts.Version > 0 && existing.Version != opts.Version {
				return errors.E(errors.Conflict, VersionMismatch, "account version mismatch")
			}
			delete(data, id)
			return nil
		},
		ListBySpaceFunc: func(ctx context.Context, spaceID SpaceID, filter *ListAccountsFilter) (*paging.Page[*Account], error) {
			var list []*Account
			for _, a := range data {
				if a.SpaceID == spaceID {
					if filter != nil && filter.ActiveOnly != nil && *filter.ActiveOnly && !a.IsActive {
						continue
					}
					if filter != nil && filter.LastFour != nil && *filter.LastFour != "" && a.LastFour != *filter.LastFour {
						continue
					}
					list = append(list, a)
				}
			}
			return &paging.Page[*Account]{Items: list}, nil
		},
		HasDefaultFunc: func(ctx context.Context, spaceID SpaceID) (bool, error) {
			for _, a := range data {
				if a.SpaceID == spaceID && a.IsDefault {
					return true, nil
				}
			}
			return false, nil
		},
		GetByIDsFunc: func(ctx context.Context, spaceID SpaceID, ids []AccountID) ([]*Account, error) {
			var list []*Account
			for _, id := range ids {
				if a, ok := data[id]; ok && a.SpaceID == spaceID {
					list = append(list, a)
				}
			}
			return list, nil
		},
		UnsetDefaultsExceptFunc: func(ctx context.Context, spaceID SpaceID, id AccountID) error {
			for _, a := range data {
				if a.SpaceID == spaceID && a.ID != id {
					a.IsDefault = false
				}
			}
			return nil
		},
		HasAnyFunc: func(ctx context.Context, spaceID SpaceID) (bool, error) {
			for _, a := range data {
				if a.SpaceID == spaceID {
					return true, nil
				}
			}
			return false, nil
		},
	}
}

func newInstitutionStoreMock(data map[InstitutionID]*Institution) *InstitutionStoreMock {
	if data == nil {
		data = make(map[InstitutionID]*Institution)
	}
	return &InstitutionStoreMock{
		CreateFunc: func(ctx context.Context, inst *Institution) error {
			if inst.Version == 0 {
				inst.Version = 1
			}
			data[inst.ID] = inst
			return nil
		},
		GetByIDFunc: func(ctx context.Context, spaceID SpaceID, id InstitutionID) (*Institution, error) {
			inst, ok := data[id]
			if !ok || inst.SpaceID != spaceID {
				return nil, errors.New("institution not found")
			}
			return inst, nil
		},
		GetByNameFunc: func(ctx context.Context, spaceID SpaceID, name string) (*Institution, error) {
			for _, inst := range data {
				if inst.SpaceID == spaceID && strings.EqualFold(inst.Name, name) {
					return inst, nil
				}
			}
			return nil, errors.New("institution not found")
		},
		GetByIDsFunc: func(ctx context.Context, spaceID SpaceID, ids []InstitutionID) ([]*Institution, error) {
			var list []*Institution
			for _, id := range ids {
				if inst, ok := data[id]; ok && inst.SpaceID == spaceID {
					list = append(list, inst)
				}
			}
			return list, nil
		},
		UpdateFunc: func(ctx context.Context, inst *Institution) error {
			existing, ok := data[inst.ID]
			if !ok || existing.SpaceID != inst.SpaceID {
				return errors.New("institution not found")
			}
			inst.Version++
			data[inst.ID] = inst
			return nil
		},
		DeleteFunc: func(ctx context.Context, spaceID SpaceID, id InstitutionID, opts DeleteOptions) error {
			existing, ok := data[id]
			if !ok || existing.SpaceID != spaceID {
				return errors.New("institution not found")
			}
			if opts.Version > 0 && existing.Version != opts.Version {
				return errors.E(errors.Conflict, VersionMismatch, "institution version mismatch")
			}
			delete(data, id)
			return nil
		},
		ListBySpaceFunc: func(ctx context.Context, spaceID SpaceID, filter *ListInstitutionsFilter) (*paging.Page[*Institution], error) {
			var list []*Institution
			for _, inst := range data {
				if inst.SpaceID == spaceID {
					if filter != nil && filter.SearchQuery != nil && *filter.SearchQuery != "" {
						if !strings.Contains(strings.ToLower(inst.Name), strings.ToLower(*filter.SearchQuery)) {
							continue
						}
					}
					list = append(list, inst)
				}
			}
			return &paging.Page[*Institution]{Items: list}, nil
		},
	}
}

func newTransferStoreMock(data map[TransferID]*Transfer) *TransferStoreMock {
	if data == nil {
		data = make(map[TransferID]*Transfer)
	}
	return &TransferStoreMock{
		CreateFunc: func(ctx context.Context, t *Transfer) error {
			data[t.ID] = t
			return nil
		},
		GetByIDFunc: func(ctx context.Context, spaceID SpaceID, id TransferID) (*Transfer, error) {
			t, ok := data[id]
			if !ok {
				return nil, errors.E(errors.NotExist, TransferNotFound, "transfer not found")
			}
			return t, nil
		},
		DeleteFunc: func(ctx context.Context, id TransferID) error {
			if _, ok := data[id]; !ok {
				return errors.E(errors.NotExist, TransferNotFound, "transfer not found")
			}
			delete(data, id)
			return nil
		},
		ListBySpaceFunc: func(ctx context.Context, spaceID SpaceID, limit int32, pageToken string) ([]*Transfer, string, error) {
			var list []*Transfer
			for _, t := range data {
				if t.SpaceID == spaceID {
					list = append(list, t)
				}
			}
			return list, "", nil
		},
	}
}

func newTransactionEventStoreMock(events map[TransactionEventID]*TransactionEvent) *TransactionEventStoreMock {
	if events == nil {
		events = make(map[TransactionEventID]*TransactionEvent)
	}
	return &TransactionEventStoreMock{
		CreateFunc: func(ctx context.Context, e *TransactionEvent) error {
			events[e.ID] = e
			return nil
		},
		ListByTransactionFunc: func(ctx context.Context, spaceID SpaceID, txnID TransactionID) ([]*TransactionEvent, error) {
			var list []*TransactionEvent
			for _, e := range events {
				if e.SpaceID == spaceID && e.TransactionID == txnID {
					list = append(list, e)
				}
			}
			return list, nil
		},
	}
}

func newBorrowingStoreMock(data map[BorrowingID]*Borrowing) *BorrowingStoreMock {
	if data == nil {
		data = make(map[BorrowingID]*Borrowing)
	}
	return &BorrowingStoreMock{
		CreateFunc: func(ctx context.Context, b *Borrowing) error {
			data[b.ID] = b
			return nil
		},
		GetByIDFunc: func(ctx context.Context, spaceID SpaceID, id BorrowingID) (*Borrowing, error) {
			b, ok := data[id]
			if !ok {
				return nil, errors.E(errors.NotExist, BorrowingNotFound, "borrowing not found")
			}
			return b, nil
		},
		UpdateFunc: func(ctx context.Context, b *Borrowing) error {
			data[b.ID] = b
			return nil
		},
		DeleteFunc: func(ctx context.Context, id BorrowingID) error {
			delete(data, id)
			return nil
		},
		ListBySpaceFunc: func(ctx context.Context, spaceID SpaceID, filter *ListBorrowingsFilter) ([]*Borrowing, string, error) {
			var list []*Borrowing
			for _, b := range data {
				if b.SpaceID == spaceID {
					list = append(list, b)
				}
			}
			return list, "", nil
		},
	}
}

func newScheduledTransactionStoreMock(payments map[ScheduledTransactionID]*ScheduledTransaction) *ScheduledTransactionStoreMock {
	if payments == nil {
		payments = make(map[ScheduledTransactionID]*ScheduledTransaction)
	}
	return &ScheduledTransactionStoreMock{
		CreateFunc: func(ctx context.Context, payment *ScheduledTransaction) error {
			payments[payment.ID] = payment
			return nil
		},
		GetByIDFunc: func(ctx context.Context, spaceID SpaceID, id ScheduledTransactionID) (*ScheduledTransaction, error) {
			p, ok := payments[id]
			if !ok || p.SpaceID != spaceID {
				return nil, errors.E(errors.NotExist, ScheduledTransactionNotFound, "scheduled transaction not found")
			}
			return p, nil
		},
		UpdateFunc: func(ctx context.Context, payment *ScheduledTransaction) error {
			if _, ok := payments[payment.ID]; !ok {
				return errors.E(errors.NotExist, ScheduledTransactionNotFound, "scheduled transaction not found")
			}
			payments[payment.ID] = payment
			return nil
		},
		UpdateStatusFunc: func(ctx context.Context, id ScheduledTransactionID, status ScheduledTransactionStatus) error {
			p, ok := payments[id]
			if !ok {
				return errors.E(errors.NotExist, ScheduledTransactionNotFound, "scheduled transaction not found")
			}
			p.Status = status
			return nil
		},
		DeleteFunc: func(ctx context.Context, id ScheduledTransactionID) error {
			delete(payments, id)
			return nil
		},
		ListBySpaceFunc: func(ctx context.Context, spaceID SpaceID, filter *ListScheduledTransactionsFilter) (*paging.Page[*ScheduledTransaction], error) {
			var list []*ScheduledTransaction
			for _, p := range payments {
				if p.SpaceID == spaceID {
					list = append(list, p)
				}
			}
			return &paging.Page[*ScheduledTransaction]{Items: list}, nil
		},
		HasScheduledTransactionsFunc: func(ctx context.Context, spaceID SpaceID, filter *ListScheduledTransactionsFilter) (bool, error) {
			for _, p := range payments {
				if p.SpaceID == spaceID {
					if filter != nil && filter.BudgetID != nil && (p.BudgetID == nil || *p.BudgetID != *filter.BudgetID) {
						continue
					}
					return true, nil
				}
			}
			return false, nil
		},
	}
}

func newStatementStoreMock(statements map[StatementID]*Statement, lines map[StatementID][]*StatementLine) *StatementStoreMock {
	if statements == nil {
		statements = make(map[StatementID]*Statement)
	}
	if lines == nil {
		lines = make(map[StatementID][]*StatementLine)
	}
	return &StatementStoreMock{
		CreateFunc: func(ctx context.Context, statement *Statement, stmtLines []*StatementLine) error {
			if statement.Version == 0 {
				statement.Version = 1
			}
			for _, l := range stmtLines {
				if l.Version == 0 {
					l.Version = 1
				}
			}
			statements[statement.ID] = statement
			lines[statement.ID] = stmtLines
			return nil
		},
		GetByIDFunc: func(ctx context.Context, spaceID SpaceID, id StatementID) (*Statement, error) {
			stmt, ok := statements[id]
			if !ok || stmt.SpaceID != spaceID {
				return nil, errors.E(errors.NotExist, StatementNotFound, "statement not found")
			}
			cp := *stmt
			return &cp, nil
		},
		ListFunc: func(ctx context.Context, spaceID SpaceID, filter *ListStatementsFilter) (*paging.Page[*Statement], error) {
			var matched []*Statement
			for _, stmt := range statements {
				if stmt.SpaceID != spaceID {
					continue
				}
				if filter.AccountID != nil && stmt.AccountID != *filter.AccountID {
					continue
				}
				if filter.Status != nil && stmt.Status != *filter.Status {
					continue
				}
				matched = append(matched, stmt)
			}
			return &paging.Page[*Statement]{Items: matched}, nil
		},
		DeleteFunc: func(ctx context.Context, spaceID SpaceID, id StatementID, opts DeleteOptions) error {
			stmt, ok := statements[id]
			if !ok || stmt.SpaceID != spaceID {
				return errors.E(errors.NotExist, StatementNotFound, "statement not found")
			}
			if opts.Version > 0 && stmt.Version != opts.Version {
				return errors.E(errors.Conflict, VersionMismatch, "statement version mismatch")
			}
			delete(statements, id)
			delete(lines, id)
			return nil
		},
		UpdateFunc: func(ctx context.Context, statement *Statement) error {
			existing, ok := statements[statement.ID]
			if !ok {
				return errors.E(errors.NotExist, StatementNotFound, "statement not found")
			}
			if statement.Version > 0 && existing.Version != statement.Version {
				return errors.E(errors.Conflict, VersionMismatch, "statement version mismatch")
			}
			existing.StatementStartingBalance = statement.StatementStartingBalance
			existing.StatementEndingBalance = statement.StatementEndingBalance
			existing.StatementDate = statement.StatementDate
			existing.Status = statement.Status
			existing.UpdateTime = statement.UpdateTime
			existing.Version++
			statement.Version = existing.Version
			return nil
		},
		ListLinesFunc: func(ctx context.Context, statementID StatementID) ([]*StatementLine, error) {
			stmtLines, ok := lines[statementID]
			if !ok {
				return nil, errors.E(errors.NotExist, StatementLineNotFound, "statement line not found")
			}
			return stmtLines, nil
		},
		GetLineByIDFunc: func(ctx context.Context, id StatementLineID) (*StatementLine, error) {
			for _, stmtLines := range lines {
				for _, l := range stmtLines {
					if l.ID == id {
						cp := *l
						return &cp, nil
					}
				}
			}
			return nil, errors.E(errors.NotExist, StatementLineNotFound, "statement line not found")
		},
		UpdateLineDraftFunc: func(ctx context.Context, line *StatementLine) error {
			var existing *StatementLine
			for _, stmtLines := range lines {
				for _, l := range stmtLines {
					if l.ID == line.ID {
						existing = l
						break
					}
				}
			}
			if existing == nil {
				return errors.E(errors.NotExist, StatementLineNotFound, "statement line not found")
			}
			if line.Version > 0 && existing.Version != line.Version {
				return errors.E(errors.Conflict, VersionMismatch, "statement line version mismatch")
			}
			existing.Status = line.Status
			existing.Action = line.Action
			existing.MatchedTransactionID = line.MatchedTransactionID
			existing.Version++
			line.Version = existing.Version
			return nil
		},
		UpdateStatementWithLinesFunc: func(ctx context.Context, stmt *Statement, stmtLines []*StatementLine) error {
			existing, ok := statements[stmt.ID]
			if !ok {
				return errors.E(errors.NotExist, StatementNotFound, "statement not found")
			}
			existing.StatementStartingBalance = stmt.StatementStartingBalance
			existing.StatementEndingBalance = stmt.StatementEndingBalance
			existing.Version++
			stmt.Version = existing.Version

			for _, l := range stmtLines {
				for _, exLine := range lines[stmt.ID] {
					if exLine.ID == l.ID {
						exLine.Amount = l.Amount
						exLine.Action = l.Action
						exLine.Version++
						l.Version = exLine.Version
						break
					}
				}
			}
			return nil
		},
	}
}

func newInboxItemStoreMock(items map[string]*InboxItem) *InboxItemStoreMock {
	if items == nil {
		items = make(map[string]*InboxItem)
	}
	return &InboxItemStoreMock{
		InsertFunc: func(ctx context.Context, item *InboxItem) error {
			items[item.ID] = item
			return nil
		},
		GetFunc: func(ctx context.Context, spaceID SpaceID, id string) (*InboxItem, error) {
			item, ok := items[id]
			if !ok || item.SpaceID != string(spaceID) {
				return nil, errors.New("inbox item not found")
			}
			return item, nil
		},
		ListBySpaceFunc: func(ctx context.Context, spaceID SpaceID, filter *ListInboxItemsFilter) (*paging.Page[*InboxItem], error) {
			var list []*InboxItem
			for _, item := range items {
				if item.SpaceID == string(spaceID) {
					list = append(list, item)
				}
			}
			return &paging.Page[*InboxItem]{Items: list}, nil
		},
		UpdateFunc: func(ctx context.Context, item *InboxItem) error {
			items[item.ID] = item
			return nil
		},
		DeleteFunc: func(ctx context.Context, spaceID SpaceID, id string) error {
			delete(items, id)
			return nil
		},
	}
}
