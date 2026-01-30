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
	"github.com/masterkeysrd/saturn/internal/foundation/space"
	"github.com/masterkeysrd/saturn/internal/pkg/money"
	"github.com/masterkeysrd/saturn/internal/pkg/ptr"
	"github.com/masterkeysrd/saturn/internal/pkg/sqlexp"
)

var _ finance.TransactionSearcher = (*TransactionSearcher)(nil)

type TransactionSearcher struct {
	db *sqlx.DB
}

func NewTransactionSearcher(db *sqlx.DB) *TransactionSearcher {
	return &TransactionSearcher{
		db: db,
	}
}

func (bs *TransactionSearcher) Find(ctx context.Context, criteria *finance.FindTransactionCriteria) (*finance.TransactionItem, error) {
	exp := bs.buildFindExpression(criteria)
	params := NewFindTransactionParams(criteria)

	query, args, err := sqlx.Named(exp.ToSQL(), params)
	if err != nil {
		return nil, fmt.Errorf("cannot build transaction find query: %w", err)
	}

	query = bs.db.Rebind(query)

	var view TransactionView
	if err := bs.db.GetContext(ctx, &view, query, args...); err != nil {
		return nil, fmt.Errorf("cannot execute transaction find query: %w", err)
	}

	return view.ToTransactionItem(), nil
}

func (bs *TransactionSearcher) Search(ctx context.Context, criteria *finance.TransactionSearchCriteria) (*finance.TransactionPage, error) {
	// 1. Generate the SQL and Arguments
	exp := bs.buildSearchExpression(criteria)
	params := NewTransactionSearchParams(criteria)

	// 2. Execute Data Query
	rows, err := bs.db.NamedQueryContext(ctx, exp.ToSQL(), params)
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

		items = append(items, view.ToTransactionItem())
	}

	// 3. Execute Count Query
	total, err := bs.count(ctx, criteria)
	if err != nil {
		return nil, fmt.Errorf("cannot count transactions: %w", err)
	}

	// 4. Build and Return Page
	return paging.NewPage(items, total, criteria.PagingRequest.Page), nil
}

func (bs *TransactionSearcher) buildFindExpression(criteria *finance.FindTransactionCriteria) sqlexp.SelectExpression {
	exp := bs.buildExpression(criteria.View)
	exp = exp.Where(
		sqlexp.Eq("trx.id", sqlexp.NamedParam("id")),
	).Limit(sqlexp.NamedParam("limit"))

	return exp
}

func (bs *TransactionSearcher) buildSearchExpression(criteria *finance.TransactionSearchCriteria) sqlexp.SelectExpression {
	exp := bs.buildExpression(criteria.View)

	if criteria.Term != "" {
		exp = exp.AndWhere(
			sqlexp.Cond("trx.search_vector", "@@", sqlexp.Func("plainto_tsquery", sqlexp.NamedParam("term"))),
		)
	}

	exp = exp.
		Limit(sqlexp.NamedParam("limit")).
		Offset(sqlexp.NamedParam("offset")).
		OrderBy("trx.date DESC", "trx.create_time DESC")

	return exp
}

func (bs *TransactionSearcher) buildExpression(view finance.TransactionView) sqlexp.SelectExpression {
	exp := sqlexp.Select(
		"trx.id",
		"trx.type",
		"trx.budget_id",
		"trx.title",
		"trx.description",
		"trx.date",
		"trx.amount_cents",
		"trx.amount_currency",
		"trx.base_amount_cents",
		"trx.base_amount_currency",
		"trx.exchange_rate",
		"trx.create_time",
		"trx.update_time",
	).From("finance.transactions trx").
		Where(
			sqlexp.Eq("trx.space_id", sqlexp.NamedParam("space_id")),
		)

	if view >= finance.TransactionViewFull {
		exp = exp.
			Columns(
				"bgt.name as budget_name",
				"bgt.description as budget_description",
				"bgt.color as budget_color",
				"bgt.icon_name as budget_icon_name",
			).
			LeftJoin("finance.budgets", "bgt", sqlexp.Eq("trx.budget_id", "bgt.id"))
	}

	return exp
}

func (bs *TransactionSearcher) count(ctx context.Context, criteria *finance.TransactionSearchCriteria) (int, error) {
	params := NewTransactionSearchParams(criteria)

	exp := sqlexp.Select("COUNT(trx.id) AS total_count").
		From("finance.transactions trx").
		Where(
			sqlexp.Eq("trx.space_id", sqlexp.NamedParam("space_id")),
		)

	if criteria.Term != "" {
		exp = exp.AndWhere(
			sqlexp.Cond("trx.search_vector", "@@", sqlexp.Func("plainto_tsquery", sqlexp.NamedParam("term"))),
		)
	}

	query, args, err := sqlx.Named(exp.ToSQL(), params)
	if err != nil {
		return 0, fmt.Errorf("cannot build transaction count query: %w", err)
	}

	query = bs.db.Rebind(query)

	var total int
	if err := bs.db.GetContext(ctx, &total, query, args...); err != nil {
		return 0, fmt.Errorf("cannot execute transaction count query: %w", err)
	}

	return total, nil
}

// TransactionSearchParams represents database query parameters for budget search.
type TransactionSearchParams struct {
	View    finance.TransactionView
	SpaceID space.ID `db:"space_id"`
	Term    string   `db:"term"`
	Offset  int      `db:"offset"`
	Limit   int      `db:"limit"`
}

// NewTransactionSearchParams creates params from domain criteria.
func NewTransactionSearchParams(criteria *finance.TransactionSearchCriteria) TransactionSearchParams {
	return TransactionSearchParams{
		SpaceID: criteria.SpaceID,
		Term:    criteria.Term,
		Offset:  criteria.PagingRequest.Offset(),
		Limit:   criteria.PagingRequest.Limit(),
	}
}

type FindTransactionParams struct {
	SpaceID space.ID `db:"space_id"`
	ID      string   `db:"id"`
	Limit   int      `db:"limit"`
}

func NewFindTransactionParams(criteria *finance.FindTransactionCriteria) FindTransactionParams {
	return FindTransactionParams{
		SpaceID: criteria.SpaceID,
		ID:      string(criteria.ID),
		Limit:   1,
	}
}

type TransactionView struct {
	ID                 string             `db:"id"`
	Type               string             `db:"type"` // e.g., 'INCOME', 'EXPENSE'
	Title              string             `db:"title"`
	Description        *string            `db:"description"`
	Date               time.Time          `db:"date"`
	EffectiveDate      time.Time          `db:"effective_date"`
	AmountCents        money.Cents        `db:"amount_cents"`
	AmountCurrency     money.CurrencyCode `db:"amount_currency"`
	BaseAmountCents    money.Cents        `db:"base_amount_cents"`
	BaseAmountCurrency money.CurrencyCode `db:"base_amount_currency"`
	ExchangeRate       decimal.Decimal    `db:"exchange_rate"`
	CreateTime         time.Time          `db:"create_time"`
	UpdateTime         time.Time          `db:"update_time"`

	BudgetID          string  `db:"budget_id"` // Corresponds to bgt.id
	BudgetName        string  `db:"budget_name"`
	BudgetDescription *string `db:"budget_description"`
	BudgetColor       string  `db:"budget_color"`
	BudgetIcon        string  `db:"budget_icon_name"` // Assuming your column is named 'icon_name'
}

func (tiv *TransactionView) ToTransactionItem() *finance.TransactionItem {
	ti := &finance.TransactionItem{
		ID:            finance.TransactionID(tiv.ID),
		Type:          finance.TransactionType(tiv.Type),
		Title:         tiv.Title,
		Description:   ptr.Value(tiv.Description),
		Date:          tiv.Date,
		EffectiveDate: tiv.EffectiveDate,
		Amount:        money.NewMoney(tiv.AmountCurrency, tiv.AmountCents),
		BaseAmount:    money.NewMoney(tiv.BaseAmountCurrency, tiv.BaseAmountCents),
		ExchangeRate:  tiv.ExchangeRate,
		CreateTime:    tiv.CreateTime,
		UpdateTime:    tiv.UpdateTime,
	}

	if tiv.BudgetID != "" {
		ti.Budget = &finance.TransactionBudgetItem{
			ID:          finance.BudgetID(tiv.BudgetID),
			Name:        tiv.BudgetName,
			Description: ptr.Value(tiv.BudgetDescription),
			Appearance: appearance.Appearance{
				Color: appearance.Color(tiv.BudgetColor),
				Icon:  appearance.Icon(tiv.BudgetIcon),
			},
		}
	}

	return ti
}
