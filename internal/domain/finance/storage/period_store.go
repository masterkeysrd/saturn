package storage

import (
	"context"
	"database/sql"
	"time"

	"github.com/doug-martin/goqu/v9"
	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/platform/db"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
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

func (row *periodDB) toDomain() *finance.BudgetPeriod {
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
	}
}

type PeriodStore struct {
	db db.DB
}

func NewPeriodStore(database db.DB) *PeriodStore {
	return &PeriodStore{db: database}
}

func (s *PeriodStore) Create(ctx context.Context, p *finance.BudgetPeriod) error {
	const op errors.Op = "domain/finance/storage.CreatePeriod"
	ds := pgDialect.Insert(goqu.S("finance").Table("budget_period")).Rows(goqu.Record{
		"id":                    string(p.ID),
		"budget_id":             string(p.BudgetID),
		"space_id":              string(p.SpaceID),
		"start_date":            p.StartDate,
		"end_date":              p.EndDate,
		"limit_amount":          p.LimitAmount,
		"currency":              string(p.Currency),
		"base_currency":         string(p.BaseCurrency),
		"exchange_rate_to_base": p.ExchangeRateToBase,
		"create_time":           p.CreateTime,
		"update_time":           p.UpdateTime,
	})
	query, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return errors.E(op, err)
	}
	if _, err := s.db.Exec(ctx, query, args...); err != nil {
		return errors.E(op, err)
	}
	return nil
}

func (s *PeriodStore) GetByRange(ctx context.Context, budgetID finance.BudgetID, startDate, endDate time.Time) (*finance.BudgetPeriod, error) {
	const op errors.Op = "domain/finance/storage.GetPeriodByRange"
	ds := pgDialect.From(goqu.S("finance").Table("budget_period")).
		Select("*").
		Where(goqu.Ex{
			"budget_id":  string(budgetID),
			"start_date": startDate,
			"end_date":   endDate,
		})
	query, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return nil, errors.E(op, err)
	}
	var row periodDB
	if err := s.db.Get(ctx, &row, query, args...); err != nil {
		return nil, errors.E(op, err)
	}
	return row.toDomain(), nil
}

func (s *PeriodStore) GetByRanges(ctx context.Context, keys []finance.PeriodRangeKey) ([]*finance.BudgetPeriod, error) {
	const op errors.Op = "domain/finance/storage.GetPeriodsByRanges"
	if len(keys) == 0 {
		return nil, nil
	}

	var orExprs []goqu.Expression
	for _, key := range keys {
		orExprs = append(orExprs, goqu.And(
			goqu.C("budget_id").Eq(string(key.BudgetID)),
			goqu.C("start_date").Eq(key.StartDate),
			goqu.C("end_date").Eq(key.EndDate),
		))
	}

	ds := pgDialect.From(goqu.S("finance").Table("budget_period")).
		Where(goqu.Or(orExprs...))
	sqlStr, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return nil, errors.E(op, err)
	}

	var dbRows []periodDB
	if err := s.db.Select(ctx, &dbRows, sqlStr, args...); err != nil {
		return nil, errors.E(op, err)
	}

	periods := make([]*finance.BudgetPeriod, len(dbRows))
	for i := range dbRows {
		periods[i] = dbRows[i].toDomain()
	}
	return periods, nil
}

func (s *PeriodStore) UpdateLimit(ctx context.Context, id finance.PeriodID, limit int64) error {
	const op errors.Op = "domain/finance/storage.UpdatePeriodLimit"
	ds := pgDialect.Update(goqu.S("finance").Table("budget_period")).
		Set(goqu.Record{
			"limit_amount": limit,
			"update_time":  goqu.L("NOW()"),
		}).
		Where(goqu.Ex{"id": string(id)})
	query, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return errors.E(op, err)
	}
	if err := s.db.ExecOne(ctx, query, args...); err != nil {
		return errors.E(op, err)
	}
	return nil
}

func (s *PeriodStore) ListByBudget(ctx context.Context, budgetID finance.BudgetID) ([]*finance.BudgetPeriod, error) {
	const op errors.Op = "domain/finance/storage.ListPeriodsByBudget"
	ds := pgDialect.From(goqu.S("finance").Table("budget_period")).
		Select("*").
		Where(goqu.Ex{"budget_id": string(budgetID)}).
		Order(goqu.I("start_date").Desc())
	query, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return nil, errors.E(op, err)
	}
	var rows []periodDB
	if err := s.db.Select(ctx, &rows, query, args...); err != nil {
		return nil, errors.E(op, err)
	}

	periods := make([]*finance.BudgetPeriod, len(rows))
	for i := range rows {
		periods[i] = rows[i].toDomain()
	}
	return periods, nil
}
