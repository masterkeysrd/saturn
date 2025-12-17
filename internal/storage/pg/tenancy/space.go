package tenancypg

import (
	"context"
	"fmt"

	"github.com/jmoiron/sqlx"
	"github.com/masterkeysrd/saturn/internal/domain/tenancy"
	"github.com/masterkeysrd/saturn/internal/pkg/ptr"
)

var _ tenancy.SpaceStore = (*SpaceStore)(nil)

const (
	storeSpaceSQL = `
INSERT INTO tenancy.spaces (id, owner_id, name, alias, description, create_by, create_time, update_by, update_time)
VALUES (:id, :owner_id, :name, :alias, :description, :create_by, :create_time, :update_by, :update_time)
ON CONFLICT (id) DO UPDATE SET
  owner_id = EXCLUDED.owner_id,
  name = EXCLUDED.name,
  alias = EXCLUDED.alias,
  description = EXCLUDED.description,
  update_by = EXCLUDED.update_by,
  update_time = EXCLUDED.update_time
`
)

type SpaceStore struct {
	db *sqlx.DB
}

func NewSpaceStore(db *sqlx.DB) *SpaceStore {
	return &SpaceStore{db: db}
}

func (s *SpaceStore) Get(ctx context.Context, id tenancy.SpaceID) (*tenancy.Space, error) {
	return nil, nil
}

func (s *SpaceStore) ListBy(ctx context.Context, criteria tenancy.ListSpacesCriteria) ([]*tenancy.Space, error) {
	return nil, nil
}

func (s *SpaceStore) Store(ctx context.Context, space *tenancy.Space) error {
	result, err := s.db.NamedExecContext(ctx, storeSpaceSQL, NewSpaceEntityFromModel(space))
	if err != nil {
		return fmt.Errorf("failed to store space: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected after storing space: %w", err)
	}
	if rowsAffected == 0 {
		return fmt.Errorf("no rows affected when storing space")
	}
	return nil
}

func (s *SpaceStore) Delete(ctx context.Context, id tenancy.SpaceID) error {
	return nil
}

func NewSpaceEntityFromModel(space *tenancy.Space) *SpaceEntity {
	se := SpaceEntity{
		Id:          space.ID.String(),
		OwnerId:     space.OwnerID.String(),
		Name:        space.Name,
		Alias:       space.Alias,
		Description: space.Description,
		CreateTime:  space.CreateTime,
		CreateBy:    ptr.OfNonZero(space.CreateBy.String()),
		UpdateTime:  space.UpdateTime,
		UpdateBy:    ptr.OfNonZero(space.UpdateBy.String()),
		DeleteTime:  space.DeleteTime,
	}

	if space.DeleteBy != nil {
		se.DeleteBy = ptr.Of(space.DeleteBy.String())
	}

	return &se
}
