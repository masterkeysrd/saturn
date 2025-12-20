package financepg

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/jmoiron/sqlx"
	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/pkg/money"
)

var _ finance.BudgetPeriodStore = (*BudgetPeriodStore)(nil)

type BudgetPeriodStore struct {
	db      *sqlx.DB
	queries *BudgetPeriodQueries
}

func NewBudgetPeriodStore(db *sqlx.DB) (*BudgetPeriodStore, error) {
	return &BudgetPeriodStore{
		db: db,
	}, nil
}

func (b *BudgetPeriodStore) GetByDate(ctx context.Context, budgetID finance.BudgetID, date time.Time) (*finance.BudgetPeriod, error) {
	// row := b.queries.GetByDate(ctx, budgetID, date)
	// if err := row.Err(); err != nil {
	// 	return nil, fmt.Errorf("cannot get budget period: %w", err)
	// }
	//
	// var entity BudgetPeriodEntity
	// if err := row.StructScan(&entity); err != nil {
	// 	return nil, fmt.Errorf("cannot scan budget period: %w", err)
	// }
	//
	// return BudgetPeriodEntityToModel(&entity), nil
	return nil, fmt.Errorf("GetByDate method is not implemented yet")
}

func (b *BudgetPeriodStore) List(ctx context.Context) ([]*finance.BudgetPeriod, error) {
	// rows, err := b.queries.List(ctx)
	// if err != nil {
	// 	return nil, fmt.Errorf("cannot execute list budget periods query: %w", err)
	// }
	// defer rows.Close()
	//
	// entities := make([]*finance.BudgetPeriod, 0, 50) // TODO: Change this when implement pagination.
	// for rows.Next() {
	// 	var entity BudgetPeriodEntity
	// 	if err := rows.StructScan(&entity); err != nil {
	// 		return nil, fmt.Errorf("cannot scan budget period: %w", err)
	// 	}
	// 	entities = append(entities, BudgetPeriodEntityToModel(&entity))
	// }
	//
	// return entities, nil
	return nil, fmt.Errorf("List method is not implemented yet")
}

func (b *BudgetPeriodStore) Store(ctx context.Context, period *finance.BudgetPeriod) error {
	return fmt.Errorf("Store method is not implemented yet")
	// _, err := b.queries.Upsert(ctx, BudgetPeriodEntityFromModel(period))
	// if err != nil {
	// 	return fmt.Errorf("cannot store currency: %w", err)
	// }
	//
	// return nil
}

// DeleteBy handles the bulk deletion of BudgetPeriods based on specific criteria.
// It returns the number of rows deleted (int).
func (b *BudgetPeriodStore) DeleteBy(ctx context.Context, criteria finance.BudgetPeriodCriteria) (int, error) {
	return 0, fmt.Errorf("DeleteBy method is not implemented yet")
	// var result sql.Result
	// var err error
	//
	// // Use a type switch to dispatch the correct SQL logic based on the criteria type.
	// switch v := criteria.(type) {
	// case *finance.ByBudgetID:
	// 	// Delete all periods belonging to the given BudgetID.
	// 	result, err = b.queries.DeleteByBudgetID(ctx, v.ID)
	// default:
	// 	return 0, fmt.Errorf("criteria %T is not supported for DeleteBy method", criteria)
	// }
	//
	// if err != nil {
	// 	return 0, fmt.Errorf("cannot execute delete query: %w", err)
	// }
	//
	// // Return the count of affected rows. This is necessary for the Domain Service
	// // to confirm the dependent records were removed successfully.
	// affected, err := result.RowsAffected()
	// if err != nil {
	// 	return 0, fmt.Errorf("cannot get affected rows count: %w", err)
	// }
	//
	// return int(affected), nil
}

const (
	getByDateBudgetPeriodQuery = `
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
	WHERE budget_id = :budget_id
	  AND start_date <= :date
	  AND end_date >= :date`

	listBudgetPeriodsQuery = `
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
	FROM budget_periods`

	upsertBudgetPeriodQuery = `
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
		amount_cents = EXCLUDED.amount_cents,
		base_amount_cents = EXCLUDED.base_amount_cents,
		exchange_rate = EXCLUDED.exchange_rate,
		updated_at = EXCLUDED.updated_at`

	deleteBudgetPeriodsByBudgetIDQuery = `
DELETE FROM budget_periods
WHERE budget_id = :budget_id`
)

type BudgetPeriodQueries struct {
	getByDateStmt        *sqlx.NamedStmt
	listStmt             *sqlx.Stmt
	upsertStmt           *sqlx.NamedStmt
	deleteByBudgetIDStmt *sqlx.NamedStmt
}

func NewBudgetPeriodQueries(db *sqlx.DB) (*BudgetPeriodQueries, error) {
	return nil, fmt.Errorf("NewBudgetPeriodQueries function is not implemented yet")
	// getByDateStmt, err := db.PrepareNamed(getByDateBudgetPeriodQuery)
	// if err != nil {
	// 	return nil, fmt.Errorf("cannot prepare get by date query: %w", err)
	// }
	//
	// listStmt, err := db.Preparex(listBudgetPeriodsQuery)
	// if err != nil {
	// 	getByDateStmt.Close()
	// 	return nil, fmt.Errorf("cannot prepare list query: %w", err)
	// }
	//
	// upsertStmt, err := db.PrepareNamed(upsertBudgetPeriodQuery)
	// if err != nil {
	// 	getByDateStmt.Close()
	// 	listStmt.Close()
	// 	return nil, fmt.Errorf("cannot prepare upsert query: %w", err)
	// }
	//
	// deleteByBudgetIDStmt, err := db.PrepareNamed(deleteBudgetPeriodsByBudgetIDQuery)
	// if err != nil {
	// 	getByDateStmt.Close()
	// 	listStmt.Close()
	// 	upsertStmt.Close()
	// 	return nil, fmt.Errorf("cannot prepare delete by budget ID query: %w", err)
	// }
	//
	// return &BudgetPeriodQueries{
	// 	getByDateStmt:        getByDateStmt,
	// 	listStmt:             listStmt,
	// 	upsertStmt:           upsertStmt,
	// 	deleteByBudgetIDStmt: deleteByBudgetIDStmt,
	// }, nil
}

func (q *BudgetPeriodQueries) GetByDate(ctx context.Context, budgetID finance.BudgetID, date time.Time) *sqlx.Row {
	return q.getByDateStmt.QueryRowContext(ctx, map[string]any{
		"budget_id": budgetID,
		"date":      date,
	})
}

func (q *BudgetPeriodQueries) List(ctx context.Context) (*sqlx.Rows, error) {
	return q.listStmt.QueryxContext(ctx)
}

func (q *BudgetPeriodQueries) Upsert(ctx context.Context, entity *BudgetPeriodEntity) (sql.Result, error) {
	return q.upsertStmt.ExecContext(ctx, entity)
}

// DeleteByBudgetID executes the bulk DELETE operation using the positional argument.
func (q *BudgetPeriodQueries) DeleteByBudgetID(ctx context.Context, budgetID finance.BudgetID) (sql.Result, error) {
	return q.deleteByBudgetIDStmt.ExecContext(ctx, map[string]any{
		"budget_id": budgetID,
	})
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
