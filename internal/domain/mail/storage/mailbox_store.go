package storage

import (
	"context"
	"database/sql"
	"strconv"
	"time"

	"github.com/masterkeysrd/saturn/internal/domain/mail"
	"github.com/masterkeysrd/saturn/internal/platform/db"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

// MailboxRecord represents the row schema for mail.mailboxes.
type MailboxRecord struct {
	ID                 string         `db:"id"`
	SpaceID            string         `db:"space_id"`
	ConnectedAccountID string         `db:"connected_account_id"`
	ProviderMailboxID  sql.NullString `db:"provider_mailbox_id"`
	Name               string         `db:"name"`
	SystemRole         string         `db:"system_role"`
	Color              sql.NullString `db:"color"`
	UnreadCount        int            `db:"unread_count"`
	TotalCount         int            `db:"total_count"`
	CreateTime         time.Time      `db:"create_time"`
	UpdateTime         time.Time      `db:"update_time"`
}

func (r *MailboxRecord) toModel() *mail.Mailbox {
	return &mail.Mailbox{
		ID:                 r.ID,
		SpaceID:            r.SpaceID,
		ConnectedAccountID: r.ConnectedAccountID,
		ProviderMailboxID:  nullStringToStrPtr(r.ProviderMailboxID),
		Name:               r.Name,
		SystemRole:         mail.SystemBucket(r.SystemRole),
		Color:              nullStringToStrPtr(r.Color),
		UnreadCount:        r.UnreadCount,
		TotalCount:         r.TotalCount,
		CreateTime:         r.CreateTime,
		UpdateTime:         r.UpdateTime,
	}
}

// MailboxStore implements mail.MailboxStore backed by PostgreSQL.
type MailboxStore struct {
	db db.DB
}

// NewMailboxStore constructs a new MailboxStore.
func NewMailboxStore(database db.DB) *MailboxStore {
	return &MailboxStore{db: database}
}

// Create persists a new Mailbox entity.
func (s *MailboxStore) Create(ctx context.Context, m *mail.Mailbox) error {
	const op errors.Op = "mail/storage.MailboxStore.Create"

	query := `
		INSERT INTO mail.mailboxes (
			id, space_id, connected_account_id, provider_mailbox_id,
			name, system_role, color, unread_count, total_count,
			create_time, update_time
		) VALUES (
			$1, $2, $3, $4,
			$5, $6, $7, $8, $9,
			$10, $11
		)
	`

	_, err := s.db.Exec(
		ctx,
		query,
		m.ID,
		m.SpaceID,
		m.ConnectedAccountID,
		strToNullString(m.ProviderMailboxID),
		m.Name,
		string(m.SystemRole),
		strToNullString(m.Color),
		m.UnreadCount,
		m.TotalCount,
		m.CreateTime,
		m.UpdateTime,
	)
	if err != nil {
		return errors.E(op, err)
	}

	return nil
}

// GetByID retrieves a Mailbox by space ID and mailbox ID.
func (s *MailboxStore) GetByID(ctx context.Context, spaceID, id string) (*mail.Mailbox, error) {
	const op errors.Op = "mail/storage.MailboxStore.GetByID"

	query := `
		SELECT
			id, space_id, connected_account_id, provider_mailbox_id,
			name, system_role, color, unread_count, total_count,
			create_time, update_time
		FROM mail.mailboxes
		WHERE space_id = $1 AND id = $2
	`

	var record MailboxRecord
	err := s.db.Get(ctx, &record, query, spaceID, id)
	if err != nil {
		if errors.Is(err, errors.NotExist) {
			return nil, nil
		}
		return nil, errors.E(op, err)
	}

	return record.toModel(), nil
}

// GetByProviderID retrieves a mailbox by its upstream provider ID.
func (s *MailboxStore) GetByProviderID(ctx context.Context, spaceID, connectedAccountID, providerMailboxID string) (*mail.Mailbox, error) {
	const op errors.Op = "mail/storage.MailboxStore.GetByProviderID"

	query := `
		SELECT
			id, space_id, connected_account_id, provider_mailbox_id,
			name, system_role, color, unread_count, total_count,
			create_time, update_time
		FROM mail.mailboxes
		WHERE space_id = $1 AND connected_account_id = $2 AND provider_mailbox_id = $3
	`

	var record MailboxRecord
	err := s.db.Get(ctx, &record, query, spaceID, connectedAccountID, providerMailboxID)
	if err != nil {
		if errors.Is(err, errors.NotExist) {
			return nil, nil
		}
		return nil, errors.E(op, err)
	}

	return record.toModel(), nil
}

// GetBySystemRole retrieves a system mailbox for a connected account.
func (s *MailboxStore) GetBySystemRole(ctx context.Context, spaceID, connectedAccountID string, role mail.SystemBucket) (*mail.Mailbox, error) {
	const op errors.Op = "mail/storage.MailboxStore.GetBySystemRole"

	query := `
		SELECT
			id, space_id, connected_account_id, provider_mailbox_id,
			name, system_role, color, unread_count, total_count,
			create_time, update_time
		FROM mail.mailboxes
		WHERE space_id = $1 AND connected_account_id = $2 AND system_role = $3
		LIMIT 1
	`

	var record MailboxRecord
	err := s.db.Get(ctx, &record, query, spaceID, connectedAccountID, string(role))
	if err != nil {
		if errors.Is(err, errors.NotExist) {
			return nil, nil
		}
		return nil, errors.E(op, err)
	}

	return record.toModel(), nil
}

// Update updates mutable attributes of an existing Mailbox.
func (s *MailboxStore) Update(ctx context.Context, m *mail.Mailbox) error {
	const op errors.Op = "mail/storage.MailboxStore.Update"

	query := `
		UPDATE mail.mailboxes
		SET
			name = $3,
			system_role = $4,
			color = $5,
			unread_count = $6,
			total_count = $7,
			update_time = $8
		WHERE space_id = $1 AND id = $2
	`

	err := s.db.ExecOne(
		ctx,
		query,
		m.SpaceID,
		m.ID,
		m.Name,
		string(m.SystemRole),
		strToNullString(m.Color),
		m.UnreadCount,
		m.TotalCount,
		m.UpdateTime,
	)
	if err != nil {
		return errors.E(op, err)
	}

	return nil
}

// Delete removes a Mailbox.
func (s *MailboxStore) Delete(ctx context.Context, spaceID, id string) error {
	const op errors.Op = "mail/storage.MailboxStore.Delete"

	query := `DELETE FROM mail.mailboxes WHERE space_id = $1 AND id = $2`
	err := s.db.ExecOne(ctx, query, spaceID, id)
	if err != nil {
		return errors.E(op, err)
	}

	return nil
}

// ListBySpace retrieves mailboxes matching optional filter criteria.
func (s *MailboxStore) ListBySpace(ctx context.Context, spaceID string, filter *mail.ListMailboxesFilter) ([]*mail.Mailbox, error) {
	const op errors.Op = "mail/storage.MailboxStore.ListBySpace"

	query := `
		SELECT
			id, space_id, connected_account_id, provider_mailbox_id,
			name, system_role, color, unread_count, total_count,
			create_time, update_time
		FROM mail.mailboxes
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
		if filter.SystemRole != nil && *filter.SystemRole != "" {
			query += " AND system_role = $" + strconv.Itoa(argIdx)
			args = append(args, string(*filter.SystemRole))
		}
	}

	query += " ORDER BY name ASC"

	var records []MailboxRecord
	if err := s.db.Select(ctx, &records, query, args...); err != nil {
		return nil, errors.E(op, err)
	}

	result := make([]*mail.Mailbox, len(records))
	for i := range records {
		result[i] = records[i].toModel()
	}
	return result, nil
}

// Upsert inserts or updates a Mailbox entity.
func (s *MailboxStore) Upsert(ctx context.Context, m *mail.Mailbox) error {
	const op errors.Op = "mail/storage.MailboxStore.Upsert"

	query := `
		INSERT INTO mail.mailboxes (
			id, space_id, connected_account_id, provider_mailbox_id,
			name, system_role, color, unread_count, total_count,
			create_time, update_time
		) VALUES (
			$1, $2, $3, $4,
			$5, $6, $7, $8, $9,
			$10, $11
		)
		ON CONFLICT (id) DO UPDATE SET
			name = EXCLUDED.name,
			system_role = EXCLUDED.system_role,
			color = EXCLUDED.color,
			unread_count = EXCLUDED.unread_count,
			total_count = EXCLUDED.total_count,
			update_time = EXCLUDED.update_time
	`

	_, err := s.db.Exec(
		ctx,
		query,
		m.ID,
		m.SpaceID,
		m.ConnectedAccountID,
		strToNullString(m.ProviderMailboxID),
		m.Name,
		string(m.SystemRole),
		strToNullString(m.Color),
		m.UnreadCount,
		m.TotalCount,
		m.CreateTime,
		m.UpdateTime,
	)
	if err != nil {
		return errors.E(op, err)
	}

	return nil
}

// DeleteByConnectedAccount removes all mailboxes associated with a connected account.
func (s *MailboxStore) DeleteByConnectedAccount(ctx context.Context, spaceID, connectedAccountID string) error {
	const op errors.Op = "mail/storage.MailboxStore.DeleteByConnectedAccount"

	query := `DELETE FROM mail.mailboxes WHERE space_id = $1 AND connected_account_id = $2`
	_, err := s.db.Exec(ctx, query, spaceID, connectedAccountID)
	if err != nil {
		return errors.E(op, err)
	}

	return nil
}
