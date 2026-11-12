package storage

import (
	"context"
	"database/sql"
	"encoding/json/v2"
	"strconv"
	"strings"
	"time"

	"github.com/lib/pq"
	"github.com/masterkeysrd/saturn/internal/domain/mail"
	"github.com/masterkeysrd/saturn/internal/platform/db"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

// ThreadRecord represents the row schema for mail.threads.
type ThreadRecord struct {
	ID                 string         `db:"id"`
	SpaceID            string         `db:"space_id"`
	ConnectedAccountID string         `db:"connected_account_id"`
	ProviderThreadID   sql.NullString `db:"provider_thread_id"`
	Subject            string         `db:"subject"`
	Snippet            string         `db:"snippet"`
	ParticipantsJSON   []byte         `db:"participants_json"`
	MessageCount       int            `db:"message_count"`
	HasAttachments     bool           `db:"has_attachments"`
	IsUnread           bool           `db:"is_unread"`
	IsStarred          bool           `db:"is_starred"`
	InInbox            bool           `db:"in_inbox"`
	InSent             bool           `db:"in_sent"`
	InDrafts           bool           `db:"in_drafts"`
	InTrash            bool           `db:"in_trash"`
	InSpam             bool           `db:"in_spam"`
	MailboxIDs         pq.StringArray `db:"mailbox_ids"`
	LastMessageAt      time.Time      `db:"last_message_at"`
	CreateTime         time.Time      `db:"create_time"`
	UpdateTime         time.Time      `db:"update_time"`
}

func (r *ThreadRecord) toModel() *mail.Thread {
	var participants []mail.Participant
	if len(r.ParticipantsJSON) > 0 {
		_ = json.Unmarshal(r.ParticipantsJSON, &participants)
	}
	if participants == nil {
		participants = []mail.Participant{}
	}

	mailboxIDs := []string(r.MailboxIDs)
	if mailboxIDs == nil {
		mailboxIDs = []string{}
	}

	return &mail.Thread{
		ID:                 r.ID,
		SpaceID:            r.SpaceID,
		ConnectedAccountID: r.ConnectedAccountID,
		ProviderThreadID:   nullStringToStrPtr(r.ProviderThreadID),
		Subject:            r.Subject,
		Snippet:            r.Snippet,
		Participants:       participants,
		MessageCount:       r.MessageCount,
		HasAttachments:     r.HasAttachments,
		IsUnread:           r.IsUnread,
		IsStarred:          r.IsStarred,
		InInbox:            r.InInbox,
		InSent:             r.InSent,
		InDrafts:           r.InDrafts,
		InTrash:            r.InTrash,
		InSpam:             r.InSpam,
		MailboxIDs:         mailboxIDs,
		LastMessageAt:      r.LastMessageAt,
		CreateTime:         r.CreateTime,
		UpdateTime:         r.UpdateTime,
	}
}

// ThreadStore implements mail.ThreadStore backed by PostgreSQL.
type ThreadStore struct {
	db db.DB
}

// NewThreadStore constructs a new ThreadStore.
func NewThreadStore(database db.DB) *ThreadStore {
	return &ThreadStore{db: database}
}

// Create persists a new Thread entity.
func (s *ThreadStore) Create(ctx context.Context, t *mail.Thread) error {
	const op errors.Op = "mail/storage.ThreadStore.Create"

	participantsBytes, err := json.Marshal(t.Participants)
	if err != nil {
		return errors.E(op, errors.Internal, "marshal participants: %w", err)
	}

	participantsSearchText := participantsToSearchText(t.Participants)

	query := `
		INSERT INTO mail.threads (
			id, space_id, connected_account_id, provider_thread_id,
			subject, snippet, participants_json, message_count,
			has_attachments, is_unread, is_starred, in_inbox,
			in_sent, in_drafts, in_trash, in_spam,
			mailbox_ids, last_message_at, search_tsv, create_time, update_time
		) VALUES (
			$1, $2, $3, $4,
			$5, $6, $7, $8,
			$9, $10, $11, $12,
			$13, $14, $15, $16,
			$17, $18,
			setweight(to_tsvector('english', coalesce($5, '')), 'A') ||
			setweight(to_tsvector('english', coalesce($6, '')), 'B') ||
			setweight(to_tsvector('english', coalesce($21, '')), 'C'),
			$19, $20
		)
	`

	mailboxIDs := t.MailboxIDs
	if mailboxIDs == nil {
		mailboxIDs = []string{}
	}

	_, err = s.db.Exec(
		ctx,
		query,
		t.ID,
		t.SpaceID,
		t.ConnectedAccountID,
		strToNullString(t.ProviderThreadID),
		t.Subject,
		t.Snippet,
		participantsBytes,
		t.MessageCount,
		t.HasAttachments,
		t.IsUnread,
		t.IsStarred,
		t.InInbox,
		t.InSent,
		t.InDrafts,
		t.InTrash,
		t.InSpam,
		pq.Array(mailboxIDs),
		t.LastMessageAt,
		t.CreateTime,
		t.UpdateTime,
		participantsSearchText,
	)
	if err != nil {
		return errors.E(op, err)
	}

	return nil
}

// GetByID retrieves a Thread by space ID and thread ID.
func (s *ThreadStore) GetByID(ctx context.Context, spaceID, id string) (*mail.Thread, error) {
	const op errors.Op = "mail/storage.ThreadStore.GetByID"

	query := `
		SELECT
			id, space_id, connected_account_id, provider_thread_id,
			subject, snippet, participants_json, message_count,
			has_attachments, is_unread, is_starred, in_inbox,
			in_sent, in_drafts, in_trash, in_spam,
			mailbox_ids, last_message_at, create_time, update_time
		FROM mail.threads
		WHERE space_id = $1 AND id = $2
	`

	var record ThreadRecord
	err := s.db.Get(ctx, &record, query, spaceID, id)
	if err != nil {
		if errors.Is(err, errors.NotExist) {
			return nil, nil
		}
		return nil, errors.E(op, err)
	}

	return record.toModel(), nil
}

// GetByProviderID retrieves a Thread by its upstream provider thread ID.
func (s *ThreadStore) GetByProviderID(ctx context.Context, spaceID, connectedAccountID, providerThreadID string) (*mail.Thread, error) {
	const op errors.Op = "mail/storage.ThreadStore.GetByProviderID"

	query := `
		SELECT
			id, space_id, connected_account_id, provider_thread_id,
			subject, snippet, participants_json, message_count,
			has_attachments, is_unread, is_starred, in_inbox,
			in_sent, in_drafts, in_trash, in_spam,
			mailbox_ids, last_message_at, create_time, update_time
		FROM mail.threads
		WHERE space_id = $1 AND connected_account_id = $2 AND provider_thread_id = $3
	`

	var record ThreadRecord
	err := s.db.Get(ctx, &record, query, spaceID, connectedAccountID, providerThreadID)
	if err != nil {
		if errors.Is(err, errors.NotExist) {
			return nil, nil
		}
		return nil, errors.E(op, err)
	}

	return record.toModel(), nil
}

// Update updates mutable attributes of an existing Thread.
func (s *ThreadStore) Update(ctx context.Context, t *mail.Thread) error {
	const op errors.Op = "mail/storage.ThreadStore.Update"

	participantsBytes, err := json.Marshal(t.Participants)
	if err != nil {
		return errors.E(op, errors.Internal, "marshal participants: %w", err)
	}

	participantsSearchText := participantsToSearchText(t.Participants)

	query := `
		UPDATE mail.threads
		SET
			subject = $3,
			snippet = $4,
			participants_json = $5,
			message_count = $6,
			has_attachments = $7,
			is_unread = $8,
			is_starred = $9,
			in_inbox = $10,
			in_sent = $11,
			in_drafts = $12,
			in_trash = $13,
			in_spam = $14,
			mailbox_ids = $15,
			last_message_at = $16,
			search_tsv = setweight(to_tsvector('english', coalesce($3, '')), 'A') ||
			             setweight(to_tsvector('english', coalesce($4, '')), 'B') ||
			             setweight(to_tsvector('english', coalesce($18, '')), 'C'),
			update_time = $17
		WHERE space_id = $1 AND id = $2
	`

	mailboxIDs := t.MailboxIDs
	if mailboxIDs == nil {
		mailboxIDs = []string{}
	}

	err = s.db.ExecOne(
		ctx,
		query,
		t.SpaceID,
		t.ID,
		t.Subject,
		t.Snippet,
		participantsBytes,
		t.MessageCount,
		t.HasAttachments,
		t.IsUnread,
		t.IsStarred,
		t.InInbox,
		t.InSent,
		t.InDrafts,
		t.InTrash,
		t.InSpam,
		pq.Array(mailboxIDs),
		t.LastMessageAt,
		t.UpdateTime,
		participantsSearchText,
	)
	if err != nil {
		return errors.E(op, err)
	}

	return nil
}

// Delete removes a Thread and cascades to its messages and message bodies.
func (s *ThreadStore) Delete(ctx context.Context, spaceID, id string) error {
	const op errors.Op = "mail/storage.ThreadStore.Delete"

	query := `DELETE FROM mail.threads WHERE space_id = $1 AND id = $2`
	err := s.db.ExecOne(ctx, query, spaceID, id)
	if err != nil {
		return errors.E(op, err)
	}

	return nil
}

// ListBySpace retrieves threads matching space and filter criteria.
func (s *ThreadStore) ListBySpace(ctx context.Context, spaceID string, filter *mail.ListThreadsFilter) ([]*mail.Thread, error) {
	const op errors.Op = "mail/storage.ThreadStore.ListBySpace"

	baseQuery := `
		SELECT
			id, space_id, connected_account_id, provider_thread_id,
			subject, snippet, participants_json, message_count,
			has_attachments, is_unread, is_starred, in_inbox,
			in_sent, in_drafts, in_trash, in_spam,
			mailbox_ids, last_message_at, create_time, update_time
		FROM mail.threads
		WHERE space_id = $1
	`

	whereClause, args, argIdx, searchQueryParam := buildThreadFilter(filter, 2)
	query := baseQuery + whereClause

	if searchQueryParam != "" {
		query += " ORDER BY ts_rank_cd(search_tsv, plainto_tsquery('english', " + searchQueryParam + ")) DESC, last_message_at DESC"
	} else {
		query += " ORDER BY last_message_at DESC"
	}

	if filter != nil {
		if filter.Limit > 0 {
			query += " LIMIT $" + strconv.Itoa(argIdx)
			args = append(args, filter.Limit)
			argIdx++
		}
		if filter.Offset > 0 {
			query += " OFFSET $" + strconv.Itoa(argIdx)
			args = append(args, filter.Offset)
		}
	}

	fullArgs := append([]any{spaceID}, args...)
	var records []ThreadRecord
	if err := s.db.Select(ctx, &records, query, fullArgs...); err != nil {
		return nil, errors.E(op, err)
	}

	result := make([]*mail.Thread, len(records))
	for i := range records {
		result[i] = records[i].toModel()
	}
	return result, nil
}

// CountBySpace returns the total count of threads matching filter criteria.
func (s *ThreadStore) CountBySpace(ctx context.Context, spaceID string, filter *mail.ListThreadsFilter) (int, error) {
	const op errors.Op = "mail/storage.ThreadStore.CountBySpace"

	baseQuery := `SELECT count(*) FROM mail.threads WHERE space_id = $1`
	whereClause, args, _, _ := buildThreadFilter(filter, 2)
	query := baseQuery + whereClause

	fullArgs := append([]any{spaceID}, args...)
	var count int
	if err := s.db.Get(ctx, &count, query, fullArgs...); err != nil {
		return 0, errors.E(op, err)
	}
	return count, nil
}

func buildThreadFilter(filter *mail.ListThreadsFilter, startIdx int) (string, []any, int, string) {
	var where []string
	var args []any
	argIdx := startIdx
	var searchParam string

	if filter != nil {
		if filter.ConnectedAccountID != nil && *filter.ConnectedAccountID != "" {
			where = append(where, "connected_account_id = $"+strconv.Itoa(argIdx))
			args = append(args, *filter.ConnectedAccountID)
			argIdx++
		}

		if filter.MailboxID != nil && *filter.MailboxID != "" {
			where = append(where, "$"+strconv.Itoa(argIdx)+" = ANY(mailbox_ids)")
			args = append(args, *filter.MailboxID)
			argIdx++
		}

		if filter.SystemBucket != nil && *filter.SystemBucket != "" {
			switch *filter.SystemBucket {
			case mail.SystemBucketInbox:
				where = append(where, "in_inbox = true")
			case mail.SystemBucketStarred:
				where = append(where, "is_starred = true")
			case mail.SystemBucketSent:
				where = append(where, "in_sent = true")
			case mail.SystemBucketDrafts:
				where = append(where, "in_drafts = true")
			case mail.SystemBucketTrash:
				where = append(where, "in_trash = true")
			case mail.SystemBucketSpam:
				where = append(where, "in_spam = true")
			case mail.SystemBucketArchive:
				where = append(where, "in_inbox = false AND in_trash = false AND in_spam = false")
			}
		}

		if filter.IsUnread != nil {
			where = append(where, "is_unread = $"+strconv.Itoa(argIdx))
			args = append(args, *filter.IsUnread)
			argIdx++
		}

		if filter.IsStarred != nil {
			where = append(where, "is_starred = $"+strconv.Itoa(argIdx))
			args = append(args, *filter.IsStarred)
			argIdx++
		}

		if strings.TrimSpace(filter.Query) != "" {
			param := "$" + strconv.Itoa(argIdx)
			searchParam = param
			where = append(where, "search_tsv @@ plainto_tsquery('english', "+param+")")
			args = append(args, filter.Query)
			argIdx++
		}
	}

	whereClause := ""
	if len(where) > 0 {
		whereClause = " AND " + strings.Join(where, " AND ")
	}

	return whereClause, args, argIdx, searchParam
}

// Upsert inserts or updates a Thread entity.
func (s *ThreadStore) Upsert(ctx context.Context, t *mail.Thread) error {
	const op errors.Op = "mail/storage.ThreadStore.Upsert"

	participantsBytes, err := json.Marshal(t.Participants)
	if err != nil {
		return errors.E(op, errors.Internal, "marshal participants: %w", err)
	}

	participantsSearchText := participantsToSearchText(t.Participants)

	query := `
		INSERT INTO mail.threads (
			id, space_id, connected_account_id, provider_thread_id,
			subject, snippet, participants_json, message_count,
			has_attachments, is_unread, is_starred, in_inbox,
			in_sent, in_drafts, in_trash, in_spam,
			mailbox_ids, last_message_at, search_tsv, create_time, update_time
		) VALUES (
			$1, $2, $3, $4,
			$5, $6, $7, $8,
			$9, $10, $11, $12,
			$13, $14, $15, $16,
			$17, $18,
			setweight(to_tsvector('english', coalesce($5, '')), 'A') ||
			setweight(to_tsvector('english', coalesce($6, '')), 'B') ||
			setweight(to_tsvector('english', coalesce($21, '')), 'C'),
			$19, $20
		)
		ON CONFLICT (id) DO UPDATE SET
			subject = EXCLUDED.subject,
			snippet = EXCLUDED.snippet,
			participants_json = EXCLUDED.participants_json,
			message_count = EXCLUDED.message_count,
			has_attachments = EXCLUDED.has_attachments,
			is_unread = EXCLUDED.is_unread,
			is_starred = EXCLUDED.is_starred,
			in_inbox = EXCLUDED.in_inbox,
			in_sent = EXCLUDED.in_sent,
			in_drafts = EXCLUDED.in_drafts,
			in_trash = EXCLUDED.in_trash,
			in_spam = EXCLUDED.in_spam,
			mailbox_ids = EXCLUDED.mailbox_ids,
			last_message_at = EXCLUDED.last_message_at,
			search_tsv = EXCLUDED.search_tsv,
			update_time = EXCLUDED.update_time
	`

	mailboxIDs := t.MailboxIDs
	if mailboxIDs == nil {
		mailboxIDs = []string{}
	}

	_, err = s.db.Exec(
		ctx,
		query,
		t.ID,
		t.SpaceID,
		t.ConnectedAccountID,
		strToNullString(t.ProviderThreadID),
		t.Subject,
		t.Snippet,
		participantsBytes,
		t.MessageCount,
		t.HasAttachments,
		t.IsUnread,
		t.IsStarred,
		t.InInbox,
		t.InSent,
		t.InDrafts,
		t.InTrash,
		t.InSpam,
		pq.Array(mailboxIDs),
		t.LastMessageAt,
		t.CreateTime,
		t.UpdateTime,
		participantsSearchText,
	)
	if err != nil {
		return errors.E(op, err)
	}

	return nil
}

// PruneThreadsOlderThanWindow removes non-starred cached threads older than the given timestamp.
func (s *ThreadStore) PruneThreadsOlderThanWindow(ctx context.Context, olderThan time.Time) (int64, error) {
	const op errors.Op = "mail/storage.ThreadStore.PruneThreadsOlderThanWindow"

	query := `DELETE FROM mail.threads WHERE is_starred = FALSE AND last_message_at < $1`
	res, err := s.db.Exec(ctx, query, olderThan)
	if err != nil {
		return 0, errors.E(op, err)
	}
	return res.RowsAffected()
}

// DeleteByConnectedAccount removes all threads associated with a connected account.
func (s *ThreadStore) DeleteByConnectedAccount(ctx context.Context, spaceID, connectedAccountID string) error {
	const op errors.Op = "mail/storage.ThreadStore.DeleteByConnectedAccount"

	query := `DELETE FROM mail.threads WHERE space_id = $1 AND connected_account_id = $2`
	_, err := s.db.Exec(ctx, query, spaceID, connectedAccountID)
	if err != nil {
		return errors.E(op, err)
	}

	return nil
}

func participantsToSearchText(participants []mail.Participant) string {
	if len(participants) == 0 {
		return ""
	}
	var parts []string
	for _, p := range participants {
		if p.Name != "" {
			parts = append(parts, p.Name)
		}
		if p.Email != "" {
			parts = append(parts, p.Email)
		}
	}
	return strings.Join(parts, " ")
}
