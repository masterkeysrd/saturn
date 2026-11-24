package storage

import (
	"context"
	"database/sql"
	"encoding/json/v2"
	"time"

	"github.com/masterkeysrd/saturn/internal/domain/mail"
	"github.com/masterkeysrd/saturn/internal/platform/db"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

// ThreadSummaryRecord represents the row schema for mail.thread_summaries.
type ThreadSummaryRecord struct {
	ThreadID      string         `db:"thread_id"`
	SpaceID       string         `db:"space_id"`
	Language      string         `db:"language"`
	TLDR          string         `db:"tldr"`
	KeyPointsJSON []byte         `db:"key_points"`
	ActionJSON    []byte         `db:"action_items"`
	LastMessageID string         `db:"last_message_id"`
	LastMessageAt time.Time      `db:"last_message_at"`
	MessageCount  int            `db:"message_count"`
	FlowRunID     sql.NullString `db:"flow_run_id"`
	CreateTime    time.Time      `db:"create_time"`
	UpdateTime    time.Time      `db:"update_time"`
}

func (r *ThreadSummaryRecord) toModel() *mail.ThreadSummary {
	var keyPoints []string
	if len(r.KeyPointsJSON) > 0 {
		_ = json.Unmarshal(r.KeyPointsJSON, &keyPoints)
	}
	if keyPoints == nil {
		keyPoints = []string{}
	}

	var actionItems []string
	if len(r.ActionJSON) > 0 {
		_ = json.Unmarshal(r.ActionJSON, &actionItems)
	}
	if actionItems == nil {
		actionItems = []string{}
	}

	return &mail.ThreadSummary{
		ThreadID:      r.ThreadID,
		SpaceID:       r.SpaceID,
		Language:      r.Language,
		TLDR:          r.TLDR,
		KeyPoints:     keyPoints,
		ActionItems:   actionItems,
		LastMessageID: r.LastMessageID,
		LastMessageAt: r.LastMessageAt,
		MessageCount:  r.MessageCount,
		FlowRunID:     nullStringToStrPtr(r.FlowRunID),
		CreateTime:    r.CreateTime,
		UpdateTime:    r.UpdateTime,
	}
}

// ThreadSummaryStore implements mail.ThreadSummaryStore backed by PostgreSQL.
type ThreadSummaryStore struct {
	db db.DB
}

// NewThreadSummaryStore constructs a new ThreadSummaryStore.
func NewThreadSummaryStore(database db.DB) *ThreadSummaryStore {
	return &ThreadSummaryStore{db: database}
}

// Get retrieves a ThreadSummary by space ID, thread ID, and language.
func (s *ThreadSummaryStore) Get(ctx context.Context, spaceID, threadID, language string) (*mail.ThreadSummary, error) {
	const op errors.Op = "mail/storage.ThreadSummaryStore.Get"

	query := `
		SELECT
			thread_id, space_id, language, tldr, key_points, action_items,
			last_message_id, last_message_at, message_count, flow_run_id,
			create_time, update_time
		FROM mail.thread_summaries
		WHERE space_id = $1 AND thread_id = $2 AND language = $3
	`

	var record ThreadSummaryRecord
	err := s.db.Get(ctx, &record, query, spaceID, threadID, language)
	if err != nil {
		if errors.Is(err, errors.NotExist) {
			return nil, nil
		}
		return nil, errors.E(op, err)
	}

	return record.toModel(), nil
}

// Upsert persists or updates a ThreadSummary keyed by (thread_id, language).
func (s *ThreadSummaryStore) Upsert(ctx context.Context, summary *mail.ThreadSummary) error {
	const op errors.Op = "mail/storage.ThreadSummaryStore.Upsert"

	keyPointsBytes, err := json.Marshal(summary.KeyPoints)
	if err != nil {
		return errors.E(op, errors.Internal, "marshal key points: %w", err)
	}
	actionItemsBytes, err := json.Marshal(summary.ActionItems)
	if err != nil {
		return errors.E(op, errors.Internal, "marshal action items: %w", err)
	}

	query := `
		INSERT INTO mail.thread_summaries (
			thread_id, space_id, language, tldr, key_points, action_items,
			last_message_id, last_message_at, message_count, flow_run_id,
			create_time, update_time
		) VALUES (
			$1, $2, $3, $4, $5, $6,
			$7, $8, $9, $10,
			$11, $12
		)
		ON CONFLICT (thread_id, language) DO UPDATE SET
			space_id = EXCLUDED.space_id,
			tldr = EXCLUDED.tldr,
			key_points = EXCLUDED.key_points,
			action_items = EXCLUDED.action_items,
			last_message_id = EXCLUDED.last_message_id,
			last_message_at = EXCLUDED.last_message_at,
			message_count = EXCLUDED.message_count,
			flow_run_id = EXCLUDED.flow_run_id,
			update_time = EXCLUDED.update_time
		WHERE mail.thread_summaries.space_id = EXCLUDED.space_id
	`

	_, err = s.db.Exec(
		ctx,
		query,
		summary.ThreadID,
		summary.SpaceID,
		summary.Language,
		summary.TLDR,
		keyPointsBytes,
		actionItemsBytes,
		summary.LastMessageID,
		summary.LastMessageAt,
		summary.MessageCount,
		strToNullString(summary.FlowRunID),
		summary.CreateTime,
		summary.UpdateTime,
	)
	if err != nil {
		return errors.E(op, err)
	}

	return nil
}
