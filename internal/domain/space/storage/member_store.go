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

// memberDB is the internal DB record type for space.member.
type memberDB struct {
	SpaceID    string       `db:"space_id"`
	UserID     string       `db:"user_id"`
	Role       string       `db:"role"`
	CreateTime sql.NullTime `db:"create_time"`
	UpdateTime sql.NullTime `db:"update_time"`
}

// MemberStore implements space.MemberStore using db.DB.
type MemberStore struct {
	db db.DB
}

// NewMemberStore creates a new MemberStore.
func NewMemberStore(database db.DB) *MemberStore {
	return &MemberStore{db: database}
}

// toDomainMember converts a memberDB to a domain Member.
func toDomainMember(m *memberDB) *space.Member {
	return &space.Member{
		SpaceID:    space.SpaceID(m.SpaceID),
		UserID:     space.SpaceID(m.UserID),
		Role:       space.SpaceRole(m.Role),
		CreateTime: nullTimeToTime(m.CreateTime),
		UpdateTime: nullTimeToTime(m.UpdateTime),
	}
}

// toDBMember converts a domain Member to a memberDB.
func toDBMember(m *space.Member) *memberDB {
	return &memberDB{
		SpaceID:    string(m.SpaceID),
		UserID:     string(m.UserID),
		Role:       string(m.Role),
		CreateTime: timeToNullTime(m.CreateTime),
		UpdateTime: timeToNullTime(m.UpdateTime),
	}
}

// Create inserts a new membership record.
func (s *MemberStore) Create(ctx context.Context, member *space.Member) error {
	const op errors.Op = "domain/space/storage.CreateMember"
	rec := toDBMember(member)
	ds := pgDialect.Insert(goqu.S("space").Table("member")).Rows(
		goqu.Record{
			"space_id":    rec.SpaceID,
			"user_id":     rec.UserID,
			"role":        rec.Role,
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

// GetByID retrieves a membership by space ID and user ID.
func (s *MemberStore) GetByID(ctx context.Context, spaceID space.SpaceID, userID space.SpaceID) (*space.Member, error) {
	const op errors.Op = "domain/space/storage.GetMemberByID"
	ds := pgDialect.From(goqu.S("space").Table("member")).
		Select("*").
		Where(goqu.Ex{
			"space_id": string(spaceID),
			"user_id":  string(userID),
		})
	query, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return nil, errors.E(op, err)
	}
	var rec memberDB
	if err := s.db.Get(ctx, &rec, query, args...); err != nil {
		return nil, errors.E(op, err)
	}
	return toDomainMember(&rec), nil
}

// Update modifies an existing membership.
func (s *MemberStore) Update(ctx context.Context, member *space.Member) error {
	const op errors.Op = "domain/space/storage.UpdateMember"
	ds := pgDialect.Update(goqu.S("space").Table("member")).
		Set(goqu.Record{
			"role":        string(member.Role),
			"update_time": goqu.L("NOW()"),
		}).
		Where(goqu.Ex{
			"space_id": string(member.SpaceID),
			"user_id":  string(member.UserID),
		})
	query, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return errors.E(op, err)
	}
	if err := s.db.ExecOne(ctx, query, args...); err != nil {
		return errors.E(op, err)
	}
	return nil
}

// Delete removes a membership.
func (s *MemberStore) Delete(ctx context.Context, spaceID space.SpaceID, userID space.SpaceID) error {
	const op errors.Op = "domain/space/storage.DeleteMember"
	ds := pgDialect.Delete(goqu.S("space").Table("member")).
		Where(goqu.Ex{
			"space_id": string(spaceID),
			"user_id":  string(userID),
		})
	query, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return errors.E(op, err)
	}
	if err := s.db.ExecOne(ctx, query, args...); err != nil {
		return errors.E(op, err)
	}
	return nil
}

// ListBySpace returns all members of a space.
func (s *MemberStore) ListBySpace(ctx context.Context, spaceID space.SpaceID, filter *space.ListMembersFilter) (*paging.Page[*space.Member], error) {
	const op errors.Op = "domain/space/storage.ListMembersBySpace"
	pageSize := filter.PageSize
	if pageSize <= 0 || pageSize > 100 {
		pageSize = 20
	}

	ds := pgDialect.From(goqu.S("space").Table("member")).
		Select("*").
		Where(goqu.Ex{"space_id": string(spaceID)})

	cursor, _ := paging.Decode(filter.NextPageToken)

	ds = paging.ApplyPagination(ds, paging.Options{
		Sort:     sorting.SortOrder{Field: "user_id", Ascending: true},
		Cursor:   cursor,
		PageSize: uint(pageSize),
		IDColumn: "user_id",
	})

	query, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return nil, errors.E(op, err)
	}

	var dbMembers []memberDB
	if err := s.db.Select(ctx, &dbMembers, query, args...); err != nil {
		return nil, errors.E(op, err)
	}

	members := make([]*space.Member, len(dbMembers))
	for i := range dbMembers {
		members[i] = toDomainMember(&dbMembers[i])
	}

	page := paging.NewPage(members, int(pageSize), func(m *space.Member) paging.Cursor {
		return paging.Cursor{
			SortValue: string(m.UserID),
			ID:        string(m.UserID),
		}
	})

	return page, nil
}

// ListByUser returns all spaces where the user is a member.
func (s *MemberStore) ListByUser(ctx context.Context, userID space.SpaceID) ([]*space.Member, error) {
	const op errors.Op = "domain/space/storage.ListMembersByUser"
	ds := pgDialect.From(goqu.S("space").Table("member")).
		Select("*").
		Where(goqu.Ex{"user_id": string(userID)}).
		Order(goqu.I("space_id").Asc())
	query, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return nil, errors.E(op, err)
	}

	var dbMembers []memberDB
	if err := s.db.Select(ctx, &dbMembers, query, args...); err != nil {
		return nil, errors.E(op, err)
	}

	members := make([]*space.Member, len(dbMembers))
	for i := range dbMembers {
		members[i] = toDomainMember(&dbMembers[i])
	}

	return members, nil
}

// Exists checks if a membership exists.
func (s *MemberStore) Exists(ctx context.Context, spaceID space.SpaceID, userID space.SpaceID) (bool, error) {
	const op errors.Op = "domain/space/storage.MemberExists"
	ds := pgDialect.From(goqu.S("space").Table("member")).
		Select(goqu.L("1")).
		Where(goqu.Ex{
			"space_id": string(spaceID),
			"user_id":  string(userID),
		}).
		Limit(1)
	query, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return false, errors.E(op, err)
	}

	var exists int
	err = s.db.Get(ctx, &exists, query, args...)
	if err != nil {
		if errors.Is(err, errors.NotExist) {
			return false, nil
		}
		return false, errors.E(op, err)
	}
	return true, nil
}
