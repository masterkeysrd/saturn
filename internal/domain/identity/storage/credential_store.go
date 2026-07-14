package storage

import (
	"context"
	"errors"

	"github.com/jmoiron/sqlx"

	"github.com/masterkeysrd/saturn/internal/domain/identity"
)

// credentialDB is the internal DB record type for identity.user_credentials.
type credentialDB struct {
	UserID     string `db:"user_id"`
	AuthType   string `db:"auth_type"`
	SecretData string `db:"secret_data"`
}

// CredentialStore implements identity.UserCredentialStore using sqlx.
type CredentialStore struct {
	db *sqlx.DB
}

// NewCredentialStore creates a new CredentialStore.
func NewCredentialStore(db *sqlx.DB) *CredentialStore {
	return &CredentialStore{db: db}
}

// toDomainCredential converts a credentialDB to a domain Credential.
func toDomainCredential(c *credentialDB) *identity.Credential {
	return &identity.Credential{
		UserID:     identity.UserID(c.UserID),
		AuthType:   c.AuthType,
		SecretData: c.SecretData,
	}
}

// toDB converts a domain Credential to a credentialDB.
func toDBCredential(c *identity.Credential) *credentialDB {
	return &credentialDB{
		UserID:     string(c.UserID),
		AuthType:   c.AuthType,
		SecretData: c.SecretData,
	}
}

// Create inserts a new credential for the given user.
func (s *CredentialStore) Create(ctx context.Context, credential *identity.Credential) error {
	db := toDBCredential(credential)
	query := `INSERT INTO identity.user_credentials (user_id, auth_type, secret_data)
		VALUES ($1, $2, $3) ON CONFLICT (user_id, auth_type) DO UPDATE SET secret_data = $3`
	_, err := s.db.ExecContext(ctx, query, db.UserID, db.AuthType, db.SecretData)
	return err
}

// GetByUserID retrieves all credentials for a user.
func (s *CredentialStore) GetByUserID(ctx context.Context, userID identity.UserID) ([]*identity.Credential, error) {
	query := `SELECT * FROM identity.user_credentials WHERE user_id = $1`
	var dbList []*credentialDB
	if err := s.db.SelectContext(ctx, &dbList, query, userID); err != nil {
		return nil, err
	}
	result := make([]*identity.Credential, len(dbList))
	for i, db := range dbList {
		result[i] = toDomainCredential(db)
	}
	return result, nil
}

// GetByUserIDAndAuthType retrieves a specific credential for a user.
func (s *CredentialStore) GetByUserIDAndAuthType(ctx context.Context, userID identity.UserID, authType string) (*identity.Credential, error) {
	query := `SELECT * FROM identity.user_credentials WHERE user_id = $1 AND auth_type = $2`
	var db credentialDB
	if err := s.db.GetContext(ctx, &db, query, userID, authType); err != nil {
		return nil, err
	}
	return toDomainCredential(&db), nil
}

// Delete removes a credential for a user.
func (s *CredentialStore) Delete(ctx context.Context, userID identity.UserID, authType string) error {
	query := `DELETE FROM identity.user_credentials WHERE user_id = $1 AND auth_type = $2`
	result, err := s.db.ExecContext(ctx, query, userID, authType)
	if err != nil {
		return err
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return errors.New("delete failed: credential not found")
	}
	return nil
}
