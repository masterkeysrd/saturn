package storage

import (
	"context"

	"github.com/doug-martin/goqu/v9"
	"github.com/masterkeysrd/saturn/internal/domain/identity"
	"github.com/masterkeysrd/saturn/internal/platform/db"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

// credentialDB is the internal DB record type for identity.user_credentials.
type credentialDB struct {
	UserID     string `db:"user_id"`
	AuthType   string `db:"auth_type"`
	SecretData string `db:"secret_data"`
}

// CredentialStore implements identity.UserCredentialStore using db.DB.
type CredentialStore struct {
	db db.DB
}

// NewCredentialStore creates a new CredentialStore.
func NewCredentialStore(database db.DB) *CredentialStore {
	return &CredentialStore{db: database}
}

// toDomainCredential converts a credentialDB to a domain Credential.
func toDomainCredential(c *credentialDB) *identity.Credential {
	return &identity.Credential{
		UserID:     identity.UserID(c.UserID),
		AuthType:   c.AuthType,
		SecretData: c.SecretData,
	}
}

// toDBCredential converts a domain Credential to a credentialDB.
func toDBCredential(c *identity.Credential) *credentialDB {
	return &credentialDB{
		UserID:     string(c.UserID),
		AuthType:   c.AuthType,
		SecretData: c.SecretData,
	}
}

// Create inserts a new credential for the given user.
func (s *CredentialStore) Create(ctx context.Context, credential *identity.Credential) error {
	const op errors.Op = "domain/identity/storage.CreateCredential"

	dbRecord := toDBCredential(credential)
	q, args, err := pgDialect.Insert(goqu.T("user_credentials").Schema("identity")).
		Rows(goqu.Record{
			"user_id":     dbRecord.UserID,
			"auth_type":   dbRecord.AuthType,
			"secret_data": dbRecord.SecretData,
		}).
		OnConflict(goqu.DoUpdate("user_id, auth_type", goqu.Record{
			"secret_data": dbRecord.SecretData,
		})).
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

// GetByUserID retrieves all credentials for a user.
func (s *CredentialStore) GetByUserID(ctx context.Context, userID identity.UserID) ([]*identity.Credential, error) {
	const op errors.Op = "domain/identity/storage.GetCredentialsByUserID"

	q, args, err := pgDialect.From(goqu.T("user_credentials").Schema("identity")).
		Where(goqu.C("user_id").Eq(string(userID))).
		Prepared(true).
		ToSQL()
	if err != nil {
		return nil, errors.E(op, err)
	}

	var dbList []*credentialDB
	if err := s.db.Select(ctx, &dbList, q, args...); err != nil {
		return nil, errors.E(op, err)
	}

	result := make([]*identity.Credential, len(dbList))
	for i, db := range dbList {
		result[i] = toDomainCredential(db)
	}
	return result, nil
}

// GetByUserIDAndAuthType retrieves a specific credential for a user.
func (s *CredentialStore) GetByUserIDAndAuthType(ctx context.Context, userID identity.UserID, authType string) (*identity.Credential, error) {
	const op errors.Op = "domain/identity/storage.GetCredentialByUserIDAndAuthType"

	q, args, err := pgDialect.From(goqu.T("user_credentials").Schema("identity")).
		Where(
			goqu.C("user_id").Eq(string(userID)),
			goqu.C("auth_type").Eq(authType),
		).
		Prepared(true).
		ToSQL()
	if err != nil {
		return nil, errors.E(op, err)
	}

	var db credentialDB
	if err := s.db.Get(ctx, &db, q, args...); err != nil {
		return nil, errors.E(op, err)
	}
	return toDomainCredential(&db), nil
}

// Delete removes a credential for a user.
func (s *CredentialStore) Delete(ctx context.Context, userID identity.UserID, authType string) error {
	const op errors.Op = "domain/identity/storage.DeleteCredential"

	q, args, err := pgDialect.Delete(goqu.T("user_credentials").Schema("identity")).
		Where(
			goqu.C("user_id").Eq(string(userID)),
			goqu.C("auth_type").Eq(authType),
		).
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

// Update replaces the secret_data for an existing credential.
func (s *CredentialStore) Update(ctx context.Context, credential *identity.Credential) error {
	const op errors.Op = "domain/identity/storage.UpdateCredential"

	dbRecord := toDBCredential(credential)
	q, args, err := pgDialect.Update(goqu.T("user_credentials").Schema("identity")).
		Set(goqu.Record{
			"secret_data": dbRecord.SecretData,
		}).
		Where(
			goqu.C("user_id").Eq(dbRecord.UserID),
			goqu.C("auth_type").Eq(dbRecord.AuthType),
		).
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
