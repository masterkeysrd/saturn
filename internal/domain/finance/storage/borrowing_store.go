package storage

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/doug-martin/goqu/v9"
	_ "github.com/doug-martin/goqu/v9/dialect/postgres"
	"github.com/jmoiron/sqlx"
	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/platform/paging"
)

type borrowingDB struct {
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

func (row *borrowingDB) toDomain() *finance.Borrowing {
	var dueAtPtr *time.Time
	if row.DueAt.Valid {
		dueAtPtr = &row.DueAt.Time
	}

	return &finance.Borrowing{
		ID:              finance.BorrowingID(row.ID),
		SpaceID:         finance.SpaceID(row.SpaceID),
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
	db *sqlx.DB
}

func NewBorrowingStore(db *sqlx.DB) *BorrowingStore {
	return &BorrowingStore{db: db}
}

func (s *BorrowingStore) Create(ctx context.Context, b *finance.Borrowing) error {
	version := b.Version
	if version == 0 {
		version = 1
	}

	ds := pgDialect.Insert(goqu.S("finance").Table("borrowing")).Rows(goqu.Record{
		"id":               string(b.ID),
		"space_id":         string(b.SpaceID),
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
		return fmt.Errorf("build sql query: %w", err)
	}

	_, err = s.db.ExecContext(ctx, query, args...)
	if err == nil {
		b.Version = version
	}
	return err
}

func (s *BorrowingStore) GetByID(ctx context.Context, spaceID finance.SpaceID, id finance.BorrowingID) (*finance.Borrowing, error) {
	ds := pgDialect.From(goqu.S("finance").Table("borrowing")).
		Select("*").
		Where(goqu.Ex{"space_id": string(spaceID), "id": string(id)})

	query, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return nil, fmt.Errorf("build sql query: %w", err)
	}

	var row borrowingDB
	if err := s.db.GetContext(ctx, &row, query, args...); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, finance.ErrBorrowingNotFound
		}
		return nil, err
	}

	return row.toDomain(), nil
}

func (s *BorrowingStore) Update(ctx context.Context, b *finance.Borrowing) error {
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
		Where(goqu.Ex{"id": string(b.ID), "space_id": string(b.SpaceID)})

	if currentVersion > 0 {
		ds = ds.Where(goqu.Ex{"version": currentVersion})
	}

	query, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return fmt.Errorf("build sql query: %w", err)
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
		if currentVersion > 0 {
			return finance.ErrBorrowingVersionMismatch
		}
		return finance.ErrBorrowingNotFound
	}
	b.Version = newVersion
	return nil
}

func (s *BorrowingStore) Delete(ctx context.Context, id finance.BorrowingID) error {
	ds := pgDialect.Delete(goqu.S("finance").Table("borrowing")).Where(goqu.Ex{"id": string(id)})

	query, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return fmt.Errorf("build sql query: %w", err)
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
		return finance.ErrBorrowingNotFound
	}
	return nil
}

func (s *BorrowingStore) ListBySpace(ctx context.Context, spaceID finance.SpaceID, filter *finance.ListBorrowingsFilter) ([]*finance.Borrowing, string, error) {
	if filter.PageSize <= 0 {
		filter.PageSize = 20
	}

	ds := pgDialect.From(goqu.S("finance").Table("borrowing")).Select("*").Where(goqu.Ex{"space_id": string(spaceID)})

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
		return nil, "", fmt.Errorf("build sql query: %w", err)
	}

	var rows []borrowingDB
	if err := s.db.SelectContext(ctx, &rows, query, args...); err != nil {
		return nil, "", fmt.Errorf("select context: %w", err)
	}

	borrowings := make([]*finance.Borrowing, len(rows))
	for i := range rows {
		borrowings[i] = rows[i].toDomain()
	}

	page := paging.NewPage(borrowings, int(filter.PageSize), func(b *finance.Borrowing) paging.Cursor {
		return paging.Cursor{
			SortValue: b.GetSortValue(sortOrder.Field),
			ID:        string(b.ID),
		}
	})

	return page.Items, page.NextPageToken, nil
}

type borrowingRepaymentDB struct {
	ID          string         `db:"id"`
	BorrowingID string         `db:"borrowing_id"`
	SpaceID     string         `db:"space_id"`
	Amount      int64          `db:"amount"`
	PaymentDate sql.NullTime   `db:"payment_date"`
	Notes       string         `db:"notes"`
	AccountID   sql.NullString `db:"account_id"`
	CreateTime  sql.NullTime   `db:"create_time"`
	UpdateTime  sql.NullTime   `db:"update_time"`
}

func (row *borrowingRepaymentDB) toDomain() *finance.BorrowingRepayment {
	var accountIDPtr *finance.AccountID
	if row.AccountID.Valid {
		aID := finance.AccountID(row.AccountID.String)
		accountIDPtr = &aID
	}

	return &finance.BorrowingRepayment{
		ID:          finance.BorrowingRepaymentID(row.ID),
		BorrowingID: finance.BorrowingID(row.BorrowingID),
		SpaceID:     finance.SpaceID(row.SpaceID),
		Amount:      row.Amount,
		PaymentDate: nullTimeToTime(row.PaymentDate),
		Notes:       row.Notes,
		AccountID:   accountIDPtr,
		CreateTime:  nullTimeToTime(row.CreateTime),
		UpdateTime:  nullTimeToTime(row.UpdateTime),
	}
}

type BorrowingRepaymentStore struct {
	db *sqlx.DB
}

func NewBorrowingRepaymentStore(db *sqlx.DB) *BorrowingRepaymentStore {
	return &BorrowingRepaymentStore{db: db}
}

func (s *BorrowingRepaymentStore) Create(ctx context.Context, r *finance.BorrowingRepayment) error {
	var accountID sql.NullString
	if r.AccountID != nil {
		accountID = sql.NullString{String: string(*r.AccountID), Valid: true}
	}

	ds := pgDialect.Insert(goqu.S("finance").Table("borrowing_repayment")).Rows(goqu.Record{
		"id":           string(r.ID),
		"borrowing_id": string(r.BorrowingID),
		"space_id":     string(r.SpaceID),
		"amount":       r.Amount,
		"payment_date": timeToNullTime(r.PaymentDate),
		"notes":        r.Notes,
		"account_id":   accountID,
		"create_time":  r.CreateTime,
		"update_time":  r.UpdateTime,
	})

	query, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return fmt.Errorf("build sql query: %w", err)
	}

	_, err = s.db.ExecContext(ctx, query, args...)
	return err
}

func (s *BorrowingRepaymentStore) GetByID(ctx context.Context, spaceID finance.SpaceID, id finance.BorrowingRepaymentID) (*finance.BorrowingRepayment, error) {
	ds := pgDialect.From(goqu.S("finance").Table("borrowing_repayment")).
		Select("*").
		Where(goqu.Ex{"space_id": string(spaceID), "id": string(id)})

	query, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return nil, fmt.Errorf("build sql query: %w", err)
	}

	var row borrowingRepaymentDB
	if err := s.db.GetContext(ctx, &row, query, args...); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, finance.ErrRepaymentNotFound
		}
		return nil, err
	}

	return row.toDomain(), nil
}

func (s *BorrowingRepaymentStore) Delete(ctx context.Context, id finance.BorrowingRepaymentID) error {
	ds := pgDialect.Delete(goqu.S("finance").Table("borrowing_repayment")).Where(goqu.Ex{"id": string(id)})

	query, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return fmt.Errorf("build sql query: %w", err)
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
		return finance.ErrRepaymentNotFound
	}
	return nil
}

func (s *BorrowingRepaymentStore) ListByBorrowing(ctx context.Context, spaceID finance.SpaceID, borrowingID finance.BorrowingID) ([]*finance.BorrowingRepayment, error) {
	ds := pgDialect.From(goqu.S("finance").Table("borrowing_repayment")).
		Select("*").
		Where(goqu.Ex{"space_id": string(spaceID), "borrowing_id": string(borrowingID)}).
		Order(goqu.I("payment_date").Asc(), goqu.I("id").Asc())

	query, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return nil, fmt.Errorf("build sql query: %w", err)
	}

	var rows []borrowingRepaymentDB
	if err := s.db.SelectContext(ctx, &rows, query, args...); err != nil {
		return nil, err
	}

	repayments := make([]*finance.BorrowingRepayment, len(rows))
	for i := range rows {
		repayments[i] = rows[i].toDomain()
	}
	return repayments, nil
}

// Helpers
func ptrToTime(t *time.Time) time.Time {
	if t == nil {
		return time.Time{}
	}
	return *t
}
