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

type transactionDB struct {
	ID              string         `db:"id"`
	SpaceID         string         `db:"space_id"`
	Type            string         `db:"type"`
	BudgetID        sql.NullString `db:"budget_id"`
	PeriodID        sql.NullString `db:"period_id"`
	AccountID       sql.NullString `db:"account_id"`
	TransferID      sql.NullString `db:"transfer_id"`
	Amount          int64          `db:"amount"`
	Currency        string         `db:"currency"`
	AmountInBase    int64          `db:"amount_in_base"`
	Description     string         `db:"description"`
	TransactionDate sql.NullTime   `db:"transaction_date"`
	EffectiveDate   sql.NullTime   `db:"effective_date"`
	SourceType      sql.NullString `db:"source_type"`
	SourceID        sql.NullString `db:"source_id"`
	CreateTime      sql.NullTime   `db:"create_time"`
	UpdateTime      sql.NullTime   `db:"update_time"`
}

type TransactionStore struct {
	db *sqlx.DB
}

func NewTransactionStore(db *sqlx.DB) *TransactionStore {
	return &TransactionStore{db: db}
}

func (s *TransactionStore) Create(ctx context.Context, t *finance.Transaction) error {
	query := `INSERT INTO finance.transaction (id, space_id, type, budget_id, period_id, account_id, transfer_id, amount, currency, amount_in_base, description, transaction_date, effective_date, source_type, source_id, create_time, update_time)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`

	var budgetID, periodID sql.NullString
	if t.BudgetID != nil {
		budgetID = sql.NullString{String: string(*t.BudgetID), Valid: true}
	}
	if t.PeriodID != nil {
		periodID = sql.NullString{String: string(*t.PeriodID), Valid: true}
	}
	var accountID, transferID sql.NullString
	if t.AccountID != nil {
		accountID = sql.NullString{String: string(*t.AccountID), Valid: true}
	}
	if t.TransferID != nil {
		transferID = sql.NullString{String: string(*t.TransferID), Valid: true}
	}
	var sourceType, sourceID sql.NullString
	if t.SourceType != nil {
		sourceType = sql.NullString{String: *t.SourceType, Valid: true}
	}
	if t.SourceID != nil {
		sourceID = sql.NullString{String: *t.SourceID, Valid: true}
	}

	_, err := s.db.ExecContext(ctx, query,
		string(t.ID), string(t.SpaceID), string(t.Type), budgetID, periodID, accountID, transferID,
		t.Amount, string(t.Currency), t.AmountInBase, t.Description,
		t.TransactionDate, t.EffectiveDate, sourceType, sourceID, t.CreateTime, t.UpdateTime,
	)
	return err
}

func (s *TransactionStore) GetByID(ctx context.Context, id finance.TransactionID) (*finance.Transaction, error) {
	var row transactionDB
	query := `SELECT * FROM finance.transaction WHERE id = $1`
	if err := s.db.GetContext(ctx, &row, query, string(id)); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, finance.ErrTransactionNotFound
		}
		return nil, err
	}

	var budgetIDPtr *finance.BudgetID
	if row.BudgetID.Valid {
		bID := finance.BudgetID(row.BudgetID.String)
		budgetIDPtr = &bID
	}
	var periodIDPtr *finance.PeriodID
	if row.PeriodID.Valid {
		pID := finance.PeriodID(row.PeriodID.String)
		periodIDPtr = &pID
	}
	var accountIDPtr *finance.AccountID
	if row.AccountID.Valid {
		aID := finance.AccountID(row.AccountID.String)
		accountIDPtr = &aID
	}
	var transferIDPtr *finance.TransferID
	if row.TransferID.Valid {
		tID := finance.TransferID(row.TransferID.String)
		transferIDPtr = &tID
	}
	var sourceTypePtr *string
	if row.SourceType.Valid {
		sT := row.SourceType.String
		sourceTypePtr = &sT
	}
	var sourceIDPtr *string
	if row.SourceID.Valid {
		sI := row.SourceID.String
		sourceIDPtr = &sI
	}

	return &finance.Transaction{
		ID:              finance.TransactionID(row.ID),
		SpaceID:         finance.SpaceID(row.SpaceID),
		Type:            finance.TransactionType(row.Type),
		BudgetID:        budgetIDPtr,
		PeriodID:        periodIDPtr,
		AccountID:       accountIDPtr,
		TransferID:      transferIDPtr,
		Amount:          row.Amount,
		Currency:        finance.Currency(row.Currency),
		AmountInBase:    row.AmountInBase,
		Description:     row.Description,
		TransactionDate: nullTimeToTime(row.TransactionDate),
		EffectiveDate:   nullTimeToTime(row.EffectiveDate),
		SourceType:      sourceTypePtr,
		SourceID:        sourceIDPtr,
		CreateTime:      nullTimeToTime(row.CreateTime),
		UpdateTime:      nullTimeToTime(row.UpdateTime),
	}, nil
}

func (s *TransactionStore) Delete(ctx context.Context, id finance.TransactionID) error {
	query := `DELETE FROM finance.transaction WHERE id = $1`
	res, err := s.db.ExecContext(ctx, query, string(id))
	if err != nil {
		return err
	}
	rows, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return finance.ErrTransactionNotFound
	}
	return nil
}

func (s *TransactionStore) Update(ctx context.Context, t *finance.Transaction) error {
	query := `UPDATE finance.transaction SET 
		budget_id = $2, 
		period_id = $3, 
		account_id = $4,
		transfer_id = $5,
		amount = $6, 
		currency = $7, 
		amount_in_base = $8, 
		description = $9, 
		transaction_date = $10, 
		effective_date = $11,
		update_time = $12 
		WHERE id = $1`

	var budgetID, periodID sql.NullString
	if t.BudgetID != nil {
		budgetID = sql.NullString{String: string(*t.BudgetID), Valid: true}
	}
	if t.PeriodID != nil {
		periodID = sql.NullString{String: string(*t.PeriodID), Valid: true}
	}
	var accountID, transferID sql.NullString
	if t.AccountID != nil {
		accountID = sql.NullString{String: string(*t.AccountID), Valid: true}
	}
	if t.TransferID != nil {
		transferID = sql.NullString{String: string(*t.TransferID), Valid: true}
	}

	res, err := s.db.ExecContext(ctx, query,
		string(t.ID), budgetID, periodID, accountID, transferID,
		t.Amount, string(t.Currency), t.AmountInBase, t.Description,
		t.TransactionDate, t.EffectiveDate, t.UpdateTime,
	)
	if err != nil {
		return err
	}
	rows, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return finance.ErrTransactionNotFound
	}
	return nil
}

func (s *TransactionStore) ListBySpace(ctx context.Context, spaceID finance.SpaceID, filter *finance.ListTransactionsFilter) ([]*finance.Transaction, string, error) {
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

	if filter.BudgetID != nil {
		conditions = append(conditions, fmt.Sprintf("budget_id = $%d", argIndex))
		args = append(args, string(*filter.BudgetID))
		argIndex++
	}

	if filter.Type != nil {
		conditions = append(conditions, fmt.Sprintf("type = $%d", argIndex))
		args = append(args, string(*filter.Type))
		argIndex++
	}

	if filter.SourceType != nil {
		conditions = append(conditions, fmt.Sprintf("source_type = $%d", argIndex))
		args = append(args, *filter.SourceType)
		argIndex++
	}

	if filter.SourceID != nil {
		conditions = append(conditions, fmt.Sprintf("source_id = $%d", argIndex))
		args = append(args, *filter.SourceID)
		argIndex++
	}

	if filter.AccountID != nil {
		conditions = append(conditions, fmt.Sprintf("account_id = $%d", argIndex))
		args = append(args, string(*filter.AccountID))
		argIndex++
	}

	if filter.TransferID != nil {
		conditions = append(conditions, fmt.Sprintf("transfer_id = $%d", argIndex))
		args = append(args, string(*filter.TransferID))
		argIndex++
	}

	if cursorID != "" {
		conditions = append(conditions, fmt.Sprintf("id < $%d", argIndex))
		args = append(args, cursorID)
		argIndex++
	}

	query := fmt.Sprintf(`SELECT * FROM finance.transaction WHERE %s ORDER BY effective_date DESC, transaction_date DESC, id DESC LIMIT $%d`, strings.Join(conditions, " AND "), argIndex)
	args = append(args, filter.PageSize+1)

	var rows []transactionDB
	if err := s.db.SelectContext(ctx, &rows, query, args...); err != nil {
		return nil, "", err
	}

	hasMore := len(rows) > int(filter.PageSize)
	if hasMore {
		rows = rows[:filter.PageSize]
	}

	txns := make([]*finance.Transaction, 0, len(rows))
	for i := range rows {
		var budgetIDPtr *finance.BudgetID
		if rows[i].BudgetID.Valid {
			bID := finance.BudgetID(rows[i].BudgetID.String)
			budgetIDPtr = &bID
		}
		var periodIDPtr *finance.PeriodID
		if rows[i].PeriodID.Valid {
			pID := finance.PeriodID(rows[i].PeriodID.String)
			periodIDPtr = &pID
		}
		var accountIDPtr *finance.AccountID
		if rows[i].AccountID.Valid {
			aID := finance.AccountID(rows[i].AccountID.String)
			accountIDPtr = &aID
		}
		var transferIDPtr *finance.TransferID
		if rows[i].TransferID.Valid {
			tID := finance.TransferID(rows[i].TransferID.String)
			transferIDPtr = &tID
		}
		var sourceTypePtr *string
		if rows[i].SourceType.Valid {
			sT := rows[i].SourceType.String
			sourceTypePtr = &sT
		}
		var sourceIDPtr *string
		if rows[i].SourceID.Valid {
			sI := rows[i].SourceID.String
			sourceIDPtr = &sI
		}

		txns = append(txns, &finance.Transaction{
			ID:              finance.TransactionID(rows[i].ID),
			SpaceID:         finance.SpaceID(rows[i].SpaceID),
			Type:            finance.TransactionType(rows[i].Type),
			BudgetID:        budgetIDPtr,
			PeriodID:        periodIDPtr,
			AccountID:       accountIDPtr,
			TransferID:      transferIDPtr,
			Amount:          rows[i].Amount,
			Currency:        finance.Currency(rows[i].Currency),
			AmountInBase:    rows[i].AmountInBase,
			Description:     rows[i].Description,
			TransactionDate: nullTimeToTime(rows[i].TransactionDate),
			EffectiveDate:   nullTimeToTime(rows[i].EffectiveDate),
			SourceType:      sourceTypePtr,
			SourceID:        sourceIDPtr,
			CreateTime:      nullTimeToTime(rows[i].CreateTime),
			UpdateTime:      nullTimeToTime(rows[i].UpdateTime),
		})
	}

	var nextToken string
	if hasMore && len(rows) > 0 {
		lastTxn := rows[len(rows)-1]
		nextToken = base64.URLEncoding.EncodeToString([]byte(lastTxn.ID))
	}

	return txns, nextToken, nil
}

func (s *TransactionStore) AggregateSpent(ctx context.Context, periodID finance.PeriodID, budgetCurrency finance.Currency, exchangeRateToBase float64) (int64, int64, error) {
	query := `SELECT 
		COALESCE(SUM(amount_in_base), 0) as spent_in_base,
		COALESCE(SUM(
			CASE 
				WHEN currency = $2 THEN amount 
				WHEN $3 = 0.0 THEN 0
				ELSE ROUND(amount_in_base::numeric / $3)::bigint 
			END
		), 0) as spent_amount
	FROM finance.transaction 
	WHERE period_id = $1`

	var row struct {
		SpentInBase int64 `db:"spent_in_base"`
		SpentAmount int64 `db:"spent_amount"`
	}

	err := s.db.GetContext(ctx, &row, query, string(periodID), string(budgetCurrency), exchangeRateToBase)
	if err != nil {
		return 0, 0, err
	}
	return row.SpentInBase, row.SpentAmount, nil
}
