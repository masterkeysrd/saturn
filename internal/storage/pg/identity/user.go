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
	entity, err := GetUserByID(ctx, s.db, &GetUserByIDParams{
		Id: userID.String(),
	})
	if err != nil {
		return nil, fmt.Errorf("failed to get user: %w", err)
	}
	return entity.ToModel(), nil
}

func (s *UserStore) Store(ctx context.Context, user *identity.User) error {
	_, err := UpsertUser(ctx, s.db, NewUserEntityFromModel(user))
	return err
}

func (s *UserStore) GetBy(ctx context.Context, criteria identity.GetUserCriteria) (*identity.User, error) {
	return nil, fmt.Errorf("not implemented")
}

func (s *UserStore) ExistsBy(ctx context.Context, criteria identity.UserExistCriteria) (bool, error) {
	var (
		exists bool
		err    error
	)

	switch c := criteria.(type) {
	case identity.ByUsername:
		exists, err = ExistsUserByUsername(ctx, s.db, &ExistsUserByUsernameParams{
			Username: string(c),
		})
	case identity.ByEmail:
		exists, err = ExistsUserByEmail(ctx, s.db, &ExistsUserByEmailParams{
			Email: string(c),
		})
	default:
		return false, fmt.Errorf("unsupported criteria type")
	}

	if err != nil {
		return false, fmt.Errorf("failed to check user existence: %w", err)
	}

	return exists, nil
}

func NewUserEntityFromModel(user *identity.User) *UserEntity {
	return &UserEntity{
		Id:         user.ID.String(),
		Name:       user.Name,
		AvatarUrl:  user.AvatarURL,
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
		ID:         identity.UserID(e.Id),
		Name:       e.Name,
		AvatarURL:  e.AvatarUrl,
		Username:   e.Username,
		Email:      e.Email,
		Role:       identity.Role(e.Role),
		Status:     identity.UserStatus(e.Status),
		CreateTime: e.CreateTime,
		UpdateTime: e.UpdateTime,
		DeleteTime: e.DeleteTime,
	}
}
