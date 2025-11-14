package pgrepositories

import (
	"context"
	"fmt"
	"time"

	"github.com/jmoiron/sqlx"
	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/pkg/money"
)

var _ finance.BudgetPeriodStore = (*BudgetPeriod)(nil)

type BudgetPeriod struct {
	db      *sqlx.DB
	queries BudgetPeriodQueries
}

func NewBudgetPeriod(db *sqlx.DB) *BudgetPeriod {
	return &BudgetPeriod{
		db: db,
	}
}

func (b *BudgetPeriod) List(ctx context.Context) ([]*finance.BudgetPeriod, error) {
	query := b.queries.List()

	var entities []*BudgetPeriodEntity
	if err := b.db.SelectContext(ctx, &entities, query); err != nil {
		return nil, fmt.Errorf("cannot list budgets: %w", err)
	}

	periods := make([]*finance.BudgetPeriod, 0, len(entities))
	for _, e := range entities {
		periods = append(periods, BudgetPeriodEntityToModel(e))
	}

	return periods, nil
}

func (b *BudgetPeriod) Store(ctx context.Context, period *finance.BudgetPeriod) error {
	entity := BudgetPeriodEntityFromModel(period)
	query := b.queries.Upsert()

	_, err := b.db.NamedExecContext(ctx, query, &entity)
	if err != nil {
		return fmt.Errorf("cannot store budget period: %w", err)
	}

	return nil
}

type BudgetPeriodQueries struct{}

func (b BudgetPeriodQueries) List() string {
	return `
	SELECT
		id,
		budget_id,
		start_date,
		end_date,
		amount_currency,
		amount_cents,
		base_amount_currency,
		base_amount_cents,
		exchange_rate,
		created_at,
		updated_at
	FROM budget_periods
	`
}

func (b BudgetPeriodQueries) Upsert() string {
	return `
	INSERT INTO budget_periods (
	    id,
	    budget_id,
	    start_date,
	    end_date,
		amount_currency,
		amount_cents,
		base_amount_currency,
		base_amount_cents,
	    exchange_rate,
	    created_at,
	    updated_at
	) VALUES (
		:id,
		:budget_id,
		:start_date,
		:end_date,
		:amount_currency,
		:amount_cents,
		:base_amount_currency,
		:base_amount_cents,
		:exchange_rate,
		:created_at,
		:updated_at
	)
	ON CONFLICT (id) DO UPDATE SET
	    amount_cents        = EXCLUDED.amount_cents,
	    base_amount_cents   = EXCLUDED.base_amount_cents,
	    exchange_rate 		= EXCLUDED.exchange_rate,
	    updated_at    		= EXCLUDED.updated_at
	`
}

type BudgetPeriodEntity struct {
	ID           string             `db:"id"`
	BudgetID     string             `db:"budget_id"`
	StartDate    time.Time          `db:"start_date"`
	EndDate      time.Time          `db:"end_date"`
	Currency     money.CurrencyCode `db:"amount_currency"`
	Amount       money.Cents        `db:"amount_cents"`
	BaseCurrency money.CurrencyCode `db:"base_amount_currency"`
	BaseAmount   money.Cents        `db:"base_amount_cents"`
	ExchangeRate float64            `db:"exchange_rate"`
	CreatedAt    time.Time          `db:"created_at"`
	UpdatedAt    time.Time          `db:"updated_at"`
}

func BudgetPeriodEntityFromModel(b *finance.BudgetPeriod) *BudgetPeriodEntity {
	if b == nil {
		return nil
	}

	return &BudgetPeriodEntity{
		ID:           b.ID.String(),
		BudgetID:     b.BudgetID.String(),
		StartDate:    b.StartDate,
		EndDate:      b.EndDate,
		Currency:     b.Amount.Currency,
		Amount:       b.Amount.Cents,
		BaseCurrency: b.BaseAmount.Currency,
		BaseAmount:   b.BaseAmount.Cents,
		ExchangeRate: b.ExchangeRate,
		CreatedAt:    b.CreatedAt,
		UpdatedAt:    b.UpdatedAt,
	}
}

func BudgetPeriodEntityToModel(e *BudgetPeriodEntity) *finance.BudgetPeriod {
	if e == nil {
		return nil
	}

	return &finance.BudgetPeriod{
		ID:        finance.BudgetPeriodID(e.ID),
		BudgetID:  finance.BudgetID(e.BudgetID),
		StartDate: e.StartDate,
		EndDate:   e.EndDate,
		Amount: money.Money{
			Currency: e.Currency,
			Cents:    e.Amount,
		},
		BaseAmount: money.Money{
			Currency: e.BaseCurrency,
			Cents:    e.Amount,
		},
		ExchangeRate: e.ExchangeRate,
		CreatedAt:    e.CreatedAt,
		UpdatedAt:    e.UpdatedAt,
	}
}
