package storage

import (
	"context"
	"database/sql"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jmoiron/sqlx"
	"github.com/masterkeysrd/saturn/internal/domain/finance"
)

type exchangeRateDB struct {
	SpaceID      string    `db:"space_id"`
	FromCurrency string    `db:"from_currency"`
	ToCurrency   string    `db:"to_currency"`
	Rate         float64   `db:"rate"`
	RateDate     time.Time `db:"rate_date"`
	CreateTime   time.Time `db:"create_time"`
}

type ExchangeRateStore struct {
	db *sqlx.DB
}

func NewExchangeRateStore(db *sqlx.DB) *ExchangeRateStore {
	return &ExchangeRateStore{db: db}
}

func (s *ExchangeRateStore) Create(ctx context.Context, r *finance.ExchangeRate) error {
	query := `INSERT INTO finance.exchange_rate (space_id, from_currency, to_currency, rate, rate_date, create_time)
		VALUES ($1, $2, $3, $4, $5, NOW())`
	_, err := s.db.ExecContext(ctx, query, string(r.SpaceID), r.FromCurrency, r.ToCurrency, r.Rate, r.RateDate)
	return err
}

func (s *ExchangeRateStore) GetRate(ctx context.Context, key finance.ExchangeRateKey) (*finance.ExchangeRate, error) {
	var row exchangeRateDB
	// Lookup the rate on the closest date <= target date.
	q := `SELECT * FROM finance.exchange_rate 
		WHERE space_id = $1 AND from_currency = $2 AND to_currency = $3 AND rate_date <= $4 
		ORDER BY rate_date DESC LIMIT 1`
	if err := s.db.GetContext(ctx, &row, q, string(key.SpaceID), string(key.FromCurrency), string(key.ToCurrency), key.RateDate.Format("2006-01-02")); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, finance.ErrExchangeRateNotFound
		}
		return nil, err
	}
	return &finance.ExchangeRate{
		SpaceID:      finance.SpaceID(row.SpaceID),
		FromCurrency: finance.Currency(row.FromCurrency),
		ToCurrency:   finance.Currency(row.ToCurrency),
		Rate:         row.Rate,
		RateDate:     row.RateDate,
		CreateTime:   row.CreateTime,
	}, nil
}

func (s *ExchangeRateStore) ListBySpace(ctx context.Context, spaceID finance.SpaceID, filter *finance.ListExchangeRatesFilter) ([]*finance.ExchangeRate, string, error) {
	var rows []exchangeRateDB
	var err error

	limit := filter.PageSize
	if limit <= 0 {
		limit = 100
	}

	var query string
	var args []interface{}

	if filter.NextPageToken != "" {
		decoded, err := base64.URLEncoding.DecodeString(filter.NextPageToken)
		if err != nil {
			return nil, "", errors.New("invalid page token")
		}
		parts := strings.Split(string(decoded), ":")
		if len(parts) == 3 {
			query = `SELECT * FROM finance.exchange_rate 
				WHERE space_id = $1 AND (from_currency, to_currency, rate_date) > ($2, $3, $4)
				ORDER BY from_currency ASC, to_currency ASC, rate_date ASC
				LIMIT $5`
			args = []interface{}{string(spaceID), parts[0], parts[1], parts[2], limit + 1}
		} else {
			return nil, "", errors.New("invalid page token")
		}
	} else {
		query = `SELECT * FROM finance.exchange_rate 
			WHERE space_id = $1
			ORDER BY from_currency ASC, to_currency ASC, rate_date ASC
			LIMIT $2`
		args = []interface{}{string(spaceID), limit + 1}
	}

	if err = s.db.SelectContext(ctx, &rows, query, args...); err != nil {
		return nil, "", err
	}

	hasMore := len(rows) > int(limit)
	if hasMore {
		rows = rows[:limit]
	}

	rates := make([]*finance.ExchangeRate, 0, len(rows))
	for i := range rows {
		rates = append(rates, &finance.ExchangeRate{
			SpaceID:      finance.SpaceID(rows[i].SpaceID),
			FromCurrency: finance.Currency(rows[i].FromCurrency),
			ToCurrency:   finance.Currency(rows[i].ToCurrency),
			Rate:         rows[i].Rate,
			RateDate:     rows[i].RateDate,
			CreateTime:   rows[i].CreateTime,
		})
	}

	var nextToken string
	if hasMore && len(rows) > 0 {
		last := rows[len(rows)-1]
		tokenStr := fmt.Sprintf("%s:%s:%s", last.FromCurrency, last.ToCurrency, last.RateDate.Format("2006-01-02"))
		nextToken = base64.URLEncoding.EncodeToString([]byte(tokenStr))
	}

	return rates, nextToken, nil
}

func (s *ExchangeRateStore) Delete(ctx context.Context, key finance.ExchangeRateKey) error {
	q := `DELETE FROM finance.exchange_rate WHERE space_id = $1 AND from_currency = $2 AND to_currency = $3 AND rate_date = $4`
	_, err := s.db.ExecContext(ctx, q, string(key.SpaceID), string(key.FromCurrency), string(key.ToCurrency), key.RateDate.Format("2006-01-02"))
	return err
}
