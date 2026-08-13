package storage

import (
	"context"
	"database/sql"
	"errors"

	"github.com/doug-martin/goqu/v9"
	"github.com/jmoiron/sqlx"
	"github.com/masterkeysrd/saturn/internal/domain/finance"
)

type settingsDB struct {
	SpaceID      string       `db:"space_id"`
	BaseCurrency string       `db:"base_currency"`
	CreateTime   sql.NullTime `db:"create_time"`
	UpdateTime   sql.NullTime `db:"update_time"`
}

type SettingsStore struct {
	db *sqlx.DB
}

func NewSettingsStore(db *sqlx.DB) *SettingsStore {
	return &SettingsStore{db: db}
}

func (s *SettingsStore) Create(ctx context.Context, settings *finance.FinanceSettings) error {
	ds := pgDialect.Insert(goqu.S("finance").Table("settings")).Rows(goqu.Record{
		"space_id":      string(settings.SpaceID),
		"base_currency": string(settings.BaseCurrency),
		"create_time":   settings.CreateTime,
		"update_time":   settings.UpdateTime,
	})
	query, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return err
	}
	_, err = s.db.ExecContext(ctx, query, args...)
	return err
}

func (s *SettingsStore) GetByID(ctx context.Context, spaceID finance.SpaceID) (*finance.FinanceSettings, error) {
	ds := pgDialect.From(goqu.S("finance").Table("settings")).
		Select("space_id", "base_currency", "create_time", "update_time").
		Where(goqu.Ex{"space_id": string(spaceID)})
	query, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return nil, err
	}
	var row settingsDB
	if err := s.db.GetContext(ctx, &row, query, args...); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, finance.ErrSettingsNotFound
		}
		return nil, err
	}
	return &finance.FinanceSettings{
		SpaceID:      finance.SpaceID(row.SpaceID),
		BaseCurrency: finance.Currency(row.BaseCurrency),
		CreateTime:   nullTimeToTime(row.CreateTime),
		UpdateTime:   nullTimeToTime(row.UpdateTime),
	}, nil
}
