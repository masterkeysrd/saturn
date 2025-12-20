package tenancypg

import (
	"context"
	"fmt"

	"github.com/jmoiron/sqlx"
	"github.com/masterkeysrd/saturn/internal/domain/tenancy"
	"github.com/masterkeysrd/saturn/internal/foundation/audit"
	"github.com/masterkeysrd/saturn/internal/pkg/ptr"
)

var _ tenancy.SpaceStore = (*SpaceStore)(nil)

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
	spaces := make([]*tenancy.Space, 0, 10)
	mf := func(se *SpaceEntity) error {
		spaces = append(spaces, se.ToModel())
		return nil
	}

	var err error
	switch c := criteria.(type) {
	case tenancy.BySpaceIDs:
		params := ListSpacesBySpaceIDsParams{
			SpaceIds: make([]string, len(c)),
		}
		for i, sid := range c {
			params.SpaceIds.([]string)[i] = string(sid)
		}
		err = ListSpacesBySpaceIDs(ctx, s.db, &params, mf)
	default:
		return nil, fmt.Errorf("unsupported criteria type: %T", criteria)
	}
	if err != nil {
		return nil, err
	}

	return spaces, nil
}

func (s *SpaceStore) Store(ctx context.Context, space *tenancy.Space) error {
	result, err := UpsertSpace(ctx, s.db, NewSpaceEntityFromModel(space))
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

func (se *SpaceEntity) ToModel() *tenancy.Space {
	space := &tenancy.Space{
		ID:          tenancy.SpaceID(se.Id),
		OwnerID:     tenancy.UserID(se.OwnerId),
		Name:        se.Name,
		Alias:       se.Alias,
		Description: se.Description,
		Metadata: audit.Metadata{
			CreateTime: se.CreateTime,
			UpdateTime: se.UpdateTime,
		},
	}
	if se.CreateBy != nil {
		space.CreateBy = tenancy.UserID(*se.CreateBy)
	}
	if se.UpdateBy != nil {
		space.UpdateBy = tenancy.UserID(*se.UpdateBy)
	}
	if se.DeleteTime != nil {
		space.DeleteTime = se.DeleteTime
	}
	if se.DeleteBy != nil {
		db := tenancy.UserID(*se.DeleteBy)
		space.DeleteBy = &db
	}
	return space
}
