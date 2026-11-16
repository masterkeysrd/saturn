package ai

import (
	"context"
	"database/sql"
	"time"

	"github.com/lib/pq"
	"github.com/masterkeysrd/saturn/internal/platform/db"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

// PostgresAgentStore implements AgentStore against `platform.ai_agents`.
type PostgresAgentStore struct {
	db db.DB
}

// NewAgentStore constructs a PostgresAgentStore.
func NewAgentStore(database db.DB) *PostgresAgentStore {
	return &PostgresAgentStore{db: database}
}

type agentRow struct {
	ID          string         `db:"id"`
	SpaceID     string         `db:"space_id"`
	SystemKey   sql.NullString `db:"system_key"`
	IsSystem    bool           `db:"is_system"`
	Slug        string         `db:"slug"`
	Name        string         `db:"name"`
	Description string         `db:"description"`
	Tags        pq.StringArray `db:"tags"`
	ModelID     sql.NullString `db:"model_id"`
	Config      []byte         `db:"config"`
	IsEnabled   bool           `db:"is_enabled"`
	Version     int64          `db:"version"`
	CreateTime  time.Time      `db:"create_time"`
	UpdateTime  time.Time      `db:"update_time"`
}

func (r *agentRow) toDomain() (*Agent, error) {
	a := &Agent{
		ID:          r.ID,
		SpaceID:     r.SpaceID,
		IsSystem:    r.IsSystem,
		Slug:        r.Slug,
		Name:        r.Name,
		Description: r.Description,
		Tags:        []string(r.Tags),
		IsEnabled:   r.IsEnabled,
		Version:     r.Version,
		CreateTime:  r.CreateTime,
		UpdateTime:  r.UpdateTime,
	}
	if a.Tags == nil {
		a.Tags = []string{}
	}
	if r.SystemKey.Valid {
		a.SystemKey = new(r.SystemKey.String)
	}
	if r.ModelID.Valid {
		a.ModelID = new(r.ModelID.String)
	}
	if err := unmarshalJSONB(r.Config, &a.Config, "agent config"); err != nil {
		return nil, err
	}
	return a, nil
}

func (s *PostgresAgentStore) Create(ctx context.Context, a *Agent) error {
	const op errors.Op = "platform/ai.AgentStore.Create"

	if a.ID == "" {
		idStr, err := GenerateAgentID()
		if err != nil {
			return errors.E(op, err)
		}
		a.ID = idStr
	}
	if a.Version <= 0 {
		a.Version = 1
	}

	configBytes, err := marshalJSONB(a.Config, "agent config")
	if err != nil {
		return errors.E(op, errors.Internal, err)
	}

	const query = `
		INSERT INTO platform.ai_agents (
			id, space_id, system_key, is_system, slug, name, description, tags,
			model_id, config, is_enabled, version, create_time, update_time
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
		RETURNING create_time, update_time
	`
	var times struct {
		CreateTime time.Time `db:"create_time"`
		UpdateTime time.Time `db:"update_time"`
	}
	if err := s.db.Get(
		ctx,
		&times,
		query,
		a.ID,
		a.SpaceID,
		strPtrToNullStr(a.SystemKey),
		a.IsSystem,
		a.Slug,
		a.Name,
		a.Description,
		pq.Array(a.Tags),
		strPtrToNullStr(a.ModelID),
		configBytes,
		a.IsEnabled,
		a.Version,
	); err != nil {
		return errors.E(op, err)
	}
	a.CreateTime = times.CreateTime
	a.UpdateTime = times.UpdateTime
	return nil
}

func (s *PostgresAgentStore) Get(ctx context.Context, spaceID, id string) (*Agent, error) {
	const op errors.Op = "platform/ai.AgentStore.Get"

	const query = `
		SELECT id, space_id, system_key, is_system, slug, name, description, tags,
		       model_id, config, is_enabled, version, create_time, update_time
		FROM platform.ai_agents
		WHERE space_id = $1 AND (id = $2 OR system_key = $2)
	`
	return s.getOne(ctx, op, query, spaceID, id)
}

func (s *PostgresAgentStore) GetBySystemKey(ctx context.Context, spaceID, systemKey string) (*Agent, error) {
	const op errors.Op = "platform/ai.AgentStore.GetBySystemKey"

	const query = `
		SELECT id, space_id, system_key, is_system, slug, name, description, tags,
		       model_id, config, is_enabled, version, create_time, update_time
		FROM platform.ai_agents
		WHERE space_id = $1 AND system_key = $2
	`
	return s.getOne(ctx, op, query, spaceID, systemKey)
}

func (s *PostgresAgentStore) GetBySlug(ctx context.Context, spaceID, slug string) (*Agent, error) {
	const op errors.Op = "platform/ai.AgentStore.GetBySlug"

	const query = `
		SELECT id, space_id, system_key, is_system, slug, name, description, tags,
		       model_id, config, is_enabled, version, create_time, update_time
		FROM platform.ai_agents
		WHERE space_id = $1 AND slug = $2
	`
	return s.getOne(ctx, op, query, spaceID, slug)
}

func (s *PostgresAgentStore) getOne(ctx context.Context, op errors.Op, query, spaceID, key string) (*Agent, error) {
	var row agentRow
	if err := s.db.Get(ctx, &row, query, spaceID, key); err != nil {
		if errors.Is(err, errors.NotExist) {
			return nil, ErrAgentNotFound
		}
		return nil, errors.E(op, err)
	}
	a, err := row.toDomain()
	if err != nil {
		return nil, errors.E(op, errors.Internal, err)
	}
	return a, nil
}

func (s *PostgresAgentStore) List(ctx context.Context, spaceID string) ([]*Agent, error) {
	const op errors.Op = "platform/ai.AgentStore.List"

	const query = `
		SELECT id, space_id, system_key, is_system, slug, name, description, tags,
		       model_id, config, is_enabled, version, create_time, update_time
		FROM platform.ai_agents
		WHERE space_id = $1
		ORDER BY is_system DESC, create_time DESC
	`
	var rows []agentRow
	if err := s.db.Select(ctx, &rows, query, spaceID); err != nil {
		return nil, errors.E(op, err)
	}
	out := make([]*Agent, 0, len(rows))
	for i := range rows {
		a, err := rows[i].toDomain()
		if err != nil {
			return nil, errors.E(op, errors.Internal, err)
		}
		out = append(out, a)
	}
	return out, nil
}

func (s *PostgresAgentStore) Update(ctx context.Context, a *Agent) error {
	const op errors.Op = "platform/ai.AgentStore.Update"

	configBytes, err := marshalJSONB(a.Config, "agent config")
	if err != nil {
		return errors.E(op, errors.Internal, err)
	}

	const query = `
		UPDATE platform.ai_agents
		SET slug = $3,
		    name = $4,
		    description = $5,
		    tags = $6,
		    model_id = $7,
		    config = $8,
		    is_enabled = $9,
		    version = version + 1,
		    update_time = NOW()
		WHERE space_id = $1 AND id = $2
		RETURNING version, update_time
	`
	var res struct {
		Version    int64     `db:"version"`
		UpdateTime time.Time `db:"update_time"`
	}
	if err := s.db.Get(
		ctx,
		&res,
		query,
		a.SpaceID,
		a.ID,
		a.Slug,
		a.Name,
		a.Description,
		pq.Array(a.Tags),
		strPtrToNullStr(a.ModelID),
		configBytes,
		a.IsEnabled,
	); err != nil {
		if errors.Is(err, errors.NotExist) {
			return ErrAgentNotFound
		}
		return errors.E(op, err)
	}
	a.Version = res.Version
	a.UpdateTime = res.UpdateTime
	return nil
}

func (s *PostgresAgentStore) Delete(ctx context.Context, spaceID, id string) error {
	const op errors.Op = "platform/ai.AgentStore.Delete"

	const query = `DELETE FROM platform.ai_agents WHERE space_id = $1 AND id = $2`
	if err := s.db.ExecOne(ctx, query, spaceID, id); err != nil {
		if errors.Is(err, errors.NotExist) {
			return ErrAgentNotFound
		}
		return errors.E(op, err)
	}
	return nil
}
