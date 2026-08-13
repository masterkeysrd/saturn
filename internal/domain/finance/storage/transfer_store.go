package storage

import (
	"context"
	"database/sql"
	"encoding/base64"
	"errors"

	"github.com/doug-martin/goqu/v9"
	"github.com/jmoiron/sqlx"
	"github.com/masterkeysrd/saturn/internal/domain/finance"
)

type transferDB struct {
	ID                   string       `db:"id"`
	SpaceID              string       `db:"space_id"`
	SourceAccountID      string       `db:"source_account_id"`
	DestinationAccountID string       `db:"destination_account_id"`
	SourceAmount         int64        `db:"source_amount"`
	DestinationAmount    int64        `db:"destination_amount"`
	TransferDate         sql.NullTime `db:"transfer_date"`
	Notes                string       `db:"notes"`
	CreateTime           sql.NullTime `db:"create_time"`
	UpdateTime           sql.NullTime `db:"update_time"`
}

type TransferStore struct {
	db *sqlx.DB
}

func NewTransferStore(db *sqlx.DB) *TransferStore {
	return &TransferStore{db: db}
}

func (s *TransferStore) Create(ctx context.Context, t *finance.Transfer) error {
	ds := pgDialect.Insert(goqu.S("finance").Table("transfer")).Rows(goqu.Record{
		"id":                     string(t.ID),
		"space_id":               string(t.SpaceID),
		"source_account_id":      string(t.SourceAccountID),
		"destination_account_id": string(t.DestinationAccountID),
		"source_amount":          t.SourceAmount,
		"destination_amount":     t.DestinationAmount,
		"transfer_date":          timeToNullTime(t.TransferDate),
		"notes":                  t.Notes,
		"create_time":            t.CreateTime,
		"update_time":            t.UpdateTime,
	})
	query, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return err
	}
	_, err = s.db.ExecContext(ctx, query, args...)
	return err
}

func (s *TransferStore) GetByID(ctx context.Context, spaceID finance.SpaceID, id finance.TransferID) (*finance.Transfer, error) {
	ds := pgDialect.From(goqu.S("finance").Table("transfer")).
		Select("*").
		Where(goqu.Ex{"space_id": string(spaceID), "id": string(id)})
	query, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return nil, err
	}
	var row transferDB
	if err := s.db.GetContext(ctx, &row, query, args...); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, finance.ErrTransferNotFound
		}
		return nil, err
	}
	return &finance.Transfer{
		ID:                   finance.TransferID(row.ID),
		SpaceID:              finance.SpaceID(row.SpaceID),
		SourceAccountID:      finance.AccountID(row.SourceAccountID),
		DestinationAccountID: finance.AccountID(row.DestinationAccountID),
		SourceAmount:         row.SourceAmount,
		DestinationAmount:    row.DestinationAmount,
		TransferDate:         nullTimeToTime(row.TransferDate),
		Notes:                row.Notes,
		CreateTime:           nullTimeToTime(row.CreateTime),
		UpdateTime:           nullTimeToTime(row.UpdateTime),
	}, nil
}

func (s *TransferStore) Delete(ctx context.Context, id finance.TransferID) error {
	ds := pgDialect.Delete(goqu.S("finance").Table("transfer")).
		Where(goqu.Ex{"id": string(id)})
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
		return finance.ErrTransferNotFound
	}
	return nil
}

func (s *TransferStore) ListBySpace(ctx context.Context, spaceID finance.SpaceID, limit int32, pageToken string) ([]*finance.Transfer, string, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}

	var cursorID string
	if pageToken != "" {
		if decoded, err := base64.URLEncoding.DecodeString(pageToken); err == nil {
			cursorID = string(decoded)
		}
	}

	ds := pgDialect.From(goqu.S("finance").Table("transfer")).
		Select("*").
		Where(goqu.Ex{"space_id": string(spaceID)})

	if cursorID != "" {
		ds = ds.Where(goqu.I("id").Lt(cursorID))
	}

	ds = ds.Order(goqu.I("transfer_date").Desc(), goqu.I("id").Desc()).Limit(uint(limit + 1))

	query, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return nil, "", err
	}

	var rows []transferDB
	if err := s.db.SelectContext(ctx, &rows, query, args...); err != nil {
		return nil, "", err
	}

	hasMore := len(rows) > int(limit)
	if hasMore {
		rows = rows[:limit]
	}

	transfers := make([]*finance.Transfer, 0, len(rows))
	for i := range rows {
		transfers = append(transfers, &finance.Transfer{
			ID:                   finance.TransferID(rows[i].ID),
			SpaceID:              finance.SpaceID(rows[i].SpaceID),
			SourceAccountID:      finance.AccountID(rows[i].SourceAccountID),
			DestinationAccountID: finance.AccountID(rows[i].DestinationAccountID),
			SourceAmount:         rows[i].SourceAmount,
			DestinationAmount:    rows[i].DestinationAmount,
			TransferDate:         nullTimeToTime(rows[i].TransferDate),
			Notes:                rows[i].Notes,
			CreateTime:           nullTimeToTime(rows[i].CreateTime),
			UpdateTime:           nullTimeToTime(rows[i].UpdateTime),
		})
	}

	var nextToken string
	if hasMore && len(rows) > 0 {
		lastTransfer := rows[len(rows)-1]
		nextToken = base64.URLEncoding.EncodeToString([]byte(lastTransfer.ID))
	}

	return transfers, nextToken, nil
}
