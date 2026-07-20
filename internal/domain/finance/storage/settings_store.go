package storage

import (
	"context"
	"database/sql"
	"errors"

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
	query := `INSERT INTO finance.settings (space_id, base_currency, create_time, update_time)
		VALUES ($1, $2, $3, $4)`
	_, err := s.db.ExecContext(ctx, query, string(settings.SpaceID), settings.BaseCurrency, settings.CreateTime, settings.UpdateTime)
	return err
}

func (s *SettingsStore) GetByID(ctx context.Context, spaceID finance.SpaceID) (*finance.FinanceSettings, error) {
	var row settingsDB
	query := `SELECT space_id, base_currency, create_time, update_time FROM finance.settings WHERE space_id = $1`
	if err := s.db.GetContext(ctx, &row, query, string(spaceID)); err != nil {
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
