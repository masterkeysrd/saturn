package storage

import (
	"context"
	"time"

	"github.com/jmoiron/sqlx"
	"github.com/masterkeysrd/saturn/internal/domain/finance"
)

type transactionEventDB struct {
	ID            string    `db:"id"`
	SpaceID       string    `db:"space_id"`
	TransactionID string    `db:"txn_id"`
	EventType     string    `db:"event_type"`
	Metadata      []byte    `db:"metadata"`
	CreateTime    time.Time `db:"create_time"`
}

type TransactionEventStore struct {
	db *sqlx.DB
}

func NewTransactionEventStore(db *sqlx.DB) *TransactionEventStore {
	return &TransactionEventStore{db: db}
}

func (s *TransactionEventStore) Create(ctx context.Context, e *finance.TransactionEvent) error {
	query := `INSERT INTO finance.transaction_events (id, space_id, txn_id, event_type, metadata, create_time)
		VALUES ($1, $2, $3, $4, $5, $6)`

	metadataBytes, err := e.MetadataJSON()
	if err != nil {
		return err
	}

	_, err = s.db.ExecContext(ctx, query,
		string(e.ID), string(e.SpaceID), string(e.TransactionID),
		e.EventType, metadataBytes, e.CreateTime,
	)
	return err
}

func (s *TransactionEventStore) ListByTransaction(ctx context.Context, spaceID finance.SpaceID, txnID finance.TransactionID) ([]*finance.TransactionEvent, error) {
	query := `SELECT id, space_id, txn_id, event_type, metadata, create_time 
		FROM finance.transaction_events 
		WHERE space_id = $1 AND txn_id = $2 
		ORDER BY create_time ASC`

	var rows []transactionEventDB
	if err := s.db.SelectContext(ctx, &rows, query, string(spaceID), string(txnID)); err != nil {
		return nil, err
	}

	events := make([]*finance.TransactionEvent, 0, len(rows))
	for i := range rows {
		e := &finance.TransactionEvent{
			ID:            finance.TransactionEventID(rows[i].ID),
			SpaceID:       finance.SpaceID(rows[i].SpaceID),
			TransactionID: finance.TransactionID(rows[i].TransactionID),
			EventType:     rows[i].EventType,
			CreateTime:    rows[i].CreateTime,
		}
		if err := e.ParseMetadataJSON(rows[i].Metadata); err != nil {
			return nil, err
		}
		events = append(events, e)
	}

	return events, nil
}
