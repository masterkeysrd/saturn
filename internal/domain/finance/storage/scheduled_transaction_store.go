package storage

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"time"

	"github.com/doug-martin/goqu/v9"
	"github.com/jmoiron/sqlx"
	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/platform/paging"
)

type scheduledTransactionDB struct {
	ID         string         `db:"id"`
	SpaceID    string         `db:"space_id"`
	BudgetID   sql.NullString `db:"budget_id"`
	SourceType string         `db:"source_type"`
	SourceID   string         `db:"source_id"`
	Amount     int64          `db:"amount"`
	Currency   string         `db:"currency"`
	DueDate    time.Time      `db:"due_date"`
	Status     string         `db:"status"`
	Metadata   []byte         `db:"metadata"`
	Type       string         `db:"type"`
	AccountID  sql.NullString `db:"account_id"`
	CreateTime sql.NullTime   `db:"create_time"`
	UpdateTime sql.NullTime   `db:"update_time"`
}

func (r *scheduledTransactionDB) toDomain() *finance.ScheduledTransaction {
	var meta finance.ScheduledTransactionMetadata
	if len(r.Metadata) > 0 {
		_ = json.Unmarshal(r.Metadata, &meta)
	}

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

	return &finance.ScheduledTransaction{
		ID:         finance.ScheduledTransactionID(r.ID),
		SpaceID:    finance.SpaceID(r.SpaceID),
		BudgetID:   budgetID,
		SourceType: r.SourceType,
		SourceID:   r.SourceID,
		Amount:     r.Amount,
		Currency:   finance.Currency(r.Currency),
		DueDate:    r.DueDate,
		Status:     finance.ScheduledTransactionStatus(r.Status),
		Metadata:   meta,
		Type:       finance.TransactionType(r.Type),
		AccountID:  accountID,
		CreateTime: r.CreateTime.Time,
		UpdateTime: r.UpdateTime.Time,
	}
}

func marshalScheduledTransactionMetadata(meta finance.ScheduledTransactionMetadata) []byte {
	bytes, err := json.Marshal(meta)
	if err != nil {
		return []byte("{}")
	}
	return bytes
}

type ScheduledTransactionStore struct {
	db *sqlx.DB
}

func NewScheduledTransactionStore(db *sqlx.DB) *ScheduledTransactionStore {
	return &ScheduledTransactionStore{db: db}
}

func (s *ScheduledTransactionStore) Create(ctx context.Context, sp *finance.ScheduledTransaction) error {
	var budgetID interface{}
	if sp.BudgetID != nil {
		budgetID = string(*sp.BudgetID)
	}
	var accountID interface{}
	if sp.AccountID != nil {
		accountID = string(*sp.AccountID)
	}

	ds := pgDialect.Insert(goqu.S("finance").Table("scheduled_transaction")).Rows(goqu.Record{
		"id":          string(sp.ID),
		"space_id":    string(sp.SpaceID),
		"budget_id":   budgetID,
		"source_type": sp.SourceType,
		"source_id":   sp.SourceID,
		"amount":      sp.Amount,
		"currency":    string(sp.Currency),
		"due_date":    sp.DueDate,
		"status":      string(sp.Status),
		"metadata":    marshalScheduledTransactionMetadata(sp.Metadata),
		"type":        string(sp.Type),
		"account_id":  accountID,
		"create_time": sp.CreateTime,
		"update_time": sp.UpdateTime,
	})
	query, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return err
	}
	_, err = s.db.ExecContext(ctx, query, args...)
	return err
}

func (s *ScheduledTransactionStore) GetByID(ctx context.Context, spaceID finance.SpaceID, id finance.ScheduledTransactionID) (*finance.ScheduledTransaction, error) {
	ds := pgDialect.From(goqu.S("finance").Table("scheduled_transaction")).
		Select("*").
		Where(goqu.Ex{"space_id": string(spaceID), "id": string(id)})
	query, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return nil, err
	}
	var row scheduledTransactionDB
	if err := s.db.GetContext(ctx, &row, query, args...); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, errors.New("scheduled transaction not found")
		}
		return nil, err
	}
	return row.toDomain(), nil
}

func (s *ScheduledTransactionStore) Update(ctx context.Context, payment *finance.ScheduledTransaction) error {
	var budgetID interface{}
	if payment.BudgetID != nil {
		budgetID = string(*payment.BudgetID)
	}
	var accountID interface{}
	if payment.AccountID != nil {
		accountID = string(*payment.AccountID)
	}

	ds := pgDialect.Update(goqu.S("finance").Table("scheduled_transaction")).
		Set(goqu.Record{
			"budget_id":   budgetID,
			"source_type": payment.SourceType,
			"source_id":   payment.SourceID,
			"amount":      payment.Amount,
			"currency":    string(payment.Currency),
			"due_date":    payment.DueDate,
			"status":      string(payment.Status),
			"metadata":    marshalScheduledTransactionMetadata(payment.Metadata),
			"type":        string(payment.Type),
			"account_id":  accountID,
			"update_time": goqu.L("NOW()"),
		}).
		Where(goqu.Ex{
			"id":       string(payment.ID),
			"space_id": string(payment.SpaceID),
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
		return errors.New("scheduled transaction not found")
	}
	return nil
}

func (s *ScheduledTransactionStore) UpdateStatus(ctx context.Context, id finance.ScheduledTransactionID, status finance.ScheduledTransactionStatus) error {
	ds := pgDialect.Update(goqu.S("finance").Table("scheduled_transaction")).
		Set(goqu.Record{
			"status":      string(status),
			"update_time": goqu.L("NOW()"),
		}).
		Where(goqu.Ex{"id": string(id)})
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
		return errors.New("scheduled transaction not found")
	}
	return nil
}

func (s *ScheduledTransactionStore) Delete(ctx context.Context, id finance.ScheduledTransactionID) error {
	ds := pgDialect.Delete(goqu.S("finance").Table("scheduled_transaction")).
		Where(goqu.Ex{"id": string(id)})
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
		return errors.New("scheduled transaction not found")
	}
	return nil
}

func (s *ScheduledTransactionStore) ListBySpace(ctx context.Context, spaceID finance.SpaceID, filter *finance.ListScheduledTransactionsFilter) (*paging.Page[*finance.ScheduledTransaction], error) {
	if filter.PageSize <= 0 || filter.PageSize > 100 {
		filter.PageSize = 20
	}

	ds := pgDialect.From(goqu.S("finance").Table("scheduled_transaction")).Select("*")
	ds = ds.Where(goqu.Ex{"space_id": string(spaceID)})

	if filter.Status != nil {
		ds = ds.Where(goqu.Ex{"status": string(*filter.Status)})
	}

	if filter.StartDate != nil {
		ds = ds.Where(goqu.I("due_date").Gte(*filter.StartDate))
	}

	if filter.EndDate != nil {
		ds = ds.Where(goqu.I("due_date").Lte(*filter.EndDate))
	}

	if filter.SearchQuery != nil && *filter.SearchQuery != "" {
		ds = ds.Where(goqu.I("source_id").ILike("%" + *filter.SearchQuery + "%"))
	}

	cursor, _ := paging.Decode(filter.NextPageToken)

	sortOrder := filter.Sort
	if !finance.IsScheduledTransactionSortField(sortOrder.Field) {
		sortOrder.Field = finance.DefaultScheduledTransactionSortField
		sortOrder.Ascending = true // default: earliest due date first
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

	var rows []scheduledTransactionDB
	if err := s.db.SelectContext(ctx, &rows, query, args...); err != nil {
		return nil, err
	}

	transactions := make([]*finance.ScheduledTransaction, len(rows))
	for i := range rows {
		transactions[i] = rows[i].toDomain()
	}

	return paging.NewPage(transactions, int(filter.PageSize), func(p *finance.ScheduledTransaction) paging.Cursor {
		return paging.Cursor{
			SortValue: p.GetSortValue(sortOrder.Field),
			ID:        string(p.ID),
		}
	}), nil
}

func (s *ScheduledTransactionStore) HasScheduledTransactions(ctx context.Context, spaceID finance.SpaceID, filter *finance.ListScheduledTransactionsFilter) (bool, error) {
	ds := pgDialect.From(goqu.S("finance").Table("scheduled_transaction")).Select(goqu.L("1")).Where(goqu.Ex{"space_id": string(spaceID)})

	if filter != nil {
		if filter.BudgetID != nil {
			ds = ds.Where(goqu.Ex{"budget_id": string(*filter.BudgetID)})
		}
		if filter.Status != nil {
			ds = ds.Where(goqu.Ex{"status": string(*filter.Status)})
		}
		if filter.StartDate != nil {
			ds = ds.Where(goqu.I("due_date").Gte(*filter.StartDate))
		}
		if filter.EndDate != nil {
			ds = ds.Where(goqu.I("due_date").Lte(*filter.EndDate))
		}
	}

	query, args, err := ds.Limit(1).ToSQL()
	if err != nil {
		return false, err
	}

	var exists int
	err = s.db.QueryRowContext(ctx, query, args...).Scan(&exists)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return true, nil
}
