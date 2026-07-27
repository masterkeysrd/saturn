package storage

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/doug-martin/goqu/v9"
	_ "github.com/doug-martin/goqu/v9/dialect/postgres"
	"github.com/jmoiron/sqlx"
	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/platform/paging"
)

type exchangeRateDB struct {
	SpaceID      string    `db:"space_id"`
	FromCurrency string    `db:"from_currency"`
	ToCurrency   string    `db:"to_currency"`
	Rate         float64   `db:"rate"`
	RateDate     time.Time `db:"rate_date"`
	CreateTime   time.Time `db:"create_time"`
}

func (row *exchangeRateDB) toDomain() *finance.ExchangeRate {
	r := &finance.ExchangeRate{
		SpaceID:      finance.SpaceID(row.SpaceID),
		FromCurrency: finance.Currency(row.FromCurrency),
		ToCurrency:   finance.Currency(row.ToCurrency),
		Rate:         row.Rate,
		RateDate:     row.RateDate,
		CreateTime:   row.CreateTime,
	}
	r.ID = r.ComputeID()
	return r
}

type ExchangeRateStore struct {
	db *sqlx.DB
}

func NewExchangeRateStore(db *sqlx.DB) *ExchangeRateStore {
	return &ExchangeRateStore{db: db}
}

func (s *ExchangeRateStore) Create(ctx context.Context, r *finance.ExchangeRate) error {
	ds := pgDialect.Insert(goqu.S("finance").Table("exchange_rate")).
		Rows(goqu.Record{
			"space_id":      string(r.SpaceID),
			"from_currency": string(r.FromCurrency),
			"to_currency":   string(r.ToCurrency),
			"rate":          r.Rate,
			"rate_date":     r.RateDate.Format("2006-01-02"),
			"create_time":   goqu.L("NOW()"),
		}).
		OnConflict(goqu.DoUpdate("space_id, from_currency, to_currency, rate_date", goqu.Record{
			"rate": goqu.L("EXCLUDED.rate"),
		}))

	query, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return fmt.Errorf("build sql query: %w", err)
	}

	_, err = s.db.ExecContext(ctx, query, args...)
	return err
}

func (s *ExchangeRateStore) Update(ctx context.Context, r *finance.ExchangeRate) error {
	ds := pgDialect.Update(goqu.S("finance").Table("exchange_rate")).
		Set(goqu.Record{"rate": r.Rate}).
		Where(goqu.Ex{
			"space_id":      string(r.SpaceID),
			"from_currency": string(r.FromCurrency),
			"to_currency":   string(r.ToCurrency),
			"rate_date":     r.RateDate.Format("2006-01-02"),
		})

	query, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return fmt.Errorf("build sql query: %w", err)
	}

	res, err := s.db.ExecContext(ctx, query, args...)
	if err != nil {
		return err
	}
	rows, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return finance.ErrExchangeRateNotFound
	}
	return nil
}

func (s *ExchangeRateStore) GetRate(ctx context.Context, key finance.ExchangeRateKey) (*finance.ExchangeRate, error) {
	ds := pgDialect.From(goqu.S("finance").Table("exchange_rate")).
		Select("*").
		Where(goqu.Ex{
			"space_id":      string(key.SpaceID),
			"from_currency": string(key.FromCurrency),
			"to_currency":   string(key.ToCurrency),
		}, goqu.I("rate_date").Lte(key.RateDate.Format("2006-01-02"))).
		Order(goqu.I("rate_date").Desc()).
		Limit(1)

	query, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return nil, fmt.Errorf("build sql query: %w", err)
	}

	var row exchangeRateDB
	if err := s.db.GetContext(ctx, &row, query, args...); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, finance.ErrExchangeRateNotFound
		}
		return nil, err
	}
	return row.toDomain(), nil
}

func (s *ExchangeRateStore) GetExactRate(ctx context.Context, key finance.ExchangeRateKey) (*finance.ExchangeRate, error) {
	ds := pgDialect.From(goqu.S("finance").Table("exchange_rate")).
		Select("*").
		Where(goqu.Ex{
			"space_id":      string(key.SpaceID),
			"from_currency": string(key.FromCurrency),
			"to_currency":   string(key.ToCurrency),
			"rate_date":     key.RateDate.Format("2006-01-02"),
		}).
		Limit(1)

	query, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return nil, fmt.Errorf("build sql query: %w", err)
	}

	var row exchangeRateDB
	if err := s.db.GetContext(ctx, &row, query, args...); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, finance.ErrExchangeRateNotFound
		}
		return nil, err
	}
	return row.toDomain(), nil
}

func (s *ExchangeRateStore) GetNextRate(ctx context.Context, key finance.ExchangeRateKey) (*finance.ExchangeRate, error) {
	ds := pgDialect.From(goqu.S("finance").Table("exchange_rate")).
		Select("*").
		Where(goqu.Ex{
			"space_id":      string(key.SpaceID),
			"from_currency": string(key.FromCurrency),
			"to_currency":   string(key.ToCurrency),
		}, goqu.I("rate_date").Gt(key.RateDate.Format("2006-01-02"))).
		Order(goqu.I("rate_date").Asc()).
		Limit(1)

	query, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return nil, fmt.Errorf("build sql query: %w", err)
	}

	var row exchangeRateDB
	if err := s.db.GetContext(ctx, &row, query, args...); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, finance.ErrExchangeRateNotFound
		}
		return nil, err
	}
	return row.toDomain(), nil
}

func (s *ExchangeRateStore) ListBySpace(ctx context.Context, spaceID finance.SpaceID, filter *finance.ListExchangeRatesFilter) ([]*finance.ExchangeRate, string, error) {
	if filter.PageSize <= 0 {
		filter.PageSize = 100
	}

	ds := pgDialect.From(goqu.S("finance").Table("exchange_rate")).
		Select("*").
		Where(goqu.Ex{"space_id": string(spaceID)})

	if filter.FromCurrency != nil {
		ds = ds.Where(goqu.Ex{"from_currency": string(*filter.FromCurrency)})
	}
	if filter.ToCurrency != nil {
		ds = ds.Where(goqu.Ex{"to_currency": string(*filter.ToCurrency)})
	}
	if filter.StartDate != nil {
		ds = ds.Where(goqu.I("rate_date").Gte(filter.StartDate.Format("2006-01-02")))
	}
	if filter.EndDate != nil {
		ds = ds.Where(goqu.I("rate_date").Lte(filter.EndDate.Format("2006-01-02")))
	}

	cursor, _ := paging.Decode(filter.NextPageToken)

	sortOrder := filter.Sort
	if !finance.IsExchangeRateSortField(sortOrder.Field) {
		sortOrder.Field = finance.DefaultExchangeRateSortField
	}

	ds = paging.ApplyPagination(ds, paging.Options{
		Sort:     sortOrder,
		Cursor:   cursor,
		PageSize: uint(filter.PageSize),
		IDColumn: "from_currency",
	})

	query, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return nil, "", fmt.Errorf("build sql query: %w", err)
	}

	var rows []exchangeRateDB
	if err := s.db.SelectContext(ctx, &rows, query, args...); err != nil {
		return nil, "", fmt.Errorf("select context: %w", err)
	}

	rates := make([]*finance.ExchangeRate, len(rows))
	for i := range rows {
		rates[i] = rows[i].toDomain()
	}

	page := paging.NewPage(rates, int(filter.PageSize), func(r *finance.ExchangeRate) paging.Cursor {
		return paging.Cursor{
			SortValue: r.GetSortValue(sortOrder.Field),
			ID:        r.ID,
		}
	})

	return page.Items, page.NextPageToken, nil
}

func (s *ExchangeRateStore) Delete(ctx context.Context, key finance.ExchangeRateKey) error {
	ds := pgDialect.Delete(goqu.S("finance").Table("exchange_rate")).
		Where(goqu.Ex{
			"space_id":      string(key.SpaceID),
			"from_currency": string(key.FromCurrency),
			"to_currency":   string(key.ToCurrency),
			"rate_date":     key.RateDate.Format("2006-01-02"),
		})

	query, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return fmt.Errorf("build sql query: %w", err)
	}

	res, err := s.db.ExecContext(ctx, query, args...)
	if err != nil {
		return err
	}
	rows, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return finance.ErrExchangeRateNotFound
	}
	return nil
}

func (s *ExchangeRateStore) GetLatestRates(ctx context.Context, spaceID finance.SpaceID, fromCurrencies []finance.Currency, toCurrency finance.Currency) ([]*finance.ExchangeRate, error) {
	if len(fromCurrencies) == 0 {
		return nil, nil
	}

	// Deduplicate currencies to query
	currencyMap := make(map[string]bool)
	var currencies []string
	for _, c := range fromCurrencies {
		cStr := string(c)
		if !currencyMap[cStr] && cStr != string(toCurrency) {
			currencyMap[cStr] = true
			currencies = append(currencies, cStr)
		}
	}

	if len(currencies) == 0 {
		return nil, nil
	}

	query := `
		SELECT r.* 
		FROM finance.exchange_rate r
		INNER JOIN (
			SELECT space_id, from_currency, to_currency, MAX(rate_date) as max_date
			FROM finance.exchange_rate
			WHERE space_id = ? AND to_currency = ? AND from_currency IN (?)
			GROUP BY space_id, from_currency, to_currency
		) m ON r.space_id = m.space_id 
		   AND r.from_currency = m.from_currency 
		   AND r.to_currency = m.to_currency 
		   AND r.rate_date = m.max_date
	`

	query, args, err := sqlx.In(query, string(spaceID), string(toCurrency), currencies)
	if err != nil {
		return nil, err
	}

	query = s.db.Rebind(query)

	var rows []exchangeRateDB
	if err := s.db.SelectContext(ctx, &rows, query, args...); err != nil {
		return nil, err
	}

	rates := make([]*finance.ExchangeRate, len(rows))
	for i := range rows {
		rates[i] = rows[i].toDomain()
	}

	return rates, nil
}
