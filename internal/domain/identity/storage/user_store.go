package storage

import (
	"context"
	"database/sql"
	"errors"

	"github.com/jmoiron/sqlx"

	"github.com/masterkeysrd/saturn/internal/domain/identity"
)

// userDB is the internal DB record type for identity.user.
type userDB struct {
	ID         string       `db:"id"`
	Email      string       `db:"email"`
	Username   string       `db:"username"`
	Name       string       `db:"name"`
	AvatarURL  *string      `db:"avatar_url"`
	Status     string       `db:"status"`
	Version    int64        `db:"version"`
	CreateTime sql.NullTime `db:"create_time"`
	UpdateTime sql.NullTime `db:"update_time"`
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
		ID:         identity.UserID(u.ID),
		Email:      u.Email,
		Username:   u.Username,
		Name:       u.Name,
		AvatarURL:  ptrToString(u.AvatarURL),
		Status:     identity.UserStatus(u.Status),
		Version:    u.Version,
		CreateTime: nullTimeToTime(u.CreateTime),
		UpdateTime: nullTimeToTime(u.UpdateTime),
	}
}

// toDB converts a domain User to a userDB.
func toDBUser(u *identity.User) *userDB {
	return &userDB{
		ID:         string(u.ID),
		Email:      u.Email,
		Username:   u.Username,
		Name:       u.Name,
		AvatarURL:  strToPtr(u.AvatarURL),
		Status:     string(u.Status),
		Version:    u.Version,
		CreateTime: timeToNullTime(u.CreateTime),
		UpdateTime: timeToNullTime(u.UpdateTime),
	}
}

// Create inserts a new user and returns the created record.
func (s *UserStore) Create(ctx context.Context, user *identity.User) error {
	db := toDBUser(user)
	query := `INSERT INTO identity.user (id, email, username, name, avatar_url, status, version, create_time, update_time)
		VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`
	_, err := s.db.ExecContext(ctx, query, db.ID, db.Email, db.Username, db.Name, db.AvatarURL, db.Status, db.Version)
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
	query := `UPDATE identity.user SET email = $2, username = $3, name = $4, avatar_url = $5, status = $6, version = $7 + 1, update_time = NOW()
		WHERE id = $1 AND version = $7`
	result, err := s.db.ExecContext(ctx, query, user.ID, user.Email, user.Username, user.Name, user.AvatarURL, user.Status, user.Version)
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
