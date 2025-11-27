package financepg

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jmoiron/sqlx"
	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/pkg/money"
)

var _ finance.BudgetStore = (*BudgetStore)(nil)

type BudgetStore struct {
	db      *sqlx.DB
	queries BudgetQueries
}

func NewBudgetStore(db *sqlx.DB) *BudgetStore {
	return &BudgetStore{
		db: db,
	}
}

func (b *BudgetStore) Get(ctx context.Context, id finance.BudgetID) (*finance.Budget, error) {
	var entity BudgetEntity
	query := b.queries.Get()
	if err := b.db.GetContext(ctx, &entity, query, id); err != nil {
		return nil, fmt.Errorf("cannot list budgets: %w", err)
	}

	return BudgetEntityToModel(&entity), nil
}

func (b *BudgetStore) List(ctx context.Context) ([]*finance.Budget, error) {
	var entities []*BudgetEntity
	query := b.queries.List()
	if err := b.db.SelectContext(ctx, &entities, query); err != nil {
		return nil, fmt.Errorf("cannot list budgets: %w", err)
	}

	budgets := make([]*finance.Budget, 0, len(entities))
	for _, e := range entities {
		budgets = append(budgets, BudgetEntityToModel(e))
	}

	return budgets, nil
}

func (b *BudgetStore) Store(ctx context.Context, budget *finance.Budget) error {
	entity := BudgetEntityFromModel(budget)
	query := b.queries.Upsert()

	_, err := b.db.NamedExecContext(ctx, query, &entity)
	if err != nil {
		return fmt.Errorf("cannot store budget: %w", err)
	}

	return nil
}

// Delete removes a single Budget record by its ID.
func (b *BudgetStore) Delete(ctx context.Context, id finance.BudgetID) error {
	query := b.queries.Delete()

	result, err := b.db.ExecContext(ctx, query, id)
	if err != nil {
		return fmt.Errorf("cannot delete budget: %w", err)
	}

	affected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("cannot get affected rows: %w", err)
	}

	if affected == 0 {
		return errors.New("budget not found")
	}

	return nil
}

type BudgetQueries struct{}

func (q BudgetQueries) Upsert() string {
	return `
	INSERT INTO budgets (id, name, currency, amount, created_at, updated_at)
	VALUES (:id, :name, :currency, :amount, :created_at, :updated_at)
	ON CONFLICT (id) DO UPDATE
	SET name = EXCLUDED.name,
    	amount = EXCLUDED.amount,
    	updated_at = EXCLUDED.updated_at;
	`
}

func (q BudgetQueries) Get() string {
	return `
	SELECT
		id,
		name,
		currency,
		amount,
		created_at,
		updated_at
	FROM
		budgets
	WHERE id = $1
	`
}

func (q BudgetQueries) List() string {
	return `
	SELECT 
		id, 
		name, 
		currency,
		amount,
		created_at,
		updated_at
	FROM 
		budgets
	ORDER BY
		created_at DESC
	`
}

// Delete returns the SQL query for deleting a budget by ID.
func (q BudgetQueries) Delete() string {
	return `
	DELETE FROM budgets
	WHERE id = $1
	`
}

type BudgetEntity struct {
	ID        string             `db:"id"`
	Name      string             `db:"name"`
	Amount    money.Cents        `db:"amount"`
	Currency  money.CurrencyCode `db:"currency"`
	CreatedAt time.Time          `db:"created_at"`
	UpdatedAt time.Time          `db:"updated_at"`
}

func BudgetEntityFromModel(b *finance.Budget) *BudgetEntity {
	return &BudgetEntity{
		ID:        b.ID.String(),
		Name:      b.Name,
		Currency:  b.Amount.Currency,
		Amount:    b.Amount.Cents,
		CreatedAt: b.CreatedAt,
		UpdatedAt: b.UpdatedAt,
	}
}

func BudgetEntityToModel(e *BudgetEntity) *finance.Budget {
	return &finance.Budget{
		ID:   finance.BudgetID(e.ID),
		Name: e.Name,
		Amount: money.Money{
			Currency: e.Currency,
			Cents:    e.Amount,
		},
		CreatedAt: e.CreatedAt,
		UpdatedAt: e.UpdatedAt,
	}
}
