package storage

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/jmoiron/sqlx"
	"github.com/masterkeysrd/saturn/internal/domain/finance"
)

type inboxItemDB struct {
	ID                 string         `db:"id"`
	SpaceID            string         `db:"space_id"`
	IntegrationID      string         `db:"integration_id"`
	Status             string         `db:"status"`
	DocType            string         `db:"doc_type"`
	Amount             sql.NullInt64  `db:"amount"`
	Currency           sql.NullString `db:"currency"`
	VendorName         sql.NullString `db:"vendor_name"`
	TransactionDate    sql.NullTime   `db:"transaction_date"`
	AccountID          sql.NullString `db:"account_id"`
	BudgetID           sql.NullString `db:"budget_id"`
	ScheduledPaymentID sql.NullString `db:"scheduled_payment_id"`
	TransactionID      sql.NullString `db:"transaction_id"`
	RawPayload         string         `db:"raw_payload"`
	MetadataJSON       string         `db:"metadata"`
	CreateTime         sql.NullTime   `db:"create_time"`
}

func toInboxItemDomain(db inboxItemDB) *finance.InboxItem {
	var accountID, budgetID, paymentID, transactionID *string
	if db.AccountID.Valid {
		accountID = &db.AccountID.String
	}
	if db.BudgetID.Valid {
		budgetID = &db.BudgetID.String
	}
	if db.ScheduledPaymentID.Valid {
		paymentID = &db.ScheduledPaymentID.String
	}
	if db.TransactionID.Valid {
		transactionID = &db.TransactionID.String
	}

	var amount int64
	if db.Amount.Valid {
		amount = db.Amount.Int64
	}

	return &finance.InboxItem{
		ID:                 db.ID,
		SpaceID:            db.SpaceID,
		IntegrationID:      db.IntegrationID,
		Status:             finance.InboxItemStatus(db.Status),
		DocType:            finance.InboxItemDocType(db.DocType),
		Amount:             amount,
		Currency:           db.Currency.String,
		VendorName:         db.VendorName.String,
		TransactionDate:    db.TransactionDate.Time,
		AccountID:          accountID,
		BudgetID:           budgetID,
		ScheduledPaymentID: paymentID,
		TransactionID:      transactionID,
		RawPayload:         db.RawPayload,
		MetadataJSON:       db.MetadataJSON,
		CreateTime:         db.CreateTime.Time,
	}
}

type InboxItemStore struct {
	db *sqlx.DB
}

func NewInboxItemStore(db *sqlx.DB) *InboxItemStore {
	return &InboxItemStore{db: db}
}

func (s *InboxItemStore) Insert(ctx context.Context, item *finance.InboxItem) error {
	query := `INSERT INTO finance.inbox_item (
		id, space_id, integration_id, status, doc_type, 
		amount, currency, vendor_name, transaction_date, 
		account_id, budget_id, scheduled_payment_id, transaction_id, 
		raw_payload, metadata, create_time
	) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`

	var amount sql.NullInt64
	if item.Amount > 0 {
		amount = sql.NullInt64{Int64: item.Amount, Valid: true}
	}
	currency := sql.NullString{String: item.Currency, Valid: item.Currency != ""}
	vendorName := sql.NullString{String: item.VendorName, Valid: item.VendorName != ""}
	var txDate sql.NullTime
	if !item.TransactionDate.IsZero() {
		txDate = sql.NullTime{Time: item.TransactionDate, Valid: true}
	}

	var accountID, budgetID, paymentID, transactionID sql.NullString
	if item.AccountID != nil {
		accountID = sql.NullString{String: *item.AccountID, Valid: true}
	}
	if item.BudgetID != nil {
		budgetID = sql.NullString{String: *item.BudgetID, Valid: true}
	}
	if item.ScheduledPaymentID != nil {
		paymentID = sql.NullString{String: *item.ScheduledPaymentID, Valid: true}
	}
	if item.TransactionID != nil {
		transactionID = sql.NullString{String: *item.TransactionID, Valid: true}
	}

	var createTime time.Time
	if item.CreateTime.IsZero() {
		createTime = time.Now().UTC()
	} else {
		createTime = item.CreateTime
	}

	_, err := s.db.ExecContext(ctx, query,
		item.ID, item.SpaceID, item.IntegrationID, string(item.Status), string(item.DocType),
		amount, currency, vendorName, txDate,
		accountID, budgetID, paymentID, transactionID,
		item.RawPayload, item.MetadataJSON, createTime,
	)
	if err != nil {
		return fmt.Errorf("insert inbox item: %w", err)
	}
	return nil
}

func (s *InboxItemStore) Get(ctx context.Context, spaceID, id string) (*finance.InboxItem, error) {
	query := `SELECT id, space_id, integration_id, status, doc_type, 
	                 amount, currency, vendor_name, transaction_date, 
	                 account_id, budget_id, scheduled_payment_id, transaction_id, 
	                 raw_payload, metadata, create_time 
	          FROM finance.inbox_item WHERE space_id = $1 AND id = $2`

	var db inboxItemDB
	err := s.db.GetContext(ctx, &db, query, spaceID, id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, fmt.Errorf("inbox item not found: %s", id)
		}
		return nil, fmt.Errorf("query inbox item: %w", err)
	}

	return toInboxItemDomain(db), nil
}

func (s *InboxItemStore) ListBySpace(ctx context.Context, spaceID string, filter *finance.ListInboxItemsFilter) ([]*finance.InboxItem, error) {
	query := `SELECT id, space_id, integration_id, status, doc_type, 
	                 amount, currency, vendor_name, transaction_date, 
	                 account_id, budget_id, scheduled_payment_id, transaction_id, 
	                 raw_payload, metadata, create_time 
	          FROM finance.inbox_item WHERE space_id = $1`

	args := []interface{}{spaceID}

	if filter != nil && filter.Status != nil {
		query += " AND status = $2"
		args = append(args, string(*filter.Status))
	}

	query += " ORDER BY create_time DESC"

	var dbList []inboxItemDB
	err := s.db.SelectContext(ctx, &dbList, query, args...)
	if err != nil {
		return nil, fmt.Errorf("select inbox items: %w", err)
	}

	list := make([]*finance.InboxItem, len(dbList))
	for i, db := range dbList {
		list[i] = toInboxItemDomain(db)
	}
	return list, nil
}

func (s *InboxItemStore) Delete(ctx context.Context, spaceID, id string) error {
	query := `DELETE FROM finance.inbox_item WHERE space_id = $1 AND id = $2`
	res, err := s.db.ExecContext(ctx, query, spaceID, id)
	if err != nil {
		return fmt.Errorf("delete inbox item: %w", err)
	}

	rows, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return fmt.Errorf("inbox item not found: %s", id)
	}

	return nil
}

func (s *InboxItemStore) Update(ctx context.Context, item *finance.InboxItem) error {
	query := `UPDATE finance.inbox_item SET 
		status = $1, doc_type = $2, amount = $3, currency = $4, vendor_name = $5, 
		transaction_date = $6, account_id = $7, budget_id = $8, 
		scheduled_payment_id = $9, transaction_id = $10, raw_payload = $11, 
		metadata = $12
	WHERE space_id = $13 AND id = $14`

	var amount sql.NullInt64
	if item.Amount > 0 {
		amount = sql.NullInt64{Int64: item.Amount, Valid: true}
	}
	currency := sql.NullString{String: item.Currency, Valid: item.Currency != ""}
	vendorName := sql.NullString{String: item.VendorName, Valid: item.VendorName != ""}
	var txDate sql.NullTime
	if !item.TransactionDate.IsZero() {
		txDate = sql.NullTime{Time: item.TransactionDate, Valid: true}
	}

	var accountID, budgetID, paymentID, transactionID sql.NullString
	if item.AccountID != nil {
		accountID = sql.NullString{String: *item.AccountID, Valid: true}
	}
	if item.BudgetID != nil {
		budgetID = sql.NullString{String: *item.BudgetID, Valid: true}
	}
	if item.ScheduledPaymentID != nil {
		paymentID = sql.NullString{String: *item.ScheduledPaymentID, Valid: true}
	}
	if item.TransactionID != nil {
		transactionID = sql.NullString{String: *item.TransactionID, Valid: true}
	}

	res, err := s.db.ExecContext(ctx, query,
		string(item.Status), string(item.DocType), amount, currency, vendorName,
		txDate, accountID, budgetID, paymentID, transactionID,
		item.RawPayload, item.MetadataJSON, item.SpaceID, item.ID,
	)
	if err != nil {
		return fmt.Errorf("update inbox item: %w", err)
	}

	rows, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return fmt.Errorf("inbox item not found for update: %s", item.ID)
	}

	return nil
}
