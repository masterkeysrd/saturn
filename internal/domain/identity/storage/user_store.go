package storage

import (
	"context"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jmoiron/sqlx"

	"github.com/masterkeysrd/saturn/internal/domain/identity"
)

// userDB is the internal DB record type for identity.user.
type userDB struct {
	ID                  string       `db:"id"`
	Email               string       `db:"email"`
	Username            string       `db:"username"`
	Name                string       `db:"name"`
	AvatarURL           *string      `db:"avatar_url"`
	Status              string       `db:"status"`
	AccessLevel         string       `db:"access_level"`
	Version             int64        `db:"version"`
	AuthVersion         int64        `db:"auth_version"`
	FailedLoginAttempts int          `db:"failed_login_attempts"`
	LockedUntil         sql.NullTime `db:"locked_until"`
	CreateTime          sql.NullTime `db:"create_time"`
	UpdateTime          sql.NullTime `db:"update_time"`
}

// UserStore implements identity.UserStore using sqlx.
type UserStore struct {
	db *sqlx.DB
}

// NewUserStore creates a new UserStore.
func NewUserStore(db *sqlx.DB) *UserStore {
	return &UserStore{db: db}
}

// toDomainUser converts a userDB to a domain User.
func toDomainUser(u *userDB) *identity.User {
	return &identity.User{
		ID:                  identity.UserID(u.ID),
		Email:               u.Email,
		Username:            u.Username,
		Name:                u.Name,
		AvatarURL:           ptrToString(u.AvatarURL),
		Status:              identity.UserStatus(u.Status),
		AccessLevel:         identity.AccessLevel(u.AccessLevel),
		Version:             u.Version,
		AuthVersion:         u.AuthVersion,
		FailedLoginAttempts: u.FailedLoginAttempts,
		LockedUntil:         nullTimeToTimePtr(u.LockedUntil),
		CreateTime:          nullTimeToTime(u.CreateTime),
		UpdateTime:          nullTimeToTime(u.UpdateTime),
	}
}

// toDB converts a domain User to a userDB.
func toDBUser(u *identity.User) *userDB {
	return &userDB{
		ID:                  string(u.ID),
		Email:               u.Email,
		Username:            u.Username,
		Name:                u.Name,
		AvatarURL:           strToPtr(u.AvatarURL),
		Status:              string(u.Status),
		AccessLevel:         string(u.AccessLevel),
		Version:             u.Version,
		AuthVersion:         u.AuthVersion,
		FailedLoginAttempts: u.FailedLoginAttempts,
		LockedUntil:         timePtrToNullTime(u.LockedUntil),
		CreateTime:          timeToNullTime(u.CreateTime),
		UpdateTime:          timeToNullTime(u.UpdateTime),
	}
}

// Create inserts a new user and returns the created record.
func (s *UserStore) Create(ctx context.Context, user *identity.User) error {
	db := toDBUser(user)
	query := `INSERT INTO identity.user (id, email, username, name, avatar_url, status, access_level, version, create_time, update_time)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())`
	_, err := s.db.ExecContext(ctx, query, db.ID, db.Email, db.Username, db.Name, db.AvatarURL, db.Status, db.AccessLevel, db.Version)
	return err
}

// GetByID retrieves a user by their unique ID.
func (s *UserStore) GetByID(ctx context.Context, id identity.UserID) (*identity.User, error) {
	query := `SELECT * FROM identity.user WHERE id = $1`
	var db userDB
	if err := s.db.GetContext(ctx, &db, query, id); err != nil {
		return nil, err
	}
	return toDomainUser(&db), nil
}

// GetByEmail retrieves a user by their email address.
func (s *UserStore) GetByEmail(ctx context.Context, email string) (*identity.User, error) {
	query := `SELECT * FROM identity.user WHERE email = $1`
	var db userDB
	if err := s.db.GetContext(ctx, &db, query, email); err != nil {
		return nil, err
	}
	return toDomainUser(&db), nil
}

// GetByUsername retrieves a user by their username.
func (s *UserStore) GetByUsername(ctx context.Context, username string) (*identity.User, error) {
	query := `SELECT * FROM identity.user WHERE username = $1`
	var db userDB
	if err := s.db.GetContext(ctx, &db, query, username); err != nil {
		return nil, err
	}
	return toDomainUser(&db), nil
}

// Update modifies an existing user with optimistic locking.
func (s *UserStore) Update(ctx context.Context, user *identity.User) error {
	query := `UPDATE identity.user SET email = $2, username = $3, name = $4, avatar_url = $5, status = $6, access_level = $7, version = $8 + 1, update_time = NOW()
		WHERE id = $1 AND version = $8`
	result, err := s.db.ExecContext(ctx, query, user.ID, user.Email, user.Username, user.Name, user.AvatarURL, user.Status, string(user.AccessLevel), user.Version)
	if err != nil {
		return err
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return errors.New("update failed: row not found or version mismatch")
	}
	user.Version++
	return nil
}

// Delete removes a user by their unique ID.
func (s *UserStore) Delete(ctx context.Context, id identity.UserID) error {
	query := `DELETE FROM identity.user WHERE id = $1`
	result, err := s.db.ExecContext(ctx, query, id)
	if err != nil {
		return err
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return errors.New("delete failed: user not found")
	}
	return nil
}

// GetUsers returns users with optional filtering by status and search query, using a filter struct for clarity.
// Returns a slice of users, a next page token for cursor-based pagination, and any error.
func (s *UserStore) GetUsers(ctx context.Context, filter *identity.ListUsersFilter) ([]*identity.User, string, error) {
	if filter.PageSize <= 0 || filter.PageSize > 100 {
		filter.PageSize = 20
	}

	conditions := []string{}
	args := []any{}
	argIndex := 1

	if filter.StatusFilter != "" {
		conditions = append(conditions, fmt.Sprintf("status = $%d", argIndex))
		args = append(args, string(filter.StatusFilter))
		argIndex++
	}

	if filter.SearchQuery != "" {
		searchPattern := "%" + filter.SearchQuery + "%"
		conditions = append(conditions, fmt.Sprintf("(email ILIKE $%d OR username ILIKE $%d OR name ILIKE $%d)", argIndex, argIndex+1, argIndex+2))
		args = append(args, searchPattern, searchPattern, searchPattern)
		argIndex += 3
	}

	if filter.NextPageToken != "" {
		var cursor map[string]any
		if err := json.Unmarshal([]byte(filter.NextPageToken), &cursor); err == nil {
			if email, ok := cursor["email"].(string); ok && email != "" {
				conditions = append(conditions, fmt.Sprintf("(email < $%d OR (email = $%d AND id < $%d))", argIndex, argIndex+1, argIndex+2))
				args = append(args, email, email)
				if userID, ok := cursor["id"].(string); ok && userID != "" {
					args = append(args, userID)
				} else {
					args = append(args, "") // placeholder for id comparison
				}
				argIndex += 3
			}
		}
	}

	query := `SELECT * FROM identity.user`
	if len(conditions) > 0 {
		query += " WHERE " + strings.Join(conditions, " AND ")
	}
	query += fmt.Sprintf(` ORDER BY create_time DESC LIMIT $%d`, argIndex)
	args = append(args, filter.PageSize+1) // fetch one extra to detect if there are more pages

	var dbUsers []userDB
	if err := s.db.SelectContext(ctx, &dbUsers, query, args...); err != nil {
		return nil, "", err
	}

	hasMore := len(dbUsers) > int(filter.PageSize)
	if hasMore {
		dbUsers = dbUsers[:filter.PageSize]
	}

	users := make([]*identity.User, 0, len(dbUsers))
	for i := range dbUsers {
		users = append(users, toDomainUser(&dbUsers[i]))
	}

	var nextToken string
	if hasMore && len(dbUsers) > 0 {
		lastUser := dbUsers[len(dbUsers)-1]
		cursor := map[string]any{
			"email": lastUser.Email,
			"id":    lastUser.ID,
		}
		tokenBytes, err := json.Marshal(cursor)
		if err == nil {
			nextToken = base64.URLEncoding.EncodeToString(tokenBytes)
		}
	}

	return users, nextToken, nil
}

// GetAuthVersion retrieves the auth_version for a user.
func (s *UserStore) GetAuthVersion(ctx context.Context, id identity.UserID) (int64, error) {
	var authVersion int64
	query := `SELECT auth_version FROM identity.user WHERE id = $1`
	err := s.db.GetContext(ctx, &authVersion, query, string(id))
	if err != nil {
		return 0, err
	}
	return authVersion, nil
}

// IncrementAuthVersion atomically increments the auth_version for a user.
func (s *UserStore) IncrementAuthVersion(ctx context.Context, id identity.UserID) (int64, error) {
	query := `UPDATE identity.user SET auth_version = auth_version + 1, update_time = NOW() WHERE id = $1 RETURNING auth_version`
	var authVersion int64
	err := s.db.GetContext(ctx, &authVersion, query, string(id))
	if err != nil {
		return 0, err
	}
	return authVersion, nil
}

// UpdateLockoutState updates only the failed login attempts and lockout expiration for a user.
func (s *UserStore) UpdateLockoutState(ctx context.Context, req identity.UpdateLockoutRequest) error {
	var nullTime sql.NullTime
	if req.LockedUntil != nil {
		nullTime = sql.NullTime{Time: *req.LockedUntil, Valid: true}
	}
	query := `UPDATE identity.user SET failed_login_attempts = $2, locked_until = $3, update_time = NOW() WHERE id = $1`
	_, err := s.db.ExecContext(ctx, query, string(req.UserID), req.Attempts, nullTime)
	return err
}

func nullTimeToTimePtr(nt sql.NullTime) *time.Time {
	if !nt.Valid {
		return nil
	}
	t := nt.Time
	return &t
}

func timePtrToNullTime(t *time.Time) sql.NullTime {
	if t == nil {
		return sql.NullTime{}
	}
	return sql.NullTime{Time: *t, Valid: true}
}
