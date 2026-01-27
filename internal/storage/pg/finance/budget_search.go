package financepg

import (
	"context"
	"fmt"
	"time"

	"github.com/jmoiron/sqlx"
	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/foundation/appearance"
	"github.com/masterkeysrd/saturn/internal/foundation/decimal"
	"github.com/masterkeysrd/saturn/internal/foundation/paging"
	"github.com/masterkeysrd/saturn/internal/pkg/money"
	"github.com/masterkeysrd/saturn/internal/pkg/sqlexp"
)

var _ finance.BudgetSearcher = (*BudgetSearcher)(nil)

type BudgetSearcher struct {
	db *sqlx.DB
}

func NewBudgetSearcher(db *sqlx.DB) *BudgetSearcher {
	return &BudgetSearcher{
		db: db,
	}
}

func (bs *BudgetSearcher) Search(ctx context.Context, criteria *finance.BudgetSearchCriteria) (*finance.BudgetPage, error) {
	args := NewBudgetSearchParams(criteria)
	query := bs.getSearchExp(criteria)

	rows, err := bs.db.NamedQueryContext(ctx, query.ToSQL(), args)
	if err != nil {
		return nil, fmt.Errorf("cannot execute budget search query: %w", err)
	}
	defer rows.Close()

	items := make([]*finance.BudgetItem, 0, criteria.PagingRequest.Limit())
	for rows.Next() {
		var view BudgetItemView
		if err := rows.StructScan(&view); err != nil {
			return nil, fmt.Errorf("cannot scan budget view: %w", err)
		}

		items = append(items, view.ToBudgetItem())
	}

	count, err := bs.count(ctx, args)
	if err != nil {
		return nil, fmt.Errorf("cannot get total count for budget search: %w", err)
	}

	return paging.NewPage(items, count, criteria.PagingRequest.Size), nil
}

func (bs *BudgetSearcher) getSearchExp(criteria *finance.BudgetSearchCriteria) sqlexp.SelectExpression {
	exp := sqlexp.Select(
		"b.id",
		"b.name",
		"b.description",
		"b.color",
		"b.icon_name",
	).
		From("finance.budgets b").
		Where(
			sqlexp.Eq("b.space_id", sqlexp.NamedParam("space_id")),
		)

	if criteria.View >= finance.BudgetViewBasic {
		exp = exp.Columns(
			"b.status",
			"b.amount_currency",
			"b.amount_cents",
			"b.create_time",
			"b.update_time",
		)
	}

	if criteria.View >= finance.BudgetViewFull {
		exp = exp.
			With(
				sqlexp.CTE("FilteredBudgetPeriods", sqlexp.
					Select(
						"bp.id",
						"bp.space_id",
						"bp.budget_id",
						"bp.start_date",
						"bp.end_date",
						"bp.base_amount_cents",
						"bp.base_amount_currency",
						"bp.exchange_rate",
					).
					From("finance.budget_periods bp").
					Where(
						sqlexp.Lte("bp.start_date", sqlexp.NamedParam("date")),
						sqlexp.Gte("bp.end_date", sqlexp.NamedParam("date")),
						sqlexp.Eq("bp.space_id", sqlexp.NamedParam("space_id")),
					)),
				sqlexp.CTE("TransactionsStats", sqlexp.
					Select(
						"fbp.budget_id",
						"fbp.start_date",
						"fbp.end_date",
						"fbp.base_amount_cents",
						"fbp.base_amount_currency",
						"COALESCE(fbp.exchange_rate, 1) AS exchange_rate",
						"COALESCE(SUM(txn.amount_cents), 0) AS spent_amount_cents",
						"COALESCE(SUM(txn.base_amount_cents), 0) AS base_spent_amount_cents",
						"COUNT(txn.id) AS transaction_count",
					).
					From("FilteredBudgetPeriods fbp").
					LeftJoin("finance.transactions", "txn",
						sqlexp.Eq("fbp.id", "txn.budget_period_id"),
						sqlexp.Eq("fbp.budget_id", "txn.budget_id"),
						sqlexp.Eq("fbp.space_id", "txn.space_id"),
					).
					GroupBy(
						"fbp.budget_id",
						"fbp.start_date",
						"fbp.end_date",
						"fbp.base_amount_cents",
						"fbp.base_amount_currency",
						"fbp.exchange_rate",
					),
				),
			).
			Columns(
				"txs.start_date",
				"txs.end_date",
				"txs.base_amount_currency",
				"txs.base_amount_cents",
				"txs.spent_amount_cents",
				"txs.base_spent_amount_cents",
				"txs.exchange_rate",
				"txs.transaction_count",
			).
			LeftJoin("TransactionsStats", "txs",
				sqlexp.Eq("txs.budget_id", "b.id"),
			)
	}

	if criteria.Term != "" {
		exp = exp.AndWhere(
			sqlexp.Cond(
				"search_vector",
				"@@",
				sqlexp.Func("websearch_to_tsquery", sqlexp.NamedParam("term")),
			),
		)
	}

	exp = exp.
		Limit(sqlexp.NamedParam("limit")).
		Offset(sqlexp.NamedParam("offset")).
		OrderBy("b.name ASC", "b.create_time DESC")

	return exp
}

func (bs *BudgetSearcher) count(ctx context.Context, params BudgetSearchParams) (int, error) {
	exp := bs.buildCountExp(params)

	query, args, err := sqlx.Named(exp.ToSQL(), params)
	if err != nil {
		return 0, fmt.Errorf("cannot build count query: %w", err)
	}

	query = bs.db.Rebind(query)

	var totalCount int
	if err := bs.db.GetContext(ctx, &totalCount, query, args...); err != nil {
		return 0, fmt.Errorf("cannot execute count query: %w", err)
	}

	return totalCount, nil
}

func (bs *BudgetSearcher) buildCountExp(params BudgetSearchParams) sqlexp.SelectExpression {
	exp := sqlexp.Select("COUNT(b.id) AS total_count").
		From("finance.budgets b").
		Where(
			sqlexp.Eq("b.space_id", sqlexp.NamedParam("space_id")),
		)

	if params.Term != "" {
		exp = exp.AndWhere(
			sqlexp.Cond(
				"search_vector",
				"@@",
				sqlexp.Func("websearch_to_tsquery", sqlexp.NamedParam("term")),
			),
		)
	}

	return exp
}

type BudgetItemView struct {
	ID               string              `db:"id"`
	Name             string              `db:"name"`
	Description      *string             `db:"description"`
	Color            string              `db:"color"`
	IconName         string              `db:"icon_name"`
	Status           string              `db:"status"`
	Amount           money.Cents         `db:"amount_cents"`
	Currency         money.CurrencyCode  `db:"amount_currency"`
	BaseAmount       *money.Cents        `db:"base_amount_cents"`
	BaseCurrency     *money.CurrencyCode `db:"base_amount_currency"`
	Spent            *money.Cents        `db:"spent_amount_cents"`
	BaseSpent        *money.Cents        `db:"base_spent_amount_cents"`
	ExchangeRate     *decimal.Decimal    `db:"exchange_rate"`
	StartDate        *time.Time          `db:"start_date"`
	EndDate          *time.Time          `db:"end_date"`
	TransactionCount *int                `db:"transaction_count"`
	CreateTime       time.Time           `db:"create_time"`
	UpdateTime       time.Time           `db:"update_time"`
}

func (biv *BudgetItemView) ToBudgetItem() *finance.BudgetItem {
	if biv == nil {
		return nil
	}

	bi := &finance.BudgetItem{
		ID:          finance.BudgetID(biv.ID),
		Name:        biv.Name,
		Description: biv.Description,
		Appearance: appearance.Appearance{
			Color: appearance.Color(biv.Color),
			Icon:  appearance.Icon(biv.IconName),
		},
		Status:     finance.BudgetStatus(biv.Status),
		Amount:     money.NewMoney(biv.Currency, biv.Amount),
		CreateTime: biv.CreateTime,
		UpdateTime: biv.UpdateTime,
	}

	if biv.BaseAmount != nil && biv.BaseCurrency != nil {
		bi.BaseAmount = money.NewMoney(*biv.BaseCurrency, *biv.BaseAmount)
	}

	if biv.ExchangeRate != nil {
		bi.ExchangeRate = *biv.ExchangeRate
	}

	if biv.StartDate != nil && biv.EndDate != nil {
		bi.Stats = &finance.BudgetItemStats{
			PeriodStart: *biv.StartDate,
			PeriodEnd:   *biv.EndDate,
		}

		if biv.Spent != nil {
			bi.Stats.Spent = money.NewMoney(biv.Currency, *biv.Spent)
		}

		if biv.BaseSpent != nil && biv.BaseCurrency != nil {
			bi.Stats.BaseSpent = money.NewMoney(*biv.BaseCurrency, *biv.BaseSpent)
		}

		if biv.TransactionCount != nil {
			bi.Stats.TrxCount = *biv.TransactionCount
		}
	}

	return bi
}

// BudgetSearchParams represents database query parameters for budget search.
type BudgetSearchParams struct {
	SpaceID string    `db:"space_id"`
	Term    string    `db:"term"`
	Date    time.Time `db:"date"`
	Offset  int       `db:"offset"`
	Limit   int       `db:"limit"`
}

// NewBudgetSearchParams creates params from domain criteria.
func NewBudgetSearchParams(criteria *finance.BudgetSearchCriteria) BudgetSearchParams {
	return BudgetSearchParams{
		SpaceID: criteria.SpaceID.String(),
		Term:    criteria.Term,
		Date:    criteria.Date,
		Offset:  criteria.PagingRequest.Offset(),
		Limit:   criteria.PagingRequest.Limit(),
	}
}
