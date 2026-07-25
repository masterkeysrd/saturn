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
	"github.com/masterkeysrd/saturn/internal/platform/paging"
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

func (s *TransactionStore) ListBySpace(ctx context.Context, spaceID finance.SpaceID, filter *finance.ListTransactionsFilter) (*paging.Page[*finance.Transaction], error) {
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

	if filter.MinAmount != nil {
		conditions = append(conditions, fmt.Sprintf("amount >= $%d", argIndex))
		args = append(args, *filter.MinAmount)
		argIndex++
	}

	if filter.MaxAmount != nil {
		conditions = append(conditions, fmt.Sprintf("amount <= $%d", argIndex))
		args = append(args, *filter.MaxAmount)
		argIndex++
	}

	if filter.StartDate != nil {
		conditions = append(conditions, fmt.Sprintf("transaction_date >= $%d", argIndex))
		args = append(args, *filter.StartDate)
		argIndex++
	}

	if filter.EndDate != nil {
		conditions = append(conditions, fmt.Sprintf("transaction_date <= $%d", argIndex))
		args = append(args, *filter.EndDate)
		argIndex++
	}

	if filter.SearchQuery != nil && *filter.SearchQuery != "" {
		conditions = append(conditions, fmt.Sprintf("description ILIKE $%d", argIndex))
		args = append(args, "%"+*filter.SearchQuery+"%")
		argIndex++
	}

	if cursorID != "" {
		conditions = append(conditions, fmt.Sprintf("id < $%d", argIndex))
		args = append(args, cursorID)
		argIndex++
	}

	query := fmt.Sprintf(`SELECT * FROM finance.transaction WHERE %s ORDER BY effective_date DESC, transaction_date DESC, id DESC LIMIT $%d`, strings.Join(conditions, " AND "), argIndex)
	args = append(args, filter.PageSize+1)

	var dbRows []transactionDB
	if err := s.db.SelectContext(ctx, &dbRows, query, args...); err != nil {
		return nil, err
	}

	txns := make([]*finance.Transaction, 0, len(dbRows))
	for i := range dbRows {
		var budgetIDPtr *finance.BudgetID
		if dbRows[i].BudgetID.Valid {
			bID := finance.BudgetID(dbRows[i].BudgetID.String)
			budgetIDPtr = &bID
		}
		var periodIDPtr *finance.PeriodID
		if dbRows[i].PeriodID.Valid {
			pID := finance.PeriodID(dbRows[i].PeriodID.String)
			periodIDPtr = &pID
		}
		var accountIDPtr *finance.AccountID
		if dbRows[i].AccountID.Valid {
			aID := finance.AccountID(dbRows[i].AccountID.String)
			accountIDPtr = &aID
		}
		var transferIDPtr *finance.TransferID
		if dbRows[i].TransferID.Valid {
			tID := finance.TransferID(dbRows[i].TransferID.String)
			transferIDPtr = &tID
		}
		var sourceTypePtr *string
		if dbRows[i].SourceType.Valid {
			sT := dbRows[i].SourceType.String
			sourceTypePtr = &sT
		}
		var sourceIDPtr *string
		if dbRows[i].SourceID.Valid {
			sI := dbRows[i].SourceID.String
			sourceIDPtr = &sI
		}

		txns = append(txns, &finance.Transaction{
			ID:              finance.TransactionID(dbRows[i].ID),
			SpaceID:         finance.SpaceID(dbRows[i].SpaceID),
			Type:            finance.TransactionType(dbRows[i].Type),
			BudgetID:        budgetIDPtr,
			PeriodID:        periodIDPtr,
			AccountID:       accountIDPtr,
			TransferID:      transferIDPtr,
			Amount:          dbRows[i].Amount,
			Currency:        finance.Currency(dbRows[i].Currency),
			AmountInBase:    dbRows[i].AmountInBase,
			Description:     dbRows[i].Description,
			TransactionDate: nullTimeToTime(dbRows[i].TransactionDate),
			EffectiveDate:   nullTimeToTime(dbRows[i].EffectiveDate),
			SourceType:      sourceTypePtr,
			SourceID:        sourceIDPtr,
			CreateTime:      nullTimeToTime(dbRows[i].CreateTime),
			UpdateTime:      nullTimeToTime(dbRows[i].UpdateTime),
		})
	}

	page := paging.NewPage(txns, int(filter.PageSize), func(t *finance.Transaction) paging.Cursor {
		return paging.Cursor{
			SortValue: "",
			ID:        string(t.ID),
		}
	})

	return page, nil
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

func (s *TransactionStore) AggregateSpentBatch(ctx context.Context, periodIDs []finance.PeriodID) ([]finance.PeriodSpent, error) {
	if len(periodIDs) == 0 {
		return nil, nil
	}

	idStrings := make([]string, len(periodIDs))
	for i, id := range periodIDs {
		idStrings[i] = string(id)
	}

	query, args, err := sqlx.In(`
		SELECT 
			t.period_id,
			COALESCE(SUM(t.amount_in_base), 0) as spent_in_base,
			COALESCE(SUM(
				CASE 
					WHEN t.currency = p.currency THEN t.amount 
					WHEN p.exchange_rate_to_base = 0.0 THEN 0
					ELSE ROUND(t.amount_in_base::numeric / p.exchange_rate_to_base)::bigint 
				END
			), 0) as spent_amount
		FROM finance.transaction t
		JOIN finance.budget_period p ON t.period_id = p.id
		WHERE t.period_id IN (?)
		GROUP BY t.period_id
	`, idStrings)
	if err != nil {
		return nil, err
	}

	query = s.db.Rebind(query)

	var dbRows []struct {
		PeriodID    string `db:"period_id"`
		SpentInBase int64  `db:"spent_in_base"`
		SpentAmount int64  `db:"spent_amount"`
	}

	if err := s.db.SelectContext(ctx, &dbRows, query, args...); err != nil {
		return nil, err
	}

	results := make([]finance.PeriodSpent, len(dbRows))
	for i, row := range dbRows {
		results[i] = finance.PeriodSpent{
			PeriodID:    finance.PeriodID(row.PeriodID),
			SpentInBase: row.SpentInBase,
			SpentAmount: row.SpentAmount,
		}
	}
	return results, nil
}
