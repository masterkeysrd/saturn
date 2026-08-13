package storage

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/doug-martin/goqu/v9"
	"github.com/jmoiron/sqlx"
	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/platform/paging"
)

type recurringExpenseDB struct {
	ID              string       `db:"id"`
	SpaceID         string       `db:"space_id"`
	BudgetID        string       `db:"budget_id"`
	Name            string       `db:"name"`
	Amount          int64        `db:"amount"`
	Currency        string       `db:"currency"`
	Interval        string       `db:"interval"`
	NextDueDate     time.Time    `db:"next_due_date"`
	IsVariable      bool         `db:"is_variable"`
	Status          string       `db:"status"`
	GracePeriodDays int32        `db:"grace_period_days"`
	Version         int64        `db:"version"`
	CreateTime      sql.NullTime `db:"create_time"`
	UpdateTime      sql.NullTime `db:"update_time"`
}

func (r *recurringExpenseDB) toDomain() *finance.RecurringExpense {
	return &finance.RecurringExpense{
		ID:              finance.RecurringExpenseID(r.ID),
		SpaceID:         finance.SpaceID(r.SpaceID),
		BudgetID:        finance.BudgetID(r.BudgetID),
		Name:            r.Name,
		Amount:          r.Amount,
		Currency:        finance.Currency(r.Currency),
		Interval:        finance.RecurrenceInterval(r.Interval),
		NextDueDate:     r.NextDueDate,
		IsVariable:      r.IsVariable,
		Status:          finance.RecurringExpenseStatus(r.Status),
		GracePeriodDays: r.GracePeriodDays,
		Version:         r.Version,
		CreateTime:      r.CreateTime.Time,
		UpdateTime:      r.UpdateTime.Time,
	}
}

type RecurringExpenseStore struct {
	db *sqlx.DB
}

func NewRecurringExpenseStore(db *sqlx.DB) *RecurringExpenseStore {
	return &RecurringExpenseStore{db: db}
}

func (s *RecurringExpenseStore) Create(ctx context.Context, re *finance.RecurringExpense) error {
	if re.Version == 0 {
		re.Version = 1
	}
	ds := pgDialect.Insert(goqu.S("finance").Table("recurring_expense")).Rows(goqu.Record{
		"id":                string(re.ID),
		"space_id":          string(re.SpaceID),
		"budget_id":         string(re.BudgetID),
		"name":              re.Name,
		"amount":            re.Amount,
		"currency":          string(re.Currency),
		"interval":          string(re.Interval),
		"next_due_date":     re.NextDueDate,
		"is_variable":       re.IsVariable,
		"status":            string(re.Status),
		"grace_period_days": re.GracePeriodDays,
		"version":           re.Version,
		"create_time":       re.CreateTime,
		"update_time":       re.UpdateTime,
	})
	query, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return err
	}
	_, err = s.db.ExecContext(ctx, query, args...)
	return err
}

func (s *RecurringExpenseStore) GetByID(ctx context.Context, spaceID finance.SpaceID, id finance.RecurringExpenseID) (*finance.RecurringExpense, error) {
	ds := pgDialect.From(goqu.S("finance").Table("recurring_expense")).
		Select("*").
		Where(goqu.Ex{"space_id": string(spaceID), "id": string(id)})
	query, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return nil, err
	}
	var row recurringExpenseDB
	if err := s.db.GetContext(ctx, &row, query, args...); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, errors.New("recurring expense not found")
		}
		return nil, err
	}
	return row.toDomain(), nil
}

func (s *RecurringExpenseStore) GetByIDs(ctx context.Context, spaceID finance.SpaceID, ids []finance.RecurringExpenseID) ([]*finance.RecurringExpense, error) {
	if len(ids) == 0 {
		return nil, nil
	}
	idStrings := make([]string, len(ids))
	for i, id := range ids {
		idStrings[i] = string(id)
	}

	ds := pgDialect.From(goqu.S("finance").Table("recurring_expense")).
		Select("*").
		Where(goqu.Ex{"space_id": string(spaceID), "id": idStrings})
	query, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return nil, err
	}

	var rows []recurringExpenseDB
	if err := s.db.SelectContext(ctx, &rows, query, args...); err != nil {
		return nil, err
	}

	expenses := make([]*finance.RecurringExpense, len(rows))
	for i := range rows {
		expenses[i] = rows[i].toDomain()
	}
	return expenses, nil
}

func (s *RecurringExpenseStore) Update(ctx context.Context, re *finance.RecurringExpense) error {
	ds := pgDialect.Update(goqu.S("finance").Table("recurring_expense")).
		Set(goqu.Record{
			"budget_id":         string(re.BudgetID),
			"name":              re.Name,
			"amount":            re.Amount,
			"currency":          string(re.Currency),
			"interval":          string(re.Interval),
			"next_due_date":     re.NextDueDate,
			"is_variable":       re.IsVariable,
			"status":            string(re.Status),
			"grace_period_days": re.GracePeriodDays,
			"version":           goqu.L("version + 1"),
			"update_time":       re.UpdateTime,
		}).
		Where(goqu.Ex{
			"id":      string(re.ID),
			"version": re.Version,
		})
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
		return finance.ErrRecurringExpenseVersionMismatch
	}
	re.Version++
	return nil
}

func (s *RecurringExpenseStore) Delete(ctx context.Context, id finance.RecurringExpenseID, opts finance.DeleteOptions) error {
	ds := pgDialect.Delete(goqu.S("finance").Table("recurring_expense")).
		Where(goqu.Ex{"id": string(id)})
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
		if opts.Version > 0 {
			return finance.ErrRecurringExpenseVersionMismatch
		}
		return errors.New("recurring expense not found")
	}
	return nil
}

func (s *RecurringExpenseStore) ListBySpace(ctx context.Context, spaceID finance.SpaceID, filter *finance.ListRecurringExpensesFilter) (*paging.Page[*finance.RecurringExpense], error) {
	if filter.PageSize <= 0 || filter.PageSize > 100 {
		filter.PageSize = 20
	}

	ds := pgDialect.From(goqu.S("finance").Table("recurring_expense")).Select("*")
	ds = ds.Where(goqu.Ex{"space_id": string(spaceID)})

	if filter.Status != nil {
		ds = ds.Where(goqu.Ex{"status": string(*filter.Status)})
	}

	if filter.SearchQuery != nil && *filter.SearchQuery != "" {
		ds = ds.Where(goqu.I("name").ILike("%" + *filter.SearchQuery + "%"))
	}

	cursor, _ := paging.Decode(filter.NextPageToken)

	sortOrder := filter.Sort
	if !finance.IsRecurringExpenseSortField(sortOrder.Field) {
		sortOrder.Field = finance.DefaultRecurringExpenseSortField
		sortOrder.Ascending = false // default: newest first
	}

	ds = paging.ApplyPagination(ds, paging.Options{
		Sort:     sortOrder,
		Cursor:   cursor,
		PageSize: uint(filter.PageSize),
	})

	query, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return nil, err
	}

	var rows []recurringExpenseDB
	if err := s.db.SelectContext(ctx, &rows, query, args...); err != nil {
		return nil, err
	}

	expenses := make([]*finance.RecurringExpense, len(rows))
	for i := range rows {
		expenses[i] = rows[i].toDomain()
	}

	return paging.NewPage(expenses, int(filter.PageSize), func(e *finance.RecurringExpense) paging.Cursor {
		return paging.Cursor{
			SortValue: e.GetSortValue(sortOrder.Field),
			ID:        string(e.ID),
		}
	}), nil
}

func (s *RecurringExpenseStore) ListPendingGeneration(ctx context.Context, maxDueDate time.Time) ([]*finance.RecurringExpense, error) {
	ds := pgDialect.From(goqu.S("finance").Table("recurring_expense")).
		Select("*").
		Where(goqu.Ex{
			"status":        string(finance.RecurringExpenseActive),
			"next_due_date": goqu.Op{"lte": maxDueDate},
		}).
		Order(goqu.I("next_due_date").Asc())
	query, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return nil, err
	}

	var rows []recurringExpenseDB
	if err := s.db.SelectContext(ctx, &rows, query, args...); err != nil {
		return nil, err
	}

	expenses := make([]*finance.RecurringExpense, len(rows))
	for i := range rows {
		expenses[i] = rows[i].toDomain()
	}
	return expenses, nil
}
