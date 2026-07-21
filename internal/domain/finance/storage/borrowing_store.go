package storage

import (
	"context"
	"database/sql"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jmoiron/sqlx"
	"github.com/masterkeysrd/saturn/internal/domain/finance"
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
	CreateTime      sql.NullTime `db:"create_time"`
	UpdateTime      sql.NullTime `db:"update_time"`
}

type BorrowingStore struct {
	db *sqlx.DB
}

func NewBorrowingStore(db *sqlx.DB) *BorrowingStore {
	return &BorrowingStore{db: db}
}

func (s *BorrowingStore) Create(ctx context.Context, b *finance.Borrowing) error {
	query := `INSERT INTO finance.borrowing (id, space_id, direction, counterparty, contact_info, total_amount, remaining_amount, currency, status, established_at, due_at, notes, create_time, update_time)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`
	_, err := s.db.ExecContext(ctx, query,
		string(b.ID), string(b.SpaceID), string(b.Direction), b.Counterparty, b.ContactInfo,
		b.TotalAmount, b.RemainingAmount, string(b.Currency), string(b.Status),
		timeToNullTime(b.EstablishedAt), timeToNullTime(ptrToTime(b.DueAt)), b.Notes, b.CreateTime, b.UpdateTime)
	return err
}

func (s *BorrowingStore) GetByID(ctx context.Context, id finance.BorrowingID) (*finance.Borrowing, error) {
	var row borrowingDB
	query := `SELECT * FROM finance.borrowing WHERE id = $1`
	if err := s.db.GetContext(ctx, &row, query, string(id)); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, finance.ErrBorrowingNotFound
		}
		return nil, err
	}

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
		CreateTime:      nullTimeToTime(row.CreateTime),
		UpdateTime:      nullTimeToTime(row.UpdateTime),
	}, nil
}

func (s *BorrowingStore) Update(ctx context.Context, b *finance.Borrowing) error {
	query := `UPDATE finance.borrowing 
		SET direction = $1, counterparty = $2, contact_info = $3, total_amount = $4, remaining_amount = $5, currency = $6, status = $7, established_at = $8, due_at = $9, notes = $10, update_time = $11 
		WHERE id = $12`
	res, err := s.db.ExecContext(ctx, query,
		string(b.Direction), b.Counterparty, b.ContactInfo, b.TotalAmount, b.RemainingAmount, string(b.Currency), string(b.Status),
		timeToNullTime(b.EstablishedAt), timeToNullTime(ptrToTime(b.DueAt)), b.Notes, b.UpdateTime, string(b.ID))
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

func (s *BorrowingStore) Delete(ctx context.Context, id finance.BorrowingID) error {
	query := `DELETE FROM finance.borrowing WHERE id = $1`
	res, err := s.db.ExecContext(ctx, query, string(id))
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
	if filter.PageSize <= 0 || filter.PageSize > 100 {
		filter.PageSize = 20
	}

	var cursorID string
	if filter.NextPageToken != "" {
		if decoded, err := base64.URLEncoding.DecodeString(filter.NextPageToken); err == nil {
			cursorID = string(decoded)
		}
	}

	conditions := []string{"space_id = $1"}
	args := []any{string(spaceID)}
	argIndex := 2

	if filter.Status != nil {
		conditions = append(conditions, fmt.Sprintf("status = $%d", argIndex))
		args = append(args, string(*filter.Status))
		argIndex++
	}
	if filter.Direction != nil {
		conditions = append(conditions, fmt.Sprintf("direction = $%d", argIndex))
		args = append(args, string(*filter.Direction))
		argIndex++
	}
	if cursorID != "" {
		conditions = append(conditions, fmt.Sprintf("id > $%d", argIndex))
		args = append(args, cursorID)
		argIndex++
	}

	query := fmt.Sprintf(`SELECT * FROM finance.borrowing WHERE %s ORDER BY id LIMIT $%d`, strings.Join(conditions, " AND "), argIndex)
	args = append(args, filter.PageSize+1)

	var rows []borrowingDB
	if err := s.db.SelectContext(ctx, &rows, query, args...); err != nil {
		return nil, "", err
	}

	hasMore := len(rows) > int(filter.PageSize)
	if hasMore {
		rows = rows[:filter.PageSize]
	}

	borrowings := make([]*finance.Borrowing, 0, len(rows))
	for i := range rows {
		var dueAtPtr *time.Time
		if rows[i].DueAt.Valid {
			dueAtPtr = &rows[i].DueAt.Time
		}

		borrowings = append(borrowings, &finance.Borrowing{
			ID:              finance.BorrowingID(rows[i].ID),
			SpaceID:         finance.SpaceID(rows[i].SpaceID),
			Direction:       finance.BorrowingDirection(rows[i].Direction),
			Counterparty:    rows[i].Counterparty,
			ContactInfo:     rows[i].ContactInfo,
			TotalAmount:     rows[i].TotalAmount,
			RemainingAmount: rows[i].RemainingAmount,
			Currency:        finance.Currency(rows[i].Currency),
			Status:          finance.BorrowingStatus(rows[i].Status),
			EstablishedAt:   nullTimeToTime(rows[i].EstablishedAt),
			DueAt:           dueAtPtr,
			Notes:           rows[i].Notes,
			CreateTime:      nullTimeToTime(rows[i].CreateTime),
			UpdateTime:      nullTimeToTime(rows[i].UpdateTime),
		})
	}

	var nextToken string
	if hasMore && len(rows) > 0 {
		lastRow := rows[len(rows)-1]
		nextToken = base64.URLEncoding.EncodeToString([]byte(lastRow.ID))
	}

	return borrowings, nextToken, nil
}

type borrowingRepaymentDB struct {
	ID          string       `db:"id"`
	BorrowingID string       `db:"borrowing_id"`
	SpaceID     string       `db:"space_id"`
	Amount      int64        `db:"amount"`
	PaymentDate sql.NullTime `db:"payment_date"`
	Notes       string       `db:"notes"`
	CreateTime  sql.NullTime `db:"create_time"`
	UpdateTime  sql.NullTime `db:"update_time"`
}

type BorrowingRepaymentStore struct {
	db *sqlx.DB
}

func NewBorrowingRepaymentStore(db *sqlx.DB) *BorrowingRepaymentStore {
	return &BorrowingRepaymentStore{db: db}
}

func (s *BorrowingRepaymentStore) Create(ctx context.Context, r *finance.BorrowingRepayment) error {
	query := `INSERT INTO finance.borrowing_repayment (id, borrowing_id, space_id, amount, payment_date, notes, create_time, update_time)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`
	_, err := s.db.ExecContext(ctx, query,
		string(r.ID), string(r.BorrowingID), string(r.SpaceID), r.Amount,
		timeToNullTime(r.PaymentDate), r.Notes, r.CreateTime, r.UpdateTime)
	return err
}

func (s *BorrowingRepaymentStore) GetByID(ctx context.Context, id finance.BorrowingRepaymentID) (*finance.BorrowingRepayment, error) {
	var row borrowingRepaymentDB
	query := `SELECT * FROM finance.borrowing_repayment WHERE id = $1`
	if err := s.db.GetContext(ctx, &row, query, string(id)); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, finance.ErrRepaymentNotFound
		}
		return nil, err
	}

	return &finance.BorrowingRepayment{
		ID:          finance.BorrowingRepaymentID(row.ID),
		BorrowingID: finance.BorrowingID(row.BorrowingID),
		SpaceID:     finance.SpaceID(row.SpaceID),
		Amount:      row.Amount,
		PaymentDate: nullTimeToTime(row.PaymentDate),
		Notes:       row.Notes,
		CreateTime:  nullTimeToTime(row.CreateTime),
		UpdateTime:  nullTimeToTime(row.UpdateTime),
	}, nil
}

func (s *BorrowingRepaymentStore) Delete(ctx context.Context, id finance.BorrowingRepaymentID) error {
	query := `DELETE FROM finance.borrowing_repayment WHERE id = $1`
	res, err := s.db.ExecContext(ctx, query, string(id))
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
	var rows []borrowingRepaymentDB
	query := `SELECT * FROM finance.borrowing_repayment WHERE space_id = $1 AND borrowing_id = $2 ORDER BY payment_date ASC, id ASC`
	if err := s.db.SelectContext(ctx, &rows, query, string(spaceID), string(borrowingID)); err != nil {
		return nil, err
	}

	repayments := make([]*finance.BorrowingRepayment, 0, len(rows))
	for i := range rows {
		repayments = append(repayments, &finance.BorrowingRepayment{
			ID:          finance.BorrowingRepaymentID(rows[i].ID),
			BorrowingID: finance.BorrowingID(rows[i].BorrowingID),
			SpaceID:     finance.SpaceID(rows[i].SpaceID),
			Amount:      rows[i].Amount,
			PaymentDate: nullTimeToTime(rows[i].PaymentDate),
			Notes:       rows[i].Notes,
			CreateTime:  nullTimeToTime(rows[i].CreateTime),
			UpdateTime:  nullTimeToTime(rows[i].UpdateTime),
		})
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
