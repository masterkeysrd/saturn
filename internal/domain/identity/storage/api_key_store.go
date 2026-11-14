package storage

import (
	"context"
	"database/sql"
	"time"

	"github.com/doug-martin/goqu/v9"
	"github.com/lib/pq"
	"github.com/masterkeysrd/saturn/internal/domain/identity"
	"github.com/masterkeysrd/saturn/internal/platform/db"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

type apiKeyDB struct {
	ID          string         `db:"id"`
	UserID      string         `db:"user_id"`
	Name        string         `db:"name"`
	Description string         `db:"description"`
	KeyPrefix   string         `db:"key_prefix"`
	KeyHash     string         `db:"key_hash"`
	Scopes      pq.StringArray `db:"scopes"`
	ExpiresAt   sql.NullTime   `db:"expires_at"`
	LastUsedAt  sql.NullTime   `db:"last_used_at"`
	CreateTime  time.Time      `db:"create_time"`
	UpdateTime  time.Time      `db:"update_time"`
}

func toDomainAPIKey(rec *apiKeyDB) *identity.APIKey {
	return &identity.APIKey{
		ID:          identity.APIKeyID(rec.ID),
		UserID:      identity.UserID(rec.UserID),
		Name:        rec.Name,
		Description: rec.Description,
		KeyPrefix:   rec.KeyPrefix,
		KeyHash:     rec.KeyHash,
		Scopes:      []string(rec.Scopes),
		ExpiresAt:   nullTimeToTimePtr(rec.ExpiresAt),
		LastUsedAt:  nullTimeToTimePtr(rec.LastUsedAt),
		CreateTime:  rec.CreateTime,
		UpdateTime:  rec.UpdateTime,
	}
}

// APIKeyStore implements identity.APIKeyStore using PostgreSQL.
type APIKeyStore struct {
	db db.DB
}

// NewAPIKeyStore creates a new APIKeyStore.
func NewAPIKeyStore(database db.DB) *APIKeyStore {
	return &APIKeyStore{db: database}
}

// Create inserts a new API key record.
func (s *APIKeyStore) Create(ctx context.Context, key *identity.APIKey) error {
	const op errors.Op = "domain/identity/storage.CreateAPIKey"

	const query = `
		INSERT INTO identity.api_keys (
			id, user_id, name, description, key_prefix, key_hash, scopes, expires_at, last_used_at, create_time, update_time
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
	`

	if _, err := s.db.Exec(
		ctx,
		query,
		string(key.ID),
		string(key.UserID),
		key.Name,
		key.Description,
		key.KeyPrefix,
		key.KeyHash,
		pq.StringArray(key.Scopes),
		timePtrToNullTime(key.ExpiresAt),
		timePtrToNullTime(key.LastUsedAt),
		key.CreateTime,
		key.UpdateTime,
	); err != nil {
		return errors.E(op, err)
	}
	return nil
}

// GetByID retrieves an API key by its unique ID.
func (s *APIKeyStore) GetByID(ctx context.Context, id identity.APIKeyID) (*identity.APIKey, error) {
	const op errors.Op = "domain/identity/storage.GetAPIKeyByID"

	q, args, err := pgDialect.From(goqu.T("api_keys").Schema("identity")).
		Where(goqu.C("id").Eq(string(id))).
		Prepared(true).
		ToSQL()
	if err != nil {
		return nil, errors.E(op, err)
	}

	var rec apiKeyDB
	if err := s.db.Get(ctx, &rec, q, args...); err != nil {
		return nil, errors.E(op, err)
	}
	return toDomainAPIKey(&rec), nil
}

// GetByHash retrieves an API key by its SHA-256 hex digest.
func (s *APIKeyStore) GetByHash(ctx context.Context, keyHash string) (*identity.APIKey, error) {
	const op errors.Op = "domain/identity/storage.GetAPIKeyByHash"

	q, args, err := pgDialect.From(goqu.T("api_keys").Schema("identity")).
		Where(goqu.C("key_hash").Eq(keyHash)).
		Prepared(true).
		ToSQL()
	if err != nil {
		return nil, errors.E(op, err)
	}

	var rec apiKeyDB
	if err := s.db.Get(ctx, &rec, q, args...); err != nil {
		return nil, errors.E(op, err)
	}
	return toDomainAPIKey(&rec), nil
}

// ListByUserID retrieves all API keys owned by the given user ordered newest first.
func (s *APIKeyStore) ListByUserID(ctx context.Context, userID identity.UserID) ([]*identity.APIKey, error) {
	const op errors.Op = "domain/identity/storage.ListAPIKeysByUserID"

	q, args, err := pgDialect.From(goqu.T("api_keys").Schema("identity")).
		Where(goqu.C("user_id").Eq(string(userID))).
		Order(goqu.C("create_time").Desc()).
		Prepared(true).
		ToSQL()
	if err != nil {
		return nil, errors.E(op, err)
	}

	var recs []apiKeyDB
	if err := s.db.Select(ctx, &recs, q, args...); err != nil {
		return nil, errors.E(op, err)
	}

	keys := make([]*identity.APIKey, len(recs))
	for i := range recs {
		keys[i] = toDomainAPIKey(&recs[i])
	}
	return keys, nil
}

// ListByIDs retrieves API keys matching the provided IDs.
func (s *APIKeyStore) ListByIDs(ctx context.Context, ids []identity.APIKeyID) ([]*identity.APIKey, error) {
	const op errors.Op = "domain/identity/storage.ListAPIKeysByIDs"

	if len(ids) == 0 {
		return nil, nil
	}

	rawIDs := make([]string, len(ids))
	for i, id := range ids {
		rawIDs[i] = string(id)
	}

	const query = `
		SELECT id, user_id, name, description, key_prefix, key_hash, scopes, expires_at, last_used_at, create_time, update_time
		FROM identity.api_keys
		WHERE id = ANY($1)
	`

	var recs []apiKeyDB
	if err := s.db.Select(ctx, &recs, query, pq.Array(rawIDs)); err != nil {
		return nil, errors.E(op, err)
	}

	keys := make([]*identity.APIKey, len(recs))
	for i := range recs {
		keys[i] = toDomainAPIKey(&recs[i])
	}
	return keys, nil
}

// Update persists updated mutable fields (name, description, scopes, update_time) for an API key.
func (s *APIKeyStore) Update(ctx context.Context, key *identity.APIKey) error {
	const op errors.Op = "domain/identity/storage.UpdateAPIKey"

	const query = `
		UPDATE identity.api_keys
		SET name = $1, description = $2, scopes = $3, update_time = $4
		WHERE id = $5
	`

	if err := s.db.ExecOne(ctx, query, key.Name, key.Description, pq.StringArray(key.Scopes), key.UpdateTime, string(key.ID)); err != nil {
		return errors.E(op, err)
	}
	return nil
}

// Delete removes an API key by ID.
func (s *APIKeyStore) Delete(ctx context.Context, id identity.APIKeyID) error {
	const op errors.Op = "domain/identity/storage.DeleteAPIKey"

	q, args, err := pgDialect.Delete(goqu.T("api_keys").Schema("identity")).
		Where(goqu.C("id").Eq(string(id))).
		Prepared(true).
		ToSQL()
	if err != nil {
		return errors.E(op, err)
	}

	if err := s.db.ExecOne(ctx, q, args...); err != nil {
		return errors.E(op, err)
	}
	return nil
}

// TouchLastUsed updates the last_used_at timestamp for an API key.
func (s *APIKeyStore) TouchLastUsed(ctx context.Context, id identity.APIKeyID, lastUsedAt time.Time) error {
	const op errors.Op = "domain/identity/storage.TouchAPIKeyLastUsed"

	q, args, err := pgDialect.Update(goqu.T("api_keys").Schema("identity")).
		Set(goqu.Record{"last_used_at": lastUsedAt}).
		Where(goqu.C("id").Eq(string(id))).
		Prepared(true).
		ToSQL()
	if err != nil {
		return errors.E(op, err)
	}

	if _, err := s.db.Exec(ctx, q, args...); err != nil {
		return errors.E(op, err)
	}
	return nil
}
