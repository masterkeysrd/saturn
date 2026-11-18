package storage

import (
	"context"
	"database/sql"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/connector"
	"github.com/masterkeysrd/saturn/internal/platform/db"
)

// RegisterCapabilityCleaner registers the mail cleanup handler for disabled connected accounts.
func RegisterCapabilityCleaner(database db.DB) {
	connector.RegisterCleaner(connector.CapabilityMail, func(ctx context.Context, spaceID, accountID string) error {
		if err := (&DraftStore{db: database}).DeleteByConnectedAccount(ctx, spaceID, accountID); err != nil {
			return err
		}
		if err := (&MessageStore{db: database}).DeleteByConnectedAccount(ctx, spaceID, accountID); err != nil {
			return err
		}
		if err := (&ThreadStore{db: database}).DeleteByConnectedAccount(ctx, spaceID, accountID); err != nil {
			return err
		}
		if err := (&MailboxStore{db: database}).DeleteByConnectedAccount(ctx, spaceID, accountID); err != nil {
			return err
		}
		return (&SyncStateStore{db: database}).Delete(ctx, spaceID, accountID)
	})
}

func strToNullString(s *string) sql.NullString {
	if s == nil || *s == "" {
		return sql.NullString{Valid: false}
	}
	return sql.NullString{String: *s, Valid: true}
}

func nullStringToStrPtr(ns sql.NullString) *string {
	if !ns.Valid {
		return nil
	}
	return &ns.String
}

func timeToNullTime(t *time.Time) sql.NullTime {
	if t == nil || t.IsZero() {
		return sql.NullTime{Valid: false}
	}
	return sql.NullTime{Time: *t, Valid: true}
}

func nullTimeToTimePtr(nt sql.NullTime) *time.Time {
	if !nt.Valid {
		return nil
	}
	return &nt.Time
}
