package financepg

import (
	"context"
	"fmt"

	"github.com/jmoiron/sqlx"
	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/foundation/access"
	"github.com/masterkeysrd/saturn/internal/foundation/space"
)

var _ finance.SettingsStore = (*SettingsStore)(nil)

type SettingsStore struct {
	db *sqlx.DB
}

func NewSettingsStore(db *sqlx.DB) *SettingsStore {
	return &SettingsStore{db: db}
}

func (s *SettingsStore) Get(ctx context.Context, spaceID space.ID) (*finance.Settings, error) {
	row, err := GetSettingsBySpaceID(ctx, s.db, &GetSettingsBySpaceIDParams{
		SpaceId: spaceID.String(),
	})
	if err != nil {
		return nil, fmt.Errorf("getting settings by space ID: %w", err)
	}

	return row.ToModel(), nil
}

func (s *SettingsStore) Store(ctx context.Context, settings *finance.Settings) error {
	row, err := UpsertSettings(ctx, s.db, SettingsEntityFromModel(settings))
	if err != nil {
		return fmt.Errorf("upserting settings: %w", err)
	}

	// Update the settings model with any returned values (like timestamps)
	updatedSettings := row.ToModel()
	*settings = *updatedSettings

	return nil
}

func SettingsEntityFromModel(model *finance.Settings) *SettingEntity {
	return &SettingEntity{
		SpaceId:      model.SpaceID.String(),
		State:        model.State.String(),
		BaseCurrency: model.BaseCurrency.String(),
		CreateTime:   model.CreateTime,
		CreateBy:     model.CreateBy.String(),
		UpdateTime:   model.UpdateTime,
		UpdateBy:     model.UpdateBy.String(),
	}
}

func (e *SettingEntity) ToModel() *finance.Settings {
	return &finance.Settings{
		SpaceID:      space.ID(e.SpaceId),
		State:        finance.SettingsState(e.State),
		BaseCurrency: finance.CurrencyCode(e.BaseCurrency),
		CreateTime:   e.CreateTime,
		CreateBy:     access.UserID(e.CreateBy),
		UpdateTime:   e.UpdateTime,
		UpdateBy:     access.UserID(e.UpdateBy),
	}
}
