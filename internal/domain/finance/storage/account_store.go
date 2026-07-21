package storage

import (
	"context"
	"database/sql"
	"errors"

	"github.com/jmoiron/sqlx"
	"github.com/masterkeysrd/saturn/internal/domain/finance"
)

type accountDB struct {
	ID             string       `db:"id"`
	SpaceID        string       `db:"space_id"`
	Name           string       `db:"name"`
	Type           string       `db:"type"`
	Currency       string       `db:"currency"`
	InitialBalance int64        `db:"initial_balance"`
	CurrentBalance int64        `db:"current_balance"`
	CreditLimit    int64        `db:"credit_limit"`
	IsDefault      bool         `db:"is_default"`
	IsActive       bool         `db:"is_active"`
	Color          string       `db:"color"`
	Notes          string       `db:"notes"`
	LastFour       string       `db:"last_four"`
	CreateTime     sql.NullTime `db:"create_time"`
	UpdateTime     sql.NullTime `db:"update_time"`
}

type AccountStore struct {
	db *sqlx.DB
}

func NewAccountStore(db *sqlx.DB) *AccountStore {
	return &AccountStore{db: db}
}

func (s *AccountStore) Create(ctx context.Context, a *finance.Account) error {
	query := `INSERT INTO finance.account (id, space_id, name, type, currency, initial_balance, current_balance, credit_limit, is_default, is_active, color, notes, last_four, create_time, update_time)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`
	_, err := s.db.ExecContext(ctx, query,
		string(a.ID), string(a.SpaceID), a.Name, string(a.Type), string(a.Currency),
		a.InitialBalance, a.CurrentBalance, a.CreditLimit, a.IsDefault, a.IsActive, a.Color, a.Notes, a.LastFour,
		a.CreateTime, a.UpdateTime,
	)
	return err
}

func (s *AccountStore) GetByID(ctx context.Context, id finance.AccountID) (*finance.Account, error) {
	var row accountDB
	query := `SELECT * FROM finance.account WHERE id = $1`
	if err := s.db.GetContext(ctx, &row, query, string(id)); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, finance.ErrAccountNotFound
		}
		return nil, err
	}
	return &finance.Account{
		ID:             finance.AccountID(row.ID),
		SpaceID:        finance.SpaceID(row.SpaceID),
		Name:           row.Name,
		Type:           finance.AccountType(row.Type),
		Currency:       finance.Currency(row.Currency),
		InitialBalance: row.InitialBalance,
		CurrentBalance: row.CurrentBalance,
		CreditLimit:    row.CreditLimit,
		IsDefault:      row.IsDefault,
		IsActive:       row.IsActive,
		Color:          row.Color,
		Notes:          row.Notes,
		LastFour:       row.LastFour,
		CreateTime:     nullTimeToTime(row.CreateTime),
		UpdateTime:     nullTimeToTime(row.UpdateTime),
	}, nil
}

func (s *AccountStore) Update(ctx context.Context, a *finance.Account) error {
	query := `UPDATE finance.account SET 
		name = $2, 
		type = $3, 
		currency = $4, 
		initial_balance = $5, 
		current_balance = $6, 
		credit_limit = $7,
		is_default = $8, 
		is_active = $9, 
		color = $10, 
		notes = $11, 
		last_four = $12,
		update_time = $13 
		WHERE id = $1`
	res, err := s.db.ExecContext(ctx, query,
		string(a.ID), a.Name, string(a.Type), string(a.Currency),
		a.InitialBalance, a.CurrentBalance, a.CreditLimit, a.IsDefault, a.IsActive, a.Color, a.Notes, a.LastFour,
		a.UpdateTime,
	)
	if err != nil {
		return err
	}
	rows, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return finance.ErrAccountNotFound
	}
	return nil
}

func (s *AccountStore) Delete(ctx context.Context, id finance.AccountID) error {
	query := `DELETE FROM finance.account WHERE id = $1`
	res, err := s.db.ExecContext(ctx, query, string(id))
	if err != nil {
		return err
	}
	rows, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return finance.ErrAccountNotFound
	}
	return nil
}

func (s *AccountStore) ListBySpace(ctx context.Context, spaceID finance.SpaceID) ([]*finance.Account, error) {
	var rows []accountDB
	query := `SELECT * FROM finance.account WHERE space_id = $1 ORDER BY is_default DESC, name ASC, id ASC`
	if err := s.db.SelectContext(ctx, &rows, query, string(spaceID)); err != nil {
		return nil, err
	}

	accounts := make([]*finance.Account, 0, len(rows))
	for i := range rows {
		accounts = append(accounts, &finance.Account{
			ID:             finance.AccountID(rows[i].ID),
			SpaceID:        finance.SpaceID(rows[i].SpaceID),
			Name:           rows[i].Name,
			Type:           finance.AccountType(rows[i].Type),
			Currency:       finance.Currency(rows[i].Currency),
			InitialBalance: rows[i].InitialBalance,
			CurrentBalance: rows[i].CurrentBalance,
			CreditLimit:    rows[i].CreditLimit,
			IsDefault:      rows[i].IsDefault,
			IsActive:       rows[i].IsActive,
			Color:          rows[i].Color,
			Notes:          rows[i].Notes,
			LastFour:       rows[i].LastFour,
			CreateTime:     nullTimeToTime(rows[i].CreateTime),
			UpdateTime:     nullTimeToTime(rows[i].UpdateTime),
		})
	}
	return accounts, nil
}
