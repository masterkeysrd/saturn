package storage

import (
	"context"
	"fmt"
	"time"

	"github.com/jmoiron/sqlx"
	"github.com/masterkeysrd/saturn/internal/domain/finance"
)

type InsightsStore struct {
	db *sqlx.DB
}

func NewInsightsStore(db *sqlx.DB) *InsightsStore {
	return &InsightsStore{db: db}
}

type spentTrendRow struct {
	IntervalStart  time.Time `db:"interval_start"`
	BudgetID       string    `db:"budget_id"`
	BudgetName     string    `db:"budget_name"`
	BudgetColor    string    `db:"budget_color"`
	BudgetCurrency string    `db:"budget_currency"`
	TxnCount       int32     `db:"txn_count"`
	SpentInBase    int64     `db:"spent_in_base"`
	SpentInLocal   int64     `db:"spent_in_local"`
}

func (s *InsightsStore) GetSpentTrend(ctx context.Context, filter *finance.SpentTrendFilter) ([]*finance.SpentTrend, error) {
	var trunc string
	switch filter.Granularity {
	case finance.GranularityDaily:
		trunc = "day"
	case finance.GranularityWeekly:
		trunc = "week"
	case finance.GranularityMonthly:
		trunc = "month"
	case finance.GranularityYearly:
		trunc = "year"
	default:
		trunc = "month"
	}

	query := fmt.Sprintf(`SELECT 
		date_trunc('%s', t.effective_date) as interval_start,
		COALESCE(t.budget_id, '') as budget_id,
		COALESCE(b.name, '') as budget_name,
		COALESCE(b.color, '') as budget_color,
		COALESCE(b.currency, '') as budget_currency,
		COUNT(t.id) as txn_count,
		SUM(t.amount_in_base) as spent_in_base,
		SUM(t.amount) as spent_in_local
	FROM finance.transaction t
	LEFT JOIN finance.budget b ON t.budget_id = b.id
	WHERE t.space_id = $1 AND t.type = 'EXPENSE' AND t.effective_date >= $2 AND t.effective_date <= $3
	GROUP BY interval_start, t.budget_id, b.name, b.color, b.currency
	ORDER BY interval_start ASC`, trunc)

	startDateStr := filter.StartDate.UTC().Format("2006-01-02")
	endDateStr := filter.EndDate.UTC().Format("2006-01-02")

	var rows []*spentTrendRow
	if err := s.db.SelectContext(ctx, &rows, query, string(filter.SpaceID), startDateStr, endDateStr); err != nil {
		return nil, err
	}

	results := make([]*finance.SpentTrend, len(rows))
	for i, r := range rows {
		results[i] = &finance.SpentTrend{
			IntervalStart:  r.IntervalStart,
			BudgetID:       r.BudgetID,
			BudgetName:     r.BudgetName,
			BudgetColor:    r.BudgetColor,
			BudgetCurrency: r.BudgetCurrency,
			TxnCount:       r.TxnCount,
			SpentInBase:    r.SpentInBase,
			SpentInLocal:   r.SpentInLocal,
		}
	}
	return results, nil
}

type budgetDistributionRow struct {
	BudgetID             string  `db:"budget_id"`
	BudgetName           string  `db:"budget_name"`
	BudgetColor          string  `db:"budget_color"`
	BudgetIcon           string  `db:"budget_icon"`
	BudgetLimit          int64   `db:"budget_limit"`
	BudgetCurrency       string  `db:"budget_currency"`
	SpentInBase          int64   `db:"spent_in_base"`
	SpentInLocalMatching int64   `db:"spent_in_local_matching"`
	ExchangeRateToBase   float64 `db:"exchange_rate_to_base"`
}

func (s *InsightsStore) GetBudgetDistribution(ctx context.Context, filter *finance.BudgetDistributionFilter) ([]*finance.BudgetDistribution, error) {
	query := `SELECT 
		b.id as budget_id,
		b.name as budget_name,
		b.color as budget_color,
		b.icon as budget_icon,
		b.limit_amount as budget_limit,
		b.currency as budget_currency,
		t.spent_in_base,
		t.spent_in_local_matching,
		COALESCE(bp.exchange_rate_to_base, 1.0) as exchange_rate_to_base
	FROM finance.budget b
	LEFT JOIN LATERAL (
		SELECT 
			COALESCE(SUM(amount_in_base), 0) as spent_in_base,
			COALESCE(SUM(CASE WHEN currency = b.currency THEN amount ELSE 0 END), 0) as spent_in_local_matching
		FROM finance.transaction
		WHERE budget_id = b.id AND type = 'EXPENSE' AND effective_date >= $2 AND effective_date <= $3
	) t ON TRUE
	LEFT JOIN LATERAL (
		SELECT exchange_rate_to_base 
		FROM finance.budget_period bp 
		WHERE bp.budget_id = b.id AND bp.start_date <= $3 AND bp.end_date >= $2
		ORDER BY bp.start_date DESC LIMIT 1
	) bp ON TRUE
	WHERE b.space_id = $1`

	startDateStr := filter.StartDate.UTC().Format("2006-01-02")
	endDateStr := filter.EndDate.UTC().Format("2006-01-02")

	var rows []*budgetDistributionRow
	if err := s.db.SelectContext(ctx, &rows, query, string(filter.SpaceID), startDateStr, endDateStr); err != nil {
		return nil, err
	}

	results := make([]*finance.BudgetDistribution, len(rows))
	for i, r := range rows {
		results[i] = &finance.BudgetDistribution{
			BudgetID:             r.BudgetID,
			BudgetName:           r.BudgetName,
			BudgetColor:          r.BudgetColor,
			BudgetIcon:           r.BudgetIcon,
			BudgetLimit:          r.BudgetLimit,
			BudgetCurrency:       r.BudgetCurrency,
			SpentInBase:          r.SpentInBase,
			SpentInLocalMatching: r.SpentInLocalMatching,
			ExchangeRateToBase:   r.ExchangeRateToBase,
		}
	}
	return results, nil
}

type topExpenseRow struct {
	TransactionID   string    `db:"transaction_id"`
	Description     string    `db:"description"`
	Amount          int64     `db:"amount"`
	Currency        string    `db:"currency"`
	AmountInBase    int64     `db:"amount_in_base"`
	BudgetName      string    `db:"budget_name"`
	TransactionDate time.Time `db:"transaction_date"`
	EffectiveDate   time.Time `db:"effective_date"`
}

func (s *InsightsStore) GetTopExpenses(ctx context.Context, filter *finance.TopExpensesFilter) ([]*finance.TopExpense, error) {
	query := `SELECT 
		t.id as transaction_id,
		t.description,
		t.amount,
		t.currency,
		t.amount_in_base,
		COALESCE(b.name, '') as budget_name,
		t.transaction_date,
		t.effective_date
	FROM finance.transaction t
	LEFT JOIN finance.budget b ON t.budget_id = b.id
	WHERE t.space_id = $1 AND t.type = 'EXPENSE' AND t.effective_date >= $2 AND t.effective_date <= $3
	ORDER BY t.amount_in_base DESC
	LIMIT $4`

	startDateStr := filter.StartDate.UTC().Format("2006-01-02")
	endDateStr := filter.EndDate.UTC().Format("2006-01-02")

	var rows []*topExpenseRow
	if err := s.db.SelectContext(ctx, &rows, query, string(filter.SpaceID), startDateStr, endDateStr, filter.Limit); err != nil {
		return nil, err
	}

	results := make([]*finance.TopExpense, len(rows))
	for i, r := range rows {
		results[i] = &finance.TopExpense{
			TransactionID:   r.TransactionID,
			Description:     r.Description,
			Amount:          r.Amount,
			Currency:        r.Currency,
			AmountInBase:    r.AmountInBase,
			BudgetName:      r.BudgetName,
			TransactionDate: r.TransactionDate,
			EffectiveDate:   r.EffectiveDate,
		}
	}
	return results, nil
}

type incomeTrendRow struct {
	IntervalStart   time.Time `db:"interval_start"`
	AccountID       string    `db:"account_id"`
	AccountName     string    `db:"account_name"`
	AccountCurrency string    `db:"account_currency"`
	TxnCount        int32     `db:"txn_count"`
	IncomeInBase    int64     `db:"income_in_base"`
	IncomeInLocal   int64     `db:"income_in_local"`
}

func (s *InsightsStore) GetIncomeTrend(ctx context.Context, filter *finance.IncomeTrendFilter) ([]*finance.IncomeTrend, error) {
	var trunc string
	switch filter.Granularity {
	case finance.GranularityDaily:
		trunc = "day"
	case finance.GranularityWeekly:
		trunc = "week"
	case finance.GranularityMonthly:
		trunc = "month"
	case finance.GranularityYearly:
		trunc = "year"
	default:
		trunc = "month"
	}

	query := fmt.Sprintf(`SELECT 
		date_trunc('%s', t.effective_date) as interval_start,
		COALESCE(t.account_id, '') as account_id,
		COALESCE(a.name, '') as account_name,
		COALESCE(a.currency, '') as account_currency,
		COUNT(t.id) as txn_count,
		SUM(t.amount_in_base) as income_in_base,
		SUM(t.amount) as income_in_local
	FROM finance.transaction t
	LEFT JOIN finance.account a ON t.account_id = a.id
	WHERE t.space_id = $1 AND t.type = 'INCOME' AND t.effective_date >= $2 AND t.effective_date <= $3
	GROUP BY interval_start, t.account_id, a.name, a.currency
	ORDER BY interval_start ASC`, trunc)

	startDateStr := filter.StartDate.UTC().Format("2006-01-02")
	endDateStr := filter.EndDate.UTC().Format("2006-01-02")

	var rows []*incomeTrendRow
	if err := s.db.SelectContext(ctx, &rows, query, string(filter.SpaceID), startDateStr, endDateStr); err != nil {
		return nil, err
	}

	results := make([]*finance.IncomeTrend, len(rows))
	for i, r := range rows {
		results[i] = &finance.IncomeTrend{
			IntervalStart: r.IntervalStart,
			AccountID:     r.AccountID,
			AccountName:   r.AccountName,
			Currency:      r.AccountCurrency,
			TxnCount:      r.TxnCount,
			IncomeInBase:  r.IncomeInBase,
			IncomeInLocal: r.IncomeInLocal,
		}
	}
	return results, nil
}

type incomeSourceRow struct {
	SourceName   string `db:"source_name"`
	AmountInBase int64  `db:"amount_in_base"`
}

func (s *InsightsStore) GetIncomeSources(ctx context.Context, filter *finance.IncomeSourcesFilter) ([]*finance.IncomeSourceRow, error) {
	query := `SELECT 
		COALESCE(t.description, 'Other Inflow') as source_name,
		SUM(t.amount_in_base) as amount_in_base
	FROM finance.transaction t
	WHERE t.space_id = $1 AND t.type = 'INCOME' AND t.effective_date >= $2 AND t.effective_date <= $3
	GROUP BY source_name
	ORDER BY amount_in_base DESC`

	startDateStr := filter.StartDate.UTC().Format("2006-01-02")
	endDateStr := filter.EndDate.UTC().Format("2006-01-02")

	var rows []*incomeSourceRow
	if err := s.db.SelectContext(ctx, &rows, query, string(filter.SpaceID), startDateStr, endDateStr); err != nil {
		return nil, err
	}

	results := make([]*finance.IncomeSourceRow, len(rows))
	for i, r := range rows {
		results[i] = &finance.IncomeSourceRow{
			SourceName:   r.SourceName,
			AmountInBase: r.AmountInBase,
		}
	}
	return results, nil
}

type topIncomeRow struct {
	TransactionID   string    `db:"transaction_id"`
	Description     string    `db:"description"`
	Amount          int64     `db:"amount"`
	Currency        string    `db:"currency"`
	AmountInBase    int64     `db:"amount_in_base"`
	TransactionDate time.Time `db:"transaction_date"`
	EffectiveDate   time.Time `db:"effective_date"`
}

func (s *InsightsStore) GetTopIncomes(ctx context.Context, filter *finance.TopIncomesFilter) ([]*finance.TopIncome, error) {
	query := `SELECT 
		t.id as transaction_id,
		t.description,
		t.amount,
		t.currency,
		t.amount_in_base,
		t.transaction_date,
		t.effective_date
	FROM finance.transaction t
	WHERE t.space_id = $1 AND t.type = 'INCOME' AND t.effective_date >= $2 AND t.effective_date <= $3
	ORDER BY t.amount_in_base DESC
	LIMIT $4`

	startDateStr := filter.StartDate.UTC().Format("2006-01-02")
	endDateStr := filter.EndDate.UTC().Format("2006-01-02")

	var rows []*topIncomeRow
	if err := s.db.SelectContext(ctx, &rows, query, string(filter.SpaceID), startDateStr, endDateStr, filter.Limit); err != nil {
		return nil, err
	}

	results := make([]*finance.TopIncome, len(rows))
	for i, r := range rows {
		results[i] = &finance.TopIncome{
			TransactionID:   r.TransactionID,
			Description:     r.Description,
			Amount:          r.Amount,
			Currency:        r.Currency,
			AmountInBase:    r.AmountInBase,
			TransactionDate: r.TransactionDate,
			EffectiveDate:   r.EffectiveDate,
		}
	}
	return results, nil
}
