package storage

import (
	"context"
	"database/sql"

	"github.com/doug-martin/goqu/v9"
	"github.com/masterkeysrd/saturn/internal/domain/identity"
	"github.com/masterkeysrd/saturn/internal/platform/db"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/paging"
	"github.com/masterkeysrd/saturn/internal/platform/sorting"
)

type securityEventDB struct {
	ID        string       `db:"id"`
	UserID    *string      `db:"user_id"`
	Email     string       `db:"email"`
	EventType string       `db:"event_type"`
	IPAddress string       `db:"ip_address"`
	UserAgent *string      `db:"user_agent"`
	CreatedAt sql.NullTime `db:"created_at"`
}

// SecurityEventStore implements identity.SecurityEventStore using db.DB.
type SecurityEventStore struct {
	db db.DB
}

// NewSecurityEventStore creates a new SQL store for security audit events.
func NewSecurityEventStore(database db.DB) *SecurityEventStore {
	return &SecurityEventStore{db: database}
}

// Create inserts a new security audit event record.
func (s *SecurityEventStore) Create(ctx context.Context, event *identity.SecurityEvent) error {
	const op errors.Op = "domain/identity/storage.CreateSecurityEvent"

	var userID *string
	if event.UserID != nil {
		str := string(*event.UserID)
		userID = &str
	}
	var ua *string
	if event.UserAgent != "" {
		ua = &event.UserAgent
	}

	q, args, err := pgDialect.Insert(goqu.T("security_events").Schema("identity")).
		Rows(goqu.Record{
			"id":         event.ID,
			"user_id":    userID,
			"email":      event.Email,
			"event_type": string(event.EventType),
			"ip_address": event.IPAddress,
			"user_agent": ua,
			"created_at": goqu.L("NOW()"),
		}).
		Prepared(true).
		ToSQL()
	if err != nil {
		return errors.E(op, err)
	}

	if _, err := s.db.Exec(ctx, q, args...); err != nil {
		return errors.E(op, err)
	}
	return nil
}

// List retrieves security audit events satisfying the filter conditions.
func (s *SecurityEventStore) List(ctx context.Context, filter identity.SecurityEventFilter) (*paging.Page[*identity.SecurityEvent], error) {
	const op errors.Op = "domain/identity/storage.ListSecurityEvents"

	limit := filter.Limit
	if limit <= 0 || limit > 100 {
		limit = 50
	}

	ds := pgDialect.From(goqu.T("security_events").Schema("identity"))

	if filter.UserID != nil {
		ds = ds.Where(goqu.C("user_id").Eq(string(*filter.UserID)))
	}
	if filter.Email != "" {
		ds = ds.Where(goqu.C("email").Eq(filter.Email))
	}
	if filter.EventType != "" {
		ds = ds.Where(goqu.C("event_type").Eq(filter.EventType))
	}

	cursor, _ := paging.Decode(filter.NextPageToken)

	ds = paging.ApplyPagination(ds, paging.Options{
		Sort:     sorting.SortOrder{Field: "id", Ascending: false},
		Cursor:   cursor,
		PageSize: uint(limit),
		IDColumn: "id",
	})

	q, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return nil, errors.E(op, err)
	}

	var dbEvents []securityEventDB
	if err := s.db.Select(ctx, &dbEvents, q, args...); err != nil {
		return nil, errors.E(op, err)
	}

	events := make([]*identity.SecurityEvent, len(dbEvents))
	for i, dbEv := range dbEvents {
		var uID *identity.UserID
		if dbEv.UserID != nil {
			val := identity.UserID(*dbEv.UserID)
			uID = &val
		}
		var ua string
		if dbEv.UserAgent != nil {
			ua = *dbEv.UserAgent
		}
		events[i] = &identity.SecurityEvent{
			ID:        dbEv.ID,
			UserID:    uID,
			Email:     dbEv.Email,
			EventType: identity.SecurityEventType(dbEv.EventType),
			IPAddress: dbEv.IPAddress,
			UserAgent: ua,
			CreatedAt: dbEv.CreatedAt.Time,
		}
	}

	page := paging.NewPage(events, int(limit), func(e *identity.SecurityEvent) paging.Cursor {
		return paging.Cursor{
			SortValue: e.ID,
			ID:        e.ID,
		}
	})

	return page, nil
}
