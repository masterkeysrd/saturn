package storage

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/doug-martin/goqu/v9"
	_ "github.com/doug-martin/goqu/v9/dialect/postgres"
	"github.com/jmoiron/sqlx"
	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/platform/paging"
)

type budgetDB struct {
	ID               string         `db:"id"`
	SpaceID          string         `db:"space_id"`
	Name             string         `db:"name"`
	LimitAmount      int64          `db:"limit_amount"`
	Currency         string         `db:"currency"`
	Interval         string         `db:"interval"`
	Status           string         `db:"status"`
	Icon             string         `db:"icon"`
	Color            string         `db:"color"`
	DefaultAccountID sql.NullString `db:"default_account_id"`
	Version          int64          `db:"version"`
	CreateTime       sql.NullTime   `db:"create_time"`
	UpdateTime       sql.NullTime   `db:"update_time"`
}

func (row *budgetDB) toDomain() *finance.Budget {
	var defaultAccountID *finance.AccountID
	if row.DefaultAccountID.Valid {
		defaultAccountID = new(finance.AccountID(row.DefaultAccountID.String))
	}
	return &finance.Budget{
		ID:               finance.BudgetID(row.ID),
		SpaceID:          finance.SpaceID(row.SpaceID),
		Name:             row.Name,
		LimitAmount:      row.LimitAmount,
		Currency:         finance.Currency(row.Currency),
		Interval:         finance.RecurrenceInterval(row.Interval),
		Status:           finance.BudgetStatus(row.Status),
		Icon:             row.Icon,
		Color:            row.Color,
		DefaultAccountID: defaultAccountID,
		Version:          row.Version,
		CreateTime:       nullTimeToTime(row.CreateTime),
		UpdateTime:       nullTimeToTime(row.UpdateTime),
	}
}

func toDB(b *finance.Budget) budgetDB {
	var defaultAccountID sql.NullString
	if b.DefaultAccountID != nil {
		defaultAccountID = sql.NullString{String: string(*b.DefaultAccountID), Valid: true}
	}
	return budgetDB{
		ID:               string(b.ID),
		SpaceID:          string(b.SpaceID),
		Name:             b.Name,
		LimitAmount:      b.LimitAmount,
		Currency:         string(b.Currency),
		Interval:         string(b.Interval),
		Status:           string(b.Status),
		Icon:             b.Icon,
		Color:            b.Color,
		DefaultAccountID: defaultAccountID,
		Version:          b.Version,
		CreateTime:       sql.NullTime{Time: b.CreateTime, Valid: !b.CreateTime.IsZero()},
		UpdateTime:       sql.NullTime{Time: b.UpdateTime, Valid: !b.UpdateTime.IsZero()},
	}
}

type BudgetStore struct {
	db *sqlx.DB
}

func NewBudgetStore(db *sqlx.DB) *BudgetStore {
	return &BudgetStore{db: db.Unsafe()}
}

func (s *BudgetStore) Create(ctx context.Context, b *finance.Budget) error {
	if b.Version == 0 {
		b.Version = 1
	}
	query, args, err := pgDialect.Insert(goqu.S("finance").Table("budget")).
		Rows(toDB(b)).
		ToSQL()
	if err != nil {
		return err
	}
	_, err = s.db.ExecContext(ctx, query, args...)
	return err
}

func (s *BudgetStore) GetByID(ctx context.Context, spaceID finance.SpaceID, id finance.BudgetID) (*finance.Budget, error) {
	query, args, err := pgDialect.From(goqu.S("finance").Table("budget")).
		Select(
			goqu.C("id"),
			goqu.C("space_id"),
			goqu.C("name"),
			goqu.C("limit_amount"),
			goqu.C("currency"),
			goqu.C("interval"),
			goqu.C("status"),
			goqu.C("icon"),
			goqu.C("color"),
			goqu.C("default_account_id"),
			goqu.C("version"),
			goqu.C("create_time"),
			goqu.C("update_time"),
		).
		Where(goqu.Ex{"space_id": string(spaceID), "id": string(id)}).
		ToSQL()
	if err != nil {
		return nil, err
	}

	var row budgetDB
	if err := s.db.GetContext(ctx, &row, query, args...); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, finance.ErrBudgetNotFound
		}
		return nil, err
	}
	return row.toDomain(), nil
}

func (s *BudgetStore) Update(ctx context.Context, b *finance.Budget) error {
	row := toDB(b)
	query, args, err := pgDialect.Update(goqu.S("finance").Table("budget")).
		Set(goqu.Record{
			"name":               row.Name,
			"limit_amount":       row.LimitAmount,
			"currency":           row.Currency,
			"interval":           row.Interval,
			"status":             row.Status,
			"icon":               row.Icon,
			"color":              row.Color,
			"default_account_id": row.DefaultAccountID,
			"version":            goqu.L("version + 1"),
			"update_time":        row.UpdateTime,
		}).
		Where(goqu.Ex{
			"id":      row.ID,
			"version": row.Version,
		}).
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
		return finance.ErrBudgetVersionMismatch
	}
	b.Version++
	return nil
}

func (s *BudgetStore) Delete(ctx context.Context, spaceID finance.SpaceID, id finance.BudgetID, opts finance.DeleteOptions) error {
	ex := goqu.Ex{
		"space_id": string(spaceID),
		"id":       string(id),
	}
	if opts.Version > 0 {
		ex["version"] = opts.Version
	}

	query, args, err := pgDialect.Delete(goqu.S("finance").Table("budget")).
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
		if opts.Version > 0 {
			return finance.ErrBudgetVersionMismatch
		}
		return finance.ErrBudgetNotFound
	}
	return nil
}

func (s *BudgetStore) ListBySpace(ctx context.Context, spaceID finance.SpaceID, filter *finance.ListBudgetsFilter) (*paging.Page[*finance.Budget], error) {
	if filter.PageSize <= 0 || filter.PageSize > 100 {
		filter.PageSize = 20
	}

	ds := pgDialect.From(goqu.S("finance").Table("budget")).Select(
		goqu.C("id"),
		goqu.C("space_id"),
		goqu.C("name"),
		goqu.C("limit_amount"),
		goqu.C("currency"),
		goqu.C("interval"),
		goqu.C("status"),
		goqu.C("icon"),
		goqu.C("color"),
		goqu.C("default_account_id"),
		goqu.C("version"),
		goqu.C("create_time"),
		goqu.C("update_time"),
	)

	// Apply filter conditions
	ds = ds.Where(goqu.Ex{"space_id": string(spaceID)})

	if len(filter.Statuses) > 0 {
		statusStrs := make([]string, len(filter.Statuses))
		for i, st := range filter.Statuses {
			statusStrs[i] = string(st)
		}
		ds = ds.Where(goqu.Ex{"status": statusStrs})
	}

	if filter.SearchQuery != nil && *filter.SearchQuery != "" {
		ds = ds.Where(goqu.I("name").ILike("%" + *filter.SearchQuery + "%"))
	}

	// Keyset Cursor decoding
	cursor, _ := paging.Decode(filter.NextPageToken)

	// Map sort field name (e.g. limit_amount) to actual DB columns
	sortOrder := filter.Sort
	if !finance.IsBudgetSortField(sortOrder.Field) {
		sortOrder.Field = finance.DefaultBudgetSortField
	}

	// Apply sorting and keyset paging conditions
	ds = paging.ApplyPagination(ds, paging.Options{
		Sort:     sortOrder,
		Cursor:   cursor,
		PageSize: uint(filter.PageSize),
	})

	query, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return nil, fmt.Errorf("build sql query: %w", err)
	}

	var rows []budgetDB
	if err := s.db.SelectContext(ctx, &rows, query, args...); err != nil {
		return nil, fmt.Errorf("select context: %w", err)
	}

	budgets := make([]*finance.Budget, len(rows))
	for i := range rows {
		budgets[i] = rows[i].toDomain()
	}

	page := paging.NewPage(budgets, int(filter.PageSize), func(b *finance.Budget) paging.Cursor {
		return paging.Cursor{
			SortValue: b.GetSortValue(sortOrder.Field),
			ID:        string(b.ID),
		}
	})

	return page, nil
}

func (s *BudgetStore) GetByIDs(ctx context.Context, spaceID finance.SpaceID, ids []finance.BudgetID) ([]*finance.Budget, error) {
	if len(ids) == 0 {
		return nil, nil
	}
	idStrings := make([]string, len(ids))
	for i, id := range ids {
		idStrings[i] = string(id)
	}

	ds := pgDialect.From(goqu.S("finance").Table("budget")).
		Select(
			goqu.C("id"),
			goqu.C("space_id"),
			goqu.C("name"),
			goqu.C("limit_amount"),
			goqu.C("currency"),
			goqu.C("interval"),
			goqu.C("status"),
			goqu.C("icon"),
			goqu.C("color"),
			goqu.C("default_account_id"),
			goqu.C("version"),
			goqu.C("create_time"),
			goqu.C("update_time"),
		).
		Where(goqu.Ex{"space_id": string(spaceID), "id": idStrings})
	query, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return nil, err
	}

	var rows []budgetDB
	if err := s.db.SelectContext(ctx, &rows, query, args...); err != nil {
		return nil, err
	}

	budgets := make([]*finance.Budget, len(rows))
	for i := range rows {
		budgets[i] = rows[i].toDomain()
	}
	return budgets, nil
}
