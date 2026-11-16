package ai

import (
	"context"
	"time"

	"github.com/doug-martin/goqu/v9"
	"github.com/masterkeysrd/saturn/internal/platform/db"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

// PostgresModelStore implements ModelStore against `platform.ai_models`.
type PostgresModelStore struct {
	db db.DB
}

// NewModelStore constructs a PostgresModelStore.
func NewModelStore(database db.DB) *PostgresModelStore {
	return &PostgresModelStore{db: database}
}

type modelRow struct {
	ID          string    `db:"id"`
	SpaceID     string    `db:"space_id"`
	ProviderID  string    `db:"provider_id"`
	ModelID     string    `db:"model_id"`
	DisplayName string    `db:"display_name"`
	Source      string    `db:"source"`
	Profile     []byte    `db:"profile"`
	Config      []byte    `db:"config"`
	IsEnabled   bool      `db:"is_enabled"`
	CreateTime  time.Time `db:"create_time"`
	UpdateTime  time.Time `db:"update_time"`
}

func (r *modelRow) toDomain() (*Model, error) {
	m := &Model{
		ID:          r.ID,
		SpaceID:     r.SpaceID,
		ProviderID:  r.ProviderID,
		ModelID:     r.ModelID,
		DisplayName: r.DisplayName,
		Source:      ModelSource(r.Source),
		IsEnabled:   r.IsEnabled,
		CreateTime:  r.CreateTime,
		UpdateTime:  r.UpdateTime,
	}
	if err := unmarshalJSONB(r.Profile, &m.Profile, "model profile"); err != nil {
		return nil, err
	}
	if err := unmarshalJSONB(r.Config, &m.Config, "model config"); err != nil {
		return nil, err
	}
	return m, nil
}

func (s *PostgresModelStore) Create(ctx context.Context, m *Model) error {
	const op errors.Op = "platform/ai.ModelStore.Create"

	if m.ID == "" {
		idStr, err := GenerateModelID()
		if err != nil {
			return errors.E(op, err)
		}
		m.ID = idStr
	}

	profileBytes, err := marshalJSONB(m.Profile, "model profile")
	if err != nil {
		return errors.E(op, errors.Internal, err)
	}
	configBytes, err := marshalJSONB(m.Config, "model config")
	if err != nil {
		return errors.E(op, errors.Internal, err)
	}

	const query = `
		INSERT INTO platform.ai_models (
			id, space_id, provider_id, model_id, display_name, source, profile, config, is_enabled, create_time, update_time
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
		RETURNING create_time, update_time
	`
	var times struct {
		CreateTime time.Time `db:"create_time"`
		UpdateTime time.Time `db:"update_time"`
	}
	if err := s.db.Get(ctx, &times, query, m.ID, m.SpaceID, m.ProviderID, m.ModelID, m.DisplayName, string(m.Source), profileBytes, configBytes, m.IsEnabled); err != nil {
		return errors.E(op, err)
	}
	m.CreateTime = times.CreateTime
	m.UpdateTime = times.UpdateTime
	return nil
}

func (s *PostgresModelStore) Get(ctx context.Context, spaceID, id string) (*Model, error) {
	const op errors.Op = "platform/ai.ModelStore.Get"

	const query = `
		SELECT id, space_id, provider_id, model_id, display_name, source, profile, config, is_enabled, create_time, update_time
		FROM platform.ai_models
		WHERE space_id = $1 AND id = $2
	`
	var row modelRow
	if err := s.db.Get(ctx, &row, query, spaceID, id); err != nil {
		if errors.Is(err, errors.NotExist) {
			return nil, ErrModelNotFound
		}
		return nil, errors.E(op, err)
	}
	m, err := row.toDomain()
	if err != nil {
		return nil, errors.E(op, errors.Internal, err)
	}
	return m, nil
}

func (s *PostgresModelStore) GetByProviderModel(ctx context.Context, spaceID, providerID, modelID string) (*Model, error) {
	const op errors.Op = "platform/ai.ModelStore.GetByProviderModel"

	const query = `
		SELECT id, space_id, provider_id, model_id, display_name, source, profile, config, is_enabled, create_time, update_time
		FROM platform.ai_models
		WHERE space_id = $1 AND provider_id = $2 AND model_id = $3
	`
	var row modelRow
	if err := s.db.Get(ctx, &row, query, spaceID, providerID, modelID); err != nil {
		if errors.Is(err, errors.NotExist) {
			return nil, ErrModelNotFound
		}
		return nil, errors.E(op, err)
	}
	m, err := row.toDomain()
	if err != nil {
		return nil, errors.E(op, errors.Internal, err)
	}
	return m, nil
}

func (s *PostgresModelStore) List(ctx context.Context, filter ListModelsFilter) ([]*Model, error) {
	const op errors.Op = "platform/ai.ModelStore.List"

	ds := pgDialect.From(goqu.T("ai_models").Schema("platform")).
		Select("id", "space_id", "provider_id", "model_id", "display_name", "source", "profile", "config", "is_enabled", "create_time", "update_time").
		Where(goqu.C("space_id").Eq(filter.SpaceID))

	if filter.ProviderID != nil && *filter.ProviderID != "" {
		ds = ds.Where(goqu.C("provider_id").Eq(*filter.ProviderID))
	}
	if filter.IsEnabled != nil {
		ds = ds.Where(goqu.C("is_enabled").Eq(*filter.IsEnabled))
	}

	ds = ds.Order(goqu.C("is_enabled").Desc(), goqu.C("display_name").Asc(), goqu.C("id").Asc())

	query, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return nil, errors.E(op, err)
	}

	var rows []modelRow
	if err := s.db.Select(ctx, &rows, query, args...); err != nil {
		return nil, errors.E(op, err)
	}

	out := make([]*Model, 0, len(rows))
	for i := range rows {
		m, err := rows[i].toDomain()
		if err != nil {
			return nil, errors.E(op, errors.Internal, err)
		}
		out = append(out, m)
	}
	return out, nil
}

func (s *PostgresModelStore) CountByProvider(ctx context.Context, spaceID string) (map[string]int32, error) {
	const op errors.Op = "platform/ai.ModelStore.CountByProvider"

	const query = `
		SELECT provider_id, COUNT(*)::INT AS cnt
		FROM platform.ai_models
		WHERE space_id = $1
		GROUP BY provider_id
	`
	var rows []struct {
		ProviderID string `db:"provider_id"`
		Count      int32  `db:"cnt"`
	}
	if err := s.db.Select(ctx, &rows, query, spaceID); err != nil {
		return nil, errors.E(op, err)
	}
	counts := make(map[string]int32, len(rows))
	for _, r := range rows {
		counts[r.ProviderID] = r.Count
	}
	return counts, nil
}

func (s *PostgresModelStore) Update(ctx context.Context, m *Model) error {
	const op errors.Op = "platform/ai.ModelStore.Update"

	profileBytes, err := marshalJSONB(m.Profile, "model profile")
	if err != nil {
		return errors.E(op, errors.Internal, err)
	}
	configBytes, err := marshalJSONB(m.Config, "model config")
	if err != nil {
		return errors.E(op, errors.Internal, err)
	}

	const query = `
		UPDATE platform.ai_models
		SET display_name = $3,
		    profile = $4,
		    config = $5,
		    is_enabled = $6,
		    update_time = NOW()
		WHERE space_id = $1 AND id = $2
		RETURNING update_time
	`
	var updateTime time.Time
	if err := s.db.Get(ctx, &updateTime, query, m.SpaceID, m.ID, m.DisplayName, profileBytes, configBytes, m.IsEnabled); err != nil {
		if errors.Is(err, errors.NotExist) {
			return ErrModelNotFound
		}
		return errors.E(op, err)
	}
	m.UpdateTime = updateTime
	return nil
}

func (s *PostgresModelStore) Delete(ctx context.Context, spaceID, id string) error {
	const op errors.Op = "platform/ai.ModelStore.Delete"

	const query = `DELETE FROM platform.ai_models WHERE space_id = $1 AND id = $2`
	if err := s.db.ExecOne(ctx, query, spaceID, id); err != nil {
		if errors.Is(err, errors.NotExist) {
			return ErrModelNotFound
		}
		return errors.E(op, err)
	}
	return nil
}
