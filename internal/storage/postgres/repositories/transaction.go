package pgrepositories

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/jmoiron/sqlx"
	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/pkg/money"
	"github.com/masterkeysrd/saturn/internal/pkg/ptr"
)

var _ finance.TransactionStore = (*Transactions)(nil)

type Transactions struct {
	db      *sqlx.DB
	queries *TransactionQueries
}

func NewTransactions(db *sqlx.DB) (*Transactions, error) {
	queries, err := NewTransactionQueries(db)
	if err != nil {
		return nil, fmt.Errorf("cannot initialize transaction queries: %w", err)
	}

	return &Transactions{
		db:      db,
		queries: queries,
	}, nil
}

func (t *Transactions) Get(ctx context.Context, id finance.TransactionID) (*finance.Transaction, error) {
	row := t.queries.Get(ctx, id)
	if err := row.Err(); err != nil {
		return nil, fmt.Errorf("cannot execute Get transaction query: %w", err)
	}

	var entity TransactionEntity
	if err := row.StructScan(&entity); err != nil {
		return nil, fmt.Errorf("cannot scan transaction: %w", err)
	}

	return TransactionEntityToModel(&entity), nil
}

func (t *Transactions) List(ctx context.Context) ([]*finance.Transaction, error) {
	rows, err := t.queries.List(ctx)
	if err != nil {
		return nil, fmt.Errorf("cannot execute list transactions: %w", err)
	}
	defer rows.Close()

	entities := []*finance.Transaction{}
	for rows.Next() {
		var entity TransactionEntity
		if err := rows.StructScan(&entity); err != nil {
			return nil, fmt.Errorf("cannot scan transaction: %w", err)
		}
		entities = append(entities, TransactionEntityToModel(&entity))
	}

	return entities, nil
}

func (t *Transactions) Store(ctx context.Context, tr *finance.Transaction) error {
	_, err := t.queries.Store(ctx, TransactionEntityFromModel(tr))
	if err != nil {
		return fmt.Errorf("cannot store transaction: %w", err)
	}
	return nil
}

func (t *Transactions) Delete(ctx context.Context, tid finance.TransactionID) error {
	result, err := t.queries.Delete(ctx, tid)
	if err != nil {
		return fmt.Errorf("cannot delete transaction: %w", err)
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

const (
	getTransactionQuery = `
SELECT
	id,
	type,
	budget_id,
	name,
	description,
	date,
	amount_cents,
	amount_currency,
	base_amount_cents,
	base_amount_currency,
	exchange_rate,
	created_at,
	updated_at
FROM transactions
WHERE id = :id`

	listTransactionsQuery = `
SELECT
	id,
	type,
	budget_id,
	name,
	description,
	date,
	amount_cents,
	amount_currency,
	base_amount_cents,
	base_amount_currency,
	exchange_rate,
	created_at,
	updated_at
FROM transactions
ORDER BY date desc, created_at
`

	upsertTransactionQuery = `
INSERT INTO transactions (
	id,
	type,
	budget_id,
	name,
	description,
	date,
	amount_cents,
	amount_currency,
	base_amount_cents,
	base_amount_currency,
	exchange_rate,
	created_at,
	updated_at
)
VALUES (
	:id,
	:type,
	:budget_id,
	:name,
	:description,
	:date,
	:amount_cents,
	:amount_currency,
	:base_amount_cents,
	:base_amount_currency,
	:exchange_rate,
	:created_at,
	:updated_at
)
ON CONFLICT (id) DO UPDATE SET
	budget_id = EXCLUDED.budget_id,
	name = EXCLUDED.name,
	description = EXCLUDED.description,
	date = EXCLUDED.date,
	amount_cents = EXCLUDED.amount_cents,
	amount_currency = EXCLUDED.amount_currency,
	base_amount_cents = EXCLUDED.base_amount_cents,
	base_amount_currency = EXCLUDED.base_amount_currency,
	exchange_rate = EXCLUDED.exchange_rate,
	updated_at = EXCLUDED.updated_at`

	deleteTransactionQuery = `
DELETE FROM transactions
 WHERE id = :id`
)

type TransactionQueries struct {
	getStmt    *sqlx.NamedStmt
	listStmt   *sqlx.Stmt
	upsertStmt *sqlx.NamedStmt
	deleteStmt *sqlx.NamedStmt
}

func NewTransactionQueries(db *sqlx.DB) (*TransactionQueries, error) {
	getStmt, err := db.PrepareNamed(getTransactionQuery)
	if err != nil {
		return nil, fmt.Errorf("cannot prepare get transaction query: %w", err)
	}

	listStmt, err := db.Preparex(listTransactionsQuery)
	if err != nil {
		return nil, fmt.Errorf("cannot prepare get transaction query: %w", err)
	}

	upsertStmt, err := db.PrepareNamed(upsertTransactionQuery)
	if err != nil {
		return nil, fmt.Errorf("cannot prepare upsert transaction query: %w", err)
	}

	deleteStmt, err := db.PrepareNamed(deleteTransactionQuery)
	if err != nil {
		return nil, fmt.Errorf("cannot prepare upsert transaction query: %w", err)
	}

	return &TransactionQueries{
		getStmt:    getStmt,
		upsertStmt: upsertStmt,
		listStmt:   listStmt,
		deleteStmt: deleteStmt,
	}, nil
}

func (q *TransactionQueries) Get(ctx context.Context, tid finance.TransactionID) *sqlx.Row {
	return q.getStmt.QueryRowxContext(ctx, map[string]any{"id": tid})
}

func (q *TransactionQueries) List(ctx context.Context) (*sqlx.Rows, error) {
	return q.listStmt.QueryxContext(ctx)
}

func (q *TransactionQueries) Store(ctx context.Context, e *TransactionEntity) (sql.Result, error) {
	return q.upsertStmt.ExecContext(ctx, e)
}

func (q *TransactionQueries) Delete(ctx context.Context, tid finance.TransactionID) (sql.Result, error) {
	return q.deleteStmt.ExecContext(ctx, map[string]any{"id": tid})
}

type TransactionEntity struct {
	ID                 finance.TransactionID   `db:"id"`
	Type               finance.TransactionType `db:"type"`
	BudgetID           *finance.BudgetID       `db:"budget_id"`
	Name               string                  `db:"name"`
	Description        *string                 `db:"description"`
	Date               time.Time               `db:"date"`
	AmountCents        money.Cents             `db:"amount_cents"`
	AmountCurrency     finance.CurrencyCode    `db:"amount_currency"`
	BaseAmountCents    money.Cents             `db:"base_amount_cents"`
	BaseAmountCurrency finance.CurrencyCode    `db:"base_amount_currency"`
	ExchangeRate       float64                 `db:"exchange_rate"`
	CreatedAt          time.Time               `db:"created_at"`
	UpdatedAt          time.Time               `db:"updated_at"`
}

func TransactionEntityToModel(e *TransactionEntity) *finance.Transaction {
	if e == nil {
		return nil
	}

	return &finance.Transaction{
		ID:          e.ID,
		Type:        e.Type,
		BudgetID:    ptr.Value(e.BudgetID),
		Name:        e.Name,
		Description: ptr.Value(e.Description),
		Date:        e.Date,
		Amount: money.NewMoney(
			e.AmountCurrency,
			e.AmountCents,
		),
		BaseAmount: money.NewMoney(
			e.BaseAmountCurrency,
			e.BaseAmountCents,
		),
		ExchangeRate: e.ExchangeRate,
		CreatedAt:    e.CreatedAt,
		UpdatedAt:    e.UpdatedAt,
	}
}

func TransactionEntityFromModel(t *finance.Transaction) *TransactionEntity {
	return &TransactionEntity{
		ID:                 t.ID,
		Type:               t.Type,
		BudgetID:           ptr.OfNonZero(t.BudgetID),
		Name:               t.Name,
		Description:        ptr.OfNonZero(t.Description),
		Date:               t.Date,
		AmountCents:        t.Amount.Cents,
		AmountCurrency:     t.Amount.Currency,
		BaseAmountCents:    t.BaseAmount.Cents,
		BaseAmountCurrency: t.BaseAmount.Currency,
		ExchangeRate:       t.ExchangeRate,
		CreatedAt:          t.CreatedAt,
		UpdatedAt:          t.UpdatedAt,
	}
}
