package storage

import (
	"context"
	"database/sql"
	"encoding/json/v2"
	"strconv"
	"time"

	"github.com/masterkeysrd/saturn/internal/domain/mail"
	"github.com/masterkeysrd/saturn/internal/platform/db"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

// DraftRecord represents the row schema for mail.drafts.
type DraftRecord struct {
	ID                  string         `db:"id"`
	SpaceID             string         `db:"space_id"`
	ConnectedAccountID  string         `db:"connected_account_id"`
	ProviderDraftID     sql.NullString `db:"provider_draft_id"`
	ProviderMessageID   sql.NullString `db:"provider_message_id"`
	ThreadID            sql.NullString `db:"thread_id"`
	ReplyToMessageID    sql.NullString `db:"reply_to_message_id"`
	Mode                string         `db:"mode"`
	FromAddress         string         `db:"from_address"`
	ToJSON              []byte         `db:"to_json"`
	CcJSON              []byte         `db:"cc_json"`
	BccJSON             []byte         `db:"bcc_json"`
	Subject             string         `db:"subject"`
	BodyHTML            string         `db:"body_html"`
	BodyText            string         `db:"body_text"`
	AttachmentsMetaJSON []byte         `db:"attachments_meta_json"`
	Version             int64          `db:"version"`
	CreateTime          time.Time      `db:"create_time"`
	UpdateTime          time.Time      `db:"update_time"`
}

func (r *DraftRecord) toModel() *mail.Draft {
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

	var attachments []mail.AttachmentMeta
	if len(r.AttachmentsMetaJSON) > 0 {
		_ = json.Unmarshal(r.AttachmentsMetaJSON, &attachments)
	}
	if attachments == nil {
		attachments = []mail.AttachmentMeta{}
	}

	return &mail.Draft{
		ID:                 r.ID,
		SpaceID:            r.SpaceID,
		ConnectedAccountID: r.ConnectedAccountID,
		ProviderDraftID:    nullStringToStrPtr(r.ProviderDraftID),
		ProviderMessageID:  nullStringToStrPtr(r.ProviderMessageID),
		ThreadID:           nullStringToStrPtr(r.ThreadID),
		ReplyToMessageID:   nullStringToStrPtr(r.ReplyToMessageID),
		Mode:               mail.DraftMode(r.Mode),
		From:               r.FromAddress,
		To:                 to,
		Cc:                 cc,
		Bcc:                bcc,
		Subject:            r.Subject,
		BodyHTML:           r.BodyHTML,
		BodyText:           r.BodyText,
		Attachments:        attachments,
		Version:            r.Version,
		CreateTime:         r.CreateTime,
		UpdateTime:         r.UpdateTime,
	}
}

// DraftStore implements mail.DraftStore backed by PostgreSQL.
type DraftStore struct {
	db db.DB
}

// NewDraftStore constructs a new DraftStore.
func NewDraftStore(database db.DB) *DraftStore {
	return &DraftStore{db: database}
}

// Create persists a new Draft entity.
func (s *DraftStore) Create(ctx context.Context, d *mail.Draft) error {
	const op errors.Op = "mail/storage.DraftStore.Create"

	toJSON, _ := json.Marshal(d.To)
	ccJSON, _ := json.Marshal(d.Cc)
	bccJSON, _ := json.Marshal(d.Bcc)
	attachmentsJSON, _ := json.Marshal(d.Attachments)

	query := `
		INSERT INTO mail.drafts (
			id, space_id, connected_account_id, provider_draft_id,
			provider_message_id, thread_id, reply_to_message_id, mode,
			from_address, to_json, cc_json, bcc_json,
			subject, body_html, body_text, attachments_meta_json,
			version, create_time, update_time
		) VALUES (
			$1, $2, $3, $4,
			$5, $6, $7, $8,
			$9, $10, $11, $12,
			$13, $14, $15, $16,
			$17, $18, $19
		)
	`

	_, err := s.db.Exec(
		ctx,
		query,
		d.ID,
		d.SpaceID,
		d.ConnectedAccountID,
		strToNullString(d.ProviderDraftID),
		strToNullString(d.ProviderMessageID),
		strToNullString(d.ThreadID),
		strToNullString(d.ReplyToMessageID),
		string(d.Mode),
		d.From,
		toJSON,
		ccJSON,
		bccJSON,
		d.Subject,
		d.BodyHTML,
		d.BodyText,
		attachmentsJSON,
		d.Version,
		d.CreateTime,
		d.UpdateTime,
	)
	if err != nil {
		return errors.E(op, err)
	}

	return nil
}

// GetByID retrieves a Draft by space ID and draft ID.
func (s *DraftStore) GetByID(ctx context.Context, spaceID, id string) (*mail.Draft, error) {
	const op errors.Op = "mail/storage.DraftStore.GetByID"

	query := `
		SELECT
			id, space_id, connected_account_id, provider_draft_id,
			provider_message_id, thread_id, reply_to_message_id, mode,
			from_address, to_json, cc_json, bcc_json,
			subject, body_html, body_text, attachments_meta_json,
			version, create_time, update_time
		FROM mail.drafts
		WHERE space_id = $1 AND id = $2
	`

	var record DraftRecord
	err := s.db.Get(ctx, &record, query, spaceID, id)
	if err != nil {
		if errors.Is(err, errors.NotExist) {
			return nil, nil
		}
		return nil, errors.E(op, err)
	}

	return record.toModel(), nil
}

// GetByProviderID retrieves a draft by its upstream provider draft ID.
func (s *DraftStore) GetByProviderID(ctx context.Context, spaceID, connectedAccountID, providerDraftID string) (*mail.Draft, error) {
	const op errors.Op = "mail/storage.DraftStore.GetByProviderID"

	query := `
		SELECT
			id, space_id, connected_account_id, provider_draft_id,
			provider_message_id, thread_id, reply_to_message_id, mode,
			from_address, to_json, cc_json, bcc_json,
			subject, body_html, body_text, attachments_meta_json,
			version, create_time, update_time
		FROM mail.drafts
		WHERE space_id = $1 AND connected_account_id = $2 AND provider_draft_id = $3
	`

	var record DraftRecord
	err := s.db.Get(ctx, &record, query, spaceID, connectedAccountID, providerDraftID)
	if err != nil {
		if errors.Is(err, errors.NotExist) {
			return nil, nil
		}
		return nil, errors.E(op, err)
	}

	return record.toModel(), nil
}

// Update updates mutable attributes of an existing Draft.
func (s *DraftStore) Update(ctx context.Context, d *mail.Draft) error {
	const op errors.Op = "mail/storage.DraftStore.Update"

	toJSON, _ := json.Marshal(d.To)
	ccJSON, _ := json.Marshal(d.Cc)
	bccJSON, _ := json.Marshal(d.Bcc)
	attachmentsJSON, _ := json.Marshal(d.Attachments)

	query := `
		UPDATE mail.drafts
		SET
			thread_id = $3,
			reply_to_message_id = $4,
			mode = $5,
			from_address = $6,
			to_json = $7,
			cc_json = $8,
			bcc_json = $9,
			subject = $10,
			body_html = $11,
			body_text = $12,
			attachments_meta_json = $13,
			version = $14,
			update_time = $15
		WHERE space_id = $1 AND id = $2
	`

	err := s.db.ExecOne(
		ctx,
		query,
		d.SpaceID,
		d.ID,
		strToNullString(d.ThreadID),
		strToNullString(d.ReplyToMessageID),
		string(d.Mode),
		d.From,
		toJSON,
		ccJSON,
		bccJSON,
		d.Subject,
		d.BodyHTML,
		d.BodyText,
		attachmentsJSON,
		d.Version,
		d.UpdateTime,
	)
	if err != nil {
		return errors.E(op, err)
	}

	return nil
}

// Delete removes a Draft.
func (s *DraftStore) Delete(ctx context.Context, spaceID, id string) error {
	const op errors.Op = "mail/storage.DraftStore.Delete"

	query := `DELETE FROM mail.drafts WHERE space_id = $1 AND id = $2`
	err := s.db.ExecOne(ctx, query, spaceID, id)
	if err != nil {
		return errors.E(op, err)
	}

	return nil
}

// ListBySpace retrieves drafts matching optional filter criteria.
func (s *DraftStore) ListBySpace(ctx context.Context, spaceID string, filter *mail.ListDraftsFilter) ([]*mail.Draft, error) {
	const op errors.Op = "mail/storage.DraftStore.ListBySpace"

	query := `
		SELECT
			id, space_id, connected_account_id, provider_draft_id,
			provider_message_id, thread_id, reply_to_message_id, mode,
			from_address, to_json, cc_json, bcc_json,
			subject, body_html, body_text, attachments_meta_json,
			version, create_time, update_time
		FROM mail.drafts
		WHERE space_id = $1
	`
	args := []any{spaceID}
	argIdx := 2

	if filter != nil {
		if filter.ConnectedAccountID != nil && *filter.ConnectedAccountID != "" {
			query += " AND connected_account_id = $" + strconv.Itoa(argIdx)
			args = append(args, *filter.ConnectedAccountID)
			argIdx++
		}
		if filter.ThreadID != nil && *filter.ThreadID != "" {
			query += " AND thread_id = $" + strconv.Itoa(argIdx)
			args = append(args, *filter.ThreadID)
			argIdx++
		}
	}

	query += " ORDER BY update_time DESC"

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

	var records []DraftRecord
	if err := s.db.Select(ctx, &records, query, args...); err != nil {
		return nil, errors.E(op, err)
	}

	result := make([]*mail.Draft, len(records))
	for i := range records {
		result[i] = records[i].toModel()
	}
	return result, nil
}

// DeleteByConnectedAccount removes all drafts associated with a connected account.
func (s *DraftStore) DeleteByConnectedAccount(ctx context.Context, spaceID, connectedAccountID string) error {
	const op errors.Op = "mail/storage.DraftStore.DeleteByConnectedAccount"

	query := `DELETE FROM mail.drafts WHERE space_id = $1 AND connected_account_id = $2`
	_, err := s.db.Exec(ctx, query, spaceID, connectedAccountID)
	if err != nil {
		return errors.E(op, err)
	}

	return nil
}
