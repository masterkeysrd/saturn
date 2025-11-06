package pgrepositories

import (
	"context"
	"fmt"
	"time"

	"github.com/jmoiron/sqlx"
	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/pkg/money"
)

type Budget struct {
	db      *sqlx.DB
	queries BudgetQueries
}

func NewBudget(db *sqlx.DB) *Budget {
	return &Budget{
		db: db,
	}
}

func (b *Budget) Store(ctx context.Context, budget *finance.Budget) error {
	entity := BudgetEntityFromModel(budget)
	query := b.queries.Upsert(entity)

	_, err := b.db.NamedExecContext(ctx, query, &entity)
	if err != nil {
		return fmt.Errorf("cannot store budget: %w", err)
	}

	return nil
}

func (b *Budget) List(ctx context.Context) ([]*finance.Budget, error) {
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

type BudgetQueries struct{}

func (q BudgetQueries) Upsert(e *BudgetEntity) string {
	return `
	INSERT INTO budgets (id, name, amount, created_at, updated_at)
	VALUES (:id, :name, :amount, :created_at, :updated_at)
	ON CONFLICT (id) DO UPDATE
	SET name = EXCLUDED.name,
    	amount = EXCLUDED.amount,
    	updated_at = EXCLUDED.updated_at;
	`
}

func (q BudgetQueries) List() string {
	return `
	SELECT 
		id, 
		name, 
		amount,
		created_at,
		updated_at
	FROM 
		budgets
	ORDER BY
		created_at DESC
	`
}

type BudgetEntity struct {
	ID        string    `db:"id"`
	Name      string    `db:"name"`
	Amount    int64     `db:"amount"`
	CreatedAt time.Time `db:"created_at"`
	UpdatedAt time.Time `db:"updated_at"`
}

func BudgetEntityFromModel(b *finance.Budget) *BudgetEntity {
	return &BudgetEntity{
		ID:        b.ID.String(),
		Name:      b.Name,
		Amount:    b.Amount.Int64(),
		CreatedAt: b.CreatedAt,
		UpdatedAt: b.UpdatedAt,
	}
}

func BudgetEntityToModel(e *BudgetEntity) *finance.Budget {
	return &finance.Budget{
		ID:        finance.BudgetID(e.ID),
		Name:      e.Name,
		Amount:    money.Cent(e.Amount),
		CreatedAt: e.CreatedAt,
		UpdatedAt: e.UpdatedAt,
	}
}
