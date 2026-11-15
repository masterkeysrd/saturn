package storage

import (
	"context"
	"time"

	"github.com/lib/pq"
	"github.com/masterkeysrd/saturn/internal/domain/space"
	"github.com/masterkeysrd/saturn/internal/platform/db"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

type apiKeyGrantDB struct {
	APIKeyID   string    `db:"api_key_id"`
	SpaceID    string    `db:"space_id"`
	UserID     string    `db:"user_id"`
	CreateTime time.Time `db:"create_time"`
}

func toDomainAPIKeyGrant(rec *apiKeyGrantDB) *space.APIKeyGrant {
	return &space.APIKeyGrant{
		APIKeyID:   rec.APIKeyID,
		SpaceID:    space.SpaceID(rec.SpaceID),
		UserID:     space.UserID(rec.UserID),
		CreateTime: rec.CreateTime,
	}
}

// APIKeyGrantStore implements space.APIKeyGrantStore using PostgreSQL.
type APIKeyGrantStore struct {
	db db.DB
}

// NewAPIKeyGrantStore creates a new APIKeyGrantStore.
func NewAPIKeyGrantStore(database db.DB) *APIKeyGrantStore {
	return &APIKeyGrantStore{db: database}
}

// UpsertGrants inserts API key space grants, ignoring already-existing `(api_key_id, space_id)` rows.
func (s *APIKeyGrantStore) UpsertGrants(ctx context.Context, grants []*space.APIKeyGrant) error {
	const op errors.Op = "domain/space/storage.UpsertAPIKeyGrants"

	if len(grants) == 0 {
		return nil
	}

	const query = `
		INSERT INTO space.api_key_grants (api_key_id, space_id, user_id, create_time)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (api_key_id, space_id) DO NOTHING
	`

	for _, g := range grants {
		if _, err := s.db.Exec(ctx, query, g.APIKeyID, string(g.SpaceID), string(g.UserID), g.CreateTime); err != nil {
			return errors.E(op, err)
		}
	}
	return nil
}

// DeleteGrantsForKeyExcept removes all grants for an API key whose space_id is not in keepSpaceIDs.
func (s *APIKeyGrantStore) DeleteGrantsForKeyExcept(ctx context.Context, apiKeyID string, keepSpaceIDs []space.SpaceID) error {
	const op errors.Op = "domain/space/storage.DeleteAPIKeyGrantsForKeyExcept"

	rawKeep := make([]string, len(keepSpaceIDs))
	for i, sid := range keepSpaceIDs {
		rawKeep[i] = string(sid)
	}

	const query = `
		DELETE FROM space.api_key_grants
		WHERE api_key_id = $1 AND NOT (space_id = ANY($2))
	`

	if _, err := s.db.Exec(ctx, query, apiKeyID, pq.Array(rawKeep)); err != nil {
		return errors.E(op, err)
	}
	return nil
}

// DeleteGrant removes a single `(api_key_id, space_id)` grant row.
func (s *APIKeyGrantStore) DeleteGrant(ctx context.Context, apiKeyID string, spaceID space.SpaceID) error {
	const op errors.Op = "domain/space/storage.DeleteAPIKeyGrant"

	const query = `
		DELETE FROM space.api_key_grants
		WHERE api_key_id = $1 AND space_id = $2
	`

	if err := s.db.ExecOne(ctx, query, apiKeyID, string(spaceID)); err != nil {
		return errors.E(op, err)
	}
	return nil
}

// ListBySpaceID retrieves all API key grants targeting a given space ordered newest first.
func (s *APIKeyGrantStore) ListBySpaceID(ctx context.Context, spaceID space.SpaceID) ([]*space.APIKeyGrant, error) {
	const op errors.Op = "domain/space/storage.ListAPIKeyGrantsBySpaceID"

	const query = `
		SELECT api_key_id, space_id, user_id, create_time
		FROM space.api_key_grants
		WHERE space_id = $1
		ORDER BY create_time DESC
	`

	var recs []apiKeyGrantDB
	if err := s.db.Select(ctx, &recs, query, string(spaceID)); err != nil {
		return nil, errors.E(op, err)
	}

	grants := make([]*space.APIKeyGrant, len(recs))
	for i := range recs {
		grants[i] = toDomainAPIKeyGrant(&recs[i])
	}
	return grants, nil
}

// ListSpaceIDsByAPIKeyID retrieves all active granted space IDs for an API key.
func (s *APIKeyGrantStore) ListSpaceIDsByAPIKeyID(ctx context.Context, apiKeyID string) ([]space.SpaceID, error) {
	const op errors.Op = "domain/space/storage.ListSpaceIDsByAPIKeyID"

	const query = `
		SELECT space_id
		FROM space.api_key_grants
		WHERE api_key_id = $1
		ORDER BY create_time ASC
	`

	var rawIDs []string
	if err := s.db.Select(ctx, &rawIDs, query, apiKeyID); err != nil {
		return nil, errors.E(op, err)
	}

	spaceIDs := make([]space.SpaceID, len(rawIDs))
	for i, raw := range rawIDs {
		spaceIDs[i] = space.SpaceID(raw)
	}
	return spaceIDs, nil
}

// ListSpaceIDsByAPIKeyIDs batch-retrieves active granted space IDs keyed by API key ID.
func (s *APIKeyGrantStore) ListSpaceIDsByAPIKeyIDs(ctx context.Context, apiKeyIDs []string) (map[string][]space.SpaceID, error) {
	const op errors.Op = "domain/space/storage.ListSpaceIDsByAPIKeyIDs"

	result := make(map[string][]space.SpaceID, len(apiKeyIDs))
	if len(apiKeyIDs) == 0 {
		return result, nil
	}

	const query = `
		SELECT api_key_id, space_id, user_id, create_time
		FROM space.api_key_grants
		WHERE api_key_id = ANY($1)
		ORDER BY create_time ASC
	`

	var recs []apiKeyGrantDB
	if err := s.db.Select(ctx, &recs, query, pq.Array(apiKeyIDs)); err != nil {
		return nil, errors.E(op, err)
	}

	for _, rec := range recs {
		result[rec.APIKeyID] = append(result[rec.APIKeyID], space.SpaceID(rec.SpaceID))
	}
	return result, nil
}
