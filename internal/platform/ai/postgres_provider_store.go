package ai

import (
	"context"
	"database/sql"
	"encoding/json/v2"
	"strings"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/db"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

// PostgresProviderStore implements ProviderStore against `platform.ai_providers`.
type PostgresProviderStore struct {
	db db.DB
}

// NewProviderStore constructs a PostgresProviderStore.
func NewProviderStore(database db.DB) *PostgresProviderStore {
	return &PostgresProviderStore{db: database}
}

type providerRow struct {
	ID         string         `db:"id"`
	SpaceID    string         `db:"space_id"`
	Name       string         `db:"name"`
	Driver     string         `db:"driver"`
	Config     []byte         `db:"config"`
	Secret     sql.NullString `db:"secret"`
	Status     []byte         `db:"status"`
	IsEnabled  bool           `db:"is_enabled"`
	CreateTime time.Time      `db:"create_time"`
	UpdateTime time.Time      `db:"update_time"`
}

func (r *providerRow) toDomain() (*Provider, error) {
	p := &Provider{
		ID:         r.ID,
		SpaceID:    r.SpaceID,
		Name:       r.Name,
		Driver:     Driver(r.Driver),
		IsEnabled:  r.IsEnabled,
		CreateTime: r.CreateTime,
		UpdateTime: r.UpdateTime,
	}
	if err := unmarshalJSONB(r.Config, &p.Config, "provider config"); err != nil {
		return nil, err
	}
	if err := unmarshalJSONB(r.Status, &p.Status, "provider status"); err != nil {
		return nil, err
	}
	if p.Status.State == "" {
		p.Status.State = ProviderStateUnverified
	}
	if r.Secret.Valid && r.Secret.String != "" {
		p.SecretCiphertext = new(r.Secret.String)
		p.HasSecret = true
		if strings.HasPrefix(strings.TrimSpace(r.Secret.String), "{") {
			var sec ProviderSecret
			if err := json.Unmarshal([]byte(r.Secret.String), &sec); err == nil {
				p.Secret = &sec
			}
		}
	}
	return p, nil
}

func (s *PostgresProviderStore) Create(ctx context.Context, p *Provider) error {
	const op errors.Op = "platform/ai.ProviderStore.Create"

	if p.ID == "" {
		idStr, err := GenerateProviderID()
		if err != nil {
			return errors.E(op, err)
		}
		p.ID = idStr
	}

	configBytes, err := marshalJSONB(p.Config, "provider config")
	if err != nil {
		return errors.E(op, errors.Internal, err)
	}
	statusBytes, err := marshalJSONB(p.Status, "provider status")
	if err != nil {
		return errors.E(op, errors.Internal, err)
	}
	secretVal, err := providerSecretColumn(p)
	if err != nil {
		return errors.E(op, errors.Internal, err)
	}

	const query = `
		INSERT INTO platform.ai_providers (
			id, space_id, name, driver, config, secret, status, is_enabled, create_time, update_time
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
		RETURNING create_time, update_time
	`

	var times struct {
		CreateTime time.Time `db:"create_time"`
		UpdateTime time.Time `db:"update_time"`
	}
	if err := s.db.Get(ctx, &times, query, p.ID, p.SpaceID, p.Name, string(p.Driver), configBytes, secretVal, statusBytes, p.IsEnabled); err != nil {
		return errors.E(op, err)
	}
	p.CreateTime = times.CreateTime
	p.UpdateTime = times.UpdateTime
	return nil
}

func (s *PostgresProviderStore) Get(ctx context.Context, spaceID, id string) (*Provider, error) {
	const op errors.Op = "platform/ai.ProviderStore.Get"

	const query = `
		SELECT id, space_id, name, driver, config, secret, status, is_enabled, create_time, update_time
		FROM platform.ai_providers
		WHERE space_id = $1 AND id = $2
	`
	var row providerRow
	if err := s.db.Get(ctx, &row, query, spaceID, id); err != nil {
		if errors.Is(err, errors.NotExist) {
			return nil, ErrProviderNotFound
		}
		return nil, errors.E(op, err)
	}
	p, err := row.toDomain()
	if err != nil {
		return nil, errors.E(op, errors.Internal, err)
	}
	return p, nil
}

func (s *PostgresProviderStore) List(ctx context.Context, spaceID string) ([]*Provider, error) {
	const op errors.Op = "platform/ai.ProviderStore.List"

	const query = `
		SELECT id, space_id, name, driver, config, secret, status, is_enabled, create_time, update_time
		FROM platform.ai_providers
		WHERE space_id = $1
		ORDER BY create_time DESC
	`
	var rows []providerRow
	if err := s.db.Select(ctx, &rows, query, spaceID); err != nil {
		return nil, errors.E(op, err)
	}
	out := make([]*Provider, 0, len(rows))
	for i := range rows {
		p, err := rows[i].toDomain()
		if err != nil {
			return nil, errors.E(op, errors.Internal, err)
		}
		out = append(out, p)
	}
	return out, nil
}

func (s *PostgresProviderStore) Update(ctx context.Context, p *Provider) error {
	const op errors.Op = "platform/ai.ProviderStore.Update"

	configBytes, err := marshalJSONB(p.Config, "provider config")
	if err != nil {
		return errors.E(op, errors.Internal, err)
	}
	statusBytes, err := marshalJSONB(p.Status, "provider status")
	if err != nil {
		return errors.E(op, errors.Internal, err)
	}
	secretVal, err := providerSecretColumn(p)
	if err != nil {
		return errors.E(op, errors.Internal, err)
	}

	const query = `
		UPDATE platform.ai_providers
		SET name = $3,
		    config = $4,
		    secret = $5,
		    status = $6,
		    is_enabled = $7,
		    update_time = NOW()
		WHERE space_id = $1 AND id = $2
		RETURNING update_time
	`
	var updateTime time.Time
	if err := s.db.Get(ctx, &updateTime, query, p.SpaceID, p.ID, p.Name, configBytes, secretVal, statusBytes, p.IsEnabled); err != nil {
		if errors.Is(err, errors.NotExist) {
			return ErrProviderNotFound
		}
		return errors.E(op, err)
	}
	p.UpdateTime = updateTime
	return nil
}

func (s *PostgresProviderStore) Delete(ctx context.Context, spaceID, id string) error {
	const op errors.Op = "platform/ai.ProviderStore.Delete"

	const query = `DELETE FROM platform.ai_providers WHERE space_id = $1 AND id = $2`
	if err := s.db.ExecOne(ctx, query, spaceID, id); err != nil {
		if errors.Is(err, errors.NotExist) {
			return ErrProviderNotFound
		}
		return errors.E(op, err)
	}
	return nil
}

func providerSecretColumn(p *Provider) (sql.NullString, error) {
	if p.SecretCiphertext != nil && *p.SecretCiphertext != "" {
		return sql.NullString{String: *p.SecretCiphertext, Valid: true}, nil
	}
	if p.Secret != nil && p.Secret.HasCredentials() {
		raw, err := json.Marshal(p.Secret, json.Deterministic(true))
		if err != nil {
			return sql.NullString{}, err
		}
		return sql.NullString{String: string(raw), Valid: true}, nil
	}
	return sql.NullString{}, nil
}
