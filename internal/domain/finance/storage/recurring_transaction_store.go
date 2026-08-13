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

type recurringTransactionDB struct {
	ID              string         `db:"id"`
	SpaceID         string         `db:"space_id"`
	BudgetID        sql.NullString `db:"budget_id"`
	Name            string         `db:"name"`
	Amount          int64          `db:"amount"`
	Currency        string         `db:"currency"`
	Interval        string         `db:"interval"`
	NextDueDate     time.Time      `db:"next_due_date"`
	IsVariable      bool           `db:"is_variable"`
	Status          string         `db:"status"`
	GracePeriodDays int32          `db:"grace_period_days"`
	Type            string         `db:"type"`
	AccountID       sql.NullString `db:"account_id"`
	Version         int64          `db:"version"`
	CreateTime      sql.NullTime   `db:"create_time"`
	UpdateTime      sql.NullTime   `db:"update_time"`
}

func (r *recurringTransactionDB) toDomain() *finance.RecurringTransaction {
	var budgetID *finance.BudgetID
	if r.BudgetID.Valid && r.BudgetID.String != "" {
		bID := finance.BudgetID(r.BudgetID.String)
		budgetID = &bID
	}
	var accountID *finance.AccountID
	if r.AccountID.Valid && r.AccountID.String != "" {
		aID := finance.AccountID(r.AccountID.String)
		accountID = &aID
	}

	return &finance.RecurringTransaction{
		ID:              finance.RecurringTransactionID(r.ID),
		SpaceID:         finance.SpaceID(r.SpaceID),
		BudgetID:        budgetID,
		Name:            r.Name,
		Amount:          r.Amount,
		Currency:        finance.Currency(r.Currency),
		Interval:        finance.RecurrenceInterval(r.Interval),
		NextDueDate:     r.NextDueDate,
		IsVariable:      r.IsVariable,
		Status:          finance.RecurringTransactionStatus(r.Status),
		GracePeriodDays: r.GracePeriodDays,
		Type:            finance.TransactionType(r.Type),
		AccountID:       accountID,
		Version:         r.Version,
		CreateTime:      r.CreateTime.Time,
		UpdateTime:      r.UpdateTime.Time,
	}
}

type RecurringTransactionStore struct {
	db *sqlx.DB
}

func NewRecurringTransactionStore(db *sqlx.DB) *RecurringTransactionStore {
	return &RecurringTransactionStore{db: db}
}

func (s *RecurringTransactionStore) Create(ctx context.Context, re *finance.RecurringTransaction) error {
	if re.Version == 0 {
		re.Version = 1
	}
	var budgetID interface{}
	if re.BudgetID != nil {
		budgetID = string(*re.BudgetID)
	}
	var accountID interface{}
	if re.AccountID != nil {
		accountID = string(*re.AccountID)
	}

	ds := pgDialect.Insert(goqu.S("finance").Table("recurring_transaction")).Rows(goqu.Record{
		"id":                string(re.ID),
		"space_id":          string(re.SpaceID),
		"budget_id":         budgetID,
		"name":              re.Name,
		"amount":            re.Amount,
		"currency":          string(re.Currency),
		"interval":          string(re.Interval),
		"next_due_date":     re.NextDueDate,
		"is_variable":       re.IsVariable,
		"status":            string(re.Status),
		"grace_period_days": re.GracePeriodDays,
		"type":              string(re.Type),
		"account_id":        accountID,
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

func (s *RecurringTransactionStore) GetByID(ctx context.Context, spaceID finance.SpaceID, id finance.RecurringTransactionID) (*finance.RecurringTransaction, error) {
	ds := pgDialect.From(goqu.S("finance").Table("recurring_transaction")).
		Select("*").
		Where(goqu.Ex{"space_id": string(spaceID), "id": string(id)})
	query, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return nil, err
	}
	var row recurringTransactionDB
	if err := s.db.GetContext(ctx, &row, query, args...); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, errors.New("recurring transaction not found")
		}
		return nil, err
	}
	return row.toDomain(), nil
}

func (s *RecurringTransactionStore) GetByIDs(ctx context.Context, spaceID finance.SpaceID, ids []finance.RecurringTransactionID) ([]*finance.RecurringTransaction, error) {
	if len(ids) == 0 {
		return nil, nil
	}
	idStrings := make([]string, len(ids))
	for i, id := range ids {
		idStrings[i] = string(id)
	}

	ds := pgDialect.From(goqu.S("finance").Table("recurring_transaction")).
		Select("*").
		Where(goqu.Ex{"space_id": string(spaceID), "id": idStrings})
	query, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return nil, err
	}

	var rows []recurringTransactionDB
	if err := s.db.SelectContext(ctx, &rows, query, args...); err != nil {
		return nil, err
	}

	transactions := make([]*finance.RecurringTransaction, len(rows))
	for i := range rows {
		transactions[i] = rows[i].toDomain()
	}
	return transactions, nil
}

func (s *RecurringTransactionStore) Update(ctx context.Context, re *finance.RecurringTransaction) error {
	var budgetID interface{}
	if re.BudgetID != nil {
		budgetID = string(*re.BudgetID)
	}
	var accountID interface{}
	if re.AccountID != nil {
		accountID = string(*re.AccountID)
	}

	ds := pgDialect.Update(goqu.S("finance").Table("recurring_transaction")).
		Set(goqu.Record{
			"budget_id":         budgetID,
			"name":              re.Name,
			"amount":            re.Amount,
			"currency":          string(re.Currency),
			"interval":          string(re.Interval),
			"next_due_date":     re.NextDueDate,
			"is_variable":       re.IsVariable,
			"status":            string(re.Status),
			"grace_period_days": re.GracePeriodDays,
			"type":              string(re.Type),
			"account_id":        accountID,
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
		return finance.ErrRecurringTransactionVersionMismatch
	}
	re.Version++
	return nil
}

func (s *RecurringTransactionStore) Delete(ctx context.Context, id finance.RecurringTransactionID, opts finance.DeleteOptions) error {
	ds := pgDialect.Delete(goqu.S("finance").Table("recurring_transaction")).
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
			return finance.ErrRecurringTransactionVersionMismatch
		}
		return errors.New("recurring transaction not found")
	}
	return nil
}

func (s *RecurringTransactionStore) ListBySpace(ctx context.Context, spaceID finance.SpaceID, filter *finance.ListRecurringTransactionsFilter) (*paging.Page[*finance.RecurringTransaction], error) {
	if filter.PageSize <= 0 || filter.PageSize > 100 {
		filter.PageSize = 20
	}

	ds := pgDialect.From(goqu.S("finance").Table("recurring_transaction")).Select("*")
	ds = ds.Where(goqu.Ex{"space_id": string(spaceID)})

	if filter.Status != nil {
		ds = ds.Where(goqu.Ex{"status": string(*filter.Status)})
	}

	if filter.SearchQuery != nil && *filter.SearchQuery != "" {
		ds = ds.Where(goqu.I("name").ILike("%" + *filter.SearchQuery + "%"))
	}

	cursor, _ := paging.Decode(filter.NextPageToken)

	sortOrder := filter.Sort
	if !finance.IsRecurringTransactionSortField(sortOrder.Field) {
		sortOrder.Field = finance.DefaultRecurringTransactionSortField
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

	var rows []recurringTransactionDB
	if err := s.db.SelectContext(ctx, &rows, query, args...); err != nil {
		return nil, err
	}

	transactions := make([]*finance.RecurringTransaction, len(rows))
	for i := range rows {
		transactions[i] = rows[i].toDomain()
	}

	return paging.NewPage(transactions, int(filter.PageSize), func(e *finance.RecurringTransaction) paging.Cursor {
		return paging.Cursor{
			SortValue: e.GetSortValue(sortOrder.Field),
			ID:        string(e.ID),
		}
	}), nil
}

func (s *RecurringTransactionStore) ListPendingGeneration(ctx context.Context, maxDueDate time.Time) ([]*finance.RecurringTransaction, error) {
	ds := pgDialect.From(goqu.S("finance").Table("recurring_transaction")).
		Select("*").
		Where(goqu.Ex{
			"status":        string(finance.RecurringTransactionActive),
			"next_due_date": goqu.Op{"lte": maxDueDate},
		}).
		Order(goqu.I("next_due_date").Asc())
	query, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return nil, err
	}

	var rows []recurringTransactionDB
	if err := s.db.SelectContext(ctx, &rows, query, args...); err != nil {
		return nil, err
	}

	transactions := make([]*finance.RecurringTransaction, len(rows))
	for i := range rows {
		transactions[i] = rows[i].toDomain()
	}
	return transactions, nil
}
