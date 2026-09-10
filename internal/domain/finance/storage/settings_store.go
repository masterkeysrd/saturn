package storage

import (
	"context"
	"database/sql"

	"github.com/doug-martin/goqu/v9"
	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/platform/db"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

type settingsDB struct {
	SpaceID      string       `db:"space_id"`
	BaseCurrency string       `db:"base_currency"`
	CreateTime   sql.NullTime `db:"create_time"`
	UpdateTime   sql.NullTime `db:"update_time"`
}

type SettingsStore struct {
	db db.DB
}

func NewSettingsStore(database db.DB) *SettingsStore {
	return &SettingsStore{db: database}
}

func (s *SettingsStore) Create(ctx context.Context, settings *finance.FinanceSettings) error {
	const op errors.Op = "domain/finance/storage.CreateSettings"
	ds := pgDialect.Insert(goqu.S("finance").Table("settings")).Rows(goqu.Record{
		"space_id":      string(settings.SpaceID),
		"base_currency": string(settings.BaseCurrency),
		"create_time":   settings.CreateTime,
		"update_time":   settings.UpdateTime,
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

func (s *SettingsStore) GetByID(ctx context.Context, spaceID finance.SpaceID) (*finance.FinanceSettings, error) {
	const op errors.Op = "domain/finance/storage.GetSettingsByID"
	ds := pgDialect.From(goqu.S("finance").Table("settings")).
		Select("space_id", "base_currency", "create_time", "update_time").
		Where(goqu.Ex{"space_id": string(spaceID)})
	query, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return nil, errors.E(op, err)
	}
	var row settingsDB
	if err := s.db.Get(ctx, &row, query, args...); err != nil {
		return nil, errors.E(op, err)
	}
	return &finance.FinanceSettings{
		SpaceID:      finance.SpaceID(row.SpaceID),
		BaseCurrency: finance.Currency(row.BaseCurrency),
		CreateTime:   nullTimeToTime(row.CreateTime),
		UpdateTime:   nullTimeToTime(row.UpdateTime),
	}, nil
}
