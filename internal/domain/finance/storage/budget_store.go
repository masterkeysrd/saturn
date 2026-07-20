package storage

import (
	"context"
	"database/sql"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"

	"github.com/jmoiron/sqlx"
	"github.com/masterkeysrd/saturn/internal/domain/finance"
)

type budgetDB struct {
	ID          string       `db:"id"`
	SpaceID     string       `db:"space_id"`
	Name        string       `db:"name"`
	LimitAmount int64        `db:"limit_amount"`
	Currency    string       `db:"currency"`
	Interval    string       `db:"interval"`
	IsActive    bool         `db:"is_active"`
	Icon        string       `db:"icon"`
	Color       string       `db:"color"`
	CreateTime  sql.NullTime `db:"create_time"`
	UpdateTime  sql.NullTime `db:"update_time"`
}

type BudgetStore struct {
	db *sqlx.DB
}

func NewBudgetStore(db *sqlx.DB) *BudgetStore {
	return &BudgetStore{db: db}
}

func (s *BudgetStore) Create(ctx context.Context, b *finance.Budget) error {
	query := `INSERT INTO finance.budget (id, space_id, name, limit_amount, currency, interval, is_active, icon, color, create_time, update_time)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`
	_, err := s.db.ExecContext(ctx, query, string(b.ID), string(b.SpaceID), b.Name, b.LimitAmount, string(b.Currency), string(b.Interval), b.IsActive, b.Icon, b.Color, b.CreateTime, b.UpdateTime)
	return err
}

func (s *BudgetStore) GetByID(ctx context.Context, id finance.BudgetID) (*finance.Budget, error) {
	var row budgetDB
	query := `SELECT * FROM finance.budget WHERE id = $1`
	if err := s.db.GetContext(ctx, &row, query, string(id)); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, finance.ErrBudgetNotFound
		}
		return nil, err
	}
	return &finance.Budget{
		ID:          finance.BudgetID(row.ID),
		SpaceID:     finance.SpaceID(row.SpaceID),
		Name:        row.Name,
		LimitAmount: row.LimitAmount,
		Currency:    finance.Currency(row.Currency),
		Interval:    finance.RecurrenceInterval(row.Interval),
		IsActive:    row.IsActive,
		Icon:        row.Icon,
		Color:       row.Color,
		CreateTime:  nullTimeToTime(row.CreateTime),
		UpdateTime:  nullTimeToTime(row.UpdateTime),
	}, nil
}

func (s *BudgetStore) Update(ctx context.Context, b *finance.Budget) error {
	query := `UPDATE finance.budget 
		SET name = $1, limit_amount = $2, currency = $3, interval = $4, is_active = $5, icon = $6, color = $7, update_time = $8 
		WHERE id = $9`
	res, err := s.db.ExecContext(ctx, query, b.Name, b.LimitAmount, string(b.Currency), string(b.Interval), b.IsActive, b.Icon, b.Color, b.UpdateTime, string(b.ID))
	if err != nil {
		return err
	}
	rows, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return finance.ErrBudgetNotFound
	}
	return nil
}

func (s *BudgetStore) Delete(ctx context.Context, id finance.BudgetID) error {
	query := `DELETE FROM finance.budget WHERE id = $1`
	res, err := s.db.ExecContext(ctx, query, string(id))
	if err != nil {
		return err
	}
	rows, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return finance.ErrBudgetNotFound
	}
	return nil
}

func (s *BudgetStore) ListBySpace(ctx context.Context, spaceID finance.SpaceID, filter *finance.ListBudgetsFilter) ([]*finance.Budget, string, error) {
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

	if cursorID != "" {
		conditions = append(conditions, fmt.Sprintf("id > $%d", argIndex))
		args = append(args, cursorID)
		argIndex++
	}

	query := fmt.Sprintf(`SELECT * FROM finance.budget WHERE %s ORDER BY id LIMIT $%d`, strings.Join(conditions, " AND "), argIndex)
	args = append(args, filter.PageSize+1)

	var rows []budgetDB
	if err := s.db.SelectContext(ctx, &rows, query, args...); err != nil {
		return nil, "", err
	}

	hasMore := len(rows) > int(filter.PageSize)
	if hasMore {
		rows = rows[:filter.PageSize]
	}

	budgets := make([]*finance.Budget, 0, len(rows))
	for i := range rows {
		budgets = append(budgets, &finance.Budget{
			ID:          finance.BudgetID(rows[i].ID),
			SpaceID:     finance.SpaceID(rows[i].SpaceID),
			Name:        rows[i].Name,
			LimitAmount: rows[i].LimitAmount,
			Currency:    finance.Currency(rows[i].Currency),
			Interval:    finance.RecurrenceInterval(rows[i].Interval),
			IsActive:    rows[i].IsActive,
			Icon:        rows[i].Icon,
			Color:       rows[i].Color,
			CreateTime:  nullTimeToTime(rows[i].CreateTime),
			UpdateTime:  nullTimeToTime(rows[i].UpdateTime),
		})
	}

	var nextToken string
	if hasMore && len(rows) > 0 {
		lastBudget := rows[len(rows)-1]
		nextToken = base64.URLEncoding.EncodeToString([]byte(lastBudget.ID))
	}

	return budgets, nextToken, nil
}
