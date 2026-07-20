package storage

import (
	"context"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/jmoiron/sqlx"

	"github.com/masterkeysrd/saturn/internal/domain/space"
)

// spaceDB is the internal DB record type for space.space.
type spaceDB struct {
	ID          string       `db:"id"`
	Name        string       `db:"name"`
	Description *string      `db:"description"`
	OwnerID     string       `db:"owner_id"`
	Version     int64        `db:"version"`
	CreateTime  sql.NullTime `db:"create_time"`
	UpdateTime  sql.NullTime `db:"update_time"`
}

// SpaceStore implements space.SpaceStore using sqlx.
type SpaceStore struct {
	db *sqlx.DB
}

// NewSpaceStore creates a new SpaceStore.
func NewSpaceStore(db *sqlx.DB) *SpaceStore {
	return &SpaceStore{db: db}
}

// toDomainSpace converts a spaceDB to a domain Space.
func toDomainSpace(s *spaceDB) *space.Space {
	return &space.Space{
		ID:          space.SpaceID(s.ID),
		Name:        s.Name,
		Description: ptrToString(s.Description),
		OwnerID:     space.SpaceID(s.OwnerID),
		Version:     s.Version,
		CreateTime:  nullTimeToTime(s.CreateTime),
		UpdateTime:  nullTimeToTime(s.UpdateTime),
	}
}

// toDBSpace converts a domain Space to a spaceDB.
func toDBSpace(s *space.Space) *spaceDB {
	return &spaceDB{
		ID:          string(s.ID),
		Name:        s.Name,
		Description: strToPtr(s.Description),
		OwnerID:     string(s.OwnerID),
		Version:     s.Version,
		CreateTime:  timeToNullTime(s.CreateTime),
		UpdateTime:  timeToNullTime(s.UpdateTime),
	}
}

// Create inserts a new space and returns the created record.
func (s *SpaceStore) Create(ctx context.Context, sp *space.Space) error {
	db := toDBSpace(sp)
	query := `INSERT INTO space.space (id, name, description, owner_id, version, create_time, update_time)
		VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`
	_, err := s.db.ExecContext(ctx, query, db.ID, db.Name, db.Description, db.OwnerID, db.Version)
	return err
}

// GetByID retrieves a space by its unique ID.
func (s *SpaceStore) GetByID(ctx context.Context, id space.SpaceID) (*space.Space, error) {
	query := `SELECT * FROM space.space WHERE id = $1`
	var db spaceDB
	if err := s.db.GetContext(ctx, &db, query, id); err != nil {
		return nil, err
	}
	return toDomainSpace(&db), nil
}

// Update modifies an existing space with optimistic locking.
func (s *SpaceStore) Update(ctx context.Context, sp *space.Space) error {
	query := `UPDATE space.space SET name = $2, description = $3, version = $4 + 1, update_time = NOW()
		WHERE id = $1 AND version = $4`
	result, err := s.db.ExecContext(ctx, query, sp.ID, sp.Name, sp.Description, sp.Version)
	if err != nil {
		return err
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return errors.New("update failed: space not found or version mismatch")
	}
	sp.Version++
	return nil
}

// Delete removes a space by its unique ID.
func (s *SpaceStore) Delete(ctx context.Context, id space.SpaceID) error {
	query := `DELETE FROM space.space WHERE id = $1`
	result, err := s.db.ExecContext(ctx, query, id)
	if err != nil {
		return err
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return errors.New("delete failed: space not found")
	}
	return nil
}

// ListByUser returns spaces owned or joined by the user.
func (s *SpaceStore) ListByUser(ctx context.Context, userID space.SpaceID, filter *space.ListSpacesFilter) ([]*space.Space, string, error) {
	if filter.PageSize <= 0 || filter.PageSize > 100 {
		filter.PageSize = 20
	}

	query := `SELECT DISTINCT sp.* FROM space.space sp
		INNER JOIN space.member m ON sp.id = m.space_id
		WHERE m.user_id = $1`

	args := []any{string(userID)}
	argIndex := 2

	if filter.NextPageToken != "" {
		var cursor map[string]any
		if err := json.Unmarshal([]byte(filter.NextPageToken), &cursor); err == nil {
			if spaceID, ok := cursor["space_id"].(string); ok && spaceID != "" {
				query += fmt.Sprintf(` AND (sp.id < $%d OR (sp.id = $%d AND sp.version < $%d))`, argIndex, argIndex+1, argIndex+2)
				args = append(args, spaceID, spaceID)
				if ver, ok := cursor["version"].(float64); ok {
					args = append(args, int64(ver))
				} else {
					args = append(args, int64(0))
				}
				argIndex += 3
			}
		}
	}

	query += fmt.Sprintf(` ORDER BY sp.id LIMIT $%d`, argIndex)
	args = append(args, filter.PageSize+1)

	var dbSpaces []spaceDB
	if err := s.db.SelectContext(ctx, &dbSpaces, query, args...); err != nil {
		return nil, "", err
	}

	hasMore := len(dbSpaces) > int(filter.PageSize)
	if hasMore {
		dbSpaces = dbSpaces[:filter.PageSize]
	}

	spaces := make([]*space.Space, 0, len(dbSpaces))
	for i := range dbSpaces {
		spaces = append(spaces, toDomainSpace(&dbSpaces[i]))
	}

	var nextToken string
	if hasMore && len(dbSpaces) > 0 {
		lastSpace := dbSpaces[len(dbSpaces)-1]
		cursor := map[string]any{
			"space_id": lastSpace.ID,
			"version":  lastSpace.Version,
		}
		tokenBytes, err := json.Marshal(cursor)
		if err == nil {
			nextToken = base64.URLEncoding.EncodeToString(tokenBytes)
		}
	}

	return spaces, nextToken, nil
}

// ListByUserOwned returns spaces owned by the user (without needing member table).
func (s *SpaceStore) ListByUserOwned(ctx context.Context, ownerID space.SpaceID, filter *space.ListSpacesFilter) ([]*space.Space, string, error) {
	if filter.PageSize <= 0 || filter.PageSize > 100 {
		filter.PageSize = 20
	}

	conditions := []string{"owner_id = $1"}
	args := []any{string(ownerID)}
	argIndex := 2

	if filter.NextPageToken != "" {
		var cursor map[string]any
		if err := json.Unmarshal([]byte(filter.NextPageToken), &cursor); err == nil {
			if spaceID, ok := cursor["space_id"].(string); ok && spaceID != "" {
				conditions = append(conditions, fmt.Sprintf("(id < $%d OR (id = $%d AND version < $%d))", argIndex, argIndex+1, argIndex+2))
				args = append(args, spaceID, spaceID)
				if ver, ok := cursor["version"].(float64); ok {
					args = append(args, int64(ver))
				} else {
					args = append(args, int64(0))
				}
				argIndex += 3
			}
		}
	}

	query := fmt.Sprintf(`SELECT * FROM space.space WHERE %s ORDER BY id LIMIT $%d`, strings.Join(conditions, " AND "), argIndex)
	args = append(args, filter.PageSize+1)

	var dbSpaces []spaceDB
	if err := s.db.SelectContext(ctx, &dbSpaces, query, args...); err != nil {
		return nil, "", err
	}

	hasMore := len(dbSpaces) > int(filter.PageSize)
	if hasMore {
		dbSpaces = dbSpaces[:filter.PageSize]
	}

	spaces := make([]*space.Space, 0, len(dbSpaces))
	for i := range dbSpaces {
		spaces = append(spaces, toDomainSpace(&dbSpaces[i]))
	}

	var nextToken string
	if hasMore && len(dbSpaces) > 0 {
		lastSpace := dbSpaces[len(dbSpaces)-1]
		cursor := map[string]any{
			"space_id": lastSpace.ID,
			"version":  lastSpace.Version,
		}
		tokenBytes, err := json.Marshal(cursor)
		if err == nil {
			nextToken = base64.URLEncoding.EncodeToString(tokenBytes)
		}
	}

	return spaces, nextToken, nil
}
