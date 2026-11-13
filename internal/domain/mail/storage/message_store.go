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

// MessageRecord represents the row schema for mail.messages.
type MessageRecord struct {
	ID                  string         `db:"id"`
	SpaceID             string         `db:"space_id"`
	ConnectedAccountID  string         `db:"connected_account_id"`
	ThreadID            string         `db:"thread_id"`
	ProviderMessageID   sql.NullString `db:"provider_message_id"`
	RFCMessageID        sql.NullString `db:"rfc_message_id"`
	InReplyTo           sql.NullString `db:"in_reply_to"`
	ReferencesHDR       sql.NullString `db:"references_hdr"`
	Subject             string         `db:"subject"`
	Snippet             string         `db:"snippet"`
	FromJSON            []byte         `db:"from_json"`
	ToJSON              []byte         `db:"to_json"`
	CcJSON              []byte         `db:"cc_json"`
	BccJSON             []byte         `db:"bcc_json"`
	ReplyToJSON         []byte         `db:"reply_to_json"`
	SentAt              sql.NullTime   `db:"sent_at"`
	ReceivedAt          time.Time      `db:"received_at"`
	IsUnread            bool           `db:"is_unread"`
	IsStarred           bool           `db:"is_starred"`
	IsDraft             bool           `db:"is_draft"`
	AttachmentsMetaJSON []byte         `db:"attachments_meta_json"`
	HasRemoteImages     bool           `db:"has_remote_images"`
	BodyCached          bool           `db:"body_cached"`
	CreateTime          time.Time      `db:"create_time"`
	UpdateTime          time.Time      `db:"update_time"`
}

func (r *MessageRecord) toModel() *mail.Message {
	var from mail.Participant
	if len(r.FromJSON) > 0 {
		_ = json.Unmarshal(r.FromJSON, &from)
	}

	var to []mail.Participant
	if len(r.ToJSON) > 0 {
		_ = json.Unmarshal(r.ToJSON, &to)
	}
	if to == nil {
		to = []mail.Participant{}
	}

	var cc []mail.Participant
	if len(r.CcJSON) > 0 {
		_ = json.Unmarshal(r.CcJSON, &cc)
	}
	if cc == nil {
		cc = []mail.Participant{}
	}

	var bcc []mail.Participant
	if len(r.BccJSON) > 0 {
		_ = json.Unmarshal(r.BccJSON, &bcc)
	}
	if bcc == nil {
		bcc = []mail.Participant{}
	}

	var replyTo []mail.Participant
	if len(r.ReplyToJSON) > 0 {
		_ = json.Unmarshal(r.ReplyToJSON, &replyTo)
	}
	if replyTo == nil {
		replyTo = []mail.Participant{}
	}

	var attachments []mail.AttachmentMeta
	if len(r.AttachmentsMetaJSON) > 0 {
		_ = json.Unmarshal(r.AttachmentsMetaJSON, &attachments)
	}
	if attachments == nil {
		attachments = []mail.AttachmentMeta{}
	}

	return &mail.Message{
		ID:                 r.ID,
		SpaceID:            r.SpaceID,
		ConnectedAccountID: r.ConnectedAccountID,
		ThreadID:           r.ThreadID,
		ProviderMessageID:  nullStringToStrPtr(r.ProviderMessageID),
		RFCMessageID:       nullStringToStrPtr(r.RFCMessageID),
		InReplyTo:          nullStringToStrPtr(r.InReplyTo),
		References:         nullStringToStrPtr(r.ReferencesHDR),
		Subject:            r.Subject,
		Snippet:            r.Snippet,
		From:               from,
		To:                 to,
		Cc:                 cc,
		Bcc:                bcc,
		ReplyTo:            replyTo,
		SentAt:             nullTimeToTimePtr(r.SentAt),
		ReceivedAt:         r.ReceivedAt,
		IsUnread:           r.IsUnread,
		IsStarred:          r.IsStarred,
		IsDraft:            r.IsDraft,
		Attachments:        attachments,
		HasRemoteImages:    r.HasRemoteImages,
		BodyCached:         r.BodyCached,
		CreateTime:         r.CreateTime,
		UpdateTime:         r.UpdateTime,
	}
}

// MessageBodyRecord represents the row schema for mail.message_bodies.
type MessageBodyRecord struct {
	MessageID     string    `db:"message_id"`
	SpaceID       string    `db:"space_id"`
	SanitizedHTML string    `db:"sanitized_html"`
	PlainText     string    `db:"plain_text"`
	FetchedAt     time.Time `db:"fetched_at"`
	ExpiresAt     time.Time `db:"expires_at"`
}

func (r *MessageBodyRecord) toModel() *mail.MessageBody {
	return &mail.MessageBody{
		MessageID:     r.MessageID,
		SpaceID:       r.SpaceID,
		SanitizedHTML: r.SanitizedHTML,
		PlainText:     r.PlainText,
		FetchedAt:     r.FetchedAt,
		ExpiresAt:     r.ExpiresAt,
	}
}

// MessageStore implements mail.MessageStore backed by PostgreSQL.
type MessageStore struct {
	db db.DB
}

// NewMessageStore constructs a new MessageStore.
func NewMessageStore(database db.DB) *MessageStore {
	return &MessageStore{db: database}
}

// Create persists a new Message entity.
func (s *MessageStore) Create(ctx context.Context, m *mail.Message) error {
	const op errors.Op = "mail/storage.MessageStore.Create"

	fromJSON, _ := json.Marshal(m.From)
	toJSON, _ := json.Marshal(m.To)
	ccJSON, _ := json.Marshal(m.Cc)
	bccJSON, _ := json.Marshal(m.Bcc)
	replyToJSON, _ := json.Marshal(m.ReplyTo)
	attachmentsJSON, _ := json.Marshal(m.Attachments)

	query := `
		INSERT INTO mail.messages (
			id, space_id, connected_account_id, thread_id,
			provider_message_id, rfc_message_id, in_reply_to, references_hdr,
			subject, snippet, from_json, to_json,
			cc_json, bcc_json, reply_to_json, sent_at,
			received_at, is_unread, is_starred, is_draft,
			attachments_meta_json, has_remote_images, body_cached,
			create_time, update_time
		) VALUES (
			$1, $2, $3, $4,
			$5, $6, $7, $8,
			$9, $10, $11, $12,
			$13, $14, $15, $16,
			$17, $18, $19, $20,
			$21, $22, $23,
			$24, $25
		)
	`

	_, err := s.db.Exec(
		ctx,
		query,
		m.ID,
		m.SpaceID,
		m.ConnectedAccountID,
		m.ThreadID,
		strToNullString(m.ProviderMessageID),
		strToNullString(m.RFCMessageID),
		strToNullString(m.InReplyTo),
		strToNullString(m.References),
		m.Subject,
		m.Snippet,
		fromJSON,
		toJSON,
		ccJSON,
		bccJSON,
		replyToJSON,
		timeToNullTime(m.SentAt),
		m.ReceivedAt,
		m.IsUnread,
		m.IsStarred,
		m.IsDraft,
		attachmentsJSON,
		m.HasRemoteImages,
		m.BodyCached,
		m.CreateTime,
		m.UpdateTime,
	)
	if err != nil {
		return errors.E(op, err)
	}

	return nil
}

// GetByID retrieves a Message by space ID and message ID.
func (s *MessageStore) GetByID(ctx context.Context, spaceID, id string) (*mail.Message, error) {
	const op errors.Op = "mail/storage.MessageStore.GetByID"

	query := `
		SELECT
			id, space_id, connected_account_id, thread_id,
			provider_message_id, rfc_message_id, in_reply_to, references_hdr,
			subject, snippet, from_json, to_json,
			cc_json, bcc_json, reply_to_json, sent_at,
			received_at, is_unread, is_starred, is_draft,
			attachments_meta_json, has_remote_images, body_cached,
			create_time, update_time
		FROM mail.messages
		WHERE space_id = $1 AND id = $2
	`

	var record MessageRecord
	err := s.db.Get(ctx, &record, query, spaceID, id)
	if err != nil {
		if errors.Is(err, errors.NotExist) {
			return nil, nil
		}
		return nil, errors.E(op, err)
	}

	return record.toModel(), nil
}

// GetByProviderID retrieves a message by its upstream provider message ID.
func (s *MessageStore) GetByProviderID(ctx context.Context, spaceID, connectedAccountID, providerMessageID string) (*mail.Message, error) {
	const op errors.Op = "mail/storage.MessageStore.GetByProviderID"

	query := `
		SELECT
			id, space_id, connected_account_id, thread_id,
			provider_message_id, rfc_message_id, in_reply_to, references_hdr,
			subject, snippet, from_json, to_json,
			cc_json, bcc_json, reply_to_json, sent_at,
			received_at, is_unread, is_starred, is_draft,
			attachments_meta_json, has_remote_images, body_cached,
			create_time, update_time
		FROM mail.messages
		WHERE space_id = $1 AND connected_account_id = $2 AND provider_message_id = $3
	`

	var record MessageRecord
	err := s.db.Get(ctx, &record, query, spaceID, connectedAccountID, providerMessageID)
	if err != nil {
		if errors.Is(err, errors.NotExist) {
			return nil, nil
		}
		return nil, errors.E(op, err)
	}

	return record.toModel(), nil
}

// ListByThreadID retrieves all messages belonging to a thread, ordered chronologically.
func (s *MessageStore) ListByThreadID(ctx context.Context, spaceID, threadID string) ([]*mail.Message, error) {
	const op errors.Op = "mail/storage.MessageStore.ListByThreadID"

	query := `
		SELECT
			id, space_id, connected_account_id, thread_id,
			provider_message_id, rfc_message_id, in_reply_to, references_hdr,
			subject, snippet, from_json, to_json,
			cc_json, bcc_json, reply_to_json, sent_at,
			received_at, is_unread, is_starred, is_draft,
			attachments_meta_json, has_remote_images, body_cached,
			create_time, update_time
		FROM mail.messages
		WHERE space_id = $1 AND thread_id = $2
		ORDER BY received_at ASC
	`

	var records []MessageRecord
	if err := s.db.Select(ctx, &records, query, spaceID, threadID); err != nil {
		return nil, errors.E(op, err)
	}

	result := make([]*mail.Message, len(records))
	for i := range records {
		result[i] = records[i].toModel()
	}
	return result, nil
}

// Update updates mutable attributes of an existing Message.
func (s *MessageStore) Update(ctx context.Context, m *mail.Message) error {
	const op errors.Op = "mail/storage.MessageStore.Update"

	fromJSON, _ := json.Marshal(m.From)
	toJSON, _ := json.Marshal(m.To)
	ccJSON, _ := json.Marshal(m.Cc)
	bccJSON, _ := json.Marshal(m.Bcc)
	replyToJSON, _ := json.Marshal(m.ReplyTo)
	attachmentsJSON, _ := json.Marshal(m.Attachments)

	query := `
		UPDATE mail.messages
		SET
			subject = $3,
			snippet = $4,
			from_json = $5,
			to_json = $6,
			cc_json = $7,
			bcc_json = $8,
			reply_to_json = $9,
			is_unread = $10,
			is_starred = $11,
			is_draft = $12,
			attachments_meta_json = $13,
			has_remote_images = $14,
			body_cached = $15,
			update_time = $16
		WHERE space_id = $1 AND id = $2
	`

	err := s.db.ExecOne(
		ctx,
		query,
		m.SpaceID,
		m.ID,
		m.Subject,
		m.Snippet,
		fromJSON,
		toJSON,
		ccJSON,
		bccJSON,
		replyToJSON,
		m.IsUnread,
		m.IsStarred,
		m.IsDraft,
		attachmentsJSON,
		m.HasRemoteImages,
		m.BodyCached,
		m.UpdateTime,
	)
	if err != nil {
		return errors.E(op, err)
	}

	return nil
}

// Delete removes a Message.
func (s *MessageStore) Delete(ctx context.Context, spaceID, id string) error {
	const op errors.Op = "mail/storage.MessageStore.Delete"

	query := `DELETE FROM mail.messages WHERE space_id = $1 AND id = $2`
	err := s.db.ExecOne(ctx, query, spaceID, id)
	if err != nil {
		return errors.E(op, err)
	}

	return nil
}

// Upsert inserts or updates a Message entity.
func (s *MessageStore) Upsert(ctx context.Context, m *mail.Message) error {
	const op errors.Op = "mail/storage.MessageStore.Upsert"

	fromJSON, _ := json.Marshal(m.From)
	toJSON, _ := json.Marshal(m.To)
	ccJSON, _ := json.Marshal(m.Cc)
	bccJSON, _ := json.Marshal(m.Bcc)
	replyToJSON, _ := json.Marshal(m.ReplyTo)
	attachmentsJSON, _ := json.Marshal(m.Attachments)

	query := `
		INSERT INTO mail.messages (
			id, space_id, connected_account_id, thread_id,
			provider_message_id, rfc_message_id, in_reply_to, references_hdr,
			subject, snippet, from_json, to_json,
			cc_json, bcc_json, reply_to_json, sent_at,
			received_at, is_unread, is_starred, is_draft,
			attachments_meta_json, has_remote_images, body_cached,
			create_time, update_time
		) VALUES (
			$1, $2, $3, $4,
			$5, $6, $7, $8,
			$9, $10, $11, $12,
			$13, $14, $15, $16,
			$17, $18, $19, $20,
			$21, $22, $23,
			$24, $25
		)
		ON CONFLICT (id) DO UPDATE SET
			subject = EXCLUDED.subject,
			snippet = EXCLUDED.snippet,
			from_json = EXCLUDED.from_json,
			to_json = EXCLUDED.to_json,
			cc_json = EXCLUDED.cc_json,
			bcc_json = EXCLUDED.bcc_json,
			reply_to_json = EXCLUDED.reply_to_json,
			is_unread = EXCLUDED.is_unread,
			is_starred = EXCLUDED.is_starred,
			is_draft = EXCLUDED.is_draft,
			attachments_meta_json = EXCLUDED.attachments_meta_json,
			has_remote_images = EXCLUDED.has_remote_images,
			body_cached = EXCLUDED.body_cached,
			update_time = EXCLUDED.update_time
	`

	_, err := s.db.Exec(
		ctx,
		query,
		m.ID,
		m.SpaceID,
		m.ConnectedAccountID,
		m.ThreadID,
		strToNullString(m.ProviderMessageID),
		strToNullString(m.RFCMessageID),
		strToNullString(m.InReplyTo),
		strToNullString(m.References),
		m.Subject,
		m.Snippet,
		fromJSON,
		toJSON,
		ccJSON,
		bccJSON,
		replyToJSON,
		timeToNullTime(m.SentAt),
		m.ReceivedAt,
		m.IsUnread,
		m.IsStarred,
		m.IsDraft,
		attachmentsJSON,
		m.HasRemoteImages,
		m.BodyCached,
		m.CreateTime,
		m.UpdateTime,
	)
	if err != nil {
		return errors.E(op, err)
	}

	return nil
}

// SaveBody persists or updates a cached message body.
func (s *MessageStore) SaveBody(ctx context.Context, body *mail.MessageBody) error {
	const op errors.Op = "mail/storage.MessageStore.SaveBody"

	query := `
		INSERT INTO mail.message_bodies (
			message_id, space_id, sanitized_html, plain_text,
			fetched_at, expires_at
		) VALUES (
			$1, $2, $3, $4,
			$5, $6
		)
		ON CONFLICT (message_id) DO UPDATE SET
			sanitized_html = EXCLUDED.sanitized_html,
			plain_text = EXCLUDED.plain_text,
			fetched_at = EXCLUDED.fetched_at,
			expires_at = EXCLUDED.expires_at
	`

	_, err := s.db.Exec(
		ctx,
		query,
		body.MessageID,
		body.SpaceID,
		body.SanitizedHTML,
		body.PlainText,
		body.FetchedAt,
		body.ExpiresAt,
	)
	if err != nil {
		return errors.E(op, err)
	}

	// Update body_cached flag and has_remote_images on message
	_, _ = s.db.Exec(ctx, `UPDATE mail.messages SET body_cached = true, has_remote_images = $3 WHERE space_id = $1 AND id = $2`, body.SpaceID, body.MessageID, body.HasRemoteImages)

	return nil
}

// GetBody retrieves the cached body for a message.
func (s *MessageStore) GetBody(ctx context.Context, spaceID, messageID string) (*mail.MessageBody, error) {
	const op errors.Op = "mail/storage.MessageStore.GetBody"

	query := `
		SELECT
			message_id, space_id, sanitized_html, plain_text,
			fetched_at, expires_at
		FROM mail.message_bodies
		WHERE space_id = $1 AND message_id = $2
	`

	var record MessageBodyRecord
	err := s.db.Get(ctx, &record, query, spaceID, messageID)
	if err != nil {
		if errors.Is(err, errors.NotExist) {
			return nil, nil
		}
		return nil, errors.E(op, err)
	}

	return record.toModel(), nil
}

// DeleteExpiredBodies evicts message bodies that have passed their expiration date.
func (s *MessageStore) DeleteExpiredBodies(ctx context.Context, now time.Time) (int64, error) {
	const op errors.Op = "mail/storage.MessageStore.DeleteExpiredBodies"

	query := `DELETE FROM mail.message_bodies WHERE expires_at < $1`
	res, err := s.db.Exec(ctx, query, now)
	if err != nil {
		return 0, errors.E(op, err)
	}

	return res.RowsAffected()
}

// DeleteByConnectedAccount removes all messages associated with a connected account.
func (s *MessageStore) DeleteByConnectedAccount(ctx context.Context, spaceID, connectedAccountID string) error {
	const op errors.Op = "mail/storage.MessageStore.DeleteByConnectedAccount"

	query := `DELETE FROM mail.messages WHERE space_id = $1 AND connected_account_id = $2`
	_, err := s.db.Exec(ctx, query, spaceID, connectedAccountID)
	if err != nil {
		return errors.E(op, err)
	}

	return nil
}
