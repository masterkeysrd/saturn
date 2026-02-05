package financepg

import (
	"context"
	"fmt"
	"time"

	"github.com/jmoiron/sqlx"
	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/pkg/money"
	"github.com/masterkeysrd/saturn/internal/pkg/sqlexp"
)

var _ finance.InsightsStore = (*InsightsStore)(nil)

// InsightsStore provides methods to query spending insights data.
type InsightsStore struct {
	db *sqlx.DB
}

// NewInsightsStore creates a new insights repository.
func NewInsightsStore(db *sqlx.DB) (*InsightsStore, error) {
	return &InsightsStore{
		db: db,
		// queries: queries,
	}, nil
}

func (s *InsightsStore) GetSpendingTrends(ctx context.Context, criteria finance.SpendingTrendPointCriteria) ([]*finance.SpendingTrendSerie, error) {
	var expr sqlexp.SelectExpression = s.buildGetMonthlySpendingTrendsExpr()

	fmt.Println("Debug: Successfully executed spending trends query", expr.ToSQL(), criteria)
	rows, err := s.db.NamedQueryContext(ctx, expr.ToSQL(), GetSpendingTrendsParams{
		SpaceID:   criteria.SpaceID.String(),
		StartDate: criteria.StartDate,
		EndDate:   criteria.EndState,
	})
	if err != nil {
		return nil, fmt.Errorf("cannot execute spending trends query: %w", err)
	}
	defer rows.Close()

	items := make([]*finance.SpendingTrendSerie, 0, 50)
	for rows.Next() {
		var row SpendingTrendRow
		if err := rows.StructScan(&row); err != nil {
			return nil, fmt.Errorf("cannot scan spending trend row: %w", err)
		}

		item := &finance.SpendingTrendSerie{
			Period:        row.Period,
			BudgetID:      finance.BudgetID(row.BudgetID),
			BudgetedCents: money.Cents(row.BudgetedCents),
			Currency:      money.CurrencyCode(row.Currency),
			SpentCents:    money.Cents(row.SpentCents),
			TrxCount:      row.TransactionCount,
		}
		items = append(items, item)
	}

	return items, nil
}

func (s *InsightsStore) buildGetMonthlySpendingTrendsExpr() sqlexp.SelectExpression {
	return sqlexp.Select(
		"bp.budget_id",
		"TO_CHAR(DATE_TRUNC('month', bp.start_date), 'YYYY-MM') AS period",
		"COALESCE(SUM(bp.base_amount_cents), 0) AS budgeted_cents",
		"bp.base_amount_currency AS currency",
		"COALESCE(SUM(t.amount_cents), 0) AS spent_cents",
		"COUNT(t.id) AS transaction_count",
	).
		From("finance.budget_periods bp").
		Join("finance.budgets", "b",
			sqlexp.Eq("bp.budget_id", "b.id"),
			sqlexp.Eq("bp.space_id", "b.space_id"),
		).
		LeftJoin("finance.transactions", "t",
			sqlexp.Eq("t.budget_period_id", "bp.id"),
			sqlexp.Eq("t.budget_id", "bp.budget_id"),
			sqlexp.Eq("t.space_id", "bp.space_id"),
		).
		Where(
			sqlexp.Eq("bp.space_id", sqlexp.NamedParam("space_id")),
			sqlexp.Gte("bp.start_date", sqlexp.NamedParam("start_date")),
			sqlexp.Lte("bp.end_date", sqlexp.NamedParam("end_date")),
		).
		GroupBy("period", "bp.budget_id", "bp.base_amount_currency").
		OrderBy("period ASC", "bp.budget_id ASC")
}

type SpendingTrendRow struct {
	Period           string `db:"period"`
	BudgetID         string `db:"budget_id"`
	BudgetedCents    int64  `db:"budgeted_cents"`
	Currency         string `db:"currency"`
	SpentCents       int64  `db:"spent_cents"`
	TransactionCount int64  `db:"transaction_count"`
}

type GetSpendingTrendsParams struct {
	SpaceID   string    `db:"space_id"`
	StartDate time.Time `db:"start_date"`
	EndDate   time.Time `db:"end_date"`
}
