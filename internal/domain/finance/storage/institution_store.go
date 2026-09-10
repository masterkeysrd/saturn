package storage

import (
	"context"
	"database/sql"
	"strings"
	"time"

	"github.com/doug-martin/goqu/v9"
	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/platform/db"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/paging"
	"github.com/masterkeysrd/saturn/internal/platform/sorting"
)

type institutionDB struct {
	ID         string       `db:"id"`
	SpaceID    string       `db:"space_id"`
	Name       string       `db:"name"`
	Domain     string       `db:"domain"`
	LogoURL    string       `db:"logo_url"`
	Color      string       `db:"color"`
	Version    int64        `db:"version"`
	CreateTime sql.NullTime `db:"create_time"`
	UpdateTime sql.NullTime `db:"update_time"`
}

func (row *institutionDB) toDomain() *finance.Institution {
	return &finance.Institution{
		ID:         finance.InstitutionID(row.ID),
		SpaceID:    finance.SpaceID(row.SpaceID),
		Name:       row.Name,
		Domain:     row.Domain,
		LogoURL:    row.LogoURL,
		Color:      row.Color,
		Version:    row.Version,
		CreateTime: nullTimeToTime(row.CreateTime),
		UpdateTime: nullTimeToTime(row.UpdateTime),
	}
}

func toDBInstitution(i *finance.Institution) institutionDB {
	return institutionDB{
		ID:         string(i.ID),
		SpaceID:    string(i.SpaceID),
		Name:       i.Name,
		Domain:     i.Domain,
		LogoURL:    i.LogoURL,
		Color:      i.Color,
		Version:    i.Version,
		CreateTime: sql.NullTime{Time: i.CreateTime, Valid: !i.CreateTime.IsZero()},
		UpdateTime: sql.NullTime{Time: i.UpdateTime, Valid: !i.UpdateTime.IsZero()},
	}
}

type InstitutionStore struct {
	db db.DB
}

func NewInstitutionStore(database db.DB) *InstitutionStore {
	return &InstitutionStore{db: database}
}

func (s *InstitutionStore) Create(ctx context.Context, inst *finance.Institution) error {
	const op errors.Op = "domain/finance/storage.CreateInstitution"
	if inst.Version == 0 {
		inst.Version = 1
	}
	query, args, err := pgDialect.Insert(goqu.S("finance").Table("institution")).
		Rows(toDBInstitution(inst)).
		ToSQL()
	if err != nil {
		return errors.E(op, err)
	}
	if _, err := s.db.Exec(ctx, query, args...); err != nil {
		return errors.E(op, err)
	}
	return nil
}

func (s *InstitutionStore) GetByID(ctx context.Context, spaceID finance.SpaceID, id finance.InstitutionID) (*finance.Institution, error) {
	const op errors.Op = "domain/finance/storage.GetInstitutionByID"
	query, args, err := pgDialect.From(goqu.S("finance").Table("institution")).
		Select(
			goqu.C("id"),
			goqu.C("space_id"),
			goqu.C("name"),
			goqu.C("domain"),
			goqu.C("logo_url"),
			goqu.C("color"),
			goqu.C("version"),
			goqu.C("create_time"),
			goqu.C("update_time"),
		).
		Where(goqu.Ex{"space_id": string(spaceID), "id": string(id)}).
		ToSQL()
	if err != nil {
		return nil, errors.E(op, err)
	}

	var row institutionDB
	if err := s.db.Get(ctx, &row, query, args...); err != nil {
		return nil, errors.E(op, err)
	}
	return row.toDomain(), nil
}

func (s *InstitutionStore) GetByName(ctx context.Context, spaceID finance.SpaceID, name string) (*finance.Institution, error) {
	const op errors.Op = "domain/finance/storage.GetInstitutionByName"
	query, args, err := pgDialect.From(goqu.S("finance").Table("institution")).
		Select(
			goqu.C("id"),
			goqu.C("space_id"),
			goqu.C("name"),
			goqu.C("domain"),
			goqu.C("logo_url"),
			goqu.C("color"),
			goqu.C("version"),
			goqu.C("create_time"),
			goqu.C("update_time"),
		).
		Where(goqu.Ex{"space_id": string(spaceID)}).
		Where(goqu.L("LOWER(name) = ?", strings.ToLower(strings.TrimSpace(name)))).
		ToSQL()
	if err != nil {
		return nil, errors.E(op, err)
	}

	var row institutionDB
	if err := s.db.Get(ctx, &row, query, args...); err != nil {
		return nil, errors.E(op, err)
	}
	return row.toDomain(), nil
}

func (s *InstitutionStore) GetByIDs(ctx context.Context, spaceID finance.SpaceID, ids []finance.InstitutionID) ([]*finance.Institution, error) {
	const op errors.Op = "domain/finance/storage.GetInstitutionsByIDs"
	if len(ids) == 0 {
		return nil, nil
	}
	idStrs := make([]string, len(ids))
	for i, id := range ids {
		idStrs[i] = string(id)
	}

	query, args, err := pgDialect.From(goqu.S("finance").Table("institution")).
		Select(
			goqu.C("id"),
			goqu.C("space_id"),
			goqu.C("name"),
			goqu.C("domain"),
			goqu.C("logo_url"),
			goqu.C("color"),
			goqu.C("version"),
			goqu.C("create_time"),
			goqu.C("update_time"),
		).
		Where(goqu.Ex{"space_id": string(spaceID), "id": idStrs}).
		ToSQL()
	if err != nil {
		return nil, errors.E(op, err)
	}

	var rows []institutionDB
	if err := s.db.Select(ctx, &rows, query, args...); err != nil {
		return nil, errors.E(op, err)
	}

	institutions := make([]*finance.Institution, len(rows))
	for i := range rows {
		institutions[i] = rows[i].toDomain()
	}
	return institutions, nil
}

func (s *InstitutionStore) Update(ctx context.Context, inst *finance.Institution) error {
	const op errors.Op = "domain/finance/storage.UpdateInstitution"
	row := toDBInstitution(inst)
	query, args, err := pgDialect.Update(goqu.S("finance").Table("institution")).
		Set(goqu.Record{
			"name":        row.Name,
			"domain":      row.Domain,
			"logo_url":    row.LogoURL,
			"color":       row.Color,
			"version":     goqu.L("version + 1"),
			"update_time": time.Now().UTC(),
		}).
		Where(goqu.Ex{"id": row.ID, "version": row.Version}).
		ToSQL()
	if err != nil {
		return errors.E(op, err)
	}

	if err := s.db.ExecOne(ctx, query, args...); err != nil {
		if errors.Is(err, errors.NotExist) {
			return errors.E(op, errors.Conflict, finance.InstitutionVersionMismatch, "institution version mismatch")
		}
		return errors.E(op, err)
	}
	inst.Version++
	return nil
}

func (s *InstitutionStore) Delete(ctx context.Context, spaceID finance.SpaceID, id finance.InstitutionID, opts finance.DeleteOptions) error {
	const op errors.Op = "domain/finance/storage.DeleteInstitution"
	ex := goqu.Ex{"space_id": string(spaceID), "id": string(id)}
	if opts.Version > 0 {
		ex["version"] = opts.Version
	}
	query, args, err := pgDialect.Delete(goqu.S("finance").Table("institution")).
		Where(ex).
		ToSQL()
	if err != nil {
		return errors.E(op, err)
	}

	if err := s.db.ExecOne(ctx, query, args...); err != nil {
		if opts.Version > 0 && errors.Is(err, errors.NotExist) {
			return errors.E(op, errors.Conflict, finance.InstitutionVersionMismatch, "institution version mismatch")
		}
		return errors.E(op, err)
	}
	return nil
}

func (s *InstitutionStore) ListBySpace(ctx context.Context, spaceID finance.SpaceID, filter *finance.ListInstitutionsFilter) (*paging.Page[*finance.Institution], error) {
	const op errors.Op = "domain/finance/storage.ListInstitutionsBySpace"
	if filter.PageSize <= 0 || filter.PageSize > 100 {
		filter.PageSize = 50
	}

	ds := pgDialect.From(goqu.S("finance").Table("institution")).Select(
		goqu.C("id"),
		goqu.C("space_id"),
		goqu.C("name"),
		goqu.C("domain"),
		goqu.C("logo_url"),
		goqu.C("color"),
		goqu.C("version"),
		goqu.C("create_time"),
		goqu.C("update_time"),
	).Where(goqu.Ex{"space_id": string(spaceID)})

	if filter.SearchQuery != nil && *filter.SearchQuery != "" {
		ds = ds.Where(goqu.I("name").ILike("%" + *filter.SearchQuery + "%"))
	}

	cursor, _ := paging.Decode(filter.NextPageToken)
	ds = paging.ApplyPagination(ds, paging.Options{
		Sort:     sorting.New("name", true),
		Cursor:   cursor,
		PageSize: uint(filter.PageSize),
	})

	query, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return nil, errors.E(op, err)
	}

	var rows []institutionDB
	if err := s.db.Select(ctx, &rows, query, args...); err != nil {
		return nil, errors.E(op, err)
	}

	institutions := make([]*finance.Institution, len(rows))
	for i := range rows {
		institutions[i] = rows[i].toDomain()
	}

	return paging.NewPage(institutions, int(filter.PageSize), func(i *finance.Institution) paging.Cursor {
		return paging.Cursor{
			SortValue: i.Name,
			ID:        string(i.ID),
		}
	}), nil
}
