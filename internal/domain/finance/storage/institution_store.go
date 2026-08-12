package storage

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/doug-martin/goqu/v9"
	"github.com/jmoiron/sqlx"
	"github.com/masterkeysrd/saturn/internal/domain/finance"
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
	db *sqlx.DB
}

func NewInstitutionStore(db *sqlx.DB) *InstitutionStore {
	return &InstitutionStore{db: db.Unsafe()}
}

func (s *InstitutionStore) Create(ctx context.Context, inst *finance.Institution) error {
	if inst.Version == 0 {
		inst.Version = 1
	}
	query, args, err := pgDialect.Insert(goqu.S("finance").Table("institution")).
		Rows(toDBInstitution(inst)).
		ToSQL()
	if err != nil {
		return err
	}
	_, err = s.db.ExecContext(ctx, query, args...)
	return err
}

func (s *InstitutionStore) GetByID(ctx context.Context, spaceID finance.SpaceID, id finance.InstitutionID) (*finance.Institution, error) {
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
		return nil, err
	}

	var row institutionDB
	if err := s.db.GetContext(ctx, &row, query, args...); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, errors.New("institution not found")
		}
		return nil, err
	}
	return row.toDomain(), nil
}

func (s *InstitutionStore) GetByName(ctx context.Context, spaceID finance.SpaceID, name string) (*finance.Institution, error) {
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
		return nil, err
	}

	var row institutionDB
	if err := s.db.GetContext(ctx, &row, query, args...); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, errors.New("institution not found")
		}
		return nil, err
	}
	return row.toDomain(), nil
}

func (s *InstitutionStore) GetByIDs(ctx context.Context, spaceID finance.SpaceID, ids []finance.InstitutionID) ([]*finance.Institution, error) {
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
		return nil, err
	}

	var rows []institutionDB
	if err := s.db.SelectContext(ctx, &rows, query, args...); err != nil {
		return nil, err
	}

	institutions := make([]*finance.Institution, len(rows))
	for i := range rows {
		institutions[i] = rows[i].toDomain()
	}
	return institutions, nil
}

func (s *InstitutionStore) Update(ctx context.Context, inst *finance.Institution) error {
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
		return err
	}

	res, err := s.db.ExecContext(ctx, query, args...)
	if err != nil {
		return err
	}
	rows, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return finance.ErrInstitutionVersionMismatch
	}
	inst.Version++
	return nil
}

func (s *InstitutionStore) Delete(ctx context.Context, spaceID finance.SpaceID, id finance.InstitutionID, opts finance.DeleteOptions) error {
	ex := goqu.Ex{"space_id": string(spaceID), "id": string(id)}
	if opts.Version > 0 {
		ex["version"] = opts.Version
	}
	query, args, err := pgDialect.Delete(goqu.S("finance").Table("institution")).
		Where(ex).
		ToSQL()
	if err != nil {
		return err
	}

	res, err := s.db.ExecContext(ctx, query, args...)
	if err != nil {
		return err
	}
	rows, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return errors.New("institution not found")
	}
	return nil
}

func (s *InstitutionStore) ListBySpace(ctx context.Context, spaceID finance.SpaceID, filter *finance.ListInstitutionsFilter) (*paging.Page[*finance.Institution], error) {
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
		return nil, fmt.Errorf("build sql query: %w", err)
	}

	var rows []institutionDB
	if err := s.db.SelectContext(ctx, &rows, query, args...); err != nil {
		return nil, fmt.Errorf("select context: %w", err)
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
