package storage

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/jmoiron/sqlx"
	"github.com/masterkeysrd/saturn/internal/domain/finance"
)

type pendingTransactionDB struct {
	ID                 string         `db:"id"`
	SpaceID            string         `db:"space_id"`
	IntegrationID      string         `db:"integration_id"`
	RawVendor          string         `db:"raw_vendor"`
	SuggestedVendor    string         `db:"suggested_vendor"`
	Amount             int64          `db:"amount"`
	Currency           string         `db:"currency"`
	SuggestedAccountID sql.NullString `db:"suggested_account_id"`
	SuggestedBudgetID  sql.NullString `db:"suggested_budget_id"`
	SuggestedPaymentID sql.NullString `db:"suggested_payment_id"`
	MetadataJSON       string         `db:"metadata"`
	CreateTime         sql.NullTime   `db:"create_time"`
}

func toPendingTransactionDomain(db pendingTransactionDB) *finance.PendingTransaction {
	var accountID, budgetID, paymentID *string
	if db.SuggestedAccountID.Valid {
		accountID = &db.SuggestedAccountID.String
	}
	if db.SuggestedBudgetID.Valid {
		budgetID = &db.SuggestedBudgetID.String
	}
	if db.SuggestedPaymentID.Valid {
		paymentID = &db.SuggestedPaymentID.String
	}

	return &finance.PendingTransaction{
		ID:                 db.ID,
		SpaceID:            db.SpaceID,
		IntegrationID:      db.IntegrationID,
		RawVendor:          db.RawVendor,
		SuggestedVendor:    db.SuggestedVendor,
		Amount:             db.Amount,
		Currency:           db.Currency,
		SuggestedAccountID: accountID,
		SuggestedBudgetID:  budgetID,
		SuggestedPaymentID: paymentID,
		MetadataJSON:       db.MetadataJSON,
		CreateTime:         db.CreateTime.Time,
	}
}

type PendingTransactionStore struct {
	db *sqlx.DB
}

func NewPendingTransactionStore(db *sqlx.DB) *PendingTransactionStore {
	return &PendingTransactionStore{db: db}
}

func (s *PendingTransactionStore) Insert(ctx context.Context, tx *finance.PendingTransaction) error {
	query := `INSERT INTO finance.pending_transaction (id, space_id, integration_id, raw_vendor, suggested_vendor, amount, currency, suggested_account_id, suggested_budget_id, suggested_payment_id, metadata, create_time)
	          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`

	var accountID, budgetID, paymentID sql.NullString
	if tx.SuggestedAccountID != nil {
		accountID = sql.NullString{String: *tx.SuggestedAccountID, Valid: true}
	}
	if tx.SuggestedBudgetID != nil {
		budgetID = sql.NullString{String: *tx.SuggestedBudgetID, Valid: true}
	}
	if tx.SuggestedPaymentID != nil {
		paymentID = sql.NullString{String: *tx.SuggestedPaymentID, Valid: true}
	}

	_, err := s.db.ExecContext(ctx, query,
		tx.ID, tx.SpaceID, tx.IntegrationID, tx.RawVendor, tx.SuggestedVendor,
		tx.Amount, tx.Currency, accountID, budgetID, paymentID, tx.MetadataJSON, tx.CreateTime,
	)
	if err != nil {
		return fmt.Errorf("insert pending transaction: %w", err)
	}
	return nil
}

func (s *PendingTransactionStore) Get(ctx context.Context, spaceID, id string) (*finance.PendingTransaction, error) {
	query := `SELECT id, space_id, integration_id, raw_vendor, suggested_vendor, amount, currency, suggested_account_id, suggested_budget_id, suggested_payment_id, metadata, create_time 
	          FROM finance.pending_transaction WHERE space_id = $1 AND id = $2`

	var db pendingTransactionDB
	err := s.db.GetContext(ctx, &db, query, spaceID, id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, fmt.Errorf("pending transaction not found: %s", id)
		}
		return nil, fmt.Errorf("query pending transaction: %w", err)
	}

	return toPendingTransactionDomain(db), nil
}

func (s *PendingTransactionStore) ListBySpace(ctx context.Context, spaceID string) ([]*finance.PendingTransaction, error) {
	query := `SELECT id, space_id, integration_id, raw_vendor, suggested_vendor, amount, currency, suggested_account_id, suggested_budget_id, suggested_payment_id, metadata, create_time 
	          FROM finance.pending_transaction WHERE space_id = $1 ORDER BY create_time DESC`

	var dbList []pendingTransactionDB
	err := s.db.SelectContext(ctx, &dbList, query, spaceID)
	if err != nil {
		return nil, fmt.Errorf("select pending transactions: %w", err)
	}

	list := make([]*finance.PendingTransaction, len(dbList))
	for i, db := range dbList {
		list[i] = toPendingTransactionDomain(db)
	}
	return list, nil
}

func (s *PendingTransactionStore) Delete(ctx context.Context, spaceID, id string) error {
	query := `DELETE FROM finance.pending_transaction WHERE space_id = $1 AND id = $2`
	res, err := s.db.ExecContext(ctx, query, spaceID, id)
	if err != nil {
		return fmt.Errorf("delete pending transaction: %w", err)
	}

	rows, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return fmt.Errorf("pending transaction not found: %s", id)
	}

	return nil
}
