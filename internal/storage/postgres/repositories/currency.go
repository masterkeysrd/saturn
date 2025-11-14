package pgrepositories

import (
	"context"
	"fmt"
	"time"

	"github.com/jmoiron/sqlx"
	"github.com/masterkeysrd/saturn/internal/domain/finance"
)

type Currency struct {
	db      *sqlx.DB
	queries CurrencyQueries
}

func NewCurrency(db *sqlx.DB) *Currency {
	return &Currency{
		db:      db,
		queries: CurrencyQueries{},
	}
}

func (c *Currency) Get(ctx context.Context, code finance.CurrencyCode) (*finance.Currency, error) {
	query := c.queries.Get()

	var entity CurrencyEntity
	rows, err := c.db.NamedQueryContext(ctx, query, CurrencyEntity{Code: code})
	if err != nil {
		return nil, fmt.Errorf("cannot execute Get currency query: %w", err)
	}
	defer rows.Close()

	if rows.Next() {
		if err := rows.StructScan(&entity); err != nil {
			return nil, fmt.Errorf("cannot scan currency: %w", err)
		}
		return &finance.Currency{
			Code:      entity.Code,
			Name:      entity.Name,
			Rate:      entity.Rate,
			CreatedAt: entity.CreatedAt,
			UpdatedAt: entity.UpdatedAt,
		}, nil
	}

	return nil, fmt.Errorf("currency not found")
}

// List retrieves all currencies from the database.
func (c *Currency) List(ctx context.Context) ([]*finance.Currency, error) {
	query := c.queries.List()

	var entities []CurrencyEntity
	if err := c.db.SelectContext(ctx, &entities, query); err != nil {
		return nil, fmt.Errorf("cannot execute List currencies query: %w", err)
	}

	result := make([]*finance.Currency, 0, len(entities))
	for _, entity := range entities {
		result = append(result, &finance.Currency{
			Code:      entity.Code,
			Name:      entity.Name,
			Rate:      entity.Rate,
			CreatedAt: entity.CreatedAt,
			UpdatedAt: entity.UpdatedAt,
		})
	}
	return result, nil
}

// Store inserts or updates a currency in the database.
func (c *Currency) Store(ctx context.Context, currency *finance.Currency) error {
	query := c.queries.Store()

	entity := CurrencyEntity{
		Code:      currency.Code,
		Name:      currency.Name,
		Rate:      currency.Rate,
		CreatedAt: currency.CreatedAt,
		UpdatedAt: currency.UpdatedAt,
	}

	_, err := c.db.NamedExecContext(ctx, query, entity)
	if err != nil {
		return fmt.Errorf("cannot store currency: %w", err)
	}
	return nil
}

type CurrencyQueries struct{}

func (c CurrencyQueries) Get() string {
	return `
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
}

func (c CurrencyQueries) List() string {
	return `
	SELECT
		code,
		rate,
		name,
		created_at,
		updated_at
	FROM
		currencies`
}

func (c CurrencyQueries) Store() string {
	return `
	INSERT INTO currencies (code, name, rate, created_at, updated_at)
	VALUES (:code, :name, :rate, :created_at, :updated_at)
	ON CONFLICT (code) DO UPDATE
	SET 
		name = EXCLUDED.name,
		rate = EXCLUDED.rate,
		updated_at = EXCLUDED.updated_at`
}

type CurrencyEntity struct {
	Code      finance.CurrencyCode `db:"code"`
	Name      string               `db:"name"`
	Rate      float64              `db:"rate"`
	CreatedAt time.Time            `db:"created_at"`
	UpdatedAt time.Time            `db:"updated_at"`
}
