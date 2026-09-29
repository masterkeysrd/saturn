package storage

import (
	"context"
	"database/sql"
	"time"

	"github.com/doug-martin/goqu/v9"
	"github.com/masterkeysrd/saturn/internal/domain/identity"
	"github.com/masterkeysrd/saturn/internal/platform/db"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

// passwordResetTokenDB represents a database row in identity.password_reset_tokens.
type passwordResetTokenDB struct {
	ID         string       `db:"id"`
	UserID     string       `db:"user_id"`
	TokenHash  []byte       `db:"token_hash"`
	ExpiresAt  time.Time    `db:"expires_at"`
	UsedAt     sql.NullTime `db:"used_at"`
	CreatedBy  string       `db:"created_by"`
	CreateTime time.Time    `db:"create_time"`
}

func toDomainPasswordResetToken(r *passwordResetTokenDB) *identity.PasswordResetToken {
	token := &identity.PasswordResetToken{
		ID:         identity.ResetTokenID(r.ID),
		UserID:     identity.UserID(r.UserID),
		TokenHash:  r.TokenHash,
		ExpiresAt:  r.ExpiresAt,
		CreatedBy:  identity.UserID(r.CreatedBy),
		CreateTime: r.CreateTime,
	}
	if r.UsedAt.Valid {
		used := r.UsedAt.Time
		token.UsedAt = &used
	}
	return token
}

// PasswordResetStore implements identity.PasswordResetStore using db.DB.
type PasswordResetStore struct {
	db db.DB
}

// NewPasswordResetStore creates a new PasswordResetStore.
func NewPasswordResetStore(database db.DB) *PasswordResetStore {
	return &PasswordResetStore{db: database}
}

// Create inserts a new password reset token record.
func (s *PasswordResetStore) Create(ctx context.Context, token *identity.PasswordResetToken) error {
	const op errors.Op = "domain/identity/storage.PasswordResetStore.Create"

	record := goqu.Record{
		"id":          string(token.ID),
		"user_id":     string(token.UserID),
		"token_hash":  token.TokenHash,
		"expires_at":  token.ExpiresAt,
		"created_by":  string(token.CreatedBy),
		"create_time": token.CreateTime,
	}
	if token.UsedAt != nil {
		record["used_at"] = *token.UsedAt
	}

	q, args, err := pgDialect.Insert(goqu.T("password_reset_tokens").Schema("identity")).
		Rows(record).
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

// GetByTokenHash retrieves an unconsumed or consumed token record by its SHA-256 hash.
func (s *PasswordResetStore) GetByTokenHash(ctx context.Context, tokenHash []byte) (*identity.PasswordResetToken, error) {
	const op errors.Op = "domain/identity/storage.PasswordResetStore.GetByTokenHash"

	q, args, err := pgDialect.From(goqu.T("password_reset_tokens").Schema("identity")).
		Where(goqu.C("token_hash").Eq(tokenHash)).
		Prepared(true).
		ToSQL()
	if err != nil {
		return nil, errors.E(op, err)
	}

	var record passwordResetTokenDB
	if err := s.db.Get(ctx, &record, q, args...); err != nil {
		return nil, errors.E(op, err)
	}

	return toDomainPasswordResetToken(&record), nil
}

// Update persists changes to mutable password reset token fields.
func (s *PasswordResetStore) Update(ctx context.Context, token *identity.PasswordResetToken) error {
	const op errors.Op = "domain/identity/storage.PasswordResetStore.Update"

	q, args, err := pgDialect.Update(goqu.T("password_reset_tokens").Schema("identity")).
		Set(goqu.Record{
			"used_at": token.UsedAt,
		}).
		Where(goqu.C("id").Eq(string(token.ID))).
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
