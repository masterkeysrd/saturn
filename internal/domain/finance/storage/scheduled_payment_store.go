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

type ScheduledPaymentStore struct {
	db *sqlx.DB
}

func NewScheduledPaymentStore(db *sqlx.DB) *ScheduledPaymentStore {
	return &ScheduledPaymentStore{db: db}
}

func (s *ScheduledPaymentStore) Create(ctx context.Context, sp *finance.ScheduledPayment) error {
	query := `INSERT INTO finance.scheduled_payment (id, space_id, budget_id, source_type, source_id, amount, currency, due_date, status, metadata, create_time, update_time)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`
	_, err := s.db.ExecContext(ctx, query,
		string(sp.ID), string(sp.SpaceID), string(sp.BudgetID), sp.SourceType, sp.SourceID,
		sp.Amount, string(sp.Currency), sp.DueDate, string(sp.Status), sp.Metadata,
		sp.CreateTime, sp.UpdateTime,
	)
	return err
}

func (s *ScheduledPaymentStore) GetByID(ctx context.Context, id finance.ScheduledPaymentID) (*finance.ScheduledPayment, error) {
	var row scheduledPaymentDB
	query := `SELECT * FROM finance.scheduled_payment WHERE id = $1`
	if err := s.db.GetContext(ctx, &row, query, string(id)); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, errors.New("scheduled payment not found")
		}
		return nil, err
	}
	return &finance.ScheduledPayment{
		ID:         finance.ScheduledPaymentID(row.ID),
		SpaceID:    finance.SpaceID(row.SpaceID),
		BudgetID:   finance.BudgetID(row.BudgetID),
		SourceType: row.SourceType,
		SourceID:   row.SourceID,
		Amount:     row.Amount,
		Currency:   finance.Currency(row.Currency),
		DueDate:    row.DueDate,
		Status:     finance.ScheduledPaymentStatus(row.Status),
		Metadata:   row.Metadata,
		CreateTime: row.CreateTime.Time,
		UpdateTime: row.UpdateTime.Time,
	}, nil
}

func (s *ScheduledPaymentStore) UpdateStatus(ctx context.Context, id finance.ScheduledPaymentID, status finance.ScheduledPaymentStatus) error {
	query := `UPDATE finance.scheduled_payment SET status = $2, update_time = NOW() WHERE id = $1`
	res, err := s.db.ExecContext(ctx, query, string(id), string(status))
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
	query := `DELETE FROM finance.scheduled_payment WHERE id = $1`
	res, err := s.db.ExecContext(ctx, query, string(id))
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

func (s *ScheduledPaymentStore) ListBySpace(ctx context.Context, spaceID finance.SpaceID, filter *finance.ListScheduledPaymentsFilter) ([]*finance.ScheduledPayment, string, error) {
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

	if filter.StartDate != nil {
		conditions = append(conditions, fmt.Sprintf("due_date >= $%d", argIndex))
		args = append(args, *filter.StartDate)
		argIndex++
	}

	if filter.EndDate != nil {
		conditions = append(conditions, fmt.Sprintf("due_date <= $%d", argIndex))
		args = append(args, *filter.EndDate)
		argIndex++
	}

	if cursorID != "" {
		conditions = append(conditions, fmt.Sprintf("id < $%d", argIndex))
		args = append(args, cursorID)
		argIndex++
	}

	query := fmt.Sprintf(`SELECT * FROM finance.scheduled_payment WHERE %s ORDER BY due_date ASC, id DESC LIMIT $%d`, strings.Join(conditions, " AND "), argIndex)
	args = append(args, filter.PageSize+1)

	var rows []scheduledPaymentDB
	if err := s.db.SelectContext(ctx, &rows, query, args...); err != nil {
		return nil, "", err
	}

	hasMore := len(rows) > int(filter.PageSize)
	if hasMore {
		rows = rows[:filter.PageSize]
	}

	payments := make([]*finance.ScheduledPayment, 0, len(rows))
	for i := range rows {
		payments = append(payments, &finance.ScheduledPayment{
			ID:         finance.ScheduledPaymentID(rows[i].ID),
			SpaceID:    finance.SpaceID(rows[i].SpaceID),
			BudgetID:   finance.BudgetID(rows[i].BudgetID),
			SourceType: rows[i].SourceType,
			SourceID:   rows[i].SourceID,
			Amount:     rows[i].Amount,
			Currency:   finance.Currency(rows[i].Currency),
			DueDate:    rows[i].DueDate,
			Status:     finance.ScheduledPaymentStatus(rows[i].Status),
			Metadata:   rows[i].Metadata,
			CreateTime: rows[i].CreateTime.Time,
			UpdateTime: rows[i].UpdateTime.Time,
		})
	}

	var nextToken string
	if hasMore && len(rows) > 0 {
		lastRow := rows[len(rows)-1]
		nextToken = base64.URLEncoding.EncodeToString([]byte(lastRow.ID))
	}

	return payments, nextToken, nil
}
