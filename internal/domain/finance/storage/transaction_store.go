package storage

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/doug-martin/goqu/v9"
	_ "github.com/doug-martin/goqu/v9/dialect/postgres"
	"github.com/jmoiron/sqlx"
	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/platform/conv"
	"github.com/masterkeysrd/saturn/internal/platform/paging"
)

type transactionDB struct {
	ID              string         `db:"id"`
	SpaceID         string         `db:"space_id"`
	Type            string         `db:"type"`
	BudgetID        sql.NullString `db:"budget_id"`
	PeriodID        sql.NullString `db:"period_id"`
	AccountID       sql.NullString `db:"account_id"`
	Amount          int64          `db:"amount"`
	Currency        string         `db:"currency"`
	AmountInBase    int64          `db:"amount_in_base"`
	Description     string         `db:"description"`
	TransactionDate sql.NullTime   `db:"transaction_date"`
	EffectiveDate   sql.NullTime   `db:"effective_date"`
	Metadata        sql.NullString `db:"metadata"`
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
	metaJSON, _ := json.Marshal(t.Metadata)
	if len(metaJSON) == 0 || string(metaJSON) == "null" {
		metaJSON = []byte("{}")
	}

	ds := pgDialect.Insert(goqu.S("finance").Table("transaction")).Rows(goqu.Record{
		"id":               string(t.ID),
		"space_id":         string(t.SpaceID),
		"type":             string(t.Type),
		"budget_id":        conv.StringPtr(t.BudgetID),
		"period_id":        conv.StringPtr(t.PeriodID),
		"account_id":       conv.StringPtr(t.AccountID),
		"amount":           t.Amount,
		"currency":         string(t.Currency),
		"amount_in_base":   t.AmountInBase,
		"description":      t.Description,
		"transaction_date": t.TransactionDate,
		"effective_date":   t.EffectiveDate,
		"metadata":         goqu.L("?::jsonb", string(metaJSON)),
		"create_time":      t.CreateTime,
		"update_time":      t.UpdateTime,
	})
	query, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return err
	}
	_, err = s.db.ExecContext(ctx, query, args...)
	return err
}

func (row *transactionDB) toDomain() *finance.Transaction {
	var budgetIDPtr *finance.BudgetID
	if row.BudgetID.Valid {
		budgetIDPtr = new(finance.BudgetID(row.BudgetID.String))
	}
	var periodIDPtr *finance.PeriodID
	if row.PeriodID.Valid {
		periodIDPtr = new(finance.PeriodID(row.PeriodID.String))
	}
	var accountIDPtr *finance.AccountID
	if row.AccountID.Valid {
		accountIDPtr = new(finance.AccountID(row.AccountID.String))
	}

	var meta finance.TransactionMetadata
	if row.Metadata.Valid && row.Metadata.String != "" {
		_ = json.Unmarshal([]byte(row.Metadata.String), &meta)
	}

	return &finance.Transaction{
		ID:              finance.TransactionID(row.ID),
		SpaceID:         finance.SpaceID(row.SpaceID),
		Type:            finance.TransactionType(row.Type),
		BudgetID:        budgetIDPtr,
		PeriodID:        periodIDPtr,
		AccountID:       accountIDPtr,
		Amount:          row.Amount,
		Currency:        finance.Currency(row.Currency),
		AmountInBase:    row.AmountInBase,
		Description:     row.Description,
		TransactionDate: nullTimeToTime(row.TransactionDate),
		EffectiveDate:   nullTimeToTime(row.EffectiveDate),
		Metadata:        meta,
		CreateTime:      nullTimeToTime(row.CreateTime),
		UpdateTime:      nullTimeToTime(row.UpdateTime),
	}
}

func (s *TransactionStore) GetByID(ctx context.Context, spaceID finance.SpaceID, id finance.TransactionID) (*finance.Transaction, error) {
	ds := pgDialect.From(goqu.S("finance").Table("transaction")).Select("*").Where(goqu.Ex{"space_id": string(spaceID), "id": string(id)})
	query, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return nil, err
	}
	var row transactionDB
	if err := s.db.GetContext(ctx, &row, query, args...); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, finance.ErrTransactionNotFound
		}
		return nil, err
	}
	return row.toDomain(), nil
}

func (s *TransactionStore) Delete(ctx context.Context, id finance.TransactionID) error {
	ds := pgDialect.Delete(goqu.S("finance").Table("transaction")).Where(goqu.Ex{"id": string(id)})
	query, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return err
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
		return finance.ErrTransactionNotFound
	}
	return nil
}

func (s *TransactionStore) Update(ctx context.Context, t *finance.Transaction) error {
	metaJSON, _ := json.Marshal(t.Metadata)
	if len(metaJSON) == 0 || string(metaJSON) == "null" {
		metaJSON = []byte("{}")
	}

	ds := pgDialect.Update(goqu.S("finance").Table("transaction")).
		Set(goqu.Record{
			"budget_id":        conv.StringPtr(t.BudgetID),
			"period_id":        conv.StringPtr(t.PeriodID),
			"account_id":       conv.StringPtr(t.AccountID),
			"amount":           t.Amount,
			"currency":         string(t.Currency),
			"amount_in_base":   t.AmountInBase,
			"description":      t.Description,
			"transaction_date": t.TransactionDate,
			"effective_date":   t.EffectiveDate,
			"metadata":         goqu.L("?::jsonb", string(metaJSON)),
			"update_time":      t.UpdateTime,
		}).
		Where(goqu.Ex{"id": string(t.ID)})
	query, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return err
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
		return finance.ErrTransactionNotFound
	}
	return nil
}

func (s *TransactionStore) ListBySpace(ctx context.Context, spaceID finance.SpaceID, filter *finance.TransactionFilter) (*paging.Page[*finance.Transaction], error) {
	if filter.PageSize <= 0 || filter.PageSize > 100 {
		filter.PageSize = 20
	}

	ds := pgDialect.From(goqu.S("finance").Table("transaction")).Select("*")

	// Apply filtering conditions
	ds = ds.Where(goqu.Ex{"space_id": string(spaceID)})

	if filter.BudgetID != nil {
		ds = ds.Where(goqu.Ex{"budget_id": string(*filter.BudgetID)})
	}
	if len(filter.Types) > 0 {
		typeStrs := make([]string, len(filter.Types))
		for i, t := range filter.Types {
			typeStrs[i] = string(t)
		}
		ds = ds.Where(goqu.I("type").In(typeStrs))
	}
	if filter.AccountID != nil {
		ds = ds.Where(goqu.Ex{"account_id": string(*filter.AccountID)})
	}
	if filter.TransferID != nil {
		ds = ds.Where(goqu.L("metadata->>'transfer_id'").Eq(*filter.TransferID))
	}
	if filter.BorrowingID != nil {
		ds = ds.Where(goqu.L("metadata->>'borrowing_id'").Eq(*filter.BorrowingID))
	}
	if len(filter.BorrowingRoles) > 0 {
		ds = ds.Where(goqu.L("metadata->>'borrowing_role'").In(filter.BorrowingRoles))
	}
	if filter.ScheduledTransactionID != nil {
		ds = ds.Where(goqu.L("metadata->>'scheduled_transaction_id'").Eq(*filter.ScheduledTransactionID))
	}
	if filter.MinAmount != nil {
		ds = ds.Where(goqu.I("amount").Gte(*filter.MinAmount))
	}
	if filter.MaxAmount != nil {
		ds = ds.Where(goqu.I("amount").Lte(*filter.MaxAmount))
	}
	if filter.StartDate != nil {
		ds = ds.Where(goqu.I("transaction_date").Gte(*filter.StartDate))
	}
	if filter.EndDate != nil {
		ds = ds.Where(goqu.I("transaction_date").Lte(*filter.EndDate))
	}
	if filter.SearchQuery != nil && *filter.SearchQuery != "" {
		ds = ds.Where(goqu.I("description").ILike("%" + *filter.SearchQuery + "%"))
	}

	// Keyset Cursor decoding
	cursor, _ := paging.Decode(filter.NextPageToken)

	// Validate sort field
	sortOrder := filter.Sort
	if !finance.IsTransactionSortField(sortOrder.Field) {
		sortOrder.Field = finance.DefaultTransactionSortField
		sortOrder.Ascending = false // Fallback to DESC for dates
	}

	// Apply sorting and keyset paging
	ds = paging.ApplyPagination(ds, paging.Options{
		Sort:     sortOrder,
		Cursor:   cursor,
		PageSize: uint(filter.PageSize),
	})

	query, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return nil, fmt.Errorf("build sql query: %w", err)
	}

	var dbRows []transactionDB
	if err := s.db.SelectContext(ctx, &dbRows, query, args...); err != nil {
		return nil, fmt.Errorf("select context: %w", err)
	}

	txns := make([]*finance.Transaction, len(dbRows))
	for i := range dbRows {
		txns[i] = dbRows[i].toDomain()
	}

	page := paging.NewPage(txns, int(filter.PageSize), func(t *finance.Transaction) paging.Cursor {
		return paging.Cursor{
			SortValue: t.GetSortValue(sortOrder.Field),
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
	WHERE period_id = $1 AND type = 'EXPENSE'`

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
		WHERE t.period_id IN (?) AND t.type = 'EXPENSE'
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

func (s *TransactionStore) HasTransactions(ctx context.Context, spaceID finance.SpaceID, filter *finance.TransactionFilter) (bool, error) {
	ds := pgDialect.From(goqu.S("finance").Table("transaction")).Select(goqu.L("1")).Where(goqu.Ex{"space_id": string(spaceID)})

	if filter != nil {
		if filter.BudgetID != nil {
			ds = ds.Where(goqu.Ex{"budget_id": string(*filter.BudgetID)})
		}
		if len(filter.Types) > 0 {
			typeStrs := make([]string, len(filter.Types))
			for i, t := range filter.Types {
				typeStrs[i] = string(t)
			}
			ds = ds.Where(goqu.I("type").In(typeStrs))
		}
		if filter.AccountID != nil {
			ds = ds.Where(goqu.Ex{"account_id": string(*filter.AccountID)})
		}
		if filter.TransferID != nil {
			ds = ds.Where(goqu.L("metadata->>'transfer_id'").Eq(*filter.TransferID))
		}
	}

	query, args, err := ds.Limit(1).ToSQL()
	if err != nil {
		return false, err
	}

	var exists int
	err = s.db.QueryRowContext(ctx, query, args...).Scan(&exists)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return true, nil
}
