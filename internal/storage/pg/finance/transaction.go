package financepg

import (
	"context"
	"fmt"

	"github.com/jmoiron/sqlx"
	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	"github.com/masterkeysrd/saturn/internal/foundation/space"
	"github.com/masterkeysrd/saturn/internal/pkg/money"
	"github.com/masterkeysrd/saturn/internal/pkg/ptr"
)

var _ finance.TransactionStore = (*TransactionsStore)(nil)

type TransactionsStore struct {
	db *sqlx.DB
}

func NewTransactionsStore(db *sqlx.DB) (*TransactionsStore, error) {
	return &TransactionsStore{
		db: db,
	}, nil
}

func (t *TransactionsStore) Get(ctx context.Context, key finance.TransactionKey) (*finance.Transaction, error) {
	entity, err := GetTransactionByID(ctx, t.db, &GetTransactionByIDParams{
		Id:      key.ID.String(),
		SpaceId: key.SpaceID.String(),
	})
	if err != nil {
		return nil, fmt.Errorf("cannot get transaction by id: %w", err)
	}

	return TransactionEntityToModel(entity), nil
}

func (t *TransactionsStore) List(ctx context.Context, spaceID space.ID) ([]*finance.Transaction, error) {
	transctions := make([]*finance.Transaction, 0, 50)

	err := ListTransactions(ctx, t.db, &ListTransactionsParams{
		SpaceId: spaceID.String(),
	}, func(e *TransactionEntity) error {
		transctions = append(transctions, TransactionEntityToModel(e))
		return nil
	})

	if err != nil {
		return nil, fmt.Errorf("cannot list transactions: %w", err)
	}

	return transctions, nil
}

func (t *TransactionsStore) Store(ctx context.Context, tr *finance.Transaction) error {
	entity, err := UpsertTransaction(ctx, t.db, TransactionEntityFromModel(tr))
	if err != nil {
		return fmt.Errorf("cannot store transaction: %w", err)
	}

	// Update the input model with any changes from the database.
	*tr = *TransactionEntityToModel(entity)
	return nil
}

func (t *TransactionsStore) Delete(ctx context.Context, key finance.TransactionKey) error {
	result, err := DeleteTransactionByID(ctx, t.db, &DeleteTransactionByIDParams{
		Id:      key.ID.String(),
		SpaceId: key.SpaceID.String(),
	})
	if err != nil {
		return fmt.Errorf("cannot delete transaction by id: %w", err)
	}

	affected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("cannot get affected rows for delete transaction: %w", err)
	}

	if affected == 0 {
		return fmt.Errorf("transaction not found")
	}

	return nil
}

func (t *TransactionsStore) ExistsBy(ctx context.Context, criteria finance.TransactionCriteria) (bool, error) {
	var exists bool
	var err error

	switch v := criteria.(type) {
	case *finance.ByBudgetID:
		exists, err = ExistsTransactionByBudget(ctx, t.db, &ExistsTransactionByBudgetParams{
			SpaceId:  v.SpaceID.String(),
			BudgetId: ptr.Of(v.ID.String()),
		})
	default:
		return false, fmt.Errorf("criteria %T is not supported for exists method", criteria)
	}

	if err != nil {
		return false, fmt.Errorf("cannot check existence of transaction: %w", err)
	}

	return exists, nil
}

func TransactionEntityToModel(e *TransactionEntity) *finance.Transaction {
	if e == nil {
		return nil
	}

	return &finance.Transaction{
		// ID:             finance.TransactionID(e.Id),
		TransactionKey: finance.TransactionKey{
			ID:      finance.TransactionID(e.Id),
			SpaceID: space.ID(e.SpaceId),
		},
		Type:           finance.TransactionType(e.Type),
		BudgetID:       (*finance.BudgetID)(e.BudgetId),
		BudgetPeriodID: (*finance.BudgetPeriodID)(e.BudgetPeriodId),
		Title:          e.Title,
		Description:    ptr.Value(e.Description),
		Date:           e.Date,
		EffectiveDate:  e.EffectiveDate,
		Amount: money.NewMoney(
			money.CurrencyCode(e.AmountCurrency),
			money.Cents(e.AmountCents),
		),
		BaseAmount: money.NewMoney(
			money.CurrencyCode(e.BaseAmountCurrency),
			money.Cents(e.BaseAmountCents),
		),
		ExchangeRate: e.ExchangeRate,
		CreateTime:   e.CreateTime,
		CreateBy:     auth.UserID(e.CreateBy),
		UpdateTime:   e.UpdateTime,
		UpdateBy:     auth.UserID(e.UpdateBy),
	}
}

func TransactionEntityFromModel(t *finance.Transaction) *TransactionEntity {
	entity := &TransactionEntity{
		Id:                 t.ID.String(),
		SpaceId:            t.SpaceID.String(),
		Type:               t.Type.String(),
		Title:              t.Title,
		Description:        ptr.OfNonZero(t.Description),
		Date:               t.Date,
		EffectiveDate:      t.EffectiveDate,
		AmountCents:        t.Amount.Cents.Int64(),
		AmountCurrency:     t.Amount.Currency.String(),
		BaseAmountCents:    t.BaseAmount.Cents.Int64(),
		BaseAmountCurrency: t.BaseAmount.Currency.String(),
		ExchangeRate:       t.ExchangeRate,
		CreateTime:         t.CreateTime,
		CreateBy:           t.CreateBy.String(),
		UpdateTime:         t.UpdateTime,
		UpdateBy:           t.UpdateBy.String(),
	}

	if t.BudgetID != nil {
		entity.BudgetId = ptr.Of(t.BudgetID.String())
	}

	if t.BudgetPeriodID != nil {
		entity.BudgetPeriodId = ptr.Of(t.BudgetPeriodID.String())
	}

	return entity
}
