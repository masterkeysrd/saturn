package financepg

import (
	"context"
	"fmt"
	"time"

	"github.com/jmoiron/sqlx"
	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	"github.com/masterkeysrd/saturn/internal/foundation/space"
	"github.com/masterkeysrd/saturn/internal/pkg/money"
)

var _ finance.BudgetPeriodStore = (*BudgetPeriodStore)(nil)

type BudgetPeriodStore struct {
	db *sqlx.DB
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
	entity, err := UpsertBudgetPeriod(ctx, b.db, NewBudgetPeriodEntity(period))
	if err != nil {
		return fmt.Errorf("cannot store budget period: %w", err)
	}

	// Update the budget period model with any changes from the database (e.g., generated IDs)
	*period = *BudgetPeriodEntityToModel(entity)
	return nil
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

	deleteBudgetPeriodsByBudgetIDQuery = `
DELETE FROM budget_periods
WHERE budget_id = :budget_id`
)

func NewBudgetPeriodEntity(b *finance.BudgetPeriod) *BudgetPeriodEntity {
	if b == nil {
		return nil
	}

	return &BudgetPeriodEntity{
		Id:                 b.ID.String(),
		SpaceId:            b.SpaceID.String(),
		BudgetId:           b.BudgetID.String(),
		StartDate:          b.StartDate,
		EndDate:            b.EndDate,
		AmountCurrency:     b.Amount.Currency.String(),
		AmountCents:        b.Amount.Cents.Int64(),
		BaseAmountCurrency: b.BaseAmount.Currency.String(),
		BaseAmountCents:    b.BaseAmount.Cents.Int64(),
		ExchangeRate:       b.ExchangeRate,
		CreateTime:         b.CreateTime,
		CreateBy:           b.CreateBy.String(),
		UpdateTime:         b.UpdateTime,
		UpdateBy:           b.UpdateBy.String(),
	}
}

func BudgetPeriodEntityToModel(e *BudgetPeriodEntity) *finance.BudgetPeriod {
	if e == nil {
		return nil
	}

	return &finance.BudgetPeriod{
		BudgetPeriodKey: finance.BudgetPeriodKey{
			ID:      finance.BudgetPeriodID(e.Id),
			SpaceID: space.ID(e.SpaceId),
		},
		BudgetID:  finance.BudgetID(e.BudgetId),
		StartDate: e.StartDate,
		EndDate:   e.EndDate,
		Amount: money.Money{
			Currency: money.CurrencyCode(e.AmountCurrency),
			Cents:    money.Cents(e.AmountCents),
		},
		BaseAmount: money.Money{
			Currency: money.CurrencyCode(e.BaseAmountCurrency),
			Cents:    money.Cents(e.BaseAmountCents),
		},
		ExchangeRate: e.ExchangeRate,
		CreateTime:   e.CreateTime,
		CreateBy:     auth.UserID(e.CreateBy),
		UpdateTime:   e.UpdateTime,
		UpdateBy:     auth.UserID(e.UpdateBy),
	}
}
