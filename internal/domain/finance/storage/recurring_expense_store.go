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
	query := `INSERT INTO finance.recurring_expense (id, space_id, budget_id, name, amount, currency, interval, next_due_date, is_variable, status, grace_period_days, create_time, update_time)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`
	_, err := s.db.ExecContext(ctx, query,
		string(re.ID), string(re.SpaceID), string(re.BudgetID), re.Name, re.Amount, string(re.Currency),
		re.Interval, re.NextDueDate, re.IsVariable, string(re.Status), re.GracePeriodDays, re.CreateTime, re.UpdateTime,
	)
	return err
}

func (s *RecurringExpenseStore) GetByID(ctx context.Context, spaceID finance.SpaceID, id finance.RecurringExpenseID) (*finance.RecurringExpense, error) {
	var row recurringExpenseDB
	query := `SELECT * FROM finance.recurring_expense WHERE space_id = $1 AND id = $2`
	if err := s.db.GetContext(ctx, &row, query, string(spaceID), string(id)); err != nil {
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
	query := `UPDATE finance.recurring_expense SET 
		budget_id = $2, 
		name = $3, 
		amount = $4, 
		currency = $5, 
		interval = $6, 
		next_due_date = $7, 
		is_variable = $8, 
		status = $9, 
		grace_period_days = $10, 
		update_time = $11 
		WHERE id = $1`
	res, err := s.db.ExecContext(ctx, query,
		string(re.ID), string(re.BudgetID), re.Name, re.Amount, string(re.Currency),
		re.Interval, re.NextDueDate, re.IsVariable, string(re.Status), re.GracePeriodDays, re.UpdateTime,
	)
	if err != nil {
		return err
	}
	rows, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return errors.New("recurring expense not found")
	}
	return nil
}

func (s *RecurringExpenseStore) Delete(ctx context.Context, id finance.RecurringExpenseID) error {
	query := `DELETE FROM finance.recurring_expense WHERE id = $1`
	res, err := s.db.ExecContext(ctx, query, string(id))
	if err != nil {
		return err
	}
	rows, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
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
	var rows []recurringExpenseDB
	query := `SELECT * FROM finance.recurring_expense 
		WHERE status = 'active' AND next_due_date <= $1 
		ORDER BY next_due_date ASC`
	if err := s.db.SelectContext(ctx, &rows, query, maxDueDate); err != nil {
		return nil, err
	}

	expenses := make([]*finance.RecurringExpense, len(rows))
	for i := range rows {
		expenses[i] = rows[i].toDomain()
	}
	return expenses, nil
}
