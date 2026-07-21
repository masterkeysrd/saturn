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
	query := `INSERT INTO finance.transfer (id, space_id, source_account_id, destination_account_id, source_amount, destination_amount, transfer_date, notes, create_time, update_time)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`
	_, err := s.db.ExecContext(ctx, query,
		string(t.ID), string(t.SpaceID), string(t.SourceAccountID), string(t.DestinationAccountID),
		t.SourceAmount, t.DestinationAmount, timeToNullTime(t.TransferDate), t.Notes, t.CreateTime, t.UpdateTime,
	)
	return err
}

func (s *TransferStore) GetByID(ctx context.Context, id finance.TransferID) (*finance.Transfer, error) {
	var row transferDB
	query := `SELECT * FROM finance.transfer WHERE id = $1`
	if err := s.db.GetContext(ctx, &row, query, string(id)); err != nil {
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
	query := `DELETE FROM finance.transfer WHERE id = $1`
	res, err := s.db.ExecContext(ctx, query, string(id))
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

	conditions := []string{"space_id = $1"}
	args := []any{string(spaceID)}
	argIndex := 2

	if cursorID != "" {
		conditions = append(conditions, fmt.Sprintf("id < $%d", argIndex))
		args = append(args, cursorID)
		argIndex++
	}

	query := fmt.Sprintf(`SELECT * FROM finance.transfer WHERE %s ORDER BY transfer_date DESC, id DESC LIMIT $%d`, strings.Join(conditions, " AND "), argIndex)
	args = append(args, limit+1)

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
