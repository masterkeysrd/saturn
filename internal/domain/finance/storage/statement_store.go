package storage

import (
	"context"
	"database/sql"
	"encoding/json"
	"time"

	"github.com/doug-martin/goqu/v9"
	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/platform/db"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
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
	db db.DB
}

func NewStatementStore(database db.DB) *StatementStore {
	return &StatementStore{db: database}
}

func (s *StatementStore) Create(ctx context.Context, stmt *finance.Statement, lines []*finance.StatementLine) error {
	const op errors.Op = "domain/finance/storage.CreateStatement"

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
		return errors.E(op, err)
	}
	if _, err := s.db.Exec(ctx, stmtQuery, stmtArgs...); err != nil {
		return errors.E(op, err)
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
			return errors.E(op, err)
		}
		if _, err := s.db.Exec(ctx, lineQuery, lineArgs...); err != nil {
			return errors.E(op, err)
		}
	}

	return nil
}

func (s *StatementStore) GetByID(ctx context.Context, spaceID finance.SpaceID, id finance.StatementID) (*finance.Statement, error) {
	const op errors.Op = "domain/finance/storage.GetStatementByID"
	ds := pgDialect.From(goqu.S("finance").Table("statement")).
		Select("*").
		Where(goqu.Ex{"space_id": string(spaceID), "id": string(id)})
	query, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return nil, errors.E(op, err)
	}
	var row statementDB
	if err := s.db.Get(ctx, &row, query, args...); err != nil {
		return nil, errors.E(op, err)
	}
	return row.toDomain(), nil
}

func (s *StatementStore) List(ctx context.Context, spaceID finance.SpaceID, filter *finance.ListStatementsFilter) (*paging.Page[*finance.Statement], error) {
	const op errors.Op = "domain/finance/storage.ListStatements"
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
		return nil, errors.E(op, err)
	}

	var rows []statementDB
	if err := s.db.Select(ctx, &rows, query, args...); err != nil {
		return nil, errors.E(op, err)
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
	const op errors.Op = "domain/finance/storage.DeleteStatement"
	ex := goqu.Ex{
		"space_id": string(spaceID),
		"id":       string(id),
	}
	if opts.Version > 0 {
		ex["version"] = opts.Version
	}
	ds := pgDialect.Delete(goqu.S("finance").Table("statement")).Where(ex)
	query, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return errors.E(op, err)
	}
	if err := s.db.ExecOne(ctx, query, args...); err != nil {
		if opts.Version > 0 && errors.Is(err, errors.NotExist) {
			return errors.E(op, errors.Conflict, finance.StatementVersionMismatch, "statement version mismatch")
		}
		return errors.E(op, err)
	}
	return nil
}

func (s *StatementStore) Update(ctx context.Context, stmt *finance.Statement) error {
	const op errors.Op = "domain/finance/storage.UpdateStatement"
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
		return errors.E(op, err)
	}
	if err := s.db.ExecOne(ctx, query, args...); err != nil {
		if errors.Is(err, errors.NotExist) {
			return errors.E(op, errors.Conflict, finance.StatementVersionMismatch, "statement version mismatch")
		}
		return errors.E(op, err)
	}
	stmt.Version++
	return nil
}

func (s *StatementStore) ListLines(ctx context.Context, statementID finance.StatementID) ([]*finance.StatementLine, error) {
	const op errors.Op = "domain/finance/storage.ListStatementLines"
	ds := pgDialect.From(goqu.S("finance").Table("statement_line")).
		Select("*").
		Where(goqu.Ex{"statement_id": string(statementID)}).
		Order(goqu.I("row_index").Asc())
	query, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return nil, errors.E(op, err)
	}
	var rows []statementLineDB
	if err := s.db.Select(ctx, &rows, query, args...); err != nil {
		return nil, errors.E(op, err)
	}
	lines := make([]*finance.StatementLine, len(rows))
	for i := range rows {
		lines[i] = rows[i].toDomain()
	}
	return lines, nil
}

func (s *StatementStore) GetLineByID(ctx context.Context, id finance.StatementLineID) (*finance.StatementLine, error) {
	const op errors.Op = "domain/finance/storage.GetStatementLineByID"
	ds := pgDialect.From(goqu.S("finance").Table("statement_line")).
		Select("*").
		Where(goqu.Ex{"id": string(id)})
	query, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return nil, errors.E(op, err)
	}
	var row statementLineDB
	if err := s.db.Get(ctx, &row, query, args...); err != nil {
		return nil, errors.E(op, err)
	}
	return row.toDomain(), nil
}

func (s *StatementStore) UpdateLineDraft(ctx context.Context, line *finance.StatementLine) error {
	const op errors.Op = "domain/finance/storage.UpdateStatementLineDraft"
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
		return errors.E(op, err)
	}
	if err := s.db.ExecOne(ctx, query, args...); err != nil {
		if errors.Is(err, errors.NotExist) {
			return errors.E(op, errors.Conflict, finance.VersionMismatch, "statement line version mismatch")
		}
		return errors.E(op, err)
	}
	line.Version++
	return nil
}

// UpdateStatementWithLines updates a statement and all its lines.
func (s *StatementStore) UpdateStatementWithLines(ctx context.Context, stmt *finance.Statement, lines []*finance.StatementLine) error {
	const op errors.Op = "domain/finance/storage.UpdateStatementWithLines"

	now := time.Now().UTC()
	updateStmtQuery := `
		UPDATE finance.statement
		SET statement_starting_balance = $1,
		    statement_ending_balance = $2,
		    version = version + 1,
		    update_time = $3
		WHERE space_id = $4 AND id = $5`
	if err := s.db.ExecOne(ctx, updateStmtQuery, stmt.StatementStartingBalance, stmt.StatementEndingBalance, now, string(stmt.SpaceID), string(stmt.ID)); err != nil {
		return errors.E(op, err)
	}

	updateLineQuery := `
		UPDATE finance.statement_line
		SET amount = $1,
		    action = $2,
		    version = version + 1
		WHERE id = $3 AND statement_id = $4`
	for _, l := range lines {
		var actionJSON *string
		if l.Action.Type != "" {
			b, err := json.Marshal(l.Action)
			if err != nil {
				return errors.E(op, err)
			}
			str := string(b)
			actionJSON = &str
		}

		if err := s.db.ExecOne(ctx, updateLineQuery, l.Amount, actionJSON, string(l.ID), string(stmt.ID)); err != nil {
			return errors.E(op, err)
		}
	}

	stmt.Version++
	stmt.UpdateTime = now
	for _, l := range lines {
		l.Version++
	}

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
