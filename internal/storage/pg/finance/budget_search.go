package financepg

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/jmoiron/sqlx"
	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/foundation/appearance"
	"github.com/masterkeysrd/saturn/internal/foundation/pagination"
	"github.com/masterkeysrd/saturn/internal/pkg/money"
	"github.com/masterkeysrd/saturn/internal/pkg/ptr"
)

var _ finance.BudgetSearcher = (*BudgetSearcher)(nil)

type BudgetSearcher struct {
	db      *sqlx.DB
	queries *BudgetSearcherQueries
}

func NewBudgetSearcher(db *sqlx.DB) *BudgetSearcher {
	return &BudgetSearcher{
		db:      db,
		queries: &BudgetSearcherQueries{},
	}
}

func (bs *BudgetSearcher) Search(ctx context.Context, criteria *finance.BudgetSearchCriteria) (finance.BudgetPage, error) {
	// 1. Generate the SQL and Arguments
	searchQuery, countQuery, args := bs.queries.Search(criteria)

	// 2. Execute Data Query
	rows, err := bs.db.NamedQueryContext(ctx, searchQuery, args)
	if err != nil {
		return finance.BudgetPage{}, fmt.Errorf("cannot execute budget search query: %w", err)
	}
	defer rows.Close()

	items := make([]*finance.BudgetItem, 0, criteria.Size())
	for rows.Next() {
		var view BudgetItemView
		if err := rows.StructScan(&view); err != nil {
			return finance.BudgetPage{}, fmt.Errorf("cannot scan budget view: %w", err)
		}

		items = append(items, &finance.BudgetItem{
			ID:     finance.BudgetID(view.ID),
			Name:   view.Name,
			Amount: money.NewMoney(view.Currency, view.Amount),
			Appearance: appearance.Appearance{
				Color: appearance.Color(view.Color),
				Icon:  appearance.Icon(view.IconName),
			},
			BaseAmount:       money.NewMoney(ptr.Value(view.BaseCurrency), ptr.Value(view.BaseAmount)),
			Spent:            money.NewMoney(view.Currency, ptr.Value(view.Spent)),
			BaseSpent:        money.NewMoney(ptr.Value(view.BaseCurrency), ptr.Value(view.BaseSpent)),
			PeriodStartDate:  ptr.Value(view.StartDate),
			PeriodEndDate:    ptr.Value(view.EndDate),
			TransactionCount: ptr.Value(view.TransactionCount), // Ensure this field exists in BudgetItem if needed
		})
	}

	// 3. Execute Count Query
	// We use NamedQueryContext because we are reusing the 'args' map with named parameters.
	countRows, err := bs.db.NamedQueryContext(ctx, countQuery, args)
	if err != nil {
		return finance.BudgetPage{}, fmt.Errorf("cannot execute budget count query: %w", err)
	}
	defer countRows.Close()

	var totalItems int
	if countRows.Next() {
		if err := countRows.Scan(&totalItems); err != nil {
			return finance.BudgetPage{}, fmt.Errorf("cannot scan budget count: %w", err)
		}
	}

	// 4. Return Page
	return pagination.NewPage(items, criteria.Page(), criteria.Size(), totalItems), nil
}

type BudgetItemView struct {
	ID               string              `db:"id"`
	Name             string              `db:"name"`
	Color            string              `db:"color"`
	IconName         string              `db:"icon_name"`
	Amount           money.Cents         `db:"budget_amount"`
	Currency         money.CurrencyCode  `db:"amount_currency"`
	BaseAmount       *money.Cents        `db:"base_amount"`
	BaseCurrency     *money.CurrencyCode `db:"base_amount_currency"`
	Spent            *money.Cents        `db:"spent_amount"`
	BaseSpent        *money.Cents        `db:"base_spent_amount"`
	StartDate        *time.Time          `db:"start_date"`
	EndDate          *time.Time          `db:"end_date"`
	TransactionCount *int                `db:"transaction_count"`
}

var searchBudgetQuery = `
WITH
    FilteredBudgetPeriods AS (
        SELECT
            bp.id,
            bp.budget_id,
            bp.start_date,
            bp.end_date,
            bp.base_amount_cents,
            bp.base_amount_currency
        FROM
            budget_periods bp
        WHERE
			bp.start_date <= :date
			AND bp.end_date >= :date
    ),
    TransactionsStats AS (
        SELECT
            fbp.budget_id,
            fbp.start_date,
            fbp.end_date,
            fbp.base_amount_cents,
            fbp.base_amount_currency,
            COALESCE(SUM(txn.amount_cents), 0) AS spent_amount_cents,
            COALESCE(SUM(txn.base_amount_cents), 0) AS base_spent_amount_cents,
            COUNT(txn.id) AS transaction_count
        FROM
            FilteredBudgetPeriods fbp
            LEFT JOIN transactions txn ON fbp.id = txn.budget_period_id
            AND fbp.budget_id = txn.budget_id
        GROUP BY
            fbp.budget_id,
            fbp.start_date,
            fbp.end_date,
            fbp.base_amount_cents,
            fbp.base_amount_currency
    )
SELECT
    b.id,
    b.name,
	b.color,
	b.icon_name,
    txs.start_date,
    txs.end_date,
    b.currency amount_currency,
    b.amount budget_amount,
    txs.base_amount_currency,
    txs.base_amount_cents base_amount,
    txs.spent_amount_cents as spent_amount,
    txs.transaction_count
FROM budgets b
LEFT JOIN
	TransactionsStats txs ON txs.budget_id = b.id
`

var searchBudgetQueryCount = `
WITH DateFilteredBudgets AS (
    SELECT 
	    bp.id,
		bp.budget_id
    FROM 
		budget_periods bp
    WHERE bp.start_date <= :date
      AND bp.end_date >= :date
),
AggregatedData AS (
    -- Same Aggregation CTE as above (just need budget_id to group)
    SELECT dfb.budget_id
    FROM DateFilteredBudgets dfb
    LEFT JOIN transactions txn ON txn.budget_period_id = dfb.id AND txn.type = 'EXPENSE' 
    GROUP BY dfb.budget_id
)
SELECT 
    COUNT(b.id)
FROM budgets b
LEFT JOIN
	AggregatedData ad ON ad.budget_id = b.id

`

type BudgetSearcherQueries struct{}

func (bsq *BudgetSearcherQueries) Search(criteria *finance.BudgetSearchCriteria) (string, string, any) {
	params := NewBudgetSearchParams(criteria)

	// 1. Build the Dynamic WHERE Clause
	var whereClauseBuilder strings.Builder
	if params.Term != "" {
		// Apply wildcards to the parameter
		params.Term = "%" + params.Term + "%"

		// Note: Ensure the alias 'bgt' matches your main query's alias for the budgets table
		whereClauseBuilder.WriteString("\nWHERE b.name ILIKE :term")
	}
	whereClause := whereClauseBuilder.String()

	// 2. Build the Search (Data) Query
	// Structure: [Base CTEs & Select] + [Where] + [Order/Limit/Offset]
	var searchSB strings.Builder
	searchSB.Grow(len(searchBudgetQuery) + len(whereClause) + 50)

	searchSB.WriteString(searchBudgetQuery)
	searchSB.WriteString(whereClause)
	searchSB.WriteString("\nORDER BY b.name ASC") // Always enforce deterministic ordering
	searchSB.WriteString("\nLIMIT :limit OFFSET :offset")

	// 3. Build the Count (Total) Query
	// Structure: [Count CTEs & Select Count] + [Where]
	var countSB strings.Builder
	countSB.Grow(len(searchBudgetQueryCount) + len(whereClause))

	countSB.WriteString(searchBudgetQueryCount)
	countSB.WriteString(whereClause)

	return searchSB.String(), countSB.String(), params
}

// BudgetSearchParams represents database query parameters for budget search.
type BudgetSearchParams struct {
	Term   string    `db:"term"`
	Date   time.Time `db:"date"`
	Offset int       `db:"offset"`
	Limit  int       `db:"limit"`
}

// NewBudgetSearchParams creates params from domain criteria.
func NewBudgetSearchParams(criteria *finance.BudgetSearchCriteria) BudgetSearchParams {
	return BudgetSearchParams{
		Term:   criteria.Term,
		Date:   criteria.Date,
		Offset: criteria.Offset(),
		Limit:  criteria.Size(),
	}
}
