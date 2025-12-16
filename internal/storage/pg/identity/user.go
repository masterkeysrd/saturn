package identitypg

import (
	"context"
	"fmt"

	"github.com/jmoiron/sqlx"
	"github.com/masterkeysrd/saturn/internal/domain/identity"
	"github.com/masterkeysrd/saturn/internal/foundation/auth"
)

var _ identity.UserStore = (*UserStore)(nil)

type UserStore struct {
	db *sqlx.DB
}

func NewUserStore(db *sqlx.DB) (*UserStore, error) {
	return &UserStore{
		db: db,
	}, nil
}

func (s *UserStore) Get(ctx context.Context, userID auth.UserID) (*identity.User, error) {
	params := GetUserByIDParams{
		ID: userID.String(),
	}

	query, args, err := s.db.BindNamed(GetUserByIDQuery, params)
	if err != nil {
		return nil, err
	}

	query = s.db.Rebind(query)

	var entity UserEntity
	if err := s.db.GetContext(ctx, &entity, query, args...); err != nil {
		return nil, err
	}

	return entity.ToModel(), nil
}

func (s *UserStore) Store(ctx context.Context, user *identity.User) error {
	_, err := s.db.NamedExecContext(ctx, UpsertUserQuery, NewUserEntityFromModel(user))
	return err
}

func (s *UserStore) GetBy(ctx context.Context, criteria identity.GetUserCriteria) (*identity.User, error) {
	return nil, fmt.Errorf("not implemented")
}

func (s *UserStore) ExistsBy(ctx context.Context, criteria identity.UserExistCriteria) (bool, error) {
	var (
		query string
		args  []any
		err   error
	)

	switch c := criteria.(type) {
	case identity.ByUsername:
		query, args, err = s.db.BindNamed(ExistsUserByUsernameQuery, ExistsUserByUsernameParams{
			Username: string(c),
		})
	case identity.ByEmail:
		query, args, err = s.db.BindNamed(ExistsUserByEmailQuery, ExistsUserByEmailParams{
			Email: string(c),
		})
	default:
		return false, fmt.Errorf("unsupported criteria type")
	}

	if err != nil {
		return false, fmt.Errorf("failed to bind query: %w", err)
	}

	query = s.db.Rebind(query)
	var exists bool
	if err := s.db.GetContext(ctx, &exists, query, args...); err != nil {
		return false, fmt.Errorf("failed to execute query: %w", err)
	}

	return exists, nil
}

func NewUserEntityFromModel(user *identity.User) *UserEntity {
	return &UserEntity{
		ID:         user.ID.String(),
		Name:       user.Name,
		AvatarURL:  user.AvatarURL,
		Username:   user.Username,
		Email:      user.Email,
		Role:       user.Role.String(),
		Status:     user.Status.String(),
		CreateTime: user.CreateTime,
		UpdateTime: user.UpdateTime,
		DeleteTime: user.DeleteTime,
	}
}

func (e *UserEntity) ToModel() *identity.User {
	return &identity.User{
		ID:         identity.UserID(e.ID),
		Name:       e.Name,
		AvatarURL:  e.AvatarURL,
		Username:   e.Username,
		Email:      e.Email,
		Role:       identity.Role(e.Role),
		Status:     identity.UserStatus(e.Status),
		CreateTime: e.CreateTime,
		UpdateTime: e.UpdateTime,
		DeleteTime: e.DeleteTime,
	}
}
