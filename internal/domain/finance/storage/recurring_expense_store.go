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

func (s *RecurringExpenseStore) GetByID(ctx context.Context, id finance.RecurringExpenseID) (*finance.RecurringExpense, error) {
	var row recurringExpenseDB
	query := `SELECT * FROM finance.recurring_expense WHERE id = $1`
	if err := s.db.GetContext(ctx, &row, query, string(id)); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, errors.New("recurring expense not found")
		}
		return nil, err
	}
	return &finance.RecurringExpense{
		ID:              finance.RecurringExpenseID(row.ID),
		SpaceID:         finance.SpaceID(row.SpaceID),
		BudgetID:        finance.BudgetID(row.BudgetID),
		Name:            row.Name,
		Amount:          row.Amount,
		Currency:        finance.Currency(row.Currency),
		Interval:        row.Interval,
		NextDueDate:     row.NextDueDate,
		IsVariable:      row.IsVariable,
		Status:          finance.RecurringExpenseStatus(row.Status),
		GracePeriodDays: row.GracePeriodDays,
		CreateTime:      row.CreateTime.Time,
		UpdateTime:      row.UpdateTime.Time,
	}, nil
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

func (s *RecurringExpenseStore) ListBySpace(ctx context.Context, spaceID finance.SpaceID, filter *finance.ListRecurringExpensesFilter) ([]*finance.RecurringExpense, string, error) {
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

	if cursorID != "" {
		conditions = append(conditions, fmt.Sprintf("id < $%d", argIndex))
		args = append(args, cursorID)
		argIndex++
	}

	query := fmt.Sprintf(`SELECT * FROM finance.recurring_expense WHERE %s ORDER BY create_time DESC, id DESC LIMIT $%d`, strings.Join(conditions, " AND "), argIndex)
	args = append(args, filter.PageSize+1)

	var rows []recurringExpenseDB
	if err := s.db.SelectContext(ctx, &rows, query, args...); err != nil {
		return nil, "", err
	}

	hasMore := len(rows) > int(filter.PageSize)
	if hasMore {
		rows = rows[:filter.PageSize]
	}

	expenses := make([]*finance.RecurringExpense, 0, len(rows))
	for i := range rows {
		expenses = append(expenses, &finance.RecurringExpense{
			ID:              finance.RecurringExpenseID(rows[i].ID),
			SpaceID:         finance.SpaceID(rows[i].SpaceID),
			BudgetID:        finance.BudgetID(rows[i].BudgetID),
			Name:            rows[i].Name,
			Amount:          rows[i].Amount,
			Currency:        finance.Currency(rows[i].Currency),
			Interval:        rows[i].Interval,
			NextDueDate:     rows[i].NextDueDate,
			IsVariable:      rows[i].IsVariable,
			Status:          finance.RecurringExpenseStatus(rows[i].Status),
			GracePeriodDays: rows[i].GracePeriodDays,
			CreateTime:      rows[i].CreateTime.Time,
			UpdateTime:      rows[i].UpdateTime.Time,
		})
	}

	var nextToken string
	if hasMore && len(rows) > 0 {
		lastRow := rows[len(rows)-1]
		nextToken = base64.URLEncoding.EncodeToString([]byte(lastRow.ID))
	}

	return expenses, nextToken, nil
}

func (s *RecurringExpenseStore) ListPendingGeneration(ctx context.Context, maxDueDate time.Time) ([]*finance.RecurringExpense, error) {
	var rows []recurringExpenseDB
	query := `SELECT * FROM finance.recurring_expense 
		WHERE status = 'active' AND next_due_date <= $1 
		ORDER BY next_due_date ASC`
	if err := s.db.SelectContext(ctx, &rows, query, maxDueDate); err != nil {
		return nil, err
	}

	expenses := make([]*finance.RecurringExpense, 0, len(rows))
	for i := range rows {
		expenses = append(expenses, &finance.RecurringExpense{
			ID:          finance.RecurringExpenseID(rows[i].ID),
			SpaceID:     finance.SpaceID(rows[i].SpaceID),
			BudgetID:    finance.BudgetID(rows[i].BudgetID),
			Name:        rows[i].Name,
			Amount:      rows[i].Amount,
			Currency:    finance.Currency(rows[i].Currency),
			Interval:    rows[i].Interval,
			NextDueDate: rows[i].NextDueDate,
			IsVariable:  rows[i].IsVariable,
			Status:      finance.RecurringExpenseStatus(rows[i].Status),
			CreateTime:  rows[i].CreateTime.Time,
			UpdateTime:  rows[i].UpdateTime.Time,
		})
	}
	return expenses, nil
}
