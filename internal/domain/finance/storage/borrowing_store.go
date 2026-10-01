package storage

import (
	"context"
	"database/sql"
	"time"

	"github.com/doug-martin/goqu/v9"
	_ "github.com/doug-martin/goqu/v9/dialect/postgres"
	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/platform/db"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/paging"
)

type BorrowingRecord struct {
	ID              string       `db:"id"`
	SpaceID         string       `db:"space_id"`
	Direction       string       `db:"direction"`
	Counterparty    string       `db:"counterparty"`
	ContactInfo     string       `db:"contact_info"`
	TotalAmount     int64        `db:"total_amount"`
	RemainingAmount int64        `db:"remaining_amount"`
	Currency        string       `db:"currency"`
	Status          string       `db:"status"`
	EstablishedAt   sql.NullTime `db:"established_at"`
	DueAt           sql.NullTime `db:"due_at"`
	Notes           string       `db:"notes"`
	Version         int64        `db:"version"`
	CreateTime      sql.NullTime `db:"create_time"`
	UpdateTime      sql.NullTime `db:"update_time"`
}

func (row *BorrowingRecord) toModel() *finance.Borrowing {
	var dueAtPtr *time.Time
	if row.DueAt.Valid {
		dueAtPtr = &row.DueAt.Time
	}

	return &finance.Borrowing{
		ID:              finance.BorrowingID(row.ID),
		Direction:       finance.BorrowingDirection(row.Direction),
		Counterparty:    row.Counterparty,
		ContactInfo:     row.ContactInfo,
		TotalAmount:     row.TotalAmount,
		RemainingAmount: row.RemainingAmount,
		Currency:        finance.Currency(row.Currency),
		Status:          finance.BorrowingStatus(row.Status),
		EstablishedAt:   nullTimeToTime(row.EstablishedAt),
		DueAt:           dueAtPtr,
		Notes:           row.Notes,
		Version:         row.Version,
		CreateTime:      nullTimeToTime(row.CreateTime),
		UpdateTime:      nullTimeToTime(row.UpdateTime),
	}
}

type BorrowingStore struct {
	db db.DB
}

func NewBorrowingStore(database db.DB) *BorrowingStore {
	return &BorrowingStore{db: database}
}

func (s *BorrowingStore) Create(ctx context.Context, rCtx finance.Context, b *finance.Borrowing) error {
	const op errors.Op = "domain/finance/storage.Create"
	version := b.Version
	if version == 0 {
		version = 1
	}

	ds := pgDialect.Insert(goqu.S("finance").Table("borrowing")).Rows(goqu.Record{
		"id":               string(b.ID),
		"space_id":         string(rCtx.SpaceID()),
		"direction":        string(b.Direction),
		"counterparty":     b.Counterparty,
		"contact_info":     b.ContactInfo,
		"total_amount":     b.TotalAmount,
		"remaining_amount": b.RemainingAmount,
		"currency":         string(b.Currency),
		"status":           string(b.Status),
		"established_at":   timeToNullTime(b.EstablishedAt),
		"due_at":           timeToNullTime(ptrToTime(b.DueAt)),
		"notes":            b.Notes,
		"version":          version,
		"create_time":      b.CreateTime,
		"update_time":      b.UpdateTime,
	})

	query, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return errors.E(op, err)
	}

	if _, err := s.db.Exec(ctx, query, args...); err != nil {
		return errors.E(op, err)
	}
	b.Version = version
	return nil
}

func (s *BorrowingStore) GetByID(ctx context.Context, rCtx finance.Context, id finance.BorrowingID) (*finance.Borrowing, error) {
	const op errors.Op = "domain/finance/storage.GetByID"
	ds := pgDialect.From(goqu.S("finance").Table("borrowing")).
		Select("*").
		Where(goqu.Ex{"space_id": string(rCtx.SpaceID()), "id": string(id)})

	query, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return nil, errors.E(op, err)
	}

	var row BorrowingRecord
	if err := s.db.Get(ctx, &row, query, args...); err != nil {
		return nil, errors.E(op, err)
	}

	return row.toModel(), nil
}

func (s *BorrowingStore) Update(ctx context.Context, rCtx finance.Context, b *finance.Borrowing) error {
	const op errors.Op = "domain/finance/storage.Update"
	currentVersion := b.Version
	newVersion := currentVersion + 1
	if currentVersion == 0 {
		newVersion = 1
	}

	ds := pgDialect.Update(goqu.S("finance").Table("borrowing")).
		Set(goqu.Record{
			"direction":        string(b.Direction),
			"counterparty":     b.Counterparty,
			"contact_info":     b.ContactInfo,
			"total_amount":     b.TotalAmount,
			"remaining_amount": b.RemainingAmount,
			"currency":         string(b.Currency),
			"status":           string(b.Status),
			"established_at":   timeToNullTime(b.EstablishedAt),
			"due_at":           timeToNullTime(ptrToTime(b.DueAt)),
			"notes":            b.Notes,
			"version":          newVersion,
			"update_time":      b.UpdateTime,
		}).
		Where(goqu.Ex{"id": string(b.ID), "space_id": string(rCtx.SpaceID())})

	if currentVersion > 0 {
		ds = ds.Where(goqu.Ex{"version": currentVersion})
	}

	query, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return errors.E(op, err)
	}

	if err := s.db.ExecOne(ctx, query, args...); err != nil {
		if errors.Is(err, errors.NotExist) {
			return errors.E(op, errors.Conflict, finance.VersionMismatch, "borrowing version mismatch")
		}
		return errors.E(op, err)
	}
	b.Version = newVersion
	return nil
}

func (s *BorrowingStore) Delete(ctx context.Context, rCtx finance.Context, id finance.BorrowingID) error {
	const op errors.Op = "domain/finance/storage.Delete"
	ds := pgDialect.
		Delete(goqu.S("finance").Table("borrowing")).
		Where(goqu.Ex{"id": string(id), "space_id": string(rCtx.SpaceID())})

	query, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return errors.E(op, err)
	}

	if err := s.db.ExecOne(ctx, query, args...); err != nil {
		return errors.E(op, err)
	}
	return nil
}

func (s *BorrowingStore) ListBySpace(ctx context.Context, rCtx finance.Context, filter *finance.ListBorrowingsFilter) ([]*finance.Borrowing, string, error) {
	const op errors.Op = "domain/finance/storage.ListBySpace"
	if filter.PageSize <= 0 {
		filter.PageSize = 20
	}

	ds := pgDialect.
		From(goqu.S("finance").Table("borrowing")).Select("*").
		Where(goqu.Ex{"space_id": string(rCtx.SpaceID())})

	if filter.Status != nil {
		ds = ds.Where(goqu.Ex{"status": string(*filter.Status)})
	}
	if filter.Direction != nil {
		ds = ds.Where(goqu.Ex{"direction": string(*filter.Direction)})
	}

	cursor, _ := paging.Decode(filter.NextPageToken)

	sortOrder := filter.Sort
	if !finance.IsBorrowingSortField(sortOrder.Field) {
		sortOrder.Field = finance.DefaultBorrowingSortField
	}

	ds = paging.ApplyPagination(ds, paging.Options{
		Sort:     sortOrder,
		Cursor:   cursor,
		PageSize: uint(filter.PageSize),
	})

	query, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return nil, "", errors.E(op, err)
	}

	var rows []BorrowingRecord
	if err := s.db.Select(ctx, &rows, query, args...); err != nil {
		return nil, "", errors.E(op, err)
	}

	borrowings := make([]*finance.Borrowing, len(rows))
	for i := range rows {
		borrowings[i] = rows[i].toModel()
	}

	page := paging.NewPage(borrowings, int(filter.PageSize), func(b *finance.Borrowing) paging.Cursor {
		return paging.Cursor{
			SortValue: b.GetSortValue(sortOrder.Field),
			ID:        string(b.ID),
		}
	})

	return page.Items, page.NextPageToken, nil
}

// Helpers
func ptrToTime(t *time.Time) time.Time {
	if t == nil {
		return time.Time{}
	}
	return *t
}
