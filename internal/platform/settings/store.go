package settings

import (
	"context"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/db"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

// PostgresStore implements Store backed by PostgreSQL.
type PostgresStore struct {
	db db.DB
}

// NewPostgresStore creates a new PostgresStore.
func NewPostgresStore(database db.DB) *PostgresStore {
	return &PostgresStore{db: database}
}

// GetRaw retrieves the raw record from the database.
func (s *PostgresStore) GetRaw(ctx context.Context, scopeType ScopeType, scopeID, namespace string) (*RawRecord, error) {
	const op errors.Op = "platform/settings/postgres.GetRaw"

	query := `SELECT scope_type, scope_id, namespace, payload, version, create_time, update_time
	          FROM platform.settings
	          WHERE scope_type = $1 AND scope_id = $2 AND namespace = $3`

	var rec RawRecord
	if err := s.db.Get(ctx, &rec, query, string(scopeType), scopeID, namespace); err != nil {
		if errors.Is(err, errors.NotExist) {
			return nil, errors.E(op, errors.NotExist, "settings record not found")
		}
		return nil, errors.E(op, err)
	}

	return &rec, nil
}

// SaveRaw persists updates to a record with optimistic concurrency checking.
func (s *PostgresStore) SaveRaw(ctx context.Context, rec *RawRecord) error {
	const op errors.Op = "platform/settings/postgres.SaveRaw"

	if rec.Version == 0 {
		// Initial insert
		query := `INSERT INTO platform.settings (scope_type, scope_id, namespace, payload, version, create_time, update_time)
		          VALUES ($1, $2, $3, $4, 1, NOW(), NOW())
		          RETURNING version, create_time, update_time`

		var out struct {
			Version    int64     `db:"version"`
			CreateTime time.Time `db:"create_time"`
			UpdateTime time.Time `db:"update_time"`
		}

		if err := s.db.Get(ctx, &out, query, rec.ScopeType, rec.ScopeID, rec.Namespace, rec.Payload); err != nil {
			return errors.E(op, errors.Conflict, "settings record already exists or was modified concurrently", err)
		}

		rec.Version = out.Version
		rec.CreateTime = out.CreateTime
		rec.UpdateTime = out.UpdateTime
		return nil
	}

	// OCC update
	query := `UPDATE platform.settings
	          SET payload = $4, version = version + 1, update_time = NOW()
	          WHERE scope_type = $1 AND scope_id = $2 AND namespace = $3 AND version = $5
	          RETURNING version, create_time, update_time`

	var out struct {
		Version    int64     `db:"version"`
		CreateTime time.Time `db:"create_time"`
		UpdateTime time.Time `db:"update_time"`
	}

	if err := s.db.Get(ctx, &out, query, rec.ScopeType, rec.ScopeID, rec.Namespace, rec.Payload, rec.Version); err != nil {
		if errors.Is(err, errors.NotExist) {
			return errors.E(op, errors.Conflict, "settings were modified concurrently or do not exist")
		}
		return errors.E(op, err)
	}

	rec.Version = out.Version
	rec.CreateTime = out.CreateTime
	rec.UpdateTime = out.UpdateTime
	return nil
}

// SetRaw performs an atomic blind upsert.
func (s *PostgresStore) SetRaw(ctx context.Context, rec *RawRecord) (*RawRecord, error) {
	const op errors.Op = "platform/settings/postgres.SetRaw"

	query := `INSERT INTO platform.settings (scope_type, scope_id, namespace, payload, version, create_time, update_time)
	          VALUES ($1, $2, $3, $4, 1, NOW(), NOW())
	          ON CONFLICT (scope_type, scope_id, namespace)
	          DO UPDATE SET payload = EXCLUDED.payload,
	                        version = platform.settings.version + 1,
	                        update_time = NOW()
	          RETURNING version, create_time, update_time`

	var out struct {
		Version    int64     `db:"version"`
		CreateTime time.Time `db:"create_time"`
		UpdateTime time.Time `db:"update_time"`
	}

	if err := s.db.Get(ctx, &out, query, rec.ScopeType, rec.ScopeID, rec.Namespace, rec.Payload); err != nil {
		return nil, errors.E(op, err)
	}

	return &RawRecord{
		ScopeType:  rec.ScopeType,
		ScopeID:    rec.ScopeID,
		Namespace:  rec.Namespace,
		Payload:    rec.Payload,
		Version:    out.Version,
		CreateTime: out.CreateTime,
		UpdateTime: out.UpdateTime,
	}, nil
}

// DeleteRaw deletes the settings record matching the scope and namespace.
func (s *PostgresStore) DeleteRaw(ctx context.Context, scopeType ScopeType, scopeID, namespace string) error {
	const op errors.Op = "platform/settings/postgres.DeleteRaw"

	query := `DELETE FROM platform.settings WHERE scope_type = $1 AND scope_id = $2 AND namespace = $3`
	if _, err := s.db.Exec(ctx, query, string(scopeType), scopeID, namespace); err != nil {
		return errors.E(op, err)
	}
	return nil
}
