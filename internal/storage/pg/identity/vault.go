package identitypg

import (
	"context"
	"errors"
	"fmt"

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
	_, err := UpsertCredentials(ctx, s.db, NewCredentialEntityFromModel(credential))
	return err
}

func (s *CredentialStore) GetBy(ctx context.Context, criteria identity.GetCredentialCriteria) (*identity.Credential, error) {
	var entity *VaultCredentialEntity
	var err error

	switch c := criteria.(type) {
	case identity.ByIdentifier:
		entity, err = GetCredentialsByIdentifier(ctx, s.db, &GetCredentialsByIdentifierParams{
			Identifier: string(c),
		})
	default:
		return nil, errors.New("unsupported criteria type")
	}

	if err != nil {
		return nil, fmt.Errorf("failed to get credential: %w", err)
	}

	return entity.ToModel(), nil
}

func (s *CredentialStore) ExistsBy(ctx context.Context, criteria identity.ExistsCredentialCriteria) (bool, error) {
	var (
		exists bool
		err    error
	)

	switch c := criteria.(type) {
	case identity.ByEmail:
		exists, err = ExistsCredentialsByEmail(ctx, s.db, &ExistsCredentialsByEmailParams{
			Email: string(c),
		})
	case identity.ByUsername:
		exists, err = ExistsCredentialsByUsername(ctx, s.db, &ExistsCredentialsByUsernameParams{
			Username: string(c),
		})
	default:
		return false, errors.New("unsupported criteria type")
	}

	if err != nil {
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
