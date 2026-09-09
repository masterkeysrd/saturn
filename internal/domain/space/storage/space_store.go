package storage

import (
	"context"
	"database/sql"

	"github.com/doug-martin/goqu/v9"
	"github.com/masterkeysrd/saturn/internal/domain/space"
	"github.com/masterkeysrd/saturn/internal/platform/db"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/paging"
	"github.com/masterkeysrd/saturn/internal/platform/sorting"
)

// spaceDB is the internal DB record type for space.space.
type spaceDB struct {
	ID          string       `db:"id"`
	Name        string       `db:"name"`
	Description *string      `db:"description"`
	OwnerID     string       `db:"owner_id"`
	Version     int64        `db:"version"`
	CreateTime  sql.NullTime `db:"create_time"`
	UpdateTime  sql.NullTime `db:"update_time"`
}

// SpaceStore implements space.SpaceStore using db.DB.
type SpaceStore struct {
	db db.DB
}

// NewSpaceStore creates a new SpaceStore.
func NewSpaceStore(database db.DB) *SpaceStore {
	return &SpaceStore{db: database}
}

// toDomainSpace converts a spaceDB to a domain Space.
func toDomainSpace(s *spaceDB) *space.Space {
	return &space.Space{
		ID:          space.SpaceID(s.ID),
		Name:        s.Name,
		Description: ptrToString(s.Description),
		OwnerID:     space.SpaceID(s.OwnerID),
		Version:     s.Version,
		CreateTime:  nullTimeToTime(s.CreateTime),
		UpdateTime:  nullTimeToTime(s.UpdateTime),
	}
}

// toDBSpace converts a domain Space to a spaceDB.
func toDBSpace(s *space.Space) *spaceDB {
	return &spaceDB{
		ID:          string(s.ID),
		Name:        s.Name,
		Description: strToPtr(s.Description),
		OwnerID:     string(s.OwnerID),
		Version:     s.Version,
		CreateTime:  timeToNullTime(s.CreateTime),
		UpdateTime:  timeToNullTime(s.UpdateTime),
	}
}

// Create inserts a new space and returns the created record.
func (s *SpaceStore) Create(ctx context.Context, sp *space.Space) error {
	const op errors.Op = "domain/space/storage.Create"
	rec := toDBSpace(sp)
	ds := pgDialect.Insert(goqu.S("space").Table("space")).Rows(
		goqu.Record{
			"id":          rec.ID,
			"name":        rec.Name,
			"description": rec.Description,
			"owner_id":    rec.OwnerID,
			"version":     rec.Version,
			"create_time": goqu.L("NOW()"),
			"update_time": goqu.L("NOW()"),
		},
	)
	query, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return errors.E(op, err)
	}
	if _, err := s.db.Exec(ctx, query, args...); err != nil {
		return errors.E(op, err)
	}
	return nil
}

// GetByID retrieves a space by its unique ID.
func (s *SpaceStore) GetByID(ctx context.Context, id space.SpaceID) (*space.Space, error) {
	const op errors.Op = "domain/space/storage.GetByID"
	ds := pgDialect.From(goqu.S("space").Table("space")).
		Select("*").
		Where(goqu.Ex{"id": string(id)})
	query, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return nil, errors.E(op, err)
	}
	var rec spaceDB
	if err := s.db.Get(ctx, &rec, query, args...); err != nil {
		return nil, errors.E(op, err)
	}
	return toDomainSpace(&rec), nil
}

// Update modifies an existing space with optimistic locking.
func (s *SpaceStore) Update(ctx context.Context, sp *space.Space) error {
	const op errors.Op = "domain/space/storage.Update"

	ds := pgDialect.Update(goqu.S("space").Table("space")).
		Set(goqu.Record{
			"name":        sp.Name,
			"description": strToPtr(sp.Description),
			"version":     sp.Version + 1,
			"update_time": goqu.L("NOW()"),
		}).
		Where(goqu.Ex{
			"id":      string(sp.ID),
			"version": sp.Version,
		})

	query, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return errors.E(op, err)
	}

	if err := s.db.ExecOne(ctx, query, args...); err != nil {
		if errors.Is(err, errors.NotExist) {
			return errors.E(op, errors.Conflict, space.VersionMismatch, "space was modified concurrently")
		}
		return errors.E(op, err)
	}
	sp.Version++
	return nil
}

// Delete removes a space by its unique ID.
func (s *SpaceStore) Delete(ctx context.Context, id space.SpaceID) error {
	const op errors.Op = "domain/space/storage.Delete"
	ds := pgDialect.Delete(goqu.S("space").Table("space")).
		Where(goqu.Ex{"id": string(id)})
	query, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return errors.E(op, err)
	}
	if err := s.db.ExecOne(ctx, query, args...); err != nil {
		return errors.E(op, err)
	}
	return nil
}

// ListByUser returns spaces owned or joined by the user.
func (s *SpaceStore) ListByUser(ctx context.Context, userID space.SpaceID, filter *space.ListSpacesFilter) (*paging.Page[*space.Space], error) {
	const op errors.Op = "domain/space/storage.ListByUser"
	pageSize := filter.PageSize
	if pageSize <= 0 || pageSize > 100 {
		pageSize = 20
	}

	ds := pgDialect.From(goqu.S("space").Table("space").As("sp")).
		Join(goqu.S("space").Table("member").As("m"),
			goqu.On(goqu.I("sp.id").Eq(goqu.I("m.space_id")))).
		Select(
			goqu.I("sp.id"),
			goqu.I("sp.name"),
			goqu.I("sp.description"),
			goqu.I("sp.owner_id"),
			goqu.I("sp.version"),
			goqu.I("sp.create_time"),
			goqu.I("sp.update_time"),
		).
		Distinct().
		Where(goqu.I("m.user_id").Eq(string(userID)))

	cursor, _ := paging.Decode(filter.NextPageToken)

	ds = paging.ApplyPagination(ds, paging.Options{
		Sort:     sorting.SortOrder{Field: "sp.id", Ascending: true},
		Cursor:   cursor,
		PageSize: uint(pageSize),
		IDColumn: "sp.id",
	})

	query, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return nil, errors.E(op, err)
	}

	var dbSpaces []spaceDB
	if err := s.db.Select(ctx, &dbSpaces, query, args...); err != nil {
		return nil, errors.E(op, err)
	}

	spaces := make([]*space.Space, len(dbSpaces))
	for i := range dbSpaces {
		spaces[i] = toDomainSpace(&dbSpaces[i])
	}

	page := paging.NewPage(spaces, int(pageSize), func(sp *space.Space) paging.Cursor {
		return paging.Cursor{
			SortValue: string(sp.ID),
			ID:        string(sp.ID),
		}
	})

	return page, nil
}

// ListByUserOwned returns spaces owned by the user (without needing member table).
func (s *SpaceStore) ListByUserOwned(ctx context.Context, ownerID space.SpaceID, filter *space.ListSpacesFilter) (*paging.Page[*space.Space], error) {
	const op errors.Op = "domain/space/storage.ListByUserOwned"
	pageSize := filter.PageSize
	if pageSize <= 0 || pageSize > 100 {
		pageSize = 20
	}

	ds := pgDialect.From(goqu.S("space").Table("space")).
		Select("*").
		Where(goqu.Ex{"owner_id": string(ownerID)})

	cursor, _ := paging.Decode(filter.NextPageToken)

	ds = paging.ApplyPagination(ds, paging.Options{
		Sort:     sorting.SortOrder{Field: "id", Ascending: true},
		Cursor:   cursor,
		PageSize: uint(pageSize),
		IDColumn: "id",
	})

	query, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return nil, errors.E(op, err)
	}

	var dbSpaces []spaceDB
	if err := s.db.Select(ctx, &dbSpaces, query, args...); err != nil {
		return nil, errors.E(op, err)
	}

	spaces := make([]*space.Space, len(dbSpaces))
	for i := range dbSpaces {
		spaces[i] = toDomainSpace(&dbSpaces[i])
	}

	page := paging.NewPage(spaces, int(pageSize), func(sp *space.Space) paging.Cursor {
		return paging.Cursor{
			SortValue: string(sp.ID),
			ID:        string(sp.ID),
		}
	})

	return page, nil
}
