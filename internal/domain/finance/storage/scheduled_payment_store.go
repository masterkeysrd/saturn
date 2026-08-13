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

type scheduledPaymentDB struct {
	ID         string       `db:"id"`
	SpaceID    string       `db:"space_id"`
	BudgetID   string       `db:"budget_id"`
	SourceType string       `db:"source_type"`
	SourceID   string       `db:"source_id"`
	Amount     int64        `db:"amount"`
	Currency   string       `db:"currency"`
	DueDate    time.Time    `db:"due_date"`
	Status     string       `db:"status"`
	Metadata   []byte       `db:"metadata"`
	CreateTime sql.NullTime `db:"create_time"`
	UpdateTime sql.NullTime `db:"update_time"`
}

func (r *scheduledPaymentDB) toDomain() *finance.ScheduledPayment {
	var meta finance.ScheduledPaymentMetadata
	if len(r.Metadata) > 0 {
		_ = json.Unmarshal(r.Metadata, &meta)
	}

	return &finance.ScheduledPayment{
		ID:         finance.ScheduledPaymentID(r.ID),
		SpaceID:    finance.SpaceID(r.SpaceID),
		BudgetID:   finance.BudgetID(r.BudgetID),
		SourceType: r.SourceType,
		SourceID:   r.SourceID,
		Amount:     r.Amount,
		Currency:   finance.Currency(r.Currency),
		DueDate:    r.DueDate,
		Status:     finance.ScheduledPaymentStatus(r.Status),
		Metadata:   meta,
		CreateTime: r.CreateTime.Time,
		UpdateTime: r.UpdateTime.Time,
	}
}

func marshalScheduledPaymentMetadata(meta finance.ScheduledPaymentMetadata) []byte {
	bytes, err := json.Marshal(meta)
	if err != nil {
		return []byte("{}")
	}
	return bytes
}

type ScheduledPaymentStore struct {
	db *sqlx.DB
}

func NewScheduledPaymentStore(db *sqlx.DB) *ScheduledPaymentStore {
	return &ScheduledPaymentStore{db: db}
}

func (s *ScheduledPaymentStore) Create(ctx context.Context, sp *finance.ScheduledPayment) error {
	ds := pgDialect.Insert(goqu.S("finance").Table("scheduled_payment")).Rows(goqu.Record{
		"id":          string(sp.ID),
		"space_id":    string(sp.SpaceID),
		"budget_id":   string(sp.BudgetID),
		"source_type": sp.SourceType,
		"source_id":   sp.SourceID,
		"amount":      sp.Amount,
		"currency":    string(sp.Currency),
		"due_date":    sp.DueDate,
		"status":      string(sp.Status),
		"metadata":    marshalScheduledPaymentMetadata(sp.Metadata),
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

func (s *ScheduledPaymentStore) GetByID(ctx context.Context, spaceID finance.SpaceID, id finance.ScheduledPaymentID) (*finance.ScheduledPayment, error) {
	ds := pgDialect.From(goqu.S("finance").Table("scheduled_payment")).
		Select("*").
		Where(goqu.Ex{"space_id": string(spaceID), "id": string(id)})
	query, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return nil, err
	}
	var row scheduledPaymentDB
	if err := s.db.GetContext(ctx, &row, query, args...); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, errors.New("scheduled payment not found")
		}
		return nil, err
	}
	return row.toDomain(), nil
}

func (s *ScheduledPaymentStore) Update(ctx context.Context, payment *finance.ScheduledPayment) error {
	ds := pgDialect.Update(goqu.S("finance").Table("scheduled_payment")).
		Set(goqu.Record{
			"budget_id":   string(payment.BudgetID),
			"source_type": payment.SourceType,
			"source_id":   payment.SourceID,
			"amount":      payment.Amount,
			"currency":    string(payment.Currency),
			"due_date":    payment.DueDate,
			"status":      string(payment.Status),
			"metadata":    marshalScheduledPaymentMetadata(payment.Metadata),
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
		return errors.New("scheduled payment not found")
	}
	return nil
}

func (s *ScheduledPaymentStore) UpdateStatus(ctx context.Context, id finance.ScheduledPaymentID, status finance.ScheduledPaymentStatus) error {
	ds := pgDialect.Update(goqu.S("finance").Table("scheduled_payment")).
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
		return errors.New("scheduled payment not found")
	}
	return nil
}

func (s *ScheduledPaymentStore) Delete(ctx context.Context, id finance.ScheduledPaymentID) error {
	ds := pgDialect.Delete(goqu.S("finance").Table("scheduled_payment")).
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
		return errors.New("scheduled payment not found")
	}
	return nil
}

func (s *ScheduledPaymentStore) ListBySpace(ctx context.Context, spaceID finance.SpaceID, filter *finance.ListScheduledPaymentsFilter) (*paging.Page[*finance.ScheduledPayment], error) {
	if filter.PageSize <= 0 || filter.PageSize > 100 {
		filter.PageSize = 20
	}

	ds := pgDialect.From(goqu.S("finance").Table("scheduled_payment")).Select("*")
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
	if !finance.IsScheduledPaymentSortField(sortOrder.Field) {
		sortOrder.Field = finance.DefaultScheduledPaymentSortField
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

	var rows []scheduledPaymentDB
	if err := s.db.SelectContext(ctx, &rows, query, args...); err != nil {
		return nil, err
	}

	payments := make([]*finance.ScheduledPayment, len(rows))
	for i := range rows {
		payments[i] = rows[i].toDomain()
	}

	return paging.NewPage(payments, int(filter.PageSize), func(p *finance.ScheduledPayment) paging.Cursor {
		return paging.Cursor{
			SortValue: p.GetSortValue(sortOrder.Field),
			ID:        string(p.ID),
		}
	}), nil
}

func (s *ScheduledPaymentStore) HasScheduledPayments(ctx context.Context, spaceID finance.SpaceID, filter *finance.ListScheduledPaymentsFilter) (bool, error) {
	ds := pgDialect.From(goqu.S("finance").Table("scheduled_payment")).Select(goqu.L("1")).Where(goqu.Ex{"space_id": string(spaceID)})

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
