package identitypg

import (
	"context"

	"github.com/jmoiron/sqlx"
	"github.com/masterkeysrd/saturn/internal/domain/identity"
)

var _ identity.BindingStore = (*BindingStore)(nil)

type BindingStore struct {
	db *sqlx.DB
}

func NewBindingStore(db *sqlx.DB) (*BindingStore, error) {
	return &BindingStore{
		db: db,
	}, nil
}

func (s *BindingStore) Get(ctx context.Context, id identity.BindingID) (*identity.Binding, error) {
	params := GetBindingByIDParams{
		UserID:   id.UserID.String(),
		Provider: id.Provider.String(),
	}

	query, args, err := s.db.BindNamed(GetBindingByIDQuery, params)
	if err != nil {
		return nil, err
	}

	query = s.db.Rebind(query)

	var entity BindingEntity
	if err := s.db.GetContext(ctx, &entity, query, args...); err != nil {
		return nil, err
	}

	return entity.ToBinding(), nil
}

func (s *BindingStore) List(ctx context.Context, userID identity.UserID) ([]*identity.Binding, error) {
	params := ListBindingsByUserIDParams{
		UserID: userID.String(),
	}

	query, args, err := s.db.BindNamed(ListBindingsByUserIDQuery, params)
	if err != nil {
		return nil, err
	}

	query = s.db.Rebind(query)

	var entities []BindingEntity
	if err := s.db.SelectContext(ctx, &entities, query, args...); err != nil {
		return nil, err
	}

	bindings := make([]*identity.Binding, len(entities))
	for i, entity := range entities {
		bindings[i] = entity.ToBinding()
	}

	return bindings, nil
}

func (s *BindingStore) Store(ctx context.Context, b *identity.Binding) error {
	params := NewBindingEntity(b)

	query, args, err := s.db.BindNamed(UpsertBindingQuery, params)
	if err != nil {
		return err
	}

	query = s.db.Rebind(query)

	_, err = s.db.ExecContext(ctx, query, args...)
	return err
}

func (s *BindingStore) Delete(ctx context.Context, id identity.BindingID) error {
	params := DeleteBindingParams{
		UserID:   id.UserID.String(),
		Provider: id.Provider.String(),
	}

	query, args, err := s.db.BindNamed(DeleteBindingQuery, params)
	if err != nil {
		return err
	}

	query = s.db.Rebind(query)

	_, err = s.db.ExecContext(ctx, query, args...)
	return err
}

func NewBindingEntity(b *identity.Binding) *BindingEntity {
	return &BindingEntity{
		UserID:     b.UserID.String(),
		Provider:   b.Provider.String(),
		SubjectID:  b.SubjectID.String(),
		CreateTime: b.CreateTime,
		UpdateTime: b.UpdateTime,
	}
}

func (e *BindingEntity) ToBinding() *identity.Binding {
	return &identity.Binding{
		BindingID: identity.BindingID{
			UserID:   identity.UserID(e.UserID),
			Provider: identity.ProviderType(e.Provider),
		},
		SubjectID:  identity.SubjectID(e.SubjectID),
		CreateTime: e.CreateTime,
		UpdateTime: e.UpdateTime,
	}
}
