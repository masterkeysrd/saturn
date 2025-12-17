package identitypg

import (
	"context"
	"errors"

	"github.com/jmoiron/sqlx"
	"github.com/masterkeysrd/saturn/internal/domain/identity"
)

var _ identity.CredentialStore = (*CredentialStore)(nil)

type CredentialStore struct {
	db *sqlx.DB
}

func NewCredentialStore(db *sqlx.DB) (*CredentialStore, error) {
	return &CredentialStore{
		db: db,
	}, nil
}

func (s *CredentialStore) Store(ctx context.Context, credential *identity.Credential) error {
	_, err := s.db.NamedExecContext(ctx, UpsertCredentialsQuery, NewCredentialEntityFromModel(credential))
	return err
}

func (s *CredentialStore) GetBy(ctx context.Context, criteria identity.GetCredentialCriteria) (*identity.Credential, error) {
	var (
		query string
		args  []any
		err   error
	)

	switch c := criteria.(type) {
	case identity.ByIdentifier:
		query, args, err = s.db.BindNamed(GetCredentialsByIdentifierQuery, GetCredentialsByIdentifierParams{
			Identifier: string(c),
		})
	default:
		return nil, errors.New("unsupported criteria type")
	}

	if err != nil {
		return nil, err
	}

	query = s.db.Rebind(query)
	var entity VaultCredentialEntity
	if err := s.db.GetContext(ctx, &entity, query, args...); err != nil {
		return nil, err
	}

	return entity.ToModel(), nil
}

func (s *CredentialStore) ExistsBy(ctx context.Context, criteria identity.ExistsCredentialCriteria) (bool, error) {
	var (
		query string
		args  []any
		err   error
	)

	switch c := criteria.(type) {
	case identity.ByEmail:
		params := ExistsCredentialsByEmailParams{
			Email: string(c),
		}
		query, args, err = s.db.BindNamed(ExistsCredentialsByEmailQuery, params)
	case identity.ByUsername:
		params := ExistsCredentialsByUsernameParams{
			Username: string(c),
		}
		query, args, err = s.db.BindNamed(ExistsCredentialsByUsernameQuery, params)
	default:
		return false, errors.New("unsupported criteria type")
	}

	if err != nil {
		return false, err
	}

	query = s.db.Rebind(query)

	var exists bool
	if err := s.db.GetContext(ctx, &exists, query, args...); err != nil {
		return false, err
	}

	return exists, nil
}

func NewCredentialEntityFromModel(credential *identity.Credential) *VaultCredentialEntity {
	return &VaultCredentialEntity{
		SubjectId:    credential.SubjectID.String(),
		Username:     credential.Username,
		Email:        credential.Email,
		PasswordHash: credential.PasswordHash,
		CreateTime:   credential.CreateTime,
		UpdateTime:   credential.UpdateTime,
	}
}

func (e *VaultCredentialEntity) ToModel() *identity.Credential {
	return &identity.Credential{
		SubjectID:    identity.SubjectID(e.SubjectId),
		Username:     e.Username,
		Email:        e.Email,
		PasswordHash: e.PasswordHash,
		CreateTime:   e.CreateTime,
		UpdateTime:   e.UpdateTime,
	}
}
