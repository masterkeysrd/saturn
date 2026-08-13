package storage

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/doug-martin/goqu/v9"
	"github.com/jmoiron/sqlx"
	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/platform/paging"
)

type accountDB struct {
	ID             string         `db:"id"`
	SpaceID        string         `db:"space_id"`
	Name           string         `db:"name"`
	Type           string         `db:"type"`
	Currency       string         `db:"currency"`
	InitialBalance int64          `db:"initial_balance"`
	CurrentBalance int64          `db:"current_balance"`
	CreditLimit    int64          `db:"credit_limit"`
	IsDefault      bool           `db:"is_default"`
	IsActive       bool           `db:"is_active"`
	Color          string         `db:"color"`
	Notes          string         `db:"notes"`
	LastFour       string         `db:"last_four"`
	InstitutionID  sql.NullString `db:"institution_id"`
	Version        int64          `db:"version"`
	CreateTime     sql.NullTime   `db:"create_time"`
	UpdateTime     sql.NullTime   `db:"update_time"`
}

func (row *accountDB) toDomain() *finance.Account {
	var instID *finance.InstitutionID
	if row.InstitutionID.Valid {
		instID = new(finance.InstitutionID(row.InstitutionID.String))
	}
	return &finance.Account{
		ID:             finance.AccountID(row.ID),
		SpaceID:        finance.SpaceID(row.SpaceID),
		Name:           row.Name,
		Type:           finance.AccountType(row.Type),
		Currency:       finance.Currency(row.Currency),
		InitialBalance: row.InitialBalance,
		CurrentBalance: row.CurrentBalance,
		CreditLimit:    row.CreditLimit,
		IsDefault:      row.IsDefault,
		IsActive:       row.IsActive,
		Color:          row.Color,
		Notes:          row.Notes,
		LastFour:       row.LastFour,
		InstitutionID:  instID,
		Version:        row.Version,
		CreateTime:     nullTimeToTime(row.CreateTime),
		UpdateTime:     nullTimeToTime(row.UpdateTime),
	}
}

type AccountStore struct {
	db *sqlx.DB
}

func NewAccountStore(db *sqlx.DB) *AccountStore {
	return &AccountStore{db: db.Unsafe()}
}

func (s *AccountStore) Create(ctx context.Context, a *finance.Account) error {
	version := a.Version
	if version <= 0 {
		version = 1
	}
	ds := pgDialect.Insert(goqu.S("finance").Table("account")).Rows(goqu.Record{
		"id":              string(a.ID),
		"space_id":        string(a.SpaceID),
		"name":            a.Name,
		"type":            string(a.Type),
		"currency":        string(a.Currency),
		"initial_balance": a.InitialBalance,
		"current_balance": a.CurrentBalance,
		"credit_limit":    a.CreditLimit,
		"is_default":      a.IsDefault,
		"is_active":       a.IsActive,
		"color":           a.Color,
		"notes":           a.Notes,
		"last_four":       a.LastFour,
		"institution_id":  toNullString(a.InstitutionID),
		"version":         version,
		"create_time":     a.CreateTime,
		"update_time":     a.UpdateTime,
	})
	query, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return err
	}
	_, err = s.db.ExecContext(ctx, query, args...)
	if err == nil {
		a.Version = version
	}
	return err
}

func (s *AccountStore) GetByID(ctx context.Context, spaceID finance.SpaceID, id finance.AccountID) (*finance.Account, error) {
	ds := pgDialect.From(goqu.S("finance").Table("account")).Select("*").Where(goqu.Ex{"space_id": string(spaceID), "id": string(id)})
	query, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return nil, err
	}
	var row accountDB
	if err := s.db.GetContext(ctx, &row, query, args...); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, finance.ErrAccountNotFound
		}
		return nil, err
	}
	return row.toDomain(), nil
}

func (s *AccountStore) Update(ctx context.Context, a *finance.Account) error {
	currentVersion := a.Version
	newVersion := currentVersion + 1

	ds := pgDialect.Update(goqu.S("finance").Table("account")).
		Set(goqu.Record{
			"name":            a.Name,
			"type":            string(a.Type),
			"currency":        string(a.Currency),
			"initial_balance": a.InitialBalance,
			"current_balance": a.CurrentBalance,
			"credit_limit":    a.CreditLimit,
			"is_default":      a.IsDefault,
			"is_active":       a.IsActive,
			"color":           a.Color,
			"notes":           a.Notes,
			"last_four":       a.LastFour,
			"institution_id":  toNullString(a.InstitutionID),
			"version":         newVersion,
			"update_time":     a.UpdateTime,
		}).
		Where(goqu.Ex{"id": string(a.ID), "space_id": string(a.SpaceID)})

	if currentVersion > 0 {
		ds = ds.Where(goqu.Ex{"version": currentVersion})
	}

	query, args, err := ds.Prepared(true).ToSQL()
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
		return finance.ErrAccountVersionMismatch
	}
	a.Version = newVersion
	return nil
}

func (s *AccountStore) Delete(ctx context.Context, spaceID finance.SpaceID, id finance.AccountID, opts finance.DeleteOptions) error {
	ds := pgDialect.Delete(goqu.S("finance").Table("account")).
		Where(goqu.Ex{"space_id": string(spaceID), "id": string(id)})

	if opts.Version > 0 {
		ds = ds.Where(goqu.Ex{"version": opts.Version})
	}

	query, args, err := ds.Prepared(true).ToSQL()
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
		return finance.ErrAccountNotFound
	}
	return nil
}

func (s *AccountStore) ListBySpace(ctx context.Context, spaceID finance.SpaceID, filter *finance.ListAccountsFilter) (*paging.Page[*finance.Account], error) {
	if filter.PageSize <= 0 || filter.PageSize > 100 {
		filter.PageSize = 20
	}

	ds := pgDialect.From(goqu.S("finance").Table("account")).Select("*")
	ds = ds.Where(goqu.Ex{"space_id": string(spaceID)})

	if filter.ActiveOnly != nil && *filter.ActiveOnly {
		ds = ds.Where(goqu.Ex{"is_active": true})
	}

	if filter.LastFour != nil && *filter.LastFour != "" {
		ds = ds.Where(goqu.Ex{"last_four": *filter.LastFour})
	}

	if filter.SearchQuery != nil && *filter.SearchQuery != "" {
		ds = ds.Where(goqu.I("name").ILike("%" + *filter.SearchQuery + "%"))
	}

	cursor, _ := paging.Decode(filter.NextPageToken)

	sortOrder := filter.Sort
	if !finance.IsAccountSortField(sortOrder.Field) {
		sortOrder.Field = finance.DefaultAccountSortField
	}

	ds = paging.ApplyPagination(ds, paging.Options{
		Sort:     sortOrder,
		Cursor:   cursor,
		PageSize: uint(filter.PageSize),
	})

	query, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return nil, fmt.Errorf("build sql query: %w", err)
	}

	var rows []accountDB
	if err := s.db.SelectContext(ctx, &rows, query, args...); err != nil {
		return nil, fmt.Errorf("select context: %w", err)
	}

	accounts := make([]*finance.Account, len(rows))
	for i := range rows {
		accounts[i] = rows[i].toDomain()
	}

	page := paging.NewPage(accounts, int(filter.PageSize), func(a *finance.Account) paging.Cursor {
		return paging.Cursor{
			SortValue: a.GetSortValue(sortOrder.Field),
			ID:        string(a.ID),
		}
	})

	return page, nil
}

func (s *AccountStore) HasDefault(ctx context.Context, spaceID finance.SpaceID) (bool, error) {
	ds := pgDialect.From(goqu.S("finance").Table("account")).
		Select(goqu.L("1")).
		Where(goqu.Ex{"space_id": string(spaceID), "is_default": true}).
		Limit(1)
	query, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return false, err
	}
	var dummy int
	err = s.db.GetContext(ctx, &dummy, query, args...)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return false, nil
		}
		return false, err
	}
	return true, nil
}

func (s *AccountStore) UnsetDefaultsExcept(ctx context.Context, spaceID finance.SpaceID, id finance.AccountID) error {
	ds := pgDialect.Update(goqu.S("finance").Table("account")).
		Set(goqu.Record{"is_default": false}).
		Where(goqu.Ex{"space_id": string(spaceID)}, goqu.I("id").Neq(string(id)))
	query, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return err
	}
	_, err = s.db.ExecContext(ctx, query, args...)
	return err
}

func (s *AccountStore) HasAny(ctx context.Context, spaceID finance.SpaceID) (bool, error) {
	ds := pgDialect.From(goqu.S("finance").Table("account")).
		Select(goqu.L("1")).
		Where(goqu.Ex{"space_id": string(spaceID)}).
		Limit(1)
	query, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return false, err
	}
	var dummy int
	err = s.db.GetContext(ctx, &dummy, query, args...)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return false, nil
		}
		return false, err
	}
	return true, nil
}

func (s *AccountStore) GetByIDs(ctx context.Context, spaceID finance.SpaceID, ids []finance.AccountID) ([]*finance.Account, error) {
	if len(ids) == 0 {
		return nil, nil
	}
	idStrings := make([]string, len(ids))
	for i, id := range ids {
		idStrings[i] = string(id)
	}

	ds := pgDialect.From(goqu.S("finance").Table("account")).
		Select("*").
		Where(goqu.Ex{"space_id": string(spaceID), "id": idStrings})
	query, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return nil, err
	}

	var rows []accountDB
	if err := s.db.SelectContext(ctx, &rows, query, args...); err != nil {
		return nil, err
	}

	accounts := make([]*finance.Account, len(rows))
	for i := range rows {
		accounts[i] = rows[i].toDomain()
	}
	return accounts, nil
}

func toNullString(id *finance.InstitutionID) sql.NullString {
	if id == nil {
		return sql.NullString{Valid: false}
	}
	return sql.NullString{String: string(*id), Valid: true}
}
