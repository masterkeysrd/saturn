package financepg

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/jmoiron/sqlx"
	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/foundation/appearance"
	"github.com/masterkeysrd/saturn/internal/foundation/paging"
	"github.com/masterkeysrd/saturn/internal/pkg/money"
	"github.com/masterkeysrd/saturn/internal/pkg/ptr"
)

var _ finance.TransactionSearcher = (*TransactionSearcher)(nil)

type TransactionSearcher struct {
	db      *sqlx.DB
	queries *TransactionSearcherQueries
}

func NewTransactionSearcher(db *sqlx.DB) *TransactionSearcher {
	return &TransactionSearcher{
		db:      db,
		queries: &TransactionSearcherQueries{},
	}
}

func (bs *TransactionSearcher) Search(ctx context.Context, criteria *finance.TransactionSearchCriteria) (*finance.TransactionPage, error) {
	// 1. Generate the SQL and Arguments
	searchQuery, countQuery, args := bs.queries.Search(criteria)

	// 2. Execute Data Query
	rows, err := bs.db.NamedQueryContext(ctx, searchQuery, args)
	if err != nil {
		return nil, fmt.Errorf("cannot execute transaction search query: %w", err)
	}
	defer rows.Close()

	items := make([]*finance.TransactionItem, 0, criteria.PagingRequest.Limit())
	for rows.Next() {
		var view TransactionView
		if err := rows.StructScan(&view); err != nil {
			return nil, fmt.Errorf("cannot scan transaction view: %w", err)
		}

		item := finance.TransactionItem{
			ID:           finance.TransactionID(view.ID),
			Type:         finance.TransactionType(view.Type),
			Name:         view.Name,
			Description:  ptr.Value(view.Description),
			Date:         view.Date,
			Amount:       money.NewMoney(view.AmountCurrency, view.AmountCents),
			BaseAmount:   money.NewMoney(view.BaseAmountCurrency, view.BaseAmountCents),
			ExchangeRate: view.ExchangeRate,
			CreatedAt:    view.CreatedAt,
			UpdatedAt:    view.UpdatedAt,
		}

		if view.BudgetID != "" {
			item.Budget = &finance.TransactionBudgetItem{
				ID:   finance.BudgetID(view.BudgetID),
				Name: view.BudgetName,
				Appearance: appearance.Appearance{
					Color: appearance.Color(view.BudgetColor),
					Icon:  appearance.Icon(view.BudgetIcon),
				},
			}
		}

		items = append(items, &item)
	}
	slog.Info("transactions", slog.Any("trx", items), slog.String("query", searchQuery), slog.Any("args", args))

	// 3. Execute Count Query
	// We use NamedQueryContext because we are reusing the 'args' map with named parameters.
	countRows, err := bs.db.NamedQueryContext(ctx, countQuery, args)
	if err != nil {
		return nil, fmt.Errorf("cannot execute budget count query: %w", err)
	}
	defer countRows.Close()

	var totalItems int
	if countRows.Next() {
		if err := countRows.Scan(&totalItems); err != nil {
			return nil, fmt.Errorf("cannot scan budget count: %w", err)
		}
	}

	// 4. Return Page
	return paging.NewPage(items, totalItems, criteria.PagingRequest.Limit()), nil
}

type TransactionView struct {
	ID                 string             `db:"id"`
	Type               string             `db:"type"` // e.g., 'INCOME', 'EXPENSE'
	Name               string             `db:"name"`
	Description        *string            `db:"description"`
	Date               time.Time          `db:"date"`
	AmountCents        money.Cents        `db:"amount_cents"`
	AmountCurrency     money.CurrencyCode `db:"amount_currency"`
	BaseAmountCents    money.Cents        `db:"base_amount_cents"`
	BaseAmountCurrency money.CurrencyCode `db:"base_amount_currency"`
	ExchangeRate       float64            `db:"exchange_rate"`
	CreatedAt          time.Time          `db:"created_at"`
	UpdatedAt          time.Time          `db:"updated_at"`

	BudgetID    string `db:"budget_id"` // Corresponds to bgt.id
	BudgetName  string `db:"budget_name"`
	BudgetColor string `db:"budget_color"`
	BudgetIcon  string `db:"budget_icon_name"` // Assuming your column is named 'icon_name'
}

var searchTransactionQuery = `
SELECT
	trx.id,
	trx.type,
	bgt.id as budget_id,
	bgt.name as budget_name,
	bgt.color as budget_color,
	bgt.icon_name as budget_icon_name,
	trx.name,
	trx.description,
	trx.date,
	trx.amount_cents,
	trx.amount_currency,
	trx.base_amount_cents,
	trx.base_amount_currency,
	trx.exchange_rate,
	trx.created_at,
	trx.updated_at
FROM transactions trx
LEFT JOIN budgets bgt ON trx.budget_id = bgt.id
`

var searchTransactionQueryCount = `
SELECT
	COUNT(trx.id)
FROM transactions trx
LEFT JOIN budgets bgt ON trx.budget_id = bgt.id
`

type TransactionSearcherQueries struct{}

func (bsq *TransactionSearcherQueries) Search(criteria *finance.TransactionSearchCriteria) (string, string, any) {
	params := NewTransactionSearchParams(criteria)

	// 1. Build the Dynamic WHERE Clause
	var whereClauseBuilder strings.Builder
	if params.Term != "" {
		// Apply wildcards to the parameter
		params.Term = "%" + params.Term + "%"

		// Note: Ensure the alias 'bgt' matches your main query's alias for the budgets table
		whereClauseBuilder.WriteString("\nWHERE (bgt.name ILIKE :term OR searchable_text @@ to_tsquery('english', :term))\n")
	}
	whereClause := whereClauseBuilder.String()

	// 2. Build the Search (Data) Query
	// Structure: [Base CTEs & Select] + [Where] + [Order/Limit/Offset]
	var searchSB strings.Builder
	searchSB.Grow(len(searchTransactionQuery) + len(whereClause) + 50)

	searchSB.WriteString(searchTransactionQuery)
	searchSB.WriteString(whereClause)
	searchSB.WriteString("\nORDER BY trx.date ASC") // Always enforce deterministic ordering
	searchSB.WriteString("\nLIMIT :limit OFFSET :offset")

	// 3. Build the Count (Total) Query
	// Structure: [Count CTEs & Select Count] + [Where]
	var countSB strings.Builder
	countSB.Grow(len(searchTransactionQueryCount) + len(whereClause))

	countSB.WriteString(searchTransactionQueryCount)
	countSB.WriteString(whereClause)

	return searchSB.String(), countSB.String(), params
}

// TransactionSearchParams represents database query parameters for budget search.
type TransactionSearchParams struct {
	Term   string `db:"term"`
	Offset int    `db:"offset"`
	Limit  int    `db:"limit"`
}

// NewTransactionSearchParams creates params from domain criteria.
func NewTransactionSearchParams(criteria *finance.TransactionSearchCriteria) TransactionSearchParams {
	return TransactionSearchParams{
		Term:   criteria.Term,
		Offset: criteria.PagingRequest.Offset(),
		Limit:  criteria.PagingRequest.Limit(),
	}
}
