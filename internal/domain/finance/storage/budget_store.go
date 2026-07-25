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
	IsActive         bool           `db:"is_active"`
	Icon             string         `db:"icon"`
	Color            string         `db:"color"`
	DefaultAccountID sql.NullString `db:"default_account_id"`
	CreateTime       sql.NullTime   `db:"create_time"`
	UpdateTime       sql.NullTime   `db:"update_time"`
}

func (row *budgetDB) toDomain() *finance.Budget {
	var defaultAccountID *finance.AccountID
	if row.DefaultAccountID.Valid {
		idVal := finance.AccountID(row.DefaultAccountID.String)
		defaultAccountID = &idVal
	}
	return &finance.Budget{
		ID:               finance.BudgetID(row.ID),
		SpaceID:          finance.SpaceID(row.SpaceID),
		Name:             row.Name,
		LimitAmount:      row.LimitAmount,
		Currency:         finance.Currency(row.Currency),
		Interval:         finance.RecurrenceInterval(row.Interval),
		IsActive:         row.IsActive,
		Icon:             row.Icon,
		Color:            row.Color,
		DefaultAccountID: defaultAccountID,
		CreateTime:       nullTimeToTime(row.CreateTime),
		UpdateTime:       nullTimeToTime(row.UpdateTime),
	}
}

type BudgetStore struct {
	db *sqlx.DB
}

func NewBudgetStore(db *sqlx.DB) *BudgetStore {
	return &BudgetStore{db: db}
}

func (s *BudgetStore) Create(ctx context.Context, b *finance.Budget) error {
	query := `INSERT INTO finance.budget (id, space_id, name, limit_amount, currency, interval, is_active, icon, color, default_account_id, create_time, update_time)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`
	var defaultAccountID sql.NullString
	if b.DefaultAccountID != nil {
		defaultAccountID = sql.NullString{String: string(*b.DefaultAccountID), Valid: true}
	}
	_, err := s.db.ExecContext(ctx, query, string(b.ID), string(b.SpaceID), b.Name, b.LimitAmount, string(b.Currency), string(b.Interval), b.IsActive, b.Icon, b.Color, defaultAccountID, b.CreateTime, b.UpdateTime)
	return err
}

func (s *BudgetStore) GetByID(ctx context.Context, id finance.BudgetID) (*finance.Budget, error) {
	var row budgetDB
	query := `SELECT * FROM finance.budget WHERE id = $1`
	if err := s.db.GetContext(ctx, &row, query, string(id)); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, finance.ErrBudgetNotFound
		}
		return nil, err
	}
	return row.toDomain(), nil
}

func (s *BudgetStore) Update(ctx context.Context, b *finance.Budget) error {
	query := `UPDATE finance.budget 
		SET name = $1, limit_amount = $2, currency = $3, interval = $4, is_active = $5, icon = $6, color = $7, default_account_id = $8, update_time = $9 
		WHERE id = $10`
	var defaultAccountID sql.NullString
	if b.DefaultAccountID != nil {
		defaultAccountID = sql.NullString{String: string(*b.DefaultAccountID), Valid: true}
	}
	res, err := s.db.ExecContext(ctx, query, b.Name, b.LimitAmount, string(b.Currency), string(b.Interval), b.IsActive, b.Icon, b.Color, defaultAccountID, b.UpdateTime, string(b.ID))
	if err != nil {
		return err
	}
	rows, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return finance.ErrBudgetNotFound
	}
	return nil
}

func (s *BudgetStore) Delete(ctx context.Context, id finance.BudgetID) error {
	query := `DELETE FROM finance.budget WHERE id = $1`
	res, err := s.db.ExecContext(ctx, query, string(id))
	if err != nil {
		return err
	}
	rows, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return finance.ErrBudgetNotFound
	}
	return nil
}

func (s *BudgetStore) ListBySpace(ctx context.Context, spaceID finance.SpaceID, filter *finance.ListBudgetsFilter) (*paging.Page[*finance.Budget], error) {
	if filter.PageSize <= 0 || filter.PageSize > 100 {
		filter.PageSize = 20
	}

	ds := pgDialect.From(goqu.S("finance").Table("budget")).Select("*")

	// Apply filter conditions
	ds = ds.Where(goqu.Ex{"space_id": string(spaceID)})

	if filter.ActiveOnly != nil && *filter.ActiveOnly {
		ds = ds.Where(goqu.Ex{"is_active": true})
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

func (s *BudgetStore) GetByIDs(ctx context.Context, ids []finance.BudgetID) ([]*finance.Budget, error) {
	if len(ids) == 0 {
		return nil, nil
	}
	idStrings := make([]string, len(ids))
	for i, id := range ids {
		idStrings[i] = string(id)
	}

	ds := pgDialect.From(goqu.S("finance").Table("budget")).
		Select("*").
		Where(goqu.Ex{"id": idStrings})
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
