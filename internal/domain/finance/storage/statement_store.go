package storage

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/doug-martin/goqu/v9"
	"github.com/jmoiron/sqlx"
	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/platform/paging"
	"github.com/masterkeysrd/saturn/internal/platform/sorting"
)

type statementDB struct {
	ID                       string       `db:"id"`
	SpaceID                  string       `db:"space_id"`
	AccountID                string       `db:"account_id"`
	Status                   string       `db:"status"`
	StatementDate            time.Time    `db:"statement_date"`
	StatementStartingBalance int64        `db:"statement_starting_balance"`
	StatementEndingBalance   int64        `db:"statement_ending_balance"`
	Filename                 string       `db:"filename"`
	ConfigJSON               string       `db:"column_mapping"`
	RawContent               string       `db:"raw_content"`
	Version                  int64        `db:"version"`
	CreateTime               sql.NullTime `db:"create_time"`
	UpdateTime               sql.NullTime `db:"update_time"`
}

func (row *statementDB) toDomain() *finance.Statement {
	var config finance.StatementConfig
	if row.ConfigJSON != "" {
		_ = json.Unmarshal([]byte(row.ConfigJSON), &config)
	}

	return &finance.Statement{
		ID:                       finance.StatementID(row.ID),
		SpaceID:                  finance.SpaceID(row.SpaceID),
		AccountID:                finance.AccountID(row.AccountID),
		Status:                   finance.StatementStatus(row.Status),
		StatementDate:            row.StatementDate,
		StatementStartingBalance: row.StatementStartingBalance,
		StatementEndingBalance:   row.StatementEndingBalance,
		Filename:                 row.Filename,
		Config:                   config,
		RawContent:               row.RawContent,
		Version:                  row.Version,
		CreateTime:               nullTimeToTime(row.CreateTime),
		UpdateTime:               nullTimeToTime(row.UpdateTime),
	}
}

type statementLineDB struct {
	ID                   string         `db:"id"`
	StatementID          string         `db:"statement_id"`
	RowIndex             int32          `db:"row_index"`
	DateStr              string         `db:"date_str"`
	Description          string         `db:"description"`
	Amount               int64          `db:"amount"`
	Reference            sql.NullString `db:"reference"`
	Action               sql.NullString `db:"action"`
	Status               string         `db:"status"`
	MatchedTransactionID sql.NullString `db:"matched_transaction_id"`
	Version              int64          `db:"version"`
}

func (row *statementLineDB) toDomain() *finance.StatementLine {
	var ref *string
	if row.Reference.Valid {
		ref = &row.Reference.String
	}
	var matchedTxnID *finance.TransactionID
	if row.MatchedTransactionID.Valid {
		id := finance.TransactionID(row.MatchedTransactionID.String)
		matchedTxnID = &id
	}

	var action finance.StatementLineAction
	if row.Action.Valid && row.Action.String != "" {
		_ = json.Unmarshal([]byte(row.Action.String), &action)
	}

	return &finance.StatementLine{
		ID:                   finance.StatementLineID(row.ID),
		StatementID:          finance.StatementID(row.StatementID),
		RowIndex:             row.RowIndex,
		DateStr:              row.DateStr,
		Description:          row.Description,
		Amount:               row.Amount,
		Reference:            ref,
		Action:               action,
		Status:               finance.StatementLineStatus(row.Status),
		MatchedTransactionID: matchedTxnID,
		Version:              row.Version,
	}
}

type StatementStore struct {
	db *sqlx.DB
}

func NewStatementStore(db *sqlx.DB) *StatementStore {
	return &StatementStore{db: db}
}

func (s *StatementStore) Create(ctx context.Context, stmt *finance.Statement, lines []*finance.StatementLine) error {
	tx, err := s.db.BeginTxx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if stmt.Version == 0 {
		stmt.Version = 1
	}

	configJSON, _ := json.Marshal(stmt.Config)

	stmtDS := pgDialect.Insert(goqu.S("finance").Table("statement")).Rows(goqu.Record{
		"id":                         string(stmt.ID),
		"space_id":                   string(stmt.SpaceID),
		"account_id":                 string(stmt.AccountID),
		"status":                     string(stmt.Status),
		"statement_date":             stmt.StatementDate,
		"statement_starting_balance": stmt.StatementStartingBalance,
		"statement_ending_balance":   stmt.StatementEndingBalance,
		"filename":                   stmt.Filename,
		"column_mapping":             string(configJSON),
		"raw_content":                stmt.RawContent,
		"version":                    stmt.Version,
		"create_time":                stmt.CreateTime,
		"update_time":                stmt.UpdateTime,
	})
	stmtQuery, stmtArgs, err := stmtDS.Prepared(true).ToSQL()
	if err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, stmtQuery, stmtArgs...); err != nil {
		return err
	}

	// Insert Lines
	for _, l := range lines {
		if l.Version == 0 {
			l.Version = 1
		}
		actionJSON, _ := json.Marshal(l.Action)
		if len(actionJSON) == 0 || string(actionJSON) == "null" {
			actionJSON = []byte("{}")
		}

		lineDS := pgDialect.Insert(goqu.S("finance").Table("statement_line")).Rows(goqu.Record{
			"id":                     string(l.ID),
			"statement_id":           string(l.StatementID),
			"row_index":              l.RowIndex,
			"date_str":               l.DateStr,
			"description":            l.Description,
			"amount":                 l.Amount,
			"reference":              stringPtrToNullString(l.Reference),
			"action":                 goqu.L("?::jsonb", string(actionJSON)),
			"status":                 string(l.Status),
			"matched_transaction_id": transactionIDPtrToNullString(l.MatchedTransactionID),
			"version":                l.Version,
		})
		lineQuery, lineArgs, err := lineDS.Prepared(true).ToSQL()
		if err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, lineQuery, lineArgs...); err != nil {
			return err
		}
	}

	return tx.Commit()
}

func (s *StatementStore) GetByID(ctx context.Context, spaceID finance.SpaceID, id finance.StatementID) (*finance.Statement, error) {
	ds := pgDialect.From(goqu.S("finance").Table("statement")).
		Select("*").
		Where(goqu.Ex{"space_id": string(spaceID), "id": string(id)})
	query, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return nil, err
	}
	var row statementDB
	if err := s.db.GetContext(ctx, &row, query, args...); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, finance.ErrStatementNotFound
		}
		return nil, err
	}
	return row.toDomain(), nil
}

func (s *StatementStore) List(ctx context.Context, spaceID finance.SpaceID, filter *finance.ListStatementsFilter) (*paging.Page[*finance.Statement], error) {
	if filter.PageSize <= 0 || filter.PageSize > 100 {
		filter.PageSize = 20
	}

	ds := pgDialect.From(goqu.S("finance").Table("statement")).Select("*")
	ds = ds.Where(goqu.Ex{"space_id": string(spaceID)})

	if filter.AccountID != nil {
		ds = ds.Where(goqu.Ex{"account_id": string(*filter.AccountID)})
	}
	if filter.Status != nil {
		ds = ds.Where(goqu.Ex{"status": string(*filter.Status)})
	}

	cursor, _ := paging.Decode(filter.PageToken)

	sortOrder := sorting.SortOrder{
		Field:     "create_time",
		Ascending: false,
	}

	ds = paging.ApplyPagination(ds, paging.Options{
		Sort:     sortOrder,
		Cursor:   cursor,
		PageSize: uint(filter.PageSize),
	})

	query, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return nil, fmt.Errorf("build list statements query: %w", err)
	}

	var rows []statementDB
	if err := s.db.SelectContext(ctx, &rows, query, args...); err != nil {
		return nil, fmt.Errorf("execute list statements query: %w", err)
	}

	statements := make([]*finance.Statement, len(rows))
	for i := range rows {
		statements[i] = rows[i].toDomain()
	}

	page := paging.NewPage(statements, int(filter.PageSize), func(stmt *finance.Statement) paging.Cursor {
		return paging.Cursor{
			SortValue: stmt.CreateTime.Format(time.RFC3339Nano),
			ID:        string(stmt.ID),
		}
	})

	return page, nil
}

func (s *StatementStore) Delete(ctx context.Context, spaceID finance.SpaceID, id finance.StatementID, opts finance.DeleteOptions) error {
	ex := goqu.Ex{"space_id": string(spaceID), "id": string(id)}
	if opts.Version > 0 {
		ex["version"] = opts.Version
	}
	ds := pgDialect.Delete(goqu.S("finance").Table("statement")).Where(ex)
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
		if opts.Version > 0 {
			var exists bool
			checkQuery, checkArgs, _ := pgDialect.From(goqu.S("finance").Table("statement")).
				Select(goqu.L("1")).
				Where(goqu.Ex{"space_id": string(spaceID), "id": string(id)}).
				Prepared(true).ToSQL()
			_ = s.db.GetContext(ctx, &exists, checkQuery, checkArgs...)
			if exists {
				return finance.ErrStatementVersionMismatch
			}
		}
		return finance.ErrStatementNotFound
	}
	return nil
}

func (s *StatementStore) Update(ctx context.Context, stmt *finance.Statement) error {
	stmt.UpdateTime = time.Now().UTC()
	rec := goqu.Record{
		"status":                     string(stmt.Status),
		"statement_starting_balance": stmt.StatementStartingBalance,
		"statement_ending_balance":   stmt.StatementEndingBalance,
		"statement_date":             stmt.StatementDate,
		"version":                    goqu.L("version + 1"),
		"update_time":                stmt.UpdateTime,
	}
	ex := goqu.Ex{"id": string(stmt.ID), "space_id": string(stmt.SpaceID)}
	if stmt.Version > 0 {
		ex["version"] = stmt.Version
	}
	ds := pgDialect.Update(goqu.S("finance").Table("statement")).
		Set(rec).
		Where(ex)
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
		if stmt.Version > 0 {
			var exists bool
			checkQuery, checkArgs, _ := pgDialect.From(goqu.S("finance").Table("statement")).
				Select(goqu.L("1")).
				Where(goqu.Ex{"space_id": string(stmt.SpaceID), "id": string(stmt.ID)}).
				Prepared(true).ToSQL()
			_ = s.db.GetContext(ctx, &exists, checkQuery, checkArgs...)
			if exists {
				return finance.ErrStatementVersionMismatch
			}
		}
		return finance.ErrStatementNotFound
	}
	stmt.Version++
	return nil
}

func (s *StatementStore) ListLines(ctx context.Context, statementID finance.StatementID) ([]*finance.StatementLine, error) {
	ds := pgDialect.From(goqu.S("finance").Table("statement_line")).
		Select("*").
		Where(goqu.Ex{"statement_id": string(statementID)}).
		Order(goqu.I("row_index").Asc())
	query, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return nil, err
	}
	var rows []statementLineDB
	if err := s.db.SelectContext(ctx, &rows, query, args...); err != nil {
		return nil, err
	}
	lines := make([]*finance.StatementLine, len(rows))
	for i := range rows {
		lines[i] = rows[i].toDomain()
	}
	return lines, nil
}

func (s *StatementStore) GetLineByID(ctx context.Context, id finance.StatementLineID) (*finance.StatementLine, error) {
	ds := pgDialect.From(goqu.S("finance").Table("statement_line")).
		Select("*").
		Where(goqu.Ex{"id": string(id)})
	query, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return nil, err
	}
	var row statementLineDB
	if err := s.db.GetContext(ctx, &row, query, args...); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, finance.ErrStatementLineNotFound
		}
		return nil, err
	}
	return row.toDomain(), nil
}

func (s *StatementStore) UpdateLineDraft(ctx context.Context, line *finance.StatementLine) error {
	actionJSON, _ := json.Marshal(line.Action)
	if len(actionJSON) == 0 || string(actionJSON) == "null" {
		actionJSON = []byte("{}")
	}

	rec := goqu.Record{
		"description":            line.Description,
		"amount":                 line.Amount,
		"status":                 string(line.Status),
		"action":                 goqu.L("?::jsonb", string(actionJSON)),
		"matched_transaction_id": transactionIDPtrToNullString(line.MatchedTransactionID),
		"version":                goqu.L("version + 1"),
	}

	ex := goqu.Ex{"id": string(line.ID)}
	if line.Version > 0 {
		ex["version"] = line.Version
	}

	ds := pgDialect.Update(goqu.S("finance").Table("statement_line")).
		Set(rec).
		Where(ex)

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
		if line.Version > 0 {
			var exists bool
			checkQuery, checkArgs, _ := pgDialect.From(goqu.S("finance").Table("statement_line")).
				Select(goqu.L("1")).
				Where(goqu.Ex{"id": string(line.ID)}).
				Prepared(true).ToSQL()
			_ = s.db.GetContext(ctx, &exists, checkQuery, checkArgs...)
			if exists {
				return finance.ErrStatementLineVersionMismatch
			}
		}
		return finance.ErrStatementLineNotFound
	}
	line.Version++
	return nil
}

// Helpers

func stringPtrToNullString(s *string) sql.NullString {
	if s == nil {
		return sql.NullString{Valid: false}
	}
	return sql.NullString{String: *s, Valid: true}
}

func transactionIDPtrToNullString(id *finance.TransactionID) sql.NullString {
	if id == nil {
		return sql.NullString{Valid: false}
	}
	return sql.NullString{String: string(*id), Valid: true}
}
