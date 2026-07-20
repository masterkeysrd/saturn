package storage

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/jmoiron/sqlx"
	"github.com/masterkeysrd/saturn/internal/domain/finance"
)

type periodDB struct {
	ID                 string       `db:"id"`
	BudgetID           string       `db:"budget_id"`
	SpaceID            string       `db:"space_id"`
	StartDate          time.Time    `db:"start_date"`
	EndDate            time.Time    `db:"end_date"`
	LimitAmount        int64        `db:"limit_amount"`
	Currency           string       `db:"currency"`
	BaseCurrency       string       `db:"base_currency"`
	ExchangeRateToBase float64      `db:"exchange_rate_to_base"`
	CreateTime         sql.NullTime `db:"create_time"`
	UpdateTime         sql.NullTime `db:"update_time"`
}

type PeriodStore struct {
	db *sqlx.DB
}

func NewPeriodStore(db *sqlx.DB) *PeriodStore {
	return &PeriodStore{db: db}
}

func (s *PeriodStore) Create(ctx context.Context, p *finance.BudgetPeriod) error {
	query := `INSERT INTO finance.budget_period (id, budget_id, space_id, start_date, end_date, limit_amount, currency, base_currency, exchange_rate_to_base, create_time, update_time)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`
	_, err := s.db.ExecContext(ctx, query, string(p.ID), string(p.BudgetID), string(p.SpaceID), p.StartDate, p.EndDate, p.LimitAmount, p.Currency, p.BaseCurrency, p.ExchangeRateToBase, p.CreateTime, p.UpdateTime)
	return err
}

func (s *PeriodStore) GetByRange(ctx context.Context, budgetID finance.BudgetID, startDate, endDate time.Time) (*finance.BudgetPeriod, error) {
	var row periodDB
	query := `SELECT * FROM finance.budget_period WHERE budget_id = $1 AND start_date = $2 AND end_date = $3`
	if err := s.db.GetContext(ctx, &row, query, string(budgetID), startDate, endDate); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, finance.ErrPeriodNotFound
		}
		return nil, err
	}
	return &finance.BudgetPeriod{
		ID:                 finance.PeriodID(row.ID),
		BudgetID:           finance.BudgetID(row.BudgetID),
		SpaceID:            finance.SpaceID(row.SpaceID),
		StartDate:          row.StartDate,
		EndDate:            row.EndDate,
		LimitAmount:        row.LimitAmount,
		Currency:           finance.Currency(row.Currency),
		BaseCurrency:       finance.Currency(row.BaseCurrency),
		ExchangeRateToBase: row.ExchangeRateToBase,
		CreateTime:         nullTimeToTime(row.CreateTime),
		UpdateTime:         nullTimeToTime(row.UpdateTime),
	}, nil
}

func (s *PeriodStore) UpdateLimit(ctx context.Context, id finance.PeriodID, limit int64) error {
	query := `UPDATE finance.budget_period SET limit_amount = $1, update_time = NOW() WHERE id = $2`
	res, err := s.db.ExecContext(ctx, query, limit, string(id))
	if err != nil {
		return err
	}
	rows, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return finance.ErrPeriodNotFound
	}
	return nil
}

func (s *PeriodStore) ListByBudget(ctx context.Context, budgetID finance.BudgetID) ([]*finance.BudgetPeriod, error) {
	var rows []periodDB
	query := `SELECT * FROM finance.budget_period WHERE budget_id = $1 ORDER BY start_date DESC`
	if err := s.db.SelectContext(ctx, &rows, query, string(budgetID)); err != nil {
		return nil, err
	}

	periods := make([]*finance.BudgetPeriod, 0, len(rows))
	for i := range rows {
		periods = append(periods, &finance.BudgetPeriod{
			ID:                 finance.PeriodID(rows[i].ID),
			BudgetID:           finance.BudgetID(rows[i].BudgetID),
			SpaceID:            finance.SpaceID(rows[i].SpaceID),
			StartDate:          rows[i].StartDate,
			EndDate:            rows[i].EndDate,
			LimitAmount:        rows[i].LimitAmount,
			Currency:           finance.Currency(rows[i].Currency),
			BaseCurrency:       finance.Currency(rows[i].BaseCurrency),
			ExchangeRateToBase: rows[i].ExchangeRateToBase,
			CreateTime:         nullTimeToTime(rows[i].CreateTime),
			UpdateTime:         nullTimeToTime(rows[i].UpdateTime),
		})
	}
	return periods, nil
}
