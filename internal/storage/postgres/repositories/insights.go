package pgrepositories

import (
	"context"
	"fmt"
	"time"

	"github.com/jmoiron/sqlx"
	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/pkg/money"
	// "github.com/masterkeysrd/saturn/internal/pkg/str"
)

var _ finance.InsightsStore = (*Insights)(nil)

// Insights provides methods to query spending insights data.
type Insights struct {
	db      *sqlx.DB
	queries *InsightsQueries
}

// NewInsights creates a new insights repository.
func NewInsights(db *sqlx.DB) (*Insights, error) {
	queries, err := NewInsightsQueries(db)
	if err != nil {
		return nil, fmt.Errorf("cannot initialize insights queries: %w", err)
	}

	return &Insights{
		db:      db,
		queries: queries,
	}, nil
}

// GetSpendingSeries retrieves spending data aggregated by budget and period.
// Returns flattened rows that can be grouped in memory using finance.SpendingInsights.
func (i *Insights) GetSpendingSeries(ctx context.Context, filter finance.SpendingSeriesFilter) ([]*finance.SpendingSeries, error) {
	rows, err := i.queries.GetSpendingSeries(ctx, filter)
	if err != nil {
		return nil, fmt.Errorf("cannot execute get spending series query: %w", err)
	}
	defer rows.Close()

	var series []*finance.SpendingSeries
	for rows.Next() {
		var entity SpendingSeriesEntity
		if err := rows.StructScan(&entity); err != nil {
			return nil, fmt.Errorf("cannot scan spending series: %w", err)
		}

		series = append(series, entityToSpendingSeries(&entity))
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("rows iteration error: %w", err)
	}

	return series, nil
}

const getSpendingSeriesQuery = `
WITH period_budgets AS (
    SELECT 
        bp.budget_id,
        bp.start_date,
        bp.end_date,
        bp.base_amount_cents,
        bp.base_amount_currency
    FROM budget_periods bp
    WHERE bp.start_date >= :start_date
      AND bp.end_date <= :end_date
)
SELECT 
    b.id as budget_id,
    b.name as budget_name,
    TO_CHAR(DATE_TRUNC('month', pb.start_date), 'YYYY-MM') as period,
    pb.start_date as period_start,
    pb.end_date as period_end,
    pb.base_amount_cents as budgeted_cents,
    pb.base_amount_currency as budgeted_currency,
    COALESCE(SUM(t.base_amount_cents), 0) as spent_cents,
    COALESCE(MAX(t.base_amount_currency), pb.base_amount_currency) as spent_currency,
    COUNT(t.id) as transaction_count
FROM period_budgets pb
JOIN budgets b ON pb.budget_id = b.id
LEFT JOIN transactions t 
    ON t.budget_id = b.id 
    AND t.type = 'expense'
    AND t.date >= pb.start_date 
    AND t.date <= pb.end_date
GROUP BY 
    b.id, 
    b.name, 
    pb.start_date, 
    pb.end_date,
    pb.base_amount_cents,
    pb.base_amount_currency
ORDER BY pb.start_date DESC, b.name`

// InsightsQueries holds prepared statements for insights queries.
type InsightsQueries struct {
	getSpendingSeriesStmt *sqlx.NamedStmt
}

// NewInsightsQueries initializes prepared statements for insights queries.
func NewInsightsQueries(db *sqlx.DB) (*InsightsQueries, error) {
	getSpendingSeriesStmt, err := db.PrepareNamed(getSpendingSeriesQuery)
	if err != nil {
		return nil, fmt.Errorf("cannot prepare get spending series query: %w", err)
	}

	return &InsightsQueries{
		getSpendingSeriesStmt: getSpendingSeriesStmt,
	}, nil
}

// GetSpendingSeries executes the spending series query.
func (q *InsightsQueries) GetSpendingSeries(ctx context.Context, filter finance.SpendingSeriesFilter) (*sqlx.Rows, error) {
	return q.getSpendingSeriesStmt.QueryxContext(ctx, map[string]any{
		"start_date": filter.StartDate,
		"end_date":   filter.EndState,
	})
}

// Close releases all prepared statements.
func (q *InsightsQueries) Close() error {
	if q.getSpendingSeriesStmt != nil {
		return q.getSpendingSeriesStmt.Close()
	}
	return nil
}

// SpendingSeriesEntity represents a row from the spending series query.
type SpendingSeriesEntity struct {
	BudgetID         finance.BudgetID   `db:"budget_id"`
	BudgetName       string             `db:"budget_name"`
	Period           string             `db:"period"`
	PeriodStart      time.Time          `db:"period_start"`
	PeriodEnd        time.Time          `db:"period_end"`
	BudgetedCents    money.Cents        `db:"budgeted_cents"`
	BudgetedCurrency money.CurrencyCode `db:"budgeted_currency"`
	SpentCents       money.Cents        `db:"spent_cents"`
	SpentCurrency    money.CurrencyCode `db:"spent_currency"`
	TransactionCount int                `db:"transaction_count"`
}

// entityToSpendingSeries converts a database entity to a domain model.
func entityToSpendingSeries(e *SpendingSeriesEntity) *finance.SpendingSeries {
	if e == nil {
		return nil
	}

	return &finance.SpendingSeries{
		BudgetID:    finance.BudgetID(e.BudgetID),
		BudgetName:  e.BudgetName,
		Period:      e.Period,
		PeriodStart: e.PeriodStart,
		PeriodEnd:   e.PeriodEnd,
		Budgeted: money.Money{
			Cents:    e.BudgetedCents,
			Currency: e.BudgetedCurrency,
		},
		Spent: money.Money{
			Cents:    e.SpentCents,
			Currency: e.SpentCurrency,
		},
		Count: e.TransactionCount,
	}
}
