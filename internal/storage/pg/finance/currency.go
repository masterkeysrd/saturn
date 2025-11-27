package financepg

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/jmoiron/sqlx"
	"github.com/masterkeysrd/saturn/internal/domain/finance"
)

type CurrencyStore struct {
	db      *sqlx.DB
	queries *CurrencyQueries
}

func NewCurrencyStore(db *sqlx.DB) (*CurrencyStore, error) {
	queries, err := NewCurrencyQueries(db)
	if err != nil {
		return nil, fmt.Errorf("cannot initialize currency queries: %w", err)
	}

	return &CurrencyStore{
		db:      db,
		queries: queries,
	}, nil
}

func (c *CurrencyStore) Get(ctx context.Context, code finance.CurrencyCode) (*finance.Currency, error) {
	row := c.queries.Get(ctx, code)
	if err := row.Err(); err != nil {
		return nil, fmt.Errorf("cannot execute Get currency query: %w", err)
	}

	var entity CurrencyEntity
	if err := row.StructScan(&entity); err != nil {
		return nil, fmt.Errorf("cannot scan currency: %w", err)
	}

	return CurrencyEntityToModel(&entity), nil
}

// List retrieves all currencies from the database.
func (c *CurrencyStore) List(ctx context.Context) ([]*finance.Currency, error) {
	rows, err := c.queries.List(ctx)
	if err != nil {
		return nil, fmt.Errorf("cannot execute list currencies query: %w", err)
	}
	defer rows.Close()

	entities := make([]*finance.Currency, 0, 50) // TODO: Change this when implement pagination.
	for rows.Next() {
		var entity CurrencyEntity
		if err := rows.StructScan(&entity); err != nil {
			return nil, fmt.Errorf("cannot scan currency: %w", err)
		}
		entities = append(entities, CurrencyEntityToModel(&entity))
	}

	return entities, nil
}

// Store inserts or updates a currency in the database.
func (c *CurrencyStore) Store(ctx context.Context, currency *finance.Currency) error {
	_, err := c.queries.Store(ctx, CurrencyEntityFromModel(currency))
	if err != nil {
		return fmt.Errorf("cannot store currency: %w", err)
	}

	return nil
}

const (
	getCurrencyQuery = `
	SELECT
		code,
		name,
		rate,
		created_at,
		updated_at
	FROM
		currencies
	WHERE
		code = :code`

	listCurrenciesQuery = `
	SELECT
		code,
		rate,
		name,
		created_at,
		updated_at
	FROM
		currencies`

	upsertCurrencyQuery = `
	INSERT INTO currencies (
		code, 
		name,
		rate,
		created_at,
		updated_at
	)
	VALUES (
		:code,
		:name,
		:rate,
		:created_at,
		:updated_at
	)
	ON CONFLICT (code) DO UPDATE
	SET 
		name = EXCLUDED.name,
		rate = EXCLUDED.rate,
		updated_at = EXCLUDED.updated_at`
)

// CurrencyQueries hold queries to the currencies table.
//
// TODO: Implement closing of statements.
type CurrencyQueries struct {
	getStmt    *sqlx.NamedStmt
	listStmt   *sqlx.Stmt
	upsertStmt *sqlx.NamedStmt
}

func NewCurrencyQueries(db *sqlx.DB) (*CurrencyQueries, error) {
	getStmt, err := db.PrepareNamed(getCurrencyQuery)
	if err != nil {
		return nil, fmt.Errorf("cannot prepare get query: %w", err)
	}

	listStmt, err := db.Preparex(listCurrenciesQuery)
	if err != nil {
		return nil, fmt.Errorf("cannot prepare list query: %w", err)
	}

	upsertStmt, err := db.PrepareNamed(upsertCurrencyQuery)
	if err != nil {
		return nil, fmt.Errorf("cannot prepare upsert query: %w", err)
	}

	return &CurrencyQueries{
		getStmt:    getStmt,
		listStmt:   listStmt,
		upsertStmt: upsertStmt,
	}, nil
}

func (c *CurrencyQueries) Get(ctx context.Context, code finance.CurrencyCode) *sqlx.Row {
	return c.getStmt.QueryRowxContext(ctx, CurrencyEntity{Code: code})
}

func (c CurrencyQueries) List(ctx context.Context) (*sqlx.Rows, error) {
	return c.listStmt.QueryxContext(ctx)
}

func (c CurrencyQueries) Store(ctx context.Context, e *CurrencyEntity) (sql.Result, error) {
	return c.upsertStmt.ExecContext(ctx, e)
}

type CurrencyEntity struct {
	Code      finance.CurrencyCode `db:"code"`
	Name      string               `db:"name"`
	Rate      float64              `db:"rate"`
	CreatedAt time.Time            `db:"created_at"`
	UpdatedAt time.Time            `db:"updated_at"`
}

func CurrencyEntityToModel(e *CurrencyEntity) *finance.Currency {
	if e == nil {
		return nil
	}

	return &finance.Currency{
		Code:      e.Code,
		Name:      e.Name,
		Rate:      e.Rate,
		CreatedAt: e.CreatedAt,
		UpdatedAt: e.UpdatedAt,
	}
}

func CurrencyEntityFromModel(c *finance.Currency) *CurrencyEntity {
	return &CurrencyEntity{
		Code:      c.Code,
		Name:      c.Name,
		Rate:      c.Rate,
		CreatedAt: c.CreatedAt,
		UpdatedAt: c.UpdatedAt,
	}
}
