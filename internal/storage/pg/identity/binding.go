package identitypg

import (
	"context"
	"fmt"

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
	entity, err := GetBindingByID(ctx, s.db, &GetBindingByIDParams{
		UserId:   id.UserID.String(),
		Provider: id.Provider.String(),
	})
	if err != nil {
		return nil, err
	}
	return entity.ToBinding(), nil
}

func (s *BindingStore) GetBy(ctx context.Context, criteria identity.GetBindingCriteria) (*identity.Binding, error) {
	var (
		entity *BindingEntity
		err    error
	)
	switch c := criteria.(type) {
	case identity.ByProviderAndSubjectID:
		entity, err = GetBindingByProviderAndSubjectID(ctx, s.db, &GetBindingByProviderAndSubjectIDParams{
			Provider:  c.Provider.String(),
			SubjectId: c.SubjectID.String(),
		})
	default:
		return nil, fmt.Errorf("unsupported GetBindingCriteria type: %T", criteria)
	}

	if err != nil {
		return nil, err
	}

	return entity.ToBinding(), nil
}

func (s *BindingStore) List(ctx context.Context, userID identity.UserID) ([]*identity.Binding, error) {
	bindings := make([]*identity.Binding, 0, 10)
	err := ListBindingsByUserID(ctx, s.db, &ListBindingsByUserIDParams{
		UserId: userID.String(),
	}, func(entity *BindingEntity) error {
		bindings = append(bindings, entity.ToBinding())
		return nil
	})
	if err != nil {
		return nil, err
	}
	return bindings, nil
}

func (s *BindingStore) Store(ctx context.Context, b *identity.Binding) error {
	_, err := UpsertBinding(ctx, s.db, NewBindingEntity(b))
	return err
}

func (s *BindingStore) Delete(ctx context.Context, id identity.BindingID) error {
	_, err := DeleteBinding(ctx, s.db, &DeleteBindingParams{
		UserId:   id.UserID.String(),
		Provider: id.Provider.String(),
	})
	return err
}

func NewBindingEntity(b *identity.Binding) *BindingEntity {
	return &BindingEntity{
		UserId:     b.UserID.String(),
		Provider:   b.Provider.String(),
		SubjectId:  b.SubjectID.String(),
		CreateTime: b.CreateTime,
		UpdateTime: b.UpdateTime,
	}
}

func (e *BindingEntity) ToBinding() *identity.Binding {
	return &identity.Binding{
		BindingID: identity.BindingID{
			UserID:   identity.UserID(e.UserId),
			Provider: identity.ProviderType(e.Provider),
		},
		SubjectID:  identity.SubjectID(e.SubjectId),
		CreateTime: e.CreateTime,
		UpdateTime: e.UpdateTime,
	}
}
