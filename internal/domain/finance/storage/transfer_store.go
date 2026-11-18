package storage

import (
	"context"
	"database/sql"
	"time"

	"github.com/doug-martin/goqu/v9"
	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/platform/db"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/paging"
	"github.com/masterkeysrd/saturn/internal/platform/sorting"
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
	db db.DB
}

func NewTransferStore(database db.DB) *TransferStore {
	return &TransferStore{db: database}
}

func (s *TransferStore) Create(ctx context.Context, rCtx finance.Context, t *finance.Transfer) error {
	const op errors.Op = "domain/finance/storage.CreateTransfer"
	ds := pgDialect.Insert(goqu.S("finance").Table("transfer")).Rows(goqu.Record{
		"id":                     string(t.ID),
		"space_id":               string(rCtx.SpaceID()),
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
		return errors.E(op, err)
	}
	if _, err := s.db.Exec(ctx, query, args...); err != nil {
		return errors.E(op, err)
	}
	return nil
}

func (s *TransferStore) GetByID(ctx context.Context, rCtx finance.Context, id finance.TransferID) (*finance.Transfer, error) {
	const op errors.Op = "domain/finance/storage.GetTransferByID"
	ds := pgDialect.From(goqu.S("finance").Table("transfer")).
		Select("*").
		Where(goqu.Ex{"space_id": string(rCtx.SpaceID()), "id": string(id)})
	query, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return nil, errors.E(op, err)
	}
	var row transferDB
	if err := s.db.Get(ctx, &row, query, args...); err != nil {
		return nil, errors.E(op, err)
	}
	return &finance.Transfer{
		ID:                   finance.TransferID(row.ID),
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

func (s *TransferStore) Delete(ctx context.Context, rCtx finance.Context, id finance.TransferID) error {
	const op errors.Op = "domain/finance/storage.DeleteTransfer"
	ds := pgDialect.Delete(goqu.S("finance").Table("transfer")).
		Where(goqu.Ex{"id": string(id), "space_id": string(rCtx.SpaceID())})
	query, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return errors.E(op, err)
	}
	if err := s.db.ExecOne(ctx, query, args...); err != nil {
		return errors.E(op, err)
	}
	return nil
}

func (s *TransferStore) ListBySpace(ctx context.Context, rCtx finance.Context, limit int32, pageToken string) ([]*finance.Transfer, string, error) {
	const op errors.Op = "domain/finance/storage.ListTransfersBySpace"
	if limit <= 0 || limit > 100 {
		limit = 20
	}

	cursor, _ := paging.Decode(pageToken)
	sortOrder := sorting.New("transfer_date", false)

	ds := pgDialect.From(goqu.S("finance").Table("transfer")).
		Select("*").
		Where(goqu.Ex{"space_id": string(rCtx.SpaceID())})

	ds = paging.ApplyPagination(ds, paging.Options{
		Sort:     sortOrder,
		Cursor:   cursor,
		PageSize: uint(limit),
	})

	query, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return nil, "", errors.E(op, err)
	}

	var rows []transferDB
	if err := s.db.Select(ctx, &rows, query, args...); err != nil {
		return nil, "", errors.E(op, err)
	}

	transfers := make([]*finance.Transfer, 0, len(rows))
	for i := range rows {
		transfers = append(transfers, &finance.Transfer{
			ID:                   finance.TransferID(rows[i].ID),
			SourceAccountID:      finance.AccountID(rows[i].SourceAccountID),
			DestinationAccountID: finance.AccountID(rows[i].DestinationAccountID),
			SourceAmount:         rowAmount(rows[i].SourceAmount),
			DestinationAmount:    rows[i].DestinationAmount,
			TransferDate:         nullTimeToTime(rows[i].TransferDate),
			Notes:                rows[i].Notes,
			CreateTime:           nullTimeToTime(rows[i].CreateTime),
			UpdateTime:           nullTimeToTime(rows[i].UpdateTime),
		})
	}

	page := paging.NewPage(transfers, int(limit), func(t *finance.Transfer) paging.Cursor {
		return paging.Cursor{
			SortValue: t.TransferDate.UTC().Format(time.RFC3339Nano),
			ID:        string(t.ID),
		}
	})

	return page.Items, page.NextPageToken, nil
}

func rowAmount(amount int64) int64 {
	return amount
}
