package storage

import (
	"context"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/jmoiron/sqlx"

	"github.com/masterkeysrd/saturn/internal/domain/space"
)

// memberDB is the internal DB record type for space.member.
type memberDB struct {
	SpaceID    string       `db:"space_id"`
	UserID     string       `db:"user_id"`
	Role       string       `db:"role"`
	CreateTime sql.NullTime `db:"create_time"`
	UpdateTime sql.NullTime `db:"update_time"`
}

// MemberStore implements space.MemberStore using sqlx.
type MemberStore struct {
	db *sqlx.DB
}

// NewMemberStore creates a new MemberStore.
func NewMemberStore(db *sqlx.DB) *MemberStore {
	return &MemberStore{db: db}
}

// toDomainMember converts a memberDB to a domain Member.
func toDomainMember(m *memberDB) *space.Member {
	return &space.Member{
		SpaceID:    space.SpaceID(m.SpaceID),
		UserID:     space.SpaceID(m.UserID),
		Role:       space.SpaceRole(m.Role),
		CreateTime: nullTimeToTime(m.CreateTime),
		UpdateTime: nullTimeToTime(m.UpdateTime),
	}
}

// toDBMember converts a domain Member to a memberDB.
func toDBMember(m *space.Member) *memberDB {
	return &memberDB{
		SpaceID:    string(m.SpaceID),
		UserID:     string(m.UserID),
		Role:       string(m.Role),
		CreateTime: timeToNullTime(m.CreateTime),
		UpdateTime: timeToNullTime(m.UpdateTime),
	}
}

// Create inserts a new membership record.
func (s *MemberStore) Create(ctx context.Context, member *space.Member) error {
	db := toDBMember(member)
	query := `INSERT INTO space.member (space_id, user_id, role, create_time, update_time)
		VALUES ($1, $2, $3, NOW(), NOW())`
	_, err := s.db.ExecContext(ctx, query, db.SpaceID, db.UserID, db.Role)
	return err
}

// GetByID retrieves a membership by space ID and user ID.
func (s *MemberStore) GetByID(ctx context.Context, spaceID space.SpaceID, userID space.SpaceID) (*space.Member, error) {
	query := `SELECT * FROM space.member WHERE space_id = $1 AND user_id = $2`
	var db memberDB
	if err := s.db.GetContext(ctx, &db, query, spaceID, userID); err != nil {
		return nil, err
	}
	return toDomainMember(&db), nil
}

// Update modifies an existing membership.
func (s *MemberStore) Update(ctx context.Context, member *space.Member) error {
	query := `UPDATE space.member SET role = $3, update_time = NOW()
		WHERE space_id = $1 AND user_id = $2`
	_, err := s.db.ExecContext(ctx, query, member.SpaceID, member.UserID, member.Role)
	return err
}

// Delete removes a membership.
func (s *MemberStore) Delete(ctx context.Context, spaceID space.SpaceID, userID space.SpaceID) error {
	query := `DELETE FROM space.member WHERE space_id = $1 AND user_id = $2`
	result, err := s.db.ExecContext(ctx, query, spaceID, userID)
	if err != nil {
		return err
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return errors.New("delete failed: membership not found")
	}
	return nil
}

// ListBySpace returns all members of a space.
func (s *MemberStore) ListBySpace(ctx context.Context, spaceID space.SpaceID, filter *space.ListMembersFilter) ([]*space.Member, string, error) {
	if filter.PageSize <= 0 || filter.PageSize > 100 {
		filter.PageSize = 20
	}

	query := `SELECT * FROM space.member WHERE space_id = $1`
	args := []any{string(spaceID)}
	argIndex := 2

	if filter.NextPageToken != "" {
		var cursor map[string]any
		if err := json.Unmarshal([]byte(filter.NextPageToken), &cursor); err == nil {
			if uid, ok := cursor["user_id"].(string); ok && uid != "" {
				query += fmt.Sprintf(` AND (user_id < $%d OR (user_id = $%d AND space_id < $%d))`, argIndex, argIndex+1, argIndex+2)
				args = append(args, uid, uid, string(spaceID))
				argIndex += 3
			}
		}
	}

	query += fmt.Sprintf(` ORDER BY user_id LIMIT $%d`, argIndex)
	args = append(args, filter.PageSize+1)

	var dbMembers []memberDB
	if err := s.db.SelectContext(ctx, &dbMembers, query, args...); err != nil {
		return nil, "", err
	}

	hasMore := len(dbMembers) > int(filter.PageSize)
	if hasMore {
		dbMembers = dbMembers[:filter.PageSize]
	}

	members := make([]*space.Member, 0, len(dbMembers))
	for i := range dbMembers {
		members = append(members, toDomainMember(&dbMembers[i]))
	}

	var nextToken string
	if hasMore && len(dbMembers) > 0 {
		lastMember := dbMembers[len(dbMembers)-1]
		cursor := map[string]any{
			"user_id": lastMember.UserID,
		}
		tokenBytes, err := json.Marshal(cursor)
		if err == nil {
			nextToken = base64.URLEncoding.EncodeToString(tokenBytes)
		}
	}

	return members, nextToken, nil
}

// ListByUser returns all spaces where the user is a member.
func (s *MemberStore) ListByUser(ctx context.Context, userID space.SpaceID) ([]*space.Member, error) {
	query := `SELECT * FROM space.member WHERE user_id = $1 ORDER BY space_id`
	var dbMembers []memberDB
	if err := s.db.SelectContext(ctx, &dbMembers, query, string(userID)); err != nil {
		return nil, err
	}

	members := make([]*space.Member, 0, len(dbMembers))
	for i := range dbMembers {
		members = append(members, toDomainMember(&dbMembers[i]))
	}

	return members, nil
}

// Exists checks if a membership exists.
func (s *MemberStore) Exists(ctx context.Context, spaceID space.SpaceID, userID space.SpaceID) (bool, error) {
	query := `SELECT 1 FROM space.member WHERE space_id = $1 AND user_id = $2 LIMIT 1`
	var exists int
	err := s.db.GetContext(ctx, &exists, query, spaceID, userID)
	if err == sql.ErrNoRows {
		return false, nil
	}
	return err == nil, err
}
